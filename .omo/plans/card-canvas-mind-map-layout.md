# card-canvas-mind-map-layout - Work Plan

## TL;DR (For humans)

**What you'll get:** 父卡片会多一种“横向脑图”子卡展示方式：在父卡上切换后，子卡会自动排到右侧、多层继续向右展开，并且拖动父卡时整棵子树一起移动。

**Why this approach:** 这个画布现在所有拖拽、连线、弹窗和测试都以卡片数据里的坐标为准，所以新布局会把计算后的坐标写回卡片数据，而不是用隐藏 DOM 容器临时摆放，避免视觉位置和交互命中错位。

**What it will NOT do:** 第一期不做纵向脑图、手动同级排序、父子连线视觉、不改成嵌套 DOM 树，也不重写整个画布架构。

**Effort:** Medium
**Risk:** Medium - 风险主要在拖拽结束、脱离父级、resize 后的坐标归一化必须和现有 free 模式完全隔离。
**Decisions to sanity-check:** 模式字段名使用 `childrenLayoutMode`，值为 `'free' | 'mind-map-horizontal'`；初始/外部传入的 mind-map 数据会通过受控 `onCardsChange` 做一次幂等坐标归一化；不新增父子连接线。

Your next move: 选择现在 `$start-work` 执行，或先运行双重高准确度 Momus 计划审查。Full execution detail follows below.

---

> TL;DR (machine): Medium-risk React/TypeScript canvas feature: add per-parent `childrenLayoutMode`, pure coordinate mind-map layout, drag/resize integration, Demo toggle, utility + Playwright regression coverage.

## Scope

### Must have

- Add a public card-data field on `CardCanvasCard`: `childrenLayoutMode?: CardChildrenLayoutMode`.
- Export `CardChildrenLayoutMode` from the public package entry if it is part of `CardCanvasCard`'s public API.
- Define `CardChildrenLayoutMode` as the exact string-literal union `'free' | 'mind-map-horizontal'`; missing field is exactly equivalent to `'free'`.
- Keep all existing free/content parent-child behavior unchanged for cards without `childrenLayoutMode` and cards with `childrenLayoutMode: 'free'`.
- Implement horizontal mind-map as pure coordinate layout that persists computed absolute `x/y` back into `cards` through existing controlled `onCardsChange` flow.
- Keep the DOM model flat: every card remains an absolutely positioned child of the current canvas container.
- Use a deterministic coordinate contract:
  - `MIND_MAP_HORIZONTAL_GAP = 48`.
  - `MIND_MAP_VERTICAL_GAP = 24`.
  - `MIND_MAP_DETACH_THRESHOLD = 48`.
  - Direct children are ordered by their order in the `cards` array.
  - `child.x = parent.x + parent.width + MIND_MAP_HORIZONTAL_GAP`.
  - Sibling slots are vertically centered around the parent center using subtree heights, not just card heights.
  - No rounding: keep numeric coordinates as JS numbers; tests that hit halves use `toBeCloseTo`.
- Layout subtree contract:
  - For a child with no mind-map children, subtree height is `child.height`.
  - For a child whose own `childrenLayoutMode` is `'mind-map-horizontal'`, descendant block height is `sum(grandchildSubtreeHeights) + MIND_MAP_VERTICAL_GAP * (count - 1)` and child subtree height is `Math.max(child.height, descendantBlockHeight)`.
  - Parent's children block height is `sum(childSubtreeHeights) + MIND_MAP_VERTICAL_GAP * (childCount - 1)`.
  - First slot top is `parent.y + parent.height / 2 - childrenBlockHeight / 2`.
  - Each child target y is `slotTop + childSubtreeHeight / 2 - child.height / 2`.
  - When a direct child is moved by layout, all descendants first move by the same `{dx, dy}` to preserve their relative offsets; if the child itself is a mind-map parent, its own direct children are then recursively normalized from the child's new position.
