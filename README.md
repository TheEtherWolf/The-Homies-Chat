# The Homies Chat

A secure real-time chat application with video calling features, built specifically for Glitch deployment.

## 🚀 Features

### 🔒 Authentication & Security
- Secure login using email/username and password
- Session management with NextAuth
- End-to-end encryption for messages and calls
- Secure storage of user credentials

### 💬 Messaging
- Real-time one-on-one and group messaging
- Message history and persistence
- Message reactions and emoji support
- Message deletion with soft-delete functionality
- Typing indicators

### 👥 User Experience
- Online/offline/idle status indicators
- Custom user status updates
- Responsive design for all screen sizes
- Dark theme for comfortable viewing

### 📞 Video & Voice
- High-quality video calling
- Screen sharing capabilities
- Audio controls and device selection
- Connection reliability with TURN/STUN servers

## 🛠 Tech Stack

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Bootstrap 5 for responsive design
- Socket.io for real-time communication
- WebRTC for video/voice calls

### Backend
- Node.js with Express
- Socket.io for real-time communication
- NextAuth for authentication
- Supabase for database and storage
- MEGA for secure file storage

### Deployment
- Hosted on Glitch
- Automatic deployment from GitHub
- Keep-alive mechanism to prevent sleep

## 🚀 Getting Started

### Prerequisites
- Node.js v16.14.2 or higher
- npm 7.20.6 or higher
- Git

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/TheEtherWolf/The-Homies-Chat.git
   cd The-Homies-Chat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Update the variables with your configuration

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Open in browser**
   Visit `http://localhost:3000`

### Glitch Deployment

1. Create a new project on [Glitch](https://glitch.com/)
2. Click on "Import from GitHub" and enter:
   ```
   https://github.com/TheEtherWolf/The-Homies-Chat.git
   ```
3. Set up environment variables in the `.env` file
4. The app will automatically start running

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 📂 Project Structure

```
public/
  ├── js/
  │   ├── app.js          # Main application logic
  │   ├── chat.js          # Chat functionality
  │   ├── video-call.js    # Video call functionality
  │   └── nextauth-simplified.js  # Authentication
  └── index.html           # Main HTML file
server.js                  # Express server
package.json               # Project dependencies
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ by The Homies Team
- Special thanks to all contributors
- Icons by [Bootstrap Icons](https://icons.getbootstrap.com/)
