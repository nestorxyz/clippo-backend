import { convex, api } from '../config/convex';
import { ServiceResponse } from '../types';

// Define Convex ChatSession type
interface ChatSession {
  _id: string;
  _creationTime: number;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

export class SessionManager {
  /**
   * Get or create a session for a user
   */
  async getOrCreateSession(
    userId: string,
    source: string = 'web',
  ): Promise<ServiceResponse<{ sessionId: string; session: ChatSession }>> {
    try {
      const session = await convex.mutation(
        api.chat.getOrCreateSessionForBackend,
        {
          userId,
          secret: process.env.CONVEX_BACKEND_SECRET,
          source,
        },
      );

      return {
        success: true,
        data: {
          sessionId: session._id,
          session: session,
        },
        message: 'Session retrieved successfully',
      };
    } catch (error: any) {
      console.error('Session management error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get or create session',
      };
    }
  }
}

export const sessionManager = new SessionManager();
