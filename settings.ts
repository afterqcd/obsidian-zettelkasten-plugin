export interface ZettelkastenSettings {
    mainBoxPath: string;
    displayProperties: string[];
    enableMainCardIdGeneration: boolean;
    templatePath: string;
    enableTemplate: boolean;
}

export const DEFAULT_SETTINGS: ZettelkastenSettings = {
    mainBoxPath: "",
    displayProperties: ["alias"],
    enableMainCardIdGeneration: true,
    templatePath: "",
    enableTemplate: false,
} 