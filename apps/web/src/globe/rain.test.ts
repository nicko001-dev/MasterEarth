import { expect, it } from "vitest";
import { STORM_FRAGMENT } from "./rain";

it("keeps single-line block comments out of Cesium GLSL shaders", () => {
  expect(STORM_FRAGMENT).not.toMatch(/\/\*[^*\r\n]*\*\//);
});