- Recompute mind-map layout only on explicit data-changing events, never during render without a guarded `onCardsChange` update:
  - Popover mode toggle.
  - External/controlled `cards` replacement that contains mind-map parents and non-canonical coordinates; this must be idempotent and call `onCardsChange` only if normalized coordinates differ.
  - Add child through Demo's Parent ID flow.
  - Attach/re-parent on drag end.
  - Detach on managed child drag end.
  - Delete child/descendant.
  - Parent resize.
  - Direct child resize.
  - Drag end where a mind-map managed child needs snap-back, detach, or re-parent.
- Preserve link mode: link-drag must not trigger parent assignment, detach, or layout recomputation.
- Preserve current parent drag behavior: dragging a mind-map parent moves the parent and every descendant by exactly the drag delta; post-drag normalization must not introduce extra offsets.
- Disable old `expandParentToContainChildren` behavior for parents whose mode is `'mind-map-horizontal'`; such parents must not grow to contain children placed to the right.
- Define managed child drag behavior:
  - If released over another valid parent candidate, re-parent wins regardless of threshold; target parent's mode decides final placement.
  - Else, if current parent is `'mind-map-horizontal'` and Euclidean drag distance from drag start is `< MIND_MAP_DETACH_THRESHOLD`, keep `parent` and snap/re-normalize back into the old parent's mind-map.
  - Else, if current parent is `'mind-map-horizontal'` and distance is `>= MIND_MAP_DETACH_THRESHOLD`, remove `parent`, keep released absolute `x/y`, and re-normalize the old parent's remaining children.
  - Else, keep existing free-mode empty-drop detach behavior.
- Demo Popover must expose a mouse- and keyboard-operable control for the selected card's child display mode.
- Demo serialized Cards Data must show `childrenLayoutMode` when explicitly set and omit it when absent; switching the Popover control back to free must write explicit `childrenLayoutMode: 'free'` rather than trying to delete the optional property through the existing merge-style setter.
- Update Playwright helpers so tests can parse and assert `childrenLayoutMode`.
- Add utility-level and Playwright E2E coverage for both happy paths and regressions.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Must not implement product code outside this feature surface.
- Must not introduce global child layout state in `CardCanvasProps` or React context.
- Must not use an invisible/nested DOM wrapper as the primary layout mechanism.
- Must not derive mind-map positions only in render while leaving model coordinates stale.
- Must not change free-mode behavior, old card JSON compatibility, parent candidate z-index behavior, link-mode behavior, or delete cascade semantics except where mind-map mode explicitly requires re-layout.
- Must not add parent-child connector lines in this change. Existing `linkedCardIds` SVG connectors remain link-mode only.
- Must not expand scope to vertical mind-map, auto viewport centering/zooming, sibling ordering fields, or custom connector anchors.
- Must not keep adding large amounts of logic to `src/components/CardCanvasItem.tsx`; new layout logic belongs in pure utilities or small helpers.
- Must not switch package manager, linter, test runner, or TypeScript tooling; this repo uses Yarn, ESLint/Prettier, Vite, Playwright, and strict `tsconfig`.
- Must not use TypeScript `any`, non-null assertions, unchecked casts for narrowing, or enum for this union.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD with TypeScript utility coverage plus Playwright E2E.
- Evidence: write command logs, targeted test outputs, and browser QA notes under `.omo/evidence/task-<N>-card-canvas-mind-map-layout.<ext>`.
- Required commands after relevant todos:
  - `yarn typecheck`
  - `yarn lint`
  - `yarn build`
  - `yarn test:e2e tests/e2e/card-utils.spec.ts`
  - `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts`
  - `yarn test:e2e`
- Utility tests must assert immutable inputs by freezing input cards or otherwise proving input arrays/card objects are not mutated in place.
- E2E tests must assert actual serialized card data from `[data-card-data-content]` or the existing helper, not just visual position.
- Browser/visual QA must exercise Demo at least once in real Playwright Chromium: select parent, open Popover, toggle layout, add a child through the Demo Parent ID flow, delete a direct and nested child, drag parent, drag child small/large distance, resize parent/child, and inspect serialized data.

## Execution strategy

### Parallel execution waves

