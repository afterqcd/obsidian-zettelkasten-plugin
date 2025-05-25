import { App, PluginSettingTab, Setting } from 'obsidian';
import { ZettelkastenPlugin } from '@/main';

export class ZettelkastenSettingTab extends PluginSettingTab {
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
                    this.plugin.uiManager.updateExplorerTitles();
                }));

        new Setting(containerEl)
            .setName('主卡ID属性')
            .setDesc('用于显示、ID生成和排序的笔记属性')
            .addText(text => text
                .setPlaceholder('alias')
                .setValue(this.plugin.settings.mainCardIdProperty)
                .onChange(async (value) => {
                    this.plugin.settings.mainCardIdProperty = value;
                    await this.plugin.saveSettings();
                    this.plugin.uiManager.updateExplorerTitles();
                }));

        new Setting(containerEl)
            .setName('启用主卡辅助创建功能')
            .setDesc('在创建主卡时自动生成 ID 并协助创建主卡文件')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMainCardGenerationAssit)
                .onChange(async (value) => {
                    this.plugin.settings.enableMainCardGenerationAssit = value;
                    await this.plugin.saveSettings();
                }));

        // Canvas 存储路径设置
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

        new Setting(containerEl)
            .setName('主盒显示模式')
            .setDesc('选择主盒中主卡的显示方式')
            .addDropdown(dropdown => dropdown
                .addOption('id', '显示ID')
                .addOption('tree', '显示树形')
                .setValue(this.plugin.settings.explorerDisplayMode)
                .onChange(async (value: 'id' | 'tree') => {
                    this.plugin.settings.explorerDisplayMode = value;
                    await this.plugin.saveSettings();
                    this.plugin.uiManager.updateExplorerTitles();
                }));
    }
} 