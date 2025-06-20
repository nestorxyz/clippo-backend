import { retired-providerAdmin } from '../config/retired-provider';
import { ServiceResponse } from '../types';
import { formatPhoneNumber } from '../utils/phone';

export class OtpService {
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly OTP_COOLDOWN_SECONDS = 30;

  /**
   * Generate and store OTP for a user
   */
  async generateOtp(
    userId: string,
    phoneNumber: string,
    attemptType: 'web_verification' | 'whatsapp_auth'
  ): Promise<ServiceResponse<{ otp: string }>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Check for recent OTP requests
      const recentCutoff = new Date();
      recentCutoff.setSeconds(
        recentCutoff.getSeconds() - this.OTP_COOLDOWN_SECONDS
      );

      const { data: recentAttempts } = await retired-providerAdmin
        .from('otp_attempts')
        .select('id')
        .eq('user_id', userId)
        .eq('phone_number', formattedPhone)
        .gte('created_at', recentCutoff.toISOString())
        .limit(1);

      if (recentAttempts && recentAttempts.length > 0) {
        return {
          success: false,
          error: 'Too many requests',
          message: `Please wait ${this.OTP_COOLDOWN_SECONDS} seconds before requesting another OTP`,
        };
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Calculate expiry time
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

      // Store OTP attempt
      const { error } = await retired-providerAdmin.from('otp_attempts').insert({
        user_id: userId,
        phone_number: formattedPhone,
        otp_code: otp,
        attempt_type: attemptType,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      return {
        success: true,
        data: { otp },
        message: 'OTP generated successfully',
      };
    } catch (error: any) {
      console.error('Generate OTP error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to generate OTP',
      };
    }
  }

  /**
   * Verify OTP
   */
  async verifyOtp(
    userId: string,
    phoneNumber: string,
    otp: string
  ): Promise<ServiceResponse<boolean>> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Find valid OTP
      const { data: otpAttempt, error: fetchError } = await retired-providerAdmin
        .from('otp_attempts')
        .select('*')
        .eq('user_id', userId)
        .eq('phone_number', formattedPhone)
        .eq('otp_code', otp)
        .eq('verified', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !otpAttempt) {
        return {
          success: false,
          error: 'Invalid or expired OTP',
          message: 'The OTP you entered is invalid or has expired',
        };
      }

      // Mark OTP as verified
      const { error: updateError } = await retired-providerAdmin
        .from('otp_attempts')
        .update({ verified: true })
        .eq('id', otpAttempt.id);

      if (updateError) throw updateError;

      return {
        success: true,
        data: true,
        message: 'OTP verified successfully',
      };
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to verify OTP',
      };
    }
  }

  /**
   * Clean up expired OTP attempts
   */
  async cleanupExpiredOtps(): Promise<void> {
    try {
      const { error } = await retired-providerAdmin.rpc('cleanup_expired_otps');
      if (error) throw error;
    } catch (error) {
      console.error('Cleanup expired OTPs error:', error);
    }
  }
}

export const otpService = new OtpService();
