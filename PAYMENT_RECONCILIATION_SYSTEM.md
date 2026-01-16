# Payment Reconciliation System

## Overview

The Payment Reconciliation System automatically manages student payments by:
1. **Debt Reconciliation**: Payments are automatically applied to the oldest unpaid invoices first (FIFO - First In, First Out)
2. **Credit Management**: Overpayments are tracked as credits and automatically applied to future invoices
3. **Transaction Safety**: All operations use MongoDB transactions to ensure data consistency

## Key Features

### 1. Smart Payment Application
When a payment is made, the system:
- Finds all outstanding (unpaid/partially paid) invoices sorted by date (oldest first)
- Applies the payment progressively to each invoice until the payment is exhausted
- Creates individual Payment records for each invoice that receives payment
- Automatically updates invoice status (unpaid → partially_paid → paid)

### 2. Credit Tracking
- Payments exceeding total debt are stored as **credit**
- Credits are represented as Payment records with `feeId: null`
- Credits can be queried and viewed separately
- Credits are automatically applied to new invoices when generated

### 3. No Invoice Selection Required
- Users no longer need to specify which invoice they're paying
- The system intelligently determines the best allocation
- Simplifies the payment process for both admin and students

## How It Works

### Payment Flow

```
Payment Made (Amount: X)
    ↓
Find Outstanding Invoices (sorted by date, oldest first)
    ↓
Apply to Invoice 1
    ├─ Full payment: Mark as paid, continue to next
    ├─ Partial payment: Mark as partially_paid, stop
    └─ Payment exhausted: Stop
    ↓
Apply to Invoice 2...
    ↓
Any remaining amount?
    ├─ Yes: Create credit payment (feeId: null)
    └─ No: Complete reconciliation
```

### Example Scenarios

#### Scenario 1: Exact Payment
```
Student owes: KES 5,000 (Invoice #1)
Payment made: KES 5,000
Result:
- Invoice #1: Fully paid (KES 5,000)
- Credit: KES 0
```

#### Scenario 2: Partial Payment
```
Student owes: 
  - Invoice #1: KES 5,000 (Oct 2025)
  - Invoice #2: KES 5,000 (Nov 2025)
Payment made: KES 6,000
Result:
- Invoice #1: Fully paid (KES 5,000)
- Invoice #2: Partially paid (KES 1,000)
- Remaining balance on Invoice #2: KES 4,000
- Credit: KES 0
```

#### Scenario 3: Overpayment (Credit)
```
Student owes: KES 5,000 (Invoice #1)
Payment made: KES 7,000
Result:
- Invoice #1: Fully paid (KES 5,000)
- Credit: KES 2,000 (stored as Payment with feeId: null)
```

#### Scenario 4: Using Existing Credit
```
Existing credit: KES 2,000
New invoice generated: KES 5,000 (Invoice #2)
Auto-applied:
- Invoice #2: Partially paid (KES 2,000)
- Remaining balance on Invoice #2: KES 3,000
- Credit: KES 0
```

#### Scenario 5: Credit Exceeds New Invoice
```
Existing credit: KES 7,000
New invoice generated: KES 5,000 (Invoice #2)
Auto-applied:
- Invoice #2: Fully paid (KES 5,000)
- Credit: KES 2,000 (remaining)
```

## API Endpoints

### 1. Record Manual Payment
```http
POST /api/fees/payments/manual
```

**Request Body:**
```json
{
  "studentId": "student_id_here",
  "amount": 7000,
  "paymentMethod": "cash",
  "paymentDate": "2025-12-15",
  "referenceNumber": "RCP-12345",
  "bankName": "Optional Bank Name",
  "depositorName": "Optional Depositor Name",
  "notes": "Optional notes"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment of KES 7,000 reconciled successfully. Paid 2 invoice(s), credit balance: KES 2,000",
  "data": {
    "receiptNumber": "RCP-12345",
    "totalAmount": 7000,
    "appliedToInvoices": 5000,
    "creditAmount": 2000,
    "invoicesUpdated": 2,
    "invoicesPaid": 1,
    "details": [
      {
        "feeId": "fee_id_1",
        "amountApplied": 5000,
        "invoiceStatus": "paid"
      },
      {
        "feeId": null,
        "amountApplied": 2000,
        "invoiceStatus": "credit"
      }
    ]
  }
}
```

### 2. Get Student Credit Balance
```http
GET /api/fees/payments/student/:studentId/credit
```

**Response:**
```json
{
  "success": true,
  "data": {
    "studentId": "student_id_here",
    "creditBalance": 2000,
    "formattedBalance": "KES 2,000"
  }
}
```

