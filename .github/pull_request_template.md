## Purpose and scope

Fixes #<!-- tracking issue -->

- What changes for the user?
- What is intentionally outside scope?

## Release decision (required)

- [ ] **Release required** — runtime, UI/integration, API/ownership/security, compatibility, dependency/build, or delivery automation changes.
- [ ] **No release** — docs/tests only; explain why there is no important impact.

Reason:
Base version → proposed version:
Included merged-but-unreleased PRs:
Release follow-through owner (the delivering agent/maintainer):

For a release-required PR:
- [ ] Version is newer than the current PR base; CHANGELOG and README tag/tarball examples agree.
- [ ] Source changes include the rebuilt `lib/client.js` where applicable.
- [ ] `pnpm release:check --base <base-sha>` passed on the committed candidate.

## Expected vs Actual

- Expected changed files/behavior:
- Actual changes:
- `pnpm verify`:
- `pnpm test:sidebar` (required for UI/release):
- Exact Core source checks / optional Sidebar contract checks / explicit skips:
- Independent review and resolved findings:

## Completion evidence — update after merge

- [ ] `release-ready` and every underlying CI gate succeeded; verified PR head merged without bypassing protection.
- [ ] Main CI invoked Release; successful run URL:
- [ ] Version + annotated exact merge-SHA tag + immutable Release URL:
- [ ] Official tarball + SHA256SUMS + independently checked digest:
- [ ] Isolated install evidence (state what was mocked vs real):
- [ ] User install/activation status and exact upgrade command reported.

**Do not mark an important change complete merely because it merged.** A failed or missing release remains owned work. No live Profile install/restart or managed-worktree checkout is implied by publication.
