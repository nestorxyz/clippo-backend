import { retired-providerAdmin } from '../config/retired-provider';
import { ServiceResponse } from '../types';
import { sessionManager } from '../utils/session';
import { Tables } from '../types/retired-provider';

type ChatMessage = Tables<'chat_messages'>;

interface ChatRequest {
  message: string;
  phoneNumber: string;
  userId: string;
}

interface ChatResponse {
  reply: string;
  sessionId: string;
}

export class AIService {
  /**
   * Process chat message from WhatsApp user
   */
  async processWhatsAppMessage(
    request: ChatRequest
  ): Promise<ServiceResponse<ChatResponse>> {
    try {
      // Get or create session for user
      const sessionResult = await sessionManager.getOrCreateSession(
        request.userId
      );

      if (!sessionResult.success || !sessionResult.data) {
        throw new Error('Failed to get session');
      }

      const sessionId = sessionResult.data.sessionId;

      // Call the existing gemini-chat Edge Function with service role and userId
      const { data, error } = await retired-providerAdmin.functions.invoke(
        'gemini-chat',
        {
          body: {
            message: request.message,
            sessionId: sessionId,
            timeZone: 'UTC',
            userId: request.userId, // Pass userId for service role access
          },
        }
      );

      if (error) {
        console.error('Edge Function error:', error);
        throw error;
      }

      const aiReply =
        data?.reply || "I couldn't process your request. Please try again.";

      return {
        success: true,
        data: {
          reply: aiReply,
          sessionId,
        },
        message: 'Message processed successfully',
      };
    } catch (error: any) {
      console.error('AI processing error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to process message',
      };
    }
  }

  /**
   * Get recent messages from a session
   */
  async getSessionMessages(
    sessionId: string,
    limit: number = 10
  ): Promise<ChatMessage[]> {
    try {
      const { data, error } = await retired-providerAdmin
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Get session messages error:', error);
      return [];
    }
  }
}

export const aiService = new AIService();