### 3. Get Student Payment Summary
```http
GET /api/fees/payments/student/:studentId/summary
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOutstanding": 10000,
    "totalPaid": 7000,
    "creditBalance": 2000,
    "invoicesSummary": {
      "total": 3,
      "paid": 1,
      "partiallyPaid": 1,
      "unpaid": 1
    },
    "outstandingInvoices": [
      {
        "invoiceId": "fee_id_2",
        "period": "Nov 2025",
        "totalDue": 5000,
        "amountPaid": 1000,
        "balance": 4000,
        "status": "partially_paid",
        "dueDate": "2025-11-10"
      },
      {
        "invoiceId": "fee_id_3",
        "period": "Dec 2025",
        "totalDue": 5000,
        "amountPaid": 0,
        "balance": 5000,
        "status": "unpaid",
        "dueDate": "2025-12-10"
      }
    ]
  }
}
```

## Database Schema

### Payment Model Changes
```javascript
{
  feeId: ObjectId or null,  // null indicates credit
  studentId: ObjectId,       // Always present
  amount: Number,
  paymentMethod: String,
  paymentDate: Date,
  status: String,            // 'completed', 'pending', 'failed'
  receiptNumber: String,
  // ... other fields
}
```

**Key Point**: Payments with `feeId: null` represent credit.

### Fee Model (Invoice)
```javascript
{
  studentId: ObjectId,
  periodYear: Number,
  periodMonth: Number,
  totalAmountDue: Number,
  amountPaid: Number,        // Calculated from Payment records
  balance: Number,           // totalAmountDue - amountPaid (virtual)
  status: String,            // 'unpaid', 'partially_paid', 'paid'
  dueDate: Date,
  // ... other fields
}
```

## Integration Points

### 1. Payment Entry Points

All payment entry methods now use reconciliation:

#### Manual Payment (Admin/Secretary)
- Route: `POST /api/fees/payments/manual`
- Controller: `paymentController.recordManualPayment()`
- Uses: `reconcilePayment()`

#### Equity Bank M-Pesa Callback
- Route: `POST /api/fees/payments/equity/callback/:paymentId`
- Controller: `paymentController.handleEquityCallback()`
- Uses: `reconcilePayment()` after payment confirmation

#### M-Pesa Direct (Future)
- Would follow same pattern

### 2. Invoice Generation

When new invoices are generated:
- Route: `POST /api/fees/generate-invoices`
- Service: `monthlyInvoiceService.generateMonthlyInvoices()`
- Auto-applies credit: Calls `applyCreditToNewInvoice()` for each new invoice

## Implementation Details

### Service: paymentReconciliationService.js

#### `reconcilePayment(params)`
Main function that handles payment reconciliation.

**Parameters:**
```javascript
{
  studentId: ObjectId,
  amount: Number,
  paymentMethod: String,
  paymentDate: Date,
  receiptNumber: String,
  branchId: ObjectId,
  recordedBy: ObjectId,
  additionalDetails: Object  // Optional extra data (e.g., equityDetails)
}
```

**Returns:**
```javascript
{
  success: Boolean,
  message: String,
  receiptNumber: String,
  totalAmount: Number,
  appliedToInvoices: Number,
  creditAmount: Number,
  invoicesUpdated: Number,
  invoicesPaid: Number,
  appliedPayments: Array
}
```

**Process:**
1. Start MongoDB transaction
2. Query all unpaid/partially_paid invoices for student
3. Sort by periodYear, periodMonth (oldest first)
4. For each invoice:
   - Calculate amount to apply (min of remaining payment and invoice balance)
   - Create Payment record
   - Update invoice amountPaid
   - Update invoice status if fully paid
5. If payment amount remains:
   - Create credit Payment (feeId: null)
6. Commit transaction
7. Return detailed result

#### `getStudentCreditBalance(studentId)`
Returns total credit balance for a student.

**Process:**
1. Query all Payment records where `feeId: null` and `status: 'completed'`
2. Sum the amounts
3. Return total

#### `applyCreditToNewInvoice(studentId, newInvoiceId)`
Automatically applies existing credit to a newly created invoice.

**Parameters:**
```javascript
studentId: ObjectId
newInvoiceId: ObjectId
```

**Process:**
1. Get student's credit balance
2. If credit exists and > 0:
   - Get the new invoice
   - Calculate amount to apply (min of credit and invoice balance)
   - Find oldest credit payments
   - For each credit payment:
     - Link to invoice (set feeId)
     - Update invoice amountPaid
   - Delete exhausted credit payments
   - Create new credit payment if partial credit used
3. Update invoice status if needed

#### `getStudentPaymentSummary(studentId)`
Returns comprehensive payment and invoice summary for a student.

**Returns:**
```javascript
{
  totalOutstanding: Number,
  totalPaid: Number,
  creditBalance: Number,
  invoicesSummary: {
    total: Number,
    paid: Number,
    partiallyPaid: Number,
    unpaid: Number
  },
  outstandingInvoices: Array
}
```

## Migration from Old System

If you have existing payments stored differently:

