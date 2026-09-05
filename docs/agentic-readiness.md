# Agentic readiness and delivery map

The entry contract is [`../AGENTS.md`](../AGENTS.md). This document explains how a fresh agent finds the right code, chooses evidence, and finishes a release without relying on another session's memory.

## Architecture boundaries

```text
Session-bound model Tools ─┐
                          ├─ index.js ─ task store + history ─ owning Session followup
Session-bound /cron/api ───┘                 │
                                            └─ run lifecycle correlation
src/client/index.tsx ─ shared Session-aware UI/notification state
    ├─ header action + shell overlay fallback (native dialog)
    ├─ sidebar.ts ─ optional Better Sidebar public service adapter
    └─ locale.ts / styles.ts
                  │ tsdown
                  └─ lib/client.js (committed ModuleLoader distribution)
```

Do not conflate Cron's scheduled-task tab with Better Sidebar's subagent **Tasks** tab. UI availability depends on the installed Cron version, active client bundle, compatible Sidebar service, and whether its tab type is enabled. A merged commit is not evidence of installation.

Host mutations must carry a live root Session owner. A cold owner is resumed only from its own durable state, never from a fallback Session; a failed read/close/resume remains retryable. Client polling must reject stale-owner results and unwind listeners/timers on disposal. These boundaries matter more than cosmetic test snapshots.

## Fast paths for a new agent

| Change | Read first | Minimum focused evidence |
| --- | --- | --- |
| Schedule / tools / HTTP / restart | `index.js`, `tests/host.test.mjs` | Host suite including owner rejection and restart/no-refire cases |
| Core compatibility | `tests/core-compat.test.mjs`, peer ranges in `package.json` | Exact source identity and both persistence API seams; do not widen peer ranges speculatively |
| UI / notification | `src/client/index.tsx`, `tests/toast-render.test.mjs` | Real React/portal lifecycle tests plus browser focus, modal, owner and stale-response tests |
| Sidebar integration | `src/client/sidebar.ts`, `tests/sidebar-contract.test.mjs` | Compatible service/fallback/disabled/disposal; scopes, dedupe, floats; optional installed-source contract test |
| Build / packaging | `tsdown.config.ts`, `tests/package.test.mjs` | Fresh bundle, one ModuleLoader wrapper, packed entrypoints, no install scripts |
| Release automation | `scripts/release-policy.mjs`, `scripts/publish-release.mjs` | Pure policy and fake-API publisher tests, wiring contract tests, then actual CI/Release evidence |

## Commands and evidence levels

- `pnpm install --frozen-lockfile`: install the committed closure. Do not commit local registry/mirror URL churn or unrequested dependency updates.
- `pnpm verify`: typecheck, build, Host/client tests, release/readiness tests, and tarball checks. Node 22.19/24 and Windows/Linux are covered by CI.
- `pnpm test:release`: fast, offline Node tests for release policy, retries/conflicts, credential routing and workflow wiring. No real GitHub writes.
- `pnpm test:sidebar`: real Chromium-based **fixture** tests. Install Chromium with `pnpm exec playwright install chromium`. `PLAYWRIGHT_CHANNEL=msedge` selects Edge for the collapse test; `DSH_CHROMIUM_EXECUTABLE` selects a browser executable for the integration test on an existing local setup.
- `pnpm release:check --base <base-sha>`: inspect a committed PR candidate against its actual base, not a remembered branch version.
- `node scripts/release-policy.mjs --plan`: read-only local release decision using manifest, commit and annotated tags. Run with fetched tags. This does not create a release.

`DSH_CORE_PATH` is optional locally, but its absence is a **reported skip**, not Core-source verification. Supported clean commits are `a66e4702047846cdaa10c66c9d3df3951f5ea70d` (0.1.2-rc.1) and `d347e703908d0406b7a7ef80e3a0e594d86b2215` (0.1.3-alpha.1). `DSH_BETTER_SIDEBAR_PATH` enables the additional 0.18.0 source-contract test. Discover existing checkouts before obtaining sources.

Distinguish four levels in reports: unit/fake context → real browser fixture → isolated package/Profile installation → actual running Host/GUI. Passing one does not prove the next. Do not start models or real scheduled tasks merely to fill a checkbox.

## Delivery state machine

```text
Issue/scope → important-change decision → version + notes + source/bundle
  → PR checks + review → release-ready → merge exact head
  → main CI success → reusable Release plan
  → build/test/package/checksum → annotated exact-SHA tag
  → draft + verified assets → publish immutable release
  → download/checksum + isolated install → delivery report
  → [separate user authorization] live install/restart/refresh
```

Documentation/tests-only commits with no important changes since the existing version tag skip publication. Important commits without a new version fail both the PR policy and the post-merge plan. This dual check catches release debt even if someone bypasses pre-merge checks. A same-commit rerun resumes publication rather than generating another version.

The reusable workflow publishes directly; it does not assume its own `GITHUB_TOKEN` tag will trigger a second workflow. Release concurrency is per commit so retries serialize without canceling another version. Agents must still serialize important merges: two PRs that both select the same next version must reconcile against updated `main` before merging.

### Branch protection

The intended `main` policy requires PRs, an up-to-date branch and the stable **release-ready** status, including administrators. The status runs with `always()` and explicitly fails if release-policy, any matrix verification, or browser checks failed/cancelled/skipped. This avoids GitHub treating a skipped required check as success.

Workflows alone cannot prevent an administrator disabling protection. Verify the actual repository setting when configuring this project or a fork; do not claim enforcement from YAML alone. Never remove protection to merge a failing change. Public forks do not auto-publish: the workflow and publisher are explicitly bound to `cloga/dsh-cron`.

## Failure recovery

| Failure | Correct response |
| --- | --- |
| PR policy says missing bump/notes | Update version, changelog and README in that PR; reverify |
| Generated bundle differs after build | Inspect source change, rebuild and commit `lib/client.js`; no hand-edit |
| Main CI fails after merge | Fix the failed check through a new PR; release remains unfinished |
| Existing tag points elsewhere / lightweight tag | Stop; never move it. Inspect provenance and prepare a new reviewed version if necessary |
| Upload interrupted with a draft | Rerun the original exact-SHA main CI run; its gated reusable Release job reuses matching assets (no standalone dispatch/tag trigger) |
| Existing asset digest differs | Stop; do not delete/overwrite an immutable or mismatching asset |
| Release published but installed version old | Give the fixed-version upgrade command; refreshing alone cannot install it |
| Installed version current but UI unchanged | Check active bundle/service/tab enablement and safe restart/refresh status |

The publisher does not blindly retry uncertain writes. A later run re-reads remote state. GitHub API reconciliation is bounded; immutability must be enabled in repository settings. A failure of the final immutable check is a real failed delivery, not permission to announce success.

## Readiness acceptance criteria

A maintainer can evaluate readiness without a score invented by an agent:

- [ ] A fresh agent can locate architecture, invariants, commands, credentials boundary and release policy from root `AGENTS.md`.
- [ ] Runtime/dependency/build/delivery changes without a version bump fail a testable PR gate; docs-only exceptions are explicit.
- [ ] Required `release-ready` combines every underlying test result and branch protection actually requires it.
- [ ] Main CI success starts publication without a human remembering to push a tag.
- [ ] Same-ref retry, conflicting tags/assets, interrupted drafts and token redirects have offline regression coverage.
- [ ] One real merged important PR reaches an immutable release with downloaded digest and isolated-install evidence.
- [ ] Handoff names separate merge/release/install/activation states and leaves no invisible release work behind.
