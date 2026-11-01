# Security policy

## Supported versions

Only the latest release gets fixes. Conso updates itself in one click from its panel, so staying current is easy.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Anything older | No |

## Reporting a vulnerability

Please **do not** open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/PoPs9444/conso-bar/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get an answer within a few days, and credit in the release notes once a fix is out, if you want it.

## What Conso touches

Conso runs inside Claude Code and sends nothing anywhere. It makes a single network request, to read the latest version number from this repository. It reads Claude Code's `language` setting and, in the desktop app, only the `locale` key of the Claude app's settings file. Updates go through Claude Code's own `claude plugin` commands.
