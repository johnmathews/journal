# Node 26 test failures and tracked run artifacts

> Purpose
>
> Records the fixes for issues #54 and #57: why 62 unit tests failed on Node 26,
> and why three old engineering-team files left the repository.

## 1. Node 26: `localStorage` undefined (#54)

On Node 26, 62 of 1986 tests failed with `Cannot read properties of undefined
(reading 'clear')`. The husky pre-push hook runs the suite with the local
`node`, so every push from a Node 26 shell was blocked. CI uses Node 22 and
passed.

Cause, confirmed with a probe test inside the vitest happy-dom environment:

- Node 25+ defines a `localStorage` getter on `globalThis`. Without
  `--localstorage-file` it returns `undefined` and logs an
  `ExperimentalWarning`.
- Vitest keeps existing Node globals when it installs happy-dom's window, so
  Node's getter shadows happy-dom's `Storage`.
- Node 26: `typeof localStorage === 'undefined'`. Node 22: `'object'`.

Fix: `execArgv: ['--no-experimental-webstorage']` in `vitest.config.ts` turns
the Node feature off in test workers, so happy-dom's `localStorage` comes
through. Node 22 accepts the flag (the feature is off there by default).

Result: `npm run test:coverage` passes 1987/1987 on both Node 26.11.1 and
Node 22.23.3.

Also added `.nvmrc` (`22`) to match CI and the Dockerfile. No `engines`
field: the suite now works on 26, and `engines` would only add install
warnings.

## 2. Tracked run artifacts (#57)

`.engineering-team/evaluation-report.md`, `improvement-plan.md` and
`migration-plan.md` were committed before `.gitignore` ignored
`.engineering-team/`, so they stayed tracked. All three describe shipped work
(Mosaic migration, mood-trend defaults, an earlier storylines detail
redesign). Their decisions already live in `journal/260410-mosaic-migration.md`,
`docs/storylines.md` and `docs/archive/2026-07-12-storylines-redesign-webapp.md`.

`git rm --cached -r .engineering-team/` untracks them. Git history keeps them.
A checkout that pulls this change loses its local copies of those three files,
because git deletes files that were tracked upstream.

Also ignored `.claude/worktrees/`, which showed as untracked in the main
checkout while a worktree existed. The server repo already ignores it.