### Step 1: Understand Current State
- Old system may have `feeId` directly on payments
- Payments might be linked to specific invoices
- No credit tracking

### Step 2: Keep Old Payments
- No need to migrate existing Payment records
- They'll continue to work for historical reporting

### Step 3: New Payments Use Reconciliation
- All new payments automatically use reconciliation
- Old invoices can be paid using new system

### Step 4: Optional: Backfill Credits
If students had overpayments in old system:
```javascript
// Create credit payments for existing overpayments
const Payment = require('./models/Payment');

// For each student with overpayment in old student.fees.totalPaid
await Payment.create({
  feeId: null,  // Credit
  studentId: student._id,
  amount: overpaymentAmount,
  paymentMethod: 'migration',
  paymentDate: new Date(),
  status: 'completed',
  receiptNumber: `CREDIT-MIGRATION-${student._id}`,
  branchId: student.branchId,
  notes: 'Credit migrated from old system'
});
```

## Testing

### Test Scenarios

#### Test 1: Basic Payment Application
```javascript
// 1. Create invoice for student (KES 5,000)
// 2. Make payment (KES 5,000)
// 3. Verify invoice status = 'paid'
// 4. Verify Payment record created with correct feeId
```

#### Test 2: Partial Payment
```javascript
// 1. Create 2 invoices (KES 5,000 each)
// 2. Make payment (KES 6,000)
// 3. Verify Invoice 1 status = 'paid'
// 4. Verify Invoice 2 status = 'partially_paid', amountPaid = 1,000
// 5. Verify 2 Payment records created
```

#### Test 3: Overpayment and Credit
```javascript
// 1. Create invoice (KES 5,000)
// 2. Make payment (KES 7,000)
// 3. Verify invoice status = 'paid'
// 4. Verify credit balance = KES 2,000
// 5. Verify Payment record with feeId: null exists
```

#### Test 4: Auto-Apply Credit
```javascript
// 1. Student has credit (KES 2,000)
// 2. Generate new invoice (KES 5,000)
// 3. Verify invoice immediately partially paid (KES 2,000)
// 4. Verify credit balance = 0
// 5. Verify invoice balance = KES 3,000
```

#### Test 5: Multiple Invoices, Multiple Payments
```javascript
// 1. Create 3 invoices (Oct, Nov, Dec - KES 5,000 each)
// 2. Make payment 1 (KES 3,000) - Oct partially paid
// 3. Make payment 2 (KES 4,000) - Oct fully paid, Nov partially paid
// 4. Make payment 3 (KES 10,000) - Nov & Dec fully paid, KES 3,000 credit
// 5. Verify all amounts and statuses correct
```

## Troubleshooting

### Issue: Credit not applied to new invoice
**Check:**
1. Is `applyCreditToNewInvoice()` called after invoice creation?
2. Are there credit payments in the database (`feeId: null`)?
3. Check console logs for errors during credit application

### Issue: Payment applied to wrong invoice
**Check:**
1. Are invoices sorted correctly by date?
2. Query: `Fee.find({studentId}).sort({periodYear: 1, periodMonth: 1})`
3. Verify periodYear and periodMonth are numbers, not strings

### Issue: Transaction errors
**Check:**
1. MongoDB replica set configured? (Transactions require replica set)
2. Check connection string includes `?replicaSet=rs0`
3. For development: `mongod --replSet rs0` and run `rs.initiate()`

### Issue: Duplicate payments
**Check:**
1. Receipt numbers should be unique
2. Add unique index: `Payment.schema.index({receiptNumber: 1}, {unique: true})`
3. Handle callback retries (check if payment already processed)

## Best Practices

1. **Always use reconciliation for new payments**: Don't create Payment records directly
2. **Monitor credit balances**: Large credits might indicate data entry errors
3. **Transaction safety**: Always use transactions for payment operations
4. **Receipt numbers**: Use unique, traceable receipt numbers
5. **Logging**: Log all reconciliation operations for audit trail
6. **Error handling**: Wrap reconciliation calls in try-catch
7. **Testing**: Test with various payment scenarios before production
8. **Documentation**: Keep payment records for legal compliance

## Future Enhancements

Potential additions to the system:

1. **Payment Plans**: Allow setting up installment plans
2. **Partial Refunds**: Handle refund scenarios
3. **Payment Reversal**: Admin ability to reverse payments
4. **Credit Expiry**: Optional expiry dates for credits
5. **Payment Allocation Preferences**: Let users choose which invoice to pay first
6. **Bulk Payments**: Process multiple students at once
7. **Payment Reminders**: Automated reminders for outstanding invoices
8. **Payment Analytics**: Dashboard showing payment trends

## Support

For issues or questions:
1. Check this documentation
2. Review console logs for error details
3. Check MongoDB transaction logs
4. Verify data consistency in Payment and Fee collections
