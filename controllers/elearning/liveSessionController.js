const { LiveSession, ECourse, Enrollment } = require("../../models/elearning");
const User = require("../../models/User");
const googleCalendarService = require("../../services/googleCalendarService");
const notificationService = require("../../services/notificationService");
const { validationResult } = require("express-validator");

// @desc    Schedule a live session for a course content
// @route   POST /api/elearning/live-sessions
// @access  Private (Teacher only)
const scheduleLiveSession = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const {
      courseId,
      moduleId,
      contentId,
      startAt,
      endAt,
      timezone,
      isRecurring,
      recurrencePattern,
    } = req.body;
    const hostUserId = req.user._id;

    // Verify the course exists and user is the instructor
    const course = await ECourse.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    if (course.instructor.toString() !== hostUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the course instructor can schedule live sessions",
      });
    }

    // Find the module if moduleId is provided
    let module = null;
    if (moduleId) {
      module = course.modules.find((m) => m._id.toString() === moduleId);
      if (!module) {
        return res.status(404).json({
          success: false,
          message: "Module not found",
        });
      }
    }

    // If contentId is provided, verify it exists; otherwise, use the first content or null
    let content = null;
    if (contentId && module) {
      content = module.contents.find((c) => c._id.toString() === contentId);
      if (!content) {
        return res.status(404).json({
          success: false,
          message: "Content not found",
        });
      }
    }

    // Check if user has Google OAuth tokens
    const user = await User.findById(hostUserId);
    if (!user.googleTokens || !user.googleTokens.access_token) {
      return res.status(400).json({
        success: false,
        message:
          "Google account not connected. Please connect your Google account first.",
      });
    }

    // Get enrolled students for attendees
    const enrollments = await Enrollment.find({ courseId }).populate(
      "studentId",
      "email"
    );
    const attendeeEmails = enrollments
      .filter((e) => e.studentId && e.studentId.email) // Filter out null studentId and missing emails
      .map((e) => e.studentId.email);

    // Create Google Calendar event
    const eventData = await googleCalendarService.createMeetEvent({
      tokens: user.googleTokens,
      userId: hostUserId,
      summary: content
        ? `${course.title} - ${module.title}: ${content.title}`
        : module
        ? `${course.title} - ${module.title}`
        : `${course.title} - Live Session`,
      description: content
        ? `Live session for ${content.title}`
        : module
        ? `Live session for ${module.title}`
        : `Live session for ${course.title}`,
      startTime: new Date(startAt),
      endTime: new Date(endAt),
      timezone,
      attendees: attendeeEmails,
    });

    // Save live session to DB
    const liveSessionData = {
      courseId,
      moduleId: moduleId || null,
      contentId: contentId || null,
      hostUserId,
      startAt,
      endAt,
      timezone,
      meetLink: eventData.meetLink,
      googleEventId: eventData.eventId,
      status: "scheduled",
      isRecurring: isRecurring || false,
    };

    if (isRecurring && recurrencePattern) {
      liveSessionData.recurrencePattern = recurrencePattern;
    }

    const liveSession = await LiveSession.create(liveSessionData);

    // If recurring, create additional sessions
    if (isRecurring && recurrencePattern) {
      await createRecurringSessions(
        liveSession,
        recurrencePattern,
        attendeeEmails,
        course,
        module,
        content,
        user.googleTokens,
        timezone,
        hostUserId
      );
    }

    // Send notifications to enrolled students
    await notificationService.notifyLiveSessionStudents({
      courseId,
      sessionId: liveSession._id,
      title: `New Live Session: ${module ? module.title : course.title}`,
      message: `A live session for "${
        content ? content.title : module ? module.title : course.title
      }" has been scheduled for ${new Date(
        startAt
      ).toLocaleString()}. Click to join.`,
      type: "scheduled",
      actionUrl: module
        ? contentId
          ? `/elearning/courses/${courseId}/modules/${moduleId}/content/${contentId}`
          : `/elearning/courses/${courseId}/modules/${moduleId}`
        : `/elearning/courses/${courseId}`,
    });

    res.status(201).json({
      success: true,
      data: liveSession,
      meetLink: eventData.meetLink,
    });
  } catch (error) {
    console.error("Error scheduling live session:", error);
    res.status(500).json({
      success: false,
      message: "Failed to schedule live session",
      error: error.message,
    });
  }
};

