const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Partner name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    logo: {
      url: {
        type: String,
        required: [true, "Logo URL is required"],
        trim: true,
      },
      alt: {
        type: String,
        trim: true,
        maxlength: [100, "Alt text cannot exceed 100 characters"],
      },
    },
    type: {
      type: String,
      enum: ["accreditation", "partner"],
      required: [true, "Partner type is required"],
      default: "partner",
    },
    link: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
partnerSchema.index({ status: 1 });
partnerSchema.index({ type: 1 });
partnerSchema.index({ status: 1, type: 1, displayOrder: 1 });

// Virtual for checking if partner is active
partnerSchema.virtual("isActive").get(function () {
  return this.status === "active";
});

// Static method to get active partners ordered by display order
partnerSchema.statics.getActive = function () {
  return this.find({ status: "active" }).sort({
    displayOrder: 1,
    createdAt: -1,
  });
};

// Static method to get active accreditations
partnerSchema.statics.getActiveAccreditations = function () {
  return this.find({ status: "active", type: "accreditation" }).sort({
    displayOrder: 1,
  });
};

// Static method to get active partners
partnerSchema.statics.getActivePartners = function () {
  return this.find({ status: "active", type: "partner" }).sort({
    displayOrder: 1,
  });
};

module.exports = mongoose.model("Partner", partnerSchema);
