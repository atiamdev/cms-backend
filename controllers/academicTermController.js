const AcademicTerm = require("../models/AcademicTerm");
const { validationResult } = require("express-validator");

// @desc    Get all academic terms
// @route   GET /api/academic-terms
// @access  Private
const getAcademicTerms = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      academicYear,
      status,
      isActive,
      isCurrent,
    } = req.query;

    const query = {};

    if (academicYear) query.academicYear = academicYear;
    if (status) query.status = status;
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (isCurrent !== undefined) query.isCurrent = isCurrent === "true";

    const terms = await AcademicTerm.find(query)
      .populate("createdBy", "firstName lastName")
      .populate("lastModifiedBy", "firstName lastName")
      .sort({ academicYear: -1, startDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AcademicTerm.countDocuments(query);

    res.json({
      success: true,
      data: terms,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get academic terms error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get single academic term
// @route   GET /api/academic-terms/:id
// @access  Private
const getAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findById(req.params.id)
      .populate("createdBy", "firstName lastName")
      .populate("lastModifiedBy", "firstName lastName");

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "Academic term not found",
      });
    }

    res.json({
      success: true,
      data: term,
    });
  } catch (error) {
    console.error("Get academic term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get active academic term
// @route   GET /api/academic-terms/active
// @access  Private
const getActiveTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.getActiveTerm();

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "No active academic term found",
      });
    }

    res.json({
      success: true,
      data: term,
    });
  } catch (error) {
    console.error("Get active term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Get current academic term
// @route   GET /api/academic-terms/current
// @access  Private
const getCurrentTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.getCurrentTerm();

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "No current academic term found",
      });
    }

    res.json({
      success: true,
      data: term,
    });
  } catch (error) {
    console.error("Get current term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Create academic term
// @route   POST /api/academic-terms
// @access  Private (Super Admin only)
const createAcademicTerm = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { name, code, academicYear, startDate, endDate, description } =
      req.body;

    // Check if term with same code already exists for this academic year
    const existingTerm = await AcademicTerm.findOne({ code, academicYear });
    if (existingTerm) {
      return res.status(400).json({
        success: false,
        message: "Academic term with this code already exists for this year",
      });
    }

    // Validate dates
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    const term = new AcademicTerm({
      name,
      code,
      academicYear,
      startDate,
      endDate,
      description,
      createdBy: req.user._id,
    });

    await term.save();

    await term.populate("createdBy", "firstName lastName");

    res.status(201).json({
      success: true,
      message: "Academic term created successfully",
      data: term,
    });
  } catch (error) {
    console.error("Create academic term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Update academic term
// @route   PUT /api/academic-terms/:id
// @access  Private (Super Admin only)
const updateAcademicTerm = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const term = await AcademicTerm.findById(req.params.id);

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "Academic term not found",
      });
    }

    const { name, code, academicYear, startDate, endDate, description } =
      req.body;

    // If code or academicYear is being changed, check for duplicates
    if (
      (code && code !== term.code) ||
      (academicYear && academicYear !== term.academicYear)
    ) {
      const existingTerm = await AcademicTerm.findOne({
        code: code || term.code,
        academicYear: academicYear || term.academicYear,
        _id: { $ne: term._id },
      });

      if (existingTerm) {
        return res.status(400).json({
          success: false,
          message: "Academic term with this code already exists for this year",
        });
      }
    }

    // Validate dates if provided
    const newStartDate = startDate ? new Date(startDate) : term.startDate;
    const newEndDate = endDate ? new Date(endDate) : term.endDate;

    if (newStartDate >= newEndDate) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    // Update fields
    if (name) term.name = name;
    if (code) term.code = code;
    if (academicYear) term.academicYear = academicYear;
    if (startDate) term.startDate = startDate;
    if (endDate) term.endDate = endDate;
    if (description !== undefined) term.description = description;

    term.lastModifiedBy = req.user._id;

    await term.save();

    await term.populate("createdBy", "firstName lastName");
    await term.populate("lastModifiedBy", "firstName lastName");

    res.json({
      success: true,
      message: "Academic term updated successfully",
      data: term,
    });
  } catch (error) {
    console.error("Update academic term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Delete academic term
// @route   DELETE /api/academic-terms/:id
// @access  Private (Super Admin only)
const deleteAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findById(req.params.id);

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "Academic term not found",
      });
    }

    // Check if term is currently active
    if (term.isActive || term.isCurrent) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete active or current academic term",
      });
    }

    // Check if term has associated data (fees, classes, etc.)
    const Fee = require("../models/Fee");
    const Class = require("../models/Class");

    const associatedFees = await Fee.countDocuments({
      academicTermId: term._id,
    });
    const associatedClasses = await Class.countDocuments({
      academicTermId: term._id,
    });

    if (associatedFees > 0 || associatedClasses > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete term with associated data (${associatedFees} fees, ${associatedClasses} classes). Consider archiving instead.`,
      });
    }

    await term.deleteOne();

    res.json({
      success: true,
      message: "Academic term deleted successfully",
    });
  } catch (error) {
    console.error("Delete academic term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Activate academic term
// @route   PUT /api/academic-terms/:id/activate
// @access  Private (Super Admin only)
const activateAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.activateTerm(req.params.id);

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "Academic term not found",
      });
    }

    res.json({
      success: true,
      message: "Academic term activated successfully",
      data: term,
    });
  } catch (error) {
    console.error("Activate academic term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Set current academic term
// @route   PUT /api/academic-terms/:id/set-current
// @access  Private (Super Admin only)
const setCurrentAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.setCurrentTerm(req.params.id);

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "Academic term not found",
      });
    }

    res.json({
      success: true,
      message: "Current academic term set successfully",
      data: term,
    });
  } catch (error) {
    console.error("Set current academic term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// @desc    Archive academic term
// @route   PUT /api/academic-terms/:id/archive
// @access  Private (Super Admin only)
const archiveAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findById(req.params.id);

    if (!term) {
      return res.status(404).json({
        success: false,
        message: "Academic term not found",
      });
    }

    await term.archive();

    res.json({
      success: true,
      message: "Academic term archived successfully",
      data: term,
    });
  } catch (error) {
    console.error("Archive academic term error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAcademicTerms,
  getAcademicTerm,
  getActiveTerm,
  getCurrentTerm,
  createAcademicTerm,
  updateAcademicTerm,
  deleteAcademicTerm,
  activateAcademicTerm,
  setCurrentAcademicTerm,
  archiveAcademicTerm,
};
