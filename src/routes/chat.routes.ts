import { Router, Response } from 'express';
import { aiService } from '../services/ai.service.js';
import { authenticateretired-providerToken } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

interface ChatRequest {
  message: string;
  sessionId: string;
  timeZone?: string;
}

/**
 * Process chat message - endpoint for web app (replaces edge function)
 */
router.post(
  '/',
  authenticateretired-providerToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { message, sessionId, timeZone } = req.body as ChatRequest;

      if (!message || !sessionId) {
        return res.status(400).json({
          error: 'Message and sessionId are required',
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      const result = await aiService.processChatMessage({
        message,
        sessionId,
        timeZone: timeZone || 'UTC',
        userId,
      });

      if (!result.success) {
        return res.status(500).json({
          error: result.error || 'Failed to process message',
        });
      }

      // Return same format as edge function for compatibility
      return res.json({
        reply: result.data?.reply,
        functionCalls: result.data?.functionCalls || [],
      });
    } catch (error: any) {
      console.error('Chat endpoint error:', error);
      return res.status(500).json({
        error: error.message,
      });
    }
  }
);

export default router;
