# Watch2Gether Project Atlas & Subagent Context

## High-Density Architectural Map
- **Monorepo Structure**:
  - `packages/shared/`: Shared TypeScript models, Socket.io event signatures, DTOs, Cristian clock-sync math.
  - `backend/`: Fastify REST API, Socket.io v4 server, Redis Pub/Sub adapter, Drizzle ORM (PostgreSQL/SQLite), guest JWT auth.
  - `web/`: Next.js 14/15 App Router, Tailwind CSS, Radix UI, Shadcn UI, Unified Player (HTML5/YouTube), 3-tier drift reconciler, live chat.
  - `android/`: Kotlin 2.0, Jetpack Compose Material3, Media3 ExoPlayer, `android-youtube-player`, deep-link routing.
  - `e2e/`: Multi-context Playwright suite verifying $\le 500\text{ms}$ drift, pause propagation, and chat.

## Feature-to-File Index
| Subsystem | Key Files / Entry Points |
|---|---|
| **Auth & Sessions** | `backend/src/auth/` (JWT cookies, guest UUID generator) |
| **Room State Machine** | `backend/src/rooms/`, `packages/shared/src/room.ts` |
| **Clock Sync (NTP)** | `packages/shared/src/sync/ntp.ts`, `backend/src/socket/sync.ts` |
| **Web Player Engine** | `web/src/components/player/UnifiedPlayer.tsx` |
| **Web Drift Reconciler** | `web/src/hooks/useDriftReconciler.ts` (Deadband: $<150\text{ms}$, Rate: $150-1000\text{ms}$, Seek: $>1000\text{ms}$) |
| **Chat & Floating Reactions** | `web/src/components/chat/ChatSidebar.tsx`, `web/src/components/reactions/Canvas.tsx` |
| **Android Sync Engine** | `android/app/src/main/java/.../sync/SyncController.kt` |
| **E2E Test Suites** | `e2e/tests/sync.spec.ts`, `e2e/tests/auth.spec.ts` |

## Subagent Token Guardrails
1. **Never read entire files >100 lines**. Use `grep_search` to find symbols, then `view_file` with `StartLine`/`EndLine`.
2. **Never scan directories**. Use the file index above to jump directly to the code.
3. **Never read lockfiles** (`package-lock.json`).
4. **Keep reports under 150 words** or deliver structured code diffs.
