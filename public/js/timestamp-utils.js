/**
 * Timestamp Utilities for The Homies App
 * Provides human-friendly, live-updating timestamps
 */

class TimestampUtils {
    constructor() {
        // Initialize the update interval
        this.startLiveUpdates();
        
        // Store references to all timestamp elements for live updates
        this.timestampElements = new Map(); // Map of element -> ISO timestamp string
    }
    
    /**
     * Format a timestamp according to how long ago it was
     * @param {string|Date} timestamp - ISO string or Date object
     * @param {boolean} includeSeconds - Whether to include seconds in "just now" determination
     * @returns {string} Formatted timestamp string
     */
    formatTimestamp(timestamp, includeSeconds = false) {
        // Convert to Date object if it's a string
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        
        // Get current time
        const now = new Date();
        
        // Calculate time difference in various units
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        // Less than a minute ago
        if (diffMin < 1) {
            if (includeSeconds && diffSec < 60) {
                return "Just now";
            }
            return "Just now";
        }
        
        // Less than an hour ago
        if (diffHour < 1) {
            return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
        }
        
        // Less than a day ago
        if (diffDay < 1) {
            return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`;
        }
        
        // Yesterday
        if (diffDay === 1) {
            return `Yesterday at ${this.formatTime(date)}`;
        }
        
        // Within the last week
        if (diffDay < 7) {
            return `${this.getDayName(date)} at ${this.formatTime(date)}`;
        }
        
        // Older than a week
        return `${this.formatDate(date)} at ${this.formatTime(date)}`;
    }
    
    /**
     * Format time as hh:mm AM/PM
     * @param {Date} date - Date object
     * @returns {string} Formatted time string
     */
    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    /**
     * Format date as Month Day, Year
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        return date.toLocaleDateString([], { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }
    
    /**
     * Get day name (Monday, Tuesday, etc.)
     * @param {Date} date - Date object
     * @returns {string} Day name
     */
    getDayName(date) {
        return date.toLocaleDateString([], { weekday: 'long' });
    }
    
    /**
     * Register a timestamp element for live updates
     * @param {HTMLElement} element - DOM element to update
     * @param {string} timestamp - ISO timestamp string
     */
    registerTimestampElement(element, timestamp) {
        if (element && timestamp) {
            this.timestampElements.set(element, timestamp);
        }
    }
    
    /**
     * Unregister a timestamp element from live updates
     * @param {HTMLElement} element - DOM element to remove
     */
    unregisterTimestampElement(element) {
        if (element && this.timestampElements.has(element)) {
            this.timestampElements.delete(element);
        }
    }
    
    /**
     * Start the live update interval
     */
    startLiveUpdates() {
        // Update timestamps every minute
        this.updateInterval = setInterval(() => {
            this.updateAllTimestamps();
        }, 60000); // 60 seconds = 1 minute
    }
    
    /**
     * Stop the live update interval
     */
    stopLiveUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Update all registered timestamp elements
     */
    updateAllTimestamps() {
        this.timestampElements.forEach((timestamp, element) => {
            element.textContent = this.formatTimestamp(timestamp);
        });
    }
    
    /**
     * Clear all registered timestamp elements
     */
    clearTimestampElements() {
        this.timestampElements.clear();
    }
}

// Create a singleton instance
const timestampUtils = new TimestampUtils();

// Export the singleton
window.timestampUtils = timestampUtils;
