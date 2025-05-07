# The Homies App

A secure real-time chat application with video calling features, built specifically for Glitch deployment.

## Features

### Core Features
- Secure login using email/username/password
- Real-time messaging with persistent history
- Video and audio calling with optimized connection handling
- File sharing and storage
- Modern, responsive UI with Discord-inspired dark theme

### Recent Updates (May 2025)
- **Redesigned Sign-in Screen**: Modern card design with animations and improved UX
- **Message Auto-Deletion**: Messages are automatically removed from the database 1 day after deletion
- **Keep-Alive System**: Prevents Glitch from putting the application to sleep
- **Emoji Picker**: Fully functional with categories and search functionality
- **Improved Audio/Video**: Fixed connection issues and audio quality in calls
- **Message Storage Reliability**: Dual-storage approach with local fallback when Supabase is unavailable
- **Friends System**: Updated friends table schema with proper relationship management

### Coming Soon
- NextAuth integration
- Cross-platform mobile application
- Premium features including higher bitrate audio, voice-to-text, and more

## Tech Stack
- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io
- **Database & Authentication**: Supabase
- **Storage**: MEGA (for secure file storage and backup)
- **Deployment**: Glitch

## Setup Instructions

### Local Development
1. Clone this repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and add your credentials
4. Start the server: `npm start`
5. Visit `http://localhost:3000` in your browser

### Deployment on Glitch
1. Create a new project on Glitch
2. Import from GitHub using: `https://github.com/TheEtherWolf/The-Homies-Chat.git`
3. Set up environment variables in the Glitch project settings
4. The app will automatically start running

## Environment Variables
Required environment variables are listed in `.env.example`. Make sure to set these up before running the application.

## Current Limitations
The following buttons are currently non-functional in the latest version:
- DMs
- New Group
- Announcements
- Memes

These features are planned for future development.

## License
MIT
