import { App, TFile, TFolder, Notice } from 'obsidian';
import { ZettelkastenPlugin } from '@/main';
import { MainCardIdHelper } from './id-helper';

export class FileManager {
    constructor(private plugin: ZettelkastenPlugin) {}

    getCardId(file: TFile): string {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        if (frontmatter && frontmatter[this.plugin.settings.mainCardIdProperty]) {
            return String(frontmatter[this.plugin.settings.mainCardIdProperty]);
        }
        return file.basename;
    }

    async getSortedMainCards(): Promise<TFile[]> {
        const folder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.mainBoxPath);
        if (!(folder instanceof TFolder)) throw new Error('主盒路径无效');

        const files = folder.children.filter((f): f is TFile => f instanceof TFile);
        return files.sort((a, b) => this.getCardId(a).localeCompare(this.getCardId(b), 'zh-CN'));
    }

    async createNewMainCard(id: string, parent: TFolder): Promise<void> {
        const path = parent.path + '/' + id + '.md';
        await this.plugin.app.vault.create(path, '');
        new Notice(`已创建新主卡：${id}`);
    }

    async createNewSiblingCard(currentFile: TFile): Promise<void> {
        const files = await this.getSortedMainCards();
        const currentId = this.getCardId(currentFile);
        const currentParts = MainCardIdHelper.parseId(currentId);
        const siblingLevel = currentParts.length;
        const parentPrefix = currentParts.slice(0, -1).join('-');

        // 过滤出同一父级下的兄弟主卡（分段数相同，前缀一致）
        const siblingFiles = files.map(f => ({
            file: f,
            id: this.getCardId(f)
        }));

        const filteredSiblings = siblingFiles.filter(({ id }) => {
            const parts = MainCardIdHelper.parseId(id);
            if (parts.length !== siblingLevel) return false;
            if (siblingLevel === 1) return true; // 顶层主卡没有父级
            return parts.slice(0, -1).join('-') === parentPrefix;
        }).sort((a, b) => {
            // 按最后一段编号的数值大小排序
            const aParts = MainCardIdHelper.parseId(a.id);
            const bParts = MainCardIdHelper.parseId(b.id);
            return aParts[aParts.length - 1] - bParts[bParts.length - 1];
        });

        // 找到当前主卡在兄弟主卡中的位置
        const currentSiblingIndex = filteredSiblings.findIndex(({ file }) => file.path === currentFile.path);
        if (currentSiblingIndex === -1) throw new Error('找不到当前主卡');
        const nextSiblingFile = filteredSiblings[currentSiblingIndex + 1];

        const newId = MainCardIdHelper.generateSiblingId(
            currentId,
            nextSiblingFile ? nextSiblingFile.id : null
        );

        const parent = currentFile.parent;
        if (!parent) throw new Error('无法获取父文件夹');
        await this.createNewMainCard(newId, parent);
    }

    async createNewChildCard(parentFile: TFile): Promise<void> {
        const files = await this.getSortedMainCards();
        const parentId = this.getCardId(parentFile);
        
        const parentIndex = files.findIndex(f => f.path === parentFile.path);
        if (parentIndex === -1) throw new Error('找不到父主卡');

        // 获取所有子主卡
        const childFiles = files.map(f => ({
            file: f,
            id: this.getCardId(f)
        }));

        // 查找所有子主卡，按编号数值排序，取最小编号的那个
        const filteredChildren = childFiles.filter(({ id }, index) => {
            return index > parentIndex && id.startsWith(parentId + '-');
        });

        let firstChildFile = null;
        if (filteredChildren.length > 0) {
            filteredChildren.sort((a, b) => {
                const aParts = MainCardIdHelper.parseId(a.id);
                const bParts = MainCardIdHelper.parseId(b.id);
                return aParts[aParts.length - 1] - bParts[bParts.length - 1];
            });
            firstChildFile = filteredChildren[0];
        }

        const newId = MainCardIdHelper.generateChildId(
            parentId,
            firstChildFile ? firstChildFile.id : null
        );

        const parent = parentFile.parent;
        if (!parent) throw new Error('无法获取父文件夹');
        await this.createNewMainCard(newId, parent);
    }
} 