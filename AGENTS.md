# Agent guide — dsh-cron

This is the repository's standing contract for coding agents. Read it at session start, after resuming, and before merging or reporting delivery. **An important PR is not complete when it is merged: it must reach a new, verified GitHub Release.** 上游合并、发布、安装和当前页面生效是四个不同状态，必须分别报告。

## Start here

1. Run `pwd`, `git status --short --branch`, `git remote -v`, and inspect the current goal/Issue/PR. Use the bound worktree; preserve unrelated changes. Never infer the workspace from a Desktop installation path.
2. Fetch the existing official remote and inspect `origin/main`, open PRs, the latest published release, and unreleased changes. Fetch is not permission to merge/rebase unrelated work. Reuse local repositories; do not clone a duplicate.
3. Read `README.md` for product/support contracts, `docs/agentic-readiness.md` for architecture/testing, and `RELEASE.md` before release work. Use a feature branch and a tracking Issue; do not push directly to `main`.
4. State scope, expected outputs and verification before editing. Maintain a short task list. Delegate independent work with explicit file ownership; review delegated results yourself.

## Code map and invariants

| Area | Entry points | Must preserve |
| --- | --- | --- |
| Host scheduler / tools / HTTP / persistence | `index.js`, `tests/host.test.mjs` | Root Session ownership; no cross-Session list/mutation; no fallback to another owner; no duplicate firing after restart; close persistence handles on failure. |
| Client / notifications | `src/client/index.tsx`, `locale.ts`, `styles.ts` | Session isolation, stale-response guards, hidden-panel polling cleanup, accessible modal/focus behavior, theme tokens. |
| Optional Better Sidebar | `src/client/sidebar.ts`, `tests/sidebar-contract.test.mjs` | Capability/version guards, correct owner, dedupe/float placement; independent fallback if missing, disabled or disposed. Do not depend on private Sidebar state or hashed CSS classes. |
| Distributed browser artifact | `lib/client.js`, `tsdown.config.ts` | Source lives in `src/client`; rebuild and commit the bundle. Do not hand-edit generated JS or introduce install-time build scripts. |
| Cordis bundle | `cordis.patch.yml` | Shared services belong to Host; read the composition-editing skill before changing a composition. Never edit shipped presets or installed DSH sources as the project fix. |
| Delivery safeguards | `scripts/release-policy.mjs`, `scripts/publish-release.mjs`, `.github/workflows/` | Important-change version gate, all-CI release gate, exact commit/tag identity, draft-first/idempotent publication, immutable assets. |

## Verification ladder

Use the pinned `pnpm@11.7.0`; Node support is `^22.19.0 || >=24.0.0`.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm exec playwright install chromium
pnpm test:sidebar
pnpm release:check --base origin/main
```

- `pnpm verify` includes typecheck, build, Host/client tests, release/readiness tests and package smoke. The final PR check compares **committed** changes against the PR base; commit the complete candidate before running `release:check` locally.
- Browser tests are separate and mandatory for UI/release work. Their fixtures are not proof that the user's current GUI has been updated.
- Set `DSH_CORE_PATH` to a clean source checkout at a supported exact commit for Core-source checks. Without it, the test explicitly skips that portion: report the skip, not a full compatibility pass. CI checks both supported Core commits on Windows/Linux and Node 22.19/24.
- For optional integration-contract tests, set `DSH_BETTER_SIDEBAR_PATH` to the supported Better Sidebar source package and run `node tests/sidebar-contract.test.mjs`.
- Review the diff, generated bundle, lockfile scope and secrets. Fix failing tests; do not remove assertions, weaken ownership, change registries, or disable TLS to obtain a green result.

## Release decision — mandatory before every PR

**Important changes require a new version in the same PR.** This includes behavior/features/bug fixes, UI and integrations, tools/API/security/ownership, compatibility, dependencies, package/build configuration, and delivery automation. The conservative machine gate includes `index.js`, `src/`, `lib/`, `cordis.patch.yml`, `package.json`, `pnpm-lock.yaml`, TypeScript/build config, `scripts/` and `.github/workflows/`.

Docs/tests-only changes may explicitly declare **no release** with a reason. Any uncertainty or user-visible impact means release required; do not use a docs label to bypass the file-based gate. Update the classifier and its tests if introducing a new production entry point.

For a release-required PR:

1. Compare against the current base version and latest immutable tag; account for every important merged but unreleased change. Record the intended version and included PRs. Patch = backward-compatible fix, minor = additive capability, major = breaking contract. For this pre-1.0 package, use an explicit compatibility explanation when choosing the increment.
2. Bump `package.json` to a strictly newer stable semantic version. Add `## <version>` release notes to `CHANGELOG.md`, update README Git-tag and tarball install examples, and rebuild/commit `lib/client.js` if affected. Do not leave release notes under `Unreleased` for the version being published.
3. Run all applicable checks, independent review, and `pnpm release:check --base <current-base-sha>`. Rebase/reconcile and reverify if the base version moves; never race two PRs into the same version.
4. Wait for the **release-ready** required check and all underlying tests. Merge the verified head through a PR (squash preferred); never bypass protection or force-push. Serialize important merges until the preceding release is verified.

