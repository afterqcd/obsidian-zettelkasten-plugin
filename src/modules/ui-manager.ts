import { App, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import { ZettelkastenPlugin } from '@/main';

export class UIManager {
    private canvasObservers: MutationObserver[] = [];

    constructor(private plugin: ZettelkastenPlugin) {}

    updateExplorerTitles() {
        const mainBoxFolder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.mainBoxPath);
        if (!(mainBoxFolder instanceof TFolder)) return;

        // 获取所有文件资源管理器实例
        const explorers = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
        if (explorers.length === 0) return;

        explorers.forEach(explorer => {
            const mainBoxEl = explorer.querySelector(`[data-path="${this.plugin.settings.mainBoxPath}"]`);
            if (!mainBoxEl) return;

            // 获取主盒文件夹的展开状态
            const isExpanded = mainBoxEl.classList.contains('is-collapsed') === false;
            if (!isExpanded) return;

            const childrenContainer = mainBoxEl.nextElementSibling;
            if (!childrenContainer) return;

            const fileElements = Array.from(childrenContainer.querySelectorAll('.nav-file'));
            
            // 批量处理所有文件元素
            fileElements.forEach((el: Element) => {
                const titleDiv = el.querySelector('.nav-file-title');
                if (!titleDiv) return;
                
                const path = titleDiv.getAttribute('data-path');
                const titleEl = el.querySelector('.nav-file-title-content');
                if (!titleEl || !path || !path.startsWith(this.plugin.settings.mainBoxPath)) return;
                
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                if (!(file instanceof TFile)) return;

                const cardId = this.plugin.fileManager.getCardId(file);
                titleEl.textContent = `${cardId}:${file.basename}`;
            });
        });
    }

    patchMainBoxFileItemSort() {
        const leaves = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (leaves.length === 0) return;
        const view = (leaves[0] as any).view;
        if (!view.fileItems) return;
        const item = view.fileItems[this.plugin.settings.mainBoxPath];
        if (
            item &&
            typeof item.sort === 'function' &&
            !item.sort._zettelkastenPatched &&
            item.file &&
            item.file.path === this.plugin.settings.mainBoxPath &&
            item.vChildren &&
            Array.isArray(item.vChildren._children)
        ) {
            const plugin = this.plugin;
            const originalSort = item.sort;
            item.sort = function (...args: any[]) {
                // 先调用原始排序，保证结构完整
                const result = originalSort.apply(this, args);
                // 然后对 vChildren._children 进行自定义排序
                this.vChildren._children.sort((a: any, b: any) => {
                    if (a.file instanceof TFile && b.file instanceof TFile) {
                        const cacheA = plugin.app.metadataCache.getFileCache(a.file);
                        const cacheB = plugin.app.metadataCache.getFileCache(b.file);
                        const aliasA = String(cacheA?.frontmatter?.[plugin.settings.mainCardIdProperty] ?? a.file.basename);
                        const aliasB = String(cacheB?.frontmatter?.[plugin.settings.mainCardIdProperty] ?? b.file.basename);
                        const cmp = aliasA.localeCompare(aliasB, 'zh-CN');
                        return cmp; // 固定为升序
                    }
                    return 0;
                });
                return result;
            };
            item.sort._zettelkastenPatched = true;
        }
    }

    patchMainBoxFileItemSortWithRetry(retry = 5, delay = 100) {
        const leaves = this.plugin.app.workspace.getLeavesOfType('file-explorer');
        if (leaves.length === 0) return;
        const view = (leaves[0] as any).view;
        if (!view.fileItems) {
            if (retry > 0) setTimeout(() => this.patchMainBoxFileItemSortWithRetry(retry - 1, delay), delay);
            return;
        }
        const item = view.fileItems[this.plugin.settings.mainBoxPath];
        if (!item) {
            if (retry > 0) setTimeout(() => this.patchMainBoxFileItemSortWithRetry(retry - 1, delay), delay);
            return;
        }
        // 调用原有 patch 逻辑
        this.patchMainBoxFileItemSort();
    }

    setupCanvasObserver(leaf: WorkspaceLeaf) {
        const canvas = (leaf.view as any).canvas;
        if (!canvas) return;

        // 获取 Canvas 的容器元素
        const containerEl = (leaf as any).containerEl?.querySelector('.canvas-wrapper');
        if (!containerEl) {
            console.error('[ZK] Canvas wrapper element not found');
            return;
        }
    }

    attachObserversToAllCanvases() {
        this.detachAllCanvasObservers();
        const canvases = this.plugin.app.workspace.getLeavesOfType('canvas');
        canvases.forEach((leaf: WorkspaceLeaf) => {
            this.setupCanvasObserver(leaf);
        });
    }

    detachAllCanvasObservers() {
        this.canvasObservers.forEach(observer => observer.disconnect());
        this.canvasObservers = [];
    }
} 