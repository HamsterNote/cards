# 外部拖入由宿主持有 Drag，画布临时订阅其手势

外部拖入会话的公共 API 直接接收宿主创建的 `@system-ui-js/multi-drag` `Drag` 实例。宿主在外部来源元素上启动手势，`CardCanvas` 从该实例锁定首个活动指针并只在会话期间订阅后续移动与结束；会话结束后画布仅解绑自己的监听，不启停或销毁 `Drag`。

## Considered Options

- **向画布传入起始 `PointerEvent`**：API 与手势库解耦，但 `Drag` 不公开注入已发生 PointerEvent 的能力，画布无法接管宿主来源元素上已经开始的同一手势。被否。
- **画布内部使用 `GestureController`**：可以注入标准化指针输入，但需要画布自行桥接 document 级 PointerEvent，并重复承担第三方 `Drag` 已提供的鼠标、触摸和笔生命周期管理。被否。
- **宿主创建并传入 `Drag`**：保留既有手势能力，也让宿主决定外部来源元素和生命周期。接受公共类型对该依赖的耦合。

## Consequences

- `@system-ui-js/multi-drag` 成为外部拖入公共契约的一部分；替换该库需要迁移调用方。
- 同一个 `Drag` 同时只能绑定一个活动的外部拖入会话，但不同 `Drag` 可以并行拖入。
- `Drag` 始终归宿主持有。宿主要销毁仍在使用的 `Drag` 时，必须先调用会话的幂等 `cancel()`，再调用 `drag.destroy()`。
- 画布卸载或变为只读时会取消自己的会话，但不会销毁宿主的 `Drag`。
