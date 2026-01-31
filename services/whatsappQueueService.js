/**
 * WhatsApp Queue Service
 *
 * Implements a systematic message queue to handle rate limits for WasenderAPI.
 *
 * Rate Limits (Paid Plan):
 * - 256 messages per minute
 * - This translates to ~234ms per message (60000ms / 256 = 234.375ms)
 *
 * Features:
 * - Queue-based message sending with automatic rate limiting
 * - Batch processing for multiple messages
 * - Priority queue support (urgent messages sent first)
 * - Automatic retry on failure
 * - Real-time queue status monitoring
 * - Graceful error handling
 */

const WhatsAppService = require("./whatsappService");

class WhatsAppQueueService {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.whatsappService = WhatsAppService;

    // Rate limiting configuration for paid plan
    this.MESSAGES_PER_MINUTE =
      parseInt(process.env.WHATSAPP_MESSAGES_PER_MINUTE) || 256;
    this.DELAY_BETWEEN_MESSAGES = Math.ceil(60000 / this.MESSAGES_PER_MINUTE); // ~234ms for 256/min

    // Add a small safety buffer (10% slower than max rate)
    this.DELAY_BETWEEN_MESSAGES = Math.ceil(this.DELAY_BETWEEN_MESSAGES * 1.1); // ~258ms

    // Statistics
    this.stats = {
      totalQueued: 0,
      totalSent: 0,
      totalFailed: 0,
      currentQueueLength: 0,
      lastProcessedAt: null,
      averageProcessingTime: 0,
    };