- Wave 1 is contract + test foundation and should land first. It defines the public data shape and failing tests before behavior is implemented.
- Wave 2 is pure layout implementation. It can proceed after Wave 1 and should avoid React component changes except type imports needed by tests.
- Wave 3 is React interaction integration. These tasks depend on the pure layout utility and can be split between controlled normalization, drag/drop, and resize, but must coordinate on the same utility API.
- Wave 4 is Demo/UI/CSS and link-mode regression. It depends on the model field and interaction rules.
- Wave 5 is final quality, browser QA, and regression sweep.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 2, 3, 7 | None |
| 2 | 1 | 3, 4, 5, 6 | 7 test skeleton additions after helper parser exists |
| 3 | 1, 2 | 4, 5, 6, 7 | 8 |
| 4 | 1, 2, 3 | 5, 8 | 6 |
| 5 | 1, 2, 3 | 8 | 6, 7 |
| 6 | 1, 2, 3 | 8 | 5, 7 |
| 7 | 1, 3 | 8 | 5, 6 |
| 8 | 1-7 | 9 | None |
| 9 | 8 | Final verification | None |

## Todos

> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Pin public data contract and test parser support
  What to do / Must NOT do: Add `CardChildrenLayoutMode` as a strict string-literal union with exact values `'free' | 'mind-map-horizontal'`; add optional `childrenLayoutMode?: CardChildrenLayoutMode` to `CardCanvasCard`; export the type through `src/index.ts` if needed by package consumers. Update `tests/e2e/helpers.ts` `CardDataSnapshot` parsing so tests can assert the optional mode and reject invalid unknown mode values in helper parsing. Add failing tests proving cards without the field behave as free mode and do not gain a serialized field automatically. Must not add global options or mutate existing card JSON shape when mode is absent.
  Parallelization: Wave 1 | Blocked by: None | Blocks: Todos 2, 3, 7
  References (executor has NO interview context - be exhaustive): `src/components/CardCanvas.tsx` (`CardCanvasCard`, `CardCanvasProps.renderPopover` setter); `src/index.ts` public type exports; `tests/e2e/helpers.ts` data parser helpers; existing strict TS config in `tsconfig.json`; package scripts in `package.json`.
  Acceptance criteria (agent-executable): `CardCanvasCard` accepts `childrenLayoutMode?: CardChildrenLayoutMode`; `CardChildrenLayoutMode` has no enum and no `any`; a card object without `childrenLayoutMode` renders and serializes exactly as before; helper parsing returns `'mind-map-horizontal'` for valid data and fails on unknown mode values.
  QA scenarios (name the exact tool + invocation): Happy: run `yarn typecheck` and `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts` after adding a test that loads parent/child data without `childrenLayoutMode` and asserts child `x/y/parent` unchanged and mode absent in `[data-card-data-content]`; Evidence `.omo/evidence/task-1-card-canvas-mind-map-layout.md`. Failure: run a helper/parser test or Playwright fixture with invalid `childrenLayoutMode: 'vertical'` and assert the helper rejects it rather than silently accepting invalid test data; Evidence same file.
  Commit: Y | feat(card-canvas): add child layout mode data contract

