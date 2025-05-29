/**
 * Emoji Picker for The Homies Chat
 * Handles emoji selection and insertion into messages
 */

document.addEventListener('DOMContentLoaded', () => {
    const emojiPicker = document.querySelector('.emoji-picker');
    const emojiButtons = document.querySelectorAll('.emoji-btn');
    const emojiTriggers = document.querySelectorAll('.emoji-trigger');
    const emojiClose = document.getElementById('emoji-picker-close');
    const emojiCategoryButtons = document.querySelectorAll('.emoji-category');
    const emojiCategoryContents = document.querySelectorAll('.emoji-category-content');
    const emojiSearchInput = document.getElementById('emoji-search-input');
    
    // Store recently used emojis (retrieve from localStorage if available)
    let recentEmojis = JSON.parse(localStorage.getItem('recentEmojis')) || [];
    const MAX_RECENT_EMOJIS = 24;
    
    // Initialize the recent emojis display
    updateRecentEmojisDisplay();
    
    // Toggle emoji picker when emoji button is clicked
    emojiTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Position the emoji picker near the clicked button
            const rect = trigger.getBoundingClientRect();
            emojiPicker.style.top = `${rect.bottom + 10}px`;
            emojiPicker.style.left = `${rect.left}px`;
            
            // Show the emoji picker
            emojiPicker.classList.toggle('d-none');
            
            // If showing, focus the search input
            if (!emojiPicker.classList.contains('d-none')) {
                setTimeout(() => emojiSearchInput.focus(), 100);
            }
        });
    });
    
    // Close emoji picker when close button is clicked
    emojiClose.addEventListener('click', () => {
        emojiPicker.classList.add('d-none');
    });
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiPicker.classList.contains('d-none') && 
            !emojiPicker.contains(e.target) && 
            !Array.from(emojiTriggers).some(trigger => trigger.contains(e.target))) {
            emojiPicker.classList.add('d-none');
        }
    });
    
    // Handle emoji category switching
    emojiCategoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active category button
            emojiCategoryButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show corresponding category content
            const category = button.getAttribute('data-category');
            emojiCategoryContents.forEach(content => {
                content.classList.remove('active');
                if (content.getAttribute('data-category') === category) {
                    content.classList.add('active');
                }
            });
        });
    });
    
    // Handle emoji search
    emojiSearchInput.addEventListener('input', () => {
        const searchTerm = emojiSearchInput.value.toLowerCase();
        
        if (searchTerm.length > 0) {
            // Show all categories for searching
            emojiCategoryContents.forEach(content => content.classList.add('active'));
            
            // Filter emojis
            emojiButtons.forEach(button => {
                const emoji = button.textContent;
                // Simple search - just check if emoji contains the search term
                // In a real app, you'd have emoji names and keywords to search
                if (emoji.includes(searchTerm)) {
                    button.style.display = 'inline-block';
                } else {
                    button.style.display = 'none';
                }
            });
        } else {
            // Reset to default view
            emojiCategoryContents.forEach(content => content.classList.remove('active'));
            const activeCategory = document.querySelector('.emoji-category.active').getAttribute('data-category');
            document.querySelector(`.emoji-category-content[data-category="${activeCategory}"]`).classList.add('active');
            
            // Show all emojis
            emojiButtons.forEach(button => {
                button.style.display = 'inline-block';
            });
        }
    });
    
    // Handle emoji selection
    emojiButtons.forEach(button => {
        button.addEventListener('click', () => {
            const emoji = button.textContent;
            insertEmoji(emoji);
            addToRecentEmojis(emoji);
            emojiPicker.classList.add('d-none');
        });
    });
    
    // Function to insert emoji into the active message input
    function insertEmoji(emoji) {
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            // Get cursor position
            const startPos = messageInput.selectionStart;
            const endPos = messageInput.selectionEnd;
            
            // Insert emoji at cursor position
            messageInput.value = 
                messageInput.value.substring(0, startPos) + 
                emoji + 
                messageInput.value.substring(endPos);
            
            // Move cursor after the inserted emoji
            messageInput.selectionStart = messageInput.selectionEnd = startPos + emoji.length;
            
            // Focus back on the input
            messageInput.focus();
            
            // Trigger input event to update any listeners
            messageInput.dispatchEvent(new Event('input'));
        }
    }
    
    // Function to add an emoji to recent emojis
    function addToRecentEmojis(emoji) {
        // Remove if already exists
        recentEmojis = recentEmojis.filter(e => e !== emoji);
        
        // Add to the beginning
        recentEmojis.unshift(emoji);
        
        // Limit to MAX_RECENT_EMOJIS
        if (recentEmojis.length > MAX_RECENT_EMOJIS) {
            recentEmojis = recentEmojis.slice(0, MAX_RECENT_EMOJIS);
        }
        
        // Save to localStorage
        localStorage.setItem('recentEmojis', JSON.stringify(recentEmojis));
        
        // Update the display
        updateRecentEmojisDisplay();
    }
    
    // Function to update the recent emojis display
    function updateRecentEmojisDisplay() {
        const recentContainer = document.querySelector('.emoji-category-content[data-category="recent"]');
        if (recentContainer) {
            // Clear existing content
            recentContainer.innerHTML = '';
            
            if (recentEmojis.length === 0) {
                // Show message if no recent emojis
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'text-center my-3 text-muted';
                emptyMessage.textContent = 'No recent emojis';
                recentContainer.appendChild(emptyMessage);
            } else {
                // Add recent emojis
                recentEmojis.forEach(emoji => {
                    const button = document.createElement('button');
                    button.className = 'emoji-btn';
                    button.textContent = emoji;
                    button.addEventListener('click', () => {
                        insertEmoji(emoji);
                        addToRecentEmojis(emoji);
                        emojiPicker.classList.add('d-none');
                    });
                    recentContainer.appendChild(button);
                });
            }
        }
    }
});
