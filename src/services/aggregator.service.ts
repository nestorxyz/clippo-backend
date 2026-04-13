/**
 * Service to handle message aggregation (debouncing) and deduplication.
 * Prevents multiple AI responses for rapid-fire messages and filters out Meta retries.
 */

type ProcessCallback = (aggregatedText: string) => Promise<void>;

interface PendingMessage {
  text: string;
  timer: NodeJS.Timeout;
  callback: ProcessCallback;
}

export class AggregatorService {
  private buffer = new Map<string, PendingMessage>();
  private processedIds = new Set<string>();
  private readonly MAX_PROCESSED_IDS = 1000;
  private readonly WAIT_TIME = 4000; // 4 seconds of silence before processing

  /**
   * Check if message ID has already been seen (Meta retry prevention)
   */
  public isDuplicate(messageId: string): boolean {
    if (this.processedIds.has(messageId)) {
      return true;
    }
    this.processedIds.add(messageId);

    // Maintain size limit to prevent memory leaks
    if (this.processedIds.size > this.MAX_PROCESSED_IDS) {
      const firstId = this.processedIds.values().next().value;
      if (firstId) this.processedIds.delete(firstId);
    }
    return false;
  }

  /**
   * Aggregates messages from the same sender within a time window.
   * When the window closes (silence), the callback is triggered with the full text.
   */
  public aggregate(
    senderId: string,
    text: string,
    callback: ProcessCallback,
  ): void {
    const existing = this.buffer.get(senderId);

    if (existing) {
      // Clear existing timer and append text
      clearTimeout(existing.timer);
      existing.text += '\n' + text;
      console.log(`[Aggregator] Appended to buffer for ${senderId}.`);
    } else {
      // Initialize new buffer entry
      console.log(`[Aggregator] Starting new buffer for ${senderId}.`);
      this.buffer.set(senderId, {
        text,
        timer: null as any,
        callback,
      });
    }

    // Set or Reset the timer
    const current = this.buffer.get(senderId)!;
    current.timer = setTimeout(async () => {
      try {
        const fullText = current.text;
        console.log(
          `[Aggregator] Window closed for ${senderId}. Processing aggregated text...`,
        );

        // Remove from buffer before calling callback to allow new messages to start a new window
        this.buffer.delete(senderId);

        await callback(fullText);
      } catch (error) {
        console.error(
          `[Aggregator] Error in processing callback for ${senderId}:`,
          error,
        );
      }
    }, this.WAIT_TIME);
  }
}

export const aggregatorService = new AggregatorService();
