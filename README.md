# Zettelkasten Obsidian Plugin

## 项目目标

该插件旨在为 Obsidian 提供 Zettelkasten 方法的支持，包括主卡管理、ID 自动生成、知识树可视化等功能。

## 架构

### 核心模块
- `main.ts`: 插件主文件，负责插件的生命周期管理、事件监听和模块初始化
- `settings.ts`: 定义插件的设置接口和默认设置
- `types.ts` 和 `types.d.ts`: 定义插件使用的类型和接口

### 功能模块
- `modules/canvas-manager.ts`: 负责 Canvas 知识树的可视化和管理
- `modules/file-manager.ts`: 处理主卡文件的创建和管理
- `modules/ui-manager.ts`: 管理 UI 相关的功能，包括文件资源管理器的显示和排序
- `modules/settings-tab.ts`: 实现插件的设置界面
- `modules/id-generator.ts`: 处理主卡 ID 的生成逻辑

## 主要功能

1. **主卡管理**
   - 自动生成主卡 ID
   - 支持创建兄弟主卡和子主卡
   - 文件资源管理器中的主卡排序
   - 文件资源管理器中的主卡文件名下增加一行显示 ID

2. **知识树可视化**
   - 基于 Canvas 的知识树展示
   - 自动布局算法
   - 实时更新和同步

3. **用户界面增强**
   - 自定义文件资源管理器显示
   - 右键菜单增强
   - 设置面板

## 技术实现

- 使用 TypeScript 开发，确保类型安全
- 采用模块化设计，各功能模块职责明确
- 利用 Obsidian API 实现文件操作和 UI 交互
- 使用 Canvas API 实现知识树可视化

## 待办事项

### 性能优化
- [ ] 优化文件资源管理器的性能

## 贡献指南

欢迎提交 Issue 和 Pull Request！在提交 PR 时，请确保：

1. 代码符合项目规范
2. 添加必要的测试
3. 更新相关文档
4. 提供清晰的提交信息

## 致谢

- 参考了 [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin.git)
- 感谢所有贡献者的付出

---

如有建议或需求，欢迎 issue 或 PR！ 