# Release checklist

1. Confirm the branch and Issue scope; do not release from the default branch without review.
2. Verify `package.json` version, `CHANGELOG.md`, README install examples, and compatibility claims agree.
3. Verify the exact official rc.1 checkout is at `a66e4702047846cdaa10c66c9d3df3951f5ea70d`.
4. Run `pnpm install --frozen-lockfile` with pnpm 11.7.0.
5. Run `pnpm verify` on Node 22.19 and Node 24.
6. Confirm CI passes on Windows and Linux for both Node versions.
7. Inspect `dsh-cron-0.4.0.tgz`; require the Host entry, directly wrapped Client entry, patch, README, changelog, license, and package metadata, with no source/build scripts.
8. Install the tarball into a disposable Web Profile and confirm model tools and HTTP requests cannot read or mutate another Session's tasks/history.
9. Restart the Host and confirm nonterminal history becomes `interrupted` without refiring a consumed task.
10. After review approval, push an annotated `v<package-version>` tag. `.github/workflows/release.yml` must re-run the exact rc.1 source and package gates, generate `SHA256SUMS`, and create the GitHub Release; never upload a hand-built replacement.
11. Verify the published artifact digest against `SHA256SUMS`, reinstall it in a disposable Profile, and repeat the package and ownership smoke tests.
