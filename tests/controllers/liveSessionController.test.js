const { LiveSession } = require("../../models/elearning");
const liveSessionController = require("../../controllers/elearning/liveSessionController");
const googleCalendarService = require("../../services/googleCalendarService");

// Mock dependencies
jest.mock("../../models/elearning");
jest.mock("../../services/googleCalendarService");
jest.mock("../../services/notificationService");

describe("LiveSession Controller", () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      user: { _id: "teacher123", roles: ["teacher"] },
      params: {},
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe("scheduleLiveSession", () => {
    it("should schedule a live session successfully", async () => {
      // Mock request data
      mockReq.body = {
        courseId: "course123",
        moduleId: "module123",
        contentId: "content123",
        startAt: "2025-09-20T10:00:00Z",
        endAt: "2025-09-20T11:00:00Z",
        timezone: "UTC",
      };

      // Mock course find
      const mockCourse = {
        _id: "course123",
        instructor: "teacher123",
        modules: [
          {
            _id: "module123",
            contents: [
              {
                _id: "content123",
                title: "Test Content",
              },
            ],
          },
        ],
      };
      require("../../models/elearning").ECourse.findById.mockResolvedValue(
        mockCourse
      );

      // Mock enrollment find
      require("../../models/elearning").Enrollment.find.mockResolvedValue([
        { studentId: { email: "student@example.com" } },
      ]);

      // Mock user find
      require("../../models/User").findById.mockResolvedValue({
        _id: "teacher123",
        googleTokens: { access_token: "token" },
      });

      // Mock Google Calendar service
      googleCalendarService.createMeetEvent.mockResolvedValue({
        eventId: "event123",
        meetLink: "https://meet.google.com/abc-defg-hij",
      });

      // Mock LiveSession create
      LiveSession.create.mockResolvedValue({
        _id: "session123",
        ...mockReq.body,
        meetLink: "https://meet.google.com/abc-defg-hij",
        googleEventId: "event123",
        status: "scheduled",
      });

      // Mock notification service
      require("../../services/notificationService").notifyLiveSessionStudents.mockResolvedValue(
        {}
      );

      await liveSessionController.scheduleLiveSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            meetLink: "https://meet.google.com/abc-defg-hij",
          }),
        })
      );
    });

    it("should return 403 if user is not the course instructor", async () => {
      mockReq.body = {
        courseId: "course123",
        moduleId: "module123",
        contentId: "content123",
        startAt: "2025-09-20T10:00:00Z",
        endAt: "2025-09-20T11:00:00Z",
      };

      const mockCourse = {
        _id: "course123",
        instructor: "differentTeacher", // Different instructor
      };
      require("../../models/elearning").ECourse.findById.mockResolvedValue(
        mockCourse
      );

      await liveSessionController.scheduleLiveSession(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Only the course instructor can schedule live sessions",
        })
      );
    });
  });

  describe("getUserLiveSessions", () => {
    it("should return user's live sessions", async () => {
      mockReq.user._id = "student123";

      // Mock enrollment find
      require("../../models/elearning").Enrollment.find.mockResolvedValue([
        { courseId: "course123" },
      ]);

      // Mock LiveSession find
      LiveSession.find.mockResolvedValue([
        {
          _id: "session123",
          courseId: { title: "Test Course" },
          hostUserId: { name: "Teacher Name" },
          startAt: "2025-09-20T10:00:00Z",
          status: "scheduled",
        },
      ]);

      await liveSessionController.getUserLiveSessions(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
        })
      );
    });
  });
});
