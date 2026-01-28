# Equity Bank Biller Integration - Implementation Guide

## Overview

This document outlines the implementation plan for integrating Equity Bank's Biller Customer API with our College Management System. The integration will allow students to make payments directly through Equity Bank channels (mobile app, internet banking, agent banking, etc.) and have the payments automatically reconciled in our system.

## Document Reference

Implementation based on: **Biller Customer API Guide (1) (1).pdf**

---

## Integration Architecture

### Flow Diagram

```
Student → Equity Bank Channel → Equity Bank System → Our CMS API
                                                    ↓
                                        Payment Reconciliation
                                                    ↓
                                        Student Account Update
```

### Three Core Endpoints Required

#### 1. **Authentication Endpoint** (`/api/equity/auth`)

- **Purpose**: Provide Equity Bank with JWT tokens to authenticate API requests
- **Method**: POST
- **Authentication**: Basic Auth (username/password for Equity)
- **Returns**: JWT access token and refresh token

#### 2. **Validation Endpoint** (`/api/equity/validation`)

- **Purpose**: Verify if a student ID exists and return student details
- **Method**: POST
- **Authentication**: Bearer Token (JWT)
- **Returns**: Student name, amount due, and validation status

#### 3. **Notification Endpoint** (`/api/equity/notification`)

- **Purpose**: Receive payment confirmation from Equity Bank
- **Method**: POST
- **Authentication**: Bearer Token (JWT)
- **Returns**: Success/failure response
- **Action**: Creates payment record and reconciles student fees

---

## Detailed Implementation Plan

### Phase 1: Database Setup

#### 1.1 Create Equity Bank Integration User

- Create a dedicated system user for Equity Bank API access
- Store credentials securely in environment variables
- Assign minimal required permissions (read student data, write payments)

#### 1.2 Update Payment Model

- Add `equityBankReference` field to Payment model
- Add `equityTransactionDate` field
- Ensure payment model supports "equity" payment method (already done ✓)

#### 1.3 Create API Audit Log Model

- Track all incoming requests from Equity Bank
- Store: timestamp, endpoint, request body, response, IP address
- Useful for debugging and reconciliation

```javascript
const EquityAPILog = {
  endpoint: String,
  method: String,
  requestBody: Object,
  responseBody: Object,
  responseCode: Number,
  ipAddress: String,
  timestamp: Date,
  processingTime: Number,
};
```

---

### Phase 2: Authentication Implementation

#### 2.1 Create Equity User Account

**File**: `cms-backend/scripts/create-equity-user.js`

```javascript
// Create dedicated user for Equity Bank integration
const equityUser = {
  username: process.env.EQUITY_API_USERNAME,
  password: process.env.EQUITY_API_PASSWORD, // Will be hashed
  email: "equity-integration@yourschool.ac.ke",
  roles: ["equity_api"],
  isActive: true,
};
```

#### 2.2 Authentication Controller

**File**: `cms-backend/controllers/equityBankController.js`

