// E-learning Models Index
// This file exports all e-learning related models for easy importing

module.exports = {
  ECourse: require("./ECourse"),
  CourseContent: require("./CourseContent"),
  LearningModule: require("./LearningModule"),
  Assignment: require("./Assignment"),
  Quiz: require("./Quiz"),
  Submission: require("./Submission"),
  QuizAttempt: require("./QuizAttempt"),
  LearningProgress: require("./LearningProgress"),
  Discussion: require("./Discussion"),
  DiscussionReply: require("./DiscussionReply"),
  SharedContentLibrary: require("./SharedContentLibrary"),
  Enrollment: require("./Enrollment"),
  LiveSession: require("./LiveSession"),
  Rating: require("./Rating"),
  Certificate: require("./Certificate"),
};

// You can also import individual models like:
// const { ECourse, CourseContent, Quiz, Assignment } = require('./models/elearning');
