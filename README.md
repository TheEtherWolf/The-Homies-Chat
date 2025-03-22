# The Homies Chat App

A real-time chat application built with Node.js, Express, and Socket.IO that allows friends to chat and make audio calls.

## Features

- Real-time messaging with Socket.IO
- User authentication system
- Audio calls between users
- Customizable audio settings (microphone and speaker selection)
- Password management
- Modern UI with responsive design

## Tech Stack

- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **Audio Calls**: WebRTC
- **Frontend**: HTML, CSS, JavaScript
- **User Authentication**: Custom implementation with localStorage persistence

## Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `node server.js` to start the server
4. Access the application at `http://localhost:8080`

## Development

The app stores user data and messages in JSON files for simplicity:
- `users.json` - Stores user credentials
- `messages.json` - Stores chat message history
