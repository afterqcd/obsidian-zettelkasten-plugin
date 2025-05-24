import { App, TFile, TFolder, Notice } from 'obsidian';
import { CanvasData, CanvasNode, CanvasEdge } from '@/types';
import { ZettelkastenPlugin } from '@/main';

export class CanvasManager {
    constructor(private plugin: ZettelkastenPlugin) {}

    async getCanvasData(file: TFile): Promise<CanvasData> {
        const content = await this.plugin.app.vault.read(file);
        return JSON.parse(content);
    }

    async saveCanvasData(file: TFile, data: CanvasData): Promise<void> {
        await this.plugin.app.vault.modify(file, JSON.stringify(data, null, 2));
    }

    async getCanvasRootCardId(file: TFile): Promise<string | undefined> {
        const data = await this.getCanvasData(file);
        return data.meta?.rootCardId;
    }

    async setCanvasRootCardId(file: TFile, rootCardId: string): Promise<void> {
        const data = await this.getCanvasData(file);
        if (!data.meta) {
            data.meta = {};
        }
        data.meta.rootCardId = rootCardId;
        await this.saveCanvasData(file, data);
    }

    async createKnowledgeTreeCanvas(rootFile: TFile): Promise<void> {
        // 确保 Canvas 目录存在
        const canvasFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.canvasPath);
        if (!canvasFolder) {
            await this.plugin.app.vault.createFolder(this.plugin.settings.canvasPath);
        }

        // 创建 Canvas 文件
        const canvasFileName = `${rootFile.basename}知识树.canvas`;
        const canvasPath = `${this.plugin.settings.canvasPath}/${canvasFileName}`;
        
        // 检查文件是否已存在
        const existingFile = this.plugin.app.vault.getAbstractFileByPath(canvasPath);
        if (existingFile) {
            throw new Error('知识树 Canvas 已存在');
        }

        const canvasFile = await this.plugin.app.vault.create(canvasPath, JSON.stringify({
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
        const leaf = this.plugin.app.workspace.getLeaf('tab');
        await leaf.openFile(canvasFile);

        // 更新 Canvas 显示
        await this.updateKnowledgeTreeCanvas(canvasFile);
    }

    async updateKnowledgeTreeCanvas(canvasFile: TFile): Promise<void> {
        const data = await this.getCanvasData(canvasFile);
        const rootCardId = data.meta?.rootCardId;
        if (!rootCardId) return;

        // 获取所有相关主卡
        const allCards = await this.plugin.fileManager.getSortedMainCards();
        const relatedCards = allCards.filter((card: TFile) => 
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

    async updateAllKnowledgeTrees(newCard: TFile): Promise<void> {
        const canvasFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.canvasPath);
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

    async removeNodeFromKnowledgeTree(canvasFile: TFile, nodeId: string): Promise<void> {
        const data = await this.getCanvasData(canvasFile);
        
        // 移除节点
        data.nodes = data.nodes.filter(node => node.id !== nodeId);
        
        // 移除相关的边
        data.edges = data.edges.filter(edge => 
            edge.fromNode !== nodeId && edge.toNode !== nodeId
        );
        
        await this.saveCanvasData(canvasFile, data);
    }

    async updateAllKnowledgeTreesOnDelete(deletedFile: TFile): Promise<void> {
        const canvasFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.canvasPath);
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
} 