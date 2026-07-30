# 外部拖入卡片设计

## 1. 目标与边界

宿主可从 CardCanvas 外部的任意 DOM 元素发起一个外部拖入会话。绑定的鼠标、触摸或笔指针进入实际画布视口并移动后，画布显示一张完整但不可交互的候选卡片；主指针在有效画布区域内抬起时，候选卡片成为受控 `cards` 中的新卡片。

本功能不是 HTML5 drag-and-drop。宿主使用 `@system-ui-js/multi-drag` 创建并持有 `Drag`，CardCanvas 仅在活动会话期间读取并订阅该手势。第一版不提供键盘拖入替代操作，也不新增画布级 drop 回调。

## 2. 公共 API

`CardCanvas` 改为 `forwardRef` 组件，并从包入口导出以下类型：

```ts
import type { Drag } from '@system-ui-js/multi-drag';

export interface CardCanvasHandle {
  startExternalDrag(input: ExternalCardDragInput): ExternalCardDragStartResult;
}

export interface ExternalCardDragInput {
  card: CardCanvasCard;
  drag: Drag;
  anchor?: ExternalCardDragAnchor;
}

export interface ExternalCardDragAnchor {
  readonly x: number;
  readonly y: number;
}

export type ExternalCardDragStartRejectReason =
  | 'not-editable'
  | 'missing-on-cards-change'
  | 'invalid-anchor'
  | 'invalid-card'
  | 'duplicate-card-id'
  | 'drag-already-active'
  | 'missing-active-pointer';

export type ExternalCardDragStartResult =
  | { readonly ok: true; readonly session: ExternalCardDragSession }
  | {
      readonly ok: false;
      readonly reason: ExternalCardDragStartRejectReason;
    };

export interface ExternalCardDragSession {
  cancel(): void;
  readonly completion: Promise<ExternalCardDragCompletion>;
}

export type ExternalCardDragCancelReason =
  | 'cancelled-by-host'
  | 'pointer-cancelled'
  | 'released-outside-canvas'
  | 'canvas-unmounted'
  | 'card-id-conflict'
  | 'canvas-became-readonly';

export type ExternalCardDragCompletion =
  | { readonly status: 'placed'; readonly card: CardCanvasCard }
  | {
      readonly status: 'cancelled';
      readonly reason: ExternalCardDragCancelReason;
    };
```

`startExternalDrag` 的预期拒绝全部通过判别联合返回，不抛异常。`session.cancel(): void` 完全幂等：只有首次对活动会话调用时以 `cancelled-by-host` 结算；重复调用或会话已经结算时静默无操作。`completion` 永远只结算一次。

### 2.1 启动前置条件

启动时按以下优先级检查；若同时违反多个条件，返回首个原因：

1. `editable !== true`：`not-editable`。
2. 未提供 `onCardsChange`：`missing-on-cards-change`。
3. `anchor.x` 或 `anchor.y` 不是 `[0, 1]` 内的有限数：`invalid-anchor`。不做 clamp。
4. Card 的 `id` 不是非空字符串，或 `width` / `height` 不是大于 `0` 的有限数，或完整 Card 无法深拷贝：`invalid-card`。
5. Card ID 已存在于最新 `cards`，或已被任一活动候选卡片占用：`duplicate-card-id`。
6. 传入的同一 `Drag` 已绑定另一个活动会话：`drag-already-active`。
7. `drag.getFingers()` 中没有活动 Finger：`missing-active-pointer`。

除上述交互必需条件外，不复制一套完整 Card 运行时 schema。输入 `x`、`y` 和 `parent` 不校验，因为放置时必然重算；其他字段继续受 `CardCanvasCard` TypeScript 契约约束。

## 3. 数据快照与所有权

- 启动成功前，用 `structuredClone` 深拷贝完整 Card。嵌套的 `contentBlocks`、样式、链接和评论等都属于快照；宿主之后原地修改输入对象，不得影响预览或最终放置。
- 无法结构化克隆时同步返回 `invalid-card`，不得退化为浅拷贝。
- 仅 `x`、`y`、`parent` 在放置期间重算；标题、正文、尺寸、headless、卡片颜色、样式、`zIndex`、布局模式、链接、评论和 `lock` 均保留。
- 候选卡片不属于 `cards`，不能被选择、编辑、链接、调整尺寸或作为其他卡片的父卡片。
- `Drag` 始终归宿主持有。CardCanvas 只解绑自己的监听，不调用 `destroy()`、`setEnabled()`、`setDisabled()` 或 `setPassive()`。宿主销毁活动 Drag 前必须先调用 `session.cancel()`。

## 4. 会话与指针状态机

### 4.1 启动

宿主必须在 `DragOperationType.Start` 回调内调用 `startExternalDrag`。画布从 `drag.getFingers()` 的稳定顺序中锁定首个尚未结束的 Finger 及其 `pointerId`。同一 Drag 后续增加的触点全部忽略，不改变主指针。

启动参数不包含初始客户端坐标。成功启动后会话处于“等待移动”状态，在主指针发生首次 Move 前不显示预览；没有 Move 就 End 时按 `released-outside-canvas` 取消。

