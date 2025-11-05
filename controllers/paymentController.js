const Payment = require("../models/Payment");
const Fee = require("../models/Fee");
const Student = require("../models/Student");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const axios = require("axios");
const crypto = require("crypto");
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
  if (!student || !student.fees) return;

  const oldBalance = student.fees.totalBalance;
  student.fees.totalBalance -= payment.amount;

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
  }

  await student.save();

  console.log("Student fees updated:", {
    studentId: student.studentId,
    oldBalance,
    newBalance: student.fees.totalBalance,
    amountPaid: payment.amount,
  });
};

// Jenga Configuration
const getJengaConfig = () => ({
  merchantCode: process.env.JENGA_MERCHANT_CODE,
  consumerSecret: process.env.JENGA_CONSUMER_SECRET,
  apiKey: process.env.JENGA_API_KEY,
  callbackUrl: process.env.JENGA_CALLBACK_URL,
  ipnUrl: process.env.JENGA_IPN_URL,
  accountNumber:
    process.env.JENGA_ACCOUNT_NUMBER || process.env.JENGA_MERCHANT_CODE,
  merchantName: process.env.JENGA_MERCHANT_NAME || "CMS School Management",
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

    // Validate required customer details
    if (
      !customerFirstName ||
      !customerLastName ||
      !customerEmail ||
      !customerPhone
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer details are required for Equity payment",
      });
    }

    // Format phone number (ensure it starts with country code)
    const formattedPhone = validateAndFormatPhone(customerPhone);

    try {
      const config = getJengaConfig();
      const accessToken = await getJengaAccessToken();

      // Generate unique order reference
      const orderReference = `EQ-${fee.studentId.studentId}-${Date.now()}`;

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
    console.log("Payment ID:", paymentId);
    console.log("Callback data:", JSON.stringify(callbackData, null, 2));

    // For Jenga M-Pesa STK Push, we need to find payment by orderReference or transactionRef
    let payment;

    if (callbackData.reference) {
      // Find by orderReference
      payment = await Payment.findOne({
        "equityDetails.orderReference": callbackData.reference,
      });
    } else if (callbackData.transactionRef) {
      // Find by transactionRef
      payment = await Payment.findOne({
        "equityDetails.transactionRef": callbackData.transactionRef,
      });
    } else if (paymentId && paymentId !== "undefined") {
      // Fallback to paymentId from URL
      payment = await Payment.findById(paymentId);
    }

    if (!payment) {
      console.error("Payment not found for callback. Searched by:", {
        reference: callbackData.reference,
        transactionRef: callbackData.transactionRef,
        paymentId,
      });
      return res.status(404).json({ error: "Payment not found" });
    }

    console.log("Found payment:", payment._id);

    // Update payment with callback data
    payment.equityDetails.callbackReceived = true;
    payment.equityDetails.callbackData = callbackData;

    // Extract callback parameters from Jenga M-Pesa STK Push format
    // Jenga callback typically includes: transactionRef, status, amount, etc.
    const {
      transactionRef,
      status,
      amount,
      transactionDate,
      description,
      reference,
      ...otherData
    } = callbackData;

    // Check if payment was successful
    // Jenga status might be "SUCCESS", "COMPLETED", or similar
    const isSuccessful =
      status === "SUCCESS" || status === "COMPLETED" || status === "success";

    if (isSuccessful) {
      // Payment successful
      console.log("Jenga M-Pesa STK Push payment successful");

      payment.equityDetails.transactionRef = transactionRef;
      payment.equityDetails.transactionDate = transactionDate || new Date();
      payment.equityDetails.description = description;
      payment.equityDetails.reference = reference;
      payment.equityDetails.confirmedAmount =
        parseFloat(amount) || payment.amount;
      payment.equityDetails.status = status;
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
      payment.status = "failed";
      payment.equityDetails.status = status || "FAILED";
      payment.equityDetails.failureReason =
        callbackData.message || callbackData.error || "Payment failed";
    }

    await payment.save();

    // Send payment status notification
    try {
      const notificationService = require("../services/notificationService");
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

      // Generate unique order reference
      const orderReference = `EQ-${student.studentId}-${Date.now()}`;

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

      // Prepare Jenga M-Pesa STK Push request according to API documentation
      const stkPushData = {
        merchant: {
          accountNumber: config.accountNumber,
          countryCode: "KE",
          name: config.merchantName,
        },
        payment: {
          ref: orderReference,
          amount: amount.toString(),
          currency: "KES",
          telco: "Safaricom",
          mobileNumber: formattedPhone,
          date: new Date().toISOString().split("T")[0], // YYYY-MM-DD format
          callBackUrl: `${config.callbackUrl}/${payment._id}`,
          pushType: "USSD",
        },
      };

      // Generate HMAC signature for STK Push according to Jenga documentation
      // Formula: merchant.accountNumber + payment.ref + payment.mobileNumber + payment.telco + payment.amount + payment.currency
      const signatureString = `${config.accountNumber}${orderReference}${formattedPhone}${stkPushData.payment.telco}${stkPushData.payment.amount}${stkPushData.payment.currency}`;
      const signature = crypto
        .createHmac("sha256", config.consumerSecret)
        .update(signatureString)
        .digest("base64");

      console.log("Using Jenga access token for STK push:", accessToken);
      console.log("STK Push headers:", {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Merchant-Code": config.merchantCode,
        Signature: signature,
      });

      // Make Jenga STK Push request. Try several known paths used in
      // different Jenga/UAT/production deployments until one succeeds.
      const candidatePaths = ["/v3-apis/payment-api/v3.0/stkussdpush/initiate"];

      let stkResponse = null;
      let endpointUsed = null;

      for (const p of candidatePaths) {
        try {
          const url = `${config.baseUrl}${p}`;
          console.log("Trying Jenga STK Push endpoint:", url);
          stkResponse = await axios.post(url, stkPushData, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              Signature: signature,
            },
          });

          endpointUsed = url;
          console.log("Successful response from", url, stkResponse.data);
          break;
        } catch (err) {
          console.warn(
            `Endpoint ${p} failed:`,
            err.response?.status,
            err.response?.data || err.message
          );
          // try next candidate
        }
      }

      if (!stkResponse) {
        payment.status = "failed";
        payment.equityDetails.error = {
          message: "No working Jenga STK Push endpoint",
        };
        payment.equityDetails.endpointsTried = candidatePaths;
        await payment.save();

        return res.status(502).json({
          success: false,
          message: "Failed to initiate M-Pesa payment",
          error:
            "No working Jenga STK Push endpoint (received 404 Resource not found)",
          attempted: candidatePaths,
        });
      }

      // Successful request
      payment.equityDetails.stkPushResponse = stkResponse.data;
      payment.equityDetails.endpointUsed = endpointUsed;
      if (stkResponse.data.transactionRef) {
        payment.equityDetails.transactionRef = stkResponse.data.transactionRef;
      }
      await payment.save();

      res.json({
        success: true,
        message:
          "M-Pesa STK Push initiated successfully. Check your phone to complete payment.",
        data: {
          paymentId: payment._id,
          orderReference,
          transactionRef: stkResponse.data.transactionRef,
          customerMessage:
            stkResponse.data.message ||
            stkResponse.data.customerMessage ||
            null,
          endpointUsed,
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

// @desc    Handle Equity Bank IPN (Instant Payment Notification)
// @route   POST /api/fees/payments/equity/ipn
// @access  Public (Jenga IPN)
const handleEquityIPN = async (req, res) => {
  try {
    const ipnData = req.body;

    console.log("=== EQUITY IPN RECEIVED ===");
    console.log("IPN data:", JSON.stringify(ipnData, null, 2));

    // Extract IPN details
    const { transaction, customer, bank } = ipnData;
    const { reference: orderReference, status } = transaction;

    // Find payment by order reference
    const payment = await Payment.findOne({
      "equityDetails.orderReference": orderReference,
    });

    if (!payment) {
      console.error("Payment not found for IPN:", orderReference);
      return res.status(404).json({ error: "Payment not found" });
    }

    // Update payment with IPN data
    payment.equityDetails.ipnReceived = true;
    payment.equityDetails.ipnData = ipnData;

    // Update additional details from IPN
    payment.equityDetails.transactionId = transaction.reference;
    payment.equityDetails.transactionDate = transaction.date;
    payment.equityDetails.paymentMode = transaction.paymentMode;
    payment.equityDetails.amount = transaction.amount;
    payment.equityDetails.currency = transaction.currency;
    payment.equityDetails.billNumber = transaction.billNumber;
    payment.equityDetails.serviceCharge = transaction.serviceCharge;
    payment.equityDetails.status = transaction.status;
    payment.equityDetails.remarks = transaction.remarks;

    // Update payment status based on IPN
    if (transaction.status === "SUCCESS") {
      if (payment.status !== "completed") {
        payment.status = "completed";
        payment.verificationStatus = "verified";
        payment.verificationDate = new Date();

        // Update balances if not already done via callback
        if (!payment.equityDetails.callbackReceived) {
          await updateStudentFeesAfterPayment(
            payment,
            transaction.reference,
            true
          );

          // Update Fee record
          if (payment.feeId) {
            const fee = await Fee.findById(payment.feeId);
            if (fee) {
              fee.amountPaid += payment.amount;
              await fee.save();
            }
          }
        }
      }
    } else if (transaction.status === "FAILED") {
      payment.status = "failed";
    }

    await payment.save();

    console.log("Equity IPN processed for payment:", payment._id);

    res.json({ success: true, message: "IPN processed successfully" });
  } catch (error) {
    console.error("Equity IPN error:", error);
    res.status(500).json({ error: "IPN processing failed" });
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
      verificationStatus: "unverified", // Manual payments need verification
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

      // Find installments due this month or overdue
      const currentMonthInstallments = installmentPlan.schedule.filter(
        (installment) => {
          const dueDate = new Date(installment.dueDate);
          const installmentMonth = dueDate.getMonth();
          const installmentYear = dueDate.getFullYear();

          // Include current month and any overdue installments
          return (
            (installmentYear === currentYear &&
              installmentMonth <= currentMonth) ||
            installmentYear < currentYear ||
            (installmentYear === currentYear && installmentMonth < currentMonth)
          );
        }
      );

      // Find unpaid installments
      const unpaidInstallments = currentMonthInstallments.filter(
        (installment) => installment.status !== "paid"
      );

      if (unpaidInstallments.length > 0) {
        // Get the earliest unpaid installment
        const currentInstallment = unpaidInstallments.sort(
          (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
        )[0];

        // Calculate days overdue
        const dueDate = new Date(currentInstallment.dueDate);
        const daysOverdue = Math.max(
          0,
          Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24))
        );

        // Calculate total outstanding
        const totalOutstanding = unpaidInstallments.reduce(
          (sum, inst) => sum + inst.amount,
          0
        );

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
        const unpaidInstallments = installmentPlan.schedule.filter(
          (inst) => inst.status !== "paid"
        );

        if (unpaidInstallments.length === 0) continue;

        const currentInstallment = unpaidInstallments.sort(
          (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
        )[0];

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

Total Outstanding: KES ${unpaidInstallments
            .reduce((sum, inst) => sum + inst.amount, 0)
            .toLocaleString()}

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
  handleEquityIPN,
  recordManualPayment,
  verifyPayment,
  getPaymentStatus,
  getFeePaymentHistory,
  getPayments,
  getUnpaidStudents,
  sendPaymentReminders,
};
