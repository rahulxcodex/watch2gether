"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Smile, Users, MessageSquare, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChatMessageDTO, UserDTO } from "@watch2gether/shared";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  messages: ChatMessageDTO[];
  currentUser: UserDTO;
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  className?: string;
}

export const QUICK_EMOJIS = ["❤️", "🔥", "😂", "👏", "🍿", "🎉", "😮", "🚀"];

export function ChatPanel({
  messages,
  currentUser,
  onSendMessage,
  onSendReaction,
  className,
}: ChatPanelProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden shadow-2xl",
        className
      )}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-indigo-400" />
          <span className="font-semibold text-sm text-white">Live Room Chat</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Realtime</span>
        </div>
      </div>

      {/* Message Stream */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-4">
            <Smile className="h-8 w-8 mb-2 opacity-50 text-indigo-400" />
            <p className="text-xs">No messages yet. Say hello or send an emoji reaction!</p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.system) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <span className="rounded-full bg-slate-800/80 px-3 py-1 text-[11px] font-medium text-slate-400 border border-slate-700/50 text-center">
                    {msg.text}
                  </span>
                </div>
              );
            }

            const isMe = msg.sender.id === currentUser.id;
            const senderInitials = (msg.sender.name || "U")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase();

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-2.5 max-w-[88%]",
                  isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <Avatar className="h-7 w-7 shrink-0 border border-slate-700">
                  <AvatarFallback
                    style={{
                      backgroundColor: msg.sender.color || msg.sender.avatarColor || "#6366f1",
                    }}
                    className="text-white text-[10px] font-bold"
                  >
                    {senderInitials}
                  </AvatarFallback>
                </Avatar>

                <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                  <div className="flex items-center gap-1.5 mb-0.5 px-0.5">
                    <span className="text-[11px] font-semibold text-slate-300">
                      {isMe ? "You" : msg.sender.name}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words shadow-sm",
                      isMe
                        ? "bg-indigo-600 text-white rounded-tr-none"
                        : "bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/60"
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Quick Emoji Reaction Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800/60 bg-slate-950/40">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full justify-between">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSendReaction(emoji)}
              className="text-lg hover:scale-130 active:scale-95 transition-transform p-1 rounded-md hover:bg-slate-800/80"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Input Form */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-3 border-t border-slate-800 bg-slate-900/80"
      >
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="h-9 bg-slate-800/90 border-slate-700 text-xs text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!inputText.trim()}
          className="h-9 w-9 shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
          aria-label="Send Message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
