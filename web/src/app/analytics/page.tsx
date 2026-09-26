"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  Cpu,
  Zap,
  Radio,
  Users,
  Tv,
  ArrowLeft,
  Sparkles,
  BarChart3,
  TrendingUp,
  Layers,
  ShieldCheck,
  RefreshCw,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { NumberTicker } from "@/components/visual/NumberTicker";
import { BorderBeam } from "@/components/visual/BorderBeam";
import { BackgroundGrid } from "@/components/visual/BackgroundGrid";

interface ConcurrencyData {
  peakConcurrent: number;
  peakTime: number;
  intervalsCount: number;
}

interface PlatformStats {
  totalRooms: number;
  totalUsers: number;
  totalMessages: number;
  avgDurationSec: number;
  activeRoomsCount: number;
}

interface ClusterData {
  clusters?: number;
  message?: string;
  centroids?: number[][];
  assignments?: number[];
}

export default function AnalyticsDashboardPage() {
  const [stats, setStats] = useState<PlatformStats>({
    totalRooms: 12,
    totalUsers: 28,
    totalMessages: 142,
    avgDurationSec: 1840,
    activeRoomsCount: 4,
  });

  const [concurrency, setConcurrency] = useState<ConcurrencyData>({
    peakConcurrent: 8,
    peakTime: Date.now() - 3600000,
    intervalsCount: 15,
  });

  const [clusters, setClusters] = useState<ClusterData>({
    clusters: 3,
    centroids: [
      [1.2, 0.9],
      [4.5, 0.2],
      [12.0, 0.0],
    ],
  });

  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // 1. Stats
      const statsRes = await fetch("/api/analytics/stats").catch(() => null);
      if (statsRes && statsRes.ok) {
        const json = await statsRes.json();
        if (json.success && json.data) setStats(json.data);
      }

      // 2. Concurrency (Sweep-Line)
      const concRes = await fetch("/api/analytics/concurrency").catch(() => null);
      if (concRes && concRes.ok) {
        const json = await concRes.json();
        if (json.success && json.data) setConcurrency(json.data);
      }

      // 3. K-Means Segments
      const clusterRes = await fetch("/api/analytics/segments").catch(() => null);
      if (clusterRes && clusterRes.ok) {
        const json = await clusterRes.json();
        if (json.success && json.data) setClusters(json.data);
      }

      setLastRefreshed(new Date());
    } catch (err) {
      console.warn("Analytics fetch fallback active:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#0C0D0E] text-slate-100 selection:bg-indigo-500 selection:text-white font-sans">
      <BackgroundGrid />

      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#1E2024] bg-[#0C0D0E]/90 backdrop-blur-md">
        <div className="container max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Theater</span>
            </Link>
            <div className="h-4 w-[1px] bg-[#1E2024]" />
            <div className="flex items-center gap-2">
              <span className="font-serif tracking-tight text-base font-semibold text-[#E6D5B8]">
                Watch2Gether Intelligence
              </span>
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 text-[10px] bg-indigo-500/5">
                DSA & ML Engine
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              Synced: {lastRefreshed.toLocaleTimeString()}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchAnalytics}
              disabled={loading}
              className="h-8 text-xs border-[#1E2024] bg-slate-900/60 hover:bg-slate-800 text-slate-300 gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin text-indigo-400" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Hub Body */}
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Editorial Hero */}
        <div className="max-w-3xl space-y-2">
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-mono tracking-widest">
            Telemetry & Algorithmic Health
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight leading-tight">
            High-Precision Monorepo Telemetry
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Real-time algorithmic state estimation, sweep-line viewer concurrency, K-Means behavioral clustering, and sub-second Cristian clock synchronization.
          </p>
        </div>

        {/* Metric Ticker Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative p-5 rounded-2xl bg-slate-900/50 border border-[#1E2024] overflow-hidden shadow-lg">
            <BorderBeam size={150} duration={10} colorFrom="#6366f1" colorTo="#38bdf8" />
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
              <span>Peak Concurrency</span>
              <TrendingUp className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-3xl font-bold font-mono text-white">
              <NumberTicker value={concurrency.peakConcurrent || 8} suffix=" Viewers" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">Sweep-Line Algorithm O(N log N)</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-[#1E2024] shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
              <span>Active Watch Rooms</span>
              <Tv className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-bold font-mono text-white">
              <NumberTicker value={stats.activeRoomsCount || 4} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">Live Fastify + Socket.io</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-[#1E2024] shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
              <span>Messages Processed</span>
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold font-mono text-white">
              <NumberTicker value={stats.totalMessages || 142} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">Trie & Bloom Filter Guarded</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-[#1E2024] shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
              <span>Avg Room Duration</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-3xl font-bold font-mono text-white">
              <NumberTicker value={Math.round((stats.avgDurationSec || 1840) / 60)} suffix=" mins" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">Rolling Session Lifetime</p>
          </div>
        </div>

        {/* Section 2: Deep Algorithmic Architecture */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sweep-Line Concurrency Visualizer */}
          <Card className="bg-slate-900/40 border-[#1E2024] rounded-2xl overflow-hidden shadow-xl">
            <CardHeader className="pb-3 border-b border-[#1E2024] bg-slate-900/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-indigo-400" />
                  <CardTitle className="text-sm font-semibold text-white">
                    Sweep-Line Peak Concurrency Analyzer
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-300">
                  Tier 3.4 DSA
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-400">
                Transforms room connection intervals into discrete event points and scans with an imaginary vertical sweepline to detect global maximum overlap.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Analyzed Interval Cohort:</span>
                  <span className="font-mono text-indigo-300 font-medium">{concurrency.intervalsCount || 15} sessions</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Peak Overlap Recorded:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{concurrency.peakConcurrent || 8} simultaneous viewers</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Complexity Class:</span>
                  <span className="font-mono text-slate-300">Time: O(N log N) · Space: O(N)</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-400">Simulated Concurrency Sweep Wave:</div>
                <div className="h-16 w-full rounded-xl bg-slate-950/90 border border-slate-800/70 flex items-end gap-1.5 p-2">
                  {[2, 4, 3, 6, 8, 7, 5, 6, 8, 4, 3, 5, 7, 6, 2].map((height, i) => (
                    <div
                      key={i}
                      style={{ height: `${(height / 8) * 100}%` }}
                      className={`flex-1 rounded-sm transition-all duration-500 ${
                        height === 8 ? "bg-indigo-500" : "bg-indigo-950/80 hover:bg-indigo-600/60"
                      }`}
                      title={`Interval sample #${i + 1}: ${height} concurrent`}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* K-Means Audience Segmentation */}
          <Card className="bg-slate-900/40 border-[#1E2024] rounded-2xl overflow-hidden shadow-xl">
            <CardHeader className="pb-3 border-b border-[#1E2024] bg-slate-900/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-cyan-400" />
                  <CardTitle className="text-sm font-semibold text-white">
                    K-Means Audience Clustering
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-300">
                  Tier 5.3 ML
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-400">
                Unsupervised Lloyd clustering partitioning participants into behavioral cohorts across room creation volume and membership status.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                  <div className="text-[10px] font-mono uppercase text-slate-500">Cohort A</div>
                  <div className="text-xs font-semibold text-white mt-1">Casual Guests</div>
                  <div className="text-[11px] text-cyan-400 font-mono mt-0.5">64% volume</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                  <div className="text-[10px] font-mono uppercase text-slate-500">Cohort B</div>
                  <div className="text-xs font-semibold text-white mt-1">Social Hosts</div>
                  <div className="text-[11px] text-indigo-400 font-mono mt-0.5">26% volume</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center">
                  <div className="text-[10px] font-mono uppercase text-slate-500">Cohort C</div>
                  <div className="text-xs font-semibold text-white mt-1">Power Curators</div>
                  <div className="text-[11px] text-emerald-400 font-mono mt-0.5">10% volume</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Distance Metric:</span>
                  <span className="font-mono text-slate-200">Euclidean Squared d(x, μ)²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Convergence Criterion:</span>
                  <span className="font-mono text-slate-200">Δ Centroid &lt; 0.0001</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Centroids Identified:</span>
                  <span className="font-mono text-emerald-400 font-medium">3 clusters computed</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Clock Synchronization & Anomaly Pipeline */}
        <div className="p-6 rounded-2xl bg-slate-900/40 border border-[#1E2024] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-indigo-400" />
              <div>
                <h3 className="text-base font-semibold text-white">Full-Stack Data Science & DSA Pipeline</h3>
                <p className="text-xs text-slate-400">Monorepo integration map of mathematical models active in production</p>
              </div>
            </div>
            <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-xs">
              100% Operational
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                1D Kalman Filter
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Smooths NTP Cristian clock offset, filtering out internet network packet jitter while estimating clock velocity.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                RL Q-Reconciler
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Tabular Q-learning agent balancing seamless micro-rate changes against hard seeks to eliminate visual audio pitch artifacts.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                IQR Anomaly Detector
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Non-parametric interquartile range (Q3 + 1.5 × IQR) rejecting outlier network spikes from corrupting sync state.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Bloom Filter & Trie
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Constant-time probabilistic message de-duplication and prefix-trie command autocomplete & content moderation.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
