# MuseDesk — progress log

Living build notes for the MuseDesk desktop client.

## Status: v1 complete (P0–P4), all gates green

Gates: `npm run typecheck`, `npm run lint`, `npm test` (25 unit),
`npm run e2e` (13 pass + 1 environmental skip), renderer `vite build`,
`npm run package`, `npm run make` (unsigned `.dmg`).

- Live `muse serve` e2e skips in sandboxes without provider auth
  (diagnostic printed); the scripted fake-host suite covers the same paths.

## P0 — skeleton + handshake (done)

- Electron Forge (Vite + TS + React 19) scaffold; `muse` PATH discovery +
  `--version` check; `muse serve` spawn/close; MSP `initialize` handshake.
- `src/msp/`: vendored `msp.d.ts` (byte-identical to binary export),
  `CLI_VERSION.txt`, `FINGERPRINT.txt`, `pinned.ts`, `uuid.ts`,
  `discovery.ts`, `host.ts` (framing, timeouts, notifications, stderr tail).
- Status-only main/preload/renderer wiring + unit tests.

## P1 — chat core (done)

- `src/msp/transcript.ts`: pure view-event fold (deltas, revision rule,
  turn lifecycle, gaps) shared by renderer and tests.
- `src/msp/chat.ts`: `ChatManager` — typed `session/start`, `turn/start`,
  `turn/interrupt`, `view/page`, single-flight gap recovery via
  `view/subscribe`, notification fan-out.
- `src/shared/markdown.ts`: dependency-free Markdown subset → escaped HTML.
- UI: transcript view (user/agent/reasoning/tool/shell/generic),
  streaming cursor, turn status, composer with stop.
- Proof: scripted e2e (chat, failed turn with server error, gap→resubscribe
  exactly once) + unit suites for fold/markdown/manager.

## P2 — history + resume (done)

- Manager: `session/list`, `session/resume`, `session/read`.
- Sidebar: newest-first sessions, running dots, pending badges, new chat,
  refresh; titles from first user message with workspace fallback.
- App: per-session transcript stores (background sessions keep folding),
  resume-seed from `inline`/`snapshot` history, `none` notice.
- Proof: scripted list/resume/seed/read/unknown-session e2e.

## P3 — controls (done)

- Manager: `model/list`, `session/setModel`, `session/setApprovalMode`,
  `approval/decide` (+`listPending`), `userInput/answer`/`cancel`.
- UI: model / reasoning-effort / approval-mode controls; approval dialog
  (subject lines, staged steps, choices + scopes, feedback path);
  user-input dialog (single/multi/free-text + notes, bounds-checked).
- Live `session/modelChanged` / `session/approvalModeChanged` refresh the
  session list; cold resume reconciles `pendingRequests` via `listPending`.
- Proof: scripted approval request→decide→resolved incl. `-32053` stale-guard
  and `-32052` bad-choice rejection; userInput answer→settled incl. `-32057`
  invalid-answer rejection; resume→re-issue→pull flow.

## P4 — polish + package (done)

- Suggestion cards (fill composer, never auto-send), empty/loading states.
- `forge.config.ts` makers reduced to unsigned `.dmg` only
  (`@electron-forge/maker-dmg`); unused makers uninstalled.
- Original icon: generated `assets/icon-1024.png` (stdlib rasterizer) +
  hand-encoded `assets/icon.icns` (7 PNG elements, round-trip verified with
  `iconutil -c iconset`; system `iconutil -c icns` is broken in this env).
- `productName` → `Muse`; README with security + unsigned-launch notes.
- `npm run package` verified end to end (286 MB `.app`, custom icon
  embedded byte-identical, `app.asar` present).
- `npm run make` verified up to the sandbox wall: packaging succeeds, DMG
  creation needs `hdiutil` device access — run it once in a normal terminal
  to emit `out/make/Muse.dmg`. Pure-python `dmgbuild` was attempted as a
  workaround but also shells out to `hdiutil create`; no userspace path.
