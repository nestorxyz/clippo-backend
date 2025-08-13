import { Router, Response } from 'express';
import { authenticateretired-providerToken } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../types/index.js';
import { subscriptionService } from '../services/subscription.service.js';

const router = Router();

router.get(
  '/plan',
  authenticateretired-providerToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({
            success: false,
            error: 'Unauthorized',
            message: 'User not authenticated',
          });
      }
      const plan = await subscriptionService.getEnrichedPlan(userId);
      return res.json({ success: true, data: plan, message: 'Plan retrieved' });
    } catch (err: any) {
      console.error('Get plan error', err);
      return res
        .status(500)
        .json({ success: false, error: 'SERVER_ERROR', message: err.message });
    }
  }
);

export default router;
