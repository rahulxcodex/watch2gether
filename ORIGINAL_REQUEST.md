# Original User Request

## Initial Request — 2026-09-02T13:12:01Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: A full team of agents to execute the roadmap.

Build a cross-platform (Web and Android) application for "watch2gether" to synchronize media playback and real-time interactions, targeting long-distance couples, friends, and e-learning groups.

Working directory: c:\Users\Rahul\Documents\antigravity\brave-carson
Integrity mode: development

## Requirements

### R1. Cross-Platform Room & Identity Management
The system must support creating a private room and generating an invite link. Guests must be able to join via link without a mandatory account creation wall. The backend must handle room states securely via a REST API (Node.js/Go) and PostgreSQL.

### R2. Low-Latency Media Sync Engine
The core loop requires real-time Play, Pause, and Seek synchronization for YouTube URLs and direct MP4s. The backend must use WebSockets/Socket.io backed by Redis for pub/sub scaling across multiple concurrent rooms. Playback permissions should distinguish between Host-only and Shared controls.

### R3. Web Client UX & UI
The web application (React/Next.js) must have a fully responsive, modern UI leveraging Tailwind, Radix UI, Shadcn UI, Magic UI, and Aceternity UI. It must feature seamless onboarding, prominent "Create Room" / "Share Link" CTAs, and real-time text chat with emoji reactions. 

### R4. Native Android Client
The Android application must be built natively (Kotlin/Jetpack Compose) utilizing ExoPlayer for smooth media playback. It must support deep linking from invite URLs directly into the app room, and provide background Picture-in-Picture (PiP) capabilities.

## Acceptance Criteria

### [Media Synchronization]
- [ ] Programmatic Test (Playwright): Two web clients joining the same room stay within 500ms playback sync.
- [ ] Programmatic Test (Playwright): When the host pauses on Client A, Client B pauses within 200ms.

### [Room & Identity]
- [ ] Programmatic Test (API/Playwright): A guest session can be created and enter a room using only the invite URL, with no login prompt blocking the video.
- [ ] Programmatic Test (Playwright): Text chat messages sent by Client A appear instantly on Client B's screen.

### [Platform Architecture]
- [ ] Backend codebase structure reflects a separation of REST API and WebSocket Server, with Redis configured for pub/sub.
- [ ] The web client is built with Next.js, Radix UI, and Tailwind CSS.
- [ ] The Android project is initialized with Kotlin and Jetpack Compose.
