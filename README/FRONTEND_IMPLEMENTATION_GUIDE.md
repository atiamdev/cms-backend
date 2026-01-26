# Frontend Implementation Guide for Enhanced Quiz Features

## 🎯 Overview

This guide provides implementation details for integrating the enhanced quiz functionality into the frontend application.

## 📁 Frontend Structure

### Recommended File Structure

```
src/
├── components/
│   ├── quiz/
│   │   ├── QuizCreator.tsx
│   │   ├── QuestionBuilder.tsx
│   │   ├── QuizScheduler.tsx
│   │   ├── QuizTimer.tsx
│   │   ├── AvailabilityStatus.tsx
│   │   └── QuestionTypes/
│   │       ├── MultipleChoice.tsx
│   │       ├── TrueFalse.tsx
│   │       ├── ShortAnswer.tsx
│   │       ├── Essay.tsx
│   │       └── index.ts
│   └── common/
│       ├── DateTimePicker.tsx
│       └── CountdownTimer.tsx
├── services/
│   ├── quizService.ts
│   └── questionService.ts
├── types/
│   ├── quiz.ts
│   └── question.ts
└── hooks/
    ├── useQuizSchedule.ts
    ├── useQuizTimer.ts
    └── useQuestionBuilder.ts
```

## 🔧 TypeScript Types

### Quiz Types

```typescript
// types/quiz.ts
export interface QuizSchedule {
  availableFrom?: string;
  availableUntil?: string;
  dueDate?: string;
}

export interface QuizSettings {
  randomizeQuestions?: boolean;
  oneQuestionAtATime?: boolean;
  preventBacktracking?: boolean;
  lockQuestionsAfterAnswering?: boolean;
  requireWebcam?: boolean;
  fullScreenMode?: boolean;
  showProgressBar?: boolean;
}

export interface QuizGrading {
  autoGrade?: boolean;
  gradingMethod?: "highest" | "latest" | "average";
  releaseGrades?: "immediately" | "after_due_date" | "manual";
}

export interface Quiz {
  _id?: string;
  title: string;
  description?: string;
  instructions?: string;
  courseId: string;
  courseType?: "course" | "ecourse";
  moduleId?: string;
  timeLimit?: number;
  attempts?: number;
  passingScore?: number;
  questions: Question[];
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResults?: boolean;
  showCorrectAnswers?: boolean;
  settings?: QuizSettings;
  grading?: QuizGrading;
  schedule?: QuizSchedule;
  isPublished?: boolean;
  isAvailable?: boolean;
  timeUntilStart?: {
    milliseconds: number;
    formatted: string;
  };
  timeUntilEnd?: {
    milliseconds: number;
    formatted: string;
  };
  branchId: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}
```

### Question Types

```typescript
// types/question.ts
export type QuestionType =
  | "multiple_choice"
  | "multiple_select"
  | "true_false"
  | "short_answer"
  | "essay"
  | "fill_blank"
  | "matching"
  | "ordering"
  | "numeric";

export interface BaseQuestion {
  _id?: string;
  type: QuestionType;
  question: string;
  points: number;
  difficulty?: "easy" | "medium" | "hard";
  explanation?: string;
  tags?: string[];
  estimatedTime?: number;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: "multiple_choice";
  options: string[];
  correctAnswer: string;
  shuffleOptions?: boolean;
}

export interface MultipleSelectQuestion extends BaseQuestion {
  type: "multiple_select";
  options: string[];
  correctAnswers: string[];
  shuffleOptions?: boolean;
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: "true_false";
  correctAnswer: "True" | "False";
}

export interface ShortAnswerQuestion extends BaseQuestion {
  type: "short_answer";
  correctAnswers: string[];
  caseSensitive?: boolean;
  exactMatch?: boolean;
}

export interface EssayQuestion extends BaseQuestion {
  type: "essay";
  minWords?: number;
  maxWords?: number;
  rubric?: Array<{
    criteria: string;
    points: number;
    description: string;
  }>;
}

export type Question =
  | MultipleChoiceQuestion
  | MultipleSelectQuestion
  | TrueFalseQuestion
  | ShortAnswerQuestion
  | EssayQuestion;
```