```javascript
// POST /api/equity/auth
const authenticateEquity = async (req, res) => {
  // 1. Verify username/password from request
  // 2. Generate access token (short-lived: 1 hour)
  // 3. Generate refresh token (long-lived: 24 hours)
  // 4. Log authentication attempt
  // 5. Return tokens

  Response Format:
  {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 2.3 Environment Variables

**File**: `cms-backend/.env`

```env
# Equity Bank API Integration
EQUITY_API_USERNAME=equity_bank_user
EQUITY_API_PASSWORD=strong_secure_password_here
EQUITY_JWT_SECRET=equity_specific_jwt_secret
EQUITY_JWT_EXPIRE=1h
EQUITY_REFRESH_JWT_EXPIRE=24h
```

---

### Phase 3: Student Validation Endpoint

#### 3.1 Validation Controller

**File**: `cms-backend/controllers/equityBankController.js`

```javascript
// POST /api/equity/validation
const validateStudent = async (req, res) => {
  const { billNumber, amount } = req.body;

  // 1. Extract student ID from billNumber
  //    Format: billNumber = studentId (e.g., "STU2024001")

  // 2. Query database for student
  const student = await Student.findOne({ studentId: billNumber })
    .populate("userId", "fullName")
    .populate("branchId");

  // 3. If not found, return error
  if (!student) {
    return res.json({
      customerName: "",
      billNumber: "",
      amount: "0",
      description: "Invalid student ID",
    });
  }

  // 4. Calculate outstanding balance
  const outstandingAmount = await calculateStudentBalance(student._id);

  // 5. Return success response
  return res.json({
    customerName: student.userId.fullName,
    billNumber: student.studentId,
    amount: amount || outstandingAmount.toString(),
    description: "Success",
  });
};
```

#### 3.2 Validation Business Logic

- **Student ID Validation**: Check if student exists and is active
- **Amount Calculation**:
  - If amount provided in request, validate it
  - If no amount, return current outstanding balance
  - Support partial payments
- **Branch Validation**: Ensure student belongs to an active branch
- **Status Check**: Only validate active students

---

### Phase 4: Payment Notification Endpoint

#### 4.1 Notification Controller

**File**: `cms-backend/controllers/equityBankController.js`

```javascript
// POST /api/equity/notification
const processPaymentNotification = async (req, res) => {
  const { billNumber, amount, bankReference, transactionDate } = req.body;

  try {
    // 1. Validate request data
    if (!billNumber || !amount || !bankReference || !transactionDate) {
      return res.json({
        responseCode: "400",
        responseMessage: "Missing required fields",
      });
    }

    // 2. Check for duplicate transaction
    const existingPayment = await Payment.findOne({
      "mpesaDetails.transactionId": bankReference, // Reuse field or create new
    });

    if (existingPayment) {
      return res.json({
        responseCode: "400",
        responseMessage: "Duplicate transaction",
      });
    }

    // 3. Find student
    const student = await Student.findOne({ studentId: billNumber });
    if (!student) {
      return res.json({
        responseCode: "404",
        responseMessage: "Student not found",
      });
    }

    // 4. Create payment record
    const payment = await Payment.create({
      branchId: student.branchId,
      studentId: student._id,
      amount: parseFloat(amount),
      paymentMethod: "equity",
      paymentDate: new Date(transactionDate),
      receiptNumber: generateReceiptNumber(),
      mpesaDetails: {
        transactionId: bankReference,
        transactionDate: new Date(transactionDate).getTime(),
        confirmedAmount: parseFloat(amount),
        callbackReceived: true,
      },
      status: "completed",
      createdBy: "EQUITY_BANK_SYSTEM",
    });

    // 5. Reconcile payment to student fees
    await reconcilePaymentToFees(payment, student);

    // 6. Send WhatsApp notification to student
    await sendPaymentConfirmationWhatsApp(student, payment);

    // 7. Return success response
    return res.json({
      responseCode: "200",
      responseMessage: "Success",
    });
  } catch (error) {
    console.error("Equity payment notification error:", error);
    return res.json({
      responseCode: "500",
      responseMessage: error.message || "Internal server error",
    });
  }
};
```

#### 4.2 Payment Reconciliation Logic

**File**: `cms-backend/services/equityPaymentService.js`

```javascript
const reconcilePaymentToFees = async (payment, student) => {
  // 1. Get all outstanding invoices for student
  const outstandingInvoices = await Invoice.find({
    studentId: student._id,
    status: { $in: ["pending", "partial"] },
  }).sort({ dueDate: 1 }); // Oldest first

  // 2. Apply payment to invoices
  let remainingAmount = payment.amount;

  for (const invoice of outstandingInvoices) {
    if (remainingAmount <= 0) break;

    const amountDue = invoice.totalAmount - invoice.paidAmount;
    const paymentToApply = Math.min(remainingAmount, amountDue);

    // Update invoice
    invoice.paidAmount += paymentToApply;
    if (invoice.paidAmount >= invoice.totalAmount) {
      invoice.status = "paid";
    } else {
      invoice.status = "partial";
    }
    invoice.lastPaymentDate = payment.paymentDate;
    await invoice.save();

    // Create payment invoice link
    await PaymentInvoice.create({
      paymentId: payment._id,
      invoiceId: invoice._id,
      amountApplied: paymentToApply,
    });

    remainingAmount -= paymentToApply;
  }

  // 3. If excess payment, create credit balance
  if (remainingAmount > 0) {
    await StudentCredit.create({
      studentId: student._id,
      amount: remainingAmount,
      source: "equity_overpayment",
      paymentId: payment._id,
    });
  }
};
```

---

### Phase 5: Middleware & Security

#### 5.1 JWT Authentication Middleware

**File**: `cms-backend/middlewares/equityAuthMiddleware.js`

```javascript
const jwt = require("jsonwebtoken");

