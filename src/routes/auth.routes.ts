import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateretired-providerToken as authenticateToken } from '../middleware/auth.middleware.js';
import { userService } from '../services/user.service.js';
import { otpService } from '../services/otp.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// Validation schemas
const sendOtpSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
  userId: z.string().uuid(),
});

const verifyOtpSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
  userId: z.string().uuid(),
  otpCode: z.string().length(6),
});

const consolidateAccountSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
  userId: z.string().uuid(),
  whatsappAccountId: z.string().uuid(),
});

/**
 * Send OTP to web user for phone verification
 */
router.post(
  '/send-otp-web',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const validatedData = sendOtpSchema.parse(req.body);

      // Ensure the userId matches the authenticated user
      if (req.user?.id !== validatedData.userId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'You can only verify your own phone number',
        });
      }

      // Generate OTP
      const otpResult = await otpService.generateOtp(
        validatedData.userId,
        validatedData.phoneNumber,
        'web_verification'
      );

      if (!otpResult.success || !otpResult.data) {
        return res.status(400).json(otpResult);
      }

      console.log('OTP result:', otpResult);

      // Send OTP via WhatsApp
      const sendResult = await whatsappService.sendOTP(
        validatedData.phoneNumber,
        otpResult.data.otp
      );

      if (!sendResult.success) {
        return res.status(400).json(sendResult);
      }

      return res.json({
        success: true,
        message: 'OTP sent successfully via WhatsApp',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: error.errors[0].message,
        });
      }

      console.error('Send OTP error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to send OTP',
      });
    }
  }
);

/**
 * Verify OTP and link phone to user account
 */
router.post(
  '/verify-otp-web',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const validatedData = verifyOtpSchema.parse(req.body);

      // Ensure the userId matches the authenticated user
      if (req.user?.id !== validatedData.userId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'You can only verify your own phone number',
        });
      }

      // Verify OTP
      const verifyResult = await otpService.verifyOtp(
        validatedData.userId,
        validatedData.phoneNumber,
        validatedData.otpCode
      );

      if (!verifyResult.success) {
        return res.status(400).json(verifyResult);
      }

      // Link phone to user
      const linkResult = await userService.linkPhoneToUser(
        validatedData.userId,
        validatedData.phoneNumber
      );

      if (!linkResult.success) {
        return res.status(400).json(linkResult);
      }

      return res.json({
        success: true,
        data: linkResult.data,
        message: 'Phone number verified and linked successfully',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: error.errors[0].message,
        });
      }

      console.error('Verify OTP error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to verify OTP',
      });
    }
  }
);

/**
 * Consolidate WhatsApp account into Google account
 */
router.post(
  '/consolidate-account',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      // Validate request body
      const validatedData = consolidateAccountSchema.parse(req.body);

      // Ensure the userId matches the authenticated user
      if (req.user?.id !== validatedData.userId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'You can only consolidate your own account',
        });
      }

      // Perform account consolidation
      const consolidationResult = await userService.consolidateWhatsAppAccount(
        validatedData.userId,
        validatedData.whatsappAccountId,
        validatedData.phoneNumber
      );

      if (!consolidationResult.success) {
        return res.status(400).json(consolidationResult);
      }

      return res.json({
        success: true,
        data: consolidationResult.data,
        message:
          'Accounts consolidated successfully. Your WhatsApp data has been merged.',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: error.errors[0].message,
        });
      }

      console.error('Account consolidation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to consolidate accounts',
      });
    }
  }
);

/**
 * Get phone verification status for current user
 */
router.get(
  '/phone-status',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
      }

      // Get user profile
      const profile = await userService.getProfileById(userId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          message: 'User profile not found',
        });
      }

      return res.json({
        success: true,
        data: {
          phoneNumber: profile.phone_number,
          phoneVerified: profile.phone_verified,
          phoneVerifiedAt: profile.phone_verified_at,
        },
      });
    } catch (error: any) {
      console.error('Get phone status error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to get phone status',
      });
    }
  }
);

export default router;
