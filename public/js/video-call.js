/**
 * Video Call module for The Homies App
 * Handles WebRTC peer connections for video calling
 */

class VideoCallManager {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.callInProgress = false;
        this.currentCallTarget = null;
        
        this.callContainer = document.getElementById('call-container');
        this.localVideo = document.getElementById('local-video');
        this.remoteVideo = document.getElementById('remote-video');
        this.callStatus = document.getElementById('call-status');
        this.remoteUserName = document.getElementById('remote-user-name');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.endCallBtn = document.getElementById('end-call');
        
        // Incoming call elements
        this.incomingCallModal = new bootstrap.Modal(document.getElementById('incoming-call-modal'));
        this.callerName = document.getElementById('caller-name');
        this.acceptCallBtn = document.getElementById('accept-call');
        this.declineCallBtn = document.getElementById('decline-call');
        
        // Configuration
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.mediaConstraints = {
            audio: true,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            }
        };
        
        this.initEventListeners();
    }
    
    initEventListeners() {
        // Call controls
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.endCallBtn.addEventListener('click', () => this.endCall());
        
        // Incoming call
        this.acceptCallBtn.addEventListener('click', () => this.acceptIncomingCall());
        this.declineCallBtn.addEventListener('click', () => this.declineIncomingCall());
        
        // Socket events
        socket.on('call-offer', (data) => this.handleCallOffer(data));
        socket.on('call-answer', (data) => this.handleCallAnswer(data));
        socket.on('ice-candidate', (data) => this.handleICECandidate(data));
        socket.on('call-declined', (data) => this.handleCallDeclined(data));
        socket.on('call-ended', () => this.handleRemoteEndCall());
    }
    
    async initiateCall(targetUser) {
        try {
            this.currentCallTarget = targetUser;
            this.callStatus.textContent = `Calling ${targetUser}...`;
            this.remoteUserName.textContent = targetUser;
            
            // Get local media stream
            await this.getLocalMedia();
            
            // Create peer connection
            this.createPeerConnection();
            
            // Add local stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            socket.emit('call-offer', {
                target: targetUser,
                offer: offer
            });
            
            // Show call UI
            this.showCallUI();
            
        } catch (error) {
            console.error('Error initiating call:', error);
            this.endCall();
        }
    }
    
    async getLocalMedia() {
        try {
            if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
                this.localVideo.srcObject = this.localStream;
            }
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw new Error('Could not access camera/microphone');
        }
    }
    
    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceServers);
        
        // ICE candidate handling
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    target: this.currentCallTarget,
                    candidate: event.candidate
                });
            }
        };
        
        // Track handling (for remote stream)
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.remoteVideo.srcObject = this.remoteStream;
        };
        
        // Connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection.connectionState === 'disconnected' || 
                this.peerConnection.connectionState === 'failed') {
                this.endCall();
            }
        };
    }
    
    async handleCallOffer(data) {
        const { offer, caller } = data;
        
        // Show incoming call UI
        this.currentCallTarget = caller;
        this.callerName.textContent = caller;
        this.incomingCallModal.show();
    }
    
    async acceptIncomingCall() {
        try {
            this.incomingCallModal.hide();
            this.remoteUserName.textContent = this.currentCallTarget;
            
            // Get local media
            await this.getLocalMedia();
            
            // Create peer connection
            this.createPeerConnection();
            
            // Add local stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Set remote description (from offer)
            const remoteOffer = await socket.volatile.emit('get-call-offer', this.currentCallTarget);
            await this.peerConnection.setRemoteDescription(remoteOffer);
            
            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            // Send answer
            socket.emit('call-answer', {
                target: this.currentCallTarget,
                answer: answer
            });
            
            // Show call UI
            this.showCallUI();
            this.callStatus.textContent = `Connected with ${this.currentCallTarget}`;
            
        } catch (error) {
            console.error('Error accepting call:', error);
            this.endCall();
        }
    }
    
    declineIncomingCall() {
        socket.emit('call-declined', {
            target: this.currentCallTarget,
            reason: 'rejected'
        });
        
        this.incomingCallModal.hide();
        this.currentCallTarget = null;
    }
    
    async handleCallAnswer(data) {
        const { answer, answerer } = data;
        
        try {
            await this.peerConnection.setRemoteDescription(answer);
            this.callStatus.textContent = `Connected with ${answerer}`;
        } catch (error) {
            console.error('Error handling call answer:', error);
            this.endCall();
        }
    }
    
    async handleICECandidate(data) {
        try {
            if (this.peerConnection && data.candidate) {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }
    
    handleCallDeclined(data) {
        this.callStatus.textContent = `Call declined: ${data.reason || 'User is busy'}`;
        
        // Hide call UI after a delay
        setTimeout(() => {
            this.hideCallUI();
            this.cleanupCall();
        }, 2000);
    }
    
    handleRemoteEndCall() {
        this.callStatus.textContent = 'Call ended by remote user';
        
        // Hide call UI after a delay
        setTimeout(() => {
            this.hideCallUI();
            this.cleanupCall();
        }, 2000);
    }
    
    showCallUI() {
        this.callContainer.classList.remove('d-none');
        this.callContainer.classList.add('d-flex');
        this.callInProgress = true;
    }
    
    hideCallUI() {
        this.callContainer.classList.remove('d-flex');
        this.callContainer.classList.add('d-none');
        this.callInProgress = false;
    }
    
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.toggleAudioBtn.innerHTML = audioTrack.enabled ? 
                    '<i class="bi bi-mic-fill"></i>' : 
                    '<i class="bi bi-mic-mute-fill"></i>';
            }
        }
    }
    
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.toggleVideoBtn.innerHTML = videoTrack.enabled ? 
                    '<i class="bi bi-camera-video-fill"></i>' : 
                    '<i class="bi bi-camera-video-off-fill"></i>';
            }
        }
    }
    
    endCall() {
        // Notify the other user
        if (this.currentCallTarget) {
            socket.emit('end-call', {
                target: this.currentCallTarget
            });
        }
        
        this.hideCallUI();
        this.cleanupCall();
    }
    
    cleanupCall() {
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            this.localVideo.srcObject = null;
        }
        
        // Clear remote stream
        this.remoteStream = null;
        this.remoteVideo.srcObject = null;
        
        this.currentCallTarget = null;
        this.callInProgress = false;
    }
}

// Will be initialized in app.js