## 🔌 API Service

### Quiz Service

```typescript
// services/quizService.ts
import api from "./api";
import { Quiz, QuizSchedule } from "../types/quiz";

export const quizService = {
  // Create quiz with enhanced scheduling
  async createQuiz(quizData: Partial<Quiz>): Promise<Quiz> {
    const response = await api.post("/elearning/quizzes", quizData);
    return response.data.data;
  },

  // Get quiz with availability info
  async getQuiz(quizId: string): Promise<Quiz> {
    const response = await api.get(`/elearning/quizzes/${quizId}`);
    return response.data.data;
  },

  // Update quiz schedule
  async updateSchedule(quizId: string, schedule: QuizSchedule): Promise<Quiz> {
    const response = await api.put(`/elearning/quizzes/${quizId}/schedule`, {
      schedule,
    });
    return response.data.data;
  },

  // Add questions to quiz
  async addQuestions(quizId: string, questions: Question[]): Promise<void> {
    await api.post(`/elearning/quizzes/${quizId}/questions`, { questions });
  },

  // Import questions
  async importQuestions(
    quizId: string,
    questions: any[],
    format: "json" | "csv" | "qti" = "json"
  ): Promise<void> {
    await api.post(`/elearning/quizzes/${quizId}/import`, {
      questions,
      format,
    });
  },

  // Get teacher quizzes
  async getTeacherQuizzes(params?: {
    courseId?: string;
    page?: number;
    limit?: number;
    status?: "published" | "draft";
  }): Promise<{ quizzes: Quiz[]; total: number }> {
    const response = await api.get("/elearning/quizzes", { params });
    return response.data.data;
  },
};
```

## 🧩 React Components

### Quiz Creator Component

```tsx
// components/quiz/QuizCreator.tsx
import React, { useState } from "react";
import { Quiz, QuizSchedule } from "../../types/quiz";
import { quizService } from "../../services/quizService";
import QuizScheduler from "./QuizScheduler";
import QuestionBuilder from "./QuestionBuilder";

interface QuizCreatorProps {
  courseId: string;
  onQuizCreated?: (quiz: Quiz) => void;
}

const QuizCreator: React.FC<QuizCreatorProps> = ({
  courseId,
  onQuizCreated,
}) => {
  const [quiz, setQuiz] = useState<Partial<Quiz>>({
    title: "",
    description: "",
    courseId,
    timeLimit: 60,
    attempts: 1,
    passingScore: 60,
    questions: [],
    settings: {
      randomizeQuestions: false,
      oneQuestionAtATime: false,
      preventBacktracking: false,
      showProgressBar: true,
    },
  });

  const [loading, setLoading] = useState(false);

  const handleScheduleChange = (schedule: QuizSchedule) => {
    setQuiz((prev) => ({ ...prev, schedule }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const createdQuiz = await quizService.createQuiz(quiz);
      onQuizCreated?.(createdQuiz);
    } catch (error) {
      console.error("Error creating quiz:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Quiz Title
          </label>
          <input
            type="text"
            value={quiz.title}
            onChange={(e) =>
              setQuiz((prev) => ({ ...prev, title: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Time Limit (minutes)
          </label>
          <input
            type="number"
            value={quiz.timeLimit}
            onChange={(e) =>
              setQuiz((prev) => ({
                ...prev,
                timeLimit: parseInt(e.target.value),
              }))
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={quiz.description}
          onChange={(e) =>
            setQuiz((prev) => ({ ...prev, description: e.target.value }))
          }
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      {/* Scheduling */}
      <QuizScheduler schedule={quiz.schedule} onChange={handleScheduleChange} />

      {/* Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Quiz Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={quiz.settings?.randomizeQuestions}
              onChange={(e) =>
                setQuiz((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    randomizeQuestions: e.target.checked,
                  },
                }))
              }
            />
            <span>Randomize Questions</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={quiz.settings?.showProgressBar}
              onChange={(e) =>
                setQuiz((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    showProgressBar: e.target.checked,
                  },
                }))
              }
            />
            <span>Show Progress Bar</span>
          </label>
        </div>
      </div>

      {/* Questions */}
      <QuestionBuilder
        questions={quiz.questions || []}
        onChange={(questions) => setQuiz((prev) => ({ ...prev, questions }))}
      />

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Quiz"}
        </button>
      </div>
    </form>
  );
};

export default QuizCreator;
```

