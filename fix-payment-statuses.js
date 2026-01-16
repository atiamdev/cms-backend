const mongoose = require("mongoose");
require("dotenv").config();

const Payment = require("./models/Payment");

const fixPaymentStatuses = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Find all payments with pending or failed status that have manual payment details
    // These are likely manually recorded payments that should be "completed" and "verified"
    const result = await Payment.updateMany(
      {
        status: { $in: ["pending", "failed"] },
        manualPaymentDetails: { $exists: true, $ne: null },
      },
      {
        $set: {
          status: "completed",
          verificationStatus: "verified",
        },
      }
    );

    console.log(
      `Updated ${result.modifiedCount} payment(s) to 'completed' status`
    );

    // Show payment status breakdown after update
    const statusBreakdown = await Payment.aggregate([
      {
        $group: {
          _id: { status: "$status", verificationStatus: "$verificationStatus" },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    console.log("\nPayment status breakdown after update:");
    console.log(JSON.stringify(statusBreakdown, null, 2));

    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Error fixing payment statuses:", error);
    process.exit(1);
  }
};

fixPaymentStatuses();
