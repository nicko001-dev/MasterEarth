import { expect, it } from "vitest";
import { centerFromBounds } from "./assistantContext";

it("calcule le centre d'une emprise ordinaire", () => {
  expect(centerFromBounds({ west: -4.1, south: 5.3, east: -3.9, north: 5.5 })).toEqual({
    lat: 5.4,
    lon: -4,
  });
});

it("gère une emprise qui traverse l'antiméridien", () => {
  expect(centerFromBounds({ west: 170, south: -20, east: -170, north: -10 })).toEqual({
    lat: -15,
    lon: 180,
  });
  expect(centerFromBounds({ west: 170, south: -20, east: 190, north: -10 })).toEqual({
    lat: -15,
    lon: 180,
  });
});

it("borne les latitudes et normalise une longitude hors intervalle", () => {
  expect(centerFromBounds({ west: 170, south: -100, east: 200, north: 100 })).toEqual({
    lat: 0,
    lon: -175,
  });
});
