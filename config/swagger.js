const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ATIAM College Management System API",
      version: "1.0.0",
      description: `
        A comprehensive college management system API with fee management, expense tracking, 
        attendance system with biometric integration, and multi-tenant support.
        
        ## Features
        - **Authentication & Authorization**: JWT-based authentication with role-based access control
        - **Fee Management**: Fee structures, payments, M-Pesa integration, reporting
        - **Expense Management**: Expense tracking, approval workflows, categorization
        - **Attendance System**: Biometric integration (ZKTeco), manual attendance, comprehensive reporting
        - **Multi-tenant Support**: Branch-based data isolation
        - **User Management**: Students, teachers, administrators
        - **Course & Class Management**: Academic structure management
        
        ## Authentication
        Most endpoints require authentication. Include the JWT token in the Authorization header:
        \`\`\`
        Authorization: Bearer <your-jwt-token>
        \`\`\`
        
        ## Error Handling
        The API uses conventional HTTP response codes and returns detailed error messages in JSON format.
      `,
      contact: {
        name: "ATIAM Support",
        email: "support@atiamcollege.com",
      },
      license: {
        name: "ISC",
        url: "https://opensource.org/licenses/ISC",
      },
    },
    servers: [
      {
        url: "http://localhost:5000/api",
        description: "Development server",
      },
      {
        url: "https://api.atiamcollege.com/api",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT Authorization header using the Bearer scheme",
        },
      },
      responses: {
        Unauthorized: {
          description: "Authentication required",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        Forbidden: {
          description: "Insufficient permissions",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        BadRequest: {
          description: "Invalid request data",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/Error",
              },
            },
          },
        },
        ValidationError: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: {
                    type: "boolean",
                    example: false,
                  },
                  message: {
                    type: "string",
                    example: "Validation failed",
                  },
                  errors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        field: { type: "string" },
                        message: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      schemas: {
        // Common schemas
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              description: "Error message",
            },
            error: {
              type: "object",
              description: "Detailed error information",
            },
          },
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              description: "Success message",
            },
            data: {
              type: "object",
              description: "Response data",
            },
          },
        },
        PaginatedResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            data: {
              type: "array",
              items: {},
            },
            pagination: {
              type: "object",
              properties: {
                currentPage: { type: "number" },
                totalPages: { type: "number" },
                totalItems: { type: "number" },
                itemsPerPage: { type: "number" },
                hasNext: { type: "boolean" },
                hasPrev: { type: "boolean" },
              },
            },
          },
        },

        // User schemas
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string", format: "email" },
            role: {
              type: "string",
              enum: [
                "superadmin",
                "admin",
                "branchadmin",
                "teacher",
                "student",
                "secretary",
              ],
            },
            branch: { type: "string" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // Student schemas
        Student: {
          type: "object",
          properties: {
            _id: { type: "string" },
            user: { $ref: "#/components/schemas/User" },
            registrationNumber: { type: "string" },
            admissionNumber: { type: "string" },
            class: { type: "string" },
            branch: { type: "string" },
            dateOfBirth: { type: "string", format: "date" },
            gender: { type: "string", enum: ["male", "female", "other"] },
            address: {
              type: "object",
              properties: {
                street: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
              },
            },
            parentGuardianInfo: {
              type: "object",
              properties: {
                fatherName: { type: "string" },
                motherName: { type: "string" },
                guardianName: { type: "string" },
                emergencyContact: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    phone: { type: "string" },
                    email: { type: "string", format: "email" },
                    relationship: { type: "string" },
                  },
                },
              },
            },
            enrollmentDate: { type: "string", format: "date" },
            academicRecords: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  academicYear: { type: "string" },
                  term: { type: "string" },
                  subjects: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        grade: { type: "string" },
                        marks: { type: "number" },
                        maxMarks: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // Teacher schemas
        Teacher: {
          type: "object",
          properties: {
            _id: { type: "string" },
            user: { $ref: "#/components/schemas/User" },
            employeeId: { type: "string" },
            department: { type: "string" },
            designation: { type: "string" },
            dateOfBirth: { type: "string", format: "date" },
            gender: { type: "string", enum: ["male", "female", "other"] },
            phone: { type: "string" },
            address: {
              type: "object",
              properties: {
                street: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
              },
            },
            emergencyContact: {
              type: "object",
              properties: {
                name: { type: "string" },
                phone: { type: "string" },
                email: { type: "string", format: "email" },
                relationship: { type: "string" },
              },
            },
            qualifications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  degree: { type: "string" },
                  institution: { type: "string" },
                  year: { type: "number" },
                  grade: { type: "string" },
                },
              },
            },
            experience: {
              type: "object",
              properties: {
                totalYears: { type: "number" },
                previousSchools: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      schoolName: { type: "string" },
                      position: { type: "string" },
                      duration: { type: "string" },
                    },
                  },
                },
              },
            },
            classAssignments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  classId: { type: "string" },
                  subject: { type: "string" },
                  isClassTeacher: { type: "boolean" },
                  academicYear: { type: "string" },
                },
              },
            },
            salary: { type: "number" },
            joinDate: { type: "string", format: "date" },
            leaveRecords: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  startDate: { type: "string", format: "date" },
                  endDate: { type: "string", format: "date" },
                  type: {
                    type: "string",
                    enum: [
                      "sick",
                      "annual",
                      "maternity",
                      "emergency",
                      "unpaid",
                    ],
                  },
                  status: {
                    type: "string",
                    enum: ["pending", "approved", "rejected"],
                  },
                  reason: { type: "string" },
                  adminComments: { type: "string" },
                },
              },
            },
            appraisals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  period: { type: "string" },
                  ratings: {
                    type: "object",
                    properties: {
                      teaching: { type: "number", minimum: 1, maximum: 5 },
                      communication: { type: "number", minimum: 1, maximum: 5 },
                      punctuality: { type: "number", minimum: 1, maximum: 5 },
                      teamwork: { type: "number", minimum: 1, maximum: 5 },
                    },
                  },
                  comments: { type: "string" },
                  goals: { type: "array", items: { type: "string" } },
                },
              },
            },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // Course schemas
        Course: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            level: {
              type: "string",
              enum: ["Begginner", "Intermediate", "Advanced"],
            },
            category: {
              type: "string",
              enum: ["core", "elective", "practical", "theory"],
            },
            credits: { type: "number", minimum: 0.5, maximum: 10 },
            description: { type: "string" },
            prerequisites: {
              type: "array",
              items: { type: "string" },
            },
            branch: { type: "string" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // Class schemas
        Class: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            grade: { type: "string" },
            section: { type: "string" },
            branch: { type: "string" },
            academicTermId: { type: "string" },
            capacity: { type: "number" },
            classTeacher: { type: "string" },
            students: {
              type: "array",
              items: { type: "string" },
            },
            subjects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  subjectName: { type: "string" },
                  courseId: { type: "string" },
                  teacher: { type: "string" },
                  weeklyHours: { type: "number" },
                },
              },
            },
            schedule: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: {
                    type: "string",
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
                  startTime: {
                    type: "string",
                    pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$",
                  },
                  endTime: {
                    type: "string",
                    pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$",
                  },
                  subjectName: { type: "string" },
                },
              },
            },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // Expense schemas
        Expense: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            amount: { type: "number", minimum: 0 },
            category: {
              type: "string",
              enum: [
                "utilities",
                "maintenance",
                "supplies",
                "salary",
                "equipment",
                "transport",
                "other",
              ],
            },
            branch: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "approved", "rejected", "on_hold"],
            },
            approvalStatus: {
              type: "string",
              enum: ["pending", "approved", "rejected", "on_hold"],
            },
            requestedBy: { type: "string" },
            approvedBy: { type: "string" },
            approvalDate: { type: "string", format: "date-time" },
            approvalNotes: { type: "string" },
            date: { type: "string", format: "date" },
            expenseDate: { type: "string", format: "date" },
            paymentMethod: {
              type: "string",
              enum: [
                "cash",
                "bank_transfer",
                "cheque",
                "mpesa",
                "card",
                "other",
              ],
            },
            vendor: {
              type: "object",
              properties: {
                name: { type: "string" },
                contact: { type: "string" },
                address: { type: "string" },
              },
            },
            receiptNumber: { type: "string" },
            receiptUrl: { type: "string" },
            attachments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  url: { type: "string" },
                  type: { type: "string" },
                },
              },
            },
            notes: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            isRecurring: { type: "boolean" },
            recurringDetails: {
              type: "object",
              properties: {
                frequency: {
                  type: "string",
                  enum: ["monthly", "quarterly", "annually"],
                },
                nextDueDate: { type: "string", format: "date" },
                endDate: { type: "string", format: "date" },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        // Fee schemas
        FeeStructure: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            class: { type: "string" },
            branch: { type: "string" },
            feeComponents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  amount: { type: "number" },
                  isOptional: { type: "boolean" },
                  dueDate: { type: "string", format: "date" },
                },
              },
            },
            totalAmount: { type: "number" },
            academicYear: { type: "string" },
            isActive: { type: "boolean" },
          },
        },

        Fee: {
          type: "object",
          properties: {
            _id: { type: "string" },
            student: { type: "string" },
            feeStructure: { type: "string" },
            branch: { type: "string" },
            totalAmount: { type: "number" },
            paidAmount: { type: "number" },
            dueAmount: { type: "number" },
            status: {
              type: "string",
              enum: ["pending", "partial", "paid", "overdue"],
            },
            dueDate: { type: "string", format: "date" },
            academicYear: { type: "string" },
          },
        },

        Payment: {
          type: "object",
          properties: {
            _id: { type: "string" },
            fee: { type: "string" },
            student: { type: "string" },
            branch: { type: "string" },
            amount: { type: "number" },
            method: {
              type: "string",
              enum: ["cash", "bank", "mpesa", "card"],
            },
            status: {
              type: "string",
              enum: ["pending", "completed", "failed", "cancelled"],
            },
            transactionId: { type: "string" },
            mpesaDetails: {
              type: "object",
              properties: {
                phoneNumber: { type: "string" },
                checkoutRequestId: { type: "string" },
                mpesaReceiptNumber: { type: "string" },
              },
            },
            createdBy: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // Expense schemas
        Expense: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            amount: { type: "number" },
            category: {
              type: "string",
              enum: [
                "utilities",
                "maintenance",
                "supplies",
                "salary",
                "equipment",
                "transport",
                "other",
              ],
            },
            branch: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "approved", "rejected"],
            },
            requestedBy: { type: "string" },
            approvedBy: { type: "string" },
            expenseDate: { type: "string", format: "date" },
            receiptUrl: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        // Attendance schemas
        Attendance: {
          type: "object",
          properties: {
            _id: { type: "string" },
            userId: { type: "string" },
            userType: {
              type: "string",
              enum: ["student", "teacher", "secretary", "admin"],
            },
            branch: { type: "string" },
            date: { type: "string", format: "date" },
            checkIn: { type: "string", format: "date-time" },
            checkOut: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["present", "absent", "late", "excused"],
            },
            method: {
              type: "string",
              enum: ["manual", "biometric", "card"],
            },
            deviceId: { type: "string" },
            workingHours: { type: "number" },
            notes: { type: "string" },
            createdBy: { type: "string" },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: ["./routes/*.js", "./controllers/*.js", "./models/*.js"],
};

const specs = swaggerJSDoc(options);

const swaggerSetup = (app) => {
  // Swagger UI options
  const swaggerOptions = {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 20px 0 }
      .swagger-ui .scheme-container { background: #fafafa; padding: 20px; border-radius: 4px; margin: 20px 0 }
    `,
    customSiteTitle: "ATIAM CMS API Documentation",
  };

  // Serve Swagger documentation
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs, swaggerOptions));

  // Serve Swagger JSON
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(specs);
  });

  console.log(
    `📚 API Documentation: http://localhost:${
      process.env.PORT || 5000
    }/api-docs`
  );
};

module.exports = { swaggerSetup, specs };
