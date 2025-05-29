/**
 * Main JavaScript file for The Homies Chat
 * Handles core functionality and initialization
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded');
    
    // Check if socket is available
    if (window.socket) {
        console.log('Socket instance exists:', window.socket.connected ? 'connected' : 'disconnected');
        
        // If socket is disconnected, try to reconnect
        if (!window.socket.connected) {
            console.log('Attempting to reconnect socket...');
            window.socket.connect();
        }
    } else {
        console.log('No global socket instance found');
    }
    
    // Initialize Bootstrap components
    initializeBootstrapComponents();
    
    // Initialize UI event listeners
    initializeUIListeners();
    
    // Initialize theme
    initializeTheme();
});

/**
 * Initialize Bootstrap components
 */
function initializeBootstrapComponents() {
    // Initialize all tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Initialize all popovers
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function(popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });
}

/**
 * Initialize UI event listeners
 */
function initializeUIListeners() {
    // Theme switcher
    const themeOptions = document.querySelectorAll('.theme-option');
    if (themeOptions.length > 0) {
        themeOptions.forEach(option => {
            option.addEventListener('click', function() {
                const theme = this.getAttribute('data-theme');
                setTheme(theme);
                
                // Update active class
                themeOptions.forEach(opt => opt.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }
    
    // Status dropdown
    const statusOptions = document.querySelectorAll('.status-option');
    if (statusOptions.length > 0) {
        statusOptions.forEach(option => {
            option.addEventListener('click', function() {
                const status = this.getAttribute('data-status');
                setUserStatus(status);
                
                // Update UI
                const statusDisplay = document.querySelector('.current-status');
                if (statusDisplay) {
                    statusDisplay.className = 'current-status ' + status;
                    
                    const statusText = this.querySelector('.status-text').textContent;
                    document.querySelector('.status-display-text').textContent = statusText;
                }
            });
        });
    }
    
    // Handle channel switching
    const channelItems = document.querySelectorAll('#channels-list .list-item');
    if (channelItems.length > 0) {
        channelItems.forEach(item => {
            item.addEventListener('click', function() {
                const channel = this.getAttribute('data-channel');
                
                // Only switch if not already active
                if (!this.classList.contains('active')) {
                    // Update active channel
                    channelItems.forEach(chan => chan.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Switch to channel if ChatManager is available
                    if (window.chatManager) {
                        window.chatManager.switchChannel('#' + channel);
                    }
                }
            });
        });
    }
    
    // Handle profile settings save
    const saveSettingsBtn = document.getElementById('save-settings');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', function() {
            saveUserSettings();
        });
    }
}

/**
 * Save user settings
 */
function saveUserSettings() {
    // Collect settings data
    const displayName = document.getElementById('display-name')?.value;
    const status = document.querySelector('.current-status')?.classList[1];
    const theme = document.querySelector('.theme-option.active')?.getAttribute('data-theme');
    
    // Create settings object
    const settings = {
        displayName,
        status,
        theme,
        updatedAt: new Date().toISOString()
    };
    
    // Save to localStorage
    localStorage.setItem('userSettings', JSON.stringify(settings));
    
    // Apply settings
    if (theme) setTheme(theme);
    if (status) setUserStatus(status);
    
    // Update UI with success message
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        const bsModal = bootstrap.Modal.getInstance(settingsModal);
        if (bsModal) bsModal.hide();
    }
    
    // Show toast notification
    showToast('Settings saved successfully');
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type (success, error, warning, info)
 */
function showToast(message, type = 'success') {
    // Simple toast implementation
    const toastContainer = document.querySelector('.toast-container');
    
    if (!toastContainer) {
        // Create toast container if it doesn't exist
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(container);
    }
    
    // Create toast element
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    
    // Create toast content
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Add to container
    document.querySelector('.toast-container').appendChild(toastEl);
    
    // Initialize and show toast
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
    
    // Remove after hiding
    toastEl.addEventListener('hidden.bs.toast', function() {
        toastEl.remove();
    });
}

/**
 * Set application theme
 * @param {string} theme - Theme name
 */
function setTheme(theme) {
    // Remove existing theme classes
    document.body.classList.remove('light-theme', 'dark-theme', 'midnight-theme');
    
    // Add new theme class
    document.body.classList.add(`${theme}-theme`);
    
    // Save theme preference
    localStorage.setItem('theme', theme);
}

/**
 * Initialize theme from saved preference
 */
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    // Update theme selector if exists
    const themeOption = document.querySelector(`.theme-option[data-theme="${savedTheme}"]`);
    if (themeOption) {
        document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
        themeOption.classList.add('active');
    }
}

/**
 * Set user status
 * @param {string} status - Status value (online, away, dnd, invisible)
 */
function setUserStatus(status) {
    // Update status display
    const statusIndicator = document.querySelector('.user-status');
    if (statusIndicator) {
        statusIndicator.className = 'user-status ' + status;
    }
    
    // Save status preference
    localStorage.setItem('userStatus', status);
    
    // Update on server if socket is available
    if (window.socket && window.socket.connected) {
        window.socket.emit('update-status', { status });
    }
}

// Export global functions
window.showToast = showToast;
window.setTheme = setTheme;
window.setUserStatus = setUserStatus;
