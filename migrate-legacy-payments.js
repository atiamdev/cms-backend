const mongoose = require('mongoose');
require('dotenv').config();

// DRY RUN MODE - Set to false to actually apply changes
const DRY_RUN = false;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cms', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Student = require('./models/Student');
const Fee = require('./models/Fee');
const Payment = require('./models/Payment');

async function migrateLegacyPayments() {
  try {
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes will be saved to database\n');
      console.log('   To apply changes, set DRY_RUN = false in the script\n');
    }
    console.log('🚀 Starting legacy payment migration...\n');

    // Get all students with payment history
    const students = await Student.find({
      'fees.paymentHistory.0': { $exists: true }
    }).select('_id studentId admissionNumber fees.paymentHistory');

    console.log(`📊 Found ${students.length} students with payment history\n`);

    let totalStudentsProcessed = 0;
    let totalPaymentsApplied = 0;
    let totalAmountApplied = 0;
    let studentsWithIssues = [];

    for (const student of students) {
      try {
        // Calculate total legacy payments
        const totalLegacyPayments = student.fees.paymentHistory.reduce(
          (sum, payment) => sum + (payment.amount || 0),
          0
        );

        if (totalLegacyPayments === 0) {
          console.log(`⏭️  Skipping ${student.admissionNumber || student.studentId} - No payment amount`);
          continue;
        }

        // Get all invoices for this student (oldest first)
        const allInvoices = await Fee.find({
          studentId: student._id
        }).sort({ dueDate: 1, createdAt: 1 });

        if (allInvoices.length === 0) {
          console.log(`⚠️  ${student.admissionNumber || student.studentId} - Has ${totalLegacyPayments} in payments but NO invoices exist`);
          studentsWithIssues.push({
            student: student.admissionNumber || student.studentId,
            issue: 'No invoices found at all',
            amount: totalLegacyPayments
          });
          continue;
        }

        // Check if there are unpaid invoices (calculate actual balance)
        const unpaidInvoices = allInvoices.filter(inv => {
          const actualBalance = inv.totalAmountDue - (inv.amountPaid || 0);
          return actualBalance > 0;
        });
        const invoices = unpaidInvoices.length > 0 ? unpaidInvoices : allInvoices;

        if (unpaidInvoices.length === 0) {
          console.log(`⚠️  ${student.admissionNumber || student.studentId} - Has ${totalLegacyPayments} in payments but all ${allInvoices.length} invoices already paid`);
          console.log(`   Invoice details:`);
          allInvoices.forEach(inv => {
            const actualBalance = inv.totalAmountDue - (inv.amountPaid || 0);
            console.log(`   - Invoice ${inv._id.toString().slice(-6)}: Due=${inv.totalAmountDue}, Paid=${inv.amountPaid}, Balance=${inv.balance} (Actual: ${actualBalance}), Status=${inv.status}`);
          });
          studentsWithIssues.push({
            student: student.admissionNumber || student.studentId,
            issue: 'All invoices already marked as paid',
            amount: totalLegacyPayments
          });
          continue;
        }

        let remainingAmount = totalLegacyPayments;
        let invoicesUpdated = 0;

        console.log(`💳 Processing ${student.admissionNumber || student.studentId}:`);
        console.log(`   Legacy payments total: KES ${totalLegacyPayments.toLocaleString()}`);
        console.log(`   Found ${invoices.length} unpaid invoice(s)`);

        // Apply payments to invoices in order
        for (const invoice of invoices) {
          if (remainingAmount <= 0) break;

          // Calculate actual balance (in case stored balance is wrong)
          const actualBalance = invoice.totalAmountDue - (invoice.amountPaid || 0);
          if (actualBalance <= 0) continue; // Skip if already fully paid
          
          const invoiceBalance = actualBalance;
          const amountToApply = Math.min(remainingAmount, invoiceBalance);

          // Update invoice
          invoice.amountPaid = (invoice.amountPaid || 0) + amountToApply;
          invoice.balance = invoice.totalAmountDue - invoice.amountPaid;
          
          // Update status
          if (invoice.balance <= 0) {
            invoice.status = 'paid';
            invoice.paymentStatus = 'completed';
          } else if (invoice.amountPaid > 0) {
            invoice.status = 'partially_paid';
            invoice.paymentStatus = 'pending';
          }

          // Add migration note (if notes field exists)
          if (invoice.notes !== undefined) {
            if (!Array.isArray(invoice.notes)) {
              invoice.notes = [];
            }
            invoice.notes.push({
              text: `Legacy payment applied: KES ${amountToApply} (Migration on ${new Date().toISOString().split('T')[0]})`,
              createdBy: 'system',
              createdAt: new Date()
            });
          }

          if (!DRY_RUN) {
            await invoice.save();
          }

          console.log(`   ✅ Applied KES ${amountToApply.toLocaleString()} to invoice ${invoice._id.toString().slice(-6)} (Balance: ${invoiceBalance.toLocaleString()} → ${invoice.balance.toLocaleString()})${DRY_RUN ? ' [DRY RUN]' : ''}`);

          remainingAmount -= amountToApply;
          invoicesUpdated++;
          totalPaymentsApplied++;
        }

        totalAmountApplied += (totalLegacyPayments - remainingAmount);

        if (remainingAmount > 0) {
          console.log(`   ⚠️  Remaining KES ${remainingAmount.toLocaleString()} could not be applied (all invoices paid)`);
          studentsWithIssues.push({
            student: student.admissionNumber || student.studentId,
            issue: 'Excess payment (overpaid)',
            amount: remainingAmount
          });
        }

        // Mark legacy payments as migrated (optional - add a flag)
        student.fees.paymentHistory.forEach(payment => {
          payment.migratedToInvoices = true;
        });
        if (!DRY_RUN) {
          await student.save();
        }

        totalStudentsProcessed++;
        console.log(`   📝 Updated ${invoicesUpdated} invoice(s)${DRY_RUN ? ' [DRY RUN - NOT SAVED]' : ''}\n`);

      } catch (error) {
        console.error(`❌ Error processing student ${student.admissionNumber || student.studentId}:`, error.message);
        studentsWithIssues.push({
          student: student.admissionNumber || student.studentId,
          issue: `Error: ${error.message}`,
          amount: 0
        });
      }
    }

    // Summary Report
    console.log('\n' + '='.repeat(60));
    console.log(DRY_RUN ? '🔍 DRY RUN SUMMARY (NO CHANGES SAVED)' : '📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Students processed: ${totalStudentsProcessed}`);
    console.log(`💰 Total amount applied: KES ${totalAmountApplied.toLocaleString()}`);
    console.log(`📄 Invoices updated: ${totalPaymentsApplied}`);
    console.log(`⚠️  Students with issues: ${studentsWithIssues.length}`);

    if (studentsWithIssues.length > 0) {
      console.log('\n⚠️  ISSUES FOUND:');
      studentsWithIssues.forEach(issue => {
        console.log(`   - ${issue.student}: ${issue.issue} (KES ${issue.amount.toLocaleString()})`);
      });
    }

    if (DRY_RUN) {
      console.log('\n🔍 This was a DRY RUN - No changes were saved to the database');
      console.log('💡 To apply these changes:');
      console.log('   1. Set DRY_RUN = false in the script');
      console.log('   2. Run the script again\n');
    } else {
      console.log('\n✅ Migration completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('   1. Verify the data in the admin panel');
      console.log('   2. Check that payment totals match expectations');
      console.log('   3. Review students with issues (if any)');
      console.log('   4. Once verified, consider archiving the old paymentHistory field\n');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
console.log('⚠️  WARNING: This script will modify invoice data!');
console.log('⚠️  Make sure you have a database backup before proceeding.\n');

if (DRY_RUN) {
  console.log('🔍 Running in DRY RUN mode - No changes will be saved\n');
  migrateLegacyPayments();
} else {
  console.log('⚠️  LIVE MODE - Changes WILL be saved to the database!\n');
  // Add a 5-second delay to allow cancellation
  setTimeout(() => {
    migrateLegacyPayments();
  }, 5000);
  console.log('⏱️  Starting in 5 seconds... (Press Ctrl+C to cancel)\n');
}
