const applyBlocklyPalette = () => {
    const workspace = Blockly;
    // Electric Royal Blue (#0066FF) outer root frames + crisp white inner blocks with obsidian pill inputs
    workspace.Colours.RootBlock = {
        colour: '#0066ff',
        colourSecondary: '#0052cc',
        colourTertiary: '#1d4ed8',
    };

    workspace.Colours.Base = {
        colour: '#ffffff',
        colourSecondary: '#0f172a',
        colourTertiary: '#cbd5e1',
    };

    workspace.Colours.Special1 = {
        colour: '#ffffff',
        colourSecondary: '#0f172a',
        colourTertiary: '#cbd5e1',
    };

    workspace.Colours.Special2 = {
        colour: '#ffffff',
        colourSecondary: '#0f172a',
        colourTertiary: '#cbd5e1',
    };

    workspace.Colours.Special3 = {
        colour: '#ffffff',
        colourSecondary: '#0f172a',
        colourTertiary: '#cbd5e1',
    };

    workspace.Colours.Special4 = {
        colour: '#ffffff',
        colourSecondary: '#0f172a',
        colourTertiary: '#cbd5e1',
    };
};

export const setColors = () => applyBlocklyPalette();
