# Code boundaries

MasterEarth World keeps responsibilities separated:

- `src/app/` composes the viewer and connects application services.
- `src/layers/` owns layer behavior and presentation data.
- `src/data/` owns data access, normalization, and source-specific policies.
- `src/overlays/` owns shared projection, collision handling, and screen-space
  rendering for world-anchored text and cards.
- `src/ui/` owns interface markup and controls.

World-anchored text belongs in the shared overlay host. Do not add Cesium
`LabelGraphics`, `Label`, or `LabelCollection` instances. A layer publishes
positioned entries to `src/overlays/worldOverlay.js`; the host handles their
screen-space placement and drawing.

Keep application-specific behavior in its owning module. Shared infrastructure
must not depend on a particular data provider, product workflow, or UI panel.
User-visible strings should use the i18n catalog, or have a nearby
`i18n-ignore` comment explaining why they intentionally remain untranslated.