const verifyEquityToken = (req, res, next) => {
  // 1. Extract token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      responseCode: "401",
      responseMessage: "No token provided",
    });
  }

  const token = authHeader.substring(7);

  // 2. Verify token
  try {
    const decoded = jwt.verify(token, process.env.EQUITY_JWT_SECRET);
    req.equityUser = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      responseCode: "401",
      responseMessage: "Invalid or expired token",
    });
  }
};

module.exports = { verifyEquityToken };
```

#### 5.2 IP Whitelisting (Optional but Recommended)

**File**: `cms-backend/middlewares/equityIPWhitelist.js`

```javascript
const equityIPWhitelist = (req, res, next) => {
  const allowedIPs = process.env.EQUITY_ALLOWED_IPS?.split(",") || [];

  // Skip in development
  if (process.env.NODE_ENV === "development") {
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress;

  if (!allowedIPs.includes(clientIP)) {
    return res.status(403).json({
      responseCode: "403",
      responseMessage: "Access denied",
    });
  }

  next();
};
```

#### 5.3 Request Logging Middleware

**File**: `cms-backend/middlewares/equityRequestLogger.js`

```javascript
const EquityAPILog = require("../models/EquityAPILog");

const logEquityRequest = async (req, res, next) => {
  const startTime = Date.now();

  // Capture original res.json
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Log to database
    EquityAPILog.create({
      endpoint: req.path,
      method: req.method,
      requestBody: req.body,
      responseBody: body,
      responseCode: res.statusCode,
      ipAddress: req.ip,
      timestamp: new Date(),
      processingTime: Date.now() - startTime,
    }).catch((err) => console.error("Failed to log request:", err));

    return originalJson(body);
  };

  next();
};
```

---

### Phase 6: Routes Setup

#### 6.1 Create Equity Routes File

**File**: `cms-backend/routes/equityBankRoutes.js`

```javascript
const express = require("express");
const router = express.Router();
const {
  authenticateEquity,
  validateStudent,
  processPaymentNotification,
} = require("../controllers/equityBankController");
const { verifyEquityToken } = require("../middlewares/equityAuthMiddleware");
const { logEquityRequest } = require("../middlewares/equityRequestLogger");
const { equityIPWhitelist } = require("../middlewares/equityIPWhitelist");

// Apply logging and IP whitelist to all routes
router.use(logEquityRequest);
router.use(equityIPWhitelist);

/**
 * @route   POST /api/equity/auth
 * @desc    Authenticate and get JWT token
 * @access  Public (with credentials)
 */
router.post("/auth", authenticateEquity);

/**
 * @route   POST /api/equity/validation
 * @desc    Validate student and return details
 * @access  Private (requires JWT)
 */
router.post("/validation", verifyEquityToken, validateStudent);

/**
 * @route   POST /api/equity/notification
 * @desc    Receive payment notification
 * @access  Private (requires JWT)
 */
