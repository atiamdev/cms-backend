/**
 * Equity Bank IP Whitelist Middleware
 *
 * Restricts access to Equity Bank API endpoints based on IP address
 * Provides additional security layer for production environments
 */

/**
 * Middleware to whitelist Equity Bank IP addresses
 * Only allows requests from pre-configured IP addresses
 */
const equityIPWhitelist = (req, res, next) => {
  // Check if IP whitelisting is enabled
  const isEnabled = process.env.EQUITY_IP_WHITELIST_ENABLED === "true";

  // Skip in development mode or if disabled
  if (process.env.NODE_ENV === "development" || !isEnabled) {
    return next();
  }

  // Get allowed IPs from environment variable
  const allowedIPs =
    process.env.EQUITY_ALLOWED_IPS?.split(",").map((ip) => ip.trim()) || [];

  if (allowedIPs.length === 0) {
    console.warn("⚠️  IP whitelist enabled but no IPs configured");
    return next(); // Allow if no IPs configured (fail-open for safety)
  }

  // Get client IP address
  // Check X-Forwarded-For header first (for proxies/load balancers)
  const clientIP =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress;

  // Normalize IPv6 localhost to IPv4
  const normalizedIP = clientIP === "::1" ? "127.0.0.1" : clientIP;

  // Check if IP is whitelisted
  if (!allowedIPs.includes(normalizedIP)) {
    console.warn(
      `🚫 Equity API access denied from non-whitelisted IP: ${normalizedIP}`,
    );

    return res.status(403).json({
      responseCode: "403",
      responseMessage: "Access denied",
    });
  }

  // Log successful IP validation
  console.log(
    `✅ Equity API access granted to whitelisted IP: ${normalizedIP}`,
  );

  next();
};

/**
 * Middleware to log all IP addresses for monitoring
 * Helps identify IPs that should be whitelisted
 */
const logIPAddress = (req, res, next) => {
  const clientIP =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress;

  console.log(`📍 Equity API request from IP: ${clientIP}`);

  next();
};

/**
 * Middleware to check if IP is in a specific range (CIDR notation)
 * More flexible than exact IP matching
 */
const isIPInRange = (ip, cidr) => {
  // Basic CIDR check - would need a proper library for production
  // This is a simplified version
  const [range, bits] = cidr.split("/");

  // For now, just do exact match
  // TODO: Implement proper CIDR range checking
  return ip === range;
};

module.exports = {
  equityIPWhitelist,
  logIPAddress,
  isIPInRange,
};
