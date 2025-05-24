import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder, Menu, Notice, WorkspaceLeaf } from 'obsidian';
import { ZettelkastenSettings, DEFAULT_SETTINGS } from './settings';

// Canvas 相关的类型定义
interface CanvasData {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    meta?: {
        rootCardId?: string;
    };
}

interface CanvasNode {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    [key: string]: any;
}

interface CanvasEdge {
    id: string;
    fromNode: string;
    toNode: string;
    fromSide: string;
    toSide: string;
    color?: string; // 添加可选的颜色属性
}

// 新增：主卡 ID 生成相关的工具函数
class MainCardIdGenerator {
    // 解析主卡 ID 的各个部分
    static parseId(id: string | number): number[] {
        // 如果是数字类型，直接返回包含该数字的数组
        if (typeof id === 'number') {
            return [id];
        }
        // 如果是字符串类型，按 '-' 分割并转换为数字
        return id.split('-').map(part => parseInt(part));
    }

    // 生成新的兄弟主卡 ID
    static generateSiblingId(currentId: string, nextId: string | null): string {
        const currentParts = this.parseId(currentId);
        if (!nextId) {
            // 如果没有下一个兄弟，在当前 ID 的最后一个数字上加 10
            const lastPart = currentParts[currentParts.length - 1];
            currentParts[currentParts.length - 1] = lastPart + 10;
            return currentParts.join('-');
        }
        
        const nextParts = this.parseId(nextId);
        // 确保两个 ID 的层级相同
        if (currentParts.length !== nextParts.length) {
            throw new Error('当前主卡和下一个主卡的层级不同');
        }

        // 计算新 ID
        const lastPart = Math.floor((currentParts[currentParts.length - 1] + nextParts[nextParts.length - 1]) / 2);
        currentParts[currentParts.length - 1] = lastPart;
        return currentParts.join('-');
    }

    // 生成新的子主卡 ID
    static generateChildId(parentId: string, firstChildId: string | null): string {
        if (!firstChildId) {
            return parentId + '-10';
        }
        
        const parentParts = this.parseId(parentId);
        const childParts = this.parseId(firstChildId);
        
        // 确保子主卡确实是当前主卡的子主卡
        if (childParts.length !== parentParts.length + 1) {
            console.error('[ZK] 子主卡层级不正确', { parentParts, childParts });
            throw new Error('子主卡层级不正确');
        }
        // 取"0"和第一个子主卡编号的中间值
        const newChildId = Math.floor(childParts[childParts.length - 1] / 2);
        return parentId + '-' + newChildId;
    }
}

export default class ZettelkastenPlugin extends Plugin {
    settings: ZettelkastenSettings;
    private canvasObservers: MutationObserver[] = [];

    // 新增：Canvas 相关的工具函数
    private async getCanvasData(file: TFile): Promise<CanvasData> {
        const content = await this.app.vault.read(file);
        return JSON.parse(content);
    }

    private async saveCanvasData(file: TFile, data: CanvasData): Promise<void> {
        await this.app.vault.modify(file, JSON.stringify(data, null, 2));
    }

    private async getCanvasRootCardId(file: TFile): Promise<string | undefined> {
        const data = await this.getCanvasData(file);
        return data.meta?.rootCardId;
    }

    private async setCanvasRootCardId(file: TFile, rootCardId: string): Promise<void> {
        const data = await this.getCanvasData(file);
        if (!data.meta) {
            data.meta = {};
        }
        data.meta.rootCardId = rootCardId;
        await this.saveCanvasData(file, data);
    }

