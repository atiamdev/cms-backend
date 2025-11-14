const { validationResult } = require("express-validator");
const News = require("../models/News");

// @desc    Get all published news for landing page
// @route   GET /api/landing/news
// @access  Public
const getPublishedNews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const featured = req.query.featured === "true";

    const news = await News.getPublished(limit, featured);

    // Transform image field for frontend compatibility
    const transformedNews = news.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
    }));

    res.status(200).json({
      success: true,
      count: transformedNews.length,
      data: transformedNews,
    });
  } catch (error) {
    console.error("Error fetching published news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching news",
    });
  }
};

// @desc    Get all news (admin)
// @route   GET /api/landing/news/admin
// @access  Private (SuperAdmin)
const getAllNews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const status = req.query.status; // 'draft', 'published', or undefined for all

    let query = {};
    if (status) {
      query.status = status;
    }

    const total = await News.countDocuments(query);
    const news = await News.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform image field for frontend compatibility
    const transformedNews = news.map((item) => ({
      ...item.toObject(),
      imageUrl: item.image?.url,
      imageAlt: item.image?.alt,
    }));

    res.status(200).json({
      success: true,
      count: transformedNews.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: transformedNews,
    });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching news",
    });
  }
};

// @desc    Get single news item
// @route   GET /api/landing/news/:id
// @access  Private (SuperAdmin)
const getNews = async (req, res) => {
  try {
    const news = await News.findById(req.params.id);

    if (!news) {
      return res.status(404).json({
        success: false,
        message: "News item not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedNews = {
      ...news.toObject(),
      imageUrl: news.image?.url,
      imageAlt: news.image?.alt,
    };

    res.status(200).json({
      success: true,
      data: transformedNews,
    });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching news",
    });
  }
};

// @desc    Create new news
// @route   POST /api/landing/news
// @access  Private (SuperAdmin)
const createNews = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const newsData = {
      ...req.body,
      author: {
        name: req.user.firstName + " " + req.user.lastName,
        role: req.user.roles.includes("superadmin")
          ? "Super Administrator"
          : "Administrator",
      },
    };

    // Handle imageUrl transformation to image.url
    if (newsData.imageUrl) {
      newsData.image = {
        url: newsData.imageUrl,
        alt: newsData.imageAlt || newsData.title || "News image",
      };
      delete newsData.imageUrl;
      delete newsData.imageAlt;
    }

    const news = await News.create(newsData);

    // Transform image field for frontend compatibility
    const transformedNews = {
      ...news.toObject(),
      imageUrl: news.image?.url,
      imageAlt: news.image?.alt,
    };

    res.status(201).json({
      success: true,
      message: "News created successfully",
      data: transformedNews,
    });
  } catch (error) {
    console.error("Error creating news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating news",
    });
  }
};

// @desc    Update news
// @route   PUT /api/landing/news/:id
// @access  Private (SuperAdmin)
const updateNews = async (req, res) => {
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
        alt: req.body.imageAlt || req.body.title || "News image",
      };
      delete req.body.imageUrl;
      delete req.body.imageAlt;
    }

    const news = await News.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!news) {
      return res.status(404).json({
        success: false,
        message: "News item not found",
      });
    }

    // Transform image field for frontend compatibility
    const transformedNews = {
      ...news.toObject(),
      imageUrl: news.image?.url,
      imageAlt: news.image?.alt,
    };

    res.status(200).json({
      success: true,
      message: "News updated successfully",
      data: transformedNews,
    });
  } catch (error) {
    console.error("Error updating news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating news",
    });
  }
};

// @desc    Delete news
// @route   DELETE /api/landing/news/:id
// @access  Private (SuperAdmin)
const deleteNews = async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);

    if (!news) {
      return res.status(404).json({
        success: false,
        message: "News item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "News deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting news",
    });
  }
};

// @desc    Publish news
// @route   PATCH /api/landing/news/:id/publish
// @access  Private (SuperAdmin)
const publishNews = async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(
      req.params.id,
      {
        status: "published",
        publishDate: new Date(),
      },
      { new: true }
    );

    if (!news) {
      return res.status(404).json({
        success: false,
        message: "News item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "News published successfully",
      data: news,
    });
  } catch (error) {
    console.error("Error publishing news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while publishing news",
    });
  }
};

// @desc    Unpublish news
// @route   PATCH /api/landing/news/:id/unpublish
// @access  Private (SuperAdmin)
const unpublishNews = async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(
      req.params.id,
      { status: "draft" },
      { new: true }
    );

    if (!news) {
      return res.status(404).json({
        success: false,
        message: "News item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "News unpublished successfully",
      data: news,
    });
  } catch (error) {
    console.error("Error unpublishing news:", error);
    res.status(500).json({
      success: false,
      message: "Server error while unpublishing news",
    });
  }
};

module.exports = {
  getPublishedNews,
  getAllNews,
  getNews,
  createNews,
  updateNews,
  deleteNews,
  publishNews,
  unpublishNews,
};
