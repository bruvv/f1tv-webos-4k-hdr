# Changelog

Versions use `MAJOR.MINOR.PATCH`. `app/appinfo.json` is the release version source;
`service/package.json` must match it. A new version requires a matching entry here.
Versions below 1.0.0 are experimental and do not imply verified TV playback.

## [0.2.1] - 2026-11-08

### Changed

- Use the public project identity `com.bruvv.f1tv` and service `com.bruvv.f1tv.service` throughout the app, packages, tests, and documentation.
- Use public-alias Git metadata and document publishing privacy rules.
- Use the latest released Action major tags and Python 3.15 in CI.

### Migration

- The changed app ID installs separately from earlier prototypes. Remove the old installation through the TV's app manager if it is present; sessions are not migrated.
- Playback capabilities are unchanged and remain unverified on the target TV.

## [0.2.0] - 2026-11-08

### Added

- Bundled Shaka Player 4.16.0 and its Apache-2.0 license for local player loading.
- Audio and subtitle language controls, MSE/HEVC/Widevine capability probes, and expanded playback diagnostics.
- Playback Activity Manager lease, heartbeat, cleanup, and expiry handling.
- Automated relay, authentication, capability, service-lifetime, packaging, and reproducibility checks.
- GitHub Actions builds on main pushes, pull requests, and manual runs; new versions on main publish an IPK release automatically.
- Installation, debugging, hardware-validation, and compatibility documentation.

### Fixed

- Restricted relay requests to approved HTTPS origins and prevented license credentials from crossing origins on redirects.
- Cleared partially established authentication after failed region lookup.
- Rotated relay session secrets on new playback and logout.
- Added DRM-token authorization and manifest response playToken cookie handling.
- Made Python package output reproducible within the same build environment.

### Changed

- Android TV UHD profile requests are opt-in rather than enabled by default.
- Diagnostics distinguish video-element dimensions and manifest metadata from unverified hardware decoding and HDR output.

### Known limitations

- Installation, F1 authentication, DRM licensing, playback, audio, 4K, and HDR/HLG have not been verified on the LG TV.
- Persistent sessions, automatic token refresh, complete season/Grand Prix/upcoming navigation, and onboard discovery are not implemented.

## [0.1.0] - Unreleased prototype

- Initial local TV interface, remote navigation, experimental F1 API client, live/recent replay catalog, Shaka playback, and localhost media/license relay.
- Experimental UHD device-profile requests and custom Python IPK packaging.
- No production or hardware playback verification.
