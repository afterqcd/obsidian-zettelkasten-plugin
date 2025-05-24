export interface ZettelkastenSettings {
    mainBoxPath: string;
    displayProperties: string[];
    enableMainCardIdGeneration: boolean;
    canvasPath: string;
    sortByProperty: string;
    sortOrder: 'asc' | 'desc';
    idProperty: string;
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: 'MainBox',
    displayProperties: ['alias', 'tags'],
    enableMainCardIdGeneration: true,
    canvasPath: 'Canvas',
    sortByProperty: 'alias',
    sortOrder: 'asc',
    idProperty: 'id'
} 