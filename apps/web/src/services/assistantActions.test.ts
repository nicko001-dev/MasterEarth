import { describe, expect, it } from "vitest";
import {
  describeAction,
  normalizeAction,
  parseAssistantActions,
  resolveLocalCommand,
  AssistantAction,
} from "./assistantActions";
import { parsePlacesDataset } from "../globe/places";

const places = parsePlacesDataset({
  places: [
    ["Paris", 48.8566, 2.3522, 2_138_551, "FR", "France", "Île-de-France", true],
    ["Abidjan", 5.36, -4.01, 4_980_000, "CI", "Côte d'Ivoire", "Abidjan", true],
    ["Tokyo", 35.6895, 139.6917, 8_336_599, "JP", "Japon", "Tokyo", true],
  ],
}).places;

const sensors = [
  { code: "CI-ABJ-001", name: "Cocody — pont" },
  { code: "CI-ABJ-002", name: "Yopougon — canal" },
];

describe("validation des actions du serveur", () => {
  it("accepte les actions prévues et écarte tout le reste", () => {
    const actions = parseAssistantActions([
      { type: "fly_to", lat: 48.85, lon: 2.35, height: 60_000, label: "Paris" },
      { type: "set_view", view: "globe" },
      { type: "open_tab", tab: "meteo" },
      { type: "set_layer", layer: "radar", enabled: false },
      { type: "locate_user" },
      { type: "opens_the_door" },
      { type: "fly_to", lat: 200, lon: 2 },
      { type: "open_tab", tab: "menu" },
      { type: "select_sensor", code: "  " },
    ]);
    expect(actions.map((action) => action.type)).toEqual([
      "fly_to",
      "set_view",
      "open_tab",
      "set_layer",
      "locate_user",
    ]);
    expect(actions[0]).toMatchObject({ type: "fly_to", lat: 48.85, label: "Paris" });
    expect(parseAssistantActions("nope")).toEqual([]);
  });

  it("plafonne le nombre d'actions exécutées", () => {
    const many = Array.from({ length: 12 }, () => ({ type: "zoom", direction: "in" }));
    expect(parseAssistantActions(many)).toHaveLength(6);
    expect(parseAssistantActions(many, 2)).toHaveLength(2);
  });

  it("garde des valeurs finies uniquement", () => {
    expect(normalizeAction({ type: "fly_to", lat: Number.NaN, lon: 2 })).toBeNull();
    expect(normalizeAction({ type: "fly_to", lat: 1, lon: 2, height: Number.POSITIVE_INFINITY })).toMatchObject({
      height: null,
    });
  });

  it("décrit chaque action en français", () => {
    const actions: AssistantAction[] = [
      { type: "fly_to", lat: 48.85, lon: 2.35, label: "Paris" },
      { type: "set_layer", layer: "borders", enabled: false },
      { type: "open_tab", tab: "alertes" },
      { type: "reset_view" },
    ];
    expect(actions.map(describeAction)).toEqual([
      "vol vers Paris",
      "masquage : frontières",
      "ouverture : alertes",
      "retour à la vue mondiale",
    ]);  });
});

describe("commandes locales", () => {
  it("navigue vers un lieu du monde", () => {
    const command = resolveLocalCommand("Va à Paris", { places });
    expect(command?.actions).toEqual([
      { type: "set_view", view: "globe" },
      { type: "fly_to", lat: 48.8566, lon: 2.3522, height: 60_000, label: "Paris" },
    ]);
    expect(command?.answer).toContain("Paris");
  });

  it("reconnaît un lieu sans accent ni majuscule", () => {
    const command = resolveLocalCommand("zoome sur abidjan", { places });
    expect(command?.actions.some((action) => action.type === "fly_to")).toBe(true);
  });

  it("pilote les vues, les couches et le zoom", () => {
    expect(resolveLocalCommand("passe en carte 2D", {})?.actions).toEqual([{ type: "set_view", view: "map" }]);
    expect(resolveLocalCommand("affiche le radar", {})?.actions).toEqual([
      { type: "set_layer", layer: "radar", enabled: true },
    ]);
    expect(resolveLocalCommand("cache les frontières", {})?.actions).toEqual([
      { type: "set_layer", layer: "borders", enabled: false },
    ]);
    expect(resolveLocalCommand("affiche les avions", {})?.actions).toEqual([
      { type: "set_layer", layer: "aircraft", enabled: true },
    ]);
    expect(resolveLocalCommand("zoom avant", {})?.actions).toEqual([{ type: "zoom", direction: "in" }]);
    expect(resolveLocalCommand("ouvre la météo", {})?.actions).toEqual([{ type: "open_tab", tab: "meteo" }]);
    expect(resolveLocalCommand("vue mondiale", {})?.actions).toEqual([{ type: "reset_view" }]);
  });

  it("centre sur la position de l'utilisateur quand elle est connue", () => {
    const command = resolveLocalCommand("Où suis-je ?", {
      places,
      userPosition: { lat: 5.4, lon: -4.0, accuracyM: 20, timestamp: Date.now() },
    });
    expect(command?.actions[0]).toEqual({ type: "locate_user" });
    expect(command?.answer).toContain("Abidjan");
  });

  it("explique l'absence de position sans déclencher de vol", () => {
    const command = resolveLocalCommand("Où suis-je ?", {});
    expect(command?.actions).toEqual([{ type: "locate_user" }]);
    expect(command?.answer).toMatch(/Autorisez la localisation/);
  });

  it("sélectionne un capteur par son nom", () => {
    const command = resolveLocalCommand("affiche le capteur Cocody", { sensors });
    expect(command?.actions).toEqual([
      { type: "select_sensor", code: "CI-ABJ-001" },
      { type: "open_tab", tab: "capteurs" },
    ]);
  });

  it("ne détourne pas une question ordinaire", () => {
    expect(resolveLocalCommand("Résume les tendances observées et leurs limites", {})).toBeNull();
  });
});
