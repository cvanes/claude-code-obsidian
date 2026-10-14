# claude-code-obsidian

A Claude Code mod that puts your Obsidian vault in a side pane, so you can share notes with Claude as context in a couple of keystrokes.

Not affiliated with or endorsed by Obsidian.

## Features

- `/obsidian` opens the vault browser in a side pane
- View notes as rendered Markdown, code and text files with highlighting, and PNG images (in terminals that support the kitty graphics protocol)
- **Insert** (`i`) puts an `@` reference to the file or folder into your prompt at the cursor – paths with spaces are quoted as `@"…"`
- **Copy** (`c`) copies the path, quoted when it has spaces
- **§ Sections** (`h`) lists a note's headings – pick one to insert that section as a quote
- Click `[[wikilinks]]` in a note to open the linked note
- Search the whole vault by name
- **Star** (`s`) notes – starred and recently viewed notes show at the top and are remembered across sessions

The vault is found automatically from Obsidian's own config (the vault Obsidian has open). Set **Vault path** in `/config` to use another.

## Install

```sh
claude plugin marketplace add cvanes/claude-code-obsidian
claude plugin install obsidian@claude-code-obsidian
```

Update later with `claude plugin marketplace update claude-code-obsidian`.

## Developing

Load your working copy in every session by adding it to `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-code-obsidian" } }
```

Edits reload live. Check changes with:

```sh
claude plugin validate .
claude plugin test .
```

## Layout

```
.claude-plugin/plugin.json        manifest and options
.claude-plugin/marketplace.json   lets the repo be added as a marketplace
hooks/register.tsx                hooks and pane rendering
hooks/paths.ts, hooks/markdown.ts pure helpers
types/index.d.ts                  state contract
tests/                            claude plugin test suites
```
