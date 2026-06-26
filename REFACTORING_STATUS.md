# Refactoring status

This file is a **historical snapshot**. The modular split described in `REFACTORING_PLAN.md` is **largely done**.

## Current layout (maintained)

| Area | Location |
|------|-----------|
| UI panels & controls | `scripts/ui/` — `MeshControls`, `StudioControls`, `RenderControls`, `GlobalControls`, `AnimationControls`, `ResetControls`, `UIHelpers`, etc. |
| Scene event wiring | `scripts/scene/EventManager.js` (registers `eventBus` listeners for `SceneManager`) |
| Other scene helpers | `scripts/scene/SceneObjectsController.js` |
| Main orchestration | `scripts/UIManager.js`, `scripts/SceneManager.js` |

## Not done (optional / larger scope)

- **`TransformManager`** / **`ModelManager`** — logic still lives in `SceneManager` + dedicated controllers (`ModelLoader`, `TransformController`, …). Extract only if a clearer boundary is needed.
- **Export capture parity** — video/stills should match viewport ~1:1; seamless tier × resolution × aspect switching; all asset + typography animation presets. Tracked in **`docs/EXPORT_REFACTOR_PLAN.md`** (chunked plan; work incrementally).
- Ongoing perf/architecture items are tracked in code review notes (e.g. DOF depth pass traverse, clay restore path).

## Conventions

- Composition over inheritance: control modules take `eventBus`, `stateStore`, `uiManager`, shared `helpers` where applicable.
- Public behavior is unchanged unless intentionally versioned.
