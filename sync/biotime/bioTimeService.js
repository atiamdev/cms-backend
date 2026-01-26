require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

class BioTimeService {
  constructor(options = {}) {
    this.baseUrl =
      options.baseUrl ||
      process.env.BIOTIME_API_URL ||
      "http://biotimedxb.com:8007";
    this.username = options.username || process.env.BIOTIME_USERNAME;
    this.password = options.password || process.env.BIOTIME_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    this.timeout = options.timeout || 30000; // 30 seconds
  }

  /**
   * Authenticate and get JWT token
   */
  async authenticate() {
    try {
      const response = await axios.post(
        `${this.baseUrl}/jwt-api-token-auth/`,
        {
          username: this.username,
          password: this.password,
        },
        {
          timeout: this.timeout,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data && response.data.token) {
        this.token = response.data.token;
        // Token typically expires in 24 hours, set expiry to 23 hours from now
        this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
        console.log("BioTime authentication successful");
        return true;
      } else {
        throw new Error("Invalid authentication response");
      }
    } catch (error) {
      console.error("BioTime authentication failed:", error.message);
      throw error;
    }
  }

  /**
   * Get authorization headers
   */
  getAuthHeaders() {
    if (!this.token || Date.now() > this.tokenExpiry) {
      throw new Error("No valid token available. Please authenticate first.");
    }
    return {
      Authorization: `JWT ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Make authenticated API request
   */
  async makeRequest(method, endpoint, data = null, params = null) {
    try {
      // Re-authenticate if token is expired or missing
      if (!this.token || Date.now() > this.tokenExpiry) {
        await this.authenticate();
      }

      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: this.getAuthHeaders(),
        timeout: this.timeout,
      };

      if (
        data &&
        (method === "post" || method === "put" || method === "patch")
      ) {
        config.data = data;
      }

      if (params) {
        config.params = params;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        // API returned an error
        console.error(
          `BioTime API error [${error.response.status}]:`,
          error.response.data,
        );
        throw new Error(
          `BioTime API error: ${error.response.data.msg || error.response.statusText}`,
        );
      } else if (error.code === "ECONNABORTED") {
        throw new Error("BioTime API request timeout");
      } else {
        throw error;
      }
    }
  }

  /**
   * Get employees from BioTime
   */
  async getEmployees(filters = {}) {
    const params = {};
    if (filters.emp_code) params.emp_code = filters.emp_code;
    if (filters.page) params.page = filters.page;
    if (filters.page_size) params.page_size = filters.page_size;

    return await this.makeRequest(
      "get",
      "/personnel/api/employees/",
      null,
      params,
    );
  }

  /**
   * Create employee in BioTime
   */
  async createEmployee(employeeData) {
    const data = {
      emp_code: employeeData.emp_code,
      department: employeeData.department_id,
      area: employeeData.area_ids || [],
      hire_date: employeeData.hire_date,
      first_name: employeeData.first_name,
      last_name: employeeData.last_name,
      mobile: employeeData.mobile,
      email: employeeData.email,
      app_status: employeeData.fee_status === "paid" ? 1 : 0, // Enable/Disable based on fee status
    };

    return await this.makeRequest("post", "/personnel/api/employees/", data);
  }

  /**
   * Update employee in BioTime
   */
  async updateEmployee(employeeId, employeeData) {
    const data = {
      emp_code: employeeData.emp_code,
      department: employeeData.department_id,
      area: employeeData.area_ids || [],
      first_name: employeeData.first_name,
      last_name: employeeData.last_name,
      mobile: employeeData.mobile,
      email: employeeData.email,
      app_status: employeeData.fee_status === "paid" ? 1 : 0, // Enable/Disable based on fee status
    };

    return await this.makeRequest(
      "put",
      `/personnel/api/employees/${employeeId}/`,
      data,
    );
  }

  /**
   * Update employee access status based on fee status
   */
  async updateEmployeeAccess(employeeId, feeStatus, areaIds) {
    const data = {
      app_status: feeStatus === "paid" ? 1 : 0, // 1 = Enable, 0 = Disable
      area: areaIds, // Set area based on fee status
    };

    return await this.makeRequest(
      "put",
      `/personnel/api/employees/${employeeId}/`,
      data,
    );
  }

  /**
   * Resync employee to devices
   */
  async resyncEmployeeToDevice(employeeIds) {
    const data = {
      employees: Array.isArray(employeeIds) ? employeeIds : [employeeIds],
    };

    console.log(
      `Resyncing employees ${data.employees.join(",")} to devices...`,
    );
    const result = await this.makeRequest(
      "post",
      "/personnel/api/employees/resync_to_device/",
      data,
    );
    console.log(`Resync completed for employees ${data.employees.join(",")}`);
    return result;
  }

  /**
   * Get attendance transactions
   */
  async getTransactions(filters = {}) {
    const params = {};
    if (filters.start_time) params.start_time = filters.start_time;
    if (filters.end_time) params.end_time = filters.end_time;
    if (filters.emp_code) params.emp_code = filters.emp_code;
    if (filters.terminal_sn) params.terminal_sn = filters.terminal_sn;
    if (filters.page) params.page = filters.page;
    if (filters.page_size) params.page_size = filters.page_size;

    return await this.makeRequest(
      "get",
      "/iclock/api/transactions/",
      null,
      params,
    );
  }

  /**
   * Get devices
   */
  async getDevices(filters = {}) {
    const params = {};
    if (filters.sn) params.sn = filters.sn;
    if (filters.alias) params.alias = filters.alias;
    if (filters.page) params.page = filters.page;
    if (filters.page_size) params.page_size = filters.page_size;

    return await this.makeRequest(
      "get",
      "/iclock/api/terminals/",
      null,
      params,
    );
  }

  /**
   * Upload transactions from device
   */
  async uploadTransactionsFromDevice(deviceIds) {
    const data = {
      terminals: Array.isArray(deviceIds) ? deviceIds : [deviceIds],
    };

    return await this.makeRequest(
      "post",
      "/iclock/api/terminals/upload_transaction/",
      data,
    );
  }

  /**
   * Get attendance report
   */
  async getAttendanceReport(filters = {}) {
    const params = {};
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    if (filters.departments) params.departments = filters.departments;
    if (filters.areas) params.areas = filters.areas;
    if (filters.page) params.page = filters.page;
    if (filters.page_size) params.page_size = filters.page_size;

    return await this.makeRequest(
      "get",
      "/att/api/transactionReport/",
      null,
      params,
    );
  }

  /**
   * Sync student data to BioTime
   */
  async syncStudent(studentData) {
    try {
      console.log(
        `Checking if student ${studentData.studentId} exists in BioTime...`,
      );

      // Check if student exists
      const existingStudents = await this.getEmployees({
        emp_code: studentData.studentId,
      });

      if (existingStudents.data && existingStudents.data.length > 0) {
        // Update existing student
        const bioTimeEmployee = existingStudents.data[0];
        console.log(
          `Student ${studentData.studentId} exists (ID: ${bioTimeEmployee.id}), updating...`,
        );

        await this.updateEmployee(bioTimeEmployee.id, studentData);
        // Adjust area
        await this.adjustEmployeeArea(
          [bioTimeEmployee.id],
          studentData.area_ids,
        );
        // Resync to device
        await this.resyncEmployeeToDevice([bioTimeEmployee.id]);
        console.log(
          `Updated student ${studentData.studentId} in BioTime with areas ${studentData.area_ids.join(",")}`,
        );
        return bioTimeEmployee.id;
      } else {
        // Create new student
        console.log(
          `Student ${studentData.studentId} does not exist, creating...`,
        );

        const result = await this.createEmployee(studentData);
        // Adjust area
        await this.adjustEmployeeArea([result.id], studentData.area_ids);
        // Resync to device
        await this.resyncEmployeeToDevice([result.id]);
        console.log(
          `Created student ${studentData.studentId} in BioTime (ID: ${result.id}) with areas ${studentData.area_ids.join(",")}`,
        );
        return result.id;
      }
    } catch (error) {
      console.error(
        `Failed to sync student ${studentData.studentId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Update student access based on fee status
   */
  async updateStudentAccess(studentId, feeStatus, areaIds) {
    try {
      const existingStudents = await this.getEmployees({ emp_code: studentId });

      if (existingStudents.data && existingStudents.data.length > 0) {
        const bioTimeEmployee = existingStudents.data[0];
        await this.adjustEmployeeArea([bioTimeEmployee.id], areaIds);

        // Resync to device to apply changes immediately
        await this.resyncEmployeeToDevice([bioTimeEmployee.id]);

        console.log(
          `Updated access for student ${studentId} to ${feeStatus} (area: ${areaIds.join(", ") || "default"})`,
        );
        return true;
      } else {
        console.warn(`Student ${studentId} not found in BioTime`);
        return false;
      }
    } catch (error) {
      console.error(
        `Failed to update access for student ${studentId}:`,
        error.message,
      );
      throw error;
    }
  }
  /**
   * Adjust employee areas using the correct BioTime API
   */
  async adjustEmployeeArea(employeeIds, areaIds) {
    const data = {
      employees: Array.isArray(employeeIds) ? employeeIds : [employeeIds],
      areas: Array.isArray(areaIds) ? areaIds : [areaIds],
    };

    console.log(
      `Adjusting areas for employees ${data.employees} to areas ${data.areas}`,
    );
    const result = await this.makeRequest(
      "post",
      "/personnel/api/employees/adjust_area/",
      data,
    );
    console.log(`Area adjustment result:`, result);
    return result;
  }
}

module.exports = BioTimeService;
