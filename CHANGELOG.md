# Changelog

Versions use `MAJOR.MINOR.PATCH`. `app/appinfo.json` is the release version source;
`service/package.json` must match it. A new version requires a matching entry here.
Versions below 1.0.0 are experimental and do not imply verified TV playback.

## [0.2.3] - 2026-11-09

### Fixed

- Replace the legacy password endpoint with the current OAuth authorization-code/PKCE flow documented by FastF1; isolate cookies by origin and validate state before exchanging a code.
- Import raw subscription JWTs, supported login JSON/cookies, or OAuth access tokens containing a subscriptionToken. Reject browser challenge tokens and malformed input with actionable messages.
- Show received token-input character counts and support consecutive chunks for TV paste limits; reject oversized pastes without silently shortening them.
- Clear passwords after failed as well as successful attempts, and prevent duplicate sign-in requests.

### Validation

- Synthetic authentication, credential-origin, OAuth state/PKCE, service, and UI regression tests pass locally. F1 remains responsible for token signature and expiry validation.
- Real-account password sign-in, TV input behavior, and playback remain unverified. Browser verification/MFA must be completed through F1's official browser sign-in; no bypass is implemented.

## [0.2.2] - 2026-11-08

### Added

- Glasshouse custom catalog (`repo.json`) using the published release asset's actual size and SHA-256.
- Catalog generator, regression tests, and installation instructions.
- Release automation refreshes the catalog from the published IPK, including retries for existing releases, without overwriting assets.
- Publishing rules require Glasshouse support for future webOS IPK work.

### Changed

- Update the CI Node.js runtime from 24 to the latest stable major, 26; verify official versions for all CI runtimes and tools.

### Fixed

- Publish 0.2.2 at a new IPK URL to avoid stale catalog hashes associated with the previously replaced 0.2.1 asset. Published IPKs must not be replaced under the same version/URL.
- Document Glasshouse's catalog-cache refresh procedure for SHA-256 mismatch errors. Keep checksum validation enabled.

Playback code is unchanged; installation and playback on the target TV remain unverified.

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