// @desc    Update a live session (reschedule)
// @route   PATCH /api/elearning/live-sessions/:id
// @access  Private (Teacher only)
const updateLiveSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { startAt, endAt, timezone } = req.body;
    const hostUserId = req.user._id;

    const liveSession = await LiveSession.findById(id);
    if (!liveSession) {
      return res.status(404).json({
        success: false,
        message: "Live session not found",
      });
    }

    if (liveSession.hostUserId.toString() !== hostUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the session host can update the session",
      });
    }

    if (liveSession.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        message: "Cannot update a session that is not scheduled",
      });
    }

    // Get user tokens
    const user = await User.findById(hostUserId);
    if (!user.googleTokens) {
      return res.status(400).json({
        success: false,
        message: "Google account connection required",
      });
    }

    // Update Google Calendar event
    const updates = {
      start: startAt
        ? {
            dateTime: new Date(startAt).toISOString(),
            timeZone: timezone || liveSession.timezone,
          }
        : undefined,
      end: endAt
        ? {
            dateTime: new Date(endAt).toISOString(),
            timeZone: timezone || liveSession.timezone,
          }
        : undefined,
    };

    await googleCalendarService.updateMeetEvent({
      tokens: user.googleTokens,
      eventId: liveSession.googleEventId,
      updates,
    });

    // Update DB
    liveSession.startAt = startAt || liveSession.startAt;
    liveSession.endAt = endAt || liveSession.endAt;
    liveSession.timezone = timezone || liveSession.timezone;
    await liveSession.save();

    // Send notifications to enrolled students
    const course = await ECourse.findById(liveSession.courseId);
    const module = course.modules.find(
      (m) => m._id.toString() === liveSession.moduleId
    );
    const content = liveSession.contentId
      ? module.contents.find((c) => c._id.toString() === liveSession.contentId)
      : null;

    await notificationService.notifyLiveSessionStudents({
      courseId: liveSession.courseId,
      sessionId: liveSession._id,
      title: `Live Session Updated: ${module.title}`,
      message: `The live session for "${
        content ? content.title : module.title
      }" has been rescheduled to ${new Date(
        liveSession.startAt
      ).toLocaleString()}.`,
      type: "updated",
      actionUrl: liveSession.contentId
        ? `/elearning/courses/${liveSession.courseId}/modules/${liveSession.moduleId}/content/${liveSession.contentId}`
        : `/elearning/courses/${liveSession.courseId}/modules/${liveSession.moduleId}`,
    });

    res.json({
      success: true,
      data: liveSession,
    });
  } catch (error) {
    console.error("Error updating live session:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update live session",
      error: error.message,
    });
  }
};

