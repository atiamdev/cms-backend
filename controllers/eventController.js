const { validationResult } = require("express-validator");
const Event = require("../models/Event");

// @desc    Get upcoming events for landing page
// @route   GET /api/landing/events
// @access  Public
const getUpcomingEvents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const featured = req.query.featured === "true";

    const events = await Event.getUpcoming(limit, featured);

    // Transform image field for frontend compatibility
    const transformedEvents = events.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
    }));

    res.status(200).json({
      success: true,
      count: transformedEvents.length,
      data: transformedEvents,
    });
  } catch (error) {
    console.error("Error fetching upcoming events:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching events",
    });
  }
};

// @desc    Get recent past events for landing page
// @route   GET /api/landing/events/recent
// @access  Public
const getRecentEvents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const events = await Event.getRecent(limit);

    // Transform image field for frontend compatibility
    const transformedEvents = events.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
    }));

    res.status(200).json({
      success: true,
      count: transformedEvents.length,
      data: transformedEvents,
    });
  } catch (error) {
    console.error("Error fetching recent events:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching events",
    });
  }
};

// @desc    Get all events (admin)
// @route   GET /api/landing/events/admin
// @access  Private (SuperAdmin)
const getAllEvents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const status = req.query.status; // 'draft', 'published', 'cancelled', or undefined for all

    let query = {};
    if (status) {
      query.status = status;
    }

    const total = await Event.countDocuments(query);
    const events = await Event.find(query)
      .sort({ eventDate: -1 })
      .skip(skip)
      .limit(limit);

    // Transform image field for frontend compatibility
    const transformedEvents = events.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
    }));

    res.status(200).json({
      success: true,
      count: transformedEvents.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: transformedEvents,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching events",
    });
  }
};

// @desc    Get single event
// @route   GET /api/landing/events/:id
// @access  Private (SuperAdmin)
const getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedEvent = {
      ...event.toObject(),
      imageUrl: event.image?.url,
      imageAlt: event.image?.alt,
    };

    res.status(200).json({
      success: true,
      data: transformedEvent,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching event",
    });
  }
};

// @desc    Create new event
// @route   POST /api/landing/events
// @access  Private (SuperAdmin)
const createEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const eventData = { ...req.body };

    // Handle imageUrl transformation to image.url
    if (eventData.imageUrl) {
      eventData.image = {
        url: eventData.imageUrl,
        alt: eventData.imageAlt || eventData.title || "Event image",
      };
      delete eventData.imageUrl;
      delete eventData.imageAlt;
    }

    const event = await Event.create(eventData);

    // Transform image field for frontend compatibility
    const transformedEvent = {
      ...event.toObject(),
      imageUrl: event.image?.url,
      imageAlt: event.image?.alt,
    };

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      data: transformedEvent,
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating event",
    });
  }
};

// @desc    Update event
// @route   PUT /api/landing/events/:id
// @access  Private (SuperAdmin)
const updateEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    // Handle imageUrl transformation to image.url
    if (req.body.imageUrl) {
      req.body.image = {
        url: req.body.imageUrl,
        alt: req.body.imageAlt || req.body.title || "Event image",
      };
      delete req.body.imageUrl;
      delete req.body.imageAlt;
    }

    const event = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedEvent = {
      ...event.toObject(),
      imageUrl: event.image?.url,
      imageAlt: event.image?.alt,
    };

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: transformedEvent,
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating event",
    });
  }
};

// @desc    Delete event
// @route   DELETE /api/landing/events/:id
// @access  Private (SuperAdmin)
const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting event",
    });
  }
};

// @desc    Publish event
// @route   PATCH /api/landing/events/:id/publish
// @access  Private (SuperAdmin)
const publishEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "published" },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Event published successfully",
      data: event,
    });
  } catch (error) {
    console.error("Error publishing event:", error);
    res.status(500).json({
      success: false,
      message: "Server error while publishing event",
    });
  }
};

// @desc    Cancel event
// @route   PATCH /api/landing/events/:id/cancel
// @access  Private (SuperAdmin)
const cancelEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Event cancelled successfully",
      data: event,
    });
  } catch (error) {
    console.error("Error cancelling event:", error);
    res.status(500).json({
      success: false,
      message: "Server error while cancelling event",
    });
  }
};

module.exports = {
  getUpcomingEvents,
  getRecentEvents,
  getAllEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  cancelEvent,
};
