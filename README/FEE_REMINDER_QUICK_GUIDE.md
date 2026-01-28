# Fee Reminder Quick Reference

## 📱 Message Examples

### 5-Day Reminder (English)

```
Dear Ahmed Hassan Mohamed, your school fee is due in 5 days. Please pay before 27-02-2026 to ensure uninterrupted access to the school.

M-Pesa Paybill: 720303
Account: ATIAM2024001

Thank you, Management.
```

### 5-Day Reminder (Somali)

```
Ardayga Sharafta leh Ahmed Hassan Mohamed, waxaan ku xasuusinaynaa in bixinta fiiska iskuulka ay ka dhiman tahay 5 maalmood. Fadlan bixi ka hor 27-02-2026 si aadan carqalad ugalakulmin gelitaanka iskuulka.

M-Pesa Paybill: 720303
Account: ATIAM2024001

Mahadsanid, Maamulka.
```

### 1-Day Reminder (English)

```
FINAL NOTICE: Ahmed Hassan Mohamed, your fee is due tomorrow, 27-02-2026. Unpaid accounts will be locked out of the biometric gate system by 8:00 AM tomorrow.

M-Pesa Paybill: 720303
Account: ATIAM2024001

Pay now to avoid inconvenience.
```

### 1-Day Reminder (Somali)

```
OGAYSIIS kama dambays ah: Ahmed Hassan Mohamed, fiiskaaga waxaa kuugu dambaysa berri oo taariikhdu tahay 27-02-2026. Ardayga aan bixin fiiska waxaa si toos ah looga xiri doonaa qalabka faraha, iyo galitaanka iskuulka.

M-Pesa Paybill: 720303
Account: ATIAM2024001
```

## ⏰ Schedule

- **5 days before due date**: Early reminder (Low urgency)
- **1 day before due date**: Final notice (High urgency)

## 📞 Recipients

Each reminder is sent to:

1. Student's phone number
2. Emergency contact's phone number

## 🔧 Technical Details

### New Methods

- `whatsappNotificationService.sendFiveDayFeeReminder()`
- `whatsappNotificationService.sendOneDayFeeReminder()`

### Modified Files

- `/cms-backend/services/whatsappNotificationService.js` - Added new reminder methods
- `/cms-backend/services/feeReminderService.js` - Updated scheduler logic

### Cron Schedule

- Daily at 8:00 AM
- Daily at 2:00 PM

### Required Student Fields

- `firstName` + `lastName`
- `regNumber` or `studentId`
- `phone`
- `emergencyContact.phone`

## 💳 Payment Information

- **Paybill Number**: 720303
- **Account**: Student's registration number
- **Lock Time**: 8:00 AM on due date (if unpaid)

## 🧪 Testing

```bash
cd /home/linus/Documents/CMS-DEPLOYED/New folder/cms/cms-backend
node test-fee-reminders.js
```

## ✅ Checklist

- [x] Simplified messages (removed fee breakdown)
- [x] Bilingual support (English & Somali)
- [x] Clear payment instructions
- [x] Sent to both student and emergency contact
- [x] 5-day early reminder
- [x] 1-day final notice
- [x] Date format: DD-MM-YYYY
- [x] M-Pesa payment details included
- [x] Registration number as account
- [x] Biometric lock warning in final notice
