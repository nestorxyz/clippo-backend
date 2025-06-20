import { supabaseAdmin } from '../config/supabase';
import { ServiceResponse } from '../types';
import { Tables } from '../types/supabase';

type ChatSession = Tables<'chat_sessions'>;

export class SessionManager {
  /**
   * Get or create a session for a user
   */
  async getOrCreateSession(
    userId: string
  ): Promise<ServiceResponse<{ sessionId: string; session: ChatSession }>> {
    try {
      // Try to get existing session for user
      const { data: existingSession, error: fetchError } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (existingSession && !fetchError) {
        // Update the session's updated_at timestamp
        const { data: updatedSession, error: updateError } = await supabaseAdmin
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', existingSession.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return {
          success: true,
          data: {
            sessionId: existingSession.id,
            session: updatedSession || existingSession,
          },
          message: 'Existing session found',
        };
      }

      // Create new session
      const { data: newSession, error: createError } = await supabaseAdmin
        .from('chat_sessions')
        .insert({
          user_id: userId,
        })
        .select()
        .single();

      if (createError) throw createError;

      return {
        success: true,
        data: {
          sessionId: newSession!.id,
          session: newSession!,
        },
        message: 'New session created',
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

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }

  /**
   * Get user's sessions
   */
  async getUserSessions(
    userId: string,
    limit: number = 10
  ): Promise<ChatSession[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Get user sessions error:', error);
      return [];
    }
  }
}

export const sessionManager = new SessionManager();
