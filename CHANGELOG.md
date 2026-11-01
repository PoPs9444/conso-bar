# Changelog

Every notable change to Conso. Versions follow [semantic versioning](https://semver.org).

## [0.22.0] - 2026-11-01

### Added
- **Your language, automatically.** Conso follows Claude Code: English by default; French, Spanish, German, Italian or Portuguese when your Claude Code `language` setting, or the Claude app, is set to one of them.
- A status dot next to the version at the bottom of the panel: green when up to date, blue when a new version is out, red when the check failed.

### Changed
- **Lighter.** The conversation's replies no longer pass through Conso, figures are written only when they change, and drawings that did not change stay identical, so the app repaints nothing.
- The footer is centered: its two buttons, then the version line.

### Fixed
- **Compact** answers at once instead of running past the time a button press may take, frees itself after any compaction, and shows the new context size right away.

## [0.21.2] - 2026-11-01

### Fixed
- **Compact** runs `/compact` in the conversation, exactly as if you typed it. If Claude is busy, it runs as soon as the current reply ends.

## [0.21.1] - 2026-11-01

### Fixed
- Nothing overlaps on a narrow panel: text that does not fit in a card fades out at the edge, and the footer puts its version on a line of its own.

## [0.21.0] - 2026-11-01

### Added
- **No restart needed.** After **Update**, Conso reloads the plugins and the new version is live right away.

## [0.20.0] - 2026-11-01

### Added
- A permanent **Check for updates** button at the bottom of the panel, which says right away whether you are up to date, or why the check failed.

### Fixed
- The automatic update check at startup could be cut off before it finished, so the banner never showed. It now runs a few seconds after the session starts.

## [0.19.1] - 2026-11-01

### Changed
- While you customize the layout, **Done** sits at the top of the panel.

## [0.19.0] - 2026-11-01

### Added
- **Customize the layout**: reorder the cards with ↑ and ↓. The order is remembered in every conversation.
- MIT license and complete plugin metadata.

### Changed
- Long agent titles fade out before the duration instead of overlapping it.
- An agent's estimated cost comes right after its current tool, so it stays visible on narrow panels.

## [0.18.0] - 2026-11-01

### Added
- First public version: the 5-hour and weekly limits with a forecast, the context with **Compact**, the cost history, live agents with **Stop** and **Clear**, the terminal bar, and the update banner.

[0.22.0]: https://github.com/PoPs9444/conso-bar/compare/v0.21.2...v0.22.0
[0.21.2]: https://github.com/PoPs9444/conso-bar/compare/v0.21.1...v0.21.2
[0.21.1]: https://github.com/PoPs9444/conso-bar/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/PoPs9444/conso-bar/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/PoPs9444/conso-bar/compare/v0.19.1...v0.20.0
[0.19.1]: https://github.com/PoPs9444/conso-bar/compare/v0.19.0...v0.19.1
[0.19.0]: https://github.com/PoPs9444/conso-bar/compare/aa4a24b...v0.19.0
[0.18.0]: https://github.com/PoPs9444/conso-bar/commit/aa4a24b
