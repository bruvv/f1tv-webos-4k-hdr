# Compatibility and evidence ledger — 0.2.4

## Bottom line

This is an installable **experimental client**, not a validated F1 TV Premium replacement. No F1 account or target TV was available to this engineering run. A user reported successful Premium-account login on 0.2.3 and an idle sign-out after roughly a minute. That is user-reported login evidence, not instrumented service-lifetime or playback evidence. The 0.2.4 Enter navigation, foreground lifetime fix, live/catalog correctness, licenses, decoding, audio and HDR output have **not** been independently tested against production/hardware. No content or decryption keys were obtained. There are no sample streams or simulated playback successes.

The target model is OLED65G69LS. Do not conflate it with the 2016 G6 family. Installed firmware remains unknown. Product-generation information is not device inspection.

## What changed and what was tested

| Item | Evidence | Limitation |
|---|---|---|
| Local Shaka 4.16.0 runtime and Apache license | Present in app/vendor and package tests | Compatibility with TV firmware untested |
| Relay exact-host HTTPS policy | Node regression tests | Additional CDN origins fail closed; a legitimate cross-host redirect may need an explicitly reviewed allowlist |
| License credentials restricted to F1 license origin | Redirect policy regression tests | No live license issued; external license providers deliberately rejected |
| Failed login clears partial entitlement | Service harness test | Harness uses test-only response doubles, not F1 production |
| OAuth/PKCE password flow, state checks and credential-origin isolation | Synthetic transport and service tests; public configuration extraction checked against F1's frontend | Premium login success user-reported on 0.2.3, not independently instrumented; browser challenge/MFA still requires official browser sign-in |
| Token JSON/cookie extraction, challenge rejection, paste counts and chunks | Parser and simulated DOM tests, including long input | Real TV clipboard/remote behavior untested; only F1 validates token signatures and expiry |
| Logout/session changes invalidate relay URLs | Source implementation | No hardware test |
| Audio/subtitle cycling | UI calls Shaka language APIs | Not exercised with real multi-language content |
| Playback diagnostics | Video-element dimensions, Shaka active-track metadata and frame counters | Not evidence of hardware acceleration or actual HDR output |
| Capability probes | Tests cover unsupported MSE/EME and rejected robustness | EME acceptance is not a Widevine level certification or license guarantee |
| Foreground account/relay service lifetime | Activity acquired after login, renewed every 15 seconds on all signed-in pages; simulated 10-minute idle-browsing test; stop preserves it, background/logout/crash releases it | Updated installed webos-service behavior still needs TV confirmation; no persisted sessions |
| LG keyboard Enter navigation | Synthetic event/DOM tests cover email → password → Sign in, no auto-submit, repeat/IME handling; follows LG control-key/blur guidance | OSK transition timing not observed on TV |
| No-live message and latest-race shortcut | UI/service tests cover empty vs failed catalog, recent-date ordering and exclusion of support races/highlights/shows | Scans at most 100 recent results; real catalog classification not independently confirmed |
| Reproducible Python IPK | Full-byte repeat-build comparison and archive/content tests | Python packager is not LG certification |
| Official LG CLI packaging | @webos-tools/cli 3.2.6 ares-package succeeded | Installation not tested; CLI warned about missing requiredACG and target Node version |

## Android patch versus webOS

Reference: Alexvbp/f1tv-4k-patch commit `2b5f93c9bbcc54c0096c51b26e9308ab9e2f181a`, scripts/patch.sh.

- Lines 111–198 bypass app-side secure HEVC, RAM, Android version and UHD whitelist validators.
- Lines 200–259 enable the quality selector.
- Lines 268–331 report secure HEVC tile decoder capacity (16 slots; five rows/columns). These are capability reports, not new hardware.
- Lines 333–379 disable an NVIDIA postprocessing workaround.
- Lines 387–446 report a 3840×2160 display to ClearVR.
- Lines 448–765 modify HDR advertising, real HLG/PQ detection and EGL render-target routing. The script author associates HDR capability advertising with 2160p availability and SDR with a 1620p cap. That is **not independently verified server behavior**.
- Lines 767–848 supply Android MediaFormat maximum decoder dimensions to improve adaptive decoder allocation.
- Lines 850–967 add optional debug logging. The script explicitly avoids the previous model spoof.

The script does not replace subscription authorization or Widevine. Android smali, MediaCodec, ClearVR tile decoding and EGL HLG/PQ rendering are not portable JavaScript/webOS interfaces. An ordinary HEVC representation may work with webOS MSE/EME; a ClearVR tile/metadata composition pipeline may require a licensed compatible SDK and cannot be assumed playable by Shaka. A stream type such as HDR-UHD-CMAF-WV does not prove the MPD contains an independently playable 3840×2160 representation.

