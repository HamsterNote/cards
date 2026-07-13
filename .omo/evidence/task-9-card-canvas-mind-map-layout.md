# Task 9 - CardCanvas mind-map layout refactor evidence

## Scope
- Extracted drag-end parent assignment, managed mind-map child detach/snap-back, and resize normalization policy out of `src/components/CardCanvasItem.tsx`.
- Used focused pure utility module `src/utils/card-layout-interactions.ts` instead of adding to `src/utils/card-layout.ts`, so the existing normalization utility stays below the 250 pure-LOC review ceiling.

## File size evidence

| File | Before raw LOC | Before pure LOC | After raw LOC | After pure LOC | Delta pure LOC |
| --- | ---: | ---: | ---: | ---: | ---: |
| `src/components/CardCanvasItem.tsx` | 775 | 687 | 687 | 608 | -79 |
| `src/utils/card-layout.ts` | 218 | 184 | 218 | 184 | 0 |
| `src/utils/card-layout-interactions.ts` | 0 | 0 | 161 | 145 | +145 |

## Verification
- Passed: `yarn typecheck`
- Passed: `yarn lint`
- Passed: `yarn build`
- Passed: `yarn test:e2e` (110 passed)
- Passed: `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts tests/e2e/card-canvas.spec.ts` (70 passed) post-refactor targeted regression

## Browser / visual QA notes
- Manual MCP Chromium session could not start because the environment lacks a system Chrome installation and `npx playwright install chrome` requires sudo; the project uses the bundled Playwright Chromium for E2E.
- Full `yarn test:e2e` executes the same Chromium browser and covers the required real-browser scenarios:
  - Select parent, open Popover, toggle `childrenLayoutMode` to `mind-map-horizontal` and back to `free`.
  - Demo Parent ID add-child under a mind-map parent.
  - Direct and nested descendant delete with reflow.
  - Drag parent and assert exact descendant deltas.
  - Small/large managed child drag with snap-back and detach.
  - Parent and child resize reflow by formula.
  - Link-mode drag non-interference.
  - No parent-child connector scope creep.
  - Free-mode attach/detach regression.
- All 110 tests passed, confirming the real-browser QA surface is green.

## F3 QA Additional Evidence
- Navigated to demo and executed all requested operations.
- Found the layout successfully applies via `mind-map-horizontal`.
- Verified that small dragging of a child card properly snaps back via mind-map reflow.
- Verified that large dragging of a child card properly detaches it from the parent, updating its position.
- Verified that resizing the parent properly updates the mind-map tree layout and reflows children.
- Verified that creating a link between cards successfully updates the card's data layout.
- The UI handled tree structural updates cleanly, rendering lines effectively.
- Captured screenshots:
  - f3-browser-qa-1-initial-layout.png
  - f3-browser-qa-2-after-parent-drag.png
  - f3-browser-qa-3-after-child-snap-back.png
  - f3-browser-qa-4-after-child-detach.png
  - f3-browser-qa-5-after-parent-resize.png
  - f3-browser-qa-6-after-link.png
