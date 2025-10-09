const nodemailer = require("nodemailer");

// Create transporter with Brevo SMTP configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp-relay.brevo.com",
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Send email function
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "ATIAM CMS"}" <${
        process.env.EMAIL_FROM || "noreply@atiamcollege.com"
      }>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email sending failed:", error);
    throw new Error(`Email could not be sent: ${error.message}`);
  }
};

// Email templates
const emailTemplates = {
  passwordReset: (resetUrl, userName) => ({
    subject: "Password Reset Request - ATIAM CMS",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - ATIAM CMS</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #317546 0%, #65E62E 50%, #35B53B 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #65E62E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Password Reset Request</h1>
          <p>ATIAM College Management System</p>
        </div>
        <div class="content">
          <p>Hello ${userName},</p>
          <p>You have requested to reset your password for your ATIAM CMS account.</p>
          <p>Please click the button below to reset your password:</p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <div class="warning">
            <strong>Important:</strong> This link will expire in 10 minutes for security reasons.
          </div>
          <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
        </div>
        <div class="footer">
          <p>This email was sent by ATIAM College Management System</p>
          <p>If you have any questions, please contact support.</p>
        </div>
      </body>
      </html>
    `,
    text: `
      Password Reset Request - ATIAM CMS

      Hello ${userName},

      You have requested to reset your password for your ATIAM CMS account.

      Please click the following link to reset your password:
      ${resetUrl}

      Important: This link will expire in 10 minutes for security reasons.

      If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

      If you have any questions, please contact support.

      ATIAM College Management System
    `,
  }),

  welcome: (userName, loginUrl) => ({
    subject: "Welcome to ATIAM CMS",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ATIAM COLLEGE</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #317546 0%, #65E62E 50%, #35B53B 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #65E62E; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Welcome to ATIAM COLLEGE</h1>
          <p>Your Account Has Been Created</p>
        </div>
        <div class="content">
          <p>Hello ${userName},</p>
          <p>Welcome to the ATIAM College Management System! Your account has been successfully created.</p>
          <p>You can now log in to access the system:</p>
          <a href="${loginUrl}" class="button">Login to ATIAM CMS</a>
          <p>If you have any questions or need assistance, please contact your system administrator.</p>
        </div>
        <div class="footer">
          <p>This email was sent by ATIAM College Management System</p>
        </div>
      </body>
      </html>
    `,
    text: `
      Welcome to ATIAM COLLEGE

      Hello ${userName},

      Welcome to the ATIAM College Management System! Your account has been successfully created.

      You can now log in to access the system at:
      ${loginUrl}

      If you have any questions or need assistance, please contact your system administrator.

      ATIAM College Management System
    `,
  }),

  accountActivated: (userName, loginUrl) => ({
    subject: "Your ATIAM CMS Account Has Been Activated",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Activated - ATIAM CMS</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Account Activated</h1>
          <p>ATIAM College Management System</p>
        </div>
        <div class="content">
          <p>Hello ${userName},</p>
          <p>Great news! Your ATIAM CMS account has been activated and you can now access the system.</p>
          <a href="${loginUrl}" class="button">Login Now</a>
          <p>If you have any questions, please contact your system administrator.</p>
        </div>
        <div class="footer">
          <p>This email was sent by ATIAM College Management System</p>
        </div>
      </body>
      </html>
    `,
    text: `
      Your ATIAM CMS Account Has Been Activated

      Hello ${userName},

      Great news! Your ATIAM CMS account has been activated and you can now access the system.

      You can login at:
      ${loginUrl}

      If you have any questions, please contact your system administrator.

      ATIAM College Management System
    `,
  }),
};

module.exports = {
  sendEmail,
  emailTemplates,
  createTransporter,
};