    // 新增：获取主卡的显示名称
    private async getCardDisplayName(file: TFile): Promise<string> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        if (frontmatter) {
            for (const prop of this.settings.displayProperties) {
                if (frontmatter[prop]) {
                    return frontmatter[prop];
                }
            }
        }
        return file.basename;
    }

    // 新增：计算节点布局位置
    private calculateNodePositions(relatedCards: TFile[], rootCardId: string): { nodes: CanvasNode[], edges: CanvasEdge[] } {
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        // 布局参数
        const LEVEL_WIDTH = 720;
        const NODE_HEIGHT = 300;
        const NODE_WIDTH = 480;
        const MIN_VERTICAL_GAP = 55;

        // 1. 构建树结构
        interface TreeNode {
            id: string;
            file: TFile;
            children: TreeNode[];
            parent: TreeNode | null;
            level: number;
            x: number;
            y: number;
        }
        const nodeMapById = new Map<string, TreeNode>();
        function buildTree(cardId: string, file: TFile, parent: TreeNode | null, level: number): TreeNode {
            const node: TreeNode = {
                id: cardId,
                file,
                children: [],
                parent,
                level,
                x: level * LEVEL_WIDTH,
                y: 0
            };
            nodeMapById.set(cardId, node);
            // 查找所有直接子节点
            const childCards = relatedCards.filter(card => {
                const parts = card.basename.split('-');
                return parts.length === level + rootCardId.split('-').length + 1 &&
                       card.basename.startsWith(cardId + '-');
            });
            node.children = childCards
                .map(card => buildTree(card.basename, card, node, level + 1))
                .sort((a, b) => a.id.localeCompare(b.id));
            return node;
        }
        const rootFile = relatedCards.find(card => card.basename === rootCardId);
        if (!rootFile) return { nodes: [], edges: [] };
        const root = buildTree(rootCardId, rootFile, null, 0);

        // 2. 紧凑树形布局算法：同层节点紧凑排列，分支可重叠，父节点居中
        const nextYByLevel: number[] = [];
        function layoutTree(node: TreeNode, level: number) {

            if (nextYByLevel[level] === undefined) {
                nextYByLevel[level] = 0;
            }

            if (node.children.length === 0) {
                node.y = nextYByLevel[level];
                nextYByLevel[level] += NODE_HEIGHT + MIN_VERTICAL_GAP;
            } else {
                for (const child of node.children) {
                    layoutTree(child, level + 1);
                }
                const minY = Math.min(...node.children.map(c => c.y));
                const maxY = Math.max(...node.children.map(c => c.y));
                node.y = (minY + maxY) / 2;
                if (node.y < nextYByLevel[level]) { // 如果需要下移节点，则下移所有子孙节点
                    const yOffset = nextYByLevel[level] - node.y;
                    function shiftChildren(children: TreeNode[], level: number, yOffset: number) {
                        for (const child of children) {
                            child.y += yOffset;
                            if (child.children.length > 0) {
                                shiftChildren(child.children, level + 1, yOffset);
                            }
                        }
                        nextYByLevel[level] += yOffset;
                    }
                    shiftChildren(node.children, level+1, yOffset);
                    node.y = nextYByLevel[level];
                }
                nextYByLevel[level] = Math.max(nextYByLevel[level], node.y + NODE_HEIGHT + MIN_VERTICAL_GAP);
            }
        }
        layoutTree(root, 0);

        // 3. 生成节点和边
        nodeMapById.forEach((node, id) => {
            nodes.push({
                id: node.id,
                type: "file",
                file: node.file.path,
                x: node.x,
                y: node.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT
            });
            node.children.forEach(child => {
                edges.push({
                    id: `edge-${node.id}-${child.id}`,
                    fromNode: node.id,
                    toNode: child.id,
                    fromSide: "right",
                    toSide: "left"
                });
            });
        });
        return { nodes, edges };
    }

    // 修改：创建知识树 Canvas
    private async createKnowledgeTreeCanvas(rootFile: TFile): Promise<void> {
        // 确保 Canvas 目录存在
        const canvasFolder = this.app.vault.getAbstractFileByPath(this.settings.canvasPath);
        if (!canvasFolder) {
            await this.app.vault.createFolder(this.settings.canvasPath);
        }

        // 获取根主卡的显示名称
        const displayName = await this.getCardDisplayName(rootFile);

        // 创建 Canvas 文件
        const canvasFileName = `${displayName}知识树.canvas`;
        const canvasPath = `${this.settings.canvasPath}/${canvasFileName}`;
        
        // 检查文件是否已存在
        const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);
        if (existingFile) {
            throw new Error('知识树 Canvas 已存在');
        }

        const canvasFile = await this.app.vault.create(canvasPath, JSON.stringify({
            nodes: [
                {
                    id: "root",
                    type: "file",
                    file: rootFile.path,
                    x: 0,
                    y: 0,
                    width: 400,
                    height: 400
                }
            ],
            edges: [],
            meta: {
                rootCardId: rootFile.basename
            }
        }, null, 2));

        // 打开新创建的 Canvas
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(canvasFile);

        // 更新 Canvas 显示
        await this.updateKnowledgeTreeCanvas(canvasFile);
    }

    // 修改：更新知识树 Canvas
    private async updateKnowledgeTreeCanvas(canvasFile: TFile): Promise<void> {
        const data = await this.getCanvasData(canvasFile);
        const rootCardId = data.meta?.rootCardId;
        if (!rootCardId) return;

        // 获取所有相关主卡
        const allCards = await this.getSortedMainCards();
        const relatedCards = allCards.filter(card => 
            card.basename === rootCardId || 
            card.basename.startsWith(rootCardId + '-')
        );

        // 计算节点布局
        const { nodes, edges } = this.calculateNodePositions(relatedCards, rootCardId);

        // 更新 Canvas 数据
        data.nodes = nodes;
        data.edges = edges;
        await this.saveCanvasData(canvasFile, data);
    }

    // 新增：检查并更新所有知识树 Canvas
    private async updateAllKnowledgeTrees(newCard: TFile): Promise<void> {
        const canvasFolder = this.app.vault.getAbstractFileByPath(this.settings.canvasPath);
        if (!(canvasFolder instanceof TFolder)) return;

        for (const file of canvasFolder.children) {
            if (!(file instanceof TFile) || !file.extension.endsWith('canvas')) continue;

            const rootCardId = await this.getCanvasRootCardId(file);
            if (!rootCardId) continue;

            if (newCard.basename === rootCardId || newCard.basename.startsWith(rootCardId + '-')) {
                await this.updateKnowledgeTreeCanvas(file);
            }
        }
    }

    // 新增：从知识树中移除节点
    private async removeNodeFromKnowledgeTree(canvasFile: TFile, nodeId: string): Promise<void> {
        const data = await this.getCanvasData(canvasFile);
        
        // 移除节点
        data.nodes = data.nodes.filter(node => node.id !== nodeId);
        
        // 移除相关的边
        data.edges = data.edges.filter(edge => 
            edge.fromNode !== nodeId && edge.toNode !== nodeId
        );
        
        await this.saveCanvasData(canvasFile, data);
    }

    // 新增：检查并更新所有知识树 Canvas（删除节点）
    private async updateAllKnowledgeTreesOnDelete(deletedFile: TFile): Promise<void> {
        const canvasFolder = this.app.vault.getAbstractFileByPath(this.settings.canvasPath);
        if (!(canvasFolder instanceof TFolder)) return;

        for (const file of canvasFolder.children) {
            if (!(file instanceof TFile) || !file.extension.endsWith('canvas')) continue;

            const rootCardId = await this.getCanvasRootCardId(file);
            if (!rootCardId) continue;

            // 如果删除的是根节点，提示用户
            if (deletedFile.basename === rootCardId) {
                new Notice(`警告：已删除知识树"${file.basename}"的根节点`);
                continue;
            }

            // 如果删除的是子节点，从知识树中移除
            if (deletedFile.basename.startsWith(rootCardId + '-')) {
                await this.removeNodeFromKnowledgeTree(file, deletedFile.basename);
                // 重新布局剩余节点
                await this.updateKnowledgeTreeCanvas(file);
            }
        }
    }

    public updateExplorerTitles() {
        const mainBoxFolder = this.app.vault.getAbstractFileByPath(this.settings.mainBoxPath);
        if (!(mainBoxFolder instanceof TFolder)) return;

        // 获取所有文件资源管理器实例
        const explorers = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
        if (explorers.length === 0) return;

        explorers.forEach(explorer => {
            const mainBoxEl = explorer.querySelector(`[data-path="${this.settings.mainBoxPath}"]`);
            if (!mainBoxEl) return;

            // 获取主盒文件夹的展开状态
            const isExpanded = mainBoxEl.classList.contains('is-collapsed') === false;
            if (!isExpanded) return;

            const childrenContainer = mainBoxEl.nextElementSibling;
            if (!childrenContainer) return;

            const fileElements = Array.from(childrenContainer.querySelectorAll('.nav-file'));
            // 只更新内容，不调整顺序
            fileElements.forEach((el: Element) => {
                const titleDiv = el.querySelector('.nav-file-title');
                if (!titleDiv) return;
                const path = titleDiv.getAttribute('data-path');
                const titleEl = el.querySelector('.nav-file-title-content');
                if (!titleEl) return;
                if (!path || !path.startsWith(this.settings.mainBoxPath)) return;
                const file = this.app.vault.getAbstractFileByPath(path);
                if (!(file instanceof TFile)) return;
                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;

                // 创建新的标题容器
                const titleContainer = document.createElement('div');
                titleContainer.className = 'zk-title-container';

                // 添加文件名
                const fileNameEl = document.createElement('div');
                fileNameEl.className = 'zk-file-name';
                fileNameEl.textContent = file.basename;
                titleContainer.appendChild(fileNameEl);

                // 添加属性值
                if (frontmatter) {
                    for (const prop of this.settings.displayProperties) {
                        if (frontmatter[prop]) {
                            const propEl = document.createElement('div');
                            propEl.className = 'zk-property-value';
                            propEl.textContent = frontmatter[prop];
                            titleContainer.appendChild(propEl);
                            break;
                        }
                    }
                }

                // 清空原有内容并添加新容器
                titleEl.innerHTML = '';
                titleEl.appendChild(titleContainer);
            });
        });
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new ZettelkastenSettingTab(this.app, this));
        this.attachObserversToAllCanvases();

        // 监听 Obsidian 面板和布局变化
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.attachObserversToAllCanvases();
            this.updateExplorerTitles();
        }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.attachObserversToAllCanvases();
            this.updateExplorerTitles();
        }));

        // 监听元数据和文件变动
        this.registerEvent(this.app.metadataCache.on('changed', () => {
            this.updateExplorerTitles();
        }));
        this.registerEvent(this.app.vault.on('rename', () => {
            this.updateExplorerTitles();
        }));
        this.registerEvent(this.app.vault.on('delete', () => {
            this.updateExplorerTitles();
        }));
        this.registerEvent(this.app.vault.on('create', () => {
            this.updateExplorerTitles();
        }));

        // 新增：监听文件资源管理器的展开/折叠事件
        this.registerEvent(
            this.app.workspace.on('file-explorer:folder-open' as any, () => {
                this.updateExplorerTitles();
            })
        );

        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                this.patchMainBoxFileItemSortWithRetry();
            })
        );

        // 修改：等待布局完全加载后再更新标题
        this.app.workspace.onLayoutReady(() => {
            this.updateExplorerTitles();
            this.patchMainBoxFileItemSortWithRetry();
        });

        // 新增：监听文件创建事件，自动更新知识树
        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (!(file instanceof TFile)) return;
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                await this.updateAllKnowledgeTrees(file);
            })
        );

        // 新增：监听文件删除事件
        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                if (!(file instanceof TFile)) return;
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                await this.updateAllKnowledgeTreesOnDelete(file);
            })
        );

        // 新增：右键菜单项 - 在 Canvas 中展示知识树
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                
                menu.addItem((item) => {
                    item
                        .setTitle('在 Canvas 中展示知识树')
                        .setIcon('diagram-tree')
                        .onClick(async () => {
                            try {
                                await this.createKnowledgeTreeCanvas(file);
                            } catch (error) {
                                new Notice('创建知识树 Canvas 失败：' + error.message);
                            }
                        });
                });
            })
        );

        // 新增：注册右键菜单
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
                if (!this.settings.enableMainCardIdGeneration) return;
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                
                // 添加新建兄弟主卡选项
                menu.addItem((item) => {
                    item
                        .setTitle('新建兄弟主卡')
                        .setIcon('plus')
                        .onClick(async () => {
                            try {
                                await this.createNewSiblingCard(file);
                            } catch (error) {
                                new Notice('创建兄弟主卡失败：' + error.message);
                            }
                        });
                });

                // 添加新建子主卡选项
                menu.addItem((item) => {
                    item
                        .setTitle('新建子主卡')
                        .setIcon('plus')
                        .onClick(async () => {
                            try {
                                await this.createNewChildCard(file);
                            } catch (error) {
                                new Notice('创建子主卡失败：' + error.message);
                            }
                        });
                });
            })
        );

        this.app.workspace.onLayoutReady(() => {
            this.patchMainBoxFileItemSortWithRetry();
        });
        this.registerEvent(this.app.vault.on('create', () => this.patchMainBoxFileItemSortWithRetry()));
        this.registerEvent(this.app.vault.on('delete', () => this.patchMainBoxFileItemSortWithRetry()));
        this.registerEvent(this.app.vault.on('rename', () => this.patchMainBoxFileItemSortWithRetry()));
        this.registerEvent(this.app.metadataCache.on('changed', () => this.patchMainBoxFileItemSortWithRetry()));
    }

    onunload() {
        this.detachAllCanvasObservers();  // 新增：清理 Canvas 观察者
    }

    private detachAllCanvasObservers() {
        this.canvasObservers.forEach(observer => observer.disconnect());
        this.canvasObservers = [];
    }

    // 新增：附加所有 Canvas 观察者
    private attachObserversToAllCanvases() {
        this.detachAllCanvasObservers();
        const canvases = this.app.workspace.getLeavesOfType('canvas');
        canvases.forEach(leaf => {
            this.setupCanvasObserver(leaf);
        });
    }

    // 新增：设置单个 Canvas 观察者
    private setupCanvasObserver(leaf: WorkspaceLeaf) {
        const canvas = (leaf.view as any).canvas;
        if (!canvas) return;

        // 获取 Canvas 的容器元素
        const containerEl = (leaf as any).containerEl?.querySelector('.canvas-wrapper');
        if (!containerEl) {
            console.error('[ZK] Canvas wrapper element not found');
            return;
        }

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 新增：获取主卡的 ID
    private async getCardId(file: TFile): Promise<string> {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        if (frontmatter && frontmatter[this.settings.idProperty]) {
            return frontmatter[this.settings.idProperty];
        }
        return file.basename;
    }

    // 修改：创建新的兄弟主卡
    private async createNewSiblingCard(currentFile: TFile) {
        const files = await this.getSortedMainCards();
        const currentId = await this.getCardId(currentFile);
        const currentParts = MainCardIdGenerator.parseId(currentId);
        const siblingLevel = currentParts.length;
        const parentPrefix = currentParts.slice(0, -1).join('-');

        // 过滤出同一父级下的兄弟主卡（分段数相同，前缀一致）
        const siblingFiles = await Promise.all(files.map(async f => ({
            file: f,
            id: await this.getCardId(f)
        })));

        const filteredSiblings = siblingFiles.filter(({ id }) => {
            const parts = MainCardIdGenerator.parseId(id);
            if (parts.length !== siblingLevel) return false;
            if (siblingLevel === 1) return true; // 顶层主卡没有父级
            return parts.slice(0, -1).join('-') === parentPrefix;
        }).sort((a, b) => {
            // 按最后一段编号的数值大小排序
            const aParts = MainCardIdGenerator.parseId(a.id);
            const bParts = MainCardIdGenerator.parseId(b.id);
            return aParts[aParts.length - 1] - bParts[bParts.length - 1];
        });

        // 找到当前主卡在兄弟主卡中的位置
        const currentSiblingIndex = filteredSiblings.findIndex(({ file }) => file.path === currentFile.path);
        if (currentSiblingIndex === -1) throw new Error('找不到当前主卡');
        const nextSiblingFile = filteredSiblings[currentSiblingIndex + 1];

        const newId = MainCardIdGenerator.generateSiblingId(
            currentId,
            nextSiblingFile ? nextSiblingFile.id : null
        );

        const parent = currentFile.parent;
        if (!parent) throw new Error('无法获取父文件夹');
        await this.createNewMainCard(newId, parent);
    }

    // 修改：创建新的子主卡
    private async createNewChildCard(parentFile: TFile) {
        const files = await this.getSortedMainCards();
        const parentId = await this.getCardId(parentFile);
        const parentIndex = files.findIndex(f => f.path === parentFile.path);
        if (parentIndex === -1) throw new Error('找不到父主卡');

        // 获取所有子主卡
        const childFiles = await Promise.all(files.map(async f => ({
            file: f,
            id: await this.getCardId(f)
        })));

        // 查找所有子主卡，按编号数值排序，取最小编号的那个
        const filteredChildren = childFiles.filter(({ id }, index) =>
            index > parentIndex &&
            id.startsWith(parentId + '-')
        );

        let firstChildFile = null;
        if (filteredChildren.length > 0) {
            filteredChildren.sort((a, b) => {
                const aParts = MainCardIdGenerator.parseId(a.id);
                const bParts = MainCardIdGenerator.parseId(b.id);
                return aParts[aParts.length - 1] - bParts[bParts.length - 1];
            });
            firstChildFile = filteredChildren[0];
        }

        const newId = MainCardIdGenerator.generateChildId(
            parentId,
            firstChildFile ? firstChildFile.id : null
        );

        const parent = parentFile.parent;
        if (!parent) throw new Error('无法获取父文件夹');
        await this.createNewMainCard(newId, parent);
    }

    // 修改：创建新的主卡文件
    private async createNewMainCard(id: string, parent: TFolder) {
        const path = parent.path + '/' + id + '.md';
        await this.app.vault.create(path, '');
        new Notice(`已创建新主卡：${id}`);
    }

    // 只 patch 主盒文件夹的 fileItem.sort 方法，直接操作 vChildren._children
    patchMainBoxFileItemSort() {
        const leaves = this.app.workspace.getLeavesOfType('file-explorer');
        if (leaves.length === 0) return;
        const view = (leaves[0] as any).view;
        if (!view.fileItems) return;
        const item = view.fileItems[this.settings.mainBoxPath];
        if (
            item &&
            typeof item.sort === 'function' &&
            !item.sort._zettelkastenPatched &&
            item.file &&
            item.file.path === this.settings.mainBoxPath &&
            item.vChildren &&
            Array.isArray(item.vChildren._children)
        ) {
            const plugin = this;
            const originalSort = item.sort;
            item.sort = function (...args: any[]) {
                // 先调用原始排序，保证结构完整
                const result = originalSort.apply(this, args);
                // 然后对 vChildren._children 进行自定义排序
                this.vChildren._children.sort((a: any, b: any) => {
                    if (a.file instanceof TFile && b.file instanceof TFile) {
                        const cacheA = plugin.app.metadataCache.getFileCache(a.file);
                        const cacheB = plugin.app.metadataCache.getFileCache(b.file);
                        const aliasA = String(cacheA?.frontmatter?.[plugin.settings.sortByProperty] ?? a.file.basename);
                        const aliasB = String(cacheB?.frontmatter?.[plugin.settings.sortByProperty] ?? b.file.basename);
                        const cmp = aliasA.localeCompare(aliasB, 'zh-CN');
                        return plugin.settings.sortOrder === 'asc' ? cmp : -cmp;
                    }
                    return 0;
                });
                return result;
            };
            item.sort._zettelkastenPatched = true;
        }
    }

    // 延迟重试 patch，确保 fileItem 渲染后再 patch
    patchMainBoxFileItemSortWithRetry(retry = 5, delay = 100) {
        const leaves = this.app.workspace.getLeavesOfType('file-explorer');
        if (leaves.length === 0) return;
        const view = (leaves[0] as any).view;
        if (!view.fileItems) {
            if (retry > 0) setTimeout(() => this.patchMainBoxFileItemSortWithRetry(retry - 1, delay), delay);
            return;
        }
        const item = view.fileItems[this.settings.mainBoxPath];
        if (!item) {
            if (retry > 0) setTimeout(() => this.patchMainBoxFileItemSortWithRetry(retry - 1, delay), delay);
            return;
        }
        // 调用原有 patch 逻辑
        this.patchMainBoxFileItemSort();
    }

    // 新增：获取排序后的主卡列表
    private async getSortedMainCards(): Promise<TFile[]> {
        const folder = this.app.vault.getAbstractFileByPath(this.settings.mainBoxPath);
        if (!(folder instanceof TFolder)) throw new Error('主盒路径无效');

        const files = folder.children.filter((f): f is TFile => f instanceof TFile);
        return files.sort((a, b) => a.basename.localeCompare(b.basename));
    }
}

