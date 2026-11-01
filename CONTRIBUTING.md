# Contributing to Conso

Thanks for helping make Conso better. Bug reports, ideas, translations and pull requests are all welcome.

## Before you start

- **A bug?** Open an issue with the [bug report form](https://github.com/PoPs9444/conso-bar/issues/new?template=bug_report.yml). A screenshot of the panel and your Conso and Claude Code versions make it much faster to fix.
- **An idea?** Open a [feature request](https://github.com/PoPs9444/conso-bar/issues/new?template=feature_request.yml) first, so we can agree on the shape before you write code.
- **A security issue?** Do not open a public issue: see [SECURITY.md](SECURITY.md).

## Development setup

You need a version of Claude Code that supports mods.

```bash
git clone https://github.com/PoPs9444/conso-bar.git
```

```bash
cd conso-bar
```

Run Claude Code with the plugin loaded from your clone. The session watches the folder and reloads the plugin as you edit:

```bash
claude --plugin-dir .
```

In the terminal you get the bar above the prompt. To see the panel in the desktop app, add the folder's absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, then start a new conversation.

## Checks

Both must pass before a pull request is merged.

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

## Project layout

| Path | What it holds |
| --- | --- |
| `hooks/register.tsx` | The events Conso listens to, the panel layout and its buttons |
| `hooks/dashboard.ts` | The limit, context, history and update cards, drawn in SVG |
| `hooks/agents.ts` | The live agents card |
| `hooks/i18n.ts` | Every text the panel shows, in every language |
| `hooks/pricing.ts` | Public model prices, for the agents' estimated cost |
| `types/index.d.ts` | The values Conso keeps, and their types |
| `tests/band.test.tsx` | The tests |
| `docs/` | The README images, drawn with Conso's own code |

## Design rules

The panel is tuned to the pixel. A few rules keep it that way:

- **Every drawing has a fixed height.** The panel redraws every second while an agent runs; a drawing without a height collapses for an instant and throws the scroll back to the top.
- **Every `Svg` has a non-empty `alt`.** The desktop app does not show a drawing without one.
- **Text never overlaps.** Anything that may not fit goes through `fadeRight`, which fades it out at the drawing's real edge.
- **Color is for the numbers that matter.** Percentages go from green to red as they near 100%, model names take their family's color, and everything else stays neutral.
- **Write only what changed.** Every write to Conso's state redraws the panel, so unchanged values are never written again.

## Adding a language

1. Add the language's code to `Lang` in `types/index.d.ts`.
2. In `hooks/i18n.ts`, add a `Strings` object with every text translated, add it to `STRINGS`, and list the language's names and code in `NAMES`.
3. Add a test in `tests/band.test.tsx` that sets Claude Code's `language` to it and checks a few texts.
4. Check that long words still fit: titles fade out before the time on the right, but buttons do not.

## Releasing

1. Bump `version` in `.claude-plugin/plugin.json` **and** the `VERSION` constant in `hooks/register.tsx`: they must match.
2. Add the version to [CHANGELOG.md](CHANGELOG.md).
3. Push to `main`, then create a GitHub release named `Conso vX.Y.Z` with the tag `vX.Y.Z`. Every installed copy shows the update banner within 6 hours.

## Code of conduct

Everyone taking part in this project is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