- [x] 2. Implement pure horizontal mind-map layout utilities with deterministic formula
  What to do / Must NOT do: Add a pure utility module, preferably `src/utils/card-layout.ts` if it avoids bloating `src/utils/cards.ts`, or a well-contained section in `src/utils/cards.ts`. Implement named constants `MIND_MAP_HORIZONTAL_GAP = 48`, `MIND_MAP_VERTICAL_GAP = 24`, `MIND_MAP_DETACH_THRESHOLD = 48`, mode normalization helper, direct-child lookup, subtree height calculation, and layout normalization that returns a new `readonly`-safe cards array with updated absolute `x/y`. Follow the exact coordinate formula from Scope. Move a repositioned child and all descendants by `{dx, dy}` before recursively normalizing child-owned mind-map descendants. Must not mutate input arrays/card objects; must not use DOM measurement; must not export internal layout functions from package root unless required by public API.
  Parallelization: Wave 2 | Blocked by: Todo 1 | Blocks: Todos 3, 4, 5, 6
  References (executor has NO interview context - be exhaustive): `src/utils/cards.ts` existing `buildChildrenByParent`, `getDescendantIds`, `normalizeParentId`, `moveCardsFromSnapshot` patterns; `tests/e2e/card-utils.spec.ts` immutability-style utility tests; `src/components/CardCanvas.tsx` card type; Metis directives in draft requiring exact constants/formula/order.
  Acceptance criteria (agent-executable): Given parent `{x:0,y:0,width:180,height:120,childrenLayoutMode:'mind-map-horizontal'}`, `c1 {height:80}` and `c2 {height:100}` direct children, normalized coordinates use `x=228` for both children, `c1.y=-42`, `c2.y=62` with the Scope formula. Given nested mind-map child, descendants are normalized recursively; given free-mode child with descendants, descendants move by the child's `{dx,dy}` and retain relative offsets. Frozen input cards are not mutated.
  QA scenarios (name the exact tool + invocation): Happy: add utility tests in `tests/e2e/card-utils.spec.ts` or a focused utility spec and run `yarn test:e2e tests/e2e/card-utils.spec.ts`, asserting exact coordinates, stable array-order sibling sorting, nested subtree no-overlap, negative coordinate support, and immutability; Evidence `.omo/evidence/task-2-card-canvas-mind-map-layout.md`. Failure: test a free-mode parent with children and assert the layout utility returns equivalent positions/no coordinate changes when no mind-map parent is in scope; Evidence same file.
  Commit: Y | feat(card-canvas): add horizontal mind-map layout utility

- [x] 3. Integrate idempotent controlled normalization for external data, mode toggles, Demo add, and delete flows
  What to do / Must NOT do: Wire layout normalization into `CardCanvas` controlled state transitions without deriving stale render-only positions. Add a guarded effect or equivalent event-path normalization for external `cards` replacement: if cards contain mind-map parents and normalized coordinates differ, call `onCardsChange(normalizedCards)` once; if identical, do nothing. Treat Demo add-child through Parent ID and Demo delete flows as first-class controlled replacement cases: adding a child under a mind-map parent must canonicalize that new child, and deleting a direct child or nested descendant must reflow every affected mind-map ancestor without changing `deleteCards` cascade semantics. Update `setCard` / Popover setter path so changing `childrenLayoutMode` to `'mind-map-horizontal'` normalizes that parent's children; changing back to `'free'` stops future automatic positioning but does not erase existing child coordinates. Must not call `onCardsChange` every render; must not create loops; must not normalize link-drag transient state.
  Parallelization: Wave 3 | Blocked by: Todos 1, 2 | Blocks: Todos 4, 5, 6, 7
  References (executor has NO interview context - be exhaustive): `src/components/CardCanvas.tsx` `cards`, `onCardsChange`, `cardsRef`, `onCardsChangeRef`, `setCard` inside `cards.map`, Popover positioning; `src/demo/Demo.tsx` custom `card-canvas-demo:set-cards` event; pure layout utility from Todo 2.
  Acceptance criteria (agent-executable): Loading external data with canonical mind-map coordinates causes no write-back loop. Loading external data with a mind-map parent and non-canonical child coordinates triggers exactly one normalized data update. Toggling a selected parent from free to mind-map writes `childrenLayoutMode:'mind-map-horizontal'` and normalized child `x/y`. Toggling back to free writes explicit `childrenLayoutMode:'free'`, stops mind-map reflow, and future free-mode child drag remains old behavior. Adding a new card through Demo's Parent ID flow with the parent set to a mind-map card writes `parent` and canonical right-side `x/y` for the new child. Deleting a direct child of a mind-map parent reflows remaining siblings; deleting a nested child/descendant preserves existing cascade deletion semantics and reflows affected ancestor layouts.
  QA scenarios (name the exact tool + invocation): Happy: Playwright test in `tests/e2e/card-canvas-mind-map.spec.ts` dispatches `card-canvas-demo:set-cards` with one mind-map parent and intentionally stale child coordinates, waits for serialized data, and asserts one canonical coordinate set with no oscillation across two animation frames; in the same focused spec or adjacent tests, add a child via Demo Parent ID under a mind-map parent and assert `parent` plus canonical `x/y`, then delete a direct child and a nested descendant and assert remaining sibling/ancestor reflow; run `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts`; Evidence `.omo/evidence/task-3-card-canvas-mind-map-layout.md`. Failure: dispatch identical canonical data twice and assert coordinates and serialized JSON remain stable, with no extra child movement; delete a child under a free-mode parent and assert existing cascade/free behavior remains unchanged except for ordinary deletion; Evidence same file.
  Commit: Y | feat(card-canvas): normalize mind-map layout on data changes

