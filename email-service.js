/**
 * Email Service for The Homies App
 * Handles sending verification emails and notifications
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

// Email configuration from environment variables
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true';

// Create email transport
let transporter = null;
let emailEnabled = false;

/**
 * Initialize email service
 * @returns {boolean} - Success status
 */
function initializeEmailService() {
  try {
    if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS) {
      console.warn('Email credentials not provided. Email features will be disabled.');
      return false;
    }

    console.log('Initializing email service...');
    
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: parseInt(EMAIL_PORT),
      secure: EMAIL_SECURE,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false,
        // Specify minimum TLS version
        minVersion: 'TLSv1.2'
      }
    });
    
    emailEnabled = true;
    console.log('Email service initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize email service:', error);
    emailEnabled = false;
    return false;
  }
}

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text content
 * @param {string} html - HTML content
 * @returns {Promise<boolean>} - Success status
 */
async function sendEmail(to, subject, text, html) {
  try {
    if (!emailEnabled || !transporter) {
      if (!initializeEmailService()) {
        console.warn('Email service not available. Email not sent.');
        return false;
      }
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to,
      subject,
      text,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Send verification email
 * @param {string} to - Recipient email
 * @param {string} username - Username
 * @param {string} verificationToken - Verification token
 * @returns {Promise<boolean>} - Success status
 */
async function sendVerificationEmail(to, username, verificationToken) {
  const verificationUrl = `${process.env.APP_URL || 'https://the-homies-app.glitch.me'}/verify?token=${verificationToken}`;
  
  const subject = 'Verify your email for The Homies App';
  const text = `Hello ${username},\n\nPlease verify your email address by clicking the link below:\n${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you did not sign up for The Homies App, please ignore this email.\n\nBest,\nThe Homies App Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #5865F2; padding: 20px; text-align: center; color: white;">
        <h1>The Homies App</h1>
      </div>
      <div style="padding: 20px; background-color: #f9f9f9;">
        <p>Hello ${username},</p>
        <p>Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #5865F2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
        </div>
        <p>This link expires in 24 hours.</p>
        <p>If you did not sign up for The Homies App, please ignore this email.</p>
        <p>Best,<br>The Homies App Team</p>
      </div>
      <div style="background-color: #2F3136; padding: 15px; text-align: center; color: #B9BBBE; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} The Homies App. All rights reserved.</p>
      </div>
    </div>
  `;
  
  return sendEmail(to, subject, text, html);
}

/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} username - Username
 * @param {string} resetToken - Reset token
 * @returns {Promise<boolean>} - Success status
 */
async function sendPasswordResetEmail(to, username, resetToken) {
  const resetUrl = `${process.env.APP_URL || 'https://the-homies-app.glitch.me'}/reset-password?token=${resetToken}`;
  
  const subject = 'Reset your password for The Homies App';
  const text = `Hello ${username},\n\nYou recently requested to reset your password. Please click the link below to set a new password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request a password reset, please ignore this email.\n\nBest,\nThe Homies App Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #5865F2; padding: 20px; text-align: center; color: white;">
        <h1>The Homies App</h1>
      </div>
      <div style="padding: 20px; background-color: #f9f9f9;">
        <p>Hello ${username},</p>
        <p>You recently requested to reset your password. Please click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #5865F2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
        </div>
        <p>This link expires in 1 hour.</p>
        <p>If you did not request a password reset, please ignore this email.</p>
        <p>Best,<br>The Homies App Team</p>
      </div>
      <div style="background-color: #2F3136; padding: 15px; text-align: center; color: #B9BBBE; font-size: 12px;">
        <p>&copy; ${new Date().getFullYear()} The Homies App. All rights reserved.</p>
      </div>
    </div>
  `;
  
  return sendEmail(to, subject, text, html);
}

module.exports = {
  initializeEmailService,
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail
};
