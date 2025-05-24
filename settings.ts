export interface ZettelkastenSettings {
    mainBoxPath: string;
    displayProperties: string[];
    enableMainCardIdGeneration: boolean;
    canvasPath: string;
    sortByProperty: string;
    sortOrder: 'asc' | 'desc';
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: "",
    displayProperties: ["alias"],
    enableMainCardIdGeneration: true,
    canvasPath: "Canvas",
    sortByProperty: "alias",
    sortOrder: 'asc'
} 