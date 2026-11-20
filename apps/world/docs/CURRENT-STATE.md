# Current state

MasterEarth World is a browser-based Cesium application. Its shared overlay
host renders world-anchored labels and cards in screen space. Data layers retain
their own source and presentation policies; Cesium entities may be used for
geometry and picking, not text labels.

## First launch

The first-launch mission card is intentionally not forced onto the screen by a
timer. A surface class that never clears means no launcher for that page. The
decision is documented in `src/firstRunExperience.js`.

## DISPLAY ▸ Draw

The Draw control creates temporary areas and routes on the globe. Its shapes are
draped against the terrain or visible 3D tiles. The control is not a persistent
geospatial editing or export workflow.

## Transit

Transit is off by default. Enabling a feed is an explicit session choice.
Restart clears it; history is limited to the supported retained feed, while
other feeds remain live-only. `src/data/militaryAwareness.js` remains a separate
military-awareness source and does not change transit behavior.

## Panel preferences

Collapsed panel preferences use keys in the
`godsEyeView.v6.panelCollapsed.<panel-id>` namespace. The CCTV panel's default
key is `godsEyeView.v6.panelCollapsed.cctv-panel`.

Floating panel positions are no longer stored. The retired namespace is
`godsEyeView.v8.panelPos.<panel-id>`; the old
`godsEyeView.v8.panelPos.<id>` shape is removed during cleanup rather than
restored. The versions are declared in `src/ui/panelPositionControls.js`.
