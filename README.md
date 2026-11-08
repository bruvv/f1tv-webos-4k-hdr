# F1 TV UHD Lab for LG webOS — 0.2.0

[![Build and release IPK](https://github.com/bruvv/f1tv-webos-4k-hdr/actions/workflows/build-release.yml/badge.svg)](https://github.com/bruvv/f1tv-webos-4k-hdr/actions/workflows/build-release.yml)

[Download IPK releases](https://github.com/bruvv/f1tv-webos-4k-hdr/releases) · [Changelog](CHANGELOG.md)

An independent, locally rendered TV interface with a packaged JavaScript service. **Not an iframe, F1 website redirect, or Electron port.** Uses authorized account API requests and the TV's EME/CDM through bundled Shaka Player; no decryption-key extraction or hardware DRM bypass.

## Status: experimental, NOT verified to play F1 TV

The source builds and local regression tests pass. Official LG CLI packaging also succeeds. **No target TV or authorized F1 account was connected during this run.** Installation, sign-in, real catalog responses, licenses, video/audio and 4K/HDR remain unverified.

Implemented: own UI, directional navigation, experimental password/subscription-token login, live/recent replay requests, DASH/Shaka and native HLS fallback, quality cycling, audio/subtitle language cycling, capability probes, playback diagnostics, localhost media/license relay and playback activity lease.

Missing: persistent sessions, automatic refresh, full season/Grand Prix/upcoming navigation, onboard discovery and verified end-to-end UHD. See [the compatibility/evidence report](docs/COMPATIBILITY.md) before interpreting any capability claim.

## Build and test (macOS or Linux)

Requirements: Python 3.10+ and Node 20+ for the development tools. No Python packages are needed. The TV provides webos-service; it is not a downloadable npm dependency.

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 build.py
# Deterministic package: dist/com.niels.f1tv4k_0.2.0_all.ipk

# Also package using LG's official tooling (downloads CLI into npm's cache):
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package app service -o dist/official
# dist/official/com.niels.f1tv4k_0.2.0_all.ipk
```

The Python build is tested for byte-identical repeat output in the same environment, archive validity and required payload files. Cross-version gzip implementations may produce different compressed bytes. Official CLI packaging reports warnings for missing requiredACG and possible target Node version differences; those are not hardware installation results. Do not install both variants as different apps: they share an application ID.

Shaka 4.16.0 is already bundled, not downloaded on the TV. Apache-2.0 license: `app/vendor/SHAKA-LICENSE`. Runtime upstream URL: https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.16.0/shaka-player.compiled.js ; SHA-256 `1856beb1db1172a35fe7819b8d789ef220e6ca687cbf0be29153737d2c633089`.

## GitHub Actions and versioning

Like [Home Assistant for LG webOS TV](https://github.com/bruvv/Home-Assistant-for-LG-webOS-TV), pushes to `main`, pull requests, and manual workflow runs test and build the IPK. Each successful build uploads an Actions artifact containing the **official LG CLI IPK**, SHA-256 checksums, and release notes. Builds use Node 24, Python 3.13, and LG CLI 3.2.6; third-party Actions are pinned to commit hashes.

Successful main-branch builds automatically create `vVERSION` and publish a GitHub **prerelease** if that version does not exist yet. Existing releases are not overwritten. Source archives are provided automatically by GitHub. Releases remain marked experimental while TV playback is unverified.

For a new release:

1. Update `version` in `app/appinfo.json` and `service/package.json` using `MAJOR.MINOR.PATCH`.
2. Add a dated entry at the top of [CHANGELOG.md](CHANGELOG.md), and update version-specific documentation/examples.
3. Run the tests and push/merge to `main`. CI rejects mismatched versions or a missing changelog entry, then builds and publishes the new version.

No manually created tag or release token secret is needed: the release job uses GitHub's built-in token with repository-content write access. Fork pull requests only build/test and cannot publish releases. Binary packages, local agent memory, credentials, and caches are excluded from Git.

## Install and debug

Download the `.ipk` and `SHA256SUMS` from a release, then verify and install with your configured device:

```sh
shasum -a 256 -c SHA256SUMS
ares-install -d myTV com.niels.f1tv4k_0.2.0_all.ipk
ares-launch -d myTV com.niels.f1tv4k
```

See [hardware test instructions](docs/HARDWARE-TEST.md) for exact device setup, installation, inspectors and evidence checklist. Start with the **official CLI package** for deployment validation. Installing an IPK is a device change; use your already-authorized developer/root connection. This project does not install or modify Homebrew Channel or the root environment.

## Security and limitations

- Passwords are not persisted. Tokens remain in service RAM only. Sign in again after service restart.
- Local HTTP binds only to 127.0.0.1 and requires an ephemeral playback/session secret. Logout and new playback invalidate prior relay URLs.
- Media URLs are exact-host HTTPS restricted. Unexpected cross-host CDN redirects are rejected rather than expanding access to shared CDN tenants.
- Account and license headers may go only to the selected F1 license origin. A cross-origin license redirect is rejected. No keys are exposed to the app.
- Activity Manager keeps the relay alive during playback, renewed by a 15-second foreground heartbeat. Stop/background releases the lease; heartbeat loss expires it after 60 seconds. The installed TV runtime must still validate this API behavior.
- Android TV device-profile requests are **off by default**. They are experimental, not proof that webOS is an authorized UHD client or supports ClearVR's pipeline.
- Diagnostics label resolution from the video element separately from manifest frame rate, codec, bitrate and HDR metadata. They do not claim hardware acceleration or HDR output based on a 4K interface or capability probe.
- Do not publish passwords, tokens, signed manifests, license challenges/responses or raw network captures. Use redacted error codes and capability reports.

## References

- [Android UHD patch](https://github.com/Alexvbp/f1tv-4k-patch): client-side Android/ClearVR/EGL capability and rendering changes, not portable webOS playback code.
- [F1OpenViewer](https://github.com/npanu420/F1OpenViewer), MIT: public API/authentication/playback/license reference. No source copied during this iteration.
- [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel): rooted deployment reference.
- [LG streaming and DRM](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm).
- [Shaka Player](https://github.com/shaka-project/shaka-player), Apache-2.0.
