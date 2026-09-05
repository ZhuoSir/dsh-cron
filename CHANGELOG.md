# Changelog

## 0.4.3

- Register a session-scoped Cron tab through the optional Better Sidebar 0.18 public client contract, without importing or changing Better Sidebar.
- Reveal the owning right/bottom panel (or narrow drawer) on header/notification entry; reuse detached windows without opening unrelated panels.
- Retain a native modal-dialog fallback for absent, unsupported, disabled or removed sidebar integration, avoiding cross-plugin stacking conflicts.
- Isolate tab selection and badges by Session, re-prime notification watchers on owner changes, ignore stale panel responses, and stop hidden panel polling.
- Group notification preferences in the panel header and add deterministic real-React/portal tests for fallback, session ownership, notifications and optional-service lifecycle.
- Restore Better Sidebar's native collapse control when dsh-tauri's global left-sidebar hide rule matches its accessible label; scope the compatibility override to the Better Sidebar toggle cluster and keep cleanup lifecycle-owned.
- Add browser cascade/interaction regression coverage for stylesheet order, narrow/desktop layouts, labels, and cleanup.

## 0.4.2

- Add bounded compatibility with DSH Core `0.1.3-alpha.1` while retaining the `0.1.1-rc.2` and `0.1.2` compatibility lines.
- Migrate cold Session reads to snapshot headers and lifecycle-owned read handles (`open(id, 'read')`, `read()`, `close()`), with an API-shape-only legacy `inspect()` fallback; read or close failures abort that resume attempt.
- Cover `snapshot.header`, handle cleanup on success/failure, and the legacy persistence seam in focused tests.

## 0.4.1

- Republish the rc.1 compatibility build after enabling repository-level immutable GitHub Releases.
- Preserve the reviewed 0.4.0 runtime behavior; only release provenance metadata changes.

## 0.4.0

- Add bounded compatibility with official DSH `0.1.2-rc.1` while retaining the controlled `0.1.1-rc.2` baseline.
- Bind every model-tool operation to `ToolRunContext.exec.agent`, require a live root Session, and deny cross-Session task or history access.
- Require the same Session owner on every HTTP task/history operation.
- Reject static config tasks without an explicit `sessionId` owner.
- Reconcile `delivered` and `running` history records as `interrupted` after Host restart.
- Build both one-shot and watch artifacts directly in the DSH ModuleLoader format.
- Add exact rc.1 source compatibility, artifact freshness, package smoke, and Windows/Linux Node 22.19/24 CI coverage.

## 0.3.3

- Restore light/dark theme contrast and retain Session-bound cold wake behavior.
