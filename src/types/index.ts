import { Request } from 'express';

// Extended Express Request with authenticated user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    phoneNumber: string;
    phoneVerified: boolean;
  };
}

// Service response types
export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// WhatsApp webhook types
export interface WhatsAppWebhookBody {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}
