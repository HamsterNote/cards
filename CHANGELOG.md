# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-21

### Changed
- 版本号从 0.2.0 升级至 0.3.0，无代码变更

## [0.2.0] - 2026-07-20

### Added
- 新增 CardCanvas 组件，支持拖拽和调整大小
- 新增卡片层级结构，支持拖拽附加和级联删除
- 新增链接模式、基于指针的父级分组、弹出窗口及底部链接可见性
- 新增思维导图布局：水平布局工具、子卡片附加/分离、调整大小后重排、父子连接线
- 新增子布局模式契约和受控归一化
- 新增深色主题切换（CSS 变量）
- 新增 arrange 子布局模式作为默认模式
- 改进 Portal 弹出层的交互检测
- 新增演示页子布局模式弹出控制
- 使用 Button 组件初始化 React 组件库

### Fixed
- 修复深色主题对比度回归问题
- 移除不安全的 arrange 索引断言
- 修复嵌套 arrange 归一化的稳定性
- 修复重新父级化后子树保持在父级之上
- 修复拖拽选择副作用和样式导出问题
- 修复点击页脚链接按钮时选中链接目标卡片
- 为演示弹出层布局选择启用指针事件
- 修复思维导图托管子元素的双倍调整高度增量
- 卡片内容自动换行和标题点击选择修复

### Changed
- 重构 CardCanvas，提取子组件、选择选项和距离感知拖拽
- 增强 CardCanvas 自定义样式和改进调整大小逻辑
- 将思维导图的拖拽和调整大小辅助函数提取到工具模块

### Test
- 稳定思维导图分离断言的轮询测试
- 覆盖思维导图布局交互测试