## Post-merge ownership — do not stop at merge

The agent delivering the PR owns the publication follow-through; do not wait for the user to ask “where is the new version?”. `CI` on a push to `main` calls the reusable `Release` workflow only after `release-ready` succeeds. This publishes directly, because a tag created by `GITHUB_TOKEN` does not trigger another push workflow.

Before marking the task/goal complete, collect and report:

- PR URL and verified merge commit.
- New version, annotated tag pointing at that exact verified release commit, and successful Release job URL.
- Published non-draft, non-prerelease, immutable GitHub Release containing `dsh-cron-<version>.tgz` and `SHA256SUMS`.
- Downloaded tarball SHA-256 matching the manifest and independently reported GitHub asset digest; smoke-install the official artifact in an isolated Profile and distinguish mock-context tests from real Host/UI verification.
- Fixed-version install/upgrade command and explicit local activation status. **Merged ≠ released ≠ installed ≠ active.** Do not tell the user to refresh to obtain code absent from their installed version.

If publication fails, keep the release work open and diagnose the failed gate. Rerun the original exact-SHA **main CI** run (prefer rerunning all jobs); there is no standalone Release dispatch or tag-push publishing entry point. Its gated reusable Release job reconciles existing tags/drafts/assets and never overwrites mismatches. Do not move tags, replace immutable assets, hand-upload a different build, or mark the goal complete merely because the PR merged. If CI itself cannot run, preserve evidence and report the concrete failure; never invent a successful release.

## Safety and deployment boundaries

- No production task creation/publication/model calls in tests. Use fake contexts, fixture APIs and fresh isolated `DSH_HOME` directories; never copy real task/history/credential files into fixtures.
- Keep GitHub remotes on official HTTPS. Follow the user's designated token source; verify the expected account before writes; keep credentials process-scoped, TLS enabled and redirects off. Never commit/log/copy tokens, persist auth Git settings, or reactivate retired integrations. Review hooks before authenticated Git. After an uncertain push/POST, reconcile exact remote state before retrying.
- A release authorizes publication, not installation into the user's live Profile, a Host restart, or checking out/removing a managed worktree. Obtain explicit user permission for checkout and disruptive deployment actions. Do not interrupt active Sessions to activate an update.
- `dsh plugin` forwards to pnpm and can reconcile configuration even for help/list. For read-only installed-version checks use direct `pnpm --dir <profile> list dsh-cron --depth 0` or read the installed manifest. A broken Desktop shim may require explicit `node <desktop-cli>/lib/bin.js`; do not repair global PATH as a side effect.
- Repository edits do not update the running GUI. Verify the actual served URL after an authorized installation/restart/refresh; do not start a replacement server to simulate success.

## Handoff format

Report **Expected vs Actual**, files changed, tests and skips, Issue/PR, release/tag/digest, installed/active status, and remaining work. Link primary files with exact repository paths. Keep an incomplete release as an explicit next step in the current goal, not an unmentioned TODO in another conversation.
