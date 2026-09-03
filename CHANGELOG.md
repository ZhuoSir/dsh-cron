# Changelog

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
