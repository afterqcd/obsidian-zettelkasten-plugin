export interface ZettelkastenSettings {
    mainBoxPath: string;
    mainCardIdProperty: string;
    enableMainCardGenerationAssit: boolean;
    canvasPath: string;
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: 'MainBox',
    mainCardIdProperty: 'alias',
    enableMainCardGenerationAssit: true,
    canvasPath: 'Canvas',
} 