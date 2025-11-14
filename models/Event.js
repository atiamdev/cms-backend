const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Event description is required"],
      trim: true,
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: [200, "Short description cannot exceed 200 characters"],
    },
    image: {
      url: {
        type: String,
        trim: true,
      },
      alt: {
        type: String,
        trim: true,
        maxlength: [100, "Alt text cannot exceed 100 characters"],
      },
    },
    eventDate: {
      type: Date,
      required: [true, "Event date is required"],
    },
    endDate: {
      type: Date,
    },
    location: {
      venue: {
        type: String,
        trim: true,
      },
      address: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
    },
    status: {
      type: String,
      enum: ["draft", "published", "cancelled"],
      default: "draft",
    },
    eventType: {
      type: String,
      enum: ["academic", "cultural", "sports", "workshop", "seminar", "other"],
      default: "other",
    },
    registrationRequired: {
      type: Boolean,
      default: false,
    },
    registrationUrl: {
      type: String,
      trim: true,
    },
    capacity: {
      type: Number,
      min: 0,
    },
    organizer: {
      name: {
        type: String,
        trim: true,
      },
      contact: {
        type: String,
        trim: true,
      },
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
eventSchema.index({ status: 1 });
eventSchema.index({ eventDate: 1 });
eventSchema.index({ eventType: 1 });
eventSchema.index({ status: 1, eventDate: 1 });
eventSchema.index({ status: 1, featured: 1, eventDate: 1 });

// Virtual for checking if event is upcoming
eventSchema.virtual("isUpcoming").get(function () {
  return this.status === "published" && this.eventDate > new Date();
});

// Virtual for checking if event is past
eventSchema.virtual("isPast").get(function () {
  return this.eventDate < new Date();
});

// Virtual for formatted date
eventSchema.virtual("formattedDate").get(function () {
  return this.eventDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

// Static method to get upcoming events
eventSchema.statics.getUpcoming = function (limit = 10, featured = false) {
  const query = {
    status: "published",
    eventDate: { $gte: new Date() },
  };
  if (featured) {
    query.featured = true;
  }
  return this.find(query).sort({ eventDate: 1 }).limit(limit);
};

// Static method to get recent past events
eventSchema.statics.getRecent = function (limit = 5) {
  return this.find({
    status: "published",
    eventDate: { $lt: new Date() },
  })
    .sort({ eventDate: -1 })
    .limit(limit);
};

module.exports = mongoose.model("Event", eventSchema);
