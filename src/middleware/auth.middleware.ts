import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthRequest } from '../types';

/**
 * Middleware to authenticate Supabase JWT tokens
 */
export async function authenticateSupabaseToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'No authorization header',
        message: 'Authentication required',
      });
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
        message: 'Authentication required',
      });
    }

    // Verify JWT token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Authentication failed',
      });
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
        message: 'User profile not found',
      });
    }

    // Attach user info to request
    (req as AuthRequest).user = {
      id: user.id,
      phoneNumber: profile.phone_number || '',
      phoneVerified: profile.phone_verified || false,
    };

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Authentication failed',
    });
  }
}
