# Phase 7 — Packaging evaluation

## Decision

The web application remains the only production delivery target. The Tauri Linux package and Capacitor Android package are retained as reproducible evaluation artifacts, not supported distribution channels. Neither evaluated package forks gameplay or progression logic, and neither is approved for release signing, publication, or automatic updates.

The Linux desktop evaluation has a real package launch and interaction result, but packaged report-export destination behavior is not validated. The Android evaluation has a reproducible debug APK and an exercised APK-extracted payload, but no Android WebView device launch; report export is blocked in the minimal shell. Those gaps prevent a production packaging claim. iOS is not evaluated because the Linux implementation environment cannot build or sign it.

## Evaluated target matrix

| Target | Reproduction and artifact | Authority boundary | Launch and interaction evidence | Persistence and suspension evidence | Report export | Phase 7 classification |
| --- | --- | --- | --- | --- | --- | --- |
| Web/PWA | `pnpm build`; `apps/web/dist` | Existing authoritative Web Worker owns simulation; the web client owns no gameplay truth | Existing production browser and offline gates | Existing IndexedDB checkpoint and focus-loss pause browser coverage | Existing Blob/download path | Production delivery target |
| Tauri 2 on Linux | `pnpm build:desktop:docker`; ignored Debian bundle under `.ddh/desktop-package/` | Packages `apps/web/dist`; empty native capability permission list; no native gameplay, progression, save, report, or telemetry implementation | Real Tauri/WebKit Linux bundle launch reaches the checkpoint, starts the worker-backed journey, and observes background pause | Existing origin-scoped IndexedDB is retained; focus/background handling is observed, but long-duration OS suspension is not claimed | Existing web download path remains; terminating-run destination-file integration is not validated | Reproducible evaluation artifact; distribution blocked by export validation and release infrastructure exclusions |
| Capacitor 8 on Android | `pnpm build:mobile:docker`; `.ddh/mobile-package/dwarven-depths-debug.apk` | Packages byte-identical `apps/web/dist`; empty `BridgeActivity`; no Android permissions or native gameplay, progression, save, report, or telemetry implementation | Two clean APK assemblies match byte-for-byte; the APK-extracted payload reaches the checkpoint at 320 × 720 with touch targets, safe-area layout, offline assets, and no external request. No emulator/device WebView launch is claimed | Existing IndexedDB checkpoint survives packaged-payload reload; hidden, `pagehide`, and blur paths pause without automatic resume | Blocked: the existing Blob/anchor path emits no mobile download event, and no native filesystem/share authority is granted | Reproducible debug evaluation artifact; distribution blocked by device-launch and export evidence |
| Capacitor on iOS | No build artifact | Not evaluated | Not evaluated | Not evaluated | Not evaluated | Blocked: iOS build and signing require a macOS toolchain unavailable to this evaluation |

## Frozen boundaries

- Desktop and mobile shells consume the same production web application and authoritative worker. Platform adapters do not own simulation, progression, persistence formats, reports, replays, telemetry, or deterministic state.
- `pnpm check:desktop-package` and `pnpm check:mobile-package` reject package/configuration drift that expands native authority or changes the packaged production source. Both checks remain in `pnpm verify` with the existing lint, generated-artifact, typecheck, build, payload, offline, deterministic, and browser gates.
- The Android debug identity is public evaluation material, not a release credential. No evaluated target is approved for release signing, store publication, installer hosting, auto-update, analytics, push notifications, or a new release channel.
- Physical-device performance, long-duration OS suspension, portable cross-package storage, desktop destination-file export, Android download/share export, iOS behavior, and distribution operations remain unclaimed.
- A future production packaging decision must be explicitly approved and must close the target's launch, suspension/storage, export, signing, and distribution evidence gaps without adding platform-owned gameplay or weakening accessibility, offline, deterministic, or exact-head release gates.

## Executable checks

- `pnpm check:desktop-package`
- `pnpm exec vitest run scripts/check-desktop-package.test.ts`
- `pnpm build:desktop:docker`
- `pnpm check:mobile-package`
- `pnpm exec vitest run scripts/check-mobile-package.test.ts scripts/check-mobile-apk.test.ts`
- `pnpm build:mobile:docker`
- `pnpm verify`
