export interface ZettelkastenSettings {
    mainBoxPath: string;
    mainCardIdProperty: string;
    enableMainCardGenerationAssit: boolean;
    canvasPath: string;
    explorerDisplayMode: 'id' | 'tree';
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: 'MainBox',
    mainCardIdProperty: 'alias',
    enableMainCardGenerationAssit: true,
    canvasPath: 'Canvas',
    explorerDisplayMode: 'id'
}; 