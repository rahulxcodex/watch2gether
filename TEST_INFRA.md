# E2E Test Infra: Watch2Gether

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from `ORIGINAL_REQUEST.md`.
- Multi-client real-time synchronization testing via Playwright multi-context isolation.
- Methodology: Category-Partition + BVA + Pairwise + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Room Creation & Link Generation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Zero-Wall Guest Onboarding | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Low-Latency Playback Sync (<=500ms) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Rapid Pause Propagation (<=200ms) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Seek & Scrub Synchronization | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Host-Only vs Shared Permissions | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Real-Time Chat Messaging | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 8 | Floating Emoji Reaction Bursts | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 9 | Dual Media Support (Direct MP4 & YouTube) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Playwright (`@playwright/test`)
- Multi-client model: Isolated `hostContext` and `guestContext` running simultaneously.
- Directory layout:
  - `e2e/specs/sync-accuracy.spec.ts` (Evaluates DOM `<video>.currentTime` drift across contexts)
  - `e2e/specs/pause-latency.spec.ts` (Evaluates DOM pause event dispatch delta)
  - `e2e/specs/guest-access.spec.ts` (Asserts zero login modals and immediate room access)
  - `e2e/specs/chat-realtime.spec.ts` (Asserts instant chat message and reaction delivery)
  - `e2e/specs/permissions.spec.ts` (Asserts host-only restrictions and shared control toggles)
  - `scripts/run-e2e.ps1` (Automated stack bootstrap, health check, and test execution)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Movie Night: 3 Guests join via link, Host plays 60s MP4, pauses at 30s, seeks to 45s, all clients remain in sync | F1, F2, F3, F4, F5 | High |
| 2 | E-Learning Lecture: Instructor (Host-only mode) presents video, students chat and send question reactions, students cannot pause video | F1, F3, F6, F7, F8 | High |
| 3 | Long-Distance Couple: Shared mode, Partner A plays, Partner B pauses, both send emoji reactions while video syncs seamlessly | F2, F3, F4, F6, F8 | High |
| 4 | Network Jitter & Reconnect: Guest reconnects after temporary disconnect, automatically resynchronizes to host playback head | F2, F3, F5 | High |
| 5 | YouTube Watch Party: Group creates room with YouTube URL, starts synchronized playback with synchronized seek | F1, F3, F5, F9 | Medium |

## Coverage Thresholds
- Tier 1: $\ge 45$ feature unit & happy-path test cases
- Tier 2: $\ge 45$ boundary, corner case, and edge case tests (rapid seeks, empty chat, long text, fast pauses)
- Tier 3: Pairwise matrix covering permission modes $\times$ media types $\times$ client actions
- Tier 4: $\ge 5$ realistic multi-user application workflows
- Total minimum test cases: $\ge 100$ assertions and test runs
