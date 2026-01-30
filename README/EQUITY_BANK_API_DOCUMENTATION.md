# Equity Bank Biller API Integration

## ATIAM College Management System

**Version:** 1.0  
**Date:** January 27, 2026  
**Environment:** Production

---

## Overview

This document provides the technical specifications for integrating Equity Bank's Biller Customer API with ATIAM College Management System. The integration enables students to make payments through Equity Bank channels (mobile app, internet banking, agent banking) with automatic reconciliation.

---

## Base URL

```
Production: https://api.atiamcollege.com
Development: http://localhost:5000
```

---

## Authentication

All API endpoints (except `/auth`) require JWT Bearer token authentication.

### 1. Obtain Access Token

**Endpoint:** `POST /api/equity/auth`

**Request Headers:**

```
Content-Type: application/json
```

**Request Body:**

```json
{
  "username": "equityintergration",
  "password": "Intergration@2026."
}
```

**Success Response (200):**

```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Token Details:**

- `access`: Short-lived token (1 hour) for API requests
- `refresh`: Long-lived token (24 hours) for obtaining new access tokens

**Error Response (401):**

```json
{
  "error": "Authentication failed",
  "message": "Invalid credentials"
}
```

---

### 2. Refresh Access Token

**Endpoint:** `POST /api/equity/refresh`

**Request Headers:**

```
Content-Type: application/json
```

**Request Body:**

```json
{
  "refresh": "YOUR_REFRESH_TOKEN"
}
```

**Success Response (200):**

```json
{
  "access": "NEW_ACCESS_TOKEN"
}
```

---

## API Endpoints

### 3. Validate Student

Verify if a student exists and is eligible for payment.

**Endpoint:** `POST /api/equity/validation`

**Request Headers:**

```
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Request Body:**

```json
{
  "billNumber": "STU2024001",
  "amount": "0"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| billNumber | string | Yes | Student ID (e.g., STU2024001) |
| amount | string | No | Amount to validate (use "0" to check student only) |

**Success Response (200):**

```json
{
  "responseCode": "200",
  "responseMessage": "Success",
  "customerName": "John Doe",
  "billNumber": "STU2024001"
}
```

**Student Not Found (404):**

```json
{
  "responseCode": "404",
  "responseMessage": "Student not found"
}
```

**Student Inactive (403):**

```json
{
  "responseCode": "403",
  "responseMessage": "Student account is not active"
}
```

**Missing Fields (400):**

```json
{
  "responseCode": "400",
  "responseMessage": "Bill number is required"
}
```

---

### 4. Payment Notification

Send payment confirmation after successful transaction.

**Endpoint:** `POST /api/equity/notification`

**Request Headers:**

```
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Request Body:**

```json
{
  "billNumber": "STU2024001",
  "amount": "25000",
  "bankReference": "EQB293293829",
  "transactionDate": "2026-01-27T10:30:00Z"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| billNumber | string | Yes | Student ID |
| amount | string | Yes | Payment amount in KES |
| bankReference | string | Yes | Unique transaction reference from Equity |
| transactionDate | string | Yes | ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ) |

**Success Response (200):**

```json
{
  "responseCode": "200",
  "responseMessage": "Success"
}
```

**Duplicate Transaction (400):**

```json
{
  "responseCode": "400",
  "responseMessage": "Duplicate transaction"
}
```

**Student Not Found (404):**

```json
{
  "responseCode": "404",
  "responseMessage": "Student not found"
}
```

**Invalid Amount (400):**

```json
{
  "responseCode": "400",
  "responseMessage": "Invalid amount"
}
```

**Missing Fields (400):**

```json
{
  "responseCode": "400",
  "responseMessage": "Missing required fields"
}
```

---

## Response Codes

| Code | Meaning      | Description                       | Action Required           |
| ---- | ------------ | --------------------------------- | ------------------------- |
| 200  | Success      | Request processed successfully    | None                      |
| 400  | Bad Request  | Invalid or missing parameters     | Check request format      |
| 401  | Unauthorized | Invalid or expired token          | Refresh access token      |
| 403  | Forbidden    | Student inactive or access denied | Verify student status     |
| 404  | Not Found    | Student does not exist            | Verify student ID         |
| 500  | Server Error | Internal system error             | Contact technical support |

---

## Bill Number Format

The `billNumber` field uses the student's unique Student ID.

**Format:** `STU` + Year + Sequential Number

**Examples:**

- `STU2024001`
- `STU2024002`
- `STU2025156`

**Important:**

- Student IDs are case-sensitive
- Always use the exact Student ID provided
- Do not add prefixes or suffixes

---

## Integration Flow

### Payment Process

```
1. Customer initiates payment on Equity Bank channel
   ↓
2. Equity calls /api/equity/validation to verify student
   ↓
3. System returns student details and validation status
   ↓
4. Customer completes payment on Equity platform
   ↓
5. Equity calls /api/equity/notification with payment details
   ↓
