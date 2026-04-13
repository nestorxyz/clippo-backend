import { Router, Request, Response } from 'express';
import axios from 'axios';
import { WhatsAppWebhookBody } from '../types';
import { userService } from '../services/user.service.js';
import { aiService } from '../services/ai.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { aggregatorService } from '../services/aggregator.service.js';
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

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
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
              const rawFrom = message.from;

              // Check for duplicate message IDs (Meta retries)
              if (aggregatorService.isDuplicate(message.id)) {
                console.log(
                  `[Webhook] Duplicate message ID detected, skipping: ${message.id}`
                );
                continue;
              }

              console.log(
                `[Webhook] Received message from ${phoneNumber}: ${messageText}`
              );

              // Use aggregator to handle rapid-fire messages (Option A)
              aggregatorService.aggregate(
                rawFrom,
                messageText,
                async (aggregatedText) => {
                  try {
                    // Forward to Assistant Bot if it's from the admin number (51989009435)
                    if (
                      phoneNumber === '51989009435' ||
                      rawFrom === '51989009435'
                    ) {
                      const assistantUrl = `${process.env.ASSISTANT_BOT_URL}/api/assistant`;
                      const token = process.env.WHATSAPP_VERIFY_TOKEN;

                      console.log(
                        `[Webhook] Forwarding aggregated message to Assistant Bot: ${assistantUrl}`
                      );

                      await axios.post(
                        assistantUrl,
                        {
                          senderId: rawFrom,
                          text: aggregatedText,
                        },
                        {
                          headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                          },
                        }
                      );
                      console.log(
                        '✅ Aggregated message forwarded to Assistant Bot successfully.'
                      );
                      return;
                    }

                    // Regular processing for other users
                    // Get or create user
                    const userResult =
                      await userService.getOrCreateWhatsAppUser(phoneNumber);

                    if (!userResult.success || !userResult.data) {
                      console.error(
                        '[Webhook] Failed to get/create user:',
                        userResult.error
                      );
                      await whatsappService.sendTextMessage(
                        phoneNumber,
                        'Sorry, I encountered an error. Please try again later.'
                      );
                      return;
                    }

                    const user = userResult.data;

                    // Process message with AI
                    const aiResult = await aiService.processWhatsAppMessage({
                      message: aggregatedText,
                      phoneNumber: phoneNumber,
                      userId: user.id,
                    });

                    if (!aiResult.success || !aiResult.data) {
                      console.error(
                        '[Webhook] AI processing failed:',
                        aiResult.error
                      );
                      await whatsappService.sendTextMessage(
                        phoneNumber,
                        "Sorry, I couldn't process your message. Please try again."
                      );
                      return;
                    }

                    // Send AI response
                    const sendResult = await whatsappService.sendTextMessage(
                      phoneNumber,
                      aiResult.data.reply
                    );

                    if (!sendResult.success) {
                      console.error(
                        '[Webhook] Failed to send WhatsApp response:',
                        sendResult.error
                      );
                    }
                  } catch (error: any) {
                    console.error(
                      '[Webhook] Error in aggregated processing:',
                      error.message
                    );
                  }
                }
              );
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
