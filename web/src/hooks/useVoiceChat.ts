"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TypedSocket } from "@/lib/socket";

interface UseVoiceChatProps {
  socket: TypedSocket | null;
  roomCode: string;
  currentUserId: string;
  onDuckingChange?: (shouldDuck: boolean) => void;
}

export function useVoiceChat({
  socket,
  roomCode,
  currentUserId,
  onDuckingChange,
}: UseVoiceChatProps) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPartnerSpeaking, setIsPartnerSpeaking] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const duckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger audio ducking callback when partner speaks
  useEffect(() => {
    onDuckingChange?.(isPartnerSpeaking);
  }, [isPartnerSpeaking, onDuckingChange]);

  const startVoice = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setHasMicPermission(false);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setHasMicPermission(true);
      setIsVoiceActive(true);
      setIsMuted(false);

      // Audio Level Analyzer for Speaking Detection
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const speakingNow = avg > 18 && !isMuted;

        if (speakingNow !== wasSpeaking) {
          wasSpeaking = speakingNow;
          setIsSpeaking(speakingNow);
          if (socket && socket.connected) {
            socket.emit("voice:speaking" as any, { isSpeaking: speakingNow });
          }
        }

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      animFrameRef.current = requestAnimationFrame(checkVolume);
    } catch (err) {
      console.warn("Could not start microphone voice chat:", err);
      setHasMicPermission(false);
      setIsVoiceActive(false);
    }
  }, [socket, isMuted]);

  const stopVoice = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    setIsVoiceActive(false);
    setIsSpeaking(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const newMute = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !newMute;
    });
    setIsMuted(newMute);
    if (newMute) {
      setIsSpeaking(false);
      socket?.emit("voice:speaking" as any, { isSpeaking: false });
    }
  }, [isMuted, socket]);

  // Handle incoming remote speaking events for ducking
  useEffect(() => {
    if (!socket) return;

    const handleRemoteSpeaking = (payload: { userId: string; isSpeaking: boolean }) => {
      if (payload.userId === currentUserId) return;

      if (payload.isSpeaking) {
        if (duckTimeoutRef.current) clearTimeout(duckTimeoutRef.current);
        setIsPartnerSpeaking(true);
      } else {
        // Debounce releasing ducking so brief pauses in speech don't bounce volume
        duckTimeoutRef.current = setTimeout(() => {
          setIsPartnerSpeaking(false);
        }, 1200);
      }
    };

    socket.on("voice:speaking" as any, handleRemoteSpeaking);

    return () => {
      socket.off("voice:speaking" as any, handleRemoteSpeaking);
      if (duckTimeoutRef.current) clearTimeout(duckTimeoutRef.current);
    };
  }, [socket, currentUserId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, [stopVoice]);

  return {
    isVoiceActive,
    isMuted,
    isSpeaking,
    isPartnerSpeaking,
    hasMicPermission,
    startVoice,
    stopVoice,
    toggleMute,
  };
}
