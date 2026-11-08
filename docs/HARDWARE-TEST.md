# Target deployment and validation

## Access status

Only the default localhost emulator is configured in this Mac's LG CLI device list. No LG TV SSH alias or authorized F1 session was found in the project. No network scanning, credential search, device installation or playback was performed. A configured, authorized TV connection and account session are required to continue hardware validation.

## Tools and device setup

```sh
brew install node
npm install -g @webos-tools/cli@3.2.6
ares-setup-device --list
ares-setup-device
```

Choose your existing authorized root/developer connection in the interactive setup. Do not assume Developer Mode's user/port/key equals root SSH access. Replace `myTV` below with that configured name. Never put passwords or tokens in shell arguments or diagnostic logs.

```sh
# Read-only identification; current CLI deprecates ares-device-info:
ares-device -i -d myTV
# Install the officially packaged app and service:
ares-install -d myTV dist/official/com.bruvv.f1tv_0.2.1_all.ipk
ares-launch -d myTV com.bruvv.f1tv
# App console and JS service inspector:
ares-inspect -d myTV -a com.bruvv.f1tv
ares-inspect -d myTV -s com.bruvv.f1tv.service
# Resource evidence while running:
ares-device -r -id com.bruvv.f1tv -t 5 -d myTV
```

Use the inspector URLs printed by the CLI. `ares-log` is **not supported by the TV profile** in CLI 3.2.6; use the app/service inspector consoles instead. Inspectors and resource monitoring can perturb timing; repeat playback without them when measuring performance.

For an already-authorized rooted SSH connection, optional read-only inspection (availability varies):

```sh
ssh ROOT_TV_ALIAS 'uname -a; cat /etc/webos-release; ps | grep -E "f1tv|node|uMedia|media"'
ssh ROOT_TV_ALIAS 'command -v journalctl; command -v logread; command -v luna-send'
# Only if available; review/redact locally before sharing output:
ssh ROOT_TV_ALIAS 'journalctl --since "10 min ago" --no-pager | grep -iE "f1tv|widevine|drm|decoder"'
```

These commands do not install root, stop services, change firmware, extract keys or alter DRM. Do not blindly share system logs: they can contain signed URLs or credentials. A process list or low CPU usage alone does not prove hardware acceleration.

## Ordered test and stop conditions

Record exact model, firmware and webOS version before playback. Do not infer installed firmware from the product name or the app's user agent (the service currently uses a static compatibility UA).

1. **Install/launch:** own interface must appear without visiting F1's site. Verify the packaged JS service starts and the relay binds localhost port 38791. Stop on service/permission errors rather than claiming success.
2. **Capabilities before login:** Account → Check playback capabilities. Save the console's `[F1TV capabilities]` JSON. This contains no account tokens. Record HEVC MSE declarations and each Widevine robustness result; a rejected robustness is a compatibility result, not a reason to bypass DRM.
3. **Account:** sign in using your own authorized Premium account or F1-issued subscription token in the UI. Password/token fields clear on success. A failed region lookup must not leave the app authenticated. Restart the service to confirm sessions are currently nonpersistent.
4. **Catalog:** compare a live session and a recent replay with your account's available content. Record API HTTP/error codes, not tokenized URLs or full responses. Full seasons/upcoming/onboard browsing is not implemented.
5. **Baseline playback:** leave experimental UHD profile off. Play an entitled DASH replay, then live content. Verify audible audio, pause/resume, seeking, focus and Back. Leave playback running for at least five minutes to test the service lifetime, then background the app; playback must stop and the activity should release.
6. **UHD experiment:** enable the opt-in Android TV profile only with your authorized subscription. A returned streamType mentioning UHD is not success. Inspect the MPD locally for actual Representation dimensions/codecs/frameRate, HLG transfer metadata, tile/SRD dependencies and DRM signaling. Never publish the signed MPD URL. Stop if it requires ClearVR composition unsupported by the selected player.
7. **License:** verify the browser CDM receives a successful license through the relay. Record only HTTP status and Shaka error category/code. Do not save or share license bodies or challenges. Cross-origin licenses/CDN redirects intentionally fail closed.
8. **Resolution and cadence:** require video.videoWidth === 3840 and video.videoHeight === 2160 **during moving playback**, plus increasing decoded-frame counters. Manifest dimensions alone are insufficient. Record manifest frame rate separately from an independently measured decoded cadence; dropped frames and switching can invalidate a nominal 50/60 fps claim. Repeat for at least ten minutes and across a quality switch.
9. **HDR/color:** require the TV's output/HDR indication and decoder/output color-space evidence (HLG or PQ) where the firmware exposes it. Manifest HDR metadata is not output proof. Compare expected colors/brightness; do not silently render HLG as SDR or label it correct because the picture is visible.
10. **Hardware/security:** collect the firmware's available media-pipeline/decoder evidence and CDM configuration. EME acceptance, video size and low CPU do not certify secure hardware decode. No public generic shell command is assumed to expose this on every LG firmware.
11. **Controls and failures:** test audio/subtitle cycling, quality changes, Back, Magic Remote pointer and D-pad, network interruption, expired session, unavailable content, license denial, and sign-out during playback. Confirm cleanup stops the relay activity and old relay URLs are rejected.

## Acceptance record

For each replay/live sample record: timestamp, content ID (not signed URL), entitlement result, API version/platform, MPD representation structure, declared codec/resolution/frameRate/transfer, actual video-element dimensions, decoded/dropped-frame progression, license status, hardware-pipeline evidence, audio result and TV HDR indication. Mark each as **observed**, **declared**, or **unknown**.

Do not call this project complete until the full user journey is observed on OLED65G69LS, including features currently listed as missing in COMPATIBILITY.md. Root access cannot substitute for a supported CDM, license policy or secure decoder.
