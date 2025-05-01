# The Homies App

A secure real-time chat application with video calling features, built specifically for Glitch deployment.

## Version 3 Release Notes
This branch contains The Homies Chat v3 with the following updates:
- Redesigned modern sign-in screen with animations and improved UX
- Fully functional emoji picker with categorized emojis and search
- Message auto-deletion feature with 1-day cleanup
- Keep-alive mechanism to prevent Glitch from putting the app to sleep

**Important Note:** The following buttons are currently non-functional in this version:
- DMs
- New Group
- Announcements
- Memes

These features are planned for future development.

## Features

### Phase 1: Core Account & Security
- Secure login using email/username/password
- End-to-end encryption for messages and calls
- File storage and transfer via MEGA
- User data and auth management with Supabase

### Phase 2: Basic Communication
- One-on-one direct messaging
- Group chat support
- Typing indicators
- Message reactions and emoji support
- Online/offline/idle status
- Custom status updates

## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Real-time: Socket.io
- Authentication: Supabase
- Storage: MEGA
- Deployment: Glitch

## Setup Instructions

### Local Development
1. Clone this repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and add your credentials
4. Start the server: `npm start`
5. Visit `http://localhost:3000` in your browser

### Deployment on Glitch
1. Create a new project on Glitch
2. Import from GitHub using: `https://github.com/TheEtherWolf/New-Homies.git`
3. Set up environment variables in the Glitch project settings
4. The app will automatically start running

## Environment Variables
Required environment variables are listed in `.env.example`. Make sure to set these up before running the application.

## License
MIT
