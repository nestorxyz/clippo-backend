import axios from 'axios';
import { ServiceResponse } from '../types';

export class WhatsAppService {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly graphApiUrl: string;

  constructor() {
    if (
      !process.env.WHATSAPP_ACCESS_TOKEN ||
      !process.env.WHATSAPP_PHONE_NUMBER_ID
    ) {
      throw new Error('Missing WhatsApp configuration');
    }

    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.graphApiUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
  }

  async sendTextMessage(
    phoneNumber: string,
    message: string,
  ): Promise<ServiceResponse> {
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      };

      const response = await axios.post(this.graphApiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        success: true,
        data: response.data,
        message: 'Message sent successfully',
      };
    } catch (error: any) {
      console.error(
        'WhatsApp send message error:',
        error.response?.data || error.message,
      );
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to send message',
        message: 'Error sending WhatsApp message',
      };
    }
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }

    return null;
  }
}

export const whatsappService = new WhatsAppService();
