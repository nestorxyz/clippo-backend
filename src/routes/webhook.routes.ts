import { Router, Request, Response } from 'express';
import { WhatsAppWebhookBody } from '../types';
import { userService } from '../services/user.service.js';
import { aiService } from '../services/ai.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { formatPhoneNumber } from '../utils/phone';

const router = Router();

/**
 * WhatsApp webhook verification
 */
router.get('/whatsapp', (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('WhatsApp webhook verification attempt:', {
      mode,
      token: token ? 'present' : 'missing',
    });

    if (!mode || !token) {
      console.log('Missing mode or token in webhook verification');
      return res.sendStatus(400);
    }

    if (
      mode === 'subscribe' &&
      token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      console.log('✅ WhatsApp webhook verified successfully');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ WhatsApp webhook verification failed - token mismatch');
      return res.sendStatus(403);
    }
  } catch (error) {
    console.error('Error in webhook verification:', error);
    return res.sendStatus(500);
  }
});

/**
 * WhatsApp webhook handler
 */
router.post(
  '/whatsapp',
  async (req: Request<{}, {}, WhatsAppWebhookBody>, res: Response) => {
    try {
      const body = req.body;

      // Verify it's a WhatsApp notification
      if (body.object !== 'whatsapp_business_account') {
        return res.sendStatus(404);
      }

      // Process each entry
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          // Process messages
          if (value.messages) {
            for (const message of value.messages) {
              // Only process text messages
              if (message.type !== 'text' || !message.text) {
                continue;
              }

              const phoneNumber = formatPhoneNumber(message.from);
              const messageText = message.text.body;

              console.log(
                `Received message from ${phoneNumber}: ${messageText}`
              );

              // Get or create user
              const userResult = await userService.getOrCreateWhatsAppUser(
                phoneNumber
              );

              if (!userResult.success || !userResult.data) {
                console.error('Failed to get/create user:', userResult.error);
                // Send error message to user
                await whatsappService.sendTextMessage(
                  phoneNumber,
                  'Sorry, I encountered an error. Please try again later.'
                );
                continue;
              }

              const user = userResult.data;

              // Process message with AI
              const aiResult = await aiService.processWhatsAppMessage({
                message: messageText,
                phoneNumber: phoneNumber,
                userId: user.id,
              });

              if (!aiResult.success || !aiResult.data) {
                console.error('AI processing failed:', aiResult.error);
                await whatsappService.sendTextMessage(
                  phoneNumber,
                  "Sorry, I couldn't process your message. Please try again."
                );
                continue;
              }

              // Send AI response
              const sendResult = await whatsappService.sendTextMessage(
                phoneNumber,
                aiResult.data.reply
              );

              if (!sendResult.success) {
                console.error(
                  'Failed to send WhatsApp message:',
                  sendResult.error
                );
              }
            }
          }
        }
      }

      // Always return 200 OK to acknowledge receipt
      return res.sendStatus(200);
    } catch (error) {
      console.error('Webhook error:', error);
      // Still return 200 to avoid webhook retries
      return res.sendStatus(200);
    }
  }
);

export default router;
