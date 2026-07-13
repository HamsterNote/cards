# Evidence: Todo 7 (Demo Popover control and missing pointer-events fix)

- The Demo already implemented the mode toggle `<select>` component and `add-child` flow in Demo's custom controlled logic during Todo 3, but the Popover content needed `pointerEvents: 'auto'` to be clickable because `.cards-card-canvas__popover` blocks pointer events.
- Updated `src/components/CardCanvas.css` to add `.cards-card-canvas__popover > * { pointer-events: auto; }` (and verified it by adding it directly to `src/demo/Demo.tsx` popover container style as well/instead just to be safe).
- Added `clicking outside card/popover clears selection when popover pointerEvents is auto` regression test to `tests/e2e/card-canvas-mind-map.spec.ts`.
- `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts` passes.
- `yarn typecheck` and `yarn lint` pass.
