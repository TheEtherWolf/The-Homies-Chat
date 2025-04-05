/**
 * MEGA Storage Integration for The Homies App
 * Provides secure file storage capabilities
 */

require('dotenv').config();

// Polyfill for fetch in Node.js environments
const fetch = require('node-fetch');
const { Storage } = require('megajs');
const fs = require('fs');
const path = require('path');

// Import Supabase client functions
const { loadMessagesFromSupabase, saveMessagesToSupabase } = require('./supabase-client');

// MEGA credentials
const MEGA_EMAIL = process.env.MEGA_EMAIL || '';
const MEGA_PASSWORD = process.env.MEGA_PASSWORD || '';

// Storage variables
let storage = null;
let messagesFile = null;
let connected = false;

// Initialize connection to MEGA
async function connectToMega() {
  try {
    if (!MEGA_EMAIL || !MEGA_PASSWORD) {
      console.warn('MEGA credentials not provided. Secure storage features will be disabled.');
      return false;
    }

    // Check if fetch is available
    if (typeof globalThis.fetch !== 'function') {
      console.error('fetch API not available. MEGA integration will not work.');
      console.error('Please install node-fetch: npm install node-fetch');
      return false;
    }

    console.log('Connecting to MEGA...');
    try {
      storage = new Storage({
        email: MEGA_EMAIL,
        password: MEGA_PASSWORD,
        // Use a smaller timeout to avoid hanging
        autoload: false
      });

      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        storage.on('ready', () => {
          connected = true;
          console.log('MEGA storage connection established successfully');
          resolve();
        });

        storage.on('error', (error) => {
          console.error('MEGA storage connection error:', error);
          reject(error);
        });

        // Try to login
        storage.login();

        // Set timeout for connection
        setTimeout(() => {
          if (!connected) {
            console.warn('MEGA connection timeout - switching to local storage only');
            reject(new Error('MEGA connection timeout'));
          }
        }, 15000);
      });
    } catch (megaError) {
      console.error('MEGA instantiation error:', megaError);
      // Fall back to local storage
      return false;
    }

    // Create a file for storing messages
    const folder = storage.root;
    messagesFile = await folder.file('messages.json');

    return connected;
  } catch (error) {
    console.error('Failed to initialize MEGA storage:', error);
    return false;
  }
}

/**
 * Load messages from storage
 * @returns {Promise<Object>} The loaded messages
 */
async function loadMessages() {
  try {
    // First attempt to load from Supabase
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
    
    // Fallback to MEGA storage
    if (connected && messagesFile) {
      try {
        const data = await messagesFile.downloadBuffer();
        const json = JSON.parse(data.toString());
        console.log(`Loaded messages from MEGA storage`);
        return json;
      } catch (error) {
        console.error(`Error loading from MEGA storage: ${error}`);
        
        // Try loading from backup
        return loadFromBackup();
      }
    } else {
      // Try loading from backup
      return loadFromBackup();
    }
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
        const channelMessages = messages.channels[channelId].map(msg => ({
          ...msg,
          channelId
        }));
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
    
    // Try saving to MEGA as well
    if (connected && messagesFile) {
      // Convert to JSON string
      const data = JSON.stringify(messages, null, 2);
      
      try {
        // Upload to MEGA
        await messagesFile.upload(data);
        console.log('Messages saved to MEGA storage successfully');
      } catch (error) {
        console.error(`Error saving to MEGA storage: ${error}`);
        return supabaseSaved; // If Supabase save was successful, we can still return true
      }
    } else {
      if (!supabaseSaved) {
        console.warn('Not connected to MEGA and Supabase save failed, using local backup only');
      }
    }
    
    return true;
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
  
  return null;
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
