# Learnings - card-canvas-mind-map-layout

## Conventions
- `CardChildrenLayoutMode` must be a strict string-literal union: `'free' | 'mind-map-horizontal'`.
- Missing `childrenLayoutMode` is exactly equivalent to `free`.
- Layout coordinates are pure JS numbers, no rounding.
- Constants: `MIND_MAP_HORIZONTAL_GAP = 48`, `MIND_MAP_VERTICAL_GAP = 24`, `MIND_MAP_DETACH_THRESHOLD = 48`.
- Layout is coordinate-based persisted through controlled `onCardsChange`; no nested DOM wrapper.
- Must keep DOM flat; every card remains absolute child of canvas container.
- Must not modify free-mode behavior.
- Must not add parent-child connector lines.
- `expandParentToContainChildren` disabled for mind-map parents.
- Tests must assert immutability by freezing inputs.
- Todo 1 confirmed that the demo accepts frozen card inputs via `card-canvas-demo:set-cards`; current serialization is still a direct `JSON.stringify(cards, null, 2)` so omitted optional fields remain absent.
- E2E helper parsing is the boundary for serialized card snapshots; it must reject any `childrenLayoutMode` value outside `free` or `mind-map-horizontal` instead of widening to arbitrary strings.
- Todo 2 layout utility lives in `src/utils/card-layout.ts`; it uses local `Map` builders only inside normalization and returns a new array, while unchanged cards can preserve object identity.
- `normalizeMindMapLayout` intentionally moves an entire child subtree by the direct child delta before recursively normalizing that child when its effective mode is `mind-map-horizontal`, so free-mode descendants retain relative offsets.
- Todo 2 utility tests were split into `tests/e2e/card-layout-utils.spec.ts` after LOC review, keeping `tests/e2e/card-utils.spec.ts` below the 250 pure LOC ceiling.
- `CardCanvas` Todo 3 normalization compares only persisted model coordinates (`id/x/y`) between incoming and normalized arrays; this is sufficient for loop prevention because mode/content/title changes are event-path writes, while the guarded effect only owns coordinate canonicalization.
- Demo Popover mode control uses the renderPopover setter path, so switching to mind-map exercises the same controlled normalization path package consumers use rather than a Demo-only direct state edit.
- Demo add/delete can safely normalize all resulting cards after `setCards` inputs because `normalizeMindMapLayout` is a no-op for effective free-mode parents and preserves the existing `deleteCards` cascade result set.
- Todo 4 drag-end assignment must branch on the target parent's effective layout mode after `assignParentFromPoint`: mind-map parents call `normalizeMindMapLayout` and skip containment expansion, while missing/`free` parents keep `expandParentToContainChildren`.
- Playwright drag targets can become stale if a helper scrolls the dragged card after measuring the target card; scroll the dragged handle before reading the target box when writing attach/re-parent drag tests.
- Todo 5 managed-child empty-canvas drag must not call `assignParentFromPoint` unless a real candidate exists, because that helper intentionally deletes `parent` on no-candidate free-mode drops.
- Todo 5 parent-drag invariant relies on `dragPositionSnapshot` including descendants; avoiding empty-drop assignment for root mind-map parents preserves exact descendant deltas with no post-drag normalization.
- Task 9 moved interaction-time layout policy into `src/utils/card-layout-interactions.ts` rather than `card-layout.ts`; this keeps pure normalization (`normalizeMindMapLayout`) separate from drag/resize orchestration and avoids pushing `card-layout.ts` over the 250 pure-LOC ceiling.
- `finalizeCardDragLayout` preserves the candidate-priority rule by checking `findParentCandidateId` before threshold logic: any real candidate routes through `assignParentAtPointer`, while no-candidate managed mind-map children use the exact `< MIND_MAP_DETACH_THRESHOLD` snap-back comparison.
- Resize orchestration should call `resizeCardWithMindMapNormalization` after applying the measured dimensions; the helper normalizes only when the resized card or its parent is effectively `mind-map-horizontal`.