- [x] 4. Integrate attach and re-parent drag-end behavior without parent containment expansion
  What to do / Must NOT do: Update drag-end assignment flow in `src/components/CardCanvasItem.tsx` or an extracted helper so existing pointer-based parent candidate detection still decides attach/re-parent. If target parent is free/missing mode, keep current `assignParentFromPoint` + `expandParentToContainChildren` behavior. If target parent is `'mind-map-horizontal'`, assign `parent`, skip `expandParentToContainChildren`, and normalize target parent's layout. Re-parenting from an old mind-map parent to a new parent must also re-normalize the old parent's remaining children. Must not break cycle prevention, z-index candidate precedence, selection-required movement, or link mode.
  Parallelization: Wave 3 | Blocked by: Todos 1, 2, 3 | Blocks: Todo 5, Todo 8
  References (executor has NO interview context - be exhaustive): `src/components/CardCanvasItem.tsx` drag `onEnd` assignment path, `movingCardIds`, `pointerPointRef`, `setParentCandidateId`, `setMovingCardId`, `options.selectOnMoveEnd`; `src/utils/cards.ts` `findParentCandidateId`, `assignParentFromPoint`, `expandParentToContainChildren`, `wouldCreateCycle`; Todo 2 layout utility.
  Acceptance criteria (agent-executable): Dragging a free card onto a mind-map parent sets `child.parent` to the target id, leaves `parent.width/height` unchanged, and places `child.x > parent.x + parent.width`. Dragging a card onto a free parent preserves current containment expansion behavior. Re-parenting from one mind-map parent to another removes the child from the old parent's layout and normalizes both old and new sibling groups.
  QA scenarios (name the exact tool + invocation): Happy: Playwright drag child center onto mind-map parent, assert serialized `parent.width/height` unchanged, child parent set, child right of parent, and no overlap with siblings; run `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts`; Evidence `.omo/evidence/task-4-card-canvas-mind-map-layout.md`. Failure: existing free-mode attach regression test still passes under `yarn test:e2e tests/e2e/card-canvas.spec.ts` or a focused existing test invocation, proving free parent expansion unchanged; Evidence same file.
  Commit: Y | feat(card-canvas): attach cards into mind-map parents

- [x] 5. Implement managed mind-map child drag threshold, snap-back, detach, and parent drag invariants
  What to do / Must NOT do: Add drag-end logic for cards whose current parent is `'mind-map-horizontal'`. Compute Euclidean distance from drag start to release using existing drag delta data, compare to `MIND_MAP_DETACH_THRESHOLD`. If released over valid parent candidate, perform re-parent behavior from Todo 4. If no candidate and distance is below threshold, keep parent and snap/re-normalize old parent's layout. If no candidate and distance meets/exceeds threshold, remove `parent`, keep released absolute `x/y`, and normalize old parent's remaining children. Preserve existing `createDragPositionSnapshot` behavior for dragging parents: moving a mind-map parent must move every descendant by exactly the drag delta, with no extra post-drag offset. Must not detach a managed child merely because it is outside the parent rectangle; mind-map children normally live outside parent bounds.
  Parallelization: Wave 3 | Blocked by: Todos 1, 2, 3, 4 | Blocks: Todo 8
  References (executor has NO interview context - be exhaustive): `src/components/CardCanvasItem.tsx` drag `onStart`, `onMove`, `onEnd`, `dragPositionSnapshot`, `didMoveRef`, `pointerPointRef`; `src/utils/cards.ts` `createDragPositionSnapshot`, `moveCardsFromSnapshot`, `assignParentFromPoint`; Todo 2 `MIND_MAP_DETACH_THRESHOLD` and layout helper.
  Acceptance criteria (agent-executable): A managed child dragged by less than 48px and released on empty canvas keeps `parent` and returns to canonical layout coordinates. A managed child dragged by at least 48px and released on empty canvas has no `parent` and remains at release coordinates. A managed child dragged onto another valid parent re-parents even if threshold behavior would otherwise apply. Dragging a mind-map parent by `{100,20}` moves parent, children, and grandchildren by exactly `{100,20}`.
  QA scenarios (name the exact tool + invocation): Happy: Playwright test small-drags managed child `{x:20,y:10}`, asserts `parent` unchanged and coordinates canonical; large-drags `{x:80,y:0}`, asserts `parent` absent and release position retained; parent-drags root and asserts every descendant delta exactly matches root delta; run `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts`; Evidence `.omo/evidence/task-5-card-canvas-mind-map-layout.md`. Failure: drag managed child in link mode and assert no parent/detach/layout changes occur, only link behavior if applicable; Evidence same file.
  Commit: Y | feat(card-canvas): handle mind-map child detach gestures