- Build env notes: `extract-zip@2` + Node 26 silently exits mid-extraction
  (proven in isolation); `scripts/forge-extract-shim.js` routes it through
  system `unzip`. System `iconutil -c icns` rejects even Apple's own
  iconsets here, so `assets/icon.icns` is hand-encoded (7 PNG elements,
  decode-verified).

## Fixes after v1

- GUI discovery: packaged apps don't inherit shell PATH, so `discoverMusePath`
  now falls back to well-known locations + login-shell resolution
  (`resolveViaLoginShell`); covered by `test/unit/discovery.test.ts`.
- Boot no longer stalls on a session held by another window: it tries the 5
  newest sessions in order (`sessionInUse`/stale skipped) and starts fresh
  when none opens; failed resumes don't leave empty stores behind.
- `src/shared/errors.ts` (`humanizeError`, unit-tested) unwraps the Electron
  IPC prefix and maps known MSP kinds (`sessionInUse`, `sessionNotFound`,
  `approvalRequirementStale`, …) to actionable sentences, including
  truncated payloads. Approval dialog gained a Refresh action.

## Image attachments (v1.1)

- `ChatManager.sendTurn` takes `attachments` and emits `image` turn parts
  (text+image or image-only); validated (count, mediaType, non-empty base64).
- Intake: `muse:image/pick` IPC (dialog + `src/msp/images.ts` magic-byte
  validation) plus renderer paste/drop via FileReader; shared caps in
  `src/shared/limits.ts` (5 files, 10 MB each).
- Transcript carries `commandId` so the renderer can pin optimistic shot
  thumbnails to its own user messages (protocol echoes metadata only).
- Proof: `test/unit/images.test.ts` (sniff + staging rejects), manager unit
  cases, scripted `image` fake-host flow (valid turn folds, malformed parts
  rejected `-32602`).

## Workspace folder + full access (v1.2)

- Working folder: `muse:workspace/pick` (directory dialog) +
  `muse:workspace/default` (home); sidebar footer starts new chats in the
  picked folder (persisted in localStorage); top bar shows the active
  session's folder. `workspaceRoot` is immutable per session (protocol has
  no setter), so changing folders always starts a new session.
- Full access: sandbox posture is host-wide and not negotiable over the
  wire, so the checkbox restarts `muse serve` with/without
  `--disable-sandbox` (`serveArgsFor`, unit-tested) and the renderer
  re-attaches sessions afterwards. Mode persists in
  `userData/muse-prefs.json` (`loadPrefs`/`savePrefs`, unit-tested);
  enabling shows a native confirm; running turns block the switch.
- App no longer unmounts on host restarts (`everReady` gating + inline
  reconnecting/error banners).
- v1.2.1: fixed black screen after "Starting MSP host" — the `!everReady`
  early return sat above a `React.useCallback` (`shotsFor`), so the first
  ready render changed the hook count and React tore down the whole tree.
  All hooks now live above the early return, and
  `eslint-plugin-react-hooks` (`rules-of-hooks`) is wired into the lint
  gate so this class of bug fails `npm run lint` instead of the UI.
- v1.2.1: DMG volume renamed to "Muse Installer" (was "Muse", same as the
  app — macOS showed the mounted-disk copy next to the installed copy and
  they were indistinguishable). Single-DMG-maker + title covered by
  `test/unit/packaging.test.ts`; stale `out/Muse-darwin-arm64` build copy
  removed (gitignored, regenerates on package).
- v1.2.1: "+ New chat" now asks for the working folder every time (the
  dialog opens at the last-used folder, so Enter reuses it); the footer's
  "+ New chat in X" starts immediately in X without asking. The dialog's
  `defaultPath` hint is sanitized at the IPC boundary (`dialogPathFor`,
  unit-tested); dialog/picker UI itself has no harness, verified by hand.
- Public beta prep: renamed Muse → MuseDesk (product, window, bridge,
  `musedesk:*` IPC via shared `channels.ts`, clientInfo, DMG title; CLI and
  protocol references untouched). MIT LICENSE, package.json 1.0.0-beta.1
  (no email), README unofficial banner + screenshots + BYO-membership note,
  `dist/` ignored, personal references scrubbed. Screenshots via
  `npm run screenshots` (headless Chrome + canned mock bridge, sample data).
  Resolved before first push: GitHub username (atameric) → appBundleId +
  clone URL + repository field; screenshots captured; DMG rebuilt; privacy
  audit clean (repo-local git identity set to the noreply address).
