const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const fetch = require("node-fetch");

class CloudflareService {
  constructor() {
    this.bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.streamApiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;

    // Cloudflare R2 configuration (S3-compatible)
    // Only initialize if we have the required config
    if (
      this.accountId &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    ) {
      try {
        console.log("=== R2 Client Debug Info ===");
        console.log("Account ID length:", this.accountId.length);
        console.log(
          "Access Key ID length:",
          process.env.CLOUDFLARE_R2_ACCESS_KEY_ID.length
        );
        console.log(
          "Secret Key length:",
          process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY.length
        );
        console.log("Bucket Name:", this.bucketName);

        // Try with minimal configuration first
        this.r2Client = new S3Client({
          region: "auto",
          endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID.trim(),
            secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY.trim(),
          },
        });
        console.log("✓ R2 Client initialized successfully");
      } catch (initError) {
        console.error("✗ R2 Client initialization failed:", initError);
        this.r2Client = null;
      }
    } else {
      console.warn(
        "Cloudflare R2 configuration incomplete - uploads will fail"
      );
    }
  }

  /**
   * Upload video to Cloudflare Stream
   * @param {Buffer} buffer - File buffer
   * @param {Object} options - Upload options
   * @returns {Object} Upload result with streamId and playbackUrl
   */
  async uploadToStream(buffer, options = {}) {
    try {
      if (!this.accountId || !this.streamApiToken) {
        console.error(
          "Cloudflare Stream configuration missing - accountId:",
          !!this.accountId,
          "streamApiToken:",
          !!this.streamApiToken
        );
        throw new Error("Cloudflare Stream configuration missing");
      }

      console.log(
        "Starting Cloudflare Stream upload for file:",
        options.filename
      );

      const formData = new FormData();
      formData.append(
        "file",
        new Blob([buffer]),
        options.filename || "video.mp4"
      );

      if (options.title) {
        formData.append("meta", JSON.stringify({ name: options.title }));
      }

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.streamApiToken}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(
          `Stream upload failed: ${
            result.errors?.[0]?.message || "Unknown error"
          }`
        );
      }

      return {
        streamId: result.result.uid,
        playbackUrl: `https://customer-${this.accountId}.cloudflarestream.com/${result.result.uid}/manifest/video.m3u8`,
        thumbnailUrl: `https://customer-${this.accountId}.cloudflarestream.com/${result.result.uid}/thumbnails/thumbnail.jpg`,
        embedUrl: `https://customer-${this.accountId}.cloudflarestream.com/${result.result.uid}/iframe`,
        status: result.result.status?.state || "pending",
      };
    } catch (error) {
      console.error("Stream upload error:", error.message);
      console.error("Full error details:", error);
      console.error("Options provided:", options);
      // Throw the error instead of returning placeholder URLs
      throw new Error(`Cloudflare Stream upload failed: ${error.message}`);
    }
  }

  /**
   * Upload file to Cloudflare R2
   * @param {Buffer} buffer - File buffer
   * @param {Object} options - Upload options
   * @returns {Object} Upload result with url
   */
  async uploadFile(buffer, options = {}) {
    try {
      // Enhanced configuration checking
      console.log("=== Cloudflare R2 Upload Debug ===");
      console.log("Account ID:", this.accountId ? "✓ Set" : "✗ Missing");
      console.log("Bucket Name:", this.bucketName ? "✓ Set" : "✗ Missing");
      console.log(
        "Access Key ID:",
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ? "✓ Set" : "✗ Missing"
      );
      console.log(
        "Secret Access Key:",
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ? "✓ Set" : "✗ Missing"
      );

      if (!this.bucketName || !this.r2Client) {
        const missingConfig = [];
        if (!this.bucketName) missingConfig.push("CLOUDFLARE_R2_BUCKET_NAME");
        if (!process.env.CLOUDFLARE_R2_ACCESS_KEY_ID)
          missingConfig.push("CLOUDFLARE_R2_ACCESS_KEY_ID");
        if (!process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY)
          missingConfig.push("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
        if (!this.accountId) missingConfig.push("CLOUDFLARE_ACCOUNT_ID");

        throw new Error(
          `Cloudflare R2 configuration missing: ${missingConfig.join(", ")}`
        );
      }

      const key =
        options.key || `uploads/${Date.now()}-${options.filename || "file"}`;
      const contentType = options.contentType || "application/octet-stream";

      console.log("Upload Key:", key);
      console.log("Content Type:", contentType);
      console.log("Buffer Size:", buffer.length);
      console.log("Bucket Name:", this.bucketName);

      // Check if key accidentally contains bucket name
      if (key.startsWith(this.bucketName + "/")) {
        console.warn("⚠️  Key contains bucket name, removing it");
        const correctedKey = key.substring(this.bucketName.length + 1);
        console.log("Corrected Key:", correctedKey);

        // Use corrected key with simplified command (remove metadata that might cause header issues)
        const command = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: correctedKey,
          Body: buffer,
          ContentType: contentType,
        });

        console.log("Sending upload command to R2...");
        console.log("Command details:", {
          Bucket: this.bucketName,
          Key: correctedKey,
          ContentType: contentType,
        });

        const result = await this.r2Client.send(command);
        console.log("R2 Upload successful:", result.ETag ? "✓" : "?");

        // Use custom domain for public access with corrected key
        const publicUrl = `https://e-resource.atiamcollege.com/${correctedKey}`;
        const r2Url = `https://${this.bucketName}.${this.accountId}.r2.cloudflarestorage.com/${correctedKey}`;

        console.log("Generated URLs:");
        console.log("Public URL:", publicUrl);
        console.log("R2 URL:", r2Url);

        // Test URL accessibility (disabled to avoid fetch issues)
        console.log("URL testing disabled - upload successful");

        return {
          url: publicUrl,
          r2Url,
          key: correctedKey,
          size: buffer.length,
          contentType,
          publicUrl,
        };
      }

      // Ensure proper command configuration (simplified to avoid header issues)
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      console.log("Sending upload command to R2...");
      console.log("Command details:", {
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const result = await this.r2Client.send(command);
      console.log("R2 Upload successful:", result.ETag ? "✓" : "?");

      // Use custom domain for public access
      const publicUrl = `https://e-resource.atiamcollege.com/${key}`;
      const r2Url = `https://${this.bucketName}.${this.accountId}.r2.cloudflarestorage.com/${key}`;

      console.log("Generated URLs:");
      console.log("Public URL:", publicUrl);
      console.log("R2 URL:", r2Url);

      // Test URL accessibility
      try {
        console.log("Testing URL accessibility...");
        const testResponse = await fetch(publicUrl, { method: "HEAD" });
        console.log("Custom domain status:", testResponse.status);

        if (testResponse.status !== 200) {
          console.log("Custom domain not accessible, trying R2 direct URL...");
          const r2TestResponse = await fetch(r2Url, { method: "HEAD" });
          console.log("R2 direct URL status:", r2TestResponse.status);

          if (r2TestResponse.status === 200) {
            console.log("⚠️ Using R2 direct URL as fallback");
            return {
              url: r2Url, // Fallback to R2 direct URL
              r2Url,
              key,
              size: buffer.length,
              contentType,
              publicUrl: r2Url,
            };
          }
        }
      } catch (testError) {
        console.log("URL test failed:", testError.message);
      }

      return {
        url: publicUrl, // Public URL using custom domain
        r2Url, // Internal R2 URL for management
        key,
        size: buffer.length,
        contentType,
        publicUrl, // For backward compatibility
      };
    } catch (error) {
      console.error("=== R2 Upload Error ===");
      console.error("Error Type:", error.constructor.name);
      console.error("Error Message:", error.message);
      console.error("Error Stack:", error.stack);

      // Instead of falling back to placeholder, throw the error so we can see what's wrong
      throw new Error(`Cloudflare R2 upload failed: ${error.message}`);
    }
  }

  /**
   * Delete video from Cloudflare Stream
   * @param {string} streamId - Stream ID to delete
   */
  async deleteFromStream(streamId) {
    try {
      if (
        !this.accountId ||
        !this.streamApiToken ||
        streamId.startsWith("mock_")
      ) {
        console.log("Skipping stream deletion for mock/missing config");
        return { success: true };
      }

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream/${streamId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.streamApiToken}`,
          },
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(
          `Stream deletion failed: ${
            result.errors?.[0]?.message || "Unknown error"
          }`
        );
      }

      return { success: true };
    } catch (error) {
      console.error("Stream deletion error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete file from Cloudflare R2
   * @param {string} urlOrKey - File URL or key to delete
   */
  async deleteFile(urlOrKey) {
    try {
      if (
        !this.bucketName ||
        !this.r2Client ||
        urlOrKey.startsWith("/api/placeholder")
      ) {
        console.log("Skipping file deletion for mock/missing config");
        return { success: true };
      }

      // Extract key from URL if full URL is provided
      let key = urlOrKey;
      if (urlOrKey.includes("://")) {
        const url = new URL(urlOrKey);

        // Handle both custom domain and R2 direct URLs
        if (url.hostname === "e-resource.atiamcollege.com") {
          key = url.pathname.substring(1); // Remove leading slash
        } else if (url.hostname.includes("r2.cloudflarestorage.com")) {
          key = url.pathname.substring(1); // Remove leading slash
        } else {
          // For other domains, try to extract the key
          key = url.pathname.substring(1);
        }
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.r2Client.send(command);

      return { success: true };
    } catch (error) {
      console.error("R2 deletion error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if service is properly configured
   */
  isConfigured() {
    return {
      r2: !!(
        this.bucketName &&
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
      ),
      stream: !!(this.accountId && this.streamApiToken),
      accountId: !!this.accountId,
    };
  }

  /**
   * Generate a signed URL for downloading a file
   * @param {string} key - File key in R2
   * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns {string} Signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      if (!this.r2Client) {
        throw new Error("Cloudflare R2 client not configured");
      }

      const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      // For downloads, we need to use GetObjectCommand instead
      const { GetObjectCommand } = require("@aws-sdk/client-s3");
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.r2Client, getCommand, {
        expiresIn,
      });

      return signedUrl;
    } catch (error) {
      console.error("Error generating signed URL:", error);
      throw error;
    }
  }
}

module.exports = new CloudflareService();
