const net = require("net");
const dgram = require("dgram");
const EventEmitter = require("events");

class ZKTecoService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.ip = options.ip || "192.168.1.201";
    this.port = options.port || 4370;
    this.timeout = options.timeout || 5000;
    this.internalip = options.internalip || "192.168.1.100";
    this.socket = null;
    this.sessionId = null;
    this.replyId = 0;
    this.connected = false;
  }

  // Command constants
  static COMMANDS = {
    CMD_CONNECT: 1000,
    CMD_EXIT: 1001,
    CMD_ENABLEDEVICE: 1002,
    CMD_DISABLEDEVICE: 1003,
    CMD_RESTART: 1004,
    CMD_POWEROFF: 1005,
    CMD_SLEEP: 1006,
    CMD_RESUME: 1007,
    CMD_TEST_TEMP: 1011,
    CMD_TESTVOICE: 1017,
    CMD_VERSION: 1100,
    CMD_CHANGE_SPEED: 1101,
    CMD_AUTH: 1102,
    CMD_PREPARE_DATA: 1500,
    CMD_DATA: 1501,
    CMD_FREE_DATA: 1502,
    CMD_DATA_WRRQ: 1503,
    CMD_DATA_RDY: 1504,
    CMD_EF_FLAG: 1505,
    CMD_ADATA_WRRQ: 1506,
    CMD_ADATA_RDY: 1507,
    CMD_USERTEMP_RRQ: 1508,
    CMD_USERTEMP_WRQ: 1509,
    CMD_OPTIONS_RRQ: 1510,
    CMD_OPTIONS_WRQ: 1511,
    CMD_ATTLOG_RRQ: 1700,
    CMD_CLEAR_DATA: 1701,
    CMD_CLEAR_ATTLOG: 1702,
    CMD_DELETE_USER: 1703,
    CMD_DELETE_USERTEMP: 1704,
    CMD_CLEAR_ADMIN: 1705,
    CMD_USERINFO_RRQ: 1708,
    CMD_USERINFO_WRQ: 1709,
    CMD_DOORSTATE_RRQ: 1710,
    CMD_DOORSTATE_WRQ: 1711,
    CMD_WRITE_LCD: 1712,
    CMD_CLEAR_LCD: 1713,
    CMD_GET_PINWIDTH: 1721,
    CMD_SMS_WRQ: 1722,
    CMD_SMS_RRQ: 1723,
    CMD_DELETE_SMS: 1724,
    CMD_ENABLE_CLOCK: 1725,
    CMD_STARTVERIFY: 1726,
    CMD_STARTENROLL: 1727,
    CMD_CANCELCAPTURE: 1728,
    CMD_STATE_RRQ: 1729,
    CMD_WRITE_MIFARE: 1730,
    CMD_EMPTY_MIFARE: 1731,
    CMD_VERIFY_WRQ: 1732,
    CMD_VERIFY_RRQ: 1733,
    CMD_TMP_WRITE: 1734,
    CMD_CHECKSUM_BUFFER: 1735,
    CMD_DEL_FPTMP: 1736,
    CMD_GET_TIME: 1737,
    CMD_SET_TIME: 1738,
    CMD_REG_EVENT: 1739,
  };

  // Response codes
  static RESPONSE = {
    CMD_ACK_OK: 2000,
    CMD_ACK_ERROR: 2001,
    CMD_ACK_DATA: 2002,
    CMD_ACK_RETRY: 2003,
    CMD_ACK_REPEAT: 2004,
    CMD_ACK_UNAUTH: 2005,
    CMD_ACK_UNKNOWN: 0xffff,
    CMD_ACK_ERROR_CMD: 0xfffd,
    CMD_ACK_ERROR_INIT: 0xfffc,
    CMD_ACK_ERROR_DATA: 0xfffb,
  };

  // Create command packet
  createCommand(command, data = Buffer.alloc(0)) {
    const buf = Buffer.alloc(8 + data.length);
    buf.writeUInt16LE(command, 0);
    buf.writeUInt16LE(0, 2); // checksum (calculated later)
    buf.writeUInt16LE(this.sessionId || 0, 4);
    buf.writeUInt16LE(this.replyId, 6);

    if (data.length > 0) {
      data.copy(buf, 8);
    }

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < buf.length; i += 2) {
      if (i === 2) continue; // Skip checksum field
      checksum += buf.readUInt16LE(i);
    }
    buf.writeUInt16LE(checksum & 0xffff, 2);

    this.replyId = (this.replyId + 1) % 0xffff;
    return buf;
  }

  // Parse response packet
  parseResponse(buffer) {
    if (buffer.length < 8) {
      throw new Error("Invalid response packet");
    }

    return {
      command: buffer.readUInt16LE(0),
      checksum: buffer.readUInt16LE(2),
      sessionId: buffer.readUInt16LE(4),
      replyId: buffer.readUInt16LE(6),
      data: buffer.slice(8),
    };
  }

  // Connect to device
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.setTimeout(this.timeout);

      this.socket.on("connect", async () => {
        try {
          const response = await this.sendCommand(
            ZKTecoService.COMMANDS.CMD_CONNECT
          );
          if (response.command === ZKTecoService.RESPONSE.CMD_ACK_OK) {
            this.sessionId = response.sessionId;
            this.connected = true;
            this.emit("connected");
            resolve(true);
          } else {
            reject(new Error("Connection failed"));
          }
        } catch (error) {
          reject(error);
        }
      });

      this.socket.on("error", (error) => {
        this.connected = false;
        this.emit("error", error);
        reject(error);
      });

      this.socket.on("timeout", () => {
        this.connected = false;
        this.emit("timeout");
        reject(new Error("Connection timeout"));
      });

      this.socket.connect(this.port, this.ip);
    });
  }

  // Disconnect from device
  async disconnect() {
    if (this.connected && this.socket) {
      try {
        await this.sendCommand(ZKTecoService.COMMANDS.CMD_EXIT);
      } catch (error) {
        console.warn("Error during disconnect:", error.message);
      }

      this.socket.destroy();
      this.connected = false;
      this.sessionId = null;
      this.emit("disconnected");
    }
  }

  // Send command to device
  async sendCommand(command, data = Buffer.alloc(0)) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected to device"));
        return;
      }

      const packet = this.createCommand(command, data);

      const onData = (buffer) => {
        try {
          const response = this.parseResponse(buffer);
          this.socket.removeListener("data", onData);
          resolve(response);
        } catch (error) {
          this.socket.removeListener("data", onData);
          reject(error);
        }
      };

      this.socket.on("data", onData);
      this.socket.write(packet);

      // Set timeout for command
      setTimeout(() => {
        this.socket.removeListener("data", onData);
        reject(new Error("Command timeout"));
      }, this.timeout);
    });
  }

  // Get attendance logs
  async getAttendanceLogs() {
    try {
      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_ATTLOG_RRQ
      );

      if (response.command !== ZKTecoService.RESPONSE.CMD_ACK_DATA) {
        throw new Error("Failed to get attendance logs");
      }

      return this.parseAttendanceLogs(response.data);
    } catch (error) {
      throw new Error(`Failed to get attendance logs: ${error.message}`);
    }
  }

  // Parse attendance log data
  parseAttendanceLogs(data) {
    const logs = [];
    const recordSize = 40; // Size of each attendance record

    for (let i = 0; i < data.length; i += recordSize) {
      if (i + recordSize > data.length) break;

      const record = data.slice(i, i + recordSize);

      // Parse attendance record
      const enrollNumber = record.readUInt16LE(0);
      const verifyMode = record.readUInt8(2);
      const inOutMode = record.readUInt8(3);
      const year = record.readUInt16LE(4);
      const month = record.readUInt8(6);
      const day = record.readUInt8(7);
      const hour = record.readUInt8(8);
      const minute = record.readUInt8(9);
      const second = record.readUInt8(10);
      const workCode = record.readUInt8(11);

      // Create date object
      const timestamp = new Date(year, month - 1, day, hour, minute, second);

      logs.push({
        enrollNumber,
        verifyMode, // 1: Fingerprint, 2: Card, 3: Password
        inOutMode, // 0: Check In, 1: Check Out
        timestamp,
        workCode,
        rawData: record.toString("hex"),
      });
    }

    return logs;
  }

  // Get device information
  async getDeviceInfo() {
    try {
      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_VERSION
      );

      if (response.command !== ZKTecoService.RESPONSE.CMD_ACK_OK) {
        throw new Error("Failed to get device info");
      }

      return {
        version: response.data.toString("ascii").trim(),
        sessionId: this.sessionId,
        connected: this.connected,
      };
    } catch (error) {
      throw new Error(`Failed to get device info: ${error.message}`);
    }
  }

  // Get current time from device
  async getTime() {
    try {
      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_GET_TIME
      );

      if (response.command !== ZKTecoService.RESPONSE.CMD_ACK_OK) {
        throw new Error("Failed to get time");
      }

      // Parse time data (4 bytes representing seconds since epoch)
      const timestamp = response.data.readUInt32LE(0);
      return new Date(timestamp * 1000);
    } catch (error) {
      throw new Error(`Failed to get time: ${error.message}`);
    }
  }

  // Set time on device
  async setTime(date = new Date()) {
    try {
      const timestamp = Math.floor(date.getTime() / 1000);
      const timeData = Buffer.alloc(4);
      timeData.writeUInt32LE(timestamp, 0);

      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_SET_TIME,
        timeData
      );

      if (response.command !== ZKTecoService.RESPONSE.CMD_ACK_OK) {
        throw new Error("Failed to set time");
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to set time: ${error.message}`);
    }
  }

  // Clear attendance logs
  async clearAttendanceLogs() {
    try {
      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_CLEAR_ATTLOG
      );

      if (response.command !== ZKTecoService.RESPONSE.CMD_ACK_OK) {
        throw new Error("Failed to clear attendance logs");
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to clear attendance logs: ${error.message}`);
    }
  }

  // Enable/disable device
  async enableDevice() {
    try {
      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_ENABLEDEVICE
      );
      return response.command === ZKTecoService.RESPONSE.CMD_ACK_OK;
    } catch (error) {
      throw new Error(`Failed to enable device: ${error.message}`);
    }
  }

  async disableDevice() {
    try {
      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_DISABLEDEVICE
      );
      return response.command === ZKTecoService.RESPONSE.CMD_ACK_OK;
    } catch (error) {
      throw new Error(`Failed to disable device: ${error.message}`);
    }
  }

  // Test connection
  async testConnection() {
    try {
      const response = await this.sendCommand(
        ZKTecoService.COMMANDS.CMD_TEST_TEMP
      );
      return response.command === ZKTecoService.RESPONSE.CMD_ACK_OK;
    } catch (error) {
      return false;
    }
  }
}

module.exports = ZKTecoService;
