# Fee Reminder System - Simplified Messages

## Overview

The fee reminder system has been updated to send simplified, bilingual (English & Somali) WhatsApp messages to students and their emergency contacts.

## Message Schedule

### 1. Five Days Before Due Date

**Purpose:** Early warning reminder  
**Recipients:** Student + Emergency Contact  
**Urgency:** Low

**English Message:**

```
Dear {Student name}, your school fee is due in 5 days. Please pay before {DD-MM-YYYY} to ensure uninterrupted access to the school.

M-Pesa Paybill: 720303
Account: {Registration Number}

Thank you, Management.
```

**Somali Translation:**

```
Ardayga Sharafta leh {Student name}, waxaan ku xasuusinaynaa in bixinta fiiska iskuulka ay ka dhiman tahay 5 maalmood. Fadlan bixi ka hor {DD-MM-YYYY} si aadan carqalad ugalakulmin gelitaanka iskuulka.

M-Pesa Paybill: 720303
Account: {Nambarkaaga diwaangalinta}

Mahadsanid, Maamulka.
```

### 2. One Day Before Due Date

**Purpose:** Final notice with urgency  
**Recipients:** Student + Emergency Contact  
**Urgency:** High

**English Message:**

```
FINAL NOTICE: {Student name}, your fee is due tomorrow, {DD-MM-YYYY}. Unpaid accounts will be locked out of the biometric gate system by 8:00 AM tomorrow.

M-Pesa Paybill: 720303
Account: {Registration Number}

Pay now to avoid inconvenience.
```

**Somali Translation:**

```
OGAYSIIS kama dambays ah: {Student Name}, fiiskaaga waxaa kuugu dambaysa berri oo taariikhdu tahay {DD-MM-YYYY}. Ardayga aan bixin fiiska waxaa si toos ah looga xiri doonaa qalabka faraha, iyo galitaanka iskuulka.

M-Pesa Paybill: 720303
Account: {Nambarkaaga diwaangalinta}
```

## Technical Implementation

### Files Modified

1. **whatsappNotificationService.js**
   - Added `sendFiveDayFeeReminder()` method
   - Added `sendOneDayFeeReminder()` method
   - Both methods send bilingual messages
   - Support for both student and emergency contact recipients

2. **feeReminderService.js**
   - Updated `checkFeeReminders()` to check for 5-day and 1-day milestones
   - Removed 3-day, same-day, and overdue reminders
   - Added WhatsApp notification integration
   - Updated `checkInstallmentReminders()` for installment-based fees
   - Sends messages to both student phone and emergency contact phone

### Scheduled Jobs

The system runs automated checks:

- **8:00 AM daily** - Morning check for fee reminders
- **2:00 PM daily** - Afternoon check for fee reminders

### Key Features

✅ **Simplified messages** - No complex fee breakdown, just essential information  
✅ **Bilingual support** - English and Somali translations  
✅ **Clear payment instructions** - M-Pesa Paybill and account details  
✅ **Dual recipients** - Messages sent to both student and emergency contact  
✅ **Date formatting** - Uses DD-MM-YYYY format (e.g., 27-02-2026)  
✅ **Registration number** - Used as M-Pesa account number  
✅ **Urgency levels** - Low for 5-day, High for 1-day reminders

### Student Data Required

The system retrieves the following from the Student model:

- `firstName` and `lastName` - For personalization
- `regNumber` or `studentId` - For M-Pesa account
- `phone` - Student's WhatsApp number
- `emergencyContact.phone` - Emergency contact's WhatsApp number

### Message Flow

```
Fee Due Date Set
      ↓
[5 days before]
      ↓
Check at 8:00 AM & 2:00 PM
      ↓
Send WhatsApp to:
  • Student
  • Emergency Contact
      ↓
[1 day before]
      ↓
Check at 8:00 AM & 2:00 PM
      ↓
Send FINAL NOTICE to:
  • Student
  • Emergency Contact
```

## Testing

A test script is available at `test-fee-reminders.js` to preview the messages:

```bash
cd cms-backend
node test-fee-reminders.js
```

## Payment Information

- **M-Pesa Paybill:** 720303
- **Account Number:** Student's registration number
- **Biometric Lock Time:** 8:00 AM on due date (for unpaid accounts)

## Notes

- Messages are sent via WhatsApp using the WASender integration
- Both English and Somali versions are sent in the same message, separated by "---"
- The system also sends in-app push notifications alongside WhatsApp messages
- Rate limiting is applied (1 second between messages) to avoid spam detection
- Works for both regular fees and installment-based fees
