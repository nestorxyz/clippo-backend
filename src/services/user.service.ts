import { retired-providerAdmin } from '../config/retired-provider';
import { ServiceResponse } from '../types';
import { formatPhoneNumber } from '../utils/phone';
import { Tables } from '../types/retired-provider';

type Profile = Tables<'profiles'>;

export class UserService {
  /**
   * Get or create user profile by phone number
   */
  async getOrCreateWhatsAppUser(
    phoneNumber: string
  ): Promise<ServiceResponse<Profile>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Check if user exists with this phone
      const { data: existingProfile, error: _ } = await retired-providerAdmin
        .from('profiles')
        .select('*')
        .eq('phone_number', formattedPhone)
        .single();

      if (existingProfile) {
        // Update if not phone verified
        if (!existingProfile.phone_verified) {
          const { data: updatedProfile, error: updateError } =
            await retired-providerAdmin
              .from('profiles')
              .update({
                phone_verified: true,
                phone_verified_at: new Date().toISOString(),
              })
              .eq('id', existingProfile.id)
              .select()
              .single();

          if (updateError) throw updateError;

          return {
            success: true,
            data: updatedProfile!,
            message: 'Existing user updated',
          };
        }

        return {
          success: true,
          data: existingProfile,
          message: 'Existing user found',
        };
      }

      // Create new user if doesn't exist
      // First create auth user
      const { data: authData, error: authError } =
        await retired-providerAdmin.auth.admin.createUser({
          phone: formattedPhone,
          phone_confirm: true,
        });

      if (authError) throw authError;

      // Wait a bit for trigger to create profile
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Update profile with phone info
      const { data: newProfile, error: profileError } = await retired-providerAdmin
        .from('profiles')
        .update({
          phone_number: formattedPhone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
          created_via: 'whatsapp',
        })
        .eq('id', authData.user.id)
        .select()
        .single();

      if (profileError) {
        // If update failed, try insert (in case trigger didn't fire)
        const { data: insertedProfile, error: insertError } =
          await retired-providerAdmin
            .from('profiles')
            .insert({
              id: authData.user.id,
              phone_number: formattedPhone,
              phone_verified: true,
              phone_verified_at: new Date().toISOString(),
              created_via: 'whatsapp',
            })
            .select()
            .single();

        if (insertError) throw insertError;
        return {
          success: true,
          data: insertedProfile!,
          message: 'New WhatsApp user created',
        };
      }

      return {
        success: true,
        data: newProfile!,
        message: 'New WhatsApp user created',
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
  ): Promise<ServiceResponse<Profile>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Check if phone is already taken by another user
      const { data: existingProfile } = await retired-providerAdmin
        .from('profiles')
        .select('id')
        .eq('phone_number', formattedPhone)
        .neq('id', userId)
        .single();

      if (existingProfile) {
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
