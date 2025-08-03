import { Router, Request, Response } from 'express';
import { WhatsAppWebhookBody } from '../types';
import { userService } from '../services/user.service.js';
import { aiService } from '../services/ai.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { formatPhoneNumber } from '../utils/phone';

const router = Router();

// Message batching data structures
interface MessageData {
  messageId: string;
  text: string;
  phoneNumber: string;
  userId: string;
  timestamp: string;
}

const userMessageBatches = new Map<string, Array<MessageData>>();
const userBatchTimers = new Map<string, NodeJS.Timeout>();
const userProcessingLocks = new Map<string, Promise<void> | null>();

/**
 * Mark message as read and show typing indicator
 */
async function markMessageReadAndShowTyping(
  phoneNumber: string,
  messageId: string
): Promise<void> {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      console.warn('Missing WhatsApp credentials for typing indicator');
      return;
    }

    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    };

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      console.warn(
        `Failed to mark message as read/show typing: ${response.status}`
      );
    }
  } catch (error) {
    // Fire-and-forget: log error but don't fail processing
    console.error(
      `Error marking message as read/showing typing for ${phoneNumber}:`,
      error
    );
  }
}

/**
 * Add message to batch and schedule processing
 */
async function addMessageToBatch(messageData: MessageData): Promise<void> {
  const { phoneNumber } = messageData;

  // Get existing batch or create new array
  const currentBatch = userMessageBatches.get(phoneNumber) || [];

  // Add message to batch
  currentBatch.push(messageData);
  userMessageBatches.set(phoneNumber, currentBatch);

  // Schedule/reschedule batch processing
  await scheduleBatchProcessing(phoneNumber);
}

/**
 * Schedule batch processing with 5-second debouncing
 */
async function scheduleBatchProcessing(phoneNumber: string): Promise<void> {
  // Cancel existing timer if any
  const existingTimer = userBatchTimers.get(phoneNumber);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Create new 5-second timer
  const timer = setTimeout(async () => {
    // Remove timer reference
    userBatchTimers.delete(phoneNumber);

    // Process the batch
    await processUserMessageBatch(phoneNumber);
  }, 10); // 5 seconds

  // Store timer reference
  userBatchTimers.set(phoneNumber, timer);
}

/**
 * Process batched messages for a user
 */
async function processUserMessageBatch(phoneNumber: string): Promise<void> {
  // Check if already processing (simple lock mechanism)
  if (userProcessingLocks.get(phoneNumber)) {
    console.log(`User ${phoneNumber} already being processed, skipping`);
    return;
  }

  // Create processing promise (acts as lock)
  const processingPromise = (async () => {
    try {
      // Get and clear the batch
      const messageBatch = userMessageBatches.get(phoneNumber) || [];
      if (messageBatch.length === 0) {
        return;
      }

      userMessageBatches.delete(phoneNumber);

      console.log(
        `Processing batch of ${messageBatch.length} messages for ${phoneNumber}`
      );

      // Mark last message as read + show typing indicator
      const lastMessage = messageBatch[messageBatch.length - 1];
      if (lastMessage.messageId) {
        await markMessageReadAndShowTyping(phoneNumber, lastMessage.messageId);
      }

      // Combine all text content from batch
      const combinedText = messageBatch
        .map((msg) => msg.text)
        .join('\n')
        .trim();

      // Process with AI using the last message's user data
      const aiResult = await aiService.processWhatsAppMessage({
        message: combinedText,
        phoneNumber: phoneNumber,
        userId: lastMessage.userId,
      });

      if (!aiResult.success || !aiResult.data) {
        console.error('AI processing failed for batch:', aiResult.error);
        await whatsappService.sendTextMessage(
          phoneNumber,
          "Sorry, I couldn't process your messages. Please try again."
        );
        return;
      }

      // Send AI response
      const sendResult = await whatsappService.sendTextMessage(
        phoneNumber,
        aiResult.data.reply
      );

      if (!sendResult.success) {
        console.error('Failed to send WhatsApp message:', sendResult.error);
      }
    } catch (error) {
      console.error(`Error processing batch for ${phoneNumber}:`, error);
      // Send error message to user
      await whatsappService.sendTextMessage(
        phoneNumber,
        'I encountered an error processing your messages. Please try again.'
      );
    }
  })();

  // Set lock
  userProcessingLocks.set(phoneNumber, processingPromise);

  // Wait for processing to complete
  await processingPromise;

  // Remove lock
  userProcessingLocks.delete(phoneNumber);
}

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

              // Create message data for batching
              const messageData: MessageData = {
                messageId: message.id,
                text: messageText,
                phoneNumber: phoneNumber,
                userId: user.id,
                timestamp: message.timestamp,
              };

              // Add message to batch for processing
              await addMessageToBatch(messageData);
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