6. System processes payment and reconciles to student fees
   ↓
7. System returns success confirmation
   ↓
8. Student receives WhatsApp notification (automatic)
```

### Authentication Flow

```
1. Call /api/equity/auth with credentials
   ↓
2. Receive access token (valid 1 hour) and refresh token (valid 24 hours)
   ↓
3. Use access token for all API requests
   ↓
4. When access token expires, call /api/equity/refresh
   ↓
5. Receive new access token
```

---

## Security Features

### 1. JWT Authentication

- Access tokens expire after 1 hour
- Refresh tokens expire after 24 hours
- Tokens use 256-bit encryption

### 2. Duplicate Detection

- System checks `bankReference` to prevent duplicate payments
- Returns error if transaction already processed

### 3. Request Logging

- All API requests are logged for audit purposes
- Logs include timestamp, request body, response, and IP address

### 4. IP Whitelisting (Optional)

- Production environment can restrict access to specific IPs
- Contact technical team to whitelist Equity Bank IPs

---

## Payment Reconciliation

### Automatic Processing

When a payment notification is received:

1. **Payment Record Created**
   - Stored in database with Equity Bank reference
   - Receipt number generated automatically

2. **Fee Reconciliation**
   - Payment applied to oldest unpaid fees first
   - Multiple fees can be paid with single transaction
   - Partial payments supported

3. **Overpayment Handling**
   - Excess amount stored as credit balance
   - Credit automatically applied to future fees
   - Credits expire after 1 year

4. **Notifications**
   - Student receives WhatsApp confirmation
   - Includes receipt number and transaction details
   - Shows updated balance

---

## Testing

### Test Credentials

```
Username: equityintergration
Password: Intergration@2026.
```

### Test Student IDs

Available for testing in development environment:

- `STU2024001`
- `STU2024002`
- `STU2024003`

### Sample Requests

**1. Authentication:**

```bash
curl -X POST https://api.atiamcollege.com/api/equity/auth \
  -H "Content-Type: application/json" \
  -d '{
    "username": "equityintergration",
    "password": "Intergration@2026."
  }'
```

**2. Validation:**

```bash
curl -X POST https://api.atiamcollege.com/api/equity/validation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "billNumber": "STU2024001",
    "amount": "0"
  }'
```

**3. Payment Notification:**

```bash
curl -X POST https://api.atiamcollege.com/api/equity/notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "billNumber": "STU2024001",
    "amount": "25000",
    "bankReference": "EQB293293829",
    "transactionDate": "2026-01-27T10:30:00Z"
  }'
```

---

## Error Handling

### Best Practices

1. **Token Expiration**
   - Monitor for 401 responses
   - Automatically refresh token when needed
   - Store refresh token securely

2. **Retry Logic**
   - Implement exponential backoff for server errors (500)
   - Do not retry duplicate transactions (400)
   - Maximum 3 retry attempts recommended

3. **Timeout Settings**
   - Connection timeout: 10 seconds
   - Read timeout: 30 seconds

4. **Logging**
   - Log all API calls with request/response
   - Store transaction references for reconciliation
   - Monitor for patterns of failures

---

## Support & Contact

### Technical Support

**Primary Contact:**

- **Email:** atiamdevteam@gmail.com
- **Phone:** +254 797 945 600
- **Response Time:** Within 2 hours during business hours (8 AM - 6 PM EAT)

**Emergency Contact (24/7):**

- **Phone:** +254 797 945 600
- **For:** Critical payment processing issues only

### Integration Support

**Pre-Production:**

- Email technical questions to atiamdevteam@gmail.com
- Schedule integration testing sessions
- Request API access credentials

**Production:**

- Report incidents immediately via phone
- Follow up with email for documentation
- Provide transaction reference for faster resolution

---

## Change Log

| Version | Date         | Changes         |
| ------- | ------------ | --------------- |
| 1.0     | Jan 27, 2026 | Initial release |

---

## Appendix

### A. Common Scenarios

**Scenario 1: Student pays exact fee amount**

- Payment fully allocated to fee
- Fee marked as paid
- No credit balance created

**Scenario 2: Student pays more than due**

- Payment covers all fees
- Excess stored as credit
- Credit applied to future fees automatically

**Scenario 3: Student has multiple unpaid fees**

- Payment applied to oldest fee first
- Continues to next fees if amount remains
- Proper allocation tracked in system

**Scenario 4: Duplicate payment attempt**

- System detects duplicate `bankReference`
- Returns 400 error
- Original payment remains unchanged

### B. Data Retention

- API logs retained for 90 days
- Payment records retained indefinitely
- Audit trails available for compliance

### C. Rate Limits

- Maximum 100 requests per minute per IP
- Maximum 10,000 requests per day
- Contact support for higher limits if needed

---

**Document Prepared By:** ATIAM College Development Team  
**Last Updated:** January 27, 2026  
**Document Version:** 1.0

---

© 2026 ATIAM College. All rights reserved.