- [ ] 6. Integrate parent and child resize with mind-map layout normalization
  What to do / Must NOT do: Extend resize-end behavior so resizing a mind-map parent updates direct child `x` and vertical centering from the formula; resizing a direct child of a mind-map parent recomputes sibling `y` positions and preserves/normalizes descendants according to subtree rules. If resizing a free-mode card or child under free parent, keep existing behavior. Must not resize parent automatically due to child layout; only user resize changes width/height.
  Parallelization: Wave 3 | Blocked by: Todos 1, 2, 3 | Blocks: Todo 8
  References (executor has NO interview context - be exhaustive): `src/components/CardCanvasItem.tsx` resize Drag effect, min size 80x80, `onCardsChangeRef`, `cardPropRef`; existing hierarchy resize tests in `tests/e2e/card-canvas.spec.ts`; Todo 2 coordinate formula.
  Acceptance criteria (agent-executable): Increasing mind-map parent width by 40 increases each direct child's `x` by exactly 40. Increasing parent height re-centers child block by the formula. Increasing first child's height moves following siblings by the formula's exact vertical delta. Resizing a free-mode parent leaves existing child/grandchild position behavior unchanged.
  QA scenarios (name the exact tool + invocation): Happy: Playwright test records two child positions, resizes parent width by 40, asserts both child `x` increased by 40; then resizes first child height by 40 and asserts second child `y` changed by formula; run `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts`; Evidence `.omo/evidence/task-6-card-canvas-mind-map-layout.md`. Failure: run existing resize hierarchy regression from `tests/e2e/card-canvas.spec.ts` or a focused invocation and assert free parent resize still does not move child/grandchild positions; Evidence same file.
  Commit: Y | feat(card-canvas): reflow mind-map layout after resize

- [x] 7. Add Demo Popover mode control, add-child coverage, and minimal CSS/selection fixes
  What to do / Must NOT do: Add a clear Demo Popover control for child layout mode in `src/demo/Demo.tsx`, with stable selectors such as `[data-card-children-layout-mode-toggle]` or `[data-card-children-layout-mode-select]`. Ensure the existing Demo add-card Parent ID flow remains compatible with mind-map parents: a newly added child whose `parent` points at a mind-map card must be normalized through the controlled data flow from Todo 3. Ensure mouse and keyboard operation works despite `.cards-card-canvas__popover` pointer-events behavior; if changing CSS, make the smallest targeted change, and ensure clicking the Popover does not clear selection unexpectedly. Display current mode as free when field is absent. Must not introduce a design-system overhaul; use existing Demo styling patterns and CSS tokens/classes as much as possible.
  Parallelization: Wave 4 | Blocked by: Todos 1, 3 | Blocks: Todo 8
  References (executor has NO interview context - be exhaustive): `src/demo/Demo.tsx` `renderPopover`, inline input styles, Cards Data JSON, add-card parent ID flow; `src/components/CardCanvas.css` `.cards-card-canvas__popover`, card selected/candidate styles; `src/components/CardCanvas.tsx` outside-click selection clear logic and Popover wrapper.
  Acceptance criteria (agent-executable): Selecting a parent card shows a visible mode control. Checking/selecting mind-map updates serialized data to `childrenLayoutMode: 'mind-map-horizontal'` and normalizes children. Switching back to free updates serialized data according to the documented representation and stops mind-map reflow. Adding a card through Demo's Parent ID input under a mind-map parent produces a serialized child with that `parent` and canonical right-side coordinates. The control is focusable and operable by keyboard. Selection remains on the card while using the Popover.
  QA scenarios (name the exact tool + invocation): Happy: Playwright selects parent, finds mode control, toggles to mind-map, asserts control state, serialized mode, child right-side coordinates, then uses the Demo Parent ID flow to add a new child and asserts the new child's `parent` plus canonical `x/y`; run `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts`; Evidence `.omo/evidence/task-7-card-canvas-mind-map-layout.md`. Failure: click outside card/popover after using the control and assert selection clears as before, proving Popover interaction did not break outside-click behavior; Evidence same file.
  Commit: Y | feat(demo): add child layout mode popover control

