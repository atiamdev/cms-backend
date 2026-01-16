const { validationResult } = require("express-validator");
const Partner = require("../models/Partner");

// @desc    Get active partners for landing page
// @route   GET /api/landing/partners
// @access  Public
const getActivePartners = async (req, res) => {
  try {
    const type = req.query.type; // 'accreditation' or 'partner'
    let partners;

    if (type === "accreditation") {
      partners = await Partner.getActiveAccreditations();
    } else if (type === "partner") {
      partners = await Partner.getActivePartners();
    } else {
      partners = await Partner.getActive();
    }

    res.status(200).json({
      success: true,
      count: partners.length,
      data: partners,
    });
  } catch (error) {
    console.error("Error fetching partners:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching partners",
    });
  }
};

// @desc    Get all partners (admin)
// @route   GET /api/landing/partners/admin
// @access  Private/SuperAdmin
const getAllPartners = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const type = req.query.type;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const partners = await Partner.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const totalItems = await Partner.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      success: true,
      data: partners,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching partners:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching partners",
    });
  }
};

// @desc    Get single partner
// @route   GET /api/landing/partners/:id
// @access  Private/SuperAdmin
const getPartner = async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    res.status(200).json({
      success: true,
      data: partner,
    });
  } catch (error) {
    console.error("Error fetching partner:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching partner",
    });
  }
};

// @desc    Create new partner
// @route   POST /api/landing/partners
// @access  Private/SuperAdmin
const createPartner = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const partner = await Partner.create(req.body);

    res.status(201).json({
      success: true,
      message: "Partner created successfully",
      data: partner,
    });
  } catch (error) {
    console.error("Error creating partner:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating partner",
    });
  }
};

// @desc    Update partner
// @route   PUT /api/landing/partners/:id
// @access  Private/SuperAdmin
const updatePartner = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const partner = await Partner.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Partner updated successfully",
      data: partner,
    });
  } catch (error) {
    console.error("Error updating partner:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating partner",
    });
  }
};

// @desc    Delete partner
// @route   DELETE /api/landing/partners/:id
// @access  Private/SuperAdmin
const deletePartner = async (req, res) => {
  try {
    const partner = await Partner.findByIdAndDelete(req.params.id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Partner deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting partner:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting partner",
    });
  }
};

// @desc    Update partner order
// @route   PATCH /api/landing/partners/:id/order
// @access  Private/SuperAdmin
const updatePartnerOrder = async (req, res) => {
  try {
    const { displayOrder } = req.body;

    if (typeof displayOrder !== "number" || displayOrder < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid display order",
      });
    }

    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { displayOrder },
      { new: true }
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Partner display order updated successfully",
      data: partner,
    });
  } catch (error) {
    console.error("Error updating partner order:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating partner order",
    });
  }
};

// @desc    Activate partner
// @route   PATCH /api/landing/partners/:id/activate
// @access  Private/SuperAdmin
const activatePartner = async (req, res) => {
  try {
    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { status: "active" },
      { new: true }
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Partner activated successfully",
      data: partner,
    });
  } catch (error) {
    console.error("Error activating partner:", error);
    res.status(500).json({
      success: false,
      message: "Server error while activating partner",
    });
  }
};

// @desc    Deactivate partner
// @route   PATCH /api/landing/partners/:id/deactivate
// @access  Private/SuperAdmin
const deactivatePartner = async (req, res) => {
  try {
    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { status: "inactive" },
      { new: true }
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Partner deactivated successfully",
      data: partner,
    });
  } catch (error) {
    console.error("Error deactivating partner:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deactivating partner",
    });
  }
};

module.exports = {
  getActivePartners,
  getAllPartners,
  getPartner,
  createPartner,
  updatePartner,
  deletePartner,
  updatePartnerOrder,
  activatePartner,
  deactivatePartner,
};
