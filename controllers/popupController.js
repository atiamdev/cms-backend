const Popup = require("../models/Popup");
const { validationResult } = require("express-validator");

/**
 * @desc    Get active popup for landing page (public)
 * @route   GET /api/landing/popup
 * @access  Public
 */
exports.getActivePopup = async (req, res) => {
  try {
    const popup = await Popup.getActivePopup();

    if (!popup) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No active popup available",
      });
    }

    // Increment view count
    popup.statistics.views += 1;
    await popup.save();

    res.status(200).json({
      success: true,
      data: popup,
    });
  } catch (error) {
    console.error("Error fetching active popup:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching popup",
      error: error.message,
    });
  }
};

/**
 * @desc    Track popup interaction (click or dismiss)
 * @route   POST /api/landing/popup/:id/track
 * @access  Public
 */
exports.trackPopupInteraction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'click' or 'dismiss'

    if (!["click", "dismiss"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Must be 'click' or 'dismiss'",
      });
    }

    const popup = await Popup.findById(id);

    if (!popup) {
      return res.status(404).json({
        success: false,
        message: "Popup not found",
      });
    }

    if (action === "click") {
      popup.statistics.clicks += 1;
    } else if (action === "dismiss") {
      popup.statistics.dismissals += 1;
    }

    await popup.save();

    res.status(200).json({
      success: true,
      message: "Interaction tracked",
    });
  } catch (error) {
    console.error("Error tracking popup interaction:", error);
    res.status(500).json({
      success: false,
      message: "Error tracking interaction",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all popups (admin)
 * @route   GET /api/landing/popup/admin
 * @access  Private/SuperAdmin
 */
exports.getAllPopups = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // Filter by status

    const query = {};
    if (status) {
      query.status = status;
    }

    const total = await Popup.countDocuments(query);
    const popups = await Popup.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    res.status(200).json({
      success: true,
      count: popups.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: popups,
    });
  } catch (error) {
    console.error("Error fetching popups:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching popups",
      error: error.message,
    });
  }
};

/**
 * @desc    Get single popup (admin)
 * @route   GET /api/landing/popup/admin/:id
 * @access  Private/SuperAdmin
 */
exports.getPopup = async (req, res) => {
  try {
    const popup = await Popup.findById(req.params.id);

    if (!popup) {
      return res.status(404).json({
        success: false,
        message: "Popup not found",
      });
    }

    res.status(200).json({
      success: true,
      data: popup,
    });
  } catch (error) {
    console.error("Error fetching popup:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching popup",
      error: error.message,
    });
  }
};

/**
 * @desc    Create new popup
 * @route   POST /api/landing/popup/admin
 * @access  Private/SuperAdmin
 */
exports.createPopup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const popupData = {
      ...req.body,
      author: {
        name: req.user.name || "Admin",
        userId: req.user.id,
      },
    };

    const popup = await Popup.create(popupData);

    res.status(201).json({
      success: true,
      data: popup,
      message: "Popup created successfully",
    });
  } catch (error) {
    console.error("Error creating popup:", error);
    res.status(500).json({
      success: false,
      message: "Error creating popup",
      error: error.message,
    });
  }
};

/**
 * @desc    Update popup
 * @route   PUT /api/landing/popup/admin/:id
 * @access  Private/SuperAdmin
 */
exports.updatePopup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    let popup = await Popup.findById(req.params.id);

    if (!popup) {
      return res.status(404).json({
        success: false,
        message: "Popup not found",
      });
    }

    // Don't allow updating statistics through this endpoint
    const { statistics, ...updateData } = req.body;

    popup = await Popup.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: popup,
      message: "Popup updated successfully",
    });
  } catch (error) {
    console.error("Error updating popup:", error);
    res.status(500).json({
      success: false,
      message: "Error updating popup",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete popup
 * @route   DELETE /api/landing/popup/admin/:id
 * @access  Private/SuperAdmin
 */
exports.deletePopup = async (req, res) => {
  try {
    const popup = await Popup.findById(req.params.id);

    if (!popup) {
      return res.status(404).json({
        success: false,
        message: "Popup not found",
      });
    }

    await popup.deleteOne();

    res.status(200).json({
      success: true,
      message: "Popup deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting popup:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting popup",
      error: error.message,
    });
  }
};

/**
 * @desc    Publish popup
 * @route   PATCH /api/landing/popup/admin/:id/publish
 * @access  Private/SuperAdmin
 */
exports.publishPopup = async (req, res) => {
  try {
    let popup = await Popup.findById(req.params.id);

    if (!popup) {
      return res.status(404).json({
        success: false,
        message: "Popup not found",
      });
    }

    popup.status = "published";
    popup.publishDate = new Date();
    await popup.save();

    res.status(200).json({
      success: true,
      data: popup,
      message: "Popup published successfully",
    });
  } catch (error) {
    console.error("Error publishing popup:", error);
    res.status(500).json({
      success: false,
      message: "Error publishing popup",
      error: error.message,
    });
  }
};

/**
 * @desc    Unpublish popup
 * @route   PATCH /api/landing/popup/admin/:id/unpublish
 * @access  Private/SuperAdmin
 */
exports.unpublishPopup = async (req, res) => {
  try {
    let popup = await Popup.findById(req.params.id);

    if (!popup) {
      return res.status(404).json({
        success: false,
        message: "Popup not found",
      });
    }

    popup.status = "draft";
    await popup.save();

    res.status(200).json({
      success: true,
      data: popup,
      message: "Popup unpublished successfully",
    });
  } catch (error) {
    console.error("Error unpublishing popup:", error);
    res.status(500).json({
      success: false,
      message: "Error unpublishing popup",
      error: error.message,
    });
  }
};