- [ ] 8. Lock full E2E regression surface, including add/delete and no parent-child connector scope creep
  What to do / Must NOT do: Complete `tests/e2e/card-canvas-mind-map.spec.ts` as a focused feature spec using shared helpers, not copied local helpers. Cover mode toggle, external load normalization, Demo add child through Parent ID, right-side child placement, no overlap, nested expansion, attach/re-parent, direct-child delete reflow, nested descendant delete/cascade reflow, small drag snap-back, large drag detach, parent drag exact delta, parent resize, child resize, free-mode regression, link-mode non-interference, and explicit absence of parent-child connectors. Update or add selectors only where needed. Must not conflate parent-child hierarchy with existing `linkedCardIds` link connectors.
  Parallelization: Wave 5 | Blocked by: Todos 1-7 | Blocks: Todo 9
  References (executor has NO interview context - be exhaustive): `tests/e2e/helpers.ts` shared helpers (`getCardData`, `getCardDataById`, drag helpers, card locator helpers, wait helpers); `tests/e2e/card-canvas.spec.ts` existing parent hierarchy behavior; `tests/e2e/card-links.spec.ts` link connector expectations; `src/utils/card-links.ts` existing link connector semantics; `src/components/CardCanvas.tsx` SVG connector rendering.
  Acceptance criteria (agent-executable): New focused spec passes alone. Existing parent hierarchy/link specs still pass. Demo add-child through Parent ID under a mind-map parent is covered with serialized `parent` and canonical coordinate assertions. Deleting a direct mind-map child reflows remaining siblings; deleting a nested child/descendant preserves cascade semantics and reflows affected ancestor(s). With one mind-map parent and two children but no `linkedCardIds`, existing link connector count remains zero and no new parent-child connector selector exists. Free-mode tests prove cards without mode keep old attach/detach/delete semantics.
  QA scenarios (name the exact tool + invocation): Happy: run `yarn test:e2e tests/e2e/card-canvas-mind-map.spec.ts` and capture passed output, including explicit Demo add-child and direct/nested delete tests; Evidence `.omo/evidence/task-8-card-canvas-mind-map-layout.md`. Failure/regression: run `yarn test:e2e tests/e2e/card-canvas.spec.ts` and `yarn test:e2e tests/e2e/card-links.spec.ts`, asserting old hierarchy, delete cascade, and link behavior survive; Evidence same file.
  Commit: Y | test(card-canvas): cover mind-map layout interactions

