# Changelog

Every notable change to Conso. Versions follow [semantic versioning](https://semver.org).

## [0.29.1] - 2026-11-07

### Fixed
- **The System table shows every column again.** Version 0.29.0 gave the figures' columns a minimum width counted in characters rather than pixels, which pushed the app names, GPU and RAM out of the panel. The columns now simply never shrink.

## [0.29.0] - 2026-11-07

### Added
- **The System table's figures in color.** Each app's CPU, GPU and memory is colored by its share of the machine, as the rings are: green when light, then yellow, orange and red as it nears the whole.

### Fixed
- **Each row of figures is level with its app again.** In a narrow panel, the CPU and GPU columns were squeezed and their figures drawn smaller, so they no longer faced the right app. The columns now keep their width, and the app names give way instead.

## [0.28.3] - 2026-11-02

### Fixed
- **The panel never stays blank.** If something goes wrong while the panel is drawn, it says what in one line instead of showing "Nothing to show yet", so the problem can be reported.

## [0.28.2] - 2026-11-02

### Fixed
- **The panel no longer stays empty in some conversations.** An agent the app reported without a name or a model (a workflow's agent, say) stopped the whole panel from drawing, leaving "Nothing to show yet". That agent now shows under its type, and a card that cannot be drawn is left out while the rest of the panel still shows.

## [0.28.1] - 2026-11-02

### Added
- **Your graphics card's name on Windows**, under the GPU ring, as macOS shows the chip's: *RTX 3080*, *RX 7900 XTX*, *Arc A770*. With several cards, the dedicated one is named, never a virtual display adapter. On Linux, the name is shortened the same way.

## [0.28.0] - 2026-11-02

### Fixed
- **Buttons no longer flicker every second while agents run.** The desktop app draws the whole panel again at each change, and a button under the pointer lost its highlight for an instant. An agent's time now counts on inside its own drawing, and its tools, steps and tokens catch up every 5 seconds, together with the System card. An agent that starts, ends or stops still shows at once.
- **Sorting the apps takes effect at once, on Windows too.** Picking CPU, GPU or RAM ranks the apps again from the last reading right away: the apps that use the most of that column come in without waiting for the next reading, which takes several seconds on Windows.
- **Updates no longer need a `claude` command.** Conso finds Claude Code's command line by itself: the copy inside the desktop app, the one on the PATH, or the usual install folder, on macOS, Linux and Windows. Someone with only the desktop app, or an old `claude` on the PATH, now updates in one click. If none is found, the panel says so.

## [0.27.0] - 2026-11-02

### Added
- **CPU and GPU by app on Windows.** The System table now fills every column on Windows too: each app's CPU over the last second, as Task Manager shows it, and its share of the 3D engines. Click CPU, GPU or RAM to rank the apps by it, as on macOS.

### Fixed
- **Buttons no longer blink under the pointer.** While an agent runs, the panel is drawn again every second, and each button used to be drawn anew with it, so its highlight flickered. A button now stays the same from one drawing to the next.
- **Clear, Stop and every other button answer every click.** A click that landed during a redraw could be lost, most often with several agents at work. It now always goes through.

## [0.26.3] - 2026-11-02

### Changed
- Maintenance release: no change in behavior. It brings the one-click update line of 0.26.2 into play for everyone already on 0.26.2.

## [0.26.2] - 2026-11-02

### Changed
- **Update in one click on the line itself.** A new version shows as one sentence in a blue-tinted card, *New version v… · Update*, and the whole sentence is the button, blue and underlined under the pointer. While it installs, a small wheel turns.

## [0.26.1] - 2026-11-02

### Changed
- **Sort from the table itself.** The CPU, GPU and RAM headers right above the apps are the buttons that rank them; the row beside the title is gone.

### Fixed
- **The GPU no longer drops to 0% at random.** It is now the average over the seconds between two readings, from each GPU client's own time, instead of the driver's instant figure, which reads 0% between two frames of an app drawing in bursts.
- **An app's GPU share no longer falls to 0%** when it closes one of its GPU clients: time is compared client by client.
- **The GPU column no longer disappears.** A reading too close to the last one, or the first one after a reload, keeps the last figures, and the second reading comes as soon as the GPU can be measured.

## [0.26.0] - 2026-11-02

### Added
- **Sort the apps.** CPU, GPU and RAM buttons next to the System title rank the apps by that column, its header marked; pick it again to rank them by all three. Each app keeps its color whatever its rank, and your choice is remembered.

### Changed
- **Updates leave your conversation alone.** **Update** installs the new version in the background and posts nothing in the conversation (no more `/reload-plugins`). It takes effect in your next conversation, and the other open ones show it as installed.
- **Check for updates** takes a moment to answer, with a small turning wheel, and nothing on the line moves.

## [0.25.0] - 2026-11-02

### Added
- **Hide the cards you do not need.** In Customize, every card has **Hide** next to its arrows. A hidden card keeps its place and shows **Show** to bring it back; your choice is remembered in every conversation. A hidden System card runs no command at all.

### Changed
- **Both limits in one card.** The 5-hour and weekly limits share a single compact card, each with its ring, time to reset and forecast, and the session cost on the title line.
- **A smaller History card.** Today and the last 7 days on one line, next to a small bar per day.

## [0.24.0] - 2026-11-02

### Added
- **Your machine, app by app.** Each System ring is cut into colored quarters for the four apps using the most, with the rest in gray, and a table under the rings gives each app's share of the CPU, the GPU and the memory. An app's helper processes count as the app, and each app keeps its color while it stays at the top. On macOS every column is filled; on Linux and Windows, apps are ranked by memory.

### Changed
- **System comes first.** The card opens the panel; an order you chose yourself stays as it is.
- **A smaller Context card.** The percentage and the tokens share one line above a thinner bar.

## [0.23.0] - 2026-11-02

### Added
- **System card**: three gauges for the CPU and GPU load and the memory in use, with the GB used out of the GB installed. Refreshed every 5 seconds (10 on Windows) from the system's own tools, and only written when a figure changes. Reorder it like any card; a saved order gets it right after Context.

## [0.22.1] - 2026-11-01

### Changed
- **History in color.** Each day's bar goes from green to red with what it cost next to the week's heaviest day, and today's amount takes its bar's color.
- **Context bar as a gradient.** The green-to-red scale spans the whole track: the bar is green on the left and its tip turns red as the context fills up.

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

[0.23.0]: https://github.com/PoPs9444/conso-bar/compare/v0.22.1...v0.23.0
[0.22.1]: https://github.com/PoPs9444/conso-bar/compare/v0.22.0...v0.22.1
[0.22.0]: https://github.com/PoPs9444/conso-bar/compare/v0.21.2...v0.22.0
[0.21.2]: https://github.com/PoPs9444/conso-bar/compare/v0.21.1...v0.21.2
[0.21.1]: https://github.com/PoPs9444/conso-bar/compare/v0.21.0...v0.21.1
[0.21.0]: https://github.com/PoPs9444/conso-bar/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/PoPs9444/conso-bar/compare/v0.19.1...v0.20.0
[0.19.1]: https://github.com/PoPs9444/conso-bar/compare/v0.19.0...v0.19.1
[0.19.0]: https://github.com/PoPs9444/conso-bar/compare/aa4a24b...v0.19.0
[0.18.0]: https://github.com/PoPs9444/conso-bar/commit/aa4a24b