### 4.2 移动

会话只处理锁定 Finger 的 Move：

1. 从该 Finger 最新 Move 记录读取原始 PointerEvent 客户端坐标。
2. 判断该点是否位于实际画布视口，且顶部命中的 DOM 不属于工具栏、Popover、菜单、Dialog 或其他交互浮层。
3. 在有效区域内时计算画布坐标、候选卡片位置和父卡候选并显示预览；离开或被浮层遮挡时隐藏预览并清除该会话的父卡候选，但会话继续。
4. 指针可反复进出画布。候选卡片可部分越界；有效性只取决于主指针点。

### 4.3 结束

- 主指针 `pointercancel` 时立即以 `pointer-cancelled` 取消。
- 主指针 `pointerup` 时使用 End 记录中的最终客户端坐标重新命中画布并重新计算位置与父卡，不沿用最后一次 Move 的结果。
- 最终坐标无效、未发生过 Move、抬起点在画布外，或抬起点被交互浮层覆盖时，以 `released-outside-canvas` 取消。
- 主指针 End/Cancel 后立即结算，不等待 Drag 的 `AllEnd`，也不把会话转交给其他触点。
- 任何结算路径都必须先解绑该会话监听、移除预览和父卡候选，再 resolve completion。

### 4.4 画布生命周期

- 组件卸载时，所有活动会话以 `canvas-unmounted` 取消。
- 活动期间 `editable` 变为 false，或 `onCardsChange` 被移除时，所有活动会话立即以 `canvas-became-readonly` 取消。
- 启动后、放置提交前再次检查最新 `cards`。若候选 ID 此时已被宿主数据占用，以 `card-id-conflict` 取消，不覆盖也不改 ID。

## 5. 坐标、锚点与有效区域

CardCanvas 需要两个明确的 DOM 测量边界：

- **未变换的放置视口**：与用户实际看到的卡片画布区域一致，用 `getBoundingClientRect()` 判断客户端点是否在画布内。底部工具栏及所有交互浮层不属于有效区域。
- **参与虚拟纸张变换的卡片容器**：读取其客户端矩形左上角，并结合当前 `viewport.scale` 把客户端点换算到画布坐标：`canvasX = (clientX - containerRect.left) / scale`，Y 同理。该方式同时覆盖未启用虚拟纸张和已平移/缩放的情形。

默认锚点为 `{ x: 0.5, y: 0.5 }`。候选卡片左上角为：

```ts
const x = pointerCanvasX - card.width * anchor.x;
const y = pointerCanvasY - card.height * anchor.y;
```

预览渲染在参与虚拟纸张变换的卡片容器内，因此位置和尺寸随当前 viewport 一致缩放。预览层必须 `pointer-events: none`，不能干扰 `elementFromPoint` 命中。

## 6. 父卡判定与最终提交

- 每个活动会话以自己的主指针画布坐标独立调用现有父卡候选判定；候选集合只包含最新受控 `cards`，不包含任何活动候选卡片。
- 多个候选可以同时指向不同父卡。多个候选指向同一父卡时共享一份高亮；实现上应维护“父卡 ID -> 活动会话引用计数或集合”，不能用现有单值 `parentCandidateId` 覆盖彼此。
- 抬起时先把快照 Card 的 `x/y` 替换为最终锚点位置并移除输入 `parent`，追加到最新 `cardsRef.current` 末尾，再按最终指针点运行与现有卡片放置相同的父卡归属和布局规范化。
- 新卡片即使带 `lock: true`，仍须完成这次首次定位和父卡归属，然后以锁定状态加入。不得直接调用会因 `lock` 短路的现有移动完成路径。
- `free` 父卡沿用父容器扩展规则；`mind-map-horizontal` 沿用横向导图规范化；`arrange` 沿用 sibling 插入顺序与流式规范化。completion 中的 Card 必须是规范化后、与提交数组中同 ID 项完全一致的最终 Card。
- 多个会话近乎同时结束时按主指针 End 的实际处理顺序串行执行。既有 `commitCards` 必须先同步推进 `cardsRef.current` 再调用 `onCardsChange`，后一个结束处理基于该最新快照追加，避免丢失前一个放置。
- 成功放置只调用既有 `onCardsChange(nextCards)`，随后调用既有 `onSelect(placedCard.id)`（若提供），再以 `{ status: 'placed', card: placedCard }` 结算。不新增 `onExternalCardDrop`。
- `placed` 表示画布已生成结果并调用 `onCardsChange`，不表示受控宿主已经回写或持久化该数组。

## 7. 候选卡片预览

预览完整复用 Card 的标题、正文、尺寸、headless、卡片颜色和样式，并调用正式卡片相同的 `renderCardTitle` / `renderCardContent`。预览采用弱化视觉（例如降低透明度并使用虚线轮廓），同时满足：

