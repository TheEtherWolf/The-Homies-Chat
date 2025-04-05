/**
 * Email Verification Module for The Homies App
 * Handles sending verification emails and verifying verification codes
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Store verification codes temporarily (in production, these would go in a database)
const verificationCodes = new Map();
const pendingRegistrations = new Map();

// Code expiration time in milliseconds (30 minutes)
const CODE_EXPIRATION = 30 * 60 * 1000;

// Email sending configuration
let transporter;
try {
  // For Proton Mail, use their SMTP settings
  transporter = nodemailer.createTransport({
    host: 'smtp.protonmail.ch',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER || 'TheHomiesChatBot@proton.me',
      pass: process.env.EMAIL_PASSWORD
    },
    tls: {
      // Do not fail on invalid certificates
      rejectUnauthorized: false
    }
  });
  console.log('Email transport initialized for Proton Mail');
} catch (error) {
  console.error('Failed to initialize email transport:', error);
}

/**
 * Generate a random verification code
 * @returns {string} - 6-digit verification code
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
    // Check if we're in development mode
    if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_PASSWORD) {
      console.log('Development mode: skipping email verification');
      
      // Create user directly in development mode
      const devUser = {
        username,
        password,
        email,
        id: 'dev-' + Date.now()
      };
      
      console.log(`Development user created: ${username} (${email})`);
      return true;
    }
    
    // Generate verification code
    const code = generateVerificationCode();
    
    // Store code for later verification
    verificationCodes.set(email, {
      code,
      expires: Date.now() + CODE_EXPIRATION
    });
    
    // Store user data for registration after verification
    pendingRegistrations.set(email, {
      username,
      password,
      timestamp: Date.now()
    });
    
    // Determine email provider for customized instructions
    const parts = email.split('@');
    const domain = (parts.length > 1 && parts[1]) ? parts[1].toLowerCase() : '';
    let providerInfo = {
      name: 'your email service',
      instructions: 'Please check your inbox and spam/junk folders for the verification code.'
    };
    
    if (domain.includes('gmail')) {
      providerInfo.name = 'Gmail';
      providerInfo.instructions = 'Please check your inbox and spam folders. If not found, check the "Promotions" or "Updates" tabs.';
    } else if (domain.includes('yahoo')) {
      providerInfo.name = 'Yahoo Mail';
      providerInfo.instructions = 'Please check your inbox and spam folders. Yahoo may filter verification emails as spam.';
    } else if (domain.includes('proton') || domain.includes('pm.me')) {
      providerInfo.name = 'Proton Mail';
      providerInfo.instructions = 'Please check your inbox and spam folders.';
    } else if (domain.includes('outlook') || domain.includes('hotmail')) {
      providerInfo.name = 'Outlook';
      providerInfo.instructions = 'Please check your inbox and junk folders. Outlook may filter verification emails as junk.';
    }
    
    // Email template
    const mailOptions = {
      from: `"The Homies Chat" <${process.env.EMAIL_USER || 'TheHomiesChatBot@proton.me'}>`,
      to: email,
      subject: 'Verify your The Homies App account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3498db;">Welcome to The Homies App!</h2>
          <p>Hello ${username},</p>
          <p>Thank you for registering with The Homies App. To complete your registration, please use the following verification code:</p>
          <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code will expire in 30 minutes.</p>
          <p><strong>Important:</strong> ${providerInfo.instructions}</p>
          <p>If you did not request this verification code, please ignore this email.</p>
          <p>Thank you,<br>The Homies App Team</p>
        </div>
      `
    };
    
    // Send email
    try {
      await transporter.sendMail(mailOptions);
      console.log(`Verification email sent to ${email} (${providerInfo.name})`);
      return true;
    } catch (emailError) {
      console.error(`Error sending verification email:`, emailError);
      
      // For development testing, still return success but log the error
      if (process.env.NODE_ENV === 'development') {
        console.log(`Development mode: Simulating successful email send despite error`);
        console.log(`Verification code for ${email} is ${code}`);
        return true;
      }
      
      return false;
    }
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
}

/**
 * Verify a verification code
 * @param {string} email - Email address associated with the code
 * @param {string} code - Verification code to verify
 * @returns {object|null} - User data if verification successful, null otherwise
 */
function verifyCode(email, code) {
  // Check if code exists for this email
  if (!verificationCodes.has(email)) {
    console.log(`No verification code found for ${email}`);
    return null;
  }
  
  const verification = verificationCodes.get(email);
  
  // Check if code is expired
  if (Date.now() > verification.expires) {
    console.log(`Verification code for ${email} has expired`);
    verificationCodes.delete(email);
    pendingRegistrations.delete(email);
    return null;
  }
  
  // Check if code matches
  if (verification.code !== code) {
    console.log(`Invalid verification code for ${email}`);
    return null;
  }
  
  // Get pending registration data
  if (!pendingRegistrations.has(email)) {
    console.log(`No pending registration found for ${email}`);
    return null;
  }
  
  const userData = pendingRegistrations.get(email);
  
  // Clear code and pending registration
  verificationCodes.delete(email);
  pendingRegistrations.delete(email);
  
  console.log(`Verification successful for ${email}`);
  return {
    username: userData.username,
    password: userData.password,
    email
  };
}

/**
 * Get verification code expiration time
 * @param {string} email - Email address
 * @returns {Date|null} - Expiration date or null if no code
 */
function getVerificationExpiration(email) {
  if (!verificationCodes.has(email)) {
    return null;
  }
  
  return new Date(verificationCodes.get(email).expires);
}

/**
 * Resend verification email
 * @param {string} email - Email address to resend to
 * @returns {Promise<boolean>} - Success status
 */
async function resendVerificationEmail(email) {
  try {
    if (!pendingRegistrations.has(email)) {
      console.log(`No pending registration found for ${email}`);
      return false;
    }
    
    const userData = pendingRegistrations.get(email);
    
    // Send new verification email
    return await sendVerificationEmail(email, userData.username, userData.password);
  } catch (error) {
    console.error('Error resending verification email:', error);
    return false;
  }
}

module.exports = {
  sendVerificationEmail,
  verifyCode,
  getVerificationExpiration,
  resendVerificationEmail
};
