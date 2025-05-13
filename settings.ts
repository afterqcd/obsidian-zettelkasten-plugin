export interface ZettelkastenSettings {
    mainBoxPath: string;
    displayProperties: string[];
    enableMainCardIdGeneration: boolean;
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: "",
    displayProperties: ["alias"],
    enableMainCardIdGeneration: true,
} 