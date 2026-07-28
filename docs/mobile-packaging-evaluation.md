# Mobile packaging evaluation

## Evaluated boundary

The Phase 7 mobile evaluation packages the existing `apps/web/dist` output in a minimal Capacitor 8 Android shell. `MainActivity` is an empty `BridgeActivity`; the packaged simulation remains the existing Web Worker. No native gameplay, progression, save, report, or telemetry implementation is present.

The supported evaluation artifact is an unsigned/debug Android APK only. This is not a distribution or release-channel decision.

## Reproduction

Run `pnpm build:mobile:docker` from a clean checkout. The command uses the digest-pinned Android image, builds and synchronizes the production web application, assembles the APK, inspects its merged package identity and permissions, and exercises the copied packaged assets in a 320 × 720 touch-capable Chromium context. The resulting ignored artifact is `.ddh/mobile-package/dwarven-depths-debug.apk`.

The merged APK requests no Android system permission. AndroidX contributes one application-scoped, signature-protected `com.dwarvendepths.game.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; the artifact check rejects every other permission.

## Observations

- The real APK assembles with application ID `com.dwarvendepths.game`, version code `1`, target SDK 36, the expected launcher activity, the production worker asset, and no external web request.
- The copied packaged payload reaches the checkpoint shell at a 320 × 720 touch viewport, has no horizontal overflow, and exposes controls at least 44 CSS pixels in each dimension. Safe-area viewport metadata and inset padding are frozen by the package contract.
- The local launch budget is 8 seconds; the final focused evaluation completed in 587 ms in the Playwright container. This is packaged-payload evidence, not a physical-device performance claim.
- IndexedDB checkpoint state survives a packaged-shell reload. Background `pagehide`, document-hidden, and window-blur paths pause combat and never automatically resume it; the browser regression exercises the StrictMode listener lifecycle.
- The existing Blob/anchor evidence export did not produce a mobile download event in the touch-capable Chromium acceptance run. The minimal Capacitor shell has no download listener or native filesystem/share plugin, so Android run-evidence export remains blocked rather than gaining native storage authority in this slice.

## Explicit blockers and exclusions

- The pinned Android build image has the Android toolchain but no installed emulator system image, and this Linux environment has no attached physical Android device. APK install and real Android WebView launch are therefore not claimed. A support decision requiring device launch evidence must supply a bounded emulator/device lane; the package and exact copied payload remain independently checked here.
- iOS packaging is not claimed because the Linux implementation environment cannot produce or sign an iOS application.
- Mobile evidence export remains blocked as described above. Adding a native share/filesystem bridge would expand authority and requires a separately approved product decision.
- Signing, release keys, store publication, auto-update, push notifications, analytics, and platform-owned gameplay or progression remain excluded.
