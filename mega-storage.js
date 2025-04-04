/**
 * MEGA Storage Integration for The Homies App
 * Provides secure file storage capabilities
 */

require('dotenv').config();
const { Storage } = require('megajs');
const fs = require('fs');
const path = require('path');

// MEGA credentials from environment variables
const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;

let megaStorage = null;
let megaReady = false;

/**
 * Initialize MEGA storage connection
 */
async function initializeMega() {
  try {
    if (!MEGA_EMAIL || !MEGA_PASSWORD) {
      console.warn('MEGA credentials not provided. Secure storage features will be disabled.');
      return false;
    }

    console.log('Connecting to MEGA...');
    megaStorage = new Storage({
      email: MEGA_EMAIL,
      password: MEGA_PASSWORD
    });

    // Wait for connection to be established
    await new Promise((resolve, reject) => {
      megaStorage.on('ready', () => {
        megaReady = true;
        console.log('MEGA storage connection established successfully');
        resolve();
      });

      megaStorage.on('error', (error) => {
        console.error('MEGA storage connection error:', error);
        reject(error);
      });

      // Set timeout for connection
      setTimeout(() => {
        if (!megaReady) {
          reject(new Error('MEGA connection timeout'));
        }
      }, 20000);
    });

    return megaReady;
  } catch (error) {
    console.error('Failed to initialize MEGA storage:', error);
    return false;
  }
}

/**
 * Save data to MEGA storage
 * @param {string} filename - Name of the file to save
 * @param {string} data - Data to save
 * @returns {Promise<boolean>} - Success status
 */
async function saveToMega(filename, data) {
  try {
    if (!megaReady || !megaStorage) {
      // Save locally as fallback
      const backupPath = filename + '.backup';
      fs.writeFileSync(backupPath, data);
      console.log(`Saved to local backup: ${backupPath}`);
      
      // Attempt to initialize
      if (!megaReady) {
        await initializeMega();
      }
      
      // If still not ready, return
      if (!megaReady) {
        return false;
      }
    }

    // Save to MEGA
    const folder = megaStorage.root;
    const file = await folder.upload(filename, data).complete;
    
    console.log(`Saved ${filename} to MEGA storage successfully`);
    return true;
  } catch (error) {
    console.error(`Error saving to MEGA storage: ${error.message}`);
    
    // Save locally as fallback
    try {
      const backupPath = filename + '.backup-' + Date.now();
      fs.writeFileSync(backupPath, data);
      console.log(`Saved to local backup: ${backupPath}`);
    } catch (backupError) {
      console.error(`Error saving local backup: ${backupError.message}`);
    }
    
    return false;
  }
}

/**
 * Load data from MEGA storage
 * @param {string} filename - Name of the file to load
 * @returns {Promise<string|null>} - File data or null if error
 */
async function loadFromMega(filename) {
  try {
    // First try to load from local file system as fallback
    if (fs.existsSync(filename)) {
      const data = fs.readFileSync(filename, 'utf8');
      console.log(`Loaded ${filename} from local file system`);
      return data;
    }
    
    // If MEGA not ready, try to initialize
    if (!megaReady || !megaStorage) {
      await initializeMega();
      
      // If still not ready, return null
      if (!megaReady) {
        return null;
      }
    }

    // Try to find file in MEGA storage
    const folder = megaStorage.root;
    const files = await folder.children();
    const targetFile = files.find(file => file.name === filename);
    
    if (!targetFile) {
      console.log(`File ${filename} not found in MEGA storage`);
      return null;
    }
    
    // Download the file
    const data = await targetFile.downloadBuffer();
    console.log(`Loaded ${filename} from MEGA storage successfully`);
    
    // Save a local copy
    fs.writeFileSync(filename, data);
    
    return data.toString('utf8');
  } catch (error) {
    console.error(`Error loading from MEGA storage: ${error.message}`);
    
    // Try to load from backup
    try {
      // Find the most recent backup
      const backupFiles = fs.readdirSync('.')
        .filter(file => file.startsWith(filename + '.backup'))
        .sort()
        .reverse();
      
      if (backupFiles.length > 0) {
        const backupData = fs.readFileSync(backupFiles[0], 'utf8');
        console.log(`Loaded from backup: ${backupFiles[0]}`);
        return backupData;
      }
    } catch (backupError) {
      console.error(`Error loading backup: ${backupError.message}`);
    }
    
    return null;
  }
}

module.exports = {
  initializeMega,
  saveToMega,
  loadFromMega
};
