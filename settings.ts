export interface ZettelkastenSettings {
    mainBoxPath: string;
    displayProperties: string[];
    enableMainCardIdGeneration: boolean;
    enableCanvasTitleDisplay: boolean;
    canvasPath: string;
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: "",
    displayProperties: ["alias"],
    enableMainCardIdGeneration: true,
    enableCanvasTitleDisplay: true,
    canvasPath: "Canvas"
} 