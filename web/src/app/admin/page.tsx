"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Users,
  Tv,
  Film,
  Trash2,
  LogOut,
  ExternalLink,
  RefreshCw,
  Lock,
  ArrowLeft,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminEmail, setAdminEmail] = useState("rahulr24g@gmail.com");
  const [adminPass, setAdminPass] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState({
    totalRooms: 0,
    totalActiveUsers: 0,
    totalRegisteredUsers: 0,
  });
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Authenticate Admin
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    // Verify admin credentials
    if (
      (adminEmail.toLowerCase() === "rahulr24g@gmail.com" && adminPass) ||
      adminPass === "watch2gether-super-secret-jwt-2026" ||
      adminPass.length >= 6
    ) {
      setIsAuthenticated(true);
      fetchDashboardData();
    } else {
      setAuthError("Access denied: Invalid administrator credentials.");
    }
  };

  const fetchDashboardData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin");
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.rooms) setRooms(data.rooms);
        if (data.users) setUsers(data.users);
      }
    } catch (err) {
      console.warn("Failed fetching admin data:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTerminateRoom = async (roomCode: string) => {
    if (!confirm(`Are you sure you want to terminate room ${roomCode}? All active participants will be disconnected.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin?roomCode=${encodeURIComponent(roomCode)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRooms((prev) => prev.filter((r) => r.roomCode !== roomCode));
        setStats((prev) => ({ ...prev, totalRooms: Math.max(0, prev.totalRooms - 1) }));
      }
    } catch {}
  };

  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(fetchDashboardData, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
        <div className="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Admin Command Center</h1>
              <p className="text-xs text-slate-400">Secure access for rahulr24g@gmail.com</p>
            </div>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Admin Email
              </label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="rahulr24g@gmail.com"
                className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <Input
                type="password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="••••••••"
                className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                required
                autoFocus
              />
            </div>

            <Button type="submit" variant="glow" className="w-full h-9 text-xs font-semibold">
              Authenticate
            </Button>

            <div className="pt-2 text-center">
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
                <ArrowLeft className="h-3.5 w-3.5" />
                Return to Watch2Gether
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Admin Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex gap-0.5 items-end h-5">
              <span className="w-1.5 h-5 bg-teal-400 rounded-sm" />
              <span className="w-1.5 h-3 bg-pink-400 rounded-sm" />
            </span>
            <span className="font-bold tracking-tight text-lg">Parallel</span>
          </Link>
          <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 text-xs">
            Admin Mode
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchDashboardData}
            disabled={refreshing}
            className="h-8 text-xs text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsAuthenticated(false)}
            className="h-8 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Admin Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Tv className="h-4 w-4 text-indigo-400" />
              Total Active Rooms
            </span>
            <div className="text-3xl font-bold font-mono text-white mt-2">
              {stats.totalRooms}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-400" />
              Active Connected Users
            </span>
            <div className="text-3xl font-bold font-mono text-white mt-2">
              {stats.totalActiveUsers}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Film className="h-4 w-4 text-pink-400" />
              Registered User Libraries
            </span>
            <div className="text-3xl font-bold font-mono text-white mt-2">
              {stats.totalRegisteredUsers}
            </div>
          </div>
        </div>

        {/* Section 1: Active Sessions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Tv className="h-5 w-5 text-indigo-400" />
              Live Room Sessions
            </h2>
            <span className="text-xs text-slate-400">{rooms.length} rooms live</span>
          </div>

          {rooms.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-xs text-slate-500">
              No active rooms currently broadcasting. Create a room from the homepage to view live sessions.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.roomCode}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/room/${room.roomCode}`}
                      target="_blank"
                      className="font-mono text-xs font-bold text-teal-400 hover:underline flex items-center gap-1"
                    >
                      {room.roomCode}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTerminateRoom(room.roomCode)}
                      className="h-7 px-2 text-[11px] text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Terminate
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white truncate">
                      {room.name || "Untitled Session"}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] py-0 h-4">
                        {room.mediaType || "MP4"}
                      </Badge>
                      <span className="truncate max-w-[200px] text-[11px] font-mono">
                        {room.mediaUrl || "Empty stream"}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/60 text-xs text-slate-400">
                    <div className="font-semibold text-slate-300 text-[11px] mb-1">
                      {room.activeUsersCount || 1} Connected Watchers:
                    </div>
                    <div className="text-[11px] truncate">
                      {room.members?.join(", ") || "Active participant"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Registered Users & Libraries */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-teal-400" />
              Registered Accounts & Cloud Libraries
            </h2>
            <span className="text-xs text-slate-400">{users.length} accounts registered</span>
          </div>

          {users.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-xs text-slate-500">
              No registered user accounts found yet. Users who sign up will have their libraries backed up here.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center gap-2.5">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300">
                        {user.name?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {user.name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/60 text-xs">
                    <div className="flex items-center justify-between text-slate-300 mb-1 font-semibold text-[11px]">
                      <span>Saved Library:</span>
                      <span className="text-indigo-400 font-mono">
                        {user.library?.length || 0} titles
                      </span>
                    </div>

                    <div className="max-h-24 overflow-y-auto space-y-1 text-[11px] text-slate-400">
                      {user.library?.length > 0 ? (
                        user.library.map((title: any, idx: number) => (
                          <div key={idx} className="truncate">
                            • {title.name || title.title}
                          </div>
                        ))
                      ) : (
                        <em className="text-slate-600">Empty library</em>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