### Quiz Scheduler Component

```tsx
// components/quiz/QuizScheduler.tsx
import React from "react";
import { QuizSchedule } from "../../types/quiz";

interface QuizSchedulerProps {
  schedule?: QuizSchedule;
  onChange: (schedule: QuizSchedule) => void;
}

const QuizScheduler: React.FC<QuizSchedulerProps> = ({
  schedule,
  onChange,
}) => {
  const handleChange = (field: keyof QuizSchedule, value: string) => {
    onChange({
      ...schedule,
      [field]: value,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Quiz Schedule</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Available From
          </label>
          <input
            type="datetime-local"
            value={schedule?.availableFrom?.slice(0, 16) || ""}
            onChange={(e) =>
              handleChange(
                "availableFrom",
                e.target.value ? new Date(e.target.value).toISOString() : ""
              )
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Available Until
          </label>
          <input
            type="datetime-local"
            value={schedule?.availableUntil?.slice(0, 16) || ""}
            onChange={(e) =>
              handleChange(
                "availableUntil",
                e.target.value ? new Date(e.target.value).toISOString() : ""
              )
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Due Date
          </label>
          <input
            type="datetime-local"
            value={schedule?.dueDate?.slice(0, 16) || ""}
            onChange={(e) =>
              handleChange(
                "dueDate",
                e.target.value ? new Date(e.target.value).toISOString() : ""
              )
            }
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          />
        </div>
      </div>
    </div>
  );
};

export default QuizScheduler;
```

### Availability Status Component

```tsx
// components/quiz/AvailabilityStatus.tsx
import React from "react";
import { Quiz } from "../../types/quiz";

interface AvailabilityStatusProps {
  quiz: Quiz;
}

const AvailabilityStatus: React.FC<AvailabilityStatusProps> = ({ quiz }) => {
  const getStatusColor = () => {
    if (quiz.isAvailable) return "bg-green-100 text-green-800";
    if (quiz.timeUntilStart) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  const getStatusText = () => {
    if (quiz.isAvailable) return "Available Now";
    if (quiz.timeUntilStart) return `Starts ${quiz.timeUntilStart.formatted}`;
    return "Not Scheduled";
  };

  return (
    <div className="flex items-center space-x-2">
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor()}`}
      >
        {getStatusText()}
      </span>

      {quiz.timeUntilEnd && (
        <span className="text-sm text-gray-600">
          Ends {quiz.timeUntilEnd.formatted}
        </span>
      )}
    </div>
  );
};

export default AvailabilityStatus;
```

## 🪝 Custom Hooks

### Quiz Schedule Hook

```typescript
// hooks/useQuizSchedule.ts
import { useState, useEffect } from "react";
import { Quiz } from "../types/quiz";
import { quizService } from "../services/quizService";

export const useQuizSchedule = (quizId: string) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const quizData = await quizService.getQuiz(quizId);
        setQuiz(quizData);
      } catch (err) {
        setError("Failed to fetch quiz");
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();

    // Refresh every minute to update availability status
    const interval = setInterval(fetchQuiz, 60000);
    return () => clearInterval(interval);
  }, [quizId]);

  const updateSchedule = async (schedule: QuizSchedule) => {
    try {
      const updatedQuiz = await quizService.updateSchedule(quizId, schedule);
      setQuiz(updatedQuiz);
      return updatedQuiz;
    } catch (err) {
      setError("Failed to update schedule");
      throw err;
    }
  };

  return {
    quiz,
    loading,
    error,
    updateSchedule,
    isAvailable: quiz?.isAvailable || false,
    timeUntilStart: quiz?.timeUntilStart,
    timeUntilEnd: quiz?.timeUntilEnd,
  };
};
```

### Quiz Timer Hook

```typescript
// hooks/useQuizTimer.ts
import { useState, useEffect, useCallback } from "react";