router.post("/notification", verifyEquityToken, processPaymentNotification);

module.exports = router;
```

#### 6.2 Register Routes in Main Server

**File**: `cms-backend/server.js`

```javascript
// Add this line with other route imports
const equityBankRoutes = require("./routes/equityBankRoutes");

// Register route
app.use("/api/equity", equityBankRoutes);
```

---

### Phase 7: Helper Functions & Utilities

#### 7.1 Receipt Number Generator

**File**: `cms-backend/utils/receiptGenerator.js`

```javascript
const generateReceiptNumber = async () => {
  // Format: RCPT-EQUITY-YYYYMMDD-XXXX
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Get count of equity payments today
  const count = await Payment.countDocuments({
    paymentMethod: "equity",
    createdAt: {
      $gte: new Date(today.setHours(0, 0, 0, 0)),
      $lt: new Date(today.setHours(23, 59, 59, 999)),
    },
  });

  const sequence = String(count + 1).padStart(4, "0");
  return `RCPT-EQB-${dateStr}-${sequence}`;
};
```

#### 7.2 Student Balance Calculator

**File**: `cms-backend/utils/studentBalanceCalculator.js`

```javascript
const calculateStudentBalance = async (studentId) => {
  // Get all invoices
  const invoices = await Invoice.find({ studentId });

  let totalDue = 0;
  let totalPaid = 0;

  for (const invoice of invoices) {
    totalDue += invoice.totalAmount;
    totalPaid += invoice.paidAmount;
  }

  return totalDue - totalPaid;
};
```

---

### Phase 8: Testing Plan

#### 8.1 Unit Tests

**File**: `cms-backend/tests/equityIntegration.test.js`

```javascript
describe("Equity Bank Integration", () => {
  describe("Authentication", () => {
    it("should return JWT tokens with valid credentials");
    it("should reject invalid credentials");
    it("should refresh expired access token");
  });

  describe("Validation", () => {
    it("should validate existing student");
    it("should reject invalid student ID");
    it("should return correct outstanding balance");
  });

  describe("Notification", () => {
    it("should process valid payment notification");
    it("should reject duplicate transactions");
    it("should reconcile payment to oldest invoice first");
    it("should handle overpayment correctly");
  });
});
```

#### 8.2 Integration Tests with Mock Data

**Test Scenarios**:

1. ✓ Successful payment flow (validation → notification)
2. ✓ Invalid student ID
3. ✓ Duplicate transaction
4. ✓ Partial payment
5. ✓ Overpayment
6. ✓ Token expiration
7. ✓ Missing required fields

#### 8.3 Postman Collection

Create comprehensive Postman collection with:

- Authentication request
- Validation request (success)
- Validation request (failure)
- Notification request (success)
- Notification request (duplicate)

---

### Phase 9: Deployment Checklist

#### 9.1 Pre-Deployment

- [ ] Create Equity API user in production database
- [ ] Set all environment variables in production
- [ ] Configure IP whitelist (if using)
- [ ] Test all endpoints in staging environment
- [ ] Set up monitoring and alerting
- [ ] Prepare rollback plan

#### 9.2 Production Environment Variables

```env
EQUITY_API_USERNAME=equity_bank_user
EQUITY_API_PASSWORD=<strong-password-from-password-manager>
EQUITY_JWT_SECRET=<256-bit-random-string>
EQUITY_JWT_EXPIRE=1h
EQUITY_REFRESH_JWT_EXPIRE=24h
EQUITY_ALLOWED_IPS=196.201.214.136,196.201.214.137
NODE_ENV=production
```

#### 9.3 Share with Equity Bank

Provide to Equity Bank:

- **Base URL**: `https://api.yourschool.ac.ke`
- **Authentication Endpoint**: `POST /api/equity/auth`
- **Validation Endpoint**: `POST /api/equity/validation`
- **Notification Endpoint**: `POST /api/equity/notification`
- **API Username**: `equity_bank_user`
- **API Password**: (secure transmission)
- **Student ID Format**: "STU2024001" (studentId field)

