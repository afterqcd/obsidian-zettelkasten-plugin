import { App, Plugin, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { ZettelkastenSettings } from './settings';
import { CanvasData } from './types';

declare global {
    interface Window {
        app: App;
    }
}

export interface ZettelkastenPlugin extends Plugin {
    settings: ZettelkastenSettings;
    canvasManager: CanvasManager;
    fileManager: FileManager;
    uiManager: UIManager;
    app: App;
}

export interface CanvasManager {
    getCanvasData(file: TFile): Promise<CanvasData>;
    saveCanvasData(file: TFile, data: CanvasData): Promise<void>;
    getCanvasRootCardId(file: TFile): Promise<string | undefined>;
    setCanvasRootCardId(file: TFile, rootCardId: string): Promise<void>;
    createKnowledgeTreeCanvas(rootFile: TFile): Promise<void>;
    updateKnowledgeTreeCanvas(canvasFile: TFile): Promise<void>;
    updateAllKnowledgeTrees(newCard: TFile): Promise<void>;
    removeNodeFromKnowledgeTree(canvasFile: TFile, nodeId: string): Promise<void>;
    updateAllKnowledgeTreesOnDelete(deletedFile: TFile): Promise<void>;
}

export interface FileManager {
    getCardId(file: TFile): string;
    getCardDisplayName(file: TFile): Promise<string>;
    getSortedMainCards(): Promise<TFile[]>;
    createNewMainCard(id: string, parent: TFolder): Promise<void>;
    createNewSiblingCard(currentFile: TFile): Promise<void>;
    createNewChildCard(parentFile: TFile): Promise<void>;
}

export interface UIManager {
    updateExplorerTitles(): void;
    patchMainBoxFileItemSort(): void;
    patchMainBoxFileItemSortWithRetry(retry?: number, delay?: number): void;
    setupCanvasObserver(leaf: WorkspaceLeaf): void;
    attachObserversToAllCanvases(): void;
    detachAllCanvasObservers(): void;
} 