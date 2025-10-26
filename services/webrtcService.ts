import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, MediaStream, MediaStreamTrack } from 'react-native-webrtc';

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
  onIceCandidateCallback: ((candidate: any) => void) | null = null;
  isScreenSharing = false;

  constructor(onSetLocalStream: (stream: MediaStream | null) => void, onSetRemoteStream: (stream: MediaStream | null) => void) {
    this.onSetLocalStream = onSetLocalStream;
    this.onSetRemoteStream = onSetRemoteStream;
  }

  async start(): Promise<void> {
    this.peerConnection = new RTCPeerConnection(configuration);
    
    // The `react-native-webrtc` type definitions are incomplete and do not include
    // the standard `onicecandidate` event handler. Casting to `any` is a
    // necessary workaround to access this property.
    (this.peerConnection as any).onicecandidate = (event: { candidate: any; }) => {
        if (event.candidate && this.onIceCandidateCallback) {
            this.onIceCandidateCallback(event.candidate);
        }
    };

    const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: 640,
          height: 480,
          frameRate: 30,
        },
    });
    this.localStream = stream;
    this.cameraStream = stream;
    this.onSetLocalStream(stream);
    
    stream.getTracks().forEach(track => {
      this.peerConnection?.addTrack(track, stream);
    });

    // Similarly, the `ontrack` event handler is also missing from the type definitions.
    (this.peerConnection as any).ontrack = (event: { streams: MediaStream[]; }) => {
        if (event.streams && event.streams[0]) {
            this.remoteStream = event.streams[0];
            this.onSetRemoteStream(this.remoteStream);
        }
    };
  }

  async createOffer(): Promise<any> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(offer: any): Promise<any> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(answer: any): Promise<void> {
    if (!this.peerConnection) throw new Error("Peer connection not initialized");
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate: any): Promise<void> {
    if (this.peerConnection && candidate) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  toggleAudio(enable: boolean) {
    if(this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = enable;
        });
    }
  }

  toggleVideo(enable: boolean) {
    if(this.localStream) {
        this.localStream.getVideoTracks().forEach(track => {
            track.enabled = enable;
        });
    }
  }
  
  async toggleScreenShare(): Promise<boolean> {
    if (!this.peerConnection) return this.isScreenSharing;

    const videoSender = this.peerConnection.getSenders().find(sender => sender.track?.kind === 'video');
    if (!videoSender) return this.isScreenSharing;

    if (this.isScreenSharing) {
      // Switch back to camera
      if (this.cameraStream) {
        const cameraTrack = this.cameraStream.getVideoTracks()[0];
        await videoSender.replaceTrack(cameraTrack);
        this.localStream?.getTracks().forEach(track => track.stop());
        this.localStream = this.cameraStream;
        this.onSetLocalStream(this.localStream);
      }
      this.isScreenSharing = false;
    } else {
      // Switch to screen share
      try {
        const screenStream = await mediaDevices.getDisplayMedia() as MediaStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        
        (screenTrack as any).onended = () => {
          if (this.isScreenSharing) {
            this.toggleScreenShare();
          }
        };
        
        await videoSender.replaceTrack(screenTrack);
        this.localStream = screenStream;
        this.onSetLocalStream(this.localStream);
        this.isScreenSharing = true;
      } catch (error) {
        console.error('Error starting screen share:', error);
      }
    }
    return this.isScreenSharing;
  }

  onIceCandidate(callback: (candidate: any) => void) {
    this.onIceCandidateCallback = callback;
  }

  close() {
    if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
    }
    if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
    }
    if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(track => track.stop());
        this.cameraStream = null;
    }
    this.remoteStream = null;
    this.onSetLocalStream(null);
    this.onSetRemoteStream(null);
    this.isScreenSharing = false;
  }
}