---

### Phase 10: Monitoring & Maintenance

#### 10.1 Monitoring Metrics

- Number of validation requests per day
- Number of successful payments per day
- Failed transactions and reasons
- Average response time
- Token refresh frequency

#### 10.2 Alerting Rules

- Alert if validation success rate < 95%
- Alert if payment notification fails
- Alert if response time > 3 seconds
- Alert on authentication failures > 5 per hour

#### 10.3 Logging Strategy

- Log all incoming requests (using middleware)
- Log all payment creations
- Log reconciliation results
- Retain logs for 90 days minimum

#### 10.4 Reconciliation Reports

Daily report showing:

- Total Equity payments received
- Total amount
- Successfully reconciled vs. pending
- Any discrepancies

---

## Bill Number Format

### Recommendation: Use Student ID

The `billNumber` parameter in Equity's API should map directly to our `studentId` field.

**Format**:

- Student ID: `STU2024001`, `STU2024002`, etc.
- This is already unique per student
- Easy for students to remember
- No additional mapping required

**Alternative Options**:

1. Use `admissionNumber` instead
2. Create composite key: `{branchCode}-{studentId}`
3. Use invoice numbers (more complex, invoice-specific)

**Recommended**: Use `studentId` directly for simplicity

---

## API Documentation for Equity Bank

### 1. Authentication API

**Endpoint**: `POST /api/equity/auth`

**Request**:

```json
{
  "username": "equity_bank_user",
  "password": "your_password"
}
```

**Response**:

