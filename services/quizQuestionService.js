const shuffleArray = require("shuffle-array");
const { nanoid } = require("nanoid");
const crypto = require("crypto-js");

class QuizQuestionService {
  /**
   * Create a new question with validation
   */
  createQuestion(questionData) {
    const question = {
      _id: questionData._id || new (require("mongoose").Types.ObjectId)(),
      type: questionData.type,
      question: questionData.question,
      points: questionData.points || 1,
      difficulty: questionData.difficulty || "medium",
      explanation: questionData.explanation || "",
      tags: questionData.tags || [],
      estimatedTime: questionData.estimatedTime || 30, // seconds
      ...this.formatQuestionByType(questionData),
    };

    const validation = this.validateQuestion(question);
    if (!validation.isValid) {
      return { success: false, errors: validation.errors };
    }
    return { success: true, question };
  }

  /**
   * Format question data based on type
   */
  formatQuestionByType(questionData) {
    switch (questionData.type) {
      case "multiple_choice":
        return {
          options: questionData.options || [],
          correctAnswer: questionData.correctAnswer,
          shuffleOptions: questionData.shuffleOptions !== false,
        };

      case "multiple_select":
        return {
          options: questionData.options || [],
          correctAnswers: questionData.correctAnswers || [],
          shuffleOptions: questionData.shuffleOptions !== false,
        };

      case "true_false":
        return {
          options: ["True", "False"],
          correctAnswer: questionData.correctAnswer,
        };

      case "short_answer":
        return {
          correctAnswers: Array.isArray(questionData.correctAnswer)
            ? questionData.correctAnswer
            : [questionData.correctAnswer],
          caseSensitive: questionData.caseSensitive || false,
          exactMatch: questionData.exactMatch || false,
        };

      case "essay":
        return {
          minWords: questionData.minWords || 0,
          maxWords: questionData.maxWords || 1000,
          rubric: questionData.rubric || [],
        };

      case "fill_blank":
        return {
          correctAnswers: questionData.correctAnswers || [],
          caseSensitive: questionData.caseSensitive || false,
        };

      case "matching":
        return {
          pairs: questionData.pairs || [],
          shufflePairs: questionData.shufflePairs !== false,
        };

      case "ordering":
        return {
          correctOrder: questionData.correctOrder || [],
          items: questionData.items || [],
        };

      case "numeric":
        return {
          correctAnswer: questionData.correctAnswer,
          tolerance: questionData.tolerance || 0,
          unit: questionData.unit || "",
        };

      default:
        return {};
    }
  }