    console.log(`📊 WhatsApp Queue Service initialized:`);
    console.log(`   - Rate limit: ${this.MESSAGES_PER_MINUTE} messages/minute`);
    console.log(
      `   - Delay between messages: ${this.DELAY_BETWEEN_MESSAGES}ms`,
    );
  }

  /**
   * Add a message to the queue
   * @param {Object} messageData - Message details
   * @param {string} messageData.phoneNumber - Recipient phone number
   * @param {string} messageData.message - Message content
   * @param {Object} messageData.metadata - Additional metadata
   * @param {number} messageData.priority - Priority (1=high, 2=normal, 3=low) default=2
   * @returns {Promise<string>} Queue ID
   */
  async addToQueue(messageData) {
    const queueItem = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      phoneNumber: messageData.phoneNumber,
      message: messageData.message,
      metadata: messageData.metadata || {},
      priority: messageData.priority || 2, // 1=high, 2=normal, 3=low
      status: "queued",
      addedAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      result: null,
    };

    this.queue.push(queueItem);
    this.stats.totalQueued++;
    this.stats.currentQueueLength = this.queue.length;

    // Sort queue by priority (lower number = higher priority)
    this.queue.sort((a, b) => a.priority - b.priority);

    console.log(
      `📥 Message queued [${queueItem.id}] - Queue length: ${this.queue.length}`,
    );

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return queueItem.id;
  }

  /**
   * Add multiple messages to the queue at once
   * @param {Array<Object>} messages - Array of message objects
   * @returns {Promise<Array<string>>} Array of queue IDs
   */
  async addBulkToQueue(messages) {
    console.log(`📦 Adding ${messages.length} messages to queue...`);

    const queueIds = [];
    for (const messageData of messages) {
      const queueId = await this.addToQueue(messageData);
      queueIds.push(queueId);
    }

    console.log(`✅ ${messages.length} messages added to queue`);
    return queueIds;
  }

  /**
   * Process the message queue
   */
  async processQueue() {
    if (this.processing) {
      console.log("⚠️ Queue already being processed");
      return;
    }

    if (this.queue.length === 0) {
      console.log("✅ Queue empty, nothing to process");
      return;
    }

    this.processing = true;
    console.log(
      `🚀 Starting queue processing - ${this.queue.length} messages pending`,
    );

    while (this.queue.length > 0) {
      const item = this.queue[0]; // Get first item but don't remove yet
      const startTime = Date.now();

      try {
        item.status = "processing";
        item.attempts++;

        console.log(
          `📤 Processing [${item.id}] - Attempt ${item.attempts}/${item.maxAttempts}`,
        );

        // Send the message
        const result = await this.whatsappService.sendMessage(
          item.phoneNumber,
          item.message,
          item.metadata,
        );

        if (result.success) {
          item.status = "sent";
          item.result = result;
          this.stats.totalSent++;
          console.log(`✅ Message sent successfully [${item.id}]`);
        } else {
          throw new Error(result.error || result.reason || "Unknown error");
        }

        // Remove from queue on success
        this.queue.shift();
      } catch (error) {
        console.error(`❌ Failed to send message [${item.id}]:`, error.message);

        // Check for non-retryable errors (422 = invalid phone number/JID)
        const errorMsg = error.message.toLowerCase();
        const isNonRetryable =
          errorMsg.includes("status 422") ||
          errorMsg.includes("does not exist on whatsapp") ||
          errorMsg.includes("invalid_phone") ||
          errorMsg.includes("invalid phone") ||
          errorMsg.includes("service_disabled");

        if (isNonRetryable) {
          console.error(
            `⏭️ Non-retryable error for [${item.id}] (invalid phone/JID), skipping`,
          );
          item.status = "failed";
          item.result = { error: error.message, nonRetryable: true };
          this.stats.totalFailed++;
          // Remove from queue immediately
          this.queue.shift();
        } else if (item.attempts < item.maxAttempts) {
          console.log(
            `🔄 Will retry [${item.id}] - ${item.maxAttempts - item.attempts} attempts remaining`,
          );
          item.status = "retry";
          // Move to end of queue for retry
          this.queue.shift();
          this.queue.push(item);
        } else {
          console.error(
            `💀 Max retries reached for [${item.id}], marking as failed`,
          );
          item.status = "failed";
          item.result = { error: error.message };
          this.stats.totalFailed++;
          // Remove from queue
          this.queue.shift();
        }
      }

      // Update statistics
      const processingTime = Date.now() - startTime;
      this.stats.averageProcessingTime =
        (this.stats.averageProcessingTime * (this.stats.totalSent - 1) +
          processingTime) /
        this.stats.totalSent;
      this.stats.lastProcessedAt = new Date();
      this.stats.currentQueueLength = this.queue.length;

      // Rate limiting delay
      if (this.queue.length > 0) {
        console.log(
          `⏱️ Waiting ${this.DELAY_BETWEEN_MESSAGES}ms before next message...`,
        );
        await this.delay(this.DELAY_BETWEEN_MESSAGES);
      }
    }

    this.processing = false;
    console.log(`✅ Queue processing complete!`);
    console.log(
      `📊 Stats: ${this.stats.totalSent} sent, ${this.stats.totalFailed} failed`,
    );
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueLength: this.queue.length,
      processing: this.processing,
      estimatedTimeRemaining: this.queue.length * this.DELAY_BETWEEN_MESSAGES,
      messagesPerMinute: this.MESSAGES_PER_MINUTE,
    };
  }

  /**
   * Get current queue status
   * @returns {Object} Queue status
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      items: this.queue.map((item) => ({
        id: item.id,
        status: item.status,
        priority: item.priority,
        attempts: item.attempts,
        addedAt: item.addedAt,
        metadata: item.metadata,
      })),
    };
  }

  /**
   * Clear the queue (emergency stop)
   * @returns {number} Number of items cleared
   */
  clearQueue() {
    const count = this.queue.length;
    this.queue = [];
    this.stats.currentQueueLength = 0;
    console.log(`🗑️ Queue cleared - ${count} messages removed`);
    return count;
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.processing = false;
    console.log("⏸️ Queue processing paused");
  }

  /**
   * Resume queue processing
   */
  resume() {
    if (!this.processing && this.queue.length > 0) {
      console.log("▶️ Resuming queue processing");
      this.processQueue();
    }
  }

  /**
   * Utility function for delays
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Send a single message immediately (bypasses queue - use sparingly)
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message content
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Result object
   */
  async sendImmediate(phoneNumber, message, metadata = {}) {
    console.log("⚡ Sending immediate message (bypassing queue)");
    return await this.whatsappService.sendMessage(
      phoneNumber,
      message,
      metadata,
    );
  }
}

// Export singleton instance
module.exports = new WhatsAppQueueService();
