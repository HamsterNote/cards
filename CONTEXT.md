# Cards 卡片画布

HamsterNote 的卡片画布组件包:在可缩放虚拟纸面上排布可拖拽、可连线、可嵌套的卡片。

## Language

**卡片 (Card)**:
画布上的基本单元,有标题 (title) 与正文 (content),可移动、缩放、链接、嵌套父子关系。

**headless 卡片 (Headless Card)**:
隐藏标题栏、只展示正文的卡片形态。开启时若正文为空,会把标题一次性写入正文;标题字段本身保留。
_Avoid_: 无头卡片、隐藏标题模式

**主题色 (Theme Accent)**:
画布级强调色,驱动 Popover、焦点环及 Line Mode 全部强调色。卡片自身的着色称为「卡片颜色」,与主题色是两个概念。
_Avoid_: 主题色与卡片颜色混用

**卡片颜色 (Card Theme Color)**:
单张卡片的着色,从画布提供的候选色板中选择,作用于标题栏底色与正文底色。
_Avoid_: 主题色

**Line Mode (链接模式)**:
一种交互模式:拖拽卡片不移动位置,而是在两张卡片之间建立链接。
_Avoid_: 连线模式、link 模式(口头)

**子卡布局 (Children Layout Mode)**:
父卡片对其子卡片的排布策略:free(自由)、mind-map-horizontal(横向导图)、arrange(自动整理)。

**父子连接线 (Parent-child Connector)**:
mind-map-horizontal 布局下父卡片与子卡片之间的实线连线,与普通链接的虚线 connector 是两种视觉。

**外部拖入会话 (External Card Drag-in Session)**:
一次从画布外部发起、绑定到单个鼠标、触摸或笔指针的卡片放置交互。会话携带一张候选卡片,进入画布后展示其放置预览,成功放置后该候选卡片成为画布中的卡片。
_Avoid_: 外部对象拖拽、HTML5 drag-and-drop

**候选卡片 (Candidate Card)**:
外部拖入会话中尚未成功放置的卡片。候选卡片可在画布内展示完整但不可交互的预览,不属于画布中的卡片,也不能作为其他卡片的父卡片。
_Avoid_: 临时卡片、幽灵卡片