// @desc    Cancel a live session
// @route   DELETE /api/elearning/live-sessions/:id
// @access  Private (Teacher only)
const cancelLiveSession = async (req, res) => {
  try {
    const { id } = req.params;
    const hostUserId = req.user._id;

    const liveSession = await LiveSession.findById(id);
    if (!liveSession) {
      return res.status(404).json({
        success: false,
        message: "Live session not found",
      });
    }

    if (liveSession.hostUserId.toString() !== hostUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the session host can cancel the session",
      });
    }

    if (liveSession.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a session that is not scheduled",
      });
    }

    // Get user tokens
    const user = await User.findById(hostUserId);
    if (user.googleTokens && liveSession.googleEventId) {
      try {
        await googleCalendarService.deleteMeetEvent({
          tokens: user.googleTokens,
          eventId: liveSession.googleEventId,
        });
      } catch (error) {
        console.warn("Failed to delete Google Calendar event:", error);
      }
    }

    // Update DB
    liveSession.status = "cancelled";
    await liveSession.save();

    // Send notifications to enrolled students
    const course = await ECourse.findById(liveSession.courseId);
    const module = course.modules.find(
      (m) => m._id.toString() === liveSession.moduleId
    );
    const content = liveSession.contentId
      ? module.contents.find((c) => c._id.toString() === liveSession.contentId)
      : null;

    await notificationService.notifyLiveSessionStudents({
      courseId: liveSession.courseId,
      sessionId: liveSession._id,
      title: `Live Session Cancelled: ${module.title}`,
      message: `The live session for "${
        content ? content.title : module.title
      }" scheduled for ${new Date(
        liveSession.startAt
      ).toLocaleString()} has been cancelled.`,
      type: "cancelled",
      actionUrl: liveSession.contentId
        ? `/elearning/courses/${liveSession.courseId}/modules/${liveSession.moduleId}/content/${liveSession.contentId}`
        : `/elearning/courses/${liveSession.courseId}/modules/${liveSession.moduleId}`,
    });

    res.json({
      success: true,
      message: "Live session cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling live session:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel live session",
      error: error.message,
    });
  }
};

// @desc    Get live sessions for a user (enrolled courses)
// @route   GET /api/elearning/live-sessions
// @access  Private
const getUserLiveSessions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status = "scheduled", upcoming = true } = req.query;

    console.log("getUserLiveSessions called for userId:", userId);
    console.log("User roles:", req.user.roles);

    let courseIds = [];

    // If user is a student, get courses they're enrolled in
    if (req.user.roles && req.user.roles.includes("student")) {
      // Find student by user ID
      const Student = require("../../models/Student");
      const student = await Student.findOne({ userId: userId });
      console.log(
        "Student lookup result:",
        student
          ? { id: student._id, userId: student.userId }
          : "No student found"
      );

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      const studentId = student._id;

      // Get courses where student is enrolled
      const enrollments = await Enrollment.find({ studentId }).select(
        "courseId status"
      );
      console.log("Found enrollments:", enrollments.length);
      enrollments.forEach((e) =>
        console.log("Enrollment:", { courseId: e.courseId, status: e.status })
      );

      // Filter by active/approved/completed enrollments
      const validEnrollments = enrollments.filter((e) =>
        ["active", "approved", "completed"].includes(e.status)
      );
      console.log("Valid enrollments:", validEnrollments.length);

      courseIds = validEnrollments.map((e) => e.courseId);
    } else {
      // For teachers, get courses they teach
      const { ECourse } = require("../../models/elearning");
      const courses = await ECourse.find({ instructor: userId }).select("_id");
      courseIds = courses.map((c) => c._id);
    }

    console.log("Final courseIds:", courseIds);

    if (courseIds.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Build query
    const query = {
      courseId: { $in: courseIds },
      status,
    };

    if (upcoming === "true") {
      query.startAt = { $gte: new Date() };
    }

    console.log("LiveSession query:", query);

    const liveSessions = await LiveSession.find(query)
      .populate("courseId", "title thumbnail")
      .populate("hostUserId", "name email")
      .sort({ startAt: 1 });

    console.log("Found live sessions:", liveSessions.length);

    res.json({
      success: true,
      data: liveSessions,
    });
  } catch (error) {
    console.error("Error getting user live sessions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get live sessions",
      error: error.message,
    });
  }
};

// @desc    Get live sessions for a course (teacher view)
// @route   GET /api/elearning/courses/:courseId/live-sessions
// @access  Private (Teacher only)
const getCourseLiveSessions = async (req, res) => {
  try {
    const { courseId } = req.params;
    const hostUserId = req.user._id;

    // Verify course ownership
    const course = await ECourse.findById(courseId);
    if (!course || course.instructor.toString() !== hostUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const liveSessions = await LiveSession.find({ courseId })
      .populate("hostUserId", "name email")
      .sort({ startAt: -1 });

    res.json({
      success: true,
      data: liveSessions,
    });
  } catch (error) {
    console.error("Error getting course live sessions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get live sessions",
      error: error.message,
    });
  }
};

