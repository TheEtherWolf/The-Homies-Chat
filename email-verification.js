/**
 * Email Verification Module for The Homies App
 * Handles sending verification emails and verifying verification codes
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Email credentials
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || '';

// Create email transport
let transporter = null;

// Initialize email transport
try {
  // Check if we should use Proton Mail SMTP
  if (EMAIL_USER.includes('@proton.me') || EMAIL_USER.includes('@protonmail.com') || EMAIL_USER.includes('@pm.me')) {
    transporter = nodemailer.createTransport({
      host: 'smtp.protonmail.ch',
      port: 587,
      secure: false,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      },
      debug: true
    });
    console.log('Email transport initialized for Proton Mail');
  } 
  // Gmail SMTP
  else if (EMAIL_USER.includes('@gmail.com')) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
      }
    });
    console.log('Email transport initialized for Gmail');
  }
  // Yahoo Mail SMTP
  else if (EMAIL_USER.includes('@yahoo.com')) {
    transporter = nodemailer.createTransport({
      service: 'yahoo',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
      }
    });
    console.log('Email transport initialized for Yahoo Mail');
  }
  // Default to generic SMTP
  else if (EMAIL_USER && EMAIL_PASSWORD) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
      }
    });
    console.log('Email transport initialized with generic SMTP');
  } else {
    console.log('No email credentials provided, email verification will be limited');
  }
} catch (error) {
  console.error('Failed to initialize email transport:', error);
}

// Store verification codes temporarily (in production this would be in a database)
const verificationCodes = new Map();
const pendingRegistrations = new Map();

// Verification code expiration (30 minutes)
const CODE_EXPIRATION = 30 * 60 * 1000;

/**
 * Generate a random verification code
 * @returns {string} 6-digit verification code
 */
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send verification email to a user
 * @param {string} email - Email address to send to
 * @param {string} username - Username for registration
 * @param {string} password - Password for registration
 * @returns {Promise<boolean>} - Success status
 */
async function sendVerificationEmail(email, username, password) {
  try {
    // In development mode, auto-verify without sending email
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Auto-verifying without sending email');
      
      // Store user for immediate verification
      const verificationCode = generateVerificationCode();
      console.log(`Development verification code for ${email}: ${verificationCode}`);
      
      // Store code for verification
      verificationCodes.set(email, {
        code: verificationCode,
        expires: Date.now() + CODE_EXPIRATION
      });
      
      // Store user data for registration
      pendingRegistrations.set(email, {
        username,
        password,
        timestamp: Date.now(),
        // In dev mode, we'll consider it verified already
        verified: process.env.NODE_ENV === 'development'
      });
      
      return true;
    }
  
    // Check if we have a valid email transport
    if (!transporter) {
      console.error('No email transport available');
      return false;
    }
    
    // Generate verification code
    const code = generateVerificationCode();
    
    // Store code and user data for later verification
    verificationCodes.set(email, {
      code,
      expires: Date.now() + CODE_EXPIRATION
    });
    
    pendingRegistrations.set(email, {
      username,
      password,
      timestamp: Date.now()
    });
    
    // Determine email provider for customized instructions
    const parts = email.split('@');
    const domain = (parts.length > 1 && parts[1]) ? parts[1].toLowerCase() : '';
    let providerInfo = 'your email';
    
    if (domain.includes('gmail')) {
      providerInfo = 'Gmail';
    } else if (domain.includes('yahoo')) {
      providerInfo = 'Yahoo Mail';
    } else if (domain.includes('proton') || domain.includes('pm.me')) {
      providerInfo = 'Proton Mail';
    } else if (domain.includes('outlook') || domain.includes('hotmail')) {
      providerInfo = 'Outlook';
    }
    
    // Send verification email
    const mailOptions = {
      from: EMAIL_USER,
      to: email,
      subject: 'Verify your The Homies App account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #5865F2;">Welcome to The Homies App!</h2>
          <p>Hello ${username},</p>
          <p>Thank you for registering with The Homies App. To complete your registration, please use the following verification code:</p>
          <div style="background-color: #2C2F33; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #FFFFFF;">
            ${code}
          </div>
          <p>This code will expire in 30 minutes.</p>
          <p>If you did not request this verification code, please ignore this email.</p>
          <p>Thank you,<br>The Homies App Team</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${providerInfo} account: ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    
    // In development mode, consider it a success for testing
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    
    return false;
  }
}