```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 2. Validation API

**Endpoint**: `POST /api/equity/validation`

**Headers**:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request**:

```json
{
  "billNumber": "STU2024001",
  "amount": "0"
}
```

**Success Response**:

```json
{
  "customerName": "John Doe",
  "billNumber": "STU2024001",
  "amount": "50000",
  "description": "Success"
}
```

**Failure Response**:

```json
{
  "customerName": "",
  "billNumber": "",
  "amount": "0",
  "description": "Invalid student ID"
}
```

---

### 3. Notification API

**Endpoint**: `POST /api/equity/notification`

**Headers**:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request**:

```json
{
  "billNumber": "STU2024001",
  "amount": "25000",
  "bankReference": "EQB293293829",
  "transactionDate": "2026-01-26 12:23:23"
}
```

**Success Response**:

```json
{
  "responseCode": "200",
  "responseMessage": "Success"
}
```

**Failure Response**:

```json
{
  "responseCode": "400",
  "responseMessage": "Duplicate transaction"
}
```

---

## Security Considerations

### 1. Authentication

- ✓ Use strong passwords (min 32 characters)
- ✓ Rotate credentials every 90 days
- ✓ Use separate JWT secrets for Equity integration
- ✓ Short-lived access tokens (1 hour)

### 2. Authorization

- ✓ Equity user has minimal permissions
- ✓ Cannot access other system resources
- ✓ Rate limiting on endpoints (100 requests/minute)

### 3. Data Protection

- ✓ Use HTTPS only (TLS 1.2+)
- ✓ Validate all input data
- ✓ Sanitize responses (no sensitive data leak)
- ✓ Log all transactions for audit

### 4. Idempotency

- ✓ Check for duplicate transactions using bankReference
- ✓ Return appropriate error for duplicates
- ✓ Don't create duplicate payment records

---

## Error Handling

### Common Error Codes

| Code | Message                  | Cause                     | Resolution                |
| ---- | ------------------------ | ------------------------- | ------------------------- |
| 200  | Success                  | Payment processed         | None                      |
| 400  | Invalid student ID       | Student not found         | Verify student ID         |
| 400  | Duplicate transaction    | Same bankReference exists | Ignore, already processed |
| 400  | Missing required fields  | Incomplete request        | Check request format      |
| 401  | Invalid or expired token | Authentication failed     | Refresh token             |
| 403  | Access denied            | IP not whitelisted        | Contact admin             |
| 500  | Internal server error    | System error              | Contact support           |

---

## Rollback Plan

If integration fails:

1. Disable Equity routes in server.js
2. Payments can still be manually entered by admins
3. Reconcile any missed transactions manually using logs
4. Re-enable after fixing issues

---

## Timeline Estimate

| Phase                    | Duration | Dependencies |
| ------------------------ | -------- | ------------ |
| 1. Database Setup        | 2 hours  | None         |
| 2. Authentication        | 4 hours  | Phase 1      |
| 3. Validation Endpoint   | 4 hours  | Phase 2      |
| 4. Notification Endpoint | 6 hours  | Phase 3      |
| 5. Middleware & Security | 4 hours  | Phase 2-4    |
| 6. Routes Setup          | 2 hours  | All above    |
| 7. Testing               | 8 hours  | Phase 6      |
| 8. Documentation         | 2 hours  | All above    |
| 9. Deployment            | 4 hours  | Phase 7      |
| 10. Monitoring Setup     | 2 hours  | Phase 9      |

**Total Estimated Time**: 38 hours (~5 working days)

---

## Success Criteria

Integration is successful when:

- ✓ Equity Bank can authenticate and receive valid tokens
- ✓ Student validation returns correct data 100% of the time
- ✓ Payment notifications are processed within 3 seconds
- ✓ Payments are correctly reconciled to student accounts
- ✓ No duplicate payments are created
- ✓ Students receive WhatsApp confirmations
- ✓ Zero downtime during deployment
- ✓ All endpoints respond with < 2 second latency

---

## Support & Maintenance

### Internal Team Responsibilities

- Monitor API logs daily
- Investigate failed transactions within 1 hour
- Respond to Equity Bank queries within 2 hours
- Monthly reconciliation report

### Equity Bank Responsibilities

- Provide static IP addresses for whitelisting
- Notify of API downtimes in advance
- Test in staging before production
- Provide transaction reports for reconciliation

---

## Contact Information

**For Technical Issues**:

- Email: dev-team@yourschool.ac.ke
- Phone: +254-XXX-XXXXXX
- On-Call: 24/7 for critical payment issues

**For Business Queries**:

- Finance Department: finance@yourschool.ac.ke
- Accounts Manager: accounts@yourschool.ac.ke

---

## Appendix

### A. Sample Test Data

```json
// Test Student
{
  "studentId": "TEST2024001",
  "fullName": "Test Student",
  "outstandingBalance": 50000
}

// Test Payment
{
  "billNumber": "TEST2024001",
  "amount": "25000",
  "bankReference": "TEST-EQB-001",
  "transactionDate": "2026-01-26 10:00:00"
}
```

### B. Useful Database Queries

```javascript
// Check payment status
db.payments.find({
  paymentMethod: "equity",
  createdAt: { $gte: ISODate("2026-01-26") },
});

// Find student by ID
db.students.findOne({ studentId: "STU2024001" });

// Check for duplicate transactions
db.payments.findOne({
  "mpesaDetails.transactionId": "EQB293293829",
});
```

### C. Environment Variable Template

```env
# Equity Bank Integration
EQUITY_API_USERNAME=equity_bank_user
EQUITY_API_PASSWORD=
EQUITY_JWT_SECRET=
EQUITY_JWT_EXPIRE=1h
EQUITY_REFRESH_JWT_EXPIRE=24h
EQUITY_ALLOWED_IPS=
```

---

## Revision History

| Version | Date       | Author   | Changes                     |
| ------- | ---------- | -------- | --------------------------- |
| 1.0     | 2026-01-26 | Dev Team | Initial implementation plan |

---

**Document Status**: ✅ Ready for Implementation

**Next Step**: Begin Phase 1 - Database Setup
