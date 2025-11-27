const Payment = require("../models/Payment");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  canAccessBranchResource,
  getBranchQueryFilter,
  canPerformBranchOperation,
  isSuperAdmin,
  hasAdminPrivileges,
} = require("../utils/accessControl");

// Helper functions
const validateAndFormatPhone = (phoneNumber) => {
  if (!phoneNumber) {
    throw new Error("Phone number is required");
  }
  const formattedPhone = phoneNumber.replace(/^\+?254|^0/, "254");
  if (!/^254[17]\d{8}$/.test(formattedPhone)) {
    throw new Error("Invalid phone number format");
  }
  return formattedPhone;
};

const updateStudentFeesAfterPayment = async (
  payment,
  transactionRef,
  checkExisting = false
) => {
  const student = await Student.findById(payment.studentId);
  if (!student || !student.fees) {
    console.error("Student or student fees not found:", payment.studentId);
    return;
  }

  console.log("=== UPDATING STUDENT FEES ===");
  console.log("Student ID:", student.studentId);
  console.log("Payment amount:", payment.amount);
  console.log("Current totalPaid:", student.fees.totalPaid);
  console.log("Current totalBalance:", student.fees.totalBalance);
  console.log("Transaction ref:", transactionRef);

  const oldBalance = student.fees.totalBalance;
  const oldTotalPaid = student.fees.totalPaid;

  // Update totalPaid instead of totalBalance directly
  // The pre-save middleware will recalculate totalBalance
  student.fees.totalPaid += payment.amount;

  console.log("New totalPaid after addition:", student.fees.totalPaid);

  // Add to payment history
  if (
    !checkExisting ||
    !student.fees.paymentHistory?.find(
      (h) => h.referenceNumber === transactionRef
    )
  ) {
    const paymentHistoryEntry = {
      date: new Date(),
      amount: payment.amount,
      paymentMethod:
        payment.paymentMethod === "equity"
          ? "equity-mpesa"
          : payment.paymentMethod,
      referenceNumber: transactionRef || payment.receiptNumber,
      notes: `${
        payment.paymentMethod === "equity"
          ? "Equity Bank M-Pesa STK Push"
          : payment.paymentMethod
      } - Transaction: ${transactionRef || "N/A"}`,
      recordedBy: payment.recordedBy,
    };

    if (!student.fees.paymentHistory) {
      student.fees.paymentHistory = [];
    }
    student.fees.paymentHistory.push(paymentHistoryEntry);
    console.log("Added payment history entry");
  } else {
    console.log("Payment history entry already exists, skipping");
  }

  try {
    await student.save();
    console.log("Student record saved successfully");

    // Verify the save by re-fetching
    const verifyStudent = await Student.findById(payment.studentId);
    console.log("Verified totalPaid after save:", verifyStudent.fees.totalPaid);
    console.log(
      "Verified totalBalance after save:",
      verifyStudent.fees.totalBalance
    );
  } catch (saveError) {
    console.error("Error saving student record:", saveError);
    throw saveError;
  }

  console.log("Student fees updated:", {
    studentId: student.studentId,
    oldBalance,
    oldTotalPaid,
    newTotalPaid: student.fees.totalPaid,
    newBalance:
      student.fees.totalFeeStructure -
      student.fees.totalPaid -
      student.fees.scholarshipAmount,
    amountPaid: payment.amount,
  });
  console.log("=== END UPDATING STUDENT FEES ===");
};

// Jenga Configuration
const getJengaConfig = () => ({
  merchantCode: process.env.JENGA_MERCHANT_CODE,
  consumerSecret: process.env.JENGA_CONSUMER_SECRET,
  apiKey: process.env.JENGA_API_KEY,
  callbackUrl: process.env.JENGA_CALLBACK_URL,
  accountNumber:
    process.env.JENGA_ACCOUNT_NUMBER || process.env.JENGA_MERCHANT_CODE,
  merchantName: process.env.JENGA_MERCHANT_NAME || "CMS School Management",
  privateKeyPath: process.env.JENGA_PRIVATE_KEY_PATH || "./keys/privatekey.pem",
  baseUrl:
    process.env.JENGA_ENVIRONMENT === "production"
      ? "https://api.finserve.africa"
      : "https://uat.finserve.africa",
});

const getJengaAccessToken = async () => {
  try {
    const config = getJengaConfig();

    const response = await axios.post(
      `${config.baseUrl}/authentication/api/v3/authenticate/merchant`,
      {
        merchantCode: config.merchantCode,
        consumerSecret: config.consumerSecret,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Api-Key": config.apiKey,
        },
        timeout: 30000, // 30 second timeout
      }
    );

    console.log("Access token:", response.data.accessToken);
    return response.data.accessToken;
  } catch (error) {
    console.error(
      "Jenga access token error:",
      error.response?.data || error.message
    );
    throw new Error("Failed to get Jenga access token");
  }
};

