/**
 * Ordre des couches d'imagerie Cesium.
 *
 * `ImageryLayerCollection.addImageryProvider(provider, index)` lève une
 * `DeveloperError` — « index must be less than or equal to the number of
 * layers » — dès que `index` dépasse le nombre de couches déjà présentes.
 * Or le `Viewer` est créé avec `baseLayer: false` : au premier rendu la
 * collection est vide. Des index fixes (1, 2) faisaient donc échouer la
 * création du voile jour/nuit et des lumières nocturnes, l'exception étant
 * avalée par un `catch` : la nuit disparaissait entièrement du globe 3D.
 *
 * Le fond de carte est inséré ensuite à l'index 0, ce qui décale naturellement
 * ces couches vers le haut sans changer l'ordre visuel voulu :
 * fond (0) → voile de nuit (1) → lumières NASA (2) → radar (3+).
 */

/** Index d'insertion sûr : jamais supérieur au nombre de couches existantes. */
export function imageryInsertIndex(desiredIndex: number, layerCount: number): number {
  if (!Number.isFinite(desiredIndex) || !Number.isFinite(layerCount)) return 0;
  const count = Math.max(0, Math.floor(layerCount));
  return Math.max(0, Math.min(Math.floor(desiredIndex), count));
}
