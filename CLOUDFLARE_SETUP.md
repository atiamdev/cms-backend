# Cloudflare Setup for E-Learning CMS

This document explains how to set up Cloudflare services for the e-learning platform.

## Required Cloudflare Services

### 1. Cloudflare R2 (Object Storage)

- Used for storing files (documents, images, audio files)
- S3-compatible API
- Cost-effective alternative to AWS S3

### 2. Cloudflare Stream (Video Hosting)

- Used for hosting and streaming video content
- Automatic transcoding and optimization
- Global CDN delivery

## Setup Instructions

### 1. Create Cloudflare Account

1. Go to [cloudflare.com](https://cloudflare.com)
2. Sign up for an account
3. Note your Account ID from the dashboard

### 2. Generate API Tokens

#### Global API Token

1. Go to "My Profile" → "API Tokens"
2. Create token with the following permissions:
   - Zone:Zone Settings:Edit
   - Zone:Zone:Read
   - Account:Cloudflare Stream:Edit
   - Account:Account Settings:Read

#### Stream API Token

1. Create a separate token specifically for Stream:
   - Account:Cloudflare Stream:Edit
   - Account:Account Settings:Read

### 3. Set up Cloudflare R2

1. Navigate to R2 Object Storage in your Cloudflare dashboard
2. Create a new bucket (e.g., "cms-elearning-files")
3. Go to "Manage R2 API tokens"
4. Create a new token with:
   - Permissions: Object Read & Write
   - Bucket: Your created bucket
5. Note the Access Key ID and Secret Access Key

### 4. Enable Cloudflare Stream

1. Navigate to Stream in your Cloudflare dashboard
2. Enable the service
3. Note your Customer Code (visible in Stream URLs)

### 5. Configure Environment Variables

Add these to your `.env` file:

```env
# Cloudflare Configuration
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_API_TOKEN=your_global_api_token

# Cloudflare R2 (Object Storage)
CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_key
CLOUDFLARE_R2_BUCKET_NAME=cms-elearning-files

# Cloudflare Stream (Video)
CLOUDFLARE_STREAM_API_TOKEN=your_stream_api_token
```

## Features Provided

### File Upload Support

- Documents (PDF, DOC, DOCX, etc.)
- Images (JPG, PNG, GIF, WebP)
- Audio files (MP3, WAV, etc.)
- Archives (ZIP, RAR, etc.)

### Video Upload Support

- Automatic transcoding to multiple formats
- Adaptive bitrate streaming
- Thumbnail generation
- Global CDN delivery
- Mobile-optimized playback

### Security Features

- Signed URLs for private content
- Access control integration
- Automatic virus scanning (R2)
- DDoS protection

## Cost Considerations

### Cloudflare R2

- Storage: $0.015 per GB/month
- Class A operations (writes): $4.50 per million
- Class B operations (reads): $0.36 per million
- No egress fees

### Cloudflare Stream

- Storage: $5 per 1,000 minutes stored
- Delivery: $1 per 1,000 minutes delivered
- Free tier: 1,000 minutes storage + 10,000 minutes delivery per month

## Development Mode

The service includes fallback mock responses when Cloudflare is not configured, so you can develop without setting up Cloudflare initially. Mock files will be served from `/api/placeholder/` endpoints.

## Production Deployment

1. Set up a custom domain for your R2 bucket
2. Configure CORS headers for your frontend domain
3. Set up appropriate access policies
4. Monitor usage and costs in Cloudflare dashboard
5. Set up alerts for unusual usage patterns

## Troubleshooting

### Common Issues

1. **"Stream upload failed"**

   - Check your Stream API token permissions
   - Verify account ID is correct
   - Ensure Stream is enabled on your account

2. **"R2 upload failed"**

   - Check R2 API token permissions
   - Verify bucket name matches configuration
   - Check bucket access policies

3. **"Cannot find module" errors**
   - Run `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner node-fetch`
   - Restart your Node.js server

### Testing Configuration

The service includes an `isConfigured()` method to check your setup:

```javascript
const cloudflareService = require("./services/cloudflareService");
console.log(cloudflareService.isConfigured());
```

This will show which services are properly configured.
