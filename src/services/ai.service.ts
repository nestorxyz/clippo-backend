import { supabaseAdmin } from '../config/supabase';
import { ServiceResponse } from '../types';
import { sessionManager } from '../utils/session';
import { Tables } from '../types/supabase';

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

interface QuickSaveLinkRequest {
  url: string;
  title?: string;
  description?: string;
  userId: string;
}

interface QuickSaveLinkResponse {
  linkId: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
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
      const { data, error } = await supabaseAdmin.functions.invoke(
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
   * Process quick save link for mobile app
   */
  async processQuickSaveLink(
    request: QuickSaveLinkRequest
  ): Promise<ServiceResponse<QuickSaveLinkResponse>> {
    try {
      const { url, title, description, userId } = request;

      // Create a direct prompt for link classification
      const prompt = `Please analyze this link and save it to the appropriate category:
URL: ${url}
${title ? `Title: ${title}` : ''}
${description ? `Description: ${description}` : ''}

Please classify this link and save it with an appropriate title, description, and category. Be concise and direct.`;

      // Get or create session for user
      const sessionResult = await sessionManager.getOrCreateSession(userId);

      if (!sessionResult.success || !sessionResult.data) {
        throw new Error('Failed to get session');
      }

      const sessionId = sessionResult.data.sessionId;

      // Call the gemini-chat Edge Function
      const { data, error } = await supabaseAdmin.functions.invoke(
        'gemini-chat',
        {
          body: {
            message: prompt,
            sessionId: sessionId,
            timeZone: 'UTC',
            userId: userId,
          },
        }
      );

      if (error) {
        console.error('Edge Function error:', error);
        throw error;
      }

      // Parse the function calls to get the link data
      if (data?.functionCalls) {
        const linkCall = data.functionCalls.find(
          (fc: any) => fc.function?.name === 'register_link'
        );

        if (linkCall?.function?.result?.success) {
          const linkData = linkCall.function.result.data;
          return {
            success: true,
            data: {
              linkId: linkData.id,
              title: linkData.title,
              description: linkData.description || '',
              category: linkData.category_name || 'General',
              subcategory: linkData.subcategory_name,
            },
            message: 'Link saved successfully',
          };
        }
      }

      // If no function call, try to extract link info from the response
      // This is a fallback in case the AI doesn't use the function
      return {
        success: false,
        error: 'Link processing failed',
        message: 'Could not save the link automatically',
      };
    } catch (error: any) {
      console.error('Quick save link error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to process link',
      };
    }
  }

  /**
   * Get user's recent links
   */
  async getUserRecentLinks(
    userId: string,
    limit: number = 10
  ): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await supabaseAdmin
        .from('links')
        .select(
          `
          id,
          title,
          url,
          description,
          created_at,
          categories (
            id,
            name,
            color
          ),
          subcategories (
            id,
            name
          )
        `
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return {
        success: true,
        data: data || [],
        message: 'Recent links retrieved successfully',
      };
    } catch (error: any) {
      console.error('Get recent links error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve recent links',
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
      const { data, error } = await supabaseAdmin
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
