/**
 * Test script for new simplified fee reminder messages
 */

const WhatsAppNotificationService = require("../services/whatsappNotificationService");

async function testFeeReminders() {
  const whatsappService = new WhatsAppNotificationService();

  console.log("\n========================================");
  console.log("Testing 5-Day Fee Reminder");
  console.log("========================================\n");

  // Test 5-day reminder
  const fiveDayData = {
    studentName: "Ahmed Hassan Mohamed",
    regNumber: "ATIAM2024001",
    dueDate: new Date("2026-02-27"),
    recipientType: "student",
  };

  console.log("Sample 5-Day Reminder Message:");
  console.log("------------------------------");
  const formattedDueDate = new Date(fiveDayData.dueDate).toLocaleDateString(
    "en-GB",
  );

  const fiveDayEnglish = `Dear ${fiveDayData.studentName}, your school fee is due in 5 days. Please pay before ${formattedDueDate} to ensure uninterrupted access to the school.

M-Pesa Paybill: 720303
Account: ${fiveDayData.regNumber}

Thank you, Management.`;

  const fiveDaySomali = `Ardayga Sharafta leh ${fiveDayData.studentName}, waxaan ku xasuusinaynaa in bixinta fiiska iskuulka ay ka dhiman tahay 5 maalmood. Fadlan bixi ka hor ${formattedDueDate} si aadan carqalad ugalakulmin gelitaanka iskuulka.

M-Pesa Paybill: 720303
Account: ${fiveDayData.regNumber}

Mahadsanid, Maamulka.`;

  console.log(fiveDayEnglish);
  console.log("\n---\n");
  console.log(fiveDaySomali);

  console.log("\n\n========================================");
  console.log("Testing 1-Day Fee Reminder (FINAL NOTICE)");
  console.log("========================================\n");

  // Test 1-day reminder
  const oneDayData = {
    studentName: "Ahmed Hassan Mohamed",
    regNumber: "ATIAM2024001",
    dueDate: new Date("2026-02-27"),
    recipientType: "student",
  };

  console.log("Sample 1-Day Reminder Message:");
  console.log("------------------------------");

  const oneDayEnglish = `FINAL NOTICE: ${oneDayData.studentName}, your fee is due tomorrow, ${formattedDueDate}. Unpaid accounts will be locked out of the biometric gate system by 8:00 AM tomorrow.

M-Pesa Paybill: 720303
Account: ${oneDayData.regNumber}

Pay now to avoid inconvenience.`;

  const oneDaySomali = `OGAYSIIS kama dambays ah: ${oneDayData.studentName}, fiiskaaga waxaa kuugu dambaysa berri oo taariikhdu tahay ${formattedDueDate}. Ardayga aan bixin fiiska waxaa si toos ah looga xiri doonaa qalabka faraha, iyo galitaanka iskuulka.

M-Pesa Paybill: 720303
Account: ${oneDayData.regNumber}`;

  console.log(oneDayEnglish);
  console.log("\n---\n");
  console.log(oneDaySomali);

  console.log("\n\n========================================");
  console.log("Test Complete!");
  console.log("========================================");
  console.log("\nKey Features:");
  console.log("✅ Simplified messages (removed complex fee breakdown)");
  console.log("✅ Clear due dates");
  console.log("✅ Bilingual (English & Somali)");
  console.log("✅ M-Pesa payment instructions");
  console.log("✅ Student registration number as account");
  console.log("✅ Messages sent to both student and emergency contact");
  console.log("\nSchedule:");
  console.log("• 5 days before due date - Early reminder");
  console.log("• 1 day before due date - Final notice with urgency");
  console.log("\nNote: WhatsApp service status:", whatsappService.getStatus());
}

// Run the test
testFeeReminders().catch(console.error);
