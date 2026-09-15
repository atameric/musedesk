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

15. ~~**Parallel-session mission control**~~ — shipped (Overview button).
16. **Scheduled routines** — "run tests every morning" (Claude `/schedule`,
    OpenClaw cron). Electron scheduler + headless turns. Large.
17. **Embedded terminal** — shell next to chat (mastra model). Medium, but
    needs a native module (`node-pty`) — poor value/effort. Parked.
18. **Signed build + auto-update + Win/Linux packages** — beta-exit
    requirements (see PROGRESS "Continuing"). Needs a paid Apple Developer
    account + release pipeline.
19. ~~**Command palette (Cmd+K)**~~ — shipped (sessions, models, effort,
    resync, restart, panel, view toggle).
20. **Voice input** — free via macOS system dictation (Fn Fn) in the
    composer; no dedicated engine planned (Electron has no built-in STT).

## Newly unblocked (CLI 1.3.0)

- **Account allowance bars (5h/weekly)** — UNBLOCKED: MSP 1.3.0 ships
  `usage/read` + `usage/changed` (`SubscriptionUsage`: window percent +
  reset + duration, weekly percent + reset, tier). Top candidate for the
  next release.
- **Skills browser** (item 8) got easier: `skill/list` + `skill/changed`
  now exist (`SkillCatalogEntry`, `bundled|user|project|plugin` sources).
