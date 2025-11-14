const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch reference is required"],
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: false, // Optional for backward compatibility
    },
    code: {
      type: String,
      required: [true, "Course code is required"],
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Course name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ["core", "elective", "practical", "theory"],
      default: "core",
    },
    level: {
      type: String,
      enum: ["Begginner", "Intermediate", "Advanced"],
      required: [true, "Course level is required"],
    },
    credits: {
      type: Number,
      default: 1,
      min: 0.5,
    },
    duration: {
      hoursPerWeek: { type: Number, default: 1 },
      totalHours: { type: Number, default: 40 },
    },
    prerequisites: [
      {
        type: String,
        trim: true,
      },
    ],
    objectives: [
      {
        type: String,
        trim: true,
      },
    ],
    syllabus: {
      topics: [{ type: String, trim: true }],
      learningOutcomes: [{ type: String, trim: true }],
      assessmentMethods: [
        {
          type: String,
          enum: ["quiz", "test", "assignment", "project", "practical", "exam"],
        },
      ],
    },
    resources: {
      textbooks: [
        {
          title: String,
          author: String,
          isbn: String,
        },
      ],
      modules: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
          },
          description: {
            type: String,
            trim: true,
          },
          order: {
            type: Number,
            default: 0,
          },
          materials: [
            {
              title: {
                type: String,
                required: true,
                trim: true,
              },
              description: {
                type: String,
                trim: true,
              },
              type: {
                type: String,
                enum: ["document", "video", "image", "link", "text"],
                required: true,
              },
              fileUrl: {
                type: String,
                trim: true,
              },
              content: {
                type: String, // For text-type materials
                trim: true,
              },
              createdAt: {
                type: Date,
                default: Date.now,
              },
              updatedAt: {
                type: Date,
                default: Date.now,
              },
            },
          ],
          createdAt: {
            type: Date,
            default: Date.now,
          },
          updatedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      materials: [
        {
          title: {
            type: String,
            required: true,
            trim: true,
          },
          description: {
            type: String,
            trim: true,
          },
          type: {
            type: String,
            enum: ["document", "video", "image", "link", "text"],
            required: true,
          },
          fileUrl: {
            type: String,
            trim: true,
          },
          content: {
            type: String, // For text-type materials
            trim: true,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
          updatedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      onlineResources: [{ type: String, trim: true }],
    },
    fees: {
      tuitionFee: {
        type: Number,
        default: 0,
        min: [0, "Tuition fee cannot be negative"],
      },
      registrationFee: {
        type: Number,
        default: 0,
        min: [0, "Registration fee cannot be negative"],
      },
      materialsFee: {
        type: Number,
        default: 0,
        min: [0, "Materials fee cannot be negative"],
      },
      labFee: {
        type: Number,
        default: 0,
        min: [0, "Lab fee cannot be negative"],
      },
      otherFees: [
        {
          name: { type: String, trim: true },
          amount: { type: Number, min: 0 },
        },
      ],
      totalFee: {
        type: Number,
        default: 0,
        min: [0, "Total fee cannot be negative"],
      },
    },
    // New structured fee system
    feeStructure: {
      components: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
          },
          amount: {
            type: Number,
            required: true,
            min: [0, "Fee amount cannot be negative"],
          },
          category: {
            type: String,
            enum: [
              "tuition",
              "books",
              "uniform",
              "transport",
              "exam",
              "activity",
              "other",
            ],
            default: "other",
          },
          description: {
            type: String,
            trim: true,
          },
          isOptional: {
            type: Boolean,
            default: false,
          },
        },
      ],
      academicTerm: {
        type: String,
        enum: [
          "Term 1",
          "Term 2",
          "Term 3",
          "Semester 1",
          "Semester 2",
          "Annual",
        ],
        default: "Term 1",
      },
      dueDate: {
        type: Date,
      },
      lateFeePenalty: {
        type: Number,
        default: 0,
        min: [0, "Late fee penalty cannot be negative"],
        max: [100, "Late fee penalty cannot exceed 100%"],
      },
      // Installment options
      allowInstallments: {
        type: Boolean,
        default: false,
      },
      installmentPlan: {
        enabled: {
          type: Boolean,
          default: false,
        },
        numberOfInstallments: {
          type: Number,
          min: [1, "Must have at least 1 installment"],
          max: [12, "Cannot exceed 12 installments"],
          default: 1,
        },
        frequency: {
          type: String,
          enum: ["weekly", "monthly", "quarterly"],
          default: "monthly",
        },
        startDate: {
          type: Date,
          required: false, // Optional - will be based on enrollment date
        },
        schedule: [
          {
            installmentNumber: {
              type: Number,
              required: true,
            },
            amount: {
              type: Number,
              required: true,
              min: [0, "Installment amount cannot be negative"],
            },
            dueDate: {
              type: Date,
              required: true,
            },
          },
        ],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    whatsappGroupLink: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // Basic URL validation for WhatsApp links
          return !v || /^https?:\/\/(chat\.whatsapp\.com|wa\.me)\/.+$/.test(v);
        },
        message: "WhatsApp group link must be a valid WhatsApp URL",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
