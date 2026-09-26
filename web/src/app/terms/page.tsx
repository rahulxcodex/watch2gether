"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Scale, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TermsOfServicePage() {
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
            Legal & Compliance
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">
            Terms of Service
          </h1>
          <p className="text-xs text-slate-400 font-mono">
            Effective Date: September 2026
          </p>
        </div>

        <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Scale className="h-4 w-4 text-indigo-400" />
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using the Watch2Gether web application, room synchronization network, or related APIs, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not access the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              2. Acceptable Use & Content Guidelines
            </h2>
            <p>
              Watch2Gether provides media synchronization technology enabling users to watch publicly accessible and user-provided media together in real time. You agree not to use the platform to transmit unlawful, defamatory, abusive, or infringing material. Room chats are actively protected by automated Trie prefix filters and sliding-window rate limiters.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              3. Third-Party Media & Intellectual Property
            </h2>
            <p>
              Watch2Gether does not host, upload, or store copyrighted video streams on its production servers. All playback streams (including YouTube embeds and HLS/MP4 streams) are resolved from their respective public origins or authorized endpoints. Users are responsible for ensuring they possess rights to stream target content.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" />
              4. Disclaimer of Warranty & Limitation of Liability
            </h2>
            <p>
              The service is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of any kind. Under no circumstances shall Watch2Gether, its maintainers, or hosting partners be liable for indirect, incidental, or consequential damages resulting from downtime or synchronization variance.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span>Watch2Gether Platform</span>
          <Link href="/privacy" className="text-indigo-400 hover:underline">
            View Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