- Pre-push feedback: `reminderChild` stubs no longer render as chat rows.
  The kind is a child-session pointer without drill-down, so its generic
  stub ("reminderChild · completed") was pure noise between messages and
  answers — hiding it loses no content (the row carried only a label).
  `visibleTranscriptItems` + `CHAT_HIDDEN_KINDS` in transcript.ts, rendered
  by ChatView, covered by transcript.test.ts.

## Beta.2 re-verification (CLI 1.2.1)

- All gates green against `Muse Code 1.2.1 (1.2.1-R2847.1)`: typecheck,
  lint, 42 unit, 17 e2e (live lifecycle included, no skips).
- Lifecycle fix: 1.2.1 fans out `reminderChild` sub-sessions
  (skill/goal/verify-reminder) per turn and `turn/completed` waits for
  them (~16–34s on echo), so the e2e budget went 20s → 90s
  (`test/e2e/lifecycle.test.ts`). App behavior unchanged — the turn was
  always completing, the test just stopped waiting.
- Observed, no action: live host emits `session/started`/`session/closed`,
  which are outside the pinned `MspNotification` union; the client
  ignores unknown notifications and schema-drift stays green.

## Intel-deprecation warning follow-up

- Audited every shippable artifact for Intel slices: `/Applications`
  copies, `out/` build, both beta DMGs (mounted + scanned), and the real
  `muse` CLI payload — all `arm64`, no action needed on the bundle itself.
- Added a startup CLI arch probe (`src/msp/arch.ts`): resolves the launcher
  script to its `.muse-version` payload (sibling scan fallback), classifies
  via `lipo`/`file`, never throws. Surfaced as `HostStatus.cliArch`; the UI
  shows a warn banner with reinstall guidance when the CLI is Intel-only.
- `npm run check:arch` (`scripts/check-arch.sh`) fails future builds that
  sneak Intel slices into the `.app` or DMGs. Covered by 7 hermetic unit
  cases (`test/unit/arch.test.ts`); gates green (49 unit, typecheck, lint).

## Duplicate-in-Spotlight fix

- Symptom: Spotlight showed two MuseDesk icons. Cause: `npm run package`
  leaves a runnable `out/MuseDesk-darwin-arm64/MuseDesk.app` that macOS
  indexes alongside `/Applications/MuseDesk.app` — not a double install.
- Fix: `postPackage` hook in `forge.config.ts` writes
  `.metadata_never_index` into the output root after every package (`make`
  runs it too); regression-covered in `test/unit/packaging.test.ts`.
- Cleanup: removed the stale `out/MuseDesk-darwin-arm64` build copy
  (regenerates on package; DMGs kept), wrote the marker immediately, and
  verified `mdfind` returns only `/Applications/MuseDesk.app`.
- Noted: installed copy is beta.1 while a beta.2 DMG exists in `out/make`;
  user chose to stay on beta.1 for now.

## Project sidebar

- Sidebar now groups sessions by working folder (`src/shared/projects.ts`:
  `groupSessions` + `musedesk.projects` localStorage store, 7 hermetic unit
  cases). Top button is **+ New Project** (folder picker, no immediate chat);
  each project row has a **+** that starts a chat in that folder.
- Rows expand/collapse with persisted state; the active session's project
  auto-expands; collapsed rows aggregate the running dot + pending badges.
  Folder-less sessions group under **default folder**. Footer button removed.
- Verified both states pixel-first via headless captures (expanded +
  temporarily seeded collapsed); README screenshots regenerated. Gates green
  (57 unit, typecheck, lint).

## Turn recovery (stuck spinner + infra failures)

