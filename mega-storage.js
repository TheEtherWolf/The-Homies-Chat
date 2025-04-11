/**
 * MEGA Storage Integration - Simplified version that primarily uses Supabase
 * This version minimizes MEGA usage and focuses on Supabase for main message storage
 */

// Add node-fetch polyfill for MEGA
const fetch = require('node-fetch');
// Set fetch as global for MEGA to use
if (!globalThis.fetch) {
  globalThis.fetch = fetch;
}

const { Storage } = require('megajs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import Supabase client functions
const { loadMessagesFromSupabase, saveMessagesToSupabase } = require('./supabase-client');

// MEGA credentials
const MEGA_EMAIL = process.env.MEGA_EMAIL || '';
const MEGA_PASSWORD = process.env.MEGA_PASSWORD || '';

// Storage variables
let storage = null;
let connected = false;

// Initialize connection to MEGA - only for future file sharing, not for messages
async function connectToMega() {
  try {
    // Enhanced validation of MEGA credentials
    if (!MEGA_EMAIL || !MEGA_PASSWORD || MEGA_EMAIL.trim() === '' || MEGA_PASSWORD.trim() === '') {
      console.warn('MEGA credentials not provided or invalid. Only Supabase storage will be used.');
      connected = false;
      return false;
    }

    console.log('Connecting to MEGA for future file sharing capabilities...');
    try {
      // Create storage instance with error handling
      storage = new Storage({
        email: MEGA_EMAIL.trim(),
        password: MEGA_PASSWORD.trim(),
        autoload: false
      });

      // Set timeout for connection
      const connectionPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.warn('MEGA connection timeout - using Supabase only');
          reject(new Error('MEGA connection timeout'));
        }, 10000); // 10 seconds timeout

        storage.on('ready', () => {
          connected = true;
          clearTimeout(timeoutId);
          console.log('MEGA storage connection established successfully');
          resolve(true);
        });

        storage.on('error', (error) => {
          clearTimeout(timeoutId);
          console.error('MEGA storage connection error:', error);
          reject(error);
        });
      });

      // Try to login but don't block if it fails
      try {
        storage.login();
      } catch (loginError) {
        console.error('MEGA login error:', loginError);
        connected = false;
        return false;
      }
      
      // Wait for connection but with timeout
      await connectionPromise.catch(err => {
        console.log('Using Supabase only for messages storage');
        connected = false;
        return false;
      });
      
    } catch (error) {
      console.error('MEGA connection error, using Supabase only:', error);
      connected = false;
      return false;
    }

    return connected;
  } catch (error) {
    console.error('Failed to initialize MEGA storage:', error);
    connected = false;
    return false;
  }
}

/**
 * Load messages from storage
 * @returns {Promise<Object>} The loaded messages
 */
async function loadMessages() {
  try {
    // Get messages from Supabase
    const supabaseMessages = await loadMessagesFromSupabase();
    if (supabaseMessages && supabaseMessages.length > 0) {
      console.log(`Loaded ${supabaseMessages.length} messages from Supabase`);
      // Transform to the expected format
      const channels = {};
      
      supabaseMessages.forEach(msg => {
        const channelId = msg.channelId || 'general';
        if (!channels[channelId]) {
          channels[channelId] = [];
        }
        channels[channelId].push(msg);
      });
      
      return { channels };
    }
    
    // If no messages in Supabase, check local backup
    return loadFromBackup();
  } catch (error) {
    console.error(`Error loading messages: ${error}`);
    
    // Last resort: create a new empty messages object
    return { channels: { general: [] } };
  }
}

/**
 * Save messages to storage
 * @param {Object} messages - The messages to save
 * @returns {Promise<boolean>} Success status
 */
async function saveMessages(messages) {
  try {
    if (!messages) {
      console.warn('Received null or undefined messages to save');
      return false;
    }
    
    // Build a flat array of messages for Supabase
    const flatMessages = [];
    for (const channelId in messages.channels) {
      if (Array.isArray(messages.channels[channelId])) {
        const channelMessages = messages.channels[channelId].map(msg => {
          return {
            // Keep the original message properties
            ...msg,
            // Add/transform properties to match Supabase schema
            channelId,
            content: msg.message || msg.content || "",
            "sender-id": msg.username || msg.sender || "anonymous",
            type: msg.type || "text"
          };
        });
        flatMessages.push(...channelMessages);
      }
    }
    
    // Save to Supabase
    const supabaseSaved = await saveMessagesToSupabase(flatMessages);
    if (supabaseSaved) {
      console.log('Messages saved to Supabase successfully');
    }
    
    // Always create a local backup
    await createBackup(messages);
    
    return supabaseSaved;
  } catch (error) {
    console.error(`Error saving messages: ${error}`);
    
    // Always try to create a backup
    await createBackup(messages);
    
    return false;
  }
}

/**
 * Load messages from backup
 * @returns {Promise<Object|null>} The loaded messages or null if not found
 */
async function loadFromBackup() {
  try {
    // Find the most recent backup
    const backupFiles = fs.readdirSync('.')
      .filter(file => file.startsWith('messages.json.backup'))
      .sort()
      .reverse();
    
    if (backupFiles.length > 0) {
      const backupData = fs.readFileSync(backupFiles[0], 'utf8');
      console.log(`Loaded from backup: ${backupFiles[0]}`);
      return JSON.parse(backupData);
    }
  } catch (backupError) {
    console.error(`Error loading backup: ${backupError.message}`);
  }
  
  return { channels: { general: [] } };
}

/**
 * Create a local backup of the messages
 * @param {Object} messages - The messages to backup
 * @returns {Promise<void>}
 */
async function createBackup(messages) {
  try {
    // Convert to JSON string
    const data = JSON.stringify(messages, null, 2);
    
    // Create a backup file
    const backupPath = `messages.json.backup-${Date.now()}`;
    fs.writeFileSync(backupPath, data);
    console.log(`Created local backup: ${backupPath}`);
  } catch (backupError) {
    console.error(`Error creating local backup: ${backupError.message}`);
  }
}

module.exports = {
  connectToMega,
  loadMessages,
  saveMessages
};
