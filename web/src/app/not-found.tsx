"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Film, Compass, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackgroundGrid } from "@/components/visual/BackgroundGrid";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#0C0D0E] text-slate-100 px-4 text-center">
      <BackgroundGrid />

      <div className="relative z-10 max-w-md space-y-6">
        <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 font-mono text-xs px-3 py-1">
          404 · Stream Signal Lost
        </Badge>

        <div className="space-y-2">
          <h1 className="text-6xl font-bold font-mono tracking-tight text-white">404</h1>
          <h2 className="text-xl font-semibold text-slate-200">
            Room or Endpoint Not Found
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            The watch party you are attempting to connect to either expired or the URL entered is invalid.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href="/">
            <Button size="sm" variant="glow" className="h-9 px-4 text-xs gap-1.5 shadow-indigo-500/20">
              <Tv className="h-3.5 w-3.5" />
              <span>Back to Theater</span>
            </Button>
          </Link>
          <Link href="/analytics">
            <Button size="sm" variant="outline" className="h-9 px-4 text-xs gap-1.5 border-slate-700 bg-slate-900/60">
              <Compass className="h-3.5 w-3.5" />
              <span>Platform Intelligence</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
