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
    static parseId(id: string): number[] {
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
    private explorerObservers: MutationObserver[] = [];
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

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new ZettelkastenSettingTab(this.app, this));
        this.attachObserversToAllExplorers();
        this.attachObserversToAllCanvases();

        // 监听 Obsidian 面板和布局变化
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.attachObserversToAllExplorers();
            this.attachObserversToAllCanvases();  // 新增：布局变化时重新附加 Canvas 观察者
        }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.attachObserversToAllExplorers();
            this.attachObserversToAllCanvases();  // 新增：叶子变化时重新附加 Canvas 观察者
        }));

        // 监听元数据和文件变动
        this.registerEvent(this.app.metadataCache.on('changed', () => {
            this.updateExplorerTitles();
            this.updateCanvasTitles();  // 新增：更新 Canvas 标题
        }));
        this.registerEvent(this.app.vault.on('rename', () => {
            this.updateExplorerTitles();
            this.updateCanvasTitles();  // 新增：更新 Canvas 标题
        }));
        this.registerEvent(this.app.vault.on('delete', () => {
            this.updateExplorerTitles();
            this.updateCanvasTitles();  // 新增：更新 Canvas 标题
        }));
        this.registerEvent(this.app.vault.on('create', () => {
            this.updateExplorerTitles();
            this.updateCanvasTitles();  // 新增：更新 Canvas 标题
        }));

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
    }

    onunload() {
        this.detachAllObservers();
        this.detachAllCanvasObservers();  // 新增：清理 Canvas 观察者
    }

    private detachAllObservers() {
        this.explorerObservers.forEach(observer => observer.disconnect());
        this.explorerObservers = [];
    }

    private attachObserversToAllExplorers() {
        this.detachAllObservers();
        const explorers = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
        explorers.forEach(explorer => {
            this.setupExplorerObserver(explorer);
        });
        // 初始刷新
        this.updateExplorerTitles();
    }

    private setupExplorerObserver(explorer: Element) {
        const updateTitles = () => this.updateExplorerTitles();
        // 监听 DOM 变化
        const observer = new MutationObserver(updateTitles);
        observer.observe(explorer, { childList: true, subtree: true });
        this.explorerObservers.push(observer);
    }

    public updateExplorerTitles() {
        const explorers = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
        explorers.forEach(explorer => {
            explorer.querySelectorAll('.nav-file').forEach((el: Element) => {
                // 正确获取 data-path
                const titleDiv = el.querySelector('.nav-file-title');
                if (!titleDiv) return;
                const path = titleDiv.getAttribute('data-path');
                const titleEl = el.querySelector('.nav-file-title-content');
                if (!titleEl) return;
                if (!path || !path.startsWith(this.settings.mainBoxPath)) return;
                // 获取文件对象
                const file = this.app.vault.getAbstractFileByPath(path);
                if (!(file instanceof TFile)) return;
                // 获取 frontmatter
                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;
                let displayName = file.basename;
                if (frontmatter) {
                    for (const prop of this.settings.displayProperties) {
                        if (frontmatter[prop]) {
                            displayName += `:${frontmatter[prop]}`;
                            break;
                        }
                    }
                }
                // 替换显示
                titleEl.textContent = displayName;
            });
        });
    }

    // 新增：附加所有 Canvas 观察者
    private attachObserversToAllCanvases() {
        this.detachAllCanvasObservers();
        const canvases = this.app.workspace.getLeavesOfType('canvas');
        canvases.forEach(leaf => {
            this.setupCanvasObserver(leaf);
        });
        // 初始刷新
        this.updateCanvasTitles();
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

        const updateTitles = () => this.updateCanvasTitles();
        const observer = new MutationObserver(updateTitles);
        observer.observe(containerEl, { 
            childList: true, 
            subtree: true,
            attributes: true,
            attributeFilter: ['data-path']
        });
        this.canvasObservers.push(observer);
    }

    // 新增：清理所有 Canvas 观察者
    private detachAllCanvasObservers() {
        this.canvasObservers.forEach(observer => observer.disconnect());
        this.canvasObservers = [];
    }

    // 新增：更新 Canvas 标题
    public updateCanvasTitles() {
        if (!this.settings.enableCanvasTitleDisplay) {
            return;
        }

        const canvases = this.app.workspace.getLeavesOfType('canvas');
        canvases.forEach((leaf, leafIdx) => {
            // 直接遍历 DOM
            const containerEl = (leaf as any).containerEl;
            if (!containerEl) {
                return;
            }
            const nodes = containerEl.querySelectorAll('.canvas-node');
            nodes.forEach((nodeEl: Element, nodeIdx: number) => {
                // 获取标题元素
                const titleEl = nodeEl.querySelector('.inline-title');
                if (!titleEl) return;
                // 通过标题内容推断文件名
                const fileName = titleEl.textContent?.trim();
                if (!fileName) return;
                // 只处理主盒路径下的文件
                // 假设主盒下文件名唯一
                const folder = this.app.vault.getAbstractFileByPath(this.settings.mainBoxPath);
                if (!folder || !('children' in folder)) return;
                const file = (folder as any).children.find((f: any) => f.basename === fileName);
                if (!file) {
                    return;
                }
                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;
                if (!frontmatter) {
                    return;
                }
                let displayName = '';
                for (const prop of this.settings.displayProperties) {
                    if (frontmatter[prop]) {
                        displayName = frontmatter[prop];
                        break;
                    }
                }
                if (displayName) {
                    titleEl.textContent = displayName;
                }
            });
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateExplorerTitles();
    }

    // 新增：创建新的兄弟主卡
    private async createNewSiblingCard(currentFile: TFile) {
        const files = await this.getSortedMainCards();
        const currentId = currentFile.basename;
        const currentParts = MainCardIdGenerator.parseId(currentId);
        const siblingLevel = currentParts.length;
        const parentPrefix = currentParts.slice(0, -1).join('-');

        // 过滤出同一父级下的兄弟主卡（分段数相同，前缀一致）
        const siblingFiles = files.filter(f => {
            const parts = MainCardIdGenerator.parseId(f.basename);
            if (parts.length !== siblingLevel) return false;
            if (siblingLevel === 1) return true; // 顶层主卡没有父级
            return parts.slice(0, -1).join('-') === parentPrefix;
        }).sort((a, b) => {
            // 按最后一段编号的数值大小排序
            const aParts = MainCardIdGenerator.parseId(a.basename);
            const bParts = MainCardIdGenerator.parseId(b.basename);
            return aParts[aParts.length - 1] - bParts[bParts.length - 1];
        });

        // 找到当前主卡在兄弟主卡中的位置
        const currentSiblingIndex = siblingFiles.findIndex(f => f.path === currentFile.path);
        if (currentSiblingIndex === -1) throw new Error('找不到当前主卡');
        const nextSiblingFile = siblingFiles[currentSiblingIndex + 1];

        const newId = MainCardIdGenerator.generateSiblingId(
            currentFile.basename,
            nextSiblingFile ? nextSiblingFile.basename : null
        );

        const parent = currentFile.parent;
        if (!parent) throw new Error('无法获取父文件夹');
        await this.createNewMainCard(newId, parent);
    }

    // 新增：创建新的子主卡
    private async createNewChildCard(parentFile: TFile) {
        const files = await this.getSortedMainCards();
        const parentIndex = files.findIndex(f => f.path === parentFile.path);
        if (parentIndex === -1) throw new Error('找不到父主卡');

        // 查找所有子主卡，按编号数值排序，取最小编号的那个
        const childFiles = files.filter((f, index) =>
            index > parentIndex &&
            f.basename.startsWith(parentFile.basename + '-')
        );
        let firstChildFile = null;
        if (childFiles.length > 0) {
            childFiles.sort((a, b) => {
                const aParts = MainCardIdGenerator.parseId(a.basename);
                const bParts = MainCardIdGenerator.parseId(b.basename);
                return aParts[aParts.length - 1] - bParts[bParts.length - 1];
            });
            firstChildFile = childFiles[0];
        }

        const newId = MainCardIdGenerator.generateChildId(
            parentFile.basename,
            firstChildFile ? firstChildFile.basename : null
        );

        const parent = parentFile.parent;
        if (!parent) throw new Error('无法获取父文件夹');
        await this.createNewMainCard(newId, parent);
    }

    // 新增：获取排序后的主卡列表
    private async getSortedMainCards(): Promise<TFile[]> {
        const folder = this.app.vault.getAbstractFileByPath(this.settings.mainBoxPath);
        if (!(folder instanceof TFolder)) throw new Error('主盒路径无效');

        const files = folder.children.filter((f): f is TFile => f instanceof TFile);
        return files.sort((a, b) => a.basename.localeCompare(b.basename));
    }

    // 修改：创建新的主卡文件
    private async createNewMainCard(id: string, parent: TFolder) {
        const path = parent.path + '/' + id + '.md';
        await this.app.vault.create(path, '');
        new Notice(`已创建新主卡：${id}`);
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
            .setName('启用主卡 ID 生成')
            .setDesc('是否启用主卡 ID 自动生成功能')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMainCardIdGeneration)
                .onChange(async (value) => {
                    this.plugin.settings.enableMainCardIdGeneration = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Canvas 标题显示')
            .setDesc('在 Canvas 中使用笔记属性值替换标题（仅显示属性值，不显示文件名）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableCanvasTitleDisplay)
                .onChange(async (value) => {
                    this.plugin.settings.enableCanvasTitleDisplay = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateCanvasTitles();
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
    }
} 