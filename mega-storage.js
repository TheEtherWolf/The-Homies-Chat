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
    
    // IMPORTANT: Add a try/catch directly around the Storage creation itself
    try {
      // Create storage instance with error handling and necessary options
      storage = new Storage({
        email: MEGA_EMAIL.trim(),
        password: MEGA_PASSWORD.trim(),
        autoload: false,
        autologin: false, // Disable autologin to prevent immediate errors
        keepalive: false  // Disable keepalive to reduce network errors
      });
      
      console.log('MEGA storage instance created, preparing login...');
    } catch (initError) {
      console.error('Error initializing MEGA storage:', initError);
      connected = false;
      return false;
    }

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

    // Try to login but with enhanced error handling
    try {
      // Instead of calling login directly, use a safer approach
      await new Promise((resolve, reject) => {
        try {
          // Set a short timeout to catch initialization errors
          setTimeout(() => {
            try {
              // Only attempt login if storage instance is valid
              if (storage) {
                storage.login((err) => {
                  if (err) {
                    console.error('MEGA login callback error:', err);
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              } else {
                reject(new Error('MEGA storage instance is not valid'));
              }
            } catch (loginCallError) {
              console.error('Error during MEGA login call:', loginCallError);
              reject(loginCallError);
            }
          }, 500);
        } catch (promiseError) {
          console.error('Error setting up MEGA login promise:', promiseError);
          reject(promiseError);
        }
      }).catch(err => {
        console.error('Caught MEGA login error, continuing without MEGA:', err);
        // Don't throw, just log and continue
      });
    } catch (loginError) {
      console.error('MEGA login top-level error, continuing without MEGA:', loginError);
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
    console.error('Failed to initialize MEGA storage:', error);
    connected = false;
    return false;
  }

  return connected;
}

/**
 * Load messages from storage
 * @returns {Promise<Object>} The loaded messages
 */
async function loadMessages() {
  let supabaseMessages = null;
  let loadError = null;

  try {
    // Try loading messages from Supabase
    console.log('Attempting to load messages from Supabase...');
    supabaseMessages = await loadMessagesFromSupabase(); // Calls supabase-client.js
    console.log(`Supabase load attempt completed. Messages found: ${supabaseMessages ? supabaseMessages.length : 'null'}`);
  } catch (error) {
    console.error(`Error loading messages from Supabase: ${error.message}`);
    loadError = error; // Store the error
  }

  // If Supabase load was successful (even if empty)
  if (loadError === null) {
    if (supabaseMessages && supabaseMessages.length > 0) {
      console.log(`Successfully loaded ${supabaseMessages.length} messages from Supabase.`);
      // Transform to the expected format
      const channels = {};
      supabaseMessages.forEach(msg => {
        const channelId = msg.channel || 'general'; // Use 'channel' field if present, else default
        if (!channels[channelId]) {
          channels[channelId] = [];
        }
        // Ensure message structure is consistent
        channels[channelId].push({
          id: msg.id,
          sender_id: msg.sender_id,
          content: msg.content,
          created_at: msg.created_at,
          type: msg.type,
          file_url: msg.file_url,
          file_type: msg.file_type,
          file_size: msg.file_size,
          recipient_id: msg.recipient_id, // Include recipient_id if present
          channel: channelId // Ensure channel is set
        });
      });
      return { channels };
    } else {
      // Supabase load succeeded but returned no messages
      console.log('Supabase load successful, but no messages found. Returning empty structure.');
      return { channels: { general: [] } }; // Return empty, DO NOT fall back to backup
    }
  } else {
    // Supabase load failed, now try the backup
    console.warn('Supabase load failed. Falling back to local backup...');
    try {
      return await loadFromBackup(); // Call loadFromBackup only on Supabase error
    } catch (backupError) {
      console.error(`Error loading from backup as well: ${backupError.message}`);
      // Last resort: return empty structure
      return { channels: { general: [] } };
    }
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
      
      // Parse the backup data
      const backupMessages = JSON.parse(backupData);
      
      // Now synchronize with Supabase to respect deletions
      await synchronizeBackupWithSupabase(backupMessages);
      
      return backupMessages;
    }
  } catch (backupError) {
    console.error(`Error loading backup: ${backupError.message}`);
  }
  
  return { channels: { general: [] } };
}

/**
 * Synchronize backup with Supabase to remove deleted messages
 * @param {Object} backupMessages - The backup messages object
 * @returns {Promise<void>}
 */
async function synchronizeBackupWithSupabase(backupMessages) {
  try {
    if (!backupMessages || !backupMessages.channels) {
      return;
    }
    
    // Get the current state from Supabase
    console.log('Synchronizing backup with Supabase to respect message deletions...');
    const supabaseClient = require('./supabase-client');
    const supabase = supabaseClient.getSupabaseClient(true);
    
    if (!supabase) {
      console.warn('Cannot synchronize backup: Supabase client not available');
      return;
    }
    
    // For each channel in the backup
    for (const channelId in backupMessages.channels) {
      if (!Array.isArray(backupMessages.channels[channelId])) {
        continue;
      }
      
      // Filter out deleted messages
      const messagesToCheck = backupMessages.channels[channelId].filter(msg => msg.id);
      if (messagesToCheck.length === 0) {
        continue;
      }
      
      // Get message IDs to check
      const messageIds = messagesToCheck.map(msg => msg.id);
      
      // Check which messages exist in Supabase and aren't deleted
      const { data, error } = await supabase
        .from('messages')
        .select('id')
        .in('id', messageIds)
        .is('deleted', null);
      
      if (error) {
        console.error('Error checking message existence in Supabase:', error);
        continue;
      }
      
      // Create a set of valid message IDs
      const validMessageIds = new Set(data.map(item => item.id));
      
      // Filter the backup to only include messages that exist and aren't deleted in Supabase
      backupMessages.channels[channelId] = backupMessages.channels[channelId].filter(msg => 
        !msg.id || validMessageIds.has(msg.id)
      );
      
      console.log(`Synchronized channel ${channelId}: Kept ${backupMessages.channels[channelId].length} valid messages`);
    }
  } catch (error) {
    console.error('Error synchronizing backup with Supabase:', error);
  }
}

/**
 * Create a local backup of the messages
 * @param {Object} messages - The messages to backup
 * @returns {Promise<void>}
 */
async function createBackup(messages) {
  try {
    // Limit backups to prevent excessive storage use
    const maxBackups = 3; // Keep only last 3 backups
    
    // Clean up older backups first
    const backupFiles = fs.readdirSync('.')
      .filter(file => file.startsWith('messages.json.backup'))
      .sort();
    
    // Remove oldest backups if we have too many
    if (backupFiles.length >= maxBackups) {
      const filesToRemove = backupFiles.slice(0, backupFiles.length - maxBackups + 1);
      filesToRemove.forEach(file => {
        try {
          fs.unlinkSync(file);
          console.log(`Removed old backup: ${file}`);
        } catch (err) {
          console.error(`Error removing old backup ${file}:`, err);
        }
      });
    }
    
    // Synchronize with Supabase to remove deleted messages
    await synchronizeBackupWithSupabase(messages);
    
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