// Generate RSA signature for Jenga API requests
const generateJengaSignature = (dataToSign) => {
  try {
    const config = getJengaConfig();
    const privateKeyPath = path.resolve(config.privateKeyPath);

    if (!fs.existsSync(privateKeyPath)) {
      throw new Error(`RSA private key not found at: ${privateKeyPath}`);
    }

    const privateKey = fs.readFileSync(privateKeyPath, "utf8");
    const sign = crypto.createSign("SHA256"); // Use SHA256 as per Jenga docs
    sign.update(dataToSign);
    const signature = sign.sign(privateKey, "base64"); // Use base64 as per Jenga docs

    return signature;
  } catch (error) {
    console.error("Error generating RSA signature:", error);
    throw new Error(`Failed to generate signature: ${error.message}`);
  }
};

// @desc    Initiate Equity Bank payment via Jenga
// @route   POST /api/fees/payments/equity/initiate
// @access  Private (Student, Admin, Secretary)
const initiateEquityPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      feeId,
      amount,
      customerFirstName,
      customerLastName,
      customerEmail,
      customerPhone,
      customer, // Optional customer object
    } = req.body;

    // Validate fee exists and belongs to the user's branch
    const fee = await Fee.findOne({
      _id: feeId,
      branchId: req.user.branchId,
    }).populate("studentId", "studentId userId firstName lastName email phone");

    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    // Check if student can pay (for student role)
    if (
      req.user.roles.includes("student") &&
      req.user.studentProfile?.toString() !== fee.studentId._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only pay your own fees",
      });
    }

    // Validate payment amount
    if (amount <= 0 || amount > fee.balance) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    // Validate that we have a phone number for payment (required for M-Pesa)
    const paymentPhone =
      customerPhone || customer?.phoneNumber || fee.studentId.phone;
    if (!paymentPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required for M-Pesa payment",
      });
    }

    // Format phone number (ensure it starts with country code)
    const formattedPhone = validateAndFormatPhone(paymentPhone);

    try {
      const config = getJengaConfig();
      const accessToken = await getJengaAccessToken();

      // Generate unique order reference (alphanumeric only, no special characters)
      const orderReference = `EQ${fee.studentId.studentId}${Date.now()}`;

      // Create payment record first
      const payment = new Payment({
        branchId: req.user.branchId,
        feeId: fee._id,
        studentId: fee.studentId._id,
        amount,
        paymentMethod: "equity",
        status: "pending",
        equityDetails: {
          orderReference,
        },
        recordedBy: req.user._id,
      });

      await payment.save();

      // Prepare Jenga checkout data
      const checkoutData = {
        token: accessToken,
        merchantCode: config.merchantCode,
        currency: "KES",
        orderAmount: amount.toString(),
        orderReference,
        productType: "Service",
        productDescription: `Fee payment for ${fee.studentId.studentId}`,
        extraData: payment._id.toString(),
        paymentTimeLimit: "15mins",
        customerFirstName,
        customerLastName,
        customerPostalCodeZip: "00100", // Default Nairobi postal code
        customerAddress: "Nairobi, Kenya", // Default address
        customerEmail,
        customerPhone: formattedPhone,
        callbackUrl: `${config.callbackUrl}/${payment._id}`,
        countryCode: "KE",
        secondaryReference: fee.studentId.studentId,
      };

      // Generate signature: merchantCode + orderReference + currency + orderAmount + callbackUrl
      const signatureString = `${config.merchantCode}${orderReference}${checkoutData.currency}${checkoutData.orderAmount}${checkoutData.callbackUrl}`;
      checkoutData.signature = crypto
        .createHash("sha256")
        .update(signatureString)
        .digest("hex");

      // Store checkout data for redirect
      payment.equityDetails.checkoutData = checkoutData;
      await payment.save();

      res.json({
        success: true,
        message:
          "Equity payment initiated successfully. Redirecting to payment gateway...",
        data: {
          paymentId: payment._id,
          orderReference,
          checkoutUrl: "https://v3-uat.jengapgw.io/processPayment", // UAT URL
          checkoutData,
        },
      });
    } catch (jengaError) {
      console.error(
        "Jenga payment initiation error:",
        jengaError.response?.data || jengaError.message
      );

      res.status(500).json({
        success: false,
        message: "Failed to initiate Equity payment",
        error:
          jengaError.response?.data?.message || "Jenga service unavailable",
      });
    }
  } catch (error) {
    console.error("Initiate Equity payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Handle Equity Bank payment callback
// @route   POST /api/fees/payments/equity/callback/:paymentId
// @access  Public (Jenga callback)
const handleEquityCallback = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const callbackData = req.body;

    console.log("=== JENGA M-PESA STK PUSH CALLBACK RECEIVED ===");
    console.log("Payment ID from URL params:", paymentId);
    console.log("Full callback data:", JSON.stringify(callbackData, null, 2));
    console.log("Transaction object:", callbackData.transaction);
    console.log("Transaction reference:", callbackData.transaction?.reference);
    console.log("Root level reference:", callbackData.reference);
    console.log("Root level transactionRef:", callbackData.transactionRef);

    // For Jenga callback, we need to find payment by orderReference or transactionRef
    // Jenga callback structure: { callbackType, customer, transaction, bank }
    let payment;

    // Try to find payment using different reference fields
    if (callbackData.transaction && callbackData.transaction.reference) {
      console.log(
        "Searching by transaction.reference:",
        callbackData.transaction.reference
      );
      // Find by transaction reference (from Jenga callback)
      payment = await Payment.findOne({
        "equityDetails.orderReference": callbackData.transaction.reference,
      });
      console.log("Payment found by transaction.reference:", payment?._id);
    } else if (callbackData.reference) {
      console.log("Searching by root reference:", callbackData.reference);
      // Find by orderReference (fallback)
      payment = await Payment.findOne({
        "equityDetails.orderReference": callbackData.reference,
      });
      console.log("Payment found by reference:", payment?._id);
    } else if (callbackData.transactionRef) {
      console.log("Searching by transactionRef:", callbackData.transactionRef);
      // Find by transactionRef (fallback)
      payment = await Payment.findOne({
        "equityDetails.transactionRef": callbackData.transactionRef,
      });
      console.log("Payment found by transactionRef:", payment?._id);
    } else if (paymentId && paymentId !== "undefined") {
      console.log("Searching by paymentId from URL:", paymentId);
      // Fallback to paymentId from URL
      payment = await Payment.findById(paymentId);
      console.log("Payment found by paymentId:", payment?._id);
    }

    if (!payment) {
      console.error("===== PAYMENT NOT FOUND =====");
      console.error("Searched using:");
      console.error(
        "- transaction.reference:",
        callbackData.transaction?.reference
      );
      console.error("- root reference:", callbackData.reference);
      console.error("- transactionRef:", callbackData.transactionRef);
      console.error("- paymentId:", paymentId);
      console.error(
        "Full callback data:",
        JSON.stringify(callbackData, null, 2)
      );

      // Let's also check what payments exist with similar references
      const allRecentPayments = await Payment.find({
        method: "equity",
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }).select(
        "_id equityDetails.orderReference equityDetails.transactionRef createdAt"
      );
      console.error(
        "Recent Equity payments in DB:",
        JSON.stringify(allRecentPayments, null, 2)
      );

      return res.status(404).json({
        error: "Payment not found",
        debug: {
          searchedBy: {
            transactionReference: callbackData.transaction?.reference,
            reference: callbackData.reference,
            transactionRef: callbackData.transactionRef,
            paymentId,
          },
        },
      });
    }

    console.log("Found payment:", payment._id);

    // Update payment with callback data
    payment.equityDetails.callbackReceived = true;
    payment.equityDetails.callbackData = callbackData;

    // Extract callback parameters from Jenga callback format
    // Jenga callback structure: { callbackType, customer, transaction: {...}, bank }
    const transaction = callbackData.transaction || {};
    const {
      reference: transactionRef,
      status,
      amount,
      date: transactionDate,
      paymentMode,
      billNumber,
      serviceCharge,
      orderAmount,
      remarks,
      ...otherTransactionData
    } = transaction;

    // Check if payment was successful
    // Jenga status might be "SUCCESS", "COMPLETED", or similar
    // Failed statuses: "FAILED", "ERROR", "DECLINED", "CANCELLED", "TIMEOUT", etc.
    const isSuccessful =
      status === "SUCCESS" || status === "COMPLETED" || status === "success";

    if (isSuccessful) {
      // Payment successful
      console.log("Jenga payment successful");

      payment.equityDetails.transactionRef = transactionRef;
      payment.equityDetails.transactionDate = transactionDate || new Date();
      payment.equityDetails.paymentMode = paymentMode;
      payment.equityDetails.billNumber = billNumber;
      payment.equityDetails.serviceCharge = serviceCharge;
      payment.equityDetails.confirmedAmount =
        parseFloat(amount) || payment.amount;
      payment.equityDetails.status = status;
      payment.equityDetails.remarks = remarks;
      payment.status = "completed";
      payment.verificationStatus = "verified";
      payment.verificationDate = new Date();

      // Update student fees balance
      await updateStudentFeesAfterPayment(payment, transactionRef);

      // Update Fee record balance
      if (payment.feeId) {
        const fee = await Fee.findById(payment.feeId);
        if (fee) {
          fee.amountPaid += payment.amount;
          await fee.save();
          console.log("Fee record updated:", {
            feeId: fee._id,
            newAmountPaid: fee.amountPaid,
          });
        }
      }

      // Handle course enrollment payments
      if (payment.courseId) {
        const { Enrollment, ECourse } = require("../models/elearning");

        const course = await ECourse.findById(payment.courseId);
        if (course) {
          const enrollmentData = {
            studentId: payment.studentId,
            courseId: payment.courseId,
            branchId: payment.branchId,
            enrollmentType: course.registration.type,
            status: "active",
          };

          const enrollment = new Enrollment(enrollmentData);
          await enrollment.save();

          console.log(
            "Course enrollment created after successful Equity payment:",
            {
              enrollmentId: enrollment._id,
              studentId: payment.studentId,
              courseId: payment.courseId,
            }
          );
        }
      }
    } else {
      // Payment failed
      console.log("Jenga M-Pesa STK Push payment failed:", status);
      console.log(
        "Full callback data for failed payment:",
        JSON.stringify(callbackData, null, 2)
      );
      payment.status = "failed";
      payment.equityDetails.status = status || "FAILED";
      payment.equityDetails.failureReason =
        transaction?.message ||
        transaction?.error ||
        callbackData.message ||
        callbackData.error ||
        callbackData?.transaction?.message ||
        callbackData?.transaction?.error ||
        "Payment failed";
      console.log(
        "Extracted failure reason:",
        payment.equityDetails.failureReason
      );
    }

    await payment.save();

    // Send payment status notification
    try {
      const notificationService = require("../services/notificationService");
      const pushController = require("./pushController");
      const student = await Student.findById(payment.studentId).populate(
        "userId"
      );

      if (student) {
        let description = "Fee payment via Equity Bank";
        if (payment.courseId) {
          const course = await require("../models/elearning").ECourse.findById(
            payment.courseId
          );
          description = course
            ? `Course: ${course.title}`
            : "Course enrollment";
        } else if (payment.feeId) {
          const fee = await Fee.findById(payment.feeId);
          description = fee ? `Fee: ${fee.feeType}` : "Fee payment";
        }

        // Send in-app notification
        await notificationService.notifyPaymentStatus({
          userId: student.userId._id,
          paymentId: payment._id,
          amount: `KES ${payment.amount}`,
          status: payment.status,
          description,
          actionUrl:
            payment.status === "completed"
              ? `/student/payments/${payment._id}/receipt`
              : `/student/payments/${payment._id}`,
        });

        // Send push notification
        if (payment.status === "completed") {
          const {
            storeNotificationAsNotice,
          } = require("../utils/notificationStorage");
          const payload = {
            title: "✅ Payment Successful",
            body: `Your payment of KES ${payment.amount.toLocaleString()} has been received`,
            icon: "/logo.png",
            tag: `payment-success-${payment._id}`,
            type: "payment-success",
            paymentId: payment._id.toString(),
            amount: payment.amount,
            url: `/student/payments/${payment._id}/receipt`,
          };

          // Store as notice
          await storeNotificationAsNotice({
            userIds: [student.userId._id],
            title: payload.title,
            content: payload.body,
            type: "info",
            priority: "high",
            branchId: student.branchId,
            targetAudience: "students",
          });

          await pushController.sendNotification([student.userId._id], payload);
          console.log(
            `[Payment] Sent success notification to student ${student.userId._id}`
          );
        } else if (payment.status === "failed") {
          const {
            storeNotificationAsNotice,
          } = require("../utils/notificationStorage");
          const payload = {
            title: "❌ Payment Failed",
            body: `Your payment of KES ${payment.amount.toLocaleString()} was not successful`,
            icon: "/logo.png",
            tag: `payment-failed-${payment._id}`,
            type: "payment-failed",
            paymentId: payment._id.toString(),
            amount: payment.amount,
            url: `/student/payments/${payment._id}`,
          };

          // Store as notice
          await storeNotificationAsNotice({
            userIds: [student.userId._id],
            title: payload.title,
            content: payload.body,
            type: "urgent",
            priority: "high",
            branchId: student.branchId,
            targetAudience: "students",
          });

          await pushController.sendNotification([student.userId._id], payload);
          console.log(
            `[Payment] Sent failure notification to student ${student.userId._id}`
          );
        }
      }
    } catch (notifError) {
      console.error("Error sending Equity payment notification:", notifError);
    }

    // Return JSON response for Jenga callback
    res.json({
      success: true,
      message: "Callback processed successfully",
      paymentId: payment._id,
      status: payment.status,
      transactionRef: payment.equityDetails.transactionRef,
    });
  } catch (error) {
    console.error("Jenga callback error:", error);
    res.status(500).json({
      success: false,
      message: "Callback processing failed",
      error: error.message,
    });
  }
};

