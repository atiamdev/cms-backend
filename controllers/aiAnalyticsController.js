const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const aiDataService = require("../services/aiDataService");

// Initialize AI
const apiKey = process.env.GEMINI_API_KEY;
// Only initialize if key is present and not default
const genAI =
  apiKey && apiKey !== "YOUR_API_KEY_HERE"
    ? new GoogleGenerativeAI(apiKey)
    : null;

exports.askAi = async (req, res) => {
  try {
    const { question, branchId } = req.body;

    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    // 1. Fetch Data from APIs
    const baseURL = `http://localhost:${process.env.PORT || 5000}`;
    const headers = { Authorization: req.headers.authorization };

    const apiCalls = [
      axios.get(`${baseURL}/api/classes?branchId=${branchId}&limit=1000`, {
        headers,
      }),
      axios.get(`${baseURL}/api/courses?branchId=${branchId}&limit=1000`, {
        headers,
      }),
      axios.get(
        `${baseURL}/api/departments?branchId=${branchId}&limit=1000&isActive=true`,
        { headers }
      ),
      axios.get(`${baseURL}/api/expenses?branchId=${branchId}&limit=1000`, {
        headers,
      }),
      axios.get(
        `${baseURL}/api/fees/payments?branchId=${branchId}&limit=1000`,
        { headers }
      ),
      axios.get(`${baseURL}/api/students?branchId=${branchId}&limit=1000`, {
        headers,
      }),
      axios.get(`${baseURL}/api/teachers?branchId=${branchId}&limit=1000`, {
        headers,
      }),
      axios.get(`${baseURL}/api/users?branchId=${branchId}&limit=1000`, {
        headers,
      }),
    ];

    const [
      classesRes,
      coursesRes,
      departmentsRes,
      expensesRes,
      paymentsRes,
      studentsRes,
      teachersRes,
      usersRes,
    ] = await Promise.all(apiCalls);

    const contextData = {
      classes: classesRes.data,
      courses: coursesRes.data,
      departments: departmentsRes.data,
      expenses: expensesRes.data,
      payments: paymentsRes.data,
      students: studentsRes.data,
      teachers: teachersRes.data,
      users: usersRes.data,
    };

    // Debug: Log the context data
    console.log("AI Context Data from APIs for branchId:", branchId);
    console.log("Classes count:", contextData.classes?.length || 0);
    console.log("Students count:", contextData.students?.length || 0);

    // Check if API key is configured
    if (!genAI) {
      console.warn("Gemini API Key missing. Returning mock response.");

      // Mock response for testing/demo
      return res.json({
        answer:
          "I'm currently running in demo mode because the AI API key hasn't been configured yet. However, I can see your data! For example, I see you have " +
          (contextData.students?.length || 0) +
          " students and " +
          (contextData.payments?.length || 0) +
          " payments recorded. Please configure the GEMINI_API_KEY in your backend .env file to get real AI answers.",
        visualization: {
          type: "bar",
          title: "Demo: Payments Count",
          data: [
            { name: "Payments", value: contextData.payments?.length || 0 },
          ],
          dataKey: "value",
        },
      });
    }

    // 2. Construct Prompt
    // Use the user's preferred model
    const modelName = "gemini-2.5-pro";
    const model = genAI.getGenerativeModel({ model: modelName });

    const systemPrompt = `
        You are an AI Data Analyst for a College Management System.
        Your role is to answer questions based on the provided JSON data from various API endpoints.
        
        API Data:
        ${JSON.stringify(contextData)}

        User Question: "${question}"

        Instructions:
        1. The data contains arrays of objects from different endpoints: classes, courses, departments, expenses, payments, students, teachers, users.
        2. Analyze the relevant arrays to answer the question. For example, for student counts, look at the 'students' array.
        3. Count items, sum values, find patterns, etc., based on the data.
        4. If data is missing or empty, say so clearly.
        5. Return the response in strict JSON format:
        {
            "answer": "Your concise answer here.",
            "visualization": {
                "type": "bar" | "pie" | "line" | "none",
                "title": "Chart Title",
                "data": [ { "name": "Label", "value": 123 } ],
                "dataKey": "value"
            }
        }
        `;

    // 3. Generate Content
    let result;
    try {
      result = await model.generateContent(systemPrompt);
    } catch (modelError) {
      console.warn(
        `Model ${modelName} failed, trying gemini-2.0-flash. Error: ${modelError.message}`
      );
      const fallbackModel = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
      });
      result = await fallbackModel.generateContent(systemPrompt);
    }

    const response = await result.response;
    const text = response.text();

    // 4. Parse JSON
    // Clean up potential markdown code blocks if the model adds them despite instructions
    const cleanText = text
      .replace(/\`\`\`json/g, "")
      .replace(/\`\`\`/g, "")
      .trim();

    let jsonResponse;
    try {
      jsonResponse = JSON.parse(cleanText);
    } catch (e) {
      console.error("Failed to parse AI response:", text);
      // Fallback if JSON parsing fails
      jsonResponse = {
        answer: text,
        visualization: { type: "none" },
      };
    }

    res.json(jsonResponse);
  } catch (error) {
    console.error("AI Analytics Error:", error);
    res
      .status(500)
      .json({ message: "Failed to process AI request", error: error.message });
  }
};
