const helmet = require("helmet");

/**
 * Security middleware configuration
 * Addresses OWASP security headers and vulnerability scanner findings
 */
const securityMiddleware = (app) => {
  // Configure Helmet with comprehensive security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://portal.atiamcollege.com",
            "https://www.atiamcollege.com",
            "https://fonts.googleapis.com",
            "https://fonts.gstatic.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
            "https://fonts.gstatic.com",
            "https://portal.atiamcollege.com",
          ],
          fontSrc: [
            "'self'",
            "https://fonts.googleapis.com",
            "https://fonts.gstatic.com",
          ],
          imgSrc: [
            "'self'",
            "data:",
            "https:",
            "blob:",
            "https://portal.atiamcollege.com",
          ],
          connectSrc: [
            "'self'",
            "https://portal.atiamcollege.com",
            "https://www.atiamcollege.com",
            "ws:",
            "wss:",
            "http://localhost:5000", // For development
          ],
          frameSrc: ["'none'"], // Prevent framing
          frameAncestors: ["'none'"], // Prevent clickjacking
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", "https:", "blob:"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // Disable COEP for compatibility
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      originAgentCluster: true,
      dnsPrefetchControl: { allow: false },
    })
  );

  // Additional security headers
  app.use((req, res, next) => {
    // X-Frame-Options for additional clickjacking protection
    res.setHeader("X-Frame-Options", "DENY");

    // X-Content-Type-Options (already set by helmet.noSniff)
    // X-XSS-Protection (already set by helmet.xssFilter)

    // Remove server information
    res.removeHeader("X-Powered-By");

    // Additional security headers
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

    // Permissions Policy (formerly Feature Policy)
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );

    next();
  });
};

module.exports = securityMiddleware;