// @desc    Initiate Equity Bank payment via M-Pesa STK Push (settles to Equity account)
// @route   POST /api/fees/payments/student/equity/initiate
// @access  Private (Student, Admin, Secretary)
const initiateStudentEquityPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { amount, phoneNumber, studentId } = req.body;

    // Determine which student to process payment for
    let student;
    if (studentId) {
      // Secretary initiating payment for a specific student
      student = await Student.findById(studentId)
        .populate("courses")
        .populate({
          path: "currentClassId",
          populate: {
            path: "branchId",
            select: "name",
          },
        });
    } else {
      // Student making their own payment
      student = await Student.findOne({ userId: req.user._id })
        .populate("courses")
        .populate({
          path: "currentClassId",
          populate: {
            path: "branchId",
            select: "name",
          },
        });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    // Check if student has outstanding balance
    if (!student.fees || student.fees.totalBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: "No outstanding fees to pay",
      });
    }

    // Validate payment amount
    if (amount <= 0 || amount > student.fees.totalBalance) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment amount. Outstanding balance is ${student.fees.totalBalance}`,
      });
    }

    // Validate phone number
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required for M-Pesa payment",
      });
    }

    // Format phone number (ensure it starts with country code)
    const formattedPhone = validateAndFormatPhone(phoneNumber);

    try {
      const config = getJengaConfig();
      const accessToken = await getJengaAccessToken();

      // Generate unique order reference (alphanumeric only, no special characters)
      const orderReference = `EQ${student.studentId}${Date.now()}`;

      // Create payment record
      const receiptNumber = `RCP${Date.now()}${Math.random()
        .toString(36)
        .substr(2, 4)
        .toUpperCase()}`;

      const payment = new Payment({
        branchId: req.user.branchId,
        studentId: student._id,
        amount,
        paymentMethod: "equity",
        status: "pending",
        description: "Student Fee Payment via Equity M-Pesa STK Push",
        receiptNumber,
        equityDetails: {
          orderReference,
        },
        recordedBy: req.user._id,
      });

      await payment.save();

      // Get customer details from student info (since this is student payment)
      const customerDetails = {
        firstName: student.userId.firstName || "Unknown",
        lastName: student.userId.lastName || "Student",
        email: student.userId.email || "student@example.com",
        phone: student.phone || phoneNumber || "",
      }; // Prepare Jenga M-Pesa STK Push request according to correct API documentation
      const stkPushData = {
        order: {
          orderReference: orderReference,
          orderAmount: amount,
          orderCurrency: "KES",
          source: "APICHECKOUT",
          countryCode: "KE",
          description: "Student Fee Payment",
        },
        customer: {
          name: customerDetails.firstName + " " + customerDetails.lastName,
          email: customerDetails.email,
          phoneNumber: formattedPhone, // Use the formatted phone for payment
          identityNumber: student.studentId, // Use student ID as identity number
          firstAddress: "",
          secondAddress: "",
        },
        payment: {
          paymentReference: `MKQR${orderReference}`,
          paymentCurrency: "KES",
          channel: "MOBILE",
          service: "MPESA",
          provider: "JENGA",
          callbackUrl: config.callbackUrl,
          details: {
            msisdn: formattedPhone,
            paymentAmount: amount,
          },
        },
      };

      // Generate RSA signature for STK Push using correct formula:
      // order.orderReference + payment.paymentCurrency + payment.details.msisdn + payment.details.paymentAmount
      const signatureString = `${stkPushData.order.orderReference}${stkPushData.payment.paymentCurrency}${stkPushData.payment.details.msisdn}${stkPushData.payment.details.paymentAmount}`;
      console.log("=== SIGNATURE DEBUG ===");
      console.log("Order Reference:", stkPushData.order.orderReference);
      console.log("Payment Currency:", stkPushData.payment.paymentCurrency);
      console.log("MSISDN:", stkPushData.payment.details.msisdn);
      console.log("Payment Amount:", stkPushData.payment.details.paymentAmount);
      console.log("Signature String:", signatureString);
      const signature = generateJengaSignature(signatureString);
      console.log("Generated RSA Signature:", signature);
      console.log("=======================");

      console.log("Using Jenga access token for STK push:", accessToken);
      console.log("STK Push headers:", {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Signature: signature,
      });

      // Make Jenga STK Push request using correct endpoint
      const stkPushUrl = `${config.baseUrl}/api-checkout/mpesa-stk-push/v3.0/init`;
      console.log("Jenga STK Push endpoint:", stkPushUrl);

      let stkResponse;
      try {
        stkResponse = await axios.post(stkPushUrl, stkPushData, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Signature: signature,
          },
        });
        console.log("Successful STK Push response:", stkResponse.data);
      } catch (err) {
        console.error(
          "STK Push failed:",
          err.response?.status,
          err.response?.data || err.message
        );
        payment.status = "failed";
        payment.equityDetails.error = {
          message: err.response?.data?.message || err.message,
          status: err.response?.status,
        };
        await payment.save();

        return res.status(502).json({
          success: false,
          message: "Failed to initiate M-Pesa payment",
          error: err.response?.data?.message || err.message,
        });
      }

      // Successful request - update payment record
      payment.equityDetails.stkPushResponse = stkResponse.data;
      if (stkResponse.data.data?.paymentReference) {
        payment.equityDetails.transactionRef =
          stkResponse.data.data.paymentReference;
      }
      await payment.save();

      res.json({
        success: true,
        message:
          stkResponse.data.message ||
          "M-Pesa STK Push initiated successfully. Check your phone to complete payment.",
        data: {
          paymentId: payment._id,
          orderReference,
          paymentReference: stkResponse.data.data?.paymentReference,
          invoiceNumber: stkResponse.data.data?.invoiceNumber,
          amount: stkResponse.data.data?.amount,
          charge: stkResponse.data.data?.charge,
          amountDebited: stkResponse.data.data?.amountDebited,
        },
      });
    } catch (jengaError) {
      console.error(
        "Jenga M-Pesa STK Push error:",
        jengaError.response?.data || jengaError.message
      );

      res.status(500).json({
        success: false,
        message: "Failed to initiate M-Pesa payment",
        error:
          jengaError.response?.data?.errorMessage ||
          jengaError.response?.data?.message ||
          "M-Pesa service unavailable",
      });
    }
  } catch (error) {
    console.error("Initiate student Equity payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Record manual payment
// @route   POST /api/payments/manual
// @access  Private (Admin, Secretary)
const recordManualPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      feeId,
      amount,
      paymentMethod,
      paymentDate,
      referenceNumber,
      bankName,
      chequeNumber,
      depositorName,
      notes,
    } = req.body;

    // Validate fee exists and belongs to the user's branch
    const fee = await Fee.findOne({
      _id: feeId,
      branchId: req.user.branchId,
    }).populate("studentId", "studentId userId");

    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    // Validate payment amount
    if (amount <= 0 || amount > fee.balance) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    // Create payment record
    const payment = new Payment({
      branchId: req.user.branchId,
      feeId: fee._id,
      studentId: fee.studentId._id,
      amount,
      paymentMethod,
      paymentDate: paymentDate || new Date(),
      status: "completed",
      verificationStatus: "verified", // Secretary-recorded payments are automatically verified
      manualPaymentDetails: {
        referenceNumber,
        bankName,
        chequeNumber,
        depositorName,
        notes,
      },
      recordedBy: req.user._id,
    });

    await payment.save();

    // Update fee balance
    fee.amountPaid += amount;
    await fee.save();

    await payment.populate("studentId", "studentId userId");
    await payment.populate("studentId.userId", "firstName lastName");

    res.status(201).json({
      success: true,
      message: "Manual payment recorded successfully",
      data: payment,
    });
  } catch (error) {
    console.error("Record manual payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Verify payment
// @route   PUT /api/payments/:paymentId/verify
// @access  Private (Admin)
const verifyPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { verificationNotes } = req.body;

    const payment = await Payment.findOne({
      _id: paymentId,
      branchId: req.user.branchId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    payment.verificationStatus = "verified";
    payment.verifiedBy = req.user._id;
    payment.verificationDate = new Date();
    payment.verificationNotes = verificationNotes;

    await payment.save();

    res.json({
      success: true,
      message: "Payment verified successfully",
      data: payment,
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    console.log("=== GET PAYMENT STATUS ===");
    console.log("Payment ID:", paymentId);
    console.log("User:", req.user._id);
    console.log("User roles:", req.user.roles);
    console.log("User branchId:", req.user.branchId);

    let paymentQuery = { _id: paymentId };

    // For non-superadmin users, filter by branch
    if (!req.user.roles.includes("superadmin")) {
      if (req.user.roles.includes("student")) {
        // For students, we'll check ownership later, so don't filter by branch here
        // They might access payments from their branch or course payments
      } else {
        // For other users, filter by branch
        paymentQuery.branchId = req.user.branchId;
      }
    }

    const payment = await Payment.findOne(paymentQuery)
      .populate({
        path: "studentId",
        select: "studentId userId",
        populate: {
          path: "userId",
          select: "firstName lastName",
        },
      })
      .populate("feeId", "academicYear academicTerm");

    console.log("Payment query:", paymentQuery);
    console.log("Found payment:", payment ? payment._id : "null");

    console.log("Found payment:", payment._id, "status:", payment.status);

    console.log("=== PAYMENT STATUS DEBUG ===");
    console.log("Payment ID:", payment._id);
    console.log("Payment studentId:", payment.studentId?._id);
    console.log("Payment branchId:", payment.branchId);
    console.log("User roles:", req.user.roles);
    console.log("User studentProfile:", req.user.studentProfile);
    console.log("User ID:", req.user._id);
    console.log("User object keys:", Object.keys(req.user));
    console.log("User branchId:", req.user.branchId);
    console.log(
      "Are studentIds equal?",
      req.user.studentProfile?.toString() === payment.studentId?._id?.toString()
    );
    console.log("============================");

    // Check authorization for students
    // Fix: Check if user ID matches the student's userId instead of studentProfile
    if (req.user.roles.includes("student")) {
      console.log("Checking student authorization...");
      console.log("Payment studentId:", payment.studentId._id);
      // For student users, check if this payment belongs to them
      // We need to check if payment.studentId.userId matches req.user._id
      const student = await Student.findById(payment.studentId).populate(
        "userId"
      );
      console.log("Found student:", student ? student._id : "null");
      console.log("Student userId:", student?.userId?._id);
      console.log("Student userId string:", student?.userId?._id?.toString());
      console.log("Request userId:", req.user._id);
      console.log("Request userId string:", req.user._id?.toString());
      if (
        !student ||
        student.userId._id.toString() !== req.user._id.toString()
      ) {
        console.log("Student authorization failed");
        return res.status(403).json({
          success: false,
          message: "Access denied - Payment does not belong to this student",
        });
      }
      console.log("Student authorization passed");
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("Get payment status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get payment history for a fee
// @route   GET /api/payments/fee/:feeId
// @access  Private
const getFeePaymentHistory = async (req, res) => {
  try {
    const { feeId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Validate fee access
    const fee = await Fee.findOne({
      _id: feeId,
      branchId: req.user.branchId,
    });

    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    // Check authorization for students
    if (
      req.user.roles.includes("student") &&
      req.user.studentProfile?.toString() !== fee.studentId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const payments = await Payment.find({
      feeId,
      branchId: req.user.branchId,
    })
      .populate("recordedBy", "firstName lastName")
      .populate("verifiedBy", "firstName lastName")
      .sort({ paymentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments({
      feeId,
      branchId: req.user.branchId,
    });

    res.json({
      success: true,
      data: payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get fee payment history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      studentId,
      feeId,
      paymentMethod,
      status,
      startDate,
      endDate,
      search,
    } = req.query;

    // Build query
    const query = {
      branchId: req.user.branchId,
    };

    // Add filters
    if (studentId) {
      query.studentId = studentId;
    }

    if (feeId) {
      query.feeId = feeId;
    }

    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) {
        query.paymentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.paymentDate.$lte = new Date(endDate);
      }
    }

    if (search) {
      // Search in payment reference or notes
      query.$or = [
        { reference: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    // Check authorization for students
    if (req.user.roles.includes("student")) {
      query.studentId = req.user.studentProfile;
    }

    const payments = await Payment.find(query)
      .populate("studentId", "firstName lastName admissionNumber")
      .populate("feeId", "feeType amount")
      .populate("recordedBy", "firstName lastName")
      .populate("verifiedBy", "firstName lastName")
      .sort({ paymentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getUnpaidStudents = async (req, res) => {
  try {
    const branchId = req.user.branchId;
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Get all students with installment plans
    const Student = mongoose.model("Student");
    const students = await Student.find({
      branchId,
      "fees.installmentPlan.enabled": true,
      courses: { $exists: true, $ne: [] },
    }).populate("userId", "firstName lastName email");

    const unpaidStudents = [];

    for (const student of students) {
      // Skip students without userId (incomplete records)
      if (!student.userId) {
        continue;
      }

      const installmentPlan = student.fees.installmentPlan;

      if (!installmentPlan.schedule || installmentPlan.schedule.length === 0) {
        continue;
      }

      // Get ALL unpaid installments (regardless of due date)
      const allUnpaidInstallments = installmentPlan.schedule.filter(
        (installment) => installment.status !== "paid"
      );

      if (allUnpaidInstallments.length === 0) {
        continue; // Skip students with no unpaid installments
      }

      // Find the current installment (next unpaid that is due or overdue)
      const dueOrOverdueInstallments = allUnpaidInstallments.filter(
        (installment) => {
          const dueDate = new Date(installment.dueDate);
          return dueDate <= currentDate; // Due today or overdue
        }
      );

      // If no overdue installments, get the next upcoming unpaid installment
      const currentInstallment =
        dueOrOverdueInstallments.length > 0
          ? dueOrOverdueInstallments.sort(
              (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
            )[0]
          : allUnpaidInstallments.sort(
              (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
            )[0];

      // Only show students with at least one installment due or overdue
      if (dueOrOverdueInstallments.length > 0) {
        // Calculate days overdue for the current installment
        const dueDate = new Date(currentInstallment.dueDate);
        const daysOverdue = Math.max(
          0,
          Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24))
        );

        // Total outstanding is the remaining balance (totalBalance from student.fees)
        // This represents: totalFeeStructure - totalPaid
        const totalOutstanding = student.fees.totalBalance || 0;

        unpaidStudents.push({
          _id: student._id,
          studentId: student.studentId,
          firstName: student.userId.firstName,
          lastName: student.userId.lastName,
          currentInstallment: {
            installmentNumber: currentInstallment.installmentNumber,
            amount: currentInstallment.amount,
            dueDate: currentInstallment.dueDate,
            status: currentInstallment.status,
          },
          totalOutstanding,
          daysOverdue,
        });
      }
    }

    res.json({
      success: true,
      data: unpaidStudents,
    });
  } catch (error) {
    console.error("Get unpaid students error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const sendPaymentReminders = async (req, res) => {
  try {
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Student IDs are required",
      });
    }

    const branchId = req.user.branchId;
    const Student = mongoose.model("Student");
    const Notice = mongoose.model("Notice");

    // Get students
    const students = await Student.find({
      _id: { $in: studentIds },
      branchId,
    }).populate("userId", "firstName lastName email");

    const remindersSent = [];

    for (const student of students) {
      try {
        // Get current unpaid installment
        const installmentPlan = student.fees.installmentPlan;
        const currentDate = new Date();

        const unpaidInstallments = installmentPlan.schedule.filter(
          (inst) => inst.status !== "paid"
        );

        if (unpaidInstallments.length === 0) continue;

        // Get the current installment that is due or overdue
        const dueOrOverdueInstallments = unpaidInstallments.filter(
          (installment) => {
            const dueDate = new Date(installment.dueDate);
            return dueDate <= currentDate; // Due today or overdue
          }
        );

        // If no overdue installments, get the next upcoming unpaid installment
        const currentInstallment =
          dueOrOverdueInstallments.length > 0
            ? dueOrOverdueInstallments.sort(
                (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
              )[0]
            : unpaidInstallments.sort(
                (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
              )[0];

        // Get the actual remaining balance (totalBalance)
        const totalOutstanding = student.fees.totalBalance || 0;

        // Create payment reminder notice
        const notice = new Notice({
          title: "Payment Reminder - Installment Due",
          content: `Dear ${student.userId.firstName} ${student.userId.lastName},

