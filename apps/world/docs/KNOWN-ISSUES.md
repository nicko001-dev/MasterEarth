# Known issues and compatibility notes

## Panel layout preferences

Panel positions are arranged by the current rails and are not persisted. The
legacy position namespace
`godsEyeView.v8.panelPos.<panel-id>` is retired; the cleanup also recognizes
`godsEyeView.v8.panelPos.cctv-panel`.

Collapsed state is still persisted under
`godsEyeView.v6.panelCollapsed.<panel-id>`, including
`godsEyeView.v6.panelCollapsed.cctv-panel`. Removing a stored collapse value
does not override a panel's default markup state. The versions are declared in
`src/ui/panelPositionControls.js`.

## External data

Live layers depend on their configured providers and network availability.
Provider errors may leave the last successfully loaded data visible; data
availability is not a guarantee of geographic coverage or operational
completeness.
