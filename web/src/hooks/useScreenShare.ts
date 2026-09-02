"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface ScreenShareState {
  isSharing: boolean;
  stream: MediaStream | null;
  error: string | null;
}

export function useScreenShare(onStreamEnded?: () => void) {
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopScreenShare = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsSharing(false);
    onStreamEnded?.();
  }, [onStreamEnded]);

  const startScreenShare = useCallback(async (): Promise<MediaStream | null> => {
    setError(null);
    try {
      if (!navigator?.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen sharing is not supported by your browser.");
      }

      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          frameRate: { ideal: 30, max: 60 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Listen for the user clicking the native browser "Stop sharing" bar
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsSharing(true);
      return mediaStream;
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        setError(err.message || "Failed to start screen share.");
      }
      return null;
    }
  }, [stopScreenShare]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    isSharing,
    stream,
    error,
    startScreenShare,
    stopScreenShare,
  };
}
