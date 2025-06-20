import axios from 'axios';
import { WhatsAppOTPTemplate, ServiceResponse } from '../types';

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

  async sendOTP(
    phoneNumber: string,
    otpCode: string
  ): Promise<ServiceResponse> {
    try {
      const template: WhatsAppOTPTemplate = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'template',
        template: {
          name: 'verify_code',
          language: {
            code: 'en_US',
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: otpCode,
                },
              ],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [
                {
                  type: 'text',
                  text: otpCode,
                },
              ],
            },
          ],
        },
      };

      const response = await axios.post(this.graphApiUrl, template, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return {
        success: true,
        data: response.data,
        message: 'OTP sent successfully',
      };
    } catch (error: any) {
      console.error(
        'WhatsApp send OTP error:',
        error.response?.data || error.message
      );
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to send OTP',
        message: 'Error sending WhatsApp message',
      };
    }
  }

  async sendTextMessage(
    phoneNumber: string,
    message: string
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
        error.response?.data || error.message
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
