const Fee = require("../models/Fee");
const FeeStructure = require("../models/FeeStructure");
const Payment = require("../models/Payment");

// Middleware to validate fee access permissions
const validateFeeAccess = async (req, res, next) => {
  try {
    const { feeId } = req.params;

    if (!feeId) {
      return res.status(400).json({
        success: false,
        message: "Fee ID is required",
      });
    }

    const fee = await Fee.findOne({
      _id: feeId,
      branchId: req.user.branchId,
    }).populate("studentId", "userId");

    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee record not found",
      });
    }

    // Check if student is trying to access their own fee
    if (req.user.roles.includes("student")) {
      if (
        req.user.studentProfile?.toString() !== fee.studentId._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only access your own fee records",
        });
      }
    }

    req.fee = fee;
    next();
  } catch (error) {
    console.error("Validate fee access error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Middleware to validate payment access permissions
const validatePaymentAccess = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "Payment ID is required",
      });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      branchId: req.user.branchId,
    }).populate("studentId", "userId");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Check if student is trying to access their own payment
    if (req.user.roles.includes("student")) {
      if (
        req.user.studentProfile?.toString() !== payment.studentId._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only access your own payment records",
        });
      }
    }

    req.payment = payment;
    next();
  } catch (error) {
    console.error("Validate payment access error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Middleware to validate fee structure permissions
const validateFeeStructureAccess = async (req, res, next) => {
  try {
    const { feeStructureId } = req.params;

    if (!feeStructureId) {
      return res.status(400).json({
        success: false,
        message: "Fee structure ID is required",
      });
    }

    const feeStructure = await FeeStructure.findOne({
      _id: feeStructureId,
      branchId: req.user.branchId,
    });

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    req.feeStructure = feeStructure;
    next();
  } catch (error) {
    console.error("Validate fee structure access error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Middleware to validate payment amount
const validatePaymentAmount = async (req, res, next) => {
  try {
    const { amount, feeId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    if (feeId) {
      const fee = await Fee.findOne({
        _id: feeId,
        branchId: req.user.branchId,
      });

      if (fee && amount > fee.balance) {
        return res.status(400).json({
          success: false,
          message: "Payment amount cannot exceed the outstanding balance",
        });
      }
    }

    next();
  } catch (error) {
    console.error("Validate payment amount error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Middleware to check if fee is payable
const validateFeePayable = async (req, res, next) => {
  try {
    const { feeId } = req.body;

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

    if (fee.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Fee is already fully paid",
      });
    }

    if (fee.status === "waived") {
      return res.status(400).json({
        success: false,
        message: "Fee has been waived and cannot be paid",
      });
    }

    if (fee.balance <= 0) {
      return res.status(400).json({
        success: false,
        message: "No outstanding balance for this fee",
      });
    }

    req.fee = fee;
    next();
  } catch (error) {
    console.error("Validate fee payable error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Middleware to validate M-Pesa phone number format
const validateMpesaPhoneNumber = (req, res, next) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      message: "Phone number is required for M-Pesa payments",
    });
  }

  // Remove leading +254 or 0, ensure it starts with 254
  const formattedPhone = phoneNumber.replace(/^\+?254|^0/, "254");

  // Validate Kenyan phone number format
  if (!/^254[17]\d{8}$/.test(formattedPhone)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid Kenyan phone number format. Use format: +254XXXXXXXXX or 07XXXXXXXX",
    });
  }

  req.body.phoneNumber = formattedPhone;
  next();
};

// Middleware to check duplicate payments
const checkDuplicatePayment = async (req, res, next) => {
  try {
    const { feeId, amount, paymentMethod } = req.body;

    // Check for duplicate payments in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const duplicatePayment = await Payment.findOne({
      feeId,
      amount,
      paymentMethod,
      createdAt: { $gte: fiveMinutesAgo },
      status: { $in: ["pending", "processing", "completed"] },
    });

    if (duplicatePayment) {
      return res.status(400).json({
        success: false,
        message: "Duplicate payment detected. Please wait before retrying",
      });
    }

    next();
  } catch (error) {
    console.error("Check duplicate payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  validateFeeAccess,
  validatePaymentAccess,
  validateFeeStructureAccess,
  validatePaymentAmount,
  validateFeePayable,
  validateMpesaPhoneNumber,
  checkDuplicatePayment,
};
