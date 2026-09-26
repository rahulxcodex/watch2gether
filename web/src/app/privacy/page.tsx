"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield, Lock, Eye, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0C0D0E] text-slate-100 selection:bg-indigo-500 selection:text-white font-sans py-12 px-4 sm:px-6">
      <div className="container max-w-4xl mx-auto space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Theater</span>
        </Link>

        <div className="space-y-3 border-b border-slate-800/80 pb-6">
          <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-[10px] font-mono uppercase tracking-widest">
            Privacy & Trust
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Last Updated: September 2026 · Compliant with GDPR & CCPA
          </p>
        </div>

        <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              1. Zero-Wall Architecture & Data Minimization
            </h2>
            <p>
              Watch2Gether is architected from the ground up for strict data minimization. You do not need to provide an email address, credit card, or personal identifiable information (PII) to join or host a synchronized room. Guest sessions utilize cryptographically random pseudonymous identifiers persisted exclusively in ephemeral client storage.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-400" />
              2. Real-Time Telemetry & Ephemeral Sync
            </h2>
            <p>
              When participating in a room, our Cristian NTP synchronization algorithm exchanges timestamp pings (client send time, server receive time, server send time) to calculate clock offset and network round-trip time (RTT). Playback states and chat messages are transmitted over secure TLS/WebSockets connections and purged when a room expires.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Eye className="h-4 w-4 text-cyan-400" />
              3. Local Files & Peer-to-Peer Privacy
            </h2>
            <p>
              When utilizing the &ldquo;Watch Local File&rdquo; feature, your video file is never uploaded to any remote server or third-party cloud. Playhead timecodes and play/pause events are synchronized, while media bytes remain strictly on your local disk.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-400" />
              4. Cookies and Analytical Telemetry
            </h2>
            <p>
              We do not utilize invasive advertising cookies or cross-site tracking beacons. Ephemeral session tokens are used solely for authentication and CSRF protection. Aggregated system performance metrics (e.g. concurrent viewer counts computed via sweep-line algorithms) are fully anonymized.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>Watch2Gether Platform</span>
          <Link href="/terms" className="text-indigo-400 hover:underline">
            View Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