- [ ] 9. Run final quality gates, file-size review, and browser QA evidence
  What to do / Must NOT do: Run all required repo gates and a real Playwright Chromium QA pass. Measure changed TypeScript/TSX file sizes using the programming skill's pure LOC rule; if `CardCanvasItem.tsx` grew substantially or new logic pushed a file beyond acceptable size, refactor into utilities/helpers before declaring done. Verify no product code uses `any`, non-null assertions, unsafe casts, enum mode values, or magic layout numbers. Must not claim completion from grep-only checks or subagent summaries.
  Parallelization: Wave 5 | Blocked by: Todo 8 | Blocks: Final verification
  References (executor has NO interview context - be exhaustive): `package.json` scripts; `tsconfig.json` strict flags; changed files from Todos 1-8; programming TypeScript discipline from loaded skill; frontend real-browser QA expectations.
  Acceptance criteria (agent-executable): `yarn typecheck`, `yarn lint`, `yarn build`, targeted E2E specs, and full `yarn test:e2e` pass. Evidence files include command invocation, exit status, and relevant output. Browser QA notes include selected parent, Popover toggle, serialized data before/after, drag parent, small/large child drag, resize parent/child, and link-mode non-interference.
  QA scenarios (name the exact tool + invocation): Happy: run `yarn typecheck && yarn lint && yarn build` then `yarn test:e2e` and record outputs; Evidence `.omo/evidence/task-9-card-canvas-mind-map-layout.md`. Failure: intentionally inspect changed files for prohibited patterns (`any`, `!`, magic `48` outside constants, parent-child connector selectors) using TypeScript/lint plus code review notes; fix before final verification; Evidence same file.
  Commit: N | final verification only; commit any fixes under the relevant prior commit scope

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results in the worker's final report; no manual user verification or extra interview is required to declare the implementation complete.

- [ ] F1. Plan compliance audit
  - Read this plan and the final diff. Verify every Must Have is implemented, every Must NOT Have is absent, and each todo's evidence file exists.
  - Reject if layout mode is global, render-only positions are used, free mode changed, parent-child connectors were added, or old containment expansion runs for mind-map parents.
- [ ] F2. Code quality review
  - Review changed TS/TSX for strict types, no `any`, no unsafe narrowing casts, no non-null assertions, no enum mode, no excessive `CardCanvasItem.tsx` growth, and no layout magic numbers outside named constants.
  - Reject if core layout logic is embedded in React render/effects instead of pure utilities.
- [ ] F3. Real browser QA
  - Use Playwright Chromium to exercise Demo end-to-end: external set-cards, select parent, toggle mode, attach/re-parent child, drag parent, small child drag snap-back, large child drag detach, parent resize, child resize, link mode.
  - Evidence must include screenshots or trace/video paths plus serialized card data observations.
- [ ] F4. Scope fidelity
  - Confirm no vertical layout, sibling ordering fields, auto viewport behavior, nested DOM coordinate wrapper, parent-child connector visuals, or package/tooling changes were introduced.

## Commit strategy

- Prefer small, reviewable commits matching todo boundaries:
  1. `feat(card-canvas): add child layout mode data contract`
  2. `feat(card-canvas): add horizontal mind-map layout utility`
  3. `feat(card-canvas): normalize mind-map layout on data changes`
  4. `feat(card-canvas): attach cards into mind-map parents`
  5. `feat(card-canvas): handle mind-map child detach gestures`
  6. `feat(card-canvas): reflow mind-map layout after resize`
  7. `feat(demo): add child layout mode popover control`
  8. `test(card-canvas): cover mind-map layout interactions`
- Do not commit `.omo/evidence/*` unless the repository convention already tracks evidence artifacts.
- Before any commit, inspect `git status`, `git diff`, and recent log; stage only intended source/test changes, never unrelated user changes.

## Success criteria

- Public card API supports per-parent child display mode through `childrenLayoutMode?: 'free' | 'mind-map-horizontal'`.
- Existing cards without `childrenLayoutMode` behave exactly as before.
- Demo Popover can switch a selected parent between free and horizontal mind-map mode.
- Mind-map children are persisted to absolute `x/y` coordinates to the right of the parent using the documented deterministic formula.
- Multi-level mind-map nesting works through each parent card's own mode.
- Sibling subtrees do not overlap and preserve configured gaps.
- Drag-to-parent interaction remains pointer-based and unchanged from the user's perspective.
- Mind-map attach/re-parent skips parent containment expansion and normalizes affected sibling groups.
- Dragging a mind-map parent moves every descendant by exactly the drag delta.
- Dragging a managed child less than the detach threshold snaps back; dragging at/above threshold detaches and preserves release coordinates; releasing over another parent re-parents.
- Parent and child resize reflow mind-map layouts by the documented formula while free-mode resize behavior is unchanged.
- Link mode and `linkedCardIds` connectors are not conflated with parent-child hierarchy.
- `yarn typecheck`, `yarn lint`, `yarn build`, targeted E2E specs, full `yarn test:e2e`, and browser QA all pass with evidence.
