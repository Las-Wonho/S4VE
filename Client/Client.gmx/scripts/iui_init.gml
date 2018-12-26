///iui_init()
/**
    Initalizes the IMNOTUI

    ==============================
**/

/// Init IMGUI related stuff
///=========================================================
// Input related - We use this instead of mouse_x / y or whatever...
// In case of another input method such as gamepad n' stuff
iui_inputX    = 0;          // (= mouse_x)
iui_inputY    = 0;          // (= mouse_y)
iui_inputDown = false;      // (= Mouse click input)
iui_keyPress  = 0;          // hit once
iui_keyChar   = 0;          // key down (without key delay)
iui_keyMod    = 0;

enum eKEYMOD
{
    SHIFT,
    CTRL,
    ALT
}

// element stuff
iui_varmap = ds_map_create(); // variable map for storing information used by elements
iui_kbFocusItem = -1;       // What item is having the keybard input focus
iui_activeItem  = -1;       // What item is active
iui_hotItem     = -1;       // What item is HOT - AKA placed mouse over it

// ID chache? map
iui_idMap = ds_map_create();
iui_idx   = 0;

// Why gamemaker has no draw_get_halign() and draw_get_valign()
iui_alignStack = ds_stack_create();
iui_halign = fa_left;
iui_valign = fa_top;

// LUT stuff
IUI_SINE_LUT_45DEG = 0.70710696969696969; // Sine 45deg (also 69 lol)


/// Styles
///=========================================================
// colours
iuHellaDark = col16($191817);
iuDark      = col16($313435);
iuDark2     = col16($3F494F);
iuNormal    = col16($637674);
iuCream     = col16($EFE8C4);
iuCreamDark = col16($E0D3A7);
iuMint      = col16($25CDA3);
iuSky       = col16($68B9C8);
iuRed       = col16($ED3255);
iuPiss      = col16($EABF11);
iuBrown     = col16($5A4D48);

// Button
iuiButtonShadow    = false;
iuiColButtonShadow = iuHellaDark;
iuiColButtonBackdrop    = iuDark2;
iuiColButtonBackdropTop = iuMint;
iuiColButtonActiveBackdrop     = iuHellaDark;
iuiColButtonActiveBackdropTop  = iuMint;
iuiColButtonActiveBackdropTop2 = iuPiss; // when active but mouse is out of the button
iuiColButtonHotBackdrop    = iuNormal;
iuiColButtonHotBackdropTop = iuMint;
iuiColButtonLabel          = iuCreamDark;

// Tab
iuiColTabLabel     = iuCream;
iuiColTabHot       = iuNormal;
iuiColTabHotAccent = iuPiss;
iuiColTabCurrent       = iuHellaDark;
iuiColTabCurrentAccent = iuMint;
// stripe coloured tab
iuiColTabNum    = 2; // number of tab colours
iuiColTab       = 0;
iuiColTabAccent = 0;
iuiColTab[0]       = iuDark;
iuiColTabAccent[0] = iuNormal;
iuiColTab[1]       = colLighter(iuDark, -5);
iuiColTabAccent[1] = colLighter(iuNormal, -5);

// Text box
iuiTextBoxRainbow   = true; // rainbow colour when active
iuiColTextBoxFill   = colLighter(iuHellaDark, 5);
iuiColTextBoxText   = iuCream;
iuiColTextBoxBorder = iuSky;
iuiColTextBoxActiveFill   = iuHellaDark;
iuiColTextBoxActiveBorder = iuHellaDark;
iuiColTextBoxHotFill   = colLighter(iuHellaDark, 7);
iuiColTextBoxHotBorder = iuMint;

// Slider
// display min, max and value on active?
iuiSliderDisplayValue = true;
// horizontal
iuiSliderHWid = 20;
iuiSliderHHei = 42;
// vertical
iuiSliderVWid = 42;
iuiSliderVHei = 20;
// How thick the guideline(?) is
iuiSliderThick = 8;

iuiColSliderLine   = iuHellaDark;
iuiColSlider       = iuNormal;
iuiColSliderActive = iuDark2;
iuiColSliderHot    = colLighter(iuNormal, 10);


///=========================================================
// anal scratch
iui_init_vars();
iuiAnimTime = 0;

// optional - set font
draw_set_font(fnt_consolas);
