"use client";

import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Share2, QrCode, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  roomName: string;
}

export function ShareModal({
  isOpen,
  onClose,
  roomCode,
  roomName,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${roomCode}`
      : `http://localhost:3000/room/${roomCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Share2 className="h-5 w-5 text-indigo-400" />
            Invite Friends to Watch
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Anyone with this link can join the room instantly without creating an account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-4 py-3">
          {/* QR Code Container */}
          <div className="flex flex-col items-center p-4 rounded-2xl bg-white shadow-inner">
            <QRCodeSVG
              value={shareUrl}
              size={180}
              level="H"
              includeMargin={false}
            />
          </div>
          <p className="text-xs text-slate-400 text-center">
            Scan QR code on your mobile device to join instantly
          </p>

          {/* Room Code Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Room Code:</span>
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono font-bold tracking-widest text-sm border border-indigo-500/30">
              {roomCode}
            </span>
          </div>

          {/* Share Link Input with 1-Click Copy */}
          <div className="flex w-full items-center gap-2">
            <Input
              value={shareUrl}
              readOnly
              className="bg-slate-800 border-slate-700 text-xs text-slate-200 font-mono select-all"
            />
            <Button
              type="button"
              onClick={handleCopy}
              className={
                copied
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
              }
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