courseSchema.index({ branchId: 1 });
courseSchema.index({ code: 1, branchId: 1 }, { unique: true });
courseSchema.index({ level: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ isActive: 1 });

// Compound indexes
courseSchema.index({ branchId: 1, level: 1 });
courseSchema.index({ branchId: 1, isActive: 1 });

// Virtual for full course name (code + name)
courseSchema.virtual("fullName").get(function () {
  return `${this.code} - ${this.name}`;
});

// Pre-save middleware
courseSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to find courses by branch and level
courseSchema.statics.findByBranchAndLevel = function (branchId, level) {
  return this.find({
    branchId,
    level,
    isActive: true,
  }).sort({ code: 1 });
};

// Static method to get active courses
courseSchema.statics.getActiveCourses = function (branchId) {
  return this.find({
    branchId,
    isActive: true,
  }).sort({ level: 1, code: 1 });
};

// Pre-save middleware to calculate total fee
courseSchema.pre("save", function (next) {
  // Handle legacy fees structure
  if (this.fees) {
    let total = 0;
    total += this.fees.tuitionFee || 0;
    total += this.fees.registrationFee || 0;
    total += this.fees.materialsFee || 0;
    total += this.fees.labFee || 0;

    if (this.fees.otherFees && Array.isArray(this.fees.otherFees)) {
      total += this.fees.otherFees.reduce(
        (sum, fee) => sum + (fee.amount || 0),
        0
      );
    }

    this.fees.totalFee = total;
  }

  // Handle new fee structure and sync with legacy fees
  if (
    this.feeStructure &&
    this.feeStructure.components &&
    this.feeStructure.components.length > 0
  ) {
    // Calculate total from fee components
    const totalFromComponents = this.feeStructure.components.reduce(
      (sum, component) => sum + (component.amount || 0),
      0
    );

    // Update legacy fees structure for backward compatibility
    if (!this.fees) {
      this.fees = {};
    }

    // Reset legacy fees
    this.fees.tuitionFee = 0;
    this.fees.registrationFee = 0;
    this.fees.materialsFee = 0;
    this.fees.labFee = 0;
    this.fees.otherFees = [];

    // Map new fee structure to legacy structure
    this.feeStructure.components.forEach((component) => {
      switch (component.category) {
        case "tuition":
          this.fees.tuitionFee += component.amount;
          break;
        case "books":
          this.fees.materialsFee += component.amount;
          break;
        case "activity":
          this.fees.labFee += component.amount;
          break;
        default:
          this.fees.otherFees.push({
            name: component.name,
            amount: component.amount,
          });
          break;
      }
    });

    this.fees.totalFee = totalFromComponents;
  }

  next();
});

module.exports = mongoose.model("Course", courseSchema);