This is a reminder that your installment payment is due.

Installment Details:
- Installment ${currentInstallment.installmentNumber}
- Amount: KES ${currentInstallment.amount.toLocaleString()}
- Due Date: ${new Date(currentInstallment.dueDate).toLocaleDateString()}

Please make the payment before the due date to avoid late fees.

Total Outstanding Balance: KES ${totalOutstanding.toLocaleString()}

Thank you,
${req.user.firstName} ${req.user.lastName}
Secretary`,
          type: "fee_reminder",
          priority: "high",
          // No targetAudience set - specificRecipients controls visibility
          specificRecipients: [student.userId._id],
          branchId,
          author: {
            userId: req.user.id,
            name: `${req.user.firstName} ${req.user.lastName}`,
            role: req.user.roles[0],
          },
          publishDate: new Date(),
          isActive: true,
        });

        await notice.save();
        remindersSent.push({
          studentId: student._id,
          studentName: `${student.userId.firstName} ${student.userId.lastName}`,
          installmentNumber: currentInstallment.installmentNumber,
          amount: currentInstallment.amount,
          dueDate: currentInstallment.dueDate,
        });
      } catch (error) {
        console.error(
          `Error sending reminder to student ${student._id}:`,
          error
        );
      }
    }

    res.json({
      success: true,
      message: `Reminders sent to ${remindersSent.length} students`,
      data: remindersSent,
    });
  } catch (error) {
    console.error("Send payment reminders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  initiateEquityPayment,
  initiateStudentEquityPayment,
  handleEquityCallback,
  recordManualPayment,
  verifyPayment,
  getPaymentStatus,
  getFeePaymentHistory,
  getPayments,
  getUnpaidStudents,
  sendPaymentReminders,
};
