import { App, Plugin, Menu, Notice, TFile } from 'obsidian';
import { ZettelkastenSettings, DEFAULT_SETTINGS } from './settings';
import { ZettelkastenSettingTab } from './modules/settings-tab';
import { CanvasManager } from './modules/canvas-manager';
import { FileManager } from './modules/file-manager';
import { UIManager } from './modules/ui-manager';

export class ZettelkastenPlugin extends Plugin {
    settings: ZettelkastenSettings;
    canvasManager: CanvasManager;
    fileManager: FileManager;
    uiManager: UIManager;

    async onload() {
        await this.loadSettings();
        
        // 初始化各个管理器
        this.canvasManager = new CanvasManager(this);
        this.fileManager = new FileManager(this);
        this.uiManager = new UIManager(this);

        // 添加设置面板
        this.addSettingTab(new ZettelkastenSettingTab(this.app, this));

        // 附加 Canvas 观察者
        this.uiManager.attachObserversToAllCanvases();

        // 监听 Obsidian 面板和布局变化
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.uiManager.attachObserversToAllCanvases();
            this.uiManager.updateExplorerTitles();
        }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.uiManager.attachObserversToAllCanvases();
            this.uiManager.updateExplorerTitles();
        }));

        // 监听元数据和文件变动
        this.registerEvent(this.app.metadataCache.on('changed', () => {
            this.uiManager.updateExplorerTitles();
        }));
        this.registerEvent(this.app.vault.on('rename', () => {
            this.uiManager.updateExplorerTitles();
        }));
        this.registerEvent(this.app.vault.on('delete', () => {
            this.uiManager.updateExplorerTitles();
        }));
        this.registerEvent(this.app.vault.on('create', () => {
            this.uiManager.updateExplorerTitles();
        }));

        // 监听文件资源管理器的展开/折叠事件
        this.registerEvent(
            this.app.workspace.on('file-explorer:folder-open' as any, () => {
                this.uiManager.updateExplorerTitles();
            })
        );

        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                this.uiManager.patchMainBoxFileItemSortWithRetry();
            })
        );

        // 等待布局完全加载后再更新标题
        this.app.workspace.onLayoutReady(() => {
            this.uiManager.updateExplorerTitles();
            this.uiManager.patchMainBoxFileItemSortWithRetry();
        });

        // 监听文件创建事件，自动更新知识树
        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (!(file instanceof TFile)) return;
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                await this.canvasManager.updateAllKnowledgeTrees(file);
            })
        );

        // 监听文件删除事件
        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                if (!(file instanceof TFile)) return;
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                await this.canvasManager.updateAllKnowledgeTreesOnDelete(file);
            })
        );

        // 右键菜单项 - 在 Canvas 中展示知识树
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                
                menu.addItem((item) => {
                    item
                        .setTitle('在 Canvas 中展示知识树')
                        .setIcon('diagram-tree')
                        .onClick(async () => {
                            try {
                                await this.canvasManager.createKnowledgeTreeCanvas(file);
                            } catch (error) {
                                new Notice('创建知识树 Canvas 失败：' + error.message);
                            }
                        });
                });
            })
        );

        // 注册右键菜单
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu: Menu, file: TFile) => {
                if (!this.settings.enableMainCardGenerationAssit) return;
                if (!file.path.startsWith(this.settings.mainBoxPath)) return;
                
                // 添加新建兄弟主卡选项
                menu.addItem((item) => {
                    item
                        .setTitle('新建兄弟主卡')
                        .setIcon('plus')
                        .onClick(async () => {
                            try {
                                await this.fileManager.createNewSiblingCard(file);
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
                                await this.fileManager.createNewChildCard(file);
                            } catch (error) {
                                new Notice('创建子主卡失败：' + error.message);
                            }
                        });
                });
            })
        );

        this.app.workspace.onLayoutReady(() => {
            this.uiManager.patchMainBoxFileItemSortWithRetry();
        });
        this.registerEvent(this.app.vault.on('create', () => this.uiManager.patchMainBoxFileItemSortWithRetry()));
        this.registerEvent(this.app.vault.on('delete', () => this.uiManager.patchMainBoxFileItemSortWithRetry()));
        this.registerEvent(this.app.vault.on('rename', () => this.uiManager.patchMainBoxFileItemSortWithRetry()));
        this.registerEvent(this.app.metadataCache.on('changed', () => this.uiManager.patchMainBoxFileItemSortWithRetry()));
    }

    onunload() {
        this.uiManager.detachAllCanvasObservers();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

export default ZettelkastenPlugin; 