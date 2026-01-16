import { retired-providerAdmin } from '../config/retired-provider';
import { ServiceResponse, ConsolidationData } from '../types';
import { formatPhoneNumber } from '../utils/phone';
import { Tables } from '../types/retired-provider';
import { convex, api } from '../config/convex';

type Profile = Tables<'profiles'>;

export class UserService {
  /**
   * Get or create user profile by phone number
   */
  async getOrCreateWhatsAppUser(
    phoneNumber: string
  ): Promise<ServiceResponse<any>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Call Convex to get/create profile and user
      const result = await convex.mutation(api.profiles.getOrCreateByPhone, {
        phoneNumber: formattedPhone,
      });

      const { profile, isNew } = result;

      // Map to expected structure. webhook.routes.ts expects user.id to be the User ID.
      // In retired-provider, profile.id IS the user ID.
      // In Convex, profile.userId is the User ID.
      // We return the profile, but ensure 'id' property matches userId for compatibility
      const mappedProfile = {
        ...profile,
        id: profile.userId,
        // Add other fields if needed by Types
      };

      return {
        success: true,
        data: mappedProfile,
        message: isNew ? 'New WhatsApp user created' : 'Existing user found',
      };
    } catch (error: any) {
      console.error('Get or create WhatsApp user error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get or create WhatsApp user',
      };
    }
  }

  /**
   * Link phone number to existing user
   */
  async linkPhoneToUser(
    userId: string,
    phoneNumber: string
  ): Promise<ServiceResponse<Profile | ConsolidationData>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Check if phone is already taken by another user
      const { data: existingProfile } = await retired-providerAdmin
        .from('profiles')
        .select('id, created_via')
        .eq('phone_number', formattedPhone)
        .neq('id', userId)
        .single();

      if (existingProfile) {
        // If it's a WhatsApp-only account, offer consolidation
        if (existingProfile.created_via === 'whatsapp') {
          return {
            success: false,
            error: 'CONSOLIDATION_REQUIRED',
            message:
              'This phone number belongs to an existing WhatsApp account. Would you like to merge your accounts?',
            data: {
              requiresConsolidation: true,
              whatsappAccountId: existingProfile.id,
            } as ConsolidationData,
          };
        }

        // If it's another web account, block it
        return {
          success: false,
          error: 'Phone number already in use',
          message: 'This phone number is already linked to another account',
        };
      }

      // Update user profile with phone
      const { data: updatedProfile, error } = await retired-providerAdmin
        .from('profiles')
        .update({
          phone_number: formattedPhone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        data: updatedProfile!,
        message: 'Phone number linked successfully',
      };
    } catch (error: any) {
      console.error('Link phone error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to link phone number',
      };
    }
  }

  /**
   * Consolidate WhatsApp account data into Google account
   */
  async consolidateWhatsAppAccount(
    googleUserId: string,
    whatsappUserId: string,
    phoneNumber: string
  ): Promise<ServiceResponse<Profile>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Start a transaction-like process
      // 1. Get all data from WhatsApp account
      const [categoriesResult, subCategoriesResult, linksResult, tagsResult] =
        await Promise.all([
          retired-providerAdmin
            .from('categories')
            .select('*')
            .eq('user_id', whatsappUserId),
          retired-providerAdmin
            .from('sub_categories')
            .select('*')
            .eq('user_id', whatsappUserId),
          retired-providerAdmin.from('links').select('*').eq('user_id', whatsappUserId),
          retired-providerAdmin.from('tags').select('*').eq('user_id', whatsappUserId),
        ]);

      // 2. Get existing categories from Google account for merging
      const { data: googleCategories } = await retired-providerAdmin
        .from('categories')
        .select('id, name')
        .eq('user_id', googleUserId);

      // 3. Handle category consolidation
      const categoryMapping: Record<string, string> = {};

      if (categoriesResult.data) {
        for (const whatsappCategory of categoriesResult.data) {
          // Check if Google account has category with same name
          const existingCategory = googleCategories?.find(
            (gc) =>
              gc.name.toLowerCase() === whatsappCategory.name.toLowerCase()
          );

          if (existingCategory) {
            // Use existing Google category
            categoryMapping[whatsappCategory.id] = existingCategory.id;
          } else {
            // Transfer category to Google account
            const { data: newCategory, error } = await retired-providerAdmin
              .from('categories')
              .update({ user_id: googleUserId })
              .eq('id', whatsappCategory.id)
              .select('id')
              .single();

            if (error) throw error;
            categoryMapping[whatsappCategory.id] = newCategory!.id;
          }
        }
      }

      // 4. Handle sub-categories (update category_id if needed)
      if (subCategoriesResult.data) {
        for (const subCategory of subCategoriesResult.data) {
          const newCategoryId =
            categoryMapping[subCategory.category_id] || subCategory.category_id;

          await retired-providerAdmin
            .from('sub_categories')
            .update({
              user_id: googleUserId,
              category_id: newCategoryId,
            })
            .eq('id', subCategory.id);
        }
      }

      // 5. Transfer links (sub_category_id should already be updated from step 4)
      if (linksResult.data) {
        for (const link of linksResult.data) {
          await retired-providerAdmin
            .from('links')
            .update({ user_id: googleUserId })
            .eq('id', link.id);
        }
      }

      // 6. Transfer tags
      if (tagsResult.data) {
        // Handle tag merging similar to categories
        const { data: googleTags } = await retired-providerAdmin
          .from('tags')
          .select('id, name')
          .eq('user_id', googleUserId);

        for (const whatsappTag of tagsResult.data) {
          const existingTag = googleTags?.find(
            (gt) => gt.name.toLowerCase() === whatsappTag.name.toLowerCase()
          );

          if (existingTag) {
            // Merge: update any link_tags that reference the whatsapp tag to use the google tag
            await retired-providerAdmin
              .from('link_tags')
              .update({ tag_id: existingTag.id })
              .eq('tag_id', whatsappTag.id);

            // Delete the duplicate whatsapp tag
            await retired-providerAdmin.from('tags').delete().eq('id', whatsappTag.id);
          } else {
            // Transfer tag to Google account
            await retired-providerAdmin
              .from('tags')
              .update({ user_id: googleUserId })
              .eq('id', whatsappTag.id);
          }
        }
      }

      // 7. Remove phone number from WhatsApp account first
      const { error: removePhoneError } = await retired-providerAdmin
        .from('profiles')
        .update({
          phone_number: null,
          phone_verified: false,
          phone_verified_at: null,
        })
        .eq('id', whatsappUserId);

      if (removePhoneError) {
        console.error(
          'Failed to remove phone from WhatsApp account:',
          removePhoneError
        );
        // Continue anyway - we'll try to delete the account
      }

      // 8. Link phone number to Google account
      const { data: updatedProfile, error: phoneError } = await retired-providerAdmin
        .from('profiles')
        .update({
          phone_number: formattedPhone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
        })
        .eq('id', googleUserId)
        .select()
        .single();

      if (phoneError) throw phoneError;

      // 9. Delete WhatsApp account
      const { error: deleteError } =
        await retired-providerAdmin.auth.admin.deleteUser(whatsappUserId);
      if (deleteError) {
        console.error('Failed to delete WhatsApp user:', deleteError);
        // Don't throw - profile deletion might fail but consolidation succeeded
      }

      return {
        success: true,
        data: updatedProfile!,
        message: 'Accounts consolidated successfully',
      };
    } catch (error: any) {
      console.error('Consolidate accounts error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to consolidate accounts',
      };
    }
  }

  /**
   * Get user profile by phone number
   */
  async getProfileByPhone(phoneNumber: string): Promise<Profile | null> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      const { data } = await retired-providerAdmin
        .from('profiles')
        .select('*')
        .eq('phone_number', formattedPhone)
        .single();

      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user profile by ID
   */
  async getProfileById(userId: string): Promise<Profile | null> {
    try {
      const { data } = await retired-providerAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      return data;
    } catch (error) {
      return null;
    }
  }
}

export const userService = new UserService();