- 根节点 `aria-hidden="true"`，不可聚焦，`pointer-events: none`；
- 不创建 `Drag`，不响应选择、编辑、链接或 resize；
- 不显示 Popover、菜单、评论入口、编辑器和缩放手柄；
- 自定义渲染器产生的按钮、链接或输入也不可交互；
- 若不透明自定义渲染器在内部创建 Portal，预览会仅隔离归属于该预览 React 子树的 Portal：其会立即 `hidden`、`inert`、`aria-hidden`，并阻断指针和键盘激活；普通渲染输出保留。Portal 节点由 React 在预览结算或取消时正常卸载，不影响无关宿主 Portal；
- 自定义渲染器抛错时沿用宿主现有 React Error Boundary，不在外部拖入层吞错。

## 8. Demo 设计

`src/demo/CardsDemo.tsx` 增加一个画布外部的可重复拖动卡片模板：

1. 模板 DOM 只创建一次宿主持有的 `Drag`，支持鼠标、触摸和笔。
2. 每次 Drag Start 生成带唯一 ID 的完整 `CardCanvasCard` 快照；模板本身不移动、不消失。
3. 根据主指针相对模板 `getBoundingClientRect()` 的按下位置计算归一化 anchor，并传给 `startExternalDrag({ card, drag, anchor })`。
4. 成功启动后保存 session；cleanup 严格按 `session.cancel()` 后 `drag.destroy()` 的顺序执行。
5. 展示最近一次同步启动拒绝或 completion 结果，包括 status、reason，以及成功 Card 的 ID 和最终坐标。
6. Demo 继续使用现有 `cards/setCards`、`selected/setSelected` 受控链路，不为外部拖入另建数据状态。

## 9. 验收场景

### 9.1 启动与校验

- 鼠标、单指触摸和笔均可从模板启动；首次 Move 进入画布后出现候选卡片。
- 没有 Move 就释放返回 `released-outside-canvas`，从未闪现预览。
- 非法 Card、非法 anchor、只读画布、缺失 `onCardsChange`、重复 ID、重复 Drag、无活动 Finger 分别返回约定的同步拒绝原因，且不留下监听或 DOM。
- 启动后修改输入 Card 的嵌套字段，预览和最终结果仍使用启动快照。

### 9.2 命中、坐标与预览

- 从模板四角和中心按下时，候选卡片保持对应相对锚点；不传 anchor 时中心跟随。
- 指针进出画布时预览反复显示/隐藏；在画布外释放取消，在画布内重新进入后释放可放置。
- 指针位于画布内但候选卡片部分越界时仍可放置。
- 在工具栏、Popover、菜单或 Dialog 上释放按画布外处理。
- 开启虚拟纸张并平移、缩放后，预览和最终卡片仍与指针对齐。
- 预览呈现自定义标题/正文、headless、卡片颜色和样式，但任何内部控件均不可操作。

### 9.3 数据、布局与并发

- 输入 `x/y/parent` 不影响结果；其他 Card 字段保留，新卡片追加到数组末尾并自动选中。
- 放到普通父卡、横向导图父卡和 arrange 父卡时，父卡高亮、归属和最终布局与现有卡片拖动规则一致。
- 带 `lock: true` 的候选卡片能完成首次放置，之后按现有锁定规则不可移动。
- 两个不同 Drag 可同时显示预览并分别放置或取消；相同候选 ID 或相同 Drag 的第二个会话被同步拒绝。
- 两个并行候选指向同一父卡时，该父卡持续高亮，直到最后一个候选离开或结算。
- 两个会话连续 End 时，两张卡片都保留，顺序与事件处理顺序一致。
- 会话期间宿主插入同 ID 卡片时，最终释放返回 `card-id-conflict`，宿主卡片不被覆盖。

### 9.4 取消与资源清理

- 首次调用 `cancel()` 后，`completion` 以 `cancelled-by-host` 结算；重复调用和放置后调用均无副作用。
- `pointercancel` 返回 `pointer-cancelled`；主指针结束后不等待其他触点，也不转交会话。
- `editable` 关闭或移除 `onCardsChange` 时，所有会话返回 `canvas-became-readonly`。
- CardCanvas 卸载时所有会话返回 `canvas-unmounted`。
- 每条拒绝、取消和成功路径都不残留 Drag/Finger 监听、预览或父卡高亮；CardCanvas 从不销毁宿主 Drag。

## 10. 实施落点

- `src/components/CardCanvas.tsx`：`forwardRef` 句柄、活动会话注册表、只读/卸载清理、视口命中、并行父卡高亮和预览渲染。
- `src/components/CardCanvas.css`：不可交互的候选卡片预览态。
- `src/utils/card-layout-interactions.ts` 或独立的外部放置工具：新增卡片首次定位、父卡归属和规范化；不能复用锁定卡片会短路的移动完成分支。
- `src/index.ts`：导出句柄、输入、会话、结果及原因类型。
- `src/demo/CardsDemo.tsx`：宿主持有 Drag 的可重复模板和结果面板。
- `tests/`：覆盖启动拒绝、鼠标/触摸、进出与最终 pointerup、虚拟纸张坐标、父子布局、并发、只读切换和资源清理。
