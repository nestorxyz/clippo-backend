import { Router, Response } from 'express';
import { authenticateSupabaseToken } from '../middleware/auth.middleware.js';
import { aiService } from '../services/ai.service.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

interface QuickSaveLinkRequest {
  url: string;
  title?: string;
  description?: string;
}

interface QuickSaveLinkResponse {
  success: boolean;
  data?: {
    linkId: string;
    title: string;
    description: string;
    category: string;
    subcategory?: string;
  };
  error?: string;
  message: string;
}

/**
 * Quick save a link with AI classification
 * POST /api/links/quick-save
 */
router.post(
  '/quick-save',
  authenticateSupabaseToken,
  async (req: AuthRequest, res: Response<QuickSaveLinkResponse>) => {
    try {
      const { url, title, description } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
      }

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'Missing URL',
          message: 'URL is required',
        });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL',
          message: 'Please provide a valid URL',
        });
      }

      // Process the link with AI
      const result = await aiService.processQuickSaveLink({
        url,
        title,
        description,
        userId,
      });

      if (!result.success || !result.data) {
        return res.status(500).json({
          success: false,
          error: result.error || 'Processing failed',
          message: result.message || 'Failed to process link',
        });
      }

      return res.status(201).json({
        success: true,
        data: result.data,
        message: 'Link saved successfully',
      });
    } catch (error: any) {
      console.error('Quick save link error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'Internal server error',
      });
    }
  }
);

/**
 * Get user's recent links
 * GET /api/links/recent
 */
router.get(
  '/recent',
  authenticateSupabaseToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
      }

      const result = await aiService.getUserRecentLinks(userId, limit);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      return res.json({
        success: true,
        data: result.data,
        message: 'Recent links retrieved successfully',
      });
    } catch (error: any) {
      console.error('Get recent links error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        message: 'Internal server error',
      });
    }
  }
);

export default router;
