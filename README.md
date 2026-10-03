# claude-mods

A collection of Claude Code mods – plugins built from function hooks that add panes, bands, status line entries, toasts, slash commands and tool-call hooks to Claude Code.

## Mods

- **obsidian** - `/obsidian` opens a side pane to browse your Obsidian vault, read notes and copy their paths.
- **gh-workflows** - `/gh-workflows` opens a side pane of GitHub Actions runs for the current repo and branch, refreshed every 10 seconds while it is open.

## Layout

Each mod lives in its own folder:

```
<mod-name>/
  .claude-plugin/plugin.json   # name, version, description
  hooks/hooks.json             # { "modules": ["./register.tsx"] }
  hooks/register.tsx           # the hooks module
```

## Running a mod locally

```sh
claude --plugin-dir ./<mod-name>
```

## Checking a mod

```sh
claude plugin validate ./<mod-name>
claude plugin test ./<mod-name>
```
