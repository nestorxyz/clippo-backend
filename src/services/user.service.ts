import { ServiceResponse } from '../types';
import { formatPhoneNumber } from '../utils/phone';
import { convex, api } from '../config/convex';

export class UserService {
  /**
   * Get or create user profile by phone number
   */
  async getOrCreateWhatsAppUser(
    phoneNumber: string,
  ): Promise<ServiceResponse<any>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Call Convex to get/create profile and user
      const result = await convex.mutation(api.profiles.getOrCreateByPhone, {
        phoneNumber: formattedPhone,
        secret: process.env.CONVEX_BACKEND_SECRET,
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
}

export const userService = new UserService();