class ZettelkastenSettingTab extends PluginSettingTab {
    plugin: ZettelkastenPlugin;

    constructor(app: App, plugin: ZettelkastenPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Zettelkasten 设置' });

        new Setting(containerEl)
            .setName('主盒路径')
            .setDesc('指定主盒文件夹的路径')
            .addText(text => text
                .setPlaceholder('输入文件夹路径')
                .setValue(this.plugin.settings.mainBoxPath)
                .onChange(async (value) => {
                    this.plugin.settings.mainBoxPath = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateExplorerTitles();
                }));

        new Setting(containerEl)
            .setName('显示属性')
            .setDesc('要显示的笔记属性，用逗号分隔')
            .addText(text => text
                .setPlaceholder('alias,tags')
                .setValue(this.plugin.settings.displayProperties.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.displayProperties = value.split(',').map(p => p.trim());
                    await this.plugin.saveSettings();
                    this.plugin.updateExplorerTitles();
                }));

        new Setting(containerEl)
            .setName('ID 属性')
            .setDesc('用于生成主卡 ID 的属性名')
            .addText(text => text
                .setPlaceholder('id')
                .setValue(this.plugin.settings.idProperty)
                .onChange(async (value) => {
                    this.plugin.settings.idProperty = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('启用主卡 ID 生成')
            .setDesc('是否启用主卡 ID 自动生成功能')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMainCardIdGeneration)
                .onChange(async (value) => {
                    this.plugin.settings.enableMainCardIdGeneration = value;
                    await this.plugin.saveSettings();
                }));

        // 新增：Canvas 存储路径设置
        new Setting(containerEl)
            .setName('Canvas 存储路径')
            .setDesc('指定知识树 Canvas 文件的存储路径')
            .addText(text => text
                .setPlaceholder('Canvas')
                .setValue(this.plugin.settings.canvasPath)
                .onChange(async (value) => {
                    this.plugin.settings.canvasPath = value;
                    await this.plugin.saveSettings();
                }));

        // 新增：排序属性设置
        new Setting(containerEl)
            .setName('排序属性')
            .setDesc('选择用于排序的 frontmatter 属性')
            .addText(text => text
                .setPlaceholder('alias')
                .setValue(this.plugin.settings.sortByProperty)
                .onChange(async (value) => {
                    this.plugin.settings.sortByProperty = value;
                    await this.plugin.saveSettings();
                }));

        // 新增：排序方向设置
        new Setting(containerEl)
            .setName('排序方向')
            .setDesc('选择排序方向')
            .addDropdown(dropdown => dropdown
                .addOption('asc', '升序')
                .addOption('desc', '降序')
                .setValue(this.plugin.settings.sortOrder)
                .onChange(async (value: 'asc' | 'desc') => {
                    this.plugin.settings.sortOrder = value;
                    await this.plugin.saveSettings();
                }));
    }
} 