# Cards Design Contract

## 1. Product Intent

`CardCanvas` is an operational writing surface. Cards remain the visual focus;
canvas controls stay quiet, compact, and available without obscuring content.

## 2. Reference

The bottom control model follows `@hamster-note/painting`:

- attach the toolbar to the nearest positioned canvas wrapper;
- keep it 16 px from the bottom edge;
- reuse `@hamster-note/components` Popover, Button, and Icon primitives;
- keep actions stable in place rather than shifting the canvas layout.

## 3. Tokens

- Toolbar edge offset: `16px`.
- Card creation size: `180px × 120px`.
- Card content editor width: `min(720px, calc(100vw - 32px))`.
- Shared component themes: `light` and `dark`.
- Shared component accent: violet by default; hosts may pass a component-library
  preset or any CSS color through the public `themeColor` prop.
- Default card palette: blue `#3b82f6`, purple `#8b5cf6`, green `#16a34a`,
  orange `#ea580c`, and rose `#e11d48`; hosts may replace the palette through
  the public color-options prop.
- A themed card uses the selected color on its header. Its body mixes 12% of
  that color with white in light mode and 18% with black in dark mode.
- Embedded note body spacing: `12px` on every edge.
- Layering: canvas controls render at `900`, below shared Popovers (`1000`) and
  Dialogs (`1100`), while remaining above cards and virtual-paper content.

## 4. Component Rules

- The bottom toolbar is horizontal and contains add-card and link-mode actions.
- The add action uses the shared `add` icon and an accessible text label.
- The link-mode action is a pressed-state button using the shared `link` icon.
  A successful link gesture turns the mode off; invalid drops leave it enabled.
- A newly created card appears in the visible viewport, is selected, and moves
  keyboard focus to its title editor.
- A newly created card that remains empty is discarded when selection leaves it.
- Card titles remain directly editable when editing is enabled; card bodies are
  read-only on the canvas and become editable only in the selected card's
  content Dialog.
- Content Dialog changes are local drafts until Save is chosen; Cancel, Escape,
  and backdrop dismissal leave the card unchanged.
- Canvas-level controls are hidden while the content Dialog is open so no
  background action can appear above or bypass the modal layer.
- Locked cards expose a locked state to the DOM and cannot be moved, resized, or
  deleted, including through recursive parent deletion.
- Outside Link mode, the card header is the sole movement handle. Body text and
  embedded controls never initiate card movement.
- Link mode uses the whole card surface as the link-drag handle while keeping
  link-navigation controls usable. The card itself remains stationary.
- Each footer link is one row: navigation fills the available width and a
  shared `delete` icon button sits at the far edge. Deletion requires the
  shared danger confirmation and removes both sides of the relationship.
- Dashed links have a forgiving pointer hit area and a keyboard-focusable
  midpoint. Selecting either opens an anchored Popover with an icon-only delete
  action that removes both sides after shared danger confirmation.

## 5. Motion

Motion is functional only. Virtual-paper pan and zoom move cards and hide open
card Popovers so detached overlays never remain on screen; no decorative
animation is introduced.

## 6. Responsive Behavior

The bottom action remains reachable at 375, 768, and 1280 px viewport widths.
It must not change canvas dimensions or introduce horizontal overflow.

## 7. Accessibility

- The add action has an explicit accessible name.
- The link-mode action has an explicit accessible name and reports state with
  `aria-pressed`; footer delete actions name the linked card they affect.
- Connector midpoint controls name both linked cards and report selection with
  `aria-pressed`; every destructive trigger uses the shared `delete` icon.
- Programmatic title focus is visible and places the caret in the title editor.
- The selected-card Popover exposes a named content-edit action, and the content
  editor uses a labelled modal Dialog with explicit Cancel and Save actions.
- The selected-card Popover exposes the color palette as a named group; each
  swatch has a color name and reports its selected state with `aria-pressed`.
- Locked state is represented with `aria-disabled` where an action remains
  visible, and destructive controls are disabled.

## 8. Accepted Debt

The existing canvas modules predate this contract and exceed the preferred
module-size budget. This change avoids a broad unrelated refactor and keeps new
toolbar behavior isolated at the canvas boundary.
