<div align="center">

<img src="docs/logo.svg" alt="Conso logo" width="96">

# Conso

**The usage panel for Claude Code.**<br>
Rate limits, context, costs, live agents and your machine's load, right next to your conversation.

[![CI](https://github.com/PoPs9444/conso-bar/actions/workflows/ci.yml/badge.svg)](https://github.com/PoPs9444/conso-bar/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/release/PoPs9444/conso-bar?label=version&color=4ade80)](https://github.com/PoPs9444/conso-bar/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-60a5fa)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-d97757)](#installation)
[![Languages](https://img.shields.io/badge/languages-6-a78bfa)](#languages)

[Installation](#installation) · [Features](#features) · [FAQ](#faq) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

<br>

<img src="docs/panel.svg" alt="The Conso panel: system load by app, 5-hour and weekly limits, context, cost history and running agents" width="372">

</div>

<br>

## Why Conso

Claude Code's limits usually show up when you hit them. Conso keeps them in sight: how much of your 5-hour and weekly allowance you have used, when you will run out at your current pace, how full the context is, and what every agent is doing and costing. One glance, no command to type.

## A closer look

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <img src="docs/shot-system.svg" alt="The System card on an M4 Max: CPU, GPU and memory rings cut by app, and the apps ranked by GPU" width="372"><br>
      <sub><b>Your machine, app by app.</b> Click CPU, GPU or RAM to rank the apps by it.</sub>
    </td>
    <td align="center" valign="top" width="50%">
      <img src="docs/shot-limits.svg" alt="The Limits, Context and History cards" width="372"><br>
      <sub><b>Limits, context and cost.</b> Both limits with their forecast, the context bar and the week's spend.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <img src="docs/shot-agents.svg" alt="The Agents card with two running agents and a finished one" width="372"><br>
      <sub><b>Live agents.</b> Model, effort, current tool, tokens and cost, with Stop at hand.</sub>
    </td>
    <td align="center" valign="top">
      <img src="docs/shot-customize.svg" alt="Customize mode: arrows to move each card, Hide and Show" width="372"><br>
      <sub><b>Make it yours.</b> Move the cards, hide the ones you do not need.</sub>
    </td>
  </tr>
</table>

## Features

| Feature | What it does |
| --- | --- |
| **Limits at a glance** | Your 5-hour and weekly usage, the time until each resets, and a forecast at your average pace. |
| **Context and Compact** | How full the context window is, and a **Compact** button that runs `/compact` for you. |
| **Your machine** | CPU, GPU and memory, each cut into colored quarters for the apps using the most, sortable by any of the three, refreshed every few seconds. |
| **Cost history** | Today's cost and the last 7 days, across all your sessions. |
| **Live agents** | Model, effort, duration, current tool, tokens and estimated cost for every agent. **Stop** ends one cleanly. |
| **Your language** | English, French, Spanish, German, Italian or Portuguese, picked from Claude Code's own settings. |
| **One-click updates** | A line when a new version is out: click it and it installs in the background, without touching your conversation. |
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
| **System** | Three rings for CPU, GPU and memory in use, each cut into a colored quarter per app, and a table of the four apps using the most with their share of each. Click its **CPU**, **GPU** or **RAM** header to rank them by that column. |
| **Limits** | Your 5-hour and weekly usage in one card: a green-to-red ring for each, the time until it resets, a forecast, and the session cost. |
| **Context** | Percentage and tokens used out of the window, a green-to-red gradient bar, and the **Compact** button. |
| **History** | Today's cost, the last 7 days' total, and a small bar per day, from green for a light day to red for the heaviest. |
| **Agents** | Every agent of the session, live. Running ones first. |

Color is kept for the numbers that matter: percentages turn from green to red as they approach 100%, each model family has its own color (Fable red, Opus violet, Sonnet blue, Haiku teal), and each app in the System card keeps its color while it stays among the top four.

In the terminal, Conso shows a compact bar above the prompt with the same figures.

### Actions

- **`/conso`** reopens the panel if you closed it.
- **Compact** runs `/compact` in the conversation, exactly as if you typed it. If Claude is busy, it runs as soon as the reply ends.
- **Stop**, next to a running agent, ends it cleanly: it can no longer start tools and hands back at its next step. A command already running finishes first, so nothing is left half done.
- **Clear** removes finished agents to free up space.

### Customize the layout

Click **Customize** at the bottom of the panel: each card shows **↑** and **↓** to move it, and **Hide** to take it off the panel. A hidden card keeps its place and shows **Show** to bring it back. Click **Done** at the top when you are finished. Your layout is remembered in every conversation.

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

<img src="docs/update.svg" alt="The &quot;New version · Update&quot; line: click it to update" width="372">

A few seconds after a session starts, then every 6 hours, Conso checks this repository for a newer version. When there is one, a line appears at the top of the panel: **New version v… · Update**. Click it and Conso installs the new version in the background with Claude Code's own commands, a small wheel turning meanwhile. It finds Claude Code's command line by itself, the copy inside the desktop app included, so no `claude` command is needed in your terminal. Nothing is posted in your conversation and nothing reloads under it: the new version takes effect in your next conversation.

The bottom of the panel shows your version with a status dot (green: up to date or installed, blue: new version, red: the check failed) and a permanent **Check for updates** button; while it checks, a small wheel turns.

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

For the **System** card, it runs one short command every 5 seconds in the desktop app, using only what the system ships with: `iostat`, `ioreg`, `vm_stat`, `sysctl` and `ps` on macOS, `/proc` and `ps` (and `nvidia-smi` when present) on Linux, PowerShell every 10 seconds on Windows. The names of the apps it lists never leave the panel.

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
No. The conversation's replies never pass through Conso: it only follows agents' steps. It writes only when a figure changes, and when nothing moved it hands the app the very same drawing, so nothing is repainted. The System card's reading is one short command every 5 seconds, a fraction of a percent of one core, and none at all if you hide the card.
</details>

<details>
<summary><b>Why is there no GPU figure?</b></summary>
<br>
On macOS, Conso measures the GPU over the seconds between two readings, from the time each app spent on it (Apple silicon), so a game drawing in bursts never reads 0% by chance. On Linux, it needs an NVIDIA card with <code>nvidia-smi</code>. On Windows, it reads the 3D engines' load, app by app, as Task Manager does. Where none of these is available, the gauge shows n/a.
</details>

<details>
<summary><b>Which apps does the System card list?</b></summary>
<br>
The four using the most CPU, GPU and memory together, the rest grouped as Other. Other always comes last: it is everything else on the machine, so it can weigh more than the apps above it. Click the table's **CPU**, **GPU** or **RAM** header to list the four using the most of that one instead; click it again to go back. An app's helper processes count as the app, and the system's own processes as macOS. On macOS and Windows, every column is filled. On Linux, the system does not give a reliable load per app, so apps are ranked and shown by memory.
</details>

<details>
<summary><b>The panel does not appear.</b></summary>
<br>
Check that the plugin is enabled with <code>claude plugin list</code>, restart Claude Code, then type <code>/conso</code>.
</details>

<details>
<summary><b>The update does not install.</b></summary>
<br>
Since 0.28.0, Conso finds Claude Code's command line by itself. An older version needs a <code>claude</code> command in your terminal: without one, update it once by hand, and every later update is one click. In a terminal, run the two commands of <a href="#updates">Updates</a>. With the desktop app only, type these in a conversation, one at a time: <code>/plugin marketplace update conso-bar</code>, then <code>/plugin uninstall conso-bar@conso-bar</code>, then <code>/plugin install conso-bar@conso-bar</code>, and pick the <b>user</b> scope.
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
