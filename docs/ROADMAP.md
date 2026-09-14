# MuseDesk roadmap (backlog)

Prioritized 2026-09-14 from a competitive sweep (Claude Code, Codex CLI,
OpenClaw, Aider, Cursor/Windsurf, agent dashboards: Cogpit, maestro,
vibe-dashboard, agentglass). Shipped first: live todo panel, diff viewer,
token counter (see PROGRESS.md). Items below are roughly ordered.

## Next up

4. **Slash commands** (`/review`, `/compact`, `/rename`, `/context`) —
   Codex/Claude standard. `/`-menu in the composer; `/review` runs a
   focused working-tree review turn. Medium.
5. **OS notifications** — macOS notification on turn end / approval needed.
   Electron Notification API. Small.
6. **Server-side session titles** — adopt the idle `session/nameChanged`
   notification instead of first-message crops. Small.
7. **Checkpoints / rewind** — Claude `/rewind`, Aider undo. "Back to before
   this turn" via MSP fork + git snapshots. Large; git writes need an
   explicit approval flow first.
8. **Skills browser** — list/enable/disable installed SKILL.md packs
   (Claude/OpenClaw/Codex all have this; muse ships `skills/`). Medium.
9. **Plan mode** — "write the plan, don't code until approved", reusing the
   approval dialog for plan sign-off (Claude plan mode). Medium.
10. **Subagent visibility** — `reminderChild` is hidden today; show a
    "N subagents running" badge + drill-down instead (Cogpit model). Small.
11. **Session fork** — "branch from here" for safe experiments (Codex
    `fork`); MSP already carries fork provenance. Medium.
12. **Transcript export/share** — Markdown/HTML export, one-click redacted
    share (SpecStory model). Small-medium.
13. **Prompt snippet library** — `/`-invoked reusable prompts (personal
    rules, review checklists). Small.
14. **File tree + read-only preview** — workspace files in-app, agent-touched
    files highlighted. Medium.

## Later / product maturity

15. **Parallel-session mission control** — all running sessions on one
    screen (maestro/Cogpit). Needed when session count outgrows the sidebar.
16. **Scheduled routines** — "run tests every morning" (Claude `/schedule`,
    OpenClaw cron). Electron scheduler + headless turns. Large.
17. **Embedded terminal** — shell next to chat (mastra model). Medium.
18. **Signed build + auto-update + Win/Linux packages** — beta-exit
    requirements (see PROGRESS "Continuing").
19. **Command palette (Cmd+K) + shortcuts** — switch session/model, resync,
    everything keyboard-driven. Medium.
20. **Voice input** — Aider/damocles have it. Fun, low priority.

## Blocked on the CLI

- **Account allowance bars (5h/weekly)** — exposed nowhere: not in MSP
  (stable+experimental checked), not in any CLI command, not on disk. The
  TUI renders it from in-memory provider stream events. Revisit if MSP
  gains an `account/usage` method (the fingerprint gate will catch it).
