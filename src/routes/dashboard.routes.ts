import { Router } from 'express';
import { sunquService } from '../services/sunqu.service';

const router = Router();

/**
 * GET /dashboard/analytics
 * Get dashboard analytics data for emotional wellbeing insights
 */
router.get('/analytics', async (_req, res) => {
  try {
    const result = await sunquService.getDashboardAnalytics();

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
      message: result.message,
    });
  } catch (error: any) {
    console.error('Dashboard analytics route error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to retrieve dashboard analytics',
    });
  }
});

export default router;