/**
 * Verify an email verification code
 * @param {string} email - Email address
 * @param {string} code - Verification code to verify
 * @returns {object|null} - User data if verification successful, null otherwise
 */
function verifyEmail(email, code) {
  // In development mode, skip verification if needed
  if (process.env.NODE_ENV === 'development' && pendingRegistrations.has(email)) {
    const userData = pendingRegistrations.get(email);
    if (userData.verified) {
      console.log(`Development mode: Auto-verifying ${email}`);
      
      // Clean up
      pendingRegistrations.delete(email);
      verificationCodes.delete(email);
      
      return {
        username: userData.username,
        email
      };
    }
  }
  
  // Check if code exists for this email
  if (!verificationCodes.has(email)) {
    console.log(`No verification code found for ${email}`);
    return null;
  }
  
  // Get the stored verification data
  const verificationData = verificationCodes.get(email);
  
  // Check if code has expired
  if (Date.now() > verificationData.expires) {
    console.log(`Verification code for ${email} has expired`);
    
    // Clean up expired code
    verificationCodes.delete(email);
    return null;
  }
  
  // Check if code matches
  if (verificationData.code !== code) {
    console.log(`Invalid verification code for ${email}`);
    return null;
  }
  
  // Get user data
  if (!pendingRegistrations.has(email)) {
    console.log(`No registration data found for ${email}`);
    return null;
  }
  
  const userData = pendingRegistrations.get(email);
  
  // Clean up
  verificationCodes.delete(email);
  pendingRegistrations.delete(email);
  
  console.log(`Email verified successfully: ${email}`);
  
  return {
    username: userData.username,
    password: userData.password,
    email
  };
}

/**
 * Check if a verification code is still valid
 * @param {string} email - Email address
 * @returns {number|null} - Milliseconds until expiration or null if no valid code
 */
function getVerificationExpiration(email) {
  if (!verificationCodes.has(email)) {
    return null;
  }
  
  const verificationData = verificationCodes.get(email);
  const timeRemaining = verificationData.expires - Date.now();
  
  return timeRemaining > 0 ? timeRemaining : null;
}

/**
 * Resend verification email
 * @param {string} email - Email address
 * @returns {Promise<boolean>} - Success status
 */
async function resendVerificationEmail(email) {
  try {
    // Check if we have pending registration data
    if (!pendingRegistrations.has(email)) {
      console.log(`No registration data found for ${email}`);
      return false;
    }
    
    const userData = pendingRegistrations.get(email);
    
    // Generate a new verification code
    const newCode = generateVerificationCode();
    
    // Update the stored verification data
    verificationCodes.set(email, {
      code: newCode,
      expires: Date.now() + CODE_EXPIRATION
    });
    
    // In development mode, just log the code
    if (process.env.NODE_ENV === 'development') {
      console.log(`Development verification code for ${email}: ${newCode}`);
      return true;
    }
    
    // Check if we have an active transporter
    if (!transporter) {
      console.error('No email transport available');
      return false;
    }
    
    // Send a new verification email
    const mailOptions = {
      from: EMAIL_USER,
      to: email,
      subject: 'Your new verification code for The Homies App',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #5865F2;">The Homies App Verification</h2>
          <p>Hello ${userData.username},</p>
          <p>You requested a new verification code. Please use the following code to verify your account:</p>
          <div style="background-color: #2C2F33; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #FFFFFF;">
            ${newCode}
          </div>
          <p>This code will expire in 30 minutes.</p>
          <p>If you did not request this verification code, please ignore this email.</p>
          <p>Thank you,<br>The Homies App Team</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`New verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error resending verification email:', error);
    return false;
  }
}

module.exports = {
  sendVerificationEmail,
  verifyEmail,
  getVerificationExpiration,
  resendVerificationEmail
};
