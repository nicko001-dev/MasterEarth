/**
 * MasterEarth — module d'extension du monde 3D : capteurs, météo, alertes, pluie 3D et simulations d'inondation.
 * Il s'appuie sur le viewer Cesium exposé par l'application (voir src/app/viewer.js).
 */
import * as Cesium from 'cesium';
import { RAIN_FRAGMENT, altitudeFade, rainVisual } from './rain.js';
import { b64ToU16, b64ToU8, buildWaterPrimitive } from './flood.js';
import { governorRequestRender, holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { setOverlayEntries } from '../overlays/worldOverlay.js';
import {
  WORLD_FIRST_VIEW_HEIGHT_M,
  WORLD_LOCATION_OPTIONS,
  WORLD_RECENTER_HEIGHT_M,
  describeWorldLocationError,
  formatWorldAccuracy,
  formatWorldCoordinates,
  normalizeLocationPosition,
  queryWorldLocationPermission,
  readWorldLocationConsent,
  worldGeolocationSupported,
  writeWorldLocationConsent,
} from './location.js';

const API = '/intelliflood-api';
const COLORS = { green: '#2ecc71', orange: '#f28c28', red: '#ff3b30' };
const LABELS = { green: 'Vert', orange: 'Orange', red: 'Rouge' };
const TOKEN_KEY = 'intelliflood.world.token';

const css = `
#if-toggle{position:fixed;left:14px;bottom:70px;z-index:60;display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:40px;border:1px solid #1fb5d9;background:rgba(6,17,28,.92);color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer}
#if-toggle i{width:10px;height:10px;border-radius:50%;background:#2ecc71}
#if-panel{position:fixed;left:14px;top:392px;bottom:116px;z-index:60;width:320px;max-width:calc(100vw - 28px);overflow:auto;padding:12px;border-radius:14px;background:rgba(6,17,28,.94);border:1px solid #1d4263;color:#d1e4f0;font:13px system-ui,sans-serif;display:none}
#if-panel.open{display:block}#if-panel h3{margin:12px 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#79a5c4}
#if-panel input,#if-panel select,#if-panel textarea{width:100%;box-sizing:border-box;background:#0a1a28;color:#d1e4f0;border:1px solid #1d4263;border-radius:8px;padding:7px 8px;font:inherit;margin:3px 0}
#if-panel button{background:#1fb5d9;color:#02070d;border:0;border-radius:8px;padding:8px 12px;font:600 13px system-ui;cursor:pointer;margin:3px 3px 3px 0}
#if-panel button.ghost{background:transparent;color:#d1e4f0;border:1px solid #1d4263}
#if-panel .row{display:flex;gap:6px}#if-panel .row>*{flex:1;min-width:0}#if-panel small,#if-panel .muted{color:#9cbacf}
#if-panel .warn{color:#f1c40f}#if-panel .err{color:#ff7a6b}#if-panel .ok{color:#2ecc71}
#if-panel li{list-style:none;display:flex;gap:8px;align-items:flex-start;padding:4px 0;border-bottom:1px solid #12304a}#if-panel ul{margin:0;padding:0}
#if-panel li i{width:9px;height:9px;border-radius:50%;margin-top:4px;flex:none}
#if-location{position:fixed;left:14px;bottom:16px;z-index:60;display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:calc(100vw - 28px);padding:7px;border-radius:40px;background:rgba(6,17,28,.92);border:1px solid #1d4263}
#if-location button{margin:0;padding:7px 11px;border-radius:30px;background:#1fb5d9;color:#02070d;border:0;font:600 12px system-ui,sans-serif;cursor:pointer}
#if-location button.ghost{background:transparent;color:#d1e4f0;border:1px solid #1d4263}
#if-location button:disabled{opacity:.45;cursor:default}
#if-location .readout{color:#9cbacf;font:11px system-ui,sans-serif;padding:0 6px;white-space:nowrap}
#if-location-prompt-backdrop{position:fixed;inset:0;z-index:79;background:rgba(2,7,13,.55);display:none}
#if-location-prompt-backdrop.open{display:block}
#if-location-prompt{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:80;width:min(430px,calc(100vw - 28px));padding:18px;border-radius:16px;background:rgba(6,17,28,.98);border:1px solid #1d4263;color:#d1e4f0;font:13px system-ui,sans-serif;display:none;box-shadow:0 24px 60px rgba(0,0,0,.55)}
#if-location-prompt.open{display:block}
#if-location-prompt h2{margin:0 0 8px;font-size:16px}
#if-location-prompt p{margin:0 0 8px;line-height:1.5;color:#b6cfdf}
#if-location-prompt ul{margin:0 0 12px;padding-left:18px;color:#9cbacf;line-height:1.5}
#if-location-prompt .actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
#if-location-prompt button{margin:0;padding:8px 12px;border-radius:8px;background:#1fb5d9;color:#02070d;border:0;font:600 13px system-ui,sans-serif;cursor:pointer}
#if-location-prompt button.ghost{background:transparent;color:#d1e4f0;border:1px solid #1d4263}
#if-location-prompt button.deny{background:transparent;border:0;color:#9cbacf;text-decoration:underline;padding:8px 4px}
`;

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || data?.detail?.[0]?.msg || `Erreur ${r.status}`);
  return data;
}

