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
- Card title inset: `8px 12px` normally and `0 12px` while an empty title
  is not being edited.
- Card content editor width: `min(720px, calc(100vw - 32px))`.
- Shared component themes: `light` and `dark`.
- Shared component accent: violet by default; hosts may pass a component-library
  preset or any CSS color through the public `themeColor` prop.
- Default card palette: blue `#60a5fa`, purple `#a78bfa`, green `#4ade80`,
  orange `#fb923c`, and rose `#fb7185`; hosts may replace the palette through
  the public color-options prop.
- A themed card uses the selected color on its header. Its body mixes 12% of
  that color with white in light mode and 18% with black in dark mode.
- Embedded note body spacing: `12px` on every edge.
- Card footer link-row height: `28px`.
- Layering: canvas controls render at `900`, below shared Popovers (`1000`) and
  Dialogs (`1100`), while remaining above cards and virtual-paper content.
- MiniMap default size: `200px × 150px`; edge offset and internal padding: `8px`;
  content bounds include `50px` breathing room; radius: `8px`; backdrop blur:
  `10px`; card-preview opacity: `78%`.

## 4. Component Rules

- The bottom toolbar is horizontal and contains add-card, link-mode, and MiniMap
  actions.
- The add action uses the shared `add` icon and an accessible text label.
- The link-mode action is a pressed-state button using the shared `link` icon.
  A successful link gesture turns the mode off; invalid drops leave it enabled.
- The MiniMap action is labelled “缩略图”, uses the shared `minimap` icon, and
  reports visibility as a pressed state. It is unavailable while virtual paper
  is disabled or when the host explicitly passes `minimap={false}`.
- A newly created card appears in the visible viewport, is selected, and moves
  keyboard focus to its title editor.
- Title input is mirrored to controlled card data while typing, so keeping a
  newly created card never depends on pressing Enter. Escape restores the
  value captured when that editing session received focus.
- Card creation accepts an empty title, empty content, or both, and those cards
  remain in controlled data after selection leaves them.
- An empty title bar uses the compact title inset while idle. Its title editor
  remains clickable across the available row and restores the normal inset
  while focused or receiving input.
- Card titles remain directly editable when editing is enabled; card bodies are
  read-only on the canvas and become editable only in the selected card's
  content Dialog. Double-clicking a card body opens that same Dialog, and the
  read-only body keeps the default cursor rather than suggesting a drag action.
- A card may persist `headless: true` to hide its title bar. Enabling headless
  mode copies a non-empty title into a blank body once, without clearing title.
- The selected-card Popover owns card color, headless mode, content editing,
  comments, and a child-layout submenu. Cards do not render a separate more
  button.
- Selected-card outlines and focus rings use the canvas Theme Accent, never the
  individual Card Theme Color.
- Content Dialog changes are local drafts until Save is chosen; Cancel, Escape,
  and backdrop dismissal leave the card unchanged.
- Canvas-level controls are hidden while the content Dialog is open so no
  background action can appear above or bypass the modal layer.
- Locked cards expose a locked state to the DOM and cannot be moved, resized, or
  deleted, including through recursive parent deletion.
- Outside Link mode, the whole non-interactive card surface is the movement
  handle. Card body text is deliberately non-selectable, while title editing,
  resize handles, links, and buttons remain independent controls.
- Link mode uses the whole card surface as the link-drag handle while keeping
  link-navigation controls usable. The card itself remains stationary.
- Each footer link is a compact `28px` row: navigation fills the available width
  and a shared `delete` icon button sits at the far edge. Deletion requires the
  shared danger confirmation and removes both sides of the relationship.
- Link labels display `空` when the linked card title is the empty string.
- Dashed links have a forgiving pointer hit area and a keyboard-focusable
  midpoint. Selecting either opens an anchored Popover with an icon-and-label delete
  action that removes both sides after shared danger confirmation.
- MiniMap is off by default and only renders with virtual paper enabled. The
  bottom action can enable the default configuration; hosts may control it with
  `minimap.enabled` and `onMiniMapChange`. Background clicks recenter the
  viewport, indicator drags pan continuously, and arrow keys pan by `40px`
  (`80px` with Shift).

## 5. Motion

Motion is functional only. Virtual-paper pan and zoom temporarily hide open card
Popovers while transforms update. Each movement resets a `160ms` debounce, and
the Popover returns at its recalculated anchor only after movement has stopped;
no detached overlay or decorative animation is introduced.

## 6. Responsive Behavior

The bottom action remains reachable at 375, 768, and 1280 px viewport widths.
Action labels are visible at 768 px and above; below 768 px, responsive actions
retain their icon and accessible name while hiding only the visual label. This
must not change canvas dimensions or introduce horizontal overflow.

- When the canvas itself is `520px` wide or narrower, a bottom-positioned
  MiniMap sits `64px` above the edge to avoid the centered bottom toolbar.

## 7. Accessibility

- The add action has an explicit accessible name.
- The link-mode action has an explicit accessible name and reports state with
  `aria-pressed`; footer delete actions name the linked card they affect.
- The “缩略图” action has an explicit accessible name and reports MiniMap
  visibility with `aria-pressed`.
- Connector midpoint controls name both linked cards and report selection with
  `aria-pressed`; every destructive trigger uses the shared `delete` icon.
- Programmatic title focus is visible and places the caret in the title editor.
- The selected-card Popover exposes a named content-edit action, and the content
  editor uses a labelled modal Dialog with explicit Cancel and Save actions.
- The compact footer delete action is `28px`; this deliberate dense-canvas target
  is an accepted exception to the preferred `44px` touch target.
- The selected-card Popover exposes the color palette as a named group; each
  swatch has a color name and reports its selected state with `aria-pressed`.
- Locked state is represented with `aria-disabled` where an action remains
  visible, and destructive controls are disabled.
- MiniMap is keyboard-focusable, has an explicit accessible name and visible
  Theme Accent focus ring, and supports four-direction arrow-key navigation.

## 8. Accepted Debt

The existing canvas modules predate this contract and exceed the preferred
module-size budget. This change avoids a broad unrelated refactor and keeps new
toolbar behavior isolated at the canvas boundary.
