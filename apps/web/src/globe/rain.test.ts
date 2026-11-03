import { expect, it } from "vitest";
import { STORM_FRAGMENT } from "./rain";

it("keeps single-line block comments out of Cesium GLSL shaders", () => {
  expect(STORM_FRAGMENT).not.toMatch(/\/\*[^*\r\n]*\*\//);
});

it("preserves the globe colors while compositing storm effects", () => {
  expect(STORM_FRAGMENT).toContain("vec3 col = c.rgb;");
  expect(STORM_FRAGMENT).toContain("col = mix(col, floodCol,");
  expect(STORM_FRAGMENT).toContain("out_FragColor = vec4(col, c.a);");
  expect(STORM_FRAGMENT).not.toMatch(
    /^\s*col = vec3\(clamp\(r \* 2\.0/m,
  );
});