function start(viewer) {
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const state = { sensors: [], weather: [], alerts: [], token: sessionStorage.getItem(TOKEN_KEY) || '', rain: 0, rainOn: true, sim: null, frame: 0, water: null, timer: null, picked: null, location: null, locationStatus: 'idle', locationWatch: null, locationCentered: false, locationMessage: '' };
  // Requis par Cesium avant de créer des GroundPrimitive de façon synchrone (hauteurs min/max du terrain).
  const heightsReady = Cesium.GroundPrimitive.initializeTerrainHeights();
  const ds = new Cesium.CustomDataSource('MasterEarth'); viewer.dataSources.add(ds);

  // --- Pluie 3D (effet de post-traitement, visible près du sol)
  viewer.scene.postProcessStages.add(new Cesium.PostProcessStage({
    fragmentShader: RAIN_FRAGMENT,
    uniforms: {
      u_intensity: () => (state.rainOn ? state.rain : 0) * altitudeFade(viewer.camera.positionCartographic.height),
      u_time: () => (performance.now() / 1000) % 1000,
      u_aspect: () => viewer.canvas.clientWidth / Math.max(1, viewer.canvas.clientHeight),
    },
  }));

  // Le moteur passe en rendu « à la demande » quand rien ne bouge : la pluie animée exige un rendu continu.
  let holding = false;
  const syncRainRender = () => {
    const want = state.rainOn && state.rain > 0;
    if (want && !holding) { holdContinuousRender('intelliflood-rain'); holding = true; }
    if (!want && holding) { releaseContinuousRender('intelliflood-rain'); holding = false; }
    governorRequestRender('intelliflood');
  };

  // --- Interface
  const toggle = el('<button id="if-toggle" aria-expanded="false"><i></i>MasterEarth</button>');
  const panel = el(`<aside id="if-panel" aria-label="MasterEarth">
    <strong>État du réseau</strong> <small id="if-status">chargement…</small>
    <h3>Alertes récentes</h3><ul id="if-alerts"></ul>
    <h3>Pluie 3D</h3>
    <label><input type="checkbox" id="if-rain-on" checked style="width:auto"> Afficher la pluie (près du sol)</label>
    <select id="if-rain-src"><option value="real">Pluie réelle du point choisi</option><option value="scenario">Scénario (curseur)</option></select>
    <label id="if-rain-label" class="muted">Intensité : 25 mm/h</label><input id="if-rain-range" type="range" min="0" max="60" value="25">
    <small id="if-rain-info" class="muted">Cliquez un capteur ou un anneau météo pour choisir le point.</small>
    <h3>Simulation d'inondation</h3>
    <div id="if-login"></div>
    <div id="if-simform" hidden>
      <select id="if-mode"><option value="level">Niveau d'eau à un point</option><option value="rain">Pluie sur la zone</option><option value="sensor">Depuis un capteur (niveau mesuré)</option></select>
      <select id="if-sensor"></select>
      <div class="row"><input id="if-lat" type="number" step="any" placeholder="Latitude"><input id="if-lon" type="number" step="any" placeholder="Longitude"></div>
      <div class="row"><input id="if-rise" type="number" step="0.1" min="0" value="1.5" title="Montée de l'eau (m)"><input id="if-rainmm" type="number" step="1" min="0" value="40" title="Pluie (mm/h)" hidden><input id="if-hours" type="number" step="0.5" min="0.5" value="3" title="Durée (h)" hidden></div>
      <div class="row"><input id="if-radius" type="number" min="200" max="5000" step="100" value="1500" title="Rayon (m)"><input id="if-steps" type="number" min="1" max="8" value="6" title="Images de la montée"></div>
      <small class="muted">Rayon en m · nombre d'images · (montée m | pluie mm/h | durée h)</small>
      <div><button id="if-run">Lancer la simulation</button><button id="if-clear" class="ghost">Effacer</button></div>
      <div id="if-play" hidden><button id="if-playbtn" class="ghost">▶ Lecture</button><input id="if-frame" type="range" min="0" value="0"></div>
      <div id="if-result"></div>
    </div>
    <h3>Assistant MasterEarth</h3>
    <div id="if-ai-form" hidden>
      <small id="if-ai-provider-info" class="muted" aria-live="polite"></small>
      <textarea id="if-ai-question" rows="3" maxlength="2000" placeholder="Question sur les données et documents MasterEarth"></textarea>
      <label class="muted"><input type="checkbox" id="if-ai-consent" style="width:auto">
        J'autorise pour cette requête l'envoi de ma question et d'agrégats capteurs/météo au fournisseur indiqué. N'incluez aucune donnée personnelle; aucun média, identifiant ni observation libre n'est envoyé.</label>
      <button id="if-ai-send" class="ghost" disabled>Interroger MasterEarth</button>
      <div id="if-ai-result" class="muted" aria-live="polite"></div>
    </div>
    <p class="warn" style="margin-top:10px">Simulations indicatives (modèle de terrain simplifié) : ni mesures ni prévisions.</p>
  </aside>`);
  const locationBar = el(`<div id="if-location" role="group" aria-label="Localisation">
    <button id="if-locate-btn" type="button">Ma position</button>
    <button id="if-recenter-btn" type="button" class="ghost" disabled>Recentrer</button>
    <span id="if-location-readout" class="readout" aria-live="polite"></span>
  </div>`);
  const locationBackdrop = el('<div id="if-location-prompt-backdrop"></div>');
  const locationPrompt = el(`<section id="if-location-prompt" role="dialog" aria-modal="true" aria-labelledby="if-location-title" aria-describedby="if-location-body">
    <h2 id="if-location-title">Afficher votre position sur le globe ?</h2>
    <p id="if-location-body">MasterEarth World peut afficher votre position et recentrer le globe 3D, où que vous soyez dans le monde.</p>
    <ul>
      <li>La position reste dans votre navigateur : elle n'est ni enregistrée sur le serveur, ni envoyée à un fournisseur IA.</li>
      <li>Sans autorisation, le globe reste entièrement utilisable.</li>
      <li>Vous pouvez la désactiver à tout moment depuis « Réactiver » ou les réglages du navigateur.</li>
    </ul>
    <div class="actions">
      <button id="if-location-allow" type="button">Autoriser ma position</button>
      <button id="if-location-later" type="button" class="ghost">Plus tard</button>
      <button id="if-location-deny" type="button" class="deny">Ne plus me demander</button>
    </div>
  </section>`);
  document.body.append(toggle, panel, locationBar, locationBackdrop, locationPrompt);
  const $ = (id) => panel.querySelector('#' + id);
  toggle.onclick = () => { const o = panel.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(o)); };

  // --- Localisation utilisateur (consentement explicite, position locale uniquement)
  const locationSupported = worldGeolocationSupported();
  const userDs = new Cesium.CustomDataSource('position-utilisateur');
  viewer.dataSources.add(userDs);
  const locateButton = locationBar.querySelector('#if-locate-btn');
  const recenterButton = locationBar.querySelector('#if-recenter-btn');
  const locationReadout = locationBar.querySelector('#if-location-readout');
  const allowLocation = locationPrompt.querySelector('#if-location-allow');
  const laterLocation = locationPrompt.querySelector('#if-location-later');
  const denyLocation = locationPrompt.querySelector('#if-location-deny');
  let locationPromptOpen = false;

  const stopLocationWatch = () => {
    if (state.locationWatch !== null && locationSupported) {
      try { navigator.geolocation.clearWatch(state.locationWatch); } catch { /* suivi déjà invalidé */ }
    }
    state.locationWatch = null;
  };

  const updateLocationMarker = () => {
    userDs.entities.removeAll();
    const p = state.location;
    if (p) {
      userDs.entities.add({
        id: 'user-position',
        name: 'Ma position',
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 40),
        point: {
          pixelSize: 13,
          color: Cesium.Color.fromCssColorString('#37c6f4'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        ellipse: p.accuracyM > 0 ? {
          semiMajorAxis: Math.min(p.accuracyM, 500_000),
          semiMinorAxis: Math.min(p.accuracyM, 500_000),
          material: Cesium.Color.fromCssColorString('#37c6f4').withAlpha(0.14),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#37c6f4').withAlpha(0.7),
          outlineWidth: 1.5,
          height: 40,
        } : undefined,
      });
    }
    // Le libellé « Ma position » passe par le calque d'overlay partagé : les
    // libellés Cesium natifs sont réservés au rendu globe hors overlay.
    setOverlayEntries('intelliflood-location', p ? [{
      id: 'user-position',
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 40),
      variant: 'label',
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      title: 'Ma position',
      accent: '#37c6f4',
      collisionGroup: 'ambient-label',
      paintLane: 'selected',
      priority: 1000,
      gapPx: 18,
      placement: 'above',
    }] : []);
    governorRequestRender('intelliflood-location');
  };

  const updateLocationUi = () => {
    const status = state.locationStatus;
    const labels = { unsupported: 'Non pris en charge', denied: 'Réactiver', locating: 'Localisation…', error: 'Réessayer', ready: 'Ma position', idle: 'Ma position', asking: 'Ma position' };
    const titles = {
      unsupported: 'Ce navigateur ne fournit pas de position géographique.',
      denied: "Localisation refusée. Cliquez pour redemander l'autorisation (ou autorisez-la dans les réglages du navigateur).",
      locating: 'Recherche de votre position en cours.',
      error: state.locationMessage || 'La position n’a pas pu être obtenue. Cliquez pour réessayer.',
      ready: 'Centrer le globe sur votre position.',
      idle: 'Autoriser la localisation et centrer le globe sur votre position.',
      asking: 'Autoriser la localisation et centrer le globe sur votre position.',
    };
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    locateButton.textContent = labels[status] || 'Ma position';
    locateButton.title = titles[status] || titles.idle;
    locateButton.disabled = status === 'unsupported' || status === 'locating';
    recenterButton.disabled = !state.location || status === 'locating';
    if (state.location) {
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      locationReadout.textContent = `${formatWorldCoordinates(state.location.lat, state.location.lon)} · ${formatWorldAccuracy(state.location.accuracyM)}`;
    } else if (status === 'denied') {
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      locationReadout.textContent = 'Localisation refusée';
    } else if (status === 'unsupported') {
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      locationReadout.textContent = 'Non pris en charge';
    } else if (status === 'error') {
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      locationReadout.textContent = 'Position indisponible';
    } else if (status === 'locating') {
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      locationReadout.textContent = 'Recherche…';
    } else {
      locationReadout.textContent = '';
    }
  };

  const centerOnUser = (height = WORLD_RECENTER_HEIGHT_M) => {
    if (!state.location) return false;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(state.location.lon, state.location.lat, height),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-42), roll: 0 },
      duration: 1.8,
    });
    governorRequestRender('intelliflood-location');
    return true;
  };

  const startLocationWatch = () => {
    if (!locationSupported || state.locationWatch !== null) return;
    try {
      state.locationWatch = navigator.geolocation.watchPosition((raw) => {
        const next = normalizeLocationPosition(raw);
        if (!next) return;
        state.location = next;
        state.locationStatus = 'ready';
        updateLocationMarker();
        updateLocationUi();
      }, (failure) => {
        if (failure?.code !== 1) return;
        writeWorldLocationConsent('denied');
        state.locationStatus = 'denied';
        state.location = null;
        state.locationMessage = describeWorldLocationError(failure);
        stopLocationWatch();
        updateLocationMarker();
        updateLocationUi();
      }, { ...WORLD_LOCATION_OPTIONS, maximumAge: 10_000 });
    } catch {
      // La permission a pu être révoquée entre-temps : aucun suivi ne démarre.
    }
  };

  const hideLocationPrompt = () => {
    locationPromptOpen = false;
    locationBackdrop.classList.remove('open');
    locationPrompt.classList.remove('open');
    if (state.locationStatus === 'asking') state.locationStatus = 'idle';
    updateLocationUi();
  };

  const showLocationPrompt = () => {
    locationPromptOpen = true;
    locationBackdrop.classList.add('open');
    locationPrompt.classList.add('open');
    window.setTimeout(() => allowLocation.focus(), 60);
  };

  const requestLocation = ({ centerHeight = WORLD_RECENTER_HEIGHT_M } = {}) => {
    hideLocationPrompt();
    if (!locationSupported) {
      state.locationStatus = 'unsupported';
      updateLocationUi();
      return;
    }
    state.locationStatus = 'locating';
    state.locationMessage = '';
    updateLocationUi();
    navigator.geolocation.getCurrentPosition((raw) => {
      const next = normalizeLocationPosition(raw);
      if (!next) {
        state.locationStatus = 'error';
        state.locationMessage = 'Position reçue invalide.';
        updateLocationUi();
        return;
      }
      state.location = next;
      state.locationStatus = 'ready';
      state.locationMessage = '';
      writeWorldLocationConsent('granted');
      updateLocationMarker();
      updateLocationUi();
      startLocationWatch();
      if (centerHeight) centerOnUser(centerHeight);
    }, (failure) => {
      if (failure?.code === 1) {
        writeWorldLocationConsent('denied');
        state.locationStatus = 'denied';
        state.location = null;
        stopLocationWatch();
        updateLocationMarker();
      } else {
        state.locationStatus = 'error';
      }
      state.locationMessage = describeWorldLocationError(failure);
      updateLocationUi();
    }, WORLD_LOCATION_OPTIONS);
  };

  locateButton.onclick = () => {
    if (state.location && state.locationStatus === 'ready') centerOnUser();
    else requestLocation();
  };
  recenterButton.onclick = () => centerOnUser();
  allowLocation.onclick = () => requestLocation();
  laterLocation.onclick = hideLocationPrompt;
  denyLocation.onclick = () => {
    writeWorldLocationConsent('denied');
    state.locationStatus = 'denied';
    state.location = null;
    state.locationMessage = '';
    stopLocationWatch();
    updateLocationMarker();
    hideLocationPrompt();
  };
  locationBackdrop.onclick = hideLocationPrompt;
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && locationPromptOpen) {
      event.preventDefault();
      hideLocationPrompt();
    }
  });
  updateLocationUi();

  void (async () => {
    if (!locationSupported) {
      state.locationStatus = 'unsupported';
      updateLocationUi();
      return;
    }
    const stored = readWorldLocationConsent();
    if (stored === 'granted') {
      requestLocation({ centerHeight: WORLD_FIRST_VIEW_HEIGHT_M });
      return;
    }
    if (stored === 'denied') {
      state.locationStatus = 'denied';
      updateLocationUi();
      return;
    }
    const permission = await queryWorldLocationPermission();
    if (permission === 'granted') {
      requestLocation({ centerHeight: WORLD_FIRST_VIEW_HEIGHT_M });
      return;
    }
    if (permission === 'denied') {
      writeWorldLocationConsent('denied');
      state.locationStatus = 'denied';
      updateLocationUi();
      return;
    }
    state.locationStatus = 'asking';
    updateLocationUi();
    showLocationPrompt();
  })();

  // --- Données en direct
  const refresh = async () => {
    try {
      [state.sensors, state.weather, state.alerts] = await Promise.all([api('/api/v1/sensors'), api('/api/v1/weather').catch(() => []), api('/api/v1/alerts?limit=5')]);
      ds.entities.removeAll();
      state.sensors.forEach((s) => ds.entities.add({ id: 'sensor:' + s.code, position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 30), name: s.name,
        point: { pixelSize: 15, color: Cesium.Color.fromCssColorString(COLORS[s.alert_level]), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      setOverlayEntries('intelliflood-sensors', state.sensors.map((s) => ({
        id: 'sensor:' + s.code,
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 30),
        variant: 'label',
        title: s.name,
        accent: COLORS[s.alert_level],
        collisionGroup: 'ambient-label',
        paintLane: 'ambient-label',
        maxDistance: 300000,
        gapPx: 24,
        verticalOnly: true,
        placement: 'above',
      })));
      state.weather.forEach((w) => ds.entities.add({ id: 'weather:' + w.name, position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat, 30), name: 'Pluie — ' + w.name,
        point: { pixelSize: 22, color: Cesium.Color.fromCssColorString(COLORS[w.level]).withAlpha(0.28), outlineColor: Cesium.Color.fromCssColorString(COLORS[w.level]), outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      const worst = state.sensors.some((s) => s.alert_level === 'red') ? 'red' : state.sensors.some((s) => s.alert_level === 'orange') ? 'orange' : 'green';
      toggle.querySelector('i').style.background = COLORS[worst];
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      $('if-status').textContent = `${state.sensors.length} capteurs · situation ${LABELS[worst]}`;
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      $('if-alerts').innerHTML = state.alerts.map((a) => `<li><i style="background:${COLORS[a.level]}"></i><span>${esc(a.message)}<br><small>${new Date(a.triggered_at).toLocaleString('fr-FR')}</small></span></li>`).join('') || '<li><span class="muted">Aucune alerte.</span></li>';
      $('if-sensor').innerHTML = state.sensors.map((s) => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
      applyRain(); governorRequestRender('intelliflood-data');
    } catch (e) {
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      $('if-status').innerHTML = '<span class="err">API MasterEarth injoignable</span>';
    }
  };
  const applyRain = () => {
    const mode = $('if-rain-src').value;
    $('if-rain-range').hidden = $('if-rain-label').hidden = mode !== 'scenario';
    let mm = Number($('if-rain-range').value);
    if (mode === 'real') {
      const p = state.picked; const w = p && (p.startsWith('weather:') ? state.weather.find((x) => 'weather:' + x.name === p)
        : state.weather.reduce((b, x) => { const s = state.sensors.find((q) => 'sensor:' + q.code === p); return s && (!b || Math.hypot(x.lat - s.lat, x.lon - s.lon) < Math.hypot(b.lat - s.lat, b.lon - s.lon)) ? x : b; }, null));
      mm = w ? w.intensity_3h_mm_h : 0;
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      $('if-rain-info').textContent = w ? `Pluie des 3 prochaines heures à ${w.name} : ${mm} mm/h (${w.source})` : 'Cliquez un capteur ou un anneau météo pour choisir le point.';
    } else {
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      $('if-rain-label').textContent = `Intensité : ${mm} mm/h`;
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      $('if-rain-info').textContent = 'Scénario : pluie fictive pour illustration.';
    }
    state.rain = rainVisual(mm); syncRainRender();
  };
  $('if-rain-on').onchange = (e) => { state.rainOn = e.target.checked; syncRainRender(); };
  $('if-rain-src').onchange = $('if-rain-range').oninput = applyRain;
  new Cesium.ScreenSpaceEventHandler(viewer.canvas).setInputAction((m) => {
    const o = viewer.scene.pick(m.position); const id = o?.id?.id;
    if (typeof id === 'string' && (id.startsWith('sensor:') || id.startsWith('weather:'))) {
      state.picked = id; applyRain();
      const e = ds.entities.getById(id); const c = e?.position?.getValue(Cesium.JulianDate.now());
      if (c) { const g = Cesium.Cartographic.fromCartesian(c); $('if-lat').value = Cesium.Math.toDegrees(g.latitude).toFixed(5); $('if-lon').value = Cesium.Math.toDegrees(g.longitude).toFixed(5); }
      if (id.startsWith('sensor:')) $('if-sensor').value = id.slice(7);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // --- Simulation d'inondation
  const showLogin = () => {
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    $('if-login').innerHTML = state.token ? '<small class="ok">Connecté.</small> <button class="ghost" id="if-logout">Déconnexion</button>'
      : '<small class="muted">Connexion requise pour simuler.</small><input id="if-email" type="email" placeholder="E-mail" autocomplete="username"><input id="if-pass" type="password" placeholder="Mot de passe" autocomplete="current-password"><button id="if-loginbtn">Se connecter</button> <small id="if-loginerr" class="err"></small>';
    $('if-simform').hidden = !state.token;
    $('if-ai-form').hidden = !state.token;
    state.aiStatusReady = false;
    $('if-ai-consent').checked = false;
    $('if-ai-question').value = '';
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    $('if-ai-provider-info').textContent = state.token ? 'Vérification des fournisseurs IA…' : 'Connexion requise.';
    const updateAiSend = () => {
      $('if-ai-send').disabled = !state.token || !state.aiStatusReady
        || !$('if-ai-consent').checked || !$('if-ai-question').value.trim();
    };
    if (state.token) {
      const activeToken = state.token;
      api('/api/v1/ai/status', { token: activeToken }).then((status) => {
        if (state.token !== activeToken) return;
        state.aiStatusReady = true;
        // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
        $('if-ai-provider-info').textContent = status.providers.length
          ? status.providers.map((provider) => `${provider.name} (${provider.models.join(', ')}): ${provider.billing_note}`).join(' · ')
          : 'Aucun fournisseur IA configuré; le serveur répondra en mode local déterministe.';
        updateAiSend();
      }).catch(() => {
        if (state.token !== activeToken) return;
        // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
        $('if-ai-provider-info').textContent = 'Destinataires impossibles à vérifier; aucune question ne sera envoyée.';
      });
    }
    const b = $('if-loginbtn'); if (b) b.onclick = async () => {
      try { const r = await api('/api/v1/auth/login', { method: 'POST', body: { email: $('if-email').value, password: $('if-pass').value } }); state.token = r.access_token; sessionStorage.setItem(TOKEN_KEY, state.token); showLogin(); }
      catch (e) { $('if-loginerr').textContent = e.message; }
    };
    $('if-ai-consent').onchange = () => {
      updateAiSend();
    };
    $('if-ai-question').oninput = () => {
      updateAiSend();
    };
    $('if-ai-send').onclick = async () => {
      const question = $('if-ai-question').value.trim();
      if (!state.token || !state.aiStatusReady || !question || !$('if-ai-consent').checked) return;
      $('if-ai-send').disabled = true;
      // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
      $('if-ai-result').textContent = 'Analyse en cours…';
      try {
        const result = await api('/api/v1/ai/assistant', {
          method: 'POST',
          token: state.token,
          body: { message: question, mode: 'answer', external_consent: true, surface: 'gev' },
        });
        // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
        $('if-ai-result').textContent = `${result.mode === 'cloud_ai' ? `IA ${result.provider} / ${result.model}` : 'Mode local déterministe'}\n${result.answer}\nSources : ${(result.sources || []).join('; ')}\nInformation non décisionnelle; validation humaine requise.`;
        $('if-ai-question').value = '';
        $('if-ai-consent').checked = false;
      } catch (e) {
        $('if-ai-result').textContent = e.message;
        if (/connexion|session/i.test(e.message)) { state.token = ''; sessionStorage.removeItem(TOKEN_KEY); showLogin(); }
      } finally {
        $('if-ai-consent').checked = false;
        updateAiSend();
      }
    };
    const o = $('if-logout'); if (o) o.onclick = () => { state.token = ''; sessionStorage.removeItem(TOKEN_KEY); showLogin(); };
  };
  const syncMode = () => { const m = $('if-mode').value; $('if-sensor').hidden = m !== 'sensor'; $('if-rise').hidden = m === 'rain'; $('if-rainmm').hidden = $('if-hours').hidden = m !== 'rain'; };
  $('if-mode').onchange = syncMode; syncMode();

  const clearWater = () => { if (state.water) { viewer.scene.primitives.remove(state.water); state.water = null; } clearInterval(state.timer); state.timer = null; governorRequestRender('intelliflood-water'); };
  const showFrame = (idx) => {
    const sim = state.sim; if (!sim) return;
    const fr = sim.frames.length ? sim.frames[idx] : { depth_cm_b64: sim.depth_cm_b64 };
    if (state.water) viewer.scene.primitives.remove(state.water);
    state.water = buildWaterPrimitive(sim, b64ToU16(fr.depth_cm_b64), b64ToU8(sim.possible_b64), true);
    if (state.water) viewer.scene.primitives.add(state.water);
    governorRequestRender('intelliflood-water');
    const info = sim.frames.length ? `Image ${idx + 1}/${sim.frames.length} — max ${fr.max_depth_m} m, ${fr.area_km2} km²` : '';
    $('if-result').dataset.frame = info; renderResult();
  };
  const renderResult = () => {
    const s = state.sim; if (!s) { $('if-result').innerHTML = ''; return; }
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    $('if-result').innerHTML = `<p><strong>Profondeur max ${s.stats.max_depth_m} m</strong> · ${s.stats.area_km2} km² (possible : ${s.stats.possible_area_km2} km²) · ${s.stats.volume_m3.toLocaleString('fr-FR')} m³<br><small>${esc($('if-result').dataset.frame || '')}</small></p>
      <details><summary>Hypothèses</summary><ul>${s.assumptions.map((a) => `<li><span>${esc(a)}</span></li>`).join('')}</ul></details><p class="warn">${esc(s.disclaimer)}</p>
      <small class="muted">Jaune : étendue possible compte tenu de l'incertitude du terrain.</small>`;
  };
  $('if-run').onclick = async () => {
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    const mode = $('if-mode').value; $('if-result').innerHTML = '<small class="muted">Calcul en cours…</small>';
    const body = { mode, radius_m: Number($('if-radius').value), steps: Number($('if-steps').value), cells: 120 };
    if (mode === 'sensor') body.sensor_code = $('if-sensor').value; else { body.lat = Number($('if-lat').value); body.lon = Number($('if-lon').value); }
    if (mode === 'level') body.rise_m = Number($('if-rise').value);
    if (mode === 'rain') { body.rain_mm_h = Number($('if-rainmm').value); body.hours = Number($('if-hours').value); }
    try {
      state.sim = await api('/api/v1/simulations/flood', { method: 'POST', body, token: state.token });
      await heightsReady; clearWater(); const n = state.sim.frames.length;
      $('if-play').hidden = n < 2; $('if-frame').max = Math.max(0, n - 1); $('if-frame').value = Math.max(0, n - 1);
      showFrame(Math.max(0, n - 1));
      if (mode === 'rain') { $('if-rain-src').value = 'scenario'; $('if-rain-range').value = Math.min(60, body.rain_mm_h); applyRain(); }
      const c = state.sim.center;
      const r = body.radius_m || 1500;  // cadrage centré sur la zone simulée
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0), r), { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-42), r * 3.2), duration: 2.5 });
    } catch (e) { $('if-result').innerHTML = `<span class="err">${esc(e.message)}</span>`; if (/connexion|session/i.test(e.message)) { state.token = ''; showLogin(); } }
  };
  $('if-frame').oninput = (e) => showFrame(Number(e.target.value));
  $('if-playbtn').onclick = () => {
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    if (state.timer) { clearInterval(state.timer); state.timer = null; $('if-playbtn').textContent = '▶ Lecture'; return; }
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    $('if-playbtn').textContent = '⏸ Pause'; let i = 0;
    // i18n-ignore: MasterEarth's domain UI is intentionally French-only.
    state.timer = setInterval(() => { showFrame(i); $('if-frame').value = i; i++; if (i >= state.sim.frames.length) { clearInterval(state.timer); state.timer = null; $('if-playbtn').textContent = '▶ Lecture'; } }, 900);
  };
  $('if-clear').onclick = () => { clearWater(); state.sim = null; $('if-play').hidden = true; renderResult(); };

  showLogin(); refresh(); setInterval(refresh, 15000);
}

const existing = globalThis.__intelliFloodViewer;
if (existing) start(existing); else globalThis.addEventListener?.('intelliflood:viewer', (e) => start(e.detail), { once: true });
