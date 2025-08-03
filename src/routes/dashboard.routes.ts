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
 * Cluster similar problems using AI to group related issues
 */
router.post('/cluster-problems', async (req, res) => {
  try {
    const { main_problems } = req.body;

    // Validate required fields
    if (!main_problems || !Array.isArray(main_problems)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid main_problems field',
        message: 'main_problems array is required to cluster problems',
      });
    }

    const result = await sunquService.clusterProblems({
      main_problems,
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
 * Cluster similar emotions using AI to group related emotional states
 */
router.post('/cluster-emotions', async (req, res) => {
  try {
    const { main_emotions } = req.body;

    // Validate required fields
    if (!main_emotions || !Array.isArray(main_emotions)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid main_emotions field',
        message: 'main_emotions array is required to cluster emotions',
      });
    }

    const result = await sunquService.clusterEmotions({
      main_emotions,
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
    console.error('Dashboard cluster emotions route error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to cluster emotions',
    });
  }
});

export default router;
