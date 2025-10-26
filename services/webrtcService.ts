import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, MediaStream } from 'react-native-webrtc';

// Local type definitions to patch missing exports from react-native-webrtc
type RTCIceConnectionState = 'new' | 'checking' | 'connected' | 'completed' | 'disconnected' | 'failed' | 'closed';
interface RTCSessionDescriptionInit {
    type: 'offer' | 'pranswer' | 'answer' | 'rollback';
    sdp: string;
}

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class WebRTCManager {
  peerConnection: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  cameraStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  onSetLocalStream: (stream: MediaStream | null) => void;
  onSetRemoteStream: (stream: MediaStream | null) => void;
  onConnectionStateChange: ((state: RTCIceConnectionState) => void) | null = null;
  onIceCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
  isScreenSharing = false;
  isTogglingScreenShare = false;

  constructor(onSetLocalStream: (stream: MediaStream | null) => void, onSetRemoteStream: (stream: MediaStream | null) => void) {
    this.onSetLocalStream = onSetLocalStream;
    this.onSetRemoteStream = onSetRemoteStream;
  }

  async start(): Promise<boolean> {
    try {
        this.peerConnection = new RTCPeerConnection(configuration);
        
        // FIX: Cast peerConnection to any to set event handler properties that are missing from the type definition.
        (this.peerConnection as any).onicecandidate = (event: any) => {
            if (event.candidate && this.onIceCandidateCallback) {
                this.onIceCandidateCallback(event.candidate);
            }
        };
        
        // FIX: Cast peerConnection to any to set event handler properties that are missing from the type definition.
        (this.peerConnection as any).oniceconnectionstatechange = () => {
            if(this.onConnectionStateChange && this.peerConnection?.iceConnectionState) {
                this.onConnectionStateChange(this.peerConnection.iceConnectionState);
            }
        }

        // Edge Case: Handle camera/mic permission denial.
        const stream = await mediaDevices.getUserMedia({
            audio: true,
            video: { width: 640, height: 480, frameRate: 30 },
        });

        this.localStream = stream;
        this.cameraStream = stream;
        this.onSetLocalStream(stream);
        
        stream.getTracks().forEach(track => {
          this.peerConnection?.addTrack(track, stream);
        });

        // FIX: Cast peerConnection to any to set event handler properties that are missing from the type definition.
        (this.peerConnection as any).ontrack = (event: any) => {
            if (event.streams && event.streams[0]) {
                this.remoteStream = event.streams[0];
                this.onSetRemoteStream(this.remoteStream);
            }
        };
        return true;
    } catch (error) {
        console.error("Failed to start WebRTC:", error);
        this.close();
        return false;
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection && candidate) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  toggleAudio(enable: boolean) {
    this.localStream?.getAudioTracks().forEach(track => { track.enabled = enable; });
  }

  toggleVideo(enable: boolean) {
    this.localStream?.getVideoTracks().forEach(track => { track.enabled = enable; });
  }
  
  async toggleScreenShare(): Promise<boolean> {
    if (!this.peerConnection || this.isTogglingScreenShare) return this.isScreenSharing;
    const videoSender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (!videoSender) return this.isScreenSharing;
    
    this.isTogglingScreenShare = true;
    try {
        if (this.isScreenSharing) {
          if (this.cameraStream) {
            const cameraTrack = this.cameraStream.getVideoTracks()[0];
            if(cameraTrack) {
                try {
                    await videoSender.replaceTrack(cameraTrack);
                } catch (e) { console.error("Error replacing screen track with camera track:", e); }
            }
            this.localStream?.getTracks().forEach(track => track.stop());
            this.localStream = this.cameraStream;
            this.onSetLocalStream(this.localStream);
          }
          this.isScreenSharing = false;
        } else {
          // Edge Case: Handle screen sharing permission denial.
          const screenStream = await mediaDevices.getDisplayMedia() as MediaStream;
          const screenTrack = screenStream.getVideoTracks()[0];
          if(!screenTrack) throw new Error("No screen track found");
          
          (screenTrack as any).onended = () => { if (this.isScreenSharing) this.toggleScreenShare(); };
          
          try {
            await videoSender.replaceTrack(screenTrack);
          } catch(e) {
            console.error("Error replacing camera track with screen track:", e);
            return this.isScreenSharing;
          }

          this.localStream = screenStream;
          this.onSetLocalStream(this.localStream);
          this.isScreenSharing = true;
        }
    } catch (error) {
        console.error('Error toggling screen share:', error);
    } finally {
        this.isTogglingScreenShare = false;
    }
    return this.isScreenSharing;
  }

  setOnIceCandidate(callback: (candidate: RTCIceCandidate) => void) { this.onIceCandidateCallback = callback; }
  setOnConnectionStateChange(callback: (state: RTCIceConnectionState) => void) { this.onConnectionStateChange = callback; }

  close() {
    this.peerConnection?.close();
    this.localStream?.getTracks().forEach(track => track.stop());
    this.cameraStream?.getTracks().forEach(track => track.stop());
    this.peerConnection = null;
    this.localStream = null;
    this.cameraStream = null;
    this.remoteStream = null;
    this.onSetLocalStream(null);
    this.onSetRemoteStream(null);
    this.isScreenSharing = false;
  }
}