<div align="center">

<img src="docs/logo.svg" alt="Conso logo" width="96">

# Conso

**The usage panel for Claude Code.**<br>
Rate limits, context, costs and live agents, right next to your conversation.

[![CI](https://github.com/PoPs9444/conso-bar/actions/workflows/ci.yml/badge.svg)](https://github.com/PoPs9444/conso-bar/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/release/PoPs9444/conso-bar?label=version&color=4ade80)](https://github.com/PoPs9444/conso-bar/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-60a5fa)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757)](#installation)
[![Languages](https://img.shields.io/badge/languages-6-a78bfa)](#languages)

[Installation](#installation) · [Features](#features) · [FAQ](#faq) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

<br>

<img src="docs/panel.svg" alt="The Conso panel: 5-hour and weekly limits, context, cost history and running agents" width="372">

</div>

<br>

## Why Conso

Claude Code's limits usually show up when you hit them. Conso keeps them in sight: how much of your 5-hour and weekly allowance you have used, when you will run out at your current pace, how full the context is, and what every agent is doing and costing. One glance, no command to type.

## Features

| Feature | What it does |
| --- | --- |
| **Limits at a glance** | Your 5-hour and weekly usage, the time until each resets, and a forecast at your average pace. |
| **Context and Compact** | How full the context window is, and a **Compact** button that runs `/compact` for you. |
| **Cost history** | Today's cost and the last 7 days, across all your sessions. |
| **Live agents** | Model, effort, duration, current tool, tokens and estimated cost for every agent. **Stop** ends one cleanly. |
| **Your language** | English, French, Spanish, German, Italian or Portuguese, picked from Claude Code's own settings. |
| **One-click updates** | A banner when a new version is out. **Update** applies it with no restart. |
| **Private and light** | Nothing leaves your machine, and the panel repaints only what changed. |

## Installation

| Requirement | Details |
| --- | --- |
| Claude Code | A version that supports mods |
| Plan | Pro or Max for the 5-hour and weekly limits. Without one, the panel shows the session cost instead. |

From a terminal, add this repository as a plugin source:

```bash
claude plugin marketplace add PoPs9444/conso-bar
```

Then install Conso for all your conversations:

```bash
claude plugin install conso-bar@conso-bar --scope user
```

On recent versions of Claude Code, a single command inside a session does both: `/plugin install conso-bar --marketplace PoPs9444/conso-bar`, then answer `y` and pick the **user** scope.

Restart Claude Code. The **Conso** panel opens on the right at the start of every conversation.

## Usage

### The panel

| Card | What it shows |
| --- | --- |
| **5-hour limit** | Percentage used on a green-to-red gauge, time until the reset, and a forecast. |
| **Weekly limit** | The same for the week, plus the cost of the current session. |
| **Context** | Tokens used out of the window on a green-to-red gradient bar, and the **Compact** button. |
| **History** | Today's cost and a bar for each of the last 7 days, from green for a light day to red for the heaviest. |
| **Agents** | Every agent of the session, live. Running ones first. |

Color is kept for the numbers that matter: percentages turn from green to red as they approach 100%, and each model family has its own color (Fable red, Opus violet, Sonnet blue, Haiku teal).

In the terminal, Conso shows a compact bar above the prompt with the same figures.

### Actions

- **`/conso`** reopens the panel if you closed it.
- **Compact** runs `/compact` in the conversation, exactly as if you typed it. If Claude is busy, it runs as soon as the reply ends.
- **Stop**, next to a running agent, ends it cleanly: it can no longer start tools and hands back at its next step. A command already running finishes first, so nothing is left half done.
- **Clear** removes finished agents to free up space.

### Customize the layout

Click **Customize** at the bottom of the panel: each card shows **↑** and **↓** to move it. Click **Done** at the top when you are finished. Your order is remembered in every conversation.

## Languages

Conso follows Claude Code, with nothing to set:

1. your Claude Code `language` setting, if you set one;
2. otherwise, the language of the Claude app (Settings › Language);
3. otherwise, or for a language Conso does not speak yet, English.

| English | French | Spanish | German | Italian | Portuguese |
| :---: | :---: | :---: | :---: | :---: | :---: |
| ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Missing yours? [Adding a language](CONTRIBUTING.md#adding-a-language) takes one file.

## Updates

<img src="docs/update.svg" alt="The &quot;New version&quot; banner with its Update button" width="372">

A few seconds after a session starts, then every 6 hours, Conso checks this repository for a newer version. When there is one, a banner appears at the top of the panel, and **Update** installs it with Claude Code's own commands, then reloads the plugins: the new version is live right away.

The bottom of the panel shows your version with a status dot (green: up to date, blue: new version, red: the check failed) and a permanent **Check for updates** button.

To update by hand:

```bash
claude plugin marketplace update conso-bar
```

```bash
claude plugin update conso-bar@conso-bar
```

## How the numbers are computed

- **Limits** come from Claude Code, which receives them with every model reply, rounded to whole percentages. A new conversation shows the last known reading right away, and every session reads it again each minute.
- **Forecast** uses your average pace since the window started, nights and breaks included, so a burst of activity does not make it run away. It appears after 30 minutes for the 5-hour limit and after 24 hours for the weekly one.
- **Session cost and history** use the total Claude Code computes at public API prices, the same figure as `/cost`. On a subscription this is not what you pay: it is what the same usage would cost pay-as-you-go.
- **Agent cost** is an estimate from each agent's tokens and the models' public prices, listed in [`hooks/pricing.ts`](hooks/pricing.ts).

## Privacy

Conso sends nothing anywhere: everything is computed and stored on your machine. Its only network request reads the version number published in this repository, to offer updates.

To pick its language, it reads Claude Code's `language` setting and, in the desktop app, the single `locale` key of the Claude app's settings file, extracted with the system's own `plutil` (macOS) or PowerShell (Windows), so nothing else in that file ever reaches Conso.

## FAQ

<details>
<summary><b>Why do the limits have no decimals?</b></summary>
<br>
Claude Code reports them rounded to whole percentages. Showing a decimal would mean making it up.
</details>

<details>
<summary><b>The percentage does not move when I am not typing.</b></summary>
<br>
Limits are only known when the model replies. Without a message, no session receives a new reading.
</details>

<details>
<summary><b>Does Conso slow Claude Code down?</b></summary>
<br>
No. The conversation's replies never pass through Conso: it only follows agents' steps. It writes only when a figure changes, and when nothing moved it hands the app the very same drawing, so nothing is repainted.
</details>

<details>
<summary><b>The panel does not appear.</b></summary>
<br>
Check that the plugin is enabled with <code>claude plugin list</code>, restart Claude Code, then type <code>/conso</code>.
</details>

<details>
<summary><b>The panel is in the wrong language.</b></summary>
<br>
Conso uses your Claude Code <code>language</code> setting first. Set it to the language you want, or remove it to follow the Claude app's language.
</details>

## Uninstall

```bash
claude plugin uninstall conso-bar@conso-bar
```

## Contributing

Bug reports, ideas, translations and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the setup, the design rules and how to add a language. In short:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

If Conso saves you from a surprise rate limit, a ⭐ helps others find it.

## License

[MIT](LICENSE). Conso is an independent project, not affiliated with or endorsed by Anthropic.