- Root-caused the MCP failure from the session journal: `turn/completed`
  with `configError`/`retryable:false` in ~22ms — the session runtime lost
  MCP, so resending can never succeed. Infra kinds (`configError`,
  `environmentError`, `launchError`) now get guidance + a **Restart host**
  button (`musedesk:host/restart` IPC → `startHostWith`, same re-attach flow
  as the access toggle, blocked while any turn runs).
- Stuck Working… (missed terminal event on long answers): new
  `TranscriptStore.resyncFromHistory` reconciles items + active turn against
  a point-in-time `session/read`. Manual ⟳ button in the top bar plus an
  automatic watchdog (active turn silent 60s → one read RPC/min, silent
  unless it unsticks).
- Proof: 5 resync fold cases + 2 infra-guidance cases (64 unit green),
  typecheck, lint, 17 e2e green, screenshots regenerated (topbar button).

## Sidebar fixes: collapse + hide

- Fixed the uncollapsible active project: the always-expanded invariant
  fought the user's clicks (it snapped back open instantly). Replaced with
  expand-on-select — opening a session reveals its project once via
  `selectSession`/boot/`newChatIn`, then the user is free to collapse it.
- New × per project row: hides the folder from the sidebar only (sessions
  untouched, persisted in `musedesk.projects.hidden`). Re-adding the folder
  with + New Project restores it with its old chats; a notice explains the
  restore path. Old stores without `hidden` migrate cleanly.
- Proof: storage round-trip/migration/fallback cases (65 unit green),
  typecheck, lint warning-free, 17 e2e green, screenshots regenerated.

## Context usage bar

- Top bar now shows the active session's context occupancy (`ctx N%` +
  mini bar, amber/red by `warning`/`blocked` pressure, exact counts on
  hover). Fed by live `session/contextUsage` notifications plus the
  snapshot `contextUsage` block on resume/resync (`src/shared/contextUsage.ts`,
  5 hermetic cases). Hidden until the server first reports.
- Out of scope by protocol: account-level (hourly/weekly) allowances are
  exposed nowhere — not in MSP, not in the CLI, not on disk — so only
  per-session context can be shown. README says so explicitly.
- Proof: 70 unit green, typecheck, lint, pixel-verified via a temporarily
  seeded capture (reverted; committed screenshots unchanged in behavior).

## Top-3 from the roadmap: todos, diff viewer, token counter

- **Tasks tab**: live plan checklist fed by `session/todoListChanged` plus
  the snapshot `todoList` block on resume/resync (`src/shared/sessionStats.ts`,
  replace-wholesale; empty list clears). Status glyphs, `activeForm` for the
  running item, open-count in the tab.
- **Changes tab**: read-only git panel (`src/main/git.ts`: `status`/`diff`
  only via fixed-arg `execFile`, absolute-dir validation, `..` escape
  refusal, 100KB diff cap; untracked files get an all-add preview). Branch,
  per-file staged/unstaged badges, click-to-expand colored diff. Refreshes
  on turn completion, session switch, tab open, and manual ⟳.
- **Token pill**: topbar `tok 245K` from `session/tokenUsage` cumulative
  totals (+ snapshot seed), exact prompt/output split on hover.
- Right `SidePanel` shell (Tasks/Changes tabs, persisted open state,
  topbar toggle). Backlog items 4–20 moved to `docs/ROADMAP.md`.
- Proof: 81 unit green (sessionStats/git/diff cases), typecheck, lint,
  17 e2e green; all three pixels verified via temporarily seeded captures
  (reverted afterwards).

## Beta.3 release (1.0.0-beta.3)

Shipped since beta.2: CLI arch probe + in-app Rosetta warning, `check:arch`
packaging gate, Spotlight-excluded build output, project sidebar (folders,
collapse, hide), turn recovery (stuck-spinner resync + host restart),
context/token topbar meters, tasks/changes side panel, read-only git diff
viewer. Backlog moved to `docs/ROADMAP.md`. Gates: 81 unit, 17 e2e,
typecheck, lint green; verified against CLI 1.2.1.

## Continuing

- After any CLI upgrade: re-export schema, re-pin, re-run all gates.
- Next phases (out of v1 scope): signed distribution, auto-update,
  Windows/Linux packaging, skills browser, git panel.
