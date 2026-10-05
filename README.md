# Claude Code mod examples

Three working mods for the Claude Code mod system. Each one shows one layer of it.

The long write-up is here: [What Claude Code mods can and cannot do](https://gist.github.com/gfsaaser24/069662e26e9cacf600a84521fed30886).

| Mod | Layer | What it shows |
| --- | --- | --- |
| [`pulse`](pulse) | Technical | A Node sidecar next to a sealed mod. The mod talks JSON to it over `localhost`. |
| [`tap`](tap) | Translation | Hooks on the chain between you and the model. It records what crosses, and it can hide keys. |
| [`board`](board) | Front end | A Notion kanban. SVG draws the cards. Real buttons and links sit on top. |

## Pulse

![Pulse pane](images/pulse.png)

The mod itself can't read the CPU or run git. It lives in a sealed worker with no Node. So it starts a small Node server with `$.process.spawn`, then asks it for JSON every 3 seconds with `$.http.fetch`. The chart and the memory bar are SVG strings.

Read [`pulse/hooks/register.tsx`](pulse/hooks/register.tsx) and [`pulse/sidecar/server.mjs`](pulse/sidecar/server.mjs).

## Tap

![Tap pane](images/tap.png)

Tap hooks `tool.call`, `prompt.submit`, `session.append` and `turn.complete`. Every hook calls `next(e)`, so nothing changes for the model unless you turn the secret guard on. With the guard on, key-shaped strings in a tool result are swapped for a mask before the model reads them.

Read [`tap/hooks/register.tsx`](tap/hooks/register.tsx).

## Board

![Board pane](images/board.png)

Board reads a Notion database through `$.mcp.call` and draws one SVG per card. A click inside an SVG never reaches a mod, so the arrows are real `Button`s laid over the card with `position="absolute"`, and each logo has a `Link` laid over it. The arrows write the new status back to Notion.

Board needs 2 values from you, at the top of [`board/hooks/register.tsx`](board/hooks/register.tsx):

- `NOTION`: the id of your Notion connector.
- `SOURCE`: the `collection://` id of your database.

The database needs these columns: `Name`, `Workstream` (status), `Priority`, `Owner`, `PR`, `Job ID`. Change `FLOW` to match your own status names. With no ids set, the pane shows a "Load sample cards" button, and sample cards never write to Notion.

## Run one

```bash
claude plugin validate ./pulse
```

```bash
claude --plugin-dir ./pulse
```

Then type `/pulse`, `/tap` or `/board`.

## Test one

```bash
claude plugin test ./board
```

## Before you run these

A mod runs as you. It can start processes, call the network, and call your connectors with no prompt. Read the hooks file before you run it. That goes for these 3 as well.

Tested on Claude Code 2.1.286 and 2.1.289, Windows. The mod system is new and it will change.
