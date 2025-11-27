# Web Push Notifications Implementation

## Overview

Implemented proper web push notifications following the Medium article's approach. This enables real-time notifications that work even when the browser tab is closed or in the background.

## Key Components

### Frontend

1. **Custom Service Worker** (`public/sw.js`)

   - Listens for `push` events from browser's push service
   - Displays notifications via `self.registration.showNotification()`
   - Handles notification clicks
   - Manages push subscription lifecycle

2. **Push Subscription Utility** (`src/utils/pushSubscription.ts`)

   - Subscribes to browser's push service using VAPID keys
   - Sends subscription to backend
   - Manages subscription lifecycle
   - Helper function: `setupPushNotifications()`

3. **NotificationManager Component** (`src/components/NotificationManager.tsx`)

   - Requests notification permission from user
   - Sets up push subscription on login
   - Shows permission prompt UI

4. **Vite Config** (`vite.config.ts`)
   - Changed from `generateSW` to `injectManifest` strategy
   - Uses custom service worker instead of auto-generated one

### Backend

1. **Push Subscription Model** (`models/PushSubscription.js`)

   - Stores user push subscriptions in MongoDB
   - Fields: endpoint, keys (p256dh, auth), user reference

2. **Push Controller** (`controllers/pushController.js`)

   - `/api/push/subscribe` - Save push subscription
   - `/api/push/unsubscribe` - Remove subscription
   - `/api/push/test` - Test notification endpoint
   - `sendNotification()` - Send push to specific users
   - Uses `web-push` npm package

3. **Notice Controller Integration** (`controllers/noticeController.js`)

   - Automatically sends push notifications when notices are created
   - Targets correct audience based on notice settings
   - Non-blocking (doesn't fail notice creation if push fails)

4. **Push Routes** (`routes/pushRoutes.js`)
   - All routes protected with authentication middleware

## VAPID Keys

**Public Key:**

```
BF1Lzgz1SfgsHrEiJUN7UdECZNL_YerzvkZsYO_ViY0TspKrq9Y825bU0L8YQViXqtwEFDCQSRmb-G3XVmy2WyM
```

**Private Key:** (Stored in backend only)

```
GU8yE0VY4eWkv5a8_R_sqRZGf85Yxleng-G0GceYHR4
```

⚠️ **Important:** These keys are hardcoded in the implementation. In production, store them in environment variables.

## How It Works

### Setup Flow:

1. User logs in and visits the app
2. `NotificationManager` checks notification permission
3. If permission not granted, shows permission prompt
4. User clicks "Enable Notifications"
5. Browser shows native permission dialog
6. If granted:
   - Service worker subscribes to browser's push service with VAPID key
   - Subscription (endpoint + keys) sent to backend `/api/push/subscribe`
   - Backend stores subscription in database linked to user

### Notification Flow:

1. Admin/Teacher creates a notice via UI
2. Backend saves notice to database
3. Backend determines target users based on notice audience
4. Backend retrieves push subscriptions for target users
5. Backend sends push message to browser's push service using `web-push`
6. Browser's push service delivers message to user's device
7. Service worker wakes up on `push` event
8. Service worker displays notification using `showNotification()`
9. **Notification appears even if tab is closed!**

### Click Handling:

- User clicks notification
- Service worker handles `notificationclick` event
- Opens or focuses app window
- Can navigate to specific page (e.g., notices page)

## Key Differences from Previous Implementation

### Before (Local Notifications):

- ❌ Polling backend every 60 seconds from main thread
- ❌ Using `new Notification()` directly
- ❌ Only works when page is open
- ❌ No service worker involvement
- ❌ Not real push notifications

### Now (Web Push Notifications):

- ✅ Service worker subscribed to browser's push service
- ✅ Backend sends push via browser's push service
- ✅ Service worker displays notifications
- ✅ Works even when page is closed
- ✅ True push notifications following web standards
- ✅ Uses VAPID for security

## Testing

1. **Start servers:**

   ```bash
   # Backend
   cd cms-backend
   npm run dev

   # Frontend
   cd cms-frontend
   npm run dev
   ```

2. **Enable notifications:**

   - Login to the app
   - Click "Enable Notifications" when prompted
   - Grant permission in browser dialog
   - Check console for "[Push] Push notifications setup complete"

3. **Test notification:**

   - Option 1: Create a new notice/announcement
   - Option 2: Use test endpoint:
     ```bash
     curl -X POST http://localhost:5000/api/push/test \
       -H "Authorization: Bearer YOUR_TOKEN"
     ```

4. **Test background delivery:**
   - Enable notifications
   - Close the browser tab completely
   - Create a notice from another device/browser
   - Notification should still appear!

## Browser Support

- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Opera: Full support
- ⚠️ Safari: Requires iOS 16.4+ / macOS 13+
- ❌ Safari (older): Not supported

## Security

- VAPID keys authenticate backend server to push service
- Push subscriptions are user-specific and stored securely
- Subscriptions include authentication tokens
- Invalid subscriptions (410/404) are automatically cleaned up

## Console Logs

The implementation includes comprehensive logging:

- `[Push]` - Push subscription operations
- `[Service Worker]` - Service worker events
- `[NotificationManager]` - Permission and setup

## Cleanup

Push subscriptions are stored per-device. Consider implementing:

- Cleanup on user logout
- Periodic cleanup of expired subscriptions
- UI to manage devices with active subscriptions
