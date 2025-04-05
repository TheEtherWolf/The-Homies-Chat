/**
 * SendGrid Email Service for The Homies App
 * Handles email verification and notifications
 */

require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const { v4: uuidv4 } = require('uuid');

// Initialize SendGrid with API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid initialized successfully');
} else {
  console.log('SendGrid API key not found, email services will be limited');
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
    // In development mode without SendGrid API key, auto-verify
    if (process.env.NODE_ENV === 'development' && !process.env.SENDGRID_API_KEY) {
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
    
    // Try to send email with SendGrid
    if (process.env.SENDGRID_API_KEY) {
      const msg = {
        to: email,
        from: process.env.EMAIL_FROM || 'noreply@homiesapp.com',
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
            <p><strong>Important:</strong> ${providerInfo.instructions}</p>
            <p>If you did not request this verification code, please ignore this email.</p>
            <p>Thank you,<br>The Homies App Team</p>
          </div>
        `
      };
      
      try {
        await sgMail.send(msg);
        console.log(`Verification email sent to ${email} (${providerInfo.name}) via SendGrid`);
        return true;
      } catch (sendgridError) {
        console.error('SendGrid Error:', sendgridError);
        
        // For development, still consider it a success
        if (process.env.NODE_ENV === 'development') {
          console.log(`Development mode: Verification code for ${email} is ${code}`);
          return true;
        }
        
        return false;
      }
    } else {
      // No SendGrid API key, but still store the code for testing
      console.log(`No SendGrid API key. Development verification code for ${email}: ${code}`);
      return process.env.NODE_ENV === 'development';
    }
  } catch (error) {
    console.error('Error sending verification email:', error);
    return process.env.NODE_ENV === 'development'; // Allow in development
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
    if (process.env.NODE_ENV === 'development' && !process.env.SENDGRID_API_KEY) {
      console.log(`Development verification code for ${email}: ${newCode}`);
      return true;
    }
    
    // Try to send email with SendGrid
    if (process.env.SENDGRID_API_KEY) {
      const msg = {
        to: email,
        from: process.env.EMAIL_FROM || 'noreply@homiesapp.com',
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
      
      try {
        await sgMail.send(msg);
        console.log(`New verification email sent to ${email} via SendGrid`);
        return true;
      } catch (sendgridError) {
        console.error('SendGrid Error:', sendgridError);
        return process.env.NODE_ENV === 'development';
      }
    } else {
      console.log(`No SendGrid API key. Development verification code for ${email}: ${newCode}`);
      return process.env.NODE_ENV === 'development';
    }
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