  /**
   * Validate question data
   */
  validateQuestion(question) {
    const errors = [];

    // Basic validation
    if (!question.question || question.question.trim().length === 0) {
      errors.push("Question text is required");
    }

    if (!question.type) {
      errors.push("Question type is required");
    }

    if (question.points <= 0) {
      errors.push("Question points must be greater than 0");
    }

    // Type-specific validation
    switch (question.type) {
      case "multiple_choice":
        if (!question.options || question.options.length < 2) {
          errors.push("Multiple choice questions must have at least 2 options");
        }
        if (!question.correctAnswer) {
          errors.push("Multiple choice questions must have a correct answer");
        }
        break;

      case "multiple_select":
        if (!question.options || question.options.length < 2) {
          errors.push("Multiple select questions must have at least 2 options");
        }
        if (!question.correctAnswers || question.correctAnswers.length === 0) {
          errors.push(
            "Multiple select questions must have at least one correct answer"
          );
        }
        break;

      case "true_false":
        if (!["True", "False"].includes(question.correctAnswer)) {
          errors.push(
            "True/False questions must have True or False as correct answer"
          );
        }
        break;

      case "short_answer":
      case "fill_blank":
        if (!question.correctAnswers || question.correctAnswers.length === 0) {
          errors.push(
            "Short answer questions must have at least one correct answer"
          );
        }
        break;

      case "matching":
        if (!question.pairs || question.pairs.length < 2) {
          errors.push("Matching questions must have at least 2 pairs");
        }
        break;

      case "numeric":
        if (typeof question.correctAnswer !== "number") {
          errors.push("Numeric questions must have a numeric correct answer");
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Shuffle questions for a quiz attempt
   */
  shuffleQuestions(questions, quizSettings = {}) {
    if (!quizSettings.shuffleQuestions) {
      return questions;
    }

    return shuffleArray(questions.slice()); // Create copy before shuffling
  }

  /**
   * Shuffle options for multiple choice questions
   */
  shuffleQuestionOptions(question) {
    if (!question.shuffleOptions || !question.options) {
      return question;
    }

    const shuffledQuestion = { ...question };

    if (question.type === "multiple_choice") {
      const optionsWithIndex = question.options.map((option, index) => ({
        option,
        originalIndex: index,
        isCorrect: option === question.correctAnswer,
      }));

      const shuffledOptions = shuffleArray(optionsWithIndex.slice());

      shuffledQuestion.options = shuffledOptions.map((item) => item.option);
      shuffledQuestion.correctAnswer = shuffledOptions.find(
        (item) => item.isCorrect
      )?.option;
    }

    return shuffledQuestion;
  }

  /**
   * Prepare questions for student (remove answers, shuffle if needed)
   */
  prepareQuestionsForStudent(questions, quizSettings = {}) {
    let preparedQuestions = questions.map((question) => {
      const studentQuestion = {
        _id: question._id,
        type: question.type,
        question: question.question,
        points: question.points,
        estimatedTime: question.estimatedTime,
        tags: question.tags,
      };

      // Add type-specific data (without answers)
      switch (question.type) {
        case "multiple_choice":
        case "multiple_select":
          studentQuestion.options = question.shuffleOptions
            ? shuffleArray(question.options.slice())
            : question.options;
          break;

        case "true_false":
          studentQuestion.options = ["True", "False"];
          break;

        case "essay":
          studentQuestion.minWords = question.minWords;
          studentQuestion.maxWords = question.maxWords;
          break;

        case "matching":
          if (question.shufflePairs) {
            const leftItems = question.pairs.map((p) => p.left);
            const rightItems = shuffleArray(question.pairs.map((p) => p.right));
            studentQuestion.leftItems = leftItems;
            studentQuestion.rightItems = rightItems;
          } else {
            studentQuestion.leftItems = question.pairs.map((p) => p.left);
            studentQuestion.rightItems = question.pairs.map((p) => p.right);
          }
          break;

        case "ordering":
          studentQuestion.items = shuffleArray(question.items.slice());
          break;

        case "numeric":
          studentQuestion.unit = question.unit;
          break;
      }

      return studentQuestion;
    });

    // Shuffle questions if enabled
    if (quizSettings.shuffleQuestions) {
      preparedQuestions = shuffleArray(preparedQuestions);
    }

    return preparedQuestions;
  }

  /**
   * Grade a student's answer
   */
  gradeAnswer(question, studentAnswer) {
    let isCorrect = false;
    let pointsEarned = 0;
    let feedback = "";

    switch (question.type) {
      case "multiple_choice":
      case "true_false":
        isCorrect = studentAnswer === question.correctAnswer;
        pointsEarned = isCorrect ? question.points : 0;
        break;

      case "multiple_select":
        const correctSet = new Set(question.correctAnswers);
        const studentSet = new Set(
          Array.isArray(studentAnswer) ? studentAnswer : []
        );

        isCorrect =
          correctSet.size === studentSet.size &&
          [...correctSet].every((answer) => studentSet.has(answer));

        // Partial credit for multiple select
        if (!isCorrect && studentSet.size > 0) {
          const correctCount = [...studentSet].filter((answer) =>
            correctSet.has(answer)
          ).length;
          const incorrectCount = [...studentSet].filter(
            (answer) => !correctSet.has(answer)
          ).length;
          const missedCount = correctSet.size - correctCount;

          // Partial credit formula: (correct - incorrect - missed) / total * points
          const partialScore = Math.max(
            0,
            (correctCount - incorrectCount - missedCount) / correctSet.size
          );
          pointsEarned = partialScore * question.points;
        } else if (isCorrect) {
          pointsEarned = question.points;
        }
        break;

      case "short_answer":
      case "fill_blank":
        isCorrect = this.checkShortAnswer(
          studentAnswer,
          question.correctAnswers,
          question
        );
        pointsEarned = isCorrect ? question.points : 0;
        break;

      case "numeric":
        isCorrect = this.checkNumericAnswer(
          studentAnswer,
          question.correctAnswer,
          question.tolerance
        );
        pointsEarned = isCorrect ? question.points : 0;
        break;

      case "matching":
        const { correct, total } = this.gradeMatching(
          studentAnswer,
          question.pairs
        );
        isCorrect = correct === total;
        pointsEarned = (correct / total) * question.points;
        break;

      case "ordering":
        const orderScore = this.gradeOrdering(
          studentAnswer,
          question.correctOrder
        );
        isCorrect = orderScore === 1;
        pointsEarned = orderScore * question.points;
        break;

      case "essay":
        // Essays require manual grading
        isCorrect = null;
        pointsEarned = 0;
        feedback = "This answer requires manual grading";
        break;
    }

    return {
      isCorrect,
      pointsEarned: Math.round(pointsEarned * 100) / 100, // Round to 2 decimal places
      feedback,
      explanation: question.explanation,
    };
  }

  /**
   * Check short answer against multiple possible correct answers
   */
  checkShortAnswer(studentAnswer, correctAnswers, options = {}) {
    if (!studentAnswer || !correctAnswers) return false;

    const normalize = (text) => {
      let normalized = text.toString().trim();
      if (!options.caseSensitive) {
        normalized = normalized.toLowerCase();
      }
      return normalized;
    };

    const normalizedStudent = normalize(studentAnswer);

    return correctAnswers.some((correct) => {
      const normalizedCorrect = normalize(correct);

      if (options.exactMatch) {
        return normalizedStudent === normalizedCorrect;
      } else {
        // Allow for minor variations (remove extra spaces, punctuation)
        const cleanStudent = normalizedStudent
          .replace(/[^\w\s]/g, "")
          .replace(/\s+/g, " ");
        const cleanCorrect = normalizedCorrect
          .replace(/[^\w\s]/g, "")
          .replace(/\s+/g, " ");
        return cleanStudent === cleanCorrect;
      }
    });
  }

  /**
   * Check numeric answer with tolerance
   */
  checkNumericAnswer(studentAnswer, correctAnswer, tolerance = 0) {
    const student = parseFloat(studentAnswer);
    const correct = parseFloat(correctAnswer);

    if (isNaN(student) || isNaN(correct)) return false;

    return Math.abs(student - correct) <= tolerance;
  }

  /**
   * Grade matching question
   */
  gradeMatching(studentAnswer, correctPairs) {
    if (!Array.isArray(studentAnswer))
      return { correct: 0, total: correctPairs.length };

    let correct = 0;
    const total = correctPairs.length;

    for (const pair of correctPairs) {
      const studentPair = studentAnswer.find((sp) => sp.left === pair.left);
      if (studentPair && studentPair.right === pair.right) {
        correct++;
      }
    }

    return { correct, total };
  }

  /**
   * Grade ordering question
   */
  gradeOrdering(studentAnswer, correctOrder) {
    if (
      !Array.isArray(studentAnswer) ||
      studentAnswer.length !== correctOrder.length
    ) {
      return 0;
    }

    let correctPositions = 0;
    for (let i = 0; i < correctOrder.length; i++) {
      if (studentAnswer[i] === correctOrder[i]) {
        correctPositions++;
      }
    }

    return correctPositions / correctOrder.length;
  }

  /**
   * Generate question ID for imports
   */
  generateQuestionId() {
    return nanoid(10);
  }

  /**
   * Import questions from various formats
   */
  importQuestions(questionsData, format = "json") {
    const importedQuestions = [];

    switch (format) {
      case "json":
        for (const questionData of questionsData) {
          const result = this.createQuestion(questionData);
          if (result.success) {
            importedQuestions.push(result.question);
          } else {
            console.error(
              `Error importing question: ${result.errors.join(", ")}`,
              questionData
            );
          }
        }
        break;

      case "csv":
        // Implementation for CSV import would go here
        break;

      case "qti":
        // Implementation for QTI format would go here
        break;
    }

    return importedQuestions;
  }

  /**
   * Export questions to various formats
   */
  exportQuestions(questions, format = "json") {
    switch (format) {
      case "json":
        return JSON.stringify(questions, null, 2);

      case "csv":
        // Implementation for CSV export would go here
        break;

      case "qti":
        // Implementation for QTI export would go here
        break;
    }
  }
}

module.exports = new QuizQuestionService();
