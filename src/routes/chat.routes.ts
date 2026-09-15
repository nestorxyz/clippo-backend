import { Router, Response, Request, NextFunction } from 'express';
import { aiService } from '../services/ai.service.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

interface ChatRequest {
  message: string;
  sessionId: string;
  timeZone?: string;
  userId?: string; // Added userId for service auth
}

/**
 * Process chat message - endpoint for web app (replaces edge function)
 * Authenticated via Service Secret (from Convex) only.
 * Authentication is handled by the application boundary.
 */
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Verify Service Secret (Server-to-Server Trust)
    const serviceSecret = req.header('x-convex-backend-secret');

    if (!serviceSecret || serviceSecret !== process.env.CONVEX_BACKEND_SECRET) {
      console.warn(
        '❌ Unauthorized access attempt to /chat: Invalid or missing secret',
      );
      return res
        .status(401)
        .json({ error: 'Unauthorized: Invalid Service Secret' });
    }

    // 2. Validate User Context (Trusting the caller provided the correct ID)
    if (!req.body || !req.body.userId) {
      return res
        .status(400)
        .json({ error: 'userId is required for service auth' });
    }

    // 3. Mock the User Object for the Controller
    (req as unknown as AuthRequest).user = {
      id: req.body.userId,
      phoneNumber: '', // Not needed for web chat
      phoneVerified: true,
    };

    return next();
  },
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
  },
);

export default router;