The prototype's x-f1-device-info profile attempts are experimental compatibility probes, not a supported webOS client identity. They are now **opt-in**. This work does not implement the Android capability spoofing or an HLG-to-PQ shader. Changing a request header cannot establish entitlement, secure decode, frame rate or color correctness.

## API reference inspection

F1OpenViewer commit `bd4e1cf0ef79aacdc3acafe969759d79895dd502`, MIT:

- electron/f1tvClient.js: password endpoint and capitalized/lowercase login-body attempts, page lookup and account headers.
- electron/f1tvapi.js: subscription verification, entitlement and location, CONTENT/PLAY.
- electron/f1tvPlayback.js: platform candidate selection, pipeline-dependent license fallback, manifest playToken cookie and URL fallback.
- electron/licenseProxy.js: binary challenge forwarding and DRM/account headers.

Our license forwarding now includes both drmtoken and Bearer authorization when a DRM token is returned. Manifest response playToken cookies take precedence over the pre-existing URL fallback. Account entitlement and a possible per-play entitlement are distinct; the latter still needs implementation/validation. The fallback CONTENT/LA/widevine route is not proven valid for all pipeline versions. Interactive anti-bot/browser flows, local JWT signature verification, refresh/re-authentication and production response-schema validation remain open work. The app delegates imported-token signature/expiry validation to F1's entitlement endpoint. API compatibility is inferred from public source, not confirmed by F1.

No F1OpenViewer source was copied in this iteration. Its MIT license does not license F1 content or establish API access permission.

FastF1 commit `383e950b02a9b864c5f09a961a7451862edaf8b5`, MIT, documents the newer PingOne OAuth/PKCE account flow. Version 0.2.3 follows this sequence instead of F1OpenViewer's legacy password endpoint; the license is bundled as `service/FASTF1-LICENSE`. Public OAuth configuration was retrieved successfully. Premium-account login was subsequently user-reported on 0.2.3, but entitlement responses were not independently captured or verified.

## Playback approach decision

1. **Primary: Shaka + webOS MSE/EME + built-in Widevine.** LG documents this class of playback. Prefer the platform decoder; no software decode is bundled.
2. **Native video path:** the existing HLS fallback is experimental. LG native DRM examples are not evidence of native Widevine DASH support. Do not send a Widevine MPD to video.src and assume support.
3. **Alternate backend/native extension:** not implemented. It would need a verified missing interface and a documented/licensed secure pipeline; root is not a substitute for a CDM or protected video surface.

LG's webOS TV 26 format table lists Ultra HD HEVC Main/Main10 up to 3840×2160/60p and 60 Mb/s. This is a platform format statement, not observed 2160p50/60 protected playback on this TV. HLG, secure robustness and tiled-stream support must be established separately. Browser MSE/EME probes do not directly expose EGL extensions or certify secure video paths.

## Known gaps (required before success can be claimed)

- Persistent sign-in is **not implemented**. Tokens remain in service RAM; service restart requires login. No insecure browser/localStorage credential persistence was added. A reviewed device storage strategy is needed; LG's /media/internal storage guidance does not itself provide encrypted secret storage.
- The HTTP server alone does not establish webOS service residency. A documented Activity Manager create/complete lease is now implemented and unit-tested, but its callback/object behavior and firmware permissions still require target testing.
- The catalog only requests live-now and recent VOD; complete season/Grand Prix/upcoming navigation and onboard/feed discovery are missing. The service accepts channelId but the UI does not yet discover channels.
- Expired tokens are surfaced as errors; automatic refresh is absent.
- Audio/subtitle and manual quality controls are implemented but untested on media. Remote focus and long-session behavior remain untested.
- No native DASH/Widevine alternative, secure surface integration or ClearVR SDK has been demonstrated.
- Exact CDN-host restrictions can reject legitimate cross-origin manifests. Do not weaken credential isolation to fix this; record the authorized manifest's origins and review them explicitly.
- No hardware HDR output, actual decoded frame rate, secure hardware acceleration, color correctness or audible output evidence exists.

## Sources

- https://github.com/Alexvbp/f1tv-4k-patch/blob/2b5f93c9bbcc54c0096c51b26e9308ab9e2f181a/scripts/patch.sh
- https://github.com/npanu420/F1OpenViewer/tree/bd4e1cf0ef79aacdc3acafe969759d79895dd502
- https://github.com/webosbrew/webos-homebrew-channel#installation
- https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm
- https://webostv.developer.lge.com/develop/specifications/video-audio-260
- https://webostv.developer.lge.com/develop/guides/drm-content-playback
- https://webostv.developer.lge.com/develop/guides/js-service-usage
- https://webostv.developer.lge.com/develop/references/webos-service-reference
- https://webostv.developer.lge.com/develop/guides/js-service-faq
- https://webostv.developer.lge.com/develop/guides/virtual-keyboard