export const useQuizTimer = (initialTime: number, onTimeUp?: () => void) => {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            onTimeUp?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining, onTimeUp]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);
  const reset = useCallback(() => {
    setTimeRemaining(initialTime);
    setIsRunning(false);
  }, [initialTime]);

  const formatTime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return {
    timeRemaining,
    formattedTime: formatTime(timeRemaining),
    isRunning,
    start,
    pause,
    reset,
    isTimeUp: timeRemaining === 0,
  };
};
```

## 🎨 Styling Examples

### CSS Classes for Quiz Components

```css
/* quiz-components.css */

/* Quiz Status Indicators */
.quiz-status-available {
  @apply bg-green-100 border-green-500 text-green-700;
}

.quiz-status-upcoming {
  @apply bg-yellow-100 border-yellow-500 text-yellow-700;
}

.quiz-status-ended {
  @apply bg-gray-100 border-gray-500 text-gray-700;
}

/* Timer Component */
.quiz-timer {
  @apply bg-white border-2 border-blue-500 rounded-lg p-4 text-center;
}

.quiz-timer.warning {
  @apply border-yellow-500 bg-yellow-50;
}

.quiz-timer.critical {
  @apply border-red-500 bg-red-50;
}

/* Question Builder */
.question-type-selector {
  @apply grid grid-cols-2 md:grid-cols-4 gap-2;
}

.question-type-card {
  @apply p-3 border-2 border-gray-200 rounded-lg cursor-pointer transition-colors;
}

.question-type-card:hover {
  @apply border-blue-500 bg-blue-50;
}

.question-type-card.selected {
  @apply border-blue-600 bg-blue-100;
}

/* Quiz Schedule Form */
.schedule-grid {
  @apply grid grid-cols-1 md:grid-cols-3 gap-4;
}

.datetime-input {
  @apply mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500;
}
```

## 🚀 Usage Examples

### Basic Quiz Creation

```tsx
// pages/CreateQuiz.tsx
import React from "react";
import QuizCreator from "../components/quiz/QuizCreator";
import { useParams, useNavigate } from "react-router-dom";

const CreateQuizPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const handleQuizCreated = (quiz: Quiz) => {
    navigate(`/quizzes/${quiz._id}`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create New Quiz</h1>
      <QuizCreator courseId={courseId!} onQuizCreated={handleQuizCreated} />
    </div>
  );
};

export default CreateQuizPage;
```

### Quiz Dashboard with Status

```tsx
// components/quiz/QuizDashboard.tsx
import React, { useEffect, useState } from "react";
import { Quiz } from "../../types/quiz";
import { quizService } from "../../services/quizService";
import AvailabilityStatus from "./AvailabilityStatus";

const QuizDashboard: React.FC = () => {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const data = await quizService.getTeacherQuizzes();
        setQuizzes(data.quizzes);
      } catch (error) {
        console.error("Error fetching quizzes:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuizzes();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Your Quizzes</h2>

      {quizzes.map((quiz) => (
        <div
          key={quiz._id}
          className="bg-white p-4 rounded-lg border shadow-sm"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium">{quiz.title}</h3>
              <p className="text-gray-600 text-sm">{quiz.description}</p>
              <p className="text-sm text-gray-500">
                {quiz.questions.length} questions • {quiz.timeLimit} minutes
              </p>
            </div>

            <AvailabilityStatus quiz={quiz} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default QuizDashboard;
```

---

This comprehensive frontend guide provides everything needed to implement the enhanced quiz features in your React/TypeScript frontend application. The components are designed to be modular, reusable, and fully integrated with the backend API enhancements.