// Helper function to create recurring sessions
const createRecurringSessions = async (
  parentSession,
  recurrencePattern,
  attendeeEmails,
  course,
  module,
  content,
  googleTokens,
  timezone,
  userId
) => {
  const sessions = [];
  const startDate = new Date(parentSession.startAt);
  const endDate = recurrencePattern.endDate
    ? new Date(recurrencePattern.endDate)
    : new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000); // Default 90 days
  const duration =
    parentSession.endAt.getTime() - parentSession.startAt.getTime();

  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    // Move to next occurrence based on pattern
    switch (recurrencePattern.type) {
      case "daily":
        currentDate.setDate(currentDate.getDate() + recurrencePattern.interval);
        break;
      case "weekly":
        if (
          recurrencePattern.daysOfWeek &&
          recurrencePattern.daysOfWeek.length > 0
        ) {
          // For weekly with specific days
          const currentDay = currentDate.getDay();
          const dayNames = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ];
          const targetDays = recurrencePattern.daysOfWeek.map((day) =>
            dayNames.indexOf(day.toLowerCase())
          );

          let nextDay = targetDays.find((day) => day > currentDay);
          if (!nextDay) {
            nextDay = targetDays[0];
            currentDate.setDate(
              currentDate.getDate() + (7 - currentDay + nextDay)
            );
          } else {
            currentDate.setDate(currentDate.getDate() + (nextDay - currentDay));
          }
        } else {
          currentDate.setDate(
            currentDate.getDate() + 7 * recurrencePattern.interval
          );
        }
        break;
      case "monthly":
        currentDate.setMonth(
          currentDate.getMonth() + recurrencePattern.interval
        );
        if (recurrencePattern.dayOfMonth) {
          currentDate.setDate(recurrencePattern.dayOfMonth);
        }
        break;
      default:
        break;
    }

    // Skip if we've exceeded the end date
    if (currentDate > endDate) break;

    // Skip the original session date
    if (currentDate.getTime() === startDate.getTime()) continue;

    try {
      // Create Google Calendar event for this occurrence
      const occurrenceStart = new Date(currentDate);
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

      const eventData = await googleCalendarService.createMeetEvent({
        tokens: googleTokens,
        userId: userId,
        summary: content
          ? `${course.title} - ${module.title}: ${content.title}`
          : module
          ? `${course.title} - ${module.title}`
          : `${course.title} - Live Session`,
        description: content
          ? `Live session for ${content.title} (Recurring)`
          : module
          ? `Live session for ${module.title} (Recurring)`
          : `Live session for ${course.title} (Recurring)`,
        startTime: occurrenceStart,
        endTime: occurrenceEnd,
        timezone,
        attendees: attendeeEmails,
      });

      // Create the recurring session
      const recurringSession = await LiveSession.create({
        courseId: parentSession.courseId,
        moduleId: parentSession.moduleId,
        contentId: parentSession.contentId,
        hostUserId: parentSession.hostUserId,
        startAt: occurrenceStart,
        endAt: occurrenceEnd,
        timezone,
        meetLink: eventData.meetLink,
        googleEventId: eventData.eventId,
        status: "scheduled",
        isRecurring: false, // Individual occurrences are not recurring themselves
        parentSessionId: parentSession._id,
      });

      sessions.push(recurringSession);
    } catch (error) {
      console.error(
        `Error creating recurring session for ${currentDate}:`,
        error
      );
      // Continue with next occurrence
    }
  }

  return sessions;
};

module.exports = {
  scheduleLiveSession,
  updateLiveSession,
  cancelLiveSession,
  getUserLiveSessions,
  getCourseLiveSessions,
};
