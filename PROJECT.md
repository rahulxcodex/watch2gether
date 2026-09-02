# Project: Watch2Gether Cross-Platform Media Synchronization

## Architecture
Watch2Gether is a cross-platform (Web & Native Android) media synchronization and real-time interaction platform.
- **Shared Layer (`packages/shared`)**: Shared TypeScript types, Socket.io event schemas, REST DTOs, and sync math utilities. (DONE)
- **Backend Service (`backend`)**: Node.js LTS with TypeScript, Fastify REST API, Socket.io v4 WebSocket Server with Redis Pub/Sub adapter (`@socket.io/redis-adapter`), PostgreSQL / SQLite persistence via Drizzle ORM, anonymous guest JWT authentication. (DONE)
- **Web Client (`web`)**: Next.js 14/15 App Router, Tailwind CSS, Radix UI primitives, Shadcn UI components, Magic UI / Aceternity UI effects, unified HTML5 & YouTube player controller, 3-tier client drift compensation engine, real-time chat with emoji reactions canvas. (IN_PROGRESS)
- **Native Android Client (`android`)**: Kotlin 2.0, Jetpack Compose Material3, AndroidX Media3 ExoPlayer, `android-youtube-player`, unified `MediaPlayerController`, deep-link routing (`watch2gether://room/{id}` and App Links), Picture-in-Picture (PiP). (PLANNED)
- **E2E Testing Suite (`e2e`)**: Multi-context Playwright test harness verifying multi-client synchronization ($\le 500\text{ms}$), pause propagation ($\le 200\text{ms}$), zero-wall guest access, and real-time chat propagation. (PLANNED)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Room Creation & Management | REST API & DB to create private rooms, generate codes, and manage room settings | M1 | R1 |
| 2 | Zero-Wall Guest Identity | Anonymous guest session generation via JWT cookies with no login prompt | M1 | R1 |
| 3 | Room State Machine & Permissions | Host-only vs Shared playback permissions, playback states (idle, playing, paused) | M1 | R1, R2 |
| 4 | Redis Pub/Sub WebSocket Scalability | Socket.io server scaled across rooms using Redis pub/sub adapter | M1 | R2 |
| 5 | NTP Clock Synchronization | Cristian's algorithm clock offset handshake (`sync:ping` / `sync:pong`) | M1 | R2 |
| 6 | Real-time Play/Pause/Seek Sync Protocol | Authoritative state broadcast, monotonic versioning, echo-loop suppression | M1 | R2 |
| 7 | Next.js Modern Web Client | Next.js App Router, Tailwind CSS, Radix/Shadcn/Magic/Aceternity UI, 2-column theater | M2 | R3 |
| 8 | Web Unified Player Engine | Synchronized playback for HTML5 direct MP4s and YouTube IFrame API | M2 | R2, R3 |
| 9 | 3-Tier Drift Reconciliation (Web) | Deadband ($<150\text{ms}$), rate adjustment ($150-1000\text{ms}$), hard seek ($>1000\text{ms}$) | M2 | R2 |
| 10 | Real-Time Chat & Emoji Reactions | Instant chat sidebar, message delivery, floating emoji reaction particle canvas | M2 | R3 |
| 11 | Share Room & Onboarding CTAs | Prominent room invite modal, copy link CTA, QR code generator | M2 | R3 |
| 12 | Native Android Compose App | Kotlin + Jetpack Compose Material3 UI, navigation, theme, room interface | M3 | R4 |
| 13 | Android Media3 ExoPlayer + YouTube | Unified Android playback engine supporting MP4 streams and YouTube embeds | M3 | R4 |
| 14 | Android Deep Linking | Custom scheme `watch2gether://room/{id}` & HTTPS App Link auto-routing to room | M3 | R4 |
| 15 | Android Picture-in-Picture (PiP) | Background PiP support with auto-enter, remote actions, and collapsed layout | M3 | R4 |
| 16 | E2E Multi-Client Test Harness | Isolated Playwright multi-context test harness and deterministic media fixtures | M-E2E | Acceptance Criteria |
| 17 | Sync & Latency Verification Tests | Programmatic tests for $\le 500\text{ms}$ sync, $\le 200\text{ms}$ pause, chat delivery | M-E2E | Acceptance Criteria |
| 18 | Final E2E Suite Pass & Hardening | 100% test pass on Tiers 1-4 + Tier 5 adversarial test suite hardening | M-Final | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend & Shared Foundation | `packages/shared`, `backend/` (Fastify REST, Socket.io, Redis PubSub, DB models, Auth, Sync protocol) | none | DONE |
| M2 | Web Client Application | `web/` (Next.js UI, Radix/Shadcn/Magic/Aceternity, Unified Player, Drift Sync, Chat & Reactions) | M1 | DONE |
| M3 | Native Android Client | `android/` (Kotlin, Jetpack Compose, Media3 ExoPlayer, Deep Link, PiP, Sync Engine) | M1 | DONE |
| M-E2E | E2E Testing Track | `e2e/` (Playwright harness, multi-context sync tests, latency assertions, auth, chat) | none | DONE |
| M-Final | Final Acceptance & Hardening | Run 100% E2E suite (Tiers 1-4) + Tier 5 adversarial test suite hardening | M1, M2, M-E2E | DONE |

## Code Layout
```
c:\Users\Rahul\Documents\antigravity\brave-carson\
├── package.json              # Monorepo root scripts and workspaces
├── packages/
│   └── shared/               # Shared TypeScript schemas, DTOs, and sync math (DONE)
├── backend/                  # Fastify REST API & Socket.io Server (DONE)
├── web/                      # Next.js 14/15 React Client (IN_PROGRESS)
├── android/                  # Native Android Kotlin / Jetpack Compose Client (PLANNED)
├── e2e/                      # Playwright E2E Multi-Client Test Suite (PLANNED)
└── scripts/                  # Automated scripts and E2E runner (PLANNED)
```
