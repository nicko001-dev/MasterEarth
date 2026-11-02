/** Pluie 3D : effet GPU plein écran (traînées, voile gris). Intensité 0..1 ; aucune traînée sans pluie. */
export const RAIN_FRAGMENT = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform float u_intensity;
uniform float u_time;
uniform float u_aspect;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float streaks(vec2 uv, float scale, float speed, float density, float slant) {
  vec2 g = vec2((uv.x + uv.y * slant) * scale * u_aspect, uv.y * scale * 0.12 + u_time * speed);
  vec2 id = floor(g); vec2 f = fract(g);
  float on = step(1.0 - density, hash(id));
  float x = abs(f.x - 0.5 + (hash(id + 7.0) - 0.5) * 0.5);
  return on * smoothstep(0.07, 0.0, x) * smoothstep(0.0, 0.25, f.y) * smoothstep(1.0, 0.45, f.y);
}
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  float k = clamp(u_intensity, 0.0, 1.0);
  float r = streaks(v_textureCoordinates, 60.0, 5.0, 0.10 + 0.30 * k, 0.22) * 0.80
          + streaks(v_textureCoordinates, 110.0, 8.5, 0.08 + 0.25 * k, 0.22) * 0.55
          + streaks(v_textureCoordinates, 200.0, 12.0, 0.06 + 0.20 * k, 0.22) * 0.35;
  r *= smoothstep(0.0, 0.06, k);
  vec3 grey = vec3(dot(c.rgb, vec3(0.299, 0.587, 0.114))) * 0.78;
  vec3 col = mix(c.rgb, grey, 0.55 * k);
  col = mix(col, vec3(0.62, 0.70, 0.78), 0.18 * k);
  col += vec3(0.78, 0.88, 1.0) * r * (0.35 + 0.65 * k);
  out_FragColor = vec4(col, c.a);
}`;
export const rainVisual = (mmPerHour) => Math.max(0, Math.min(1, mmPerHour / 50));
export const altitudeFade = (h) => Math.max(0, Math.min(1, 1 - (h - 2000) / 148000));
