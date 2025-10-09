const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ECourse",
      required: true,
    },
    moduleId: {
      type: String, // Since modules are embedded, use the module title or _id if available
      required: true,
    },
    contentId: {
      type: String, // Content _id within the module (optional)
      required: false,
    },
    hostUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    meetLink: {
      type: String,
      trim: true,
    },
    googleEventId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "cancelled", "completed"],
      default: "scheduled",
    },
    // Recurring session fields
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrencePattern: {
      type: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
      },
      interval: {
        type: Number,
        default: 1, // Every N days/weeks/months
      },
      endDate: {
        type: Date, // When the recurrence ends
      },
      daysOfWeek: [
        {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
      ], // For weekly recurrence
      dayOfMonth: {
        type: Number, // For monthly recurrence (1-31)
      },
    },
    parentSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveSession", // Reference to the original session for recurring instances
    },
    attendees: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        joinedAt: Date,
        leftAt: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
liveSessionSchema.index({ courseId: 1, startAt: 1 });
liveSessionSchema.index({ hostUserId: 1 });
liveSessionSchema.index({ status: 1, startAt: 1 });

module.exports = mongoose.model("LiveSession", liveSessionSchema);
