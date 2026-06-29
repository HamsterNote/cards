# Decisions - card-canvas-mind-map-layout

## Pending decisions
- Utility module location: `src/utils/card-layout.ts` vs `src/utils/cards.ts`.
- Whether to export layout constants or keep internal.

## Made decisions
- Public contract exposes `CardChildrenLayoutMode` from `src/components/CardCanvas.tsx` and re-exports it from `src/index.ts` for package consumers.
- Missing `childrenLayoutMode` remains represented by field absence in serialized card JSON; tests assert that no default `free` property is injected.
- Todo 2 uses a separate `src/utils/card-layout.ts` module to keep coordinate layout independent from existing hierarchy/delete utilities in `src/utils/cards.ts`.
- Mind-map layout constants and the public normalization helpers are exported from `src/utils/card-layout.ts` only; package-root exports are deferred until a public API consumer requires them.
- Todo 3 normalizes controlled replacements in `CardCanvas` via a guarded `useEffect` that only calls `onCardsChangeRef.current` when normalized card `id/x/y` differs from incoming `cards`, making canonical external data idempotent and avoiding render-loop writebacks.
- Todo 3 keeps mode changes event-scoped: Popover `setCard` normalizes only when the patched card is or becomes `childrenLayoutMode: 'mind-map-horizontal'`; explicit `'free'` is written without erasing existing child coordinates or forcing future reflow.
- Todo 3 normalizes Demo replacement flows at the controlled boundary after Parent ID add and after `deleteCards`, preserving delete cascade semantics while reflowing affected mind-map ancestors.
- Added  to  (or the element itself via inline style; we used the inner popover content inline style/CSS) so the Demo Popover controls can be clicked since the parent  has  to let clicks fall through to the canvas.
- Re-verified outside click clears the selection even when interacting with the popover controls, using a Playwright regression test.
- Added pointer-events: auto to the Demo Popover content inline style so the mode select can be clicked. The wrapper .cards-card-canvas__popover uses pointer-events: none to let clicks fall through to the canvas.
- Re-verified outside click clears the selection even when interacting with the popover controls, using a Playwright regression test.
