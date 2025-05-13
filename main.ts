import { App, Plugin, PluginSettingTab, Setting, TFile, TFolder, Menu, Notice } from 'obsidian';
import { ZettelkastenSettings, DEFAULT_SETTINGS } from './settings';

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

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new ZettelkastenSettingTab(this.app, this));
        this.attachObserversToAllExplorers();
        // 监听 Obsidian 面板和布局变化，确保 observer 始终生效
        this.registerEvent(this.app.workspace.on('layout-change', () => this.attachObserversToAllExplorers()));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.attachObserversToAllExplorers()));
        // 监听元数据和文件变动，主动刷新
        this.registerEvent(this.app.metadataCache.on('changed', () => this.updateExplorerTitles()));
        this.registerEvent(this.app.vault.on('rename', () => this.updateExplorerTitles()));
        this.registerEvent(this.app.vault.on('delete', () => this.updateExplorerTitles()));
        this.registerEvent(this.app.vault.on('create', () => this.updateExplorerTitles()));

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

    // 修改：获取模板内容
    private async getTemplateContent(id: string, path: string): Promise<string> {
        if (!this.settings.enableTemplate || !this.settings.templatePath) {
            return '';
        }

        try {
            const templateFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
            if (!(templateFile instanceof TFile)) {
                console.error('[ZK] 模板文件不存在:', this.settings.templatePath);
                return '';
            }

            // 获取模板插件实例
            const templatePlugin = (this.app as any).internalPlugins?.getPluginById('templates');
            if (!templatePlugin || !templatePlugin.enabled) {
                console.error('[ZK] 模板插件未启用');
                return await this.app.vault.read(templateFile);
            }

            // 使用模板插件的变量替换功能
            const templateContent = await this.app.vault.read(templateFile);
            const newFile = {
                basename: id,
                path: path,
            };
            
            // 使用模板插件的 parseTemplates 方法
            return await templatePlugin.instance.parseTemplates(templateContent, newFile);
        } catch (error) {
            console.error('[ZK] 处理模板文件失败:', error);
            return '';
        }
    }

    // 修改：创建新的主卡文件
    private async createNewMainCard(id: string, parent: TFolder) {
        const path = parent.path + '/' + id + '.md';
        
        // 获取并处理模板内容
        let content = '';
        if (this.settings.enableTemplate) {
            content = await this.getTemplateContent(id, path);
        }

        await this.app.vault.create(path, content);
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

        // 新增：主卡 ID 生成功能设置
        new Setting(containerEl)
            .setName('启用主卡 ID 生成')
            .setDesc('是否启用主卡 ID 自动生成功能')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMainCardIdGeneration)
                .onChange(async (value) => {
                    this.plugin.settings.enableMainCardIdGeneration = value;
                    await this.plugin.saveSettings();
                }));

        // 新增：模板设置
        new Setting(containerEl)
            .setName('启用模板')
            .setDesc('是否在创建新主卡时使用模板')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.enableTemplate = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('模板文件路径')
            .setDesc('指定用于创建新主卡的模板文件路径（相对于库根目录）')
            .addText(text => text
                .setPlaceholder('输入模板文件路径')
                .setValue(this.plugin.settings.templatePath)
                .onChange(async (value) => {
                    this.plugin.settings.templatePath = value;
                    await this.plugin.saveSettings();
                }));
    }
} 