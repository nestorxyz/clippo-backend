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

/**
 * POST /dashboard/recommendations
 * Generate AI-powered recommendations based on dashboard data
 */
router.post('/recommendations', async (req, res) => {
  try {
    const { summary, main_problems, main_emotions, reported_learnings } =
      req.body;

    // Validate required fields
    if (!summary || !main_problems || !main_emotions || !reported_learnings) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message:
          'All dashboard data fields are required to generate recommendations',
      });
    }

    const result = await sunquService.generateRecommendations({
      summary,
      main_problems,
      main_emotions,
      reported_learnings,
    });

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
    console.error('Dashboard recommendations route error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate recommendations',
    });
  }
});

/**
 * POST /dashboard/cluster-problems
 * Cluster similar problems using AI to group related issues from all database records
 */
router.post('/cluster-problems', async (_req, res) => {
  try {
    const result = await sunquService.clusterProblems();

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
    console.error('Dashboard cluster problems route error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to cluster problems',
    });
  }
});

/**
 * POST /dashboard/cluster-emotions
 * Cluster similar emotions using AI to group related emotional states from all database records
 */
router.post('/cluster-emotions', async (_req, res) => {
  try {
    const result = await sunquService.clusterEmotions();

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
    console.error('Dashboard cluster emotions route error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to cluster emotions',
    });
  }
});

export default router;
