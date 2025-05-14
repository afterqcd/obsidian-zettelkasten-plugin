# Obsidian Zettelkasten Navigation

## 插件简介
本插件为 Obsidian 提供了主盒（Zettelkasten）卡片的分段数字ID管理、主卡自动生成、知识树可视化（Canvas）、主卡右键菜单等一站式增强功能。

---

## 主要功能

1. **主盒卡片分段数字ID自动生成**
   - 支持兄弟主卡、子主卡的自动编号与创建
   - 遵循主盒卡片分段数字ID规则

2. **主卡右键菜单增强**
   - 右键主卡可直接新建兄弟主卡、子主卡
   - 右键主卡可一键在 Canvas 中展示该主卡为根的知识树

3. **Canvas 知识树可视化**
   - 自动生成知识树 Canvas 文件，支持配置存储路径
   - Canvas 文件名自动采用根主卡属性值（如 alias）+“知识树”
   - Canvas 文件 meta 区域记录 rootCardId
   - 支持知识树分层紧凑布局（同层节点不重叠，跨分支可重叠，极大压缩空白）
   - 新建/删除主卡时自动同步更新相关知识树 Canvas

4. **主卡/Canvas标题属性显示**
   - 支持配置主卡和 Canvas 节点显示的属性（如 alias、tags）

5. **设置面板**
   - 支持主盒路径、显示属性、Canvas存储路径等多项配置

---

## 插件结构

- `main.ts`：插件主逻辑，包含主卡ID生成、Canvas操作、布局算法、事件监听等
- `settings.ts`：插件配置项及默认值
- `主盒卡片分段数字ID规则.md`：主盒ID规则说明文档

---

## Canvas 知识树分层紧凑布局算法

- 递归遍历知识树，收集每个节点的层级
- 每一层（level）所有节点在同一水平线上，绝不重叠
- 不同分支的节点可在垂直方向上部分重叠，极大压缩整体高度，减少空白
- 节点X坐标按树结构递增，Y坐标由层级和同层索引决定
- 自动生成父子节点之间的边

---

## 配置项说明

- **主盒路径**：主卡文件夹路径，所有主卡需放在此目录下
- **显示属性**：主卡和Canvas节点显示的frontmatter属性（如alias、tags）
- **启用主卡ID生成**：是否启用主卡自动编号
- **Canvas标题显示**：Canvas节点是否显示属性值
- **Canvas存储路径**：知识树Canvas文件的保存目录

---

## 优化建议与TODO

- 支持 Canvas 节点内容自定义渲染（如摘要、标签等）
- 支持 Canvas 边样式自定义（如虚线、箭头等）
- 支持 Canvas 节点拖拽后自动重新布局
- 支持知识树多根节点/多视图
- Canvas 性能优化（如大树异步渲染、节点懒加载）
- CSS/图片资源压缩与优化

---

## 致谢
- 参考了 [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin.git) 及 [PKM-er/obsidian-zettelkasten-navigation](https://github.com/PKM-er/obsidian-zettelkasten-navigation.git)

---

如有建议或需求，欢迎 issue 或 PR！ 