"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Lock, Mail, Eye, EyeOff, ShieldCheck, Sparkles, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
}

export function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup" | "anon">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "anon") {
        const guestName = name.trim() || `Guest_${Math.floor(100 + Math.random() * 900)}`;
        onAuthSuccess({
          id: `guest_${Date.now()}`,
          name: guestName,
          isGuest: true,
          email: null,
          avatarUrl: avatarUrl || undefined,
        });
        onClose();
        return;
      }

      const endpoint = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        mode === "signup"
          ? { email: email.trim(), password, name: name.trim(), avatarUrl: avatarUrl.trim() }
          : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      onAuthSuccess(data.user);
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex gap-0.5 items-end h-4">
              <span className="w-1 h-4 bg-teal-400 rounded-sm" />
              <span className="w-1 h-2.5 bg-pink-400 rounded-sm" />
            </span>
            <DialogTitle className="text-xl font-bold tracking-tight">
              {mode === "login"
                ? "Sign in to Parallel"
                : mode === "signup"
                ? "Create an Account"
                : "Anonymous Mode"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            {mode === "anon"
              ? "Watch instantly without creating an account. (Library saved to this browser only)"
              : "Keep your movie and anime library synced across all devices forever."}
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs my-3">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              mode === "login"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              mode === "signup"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("anon");
              setError("");
            }}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
              mode === "anon"
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Anonymous
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode !== "anon" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="pl-9 bg-slate-950 border-slate-800 text-white text-xs h-9"
                  autoFocus
                />
              </div>
            </div>
          )}

          {mode !== "anon" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="pl-9 pr-9 bg-slate-950 border-slate-800 text-white text-xs h-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {(mode === "signup" || mode === "anon") && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Display Name {mode === "anon" ? "(Optional)" : ""}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Who's watching?"
                  maxLength={30}
                  className="pl-9 bg-slate-950 border-slate-800 text-white text-xs h-9"
                />
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Avatar URL <span className="text-slate-500 lowercase">(optional)</span>
              </label>
              <Input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
                className="bg-slate-950 border-slate-800 text-white text-xs h-9"
              />
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="glow"
              disabled={loading}
              className="w-full h-9 text-xs font-semibold"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : mode === "login" ? (
                "Log In & Sync Library"
              ) : mode === "signup" ? (
                "Create Account & Save Library"
              ) : (
                "Continue Anonymously"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
