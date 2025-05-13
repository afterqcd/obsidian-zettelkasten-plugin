export interface ZettelkastenSettings {
    mainBoxPath: string;
    displayProperties: string[];
    enableMainCardIdGeneration: boolean;
    enableCanvasTitleDisplay: boolean;
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: "",
    displayProperties: ["alias"],
    enableMainCardIdGeneration: true,
    enableCanvasTitleDisplay: true,
} 