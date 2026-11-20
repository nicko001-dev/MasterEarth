/**
 * Ciel d'orage ancré sur la zone pluvieuse : cumulonimbus procédural et
 * rideau de pluie dessinés en espace écran à partir des positions projetées
 * de la base du nuage et du sol. Le nuage reste solidaire de sa zone et la
 * pluie tombe visiblement de sa base, quel que soit l'angle de vue.
 */
export const STORM_FRAGMENT = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform float u_intensity;
uniform float u_time;
uniform float u_aspect;
uniform vec2 u_cloud;
uniform vec2 u_cloudSize;
uniform vec2 u_center;
uniform vec2 u_ground;
uniform float u_radius;
uniform float u_max_depth;

// Profondeur maximale d'inondation (m) provenant du résultat de simulation.
uniform float u_flood_depth;

/** Longueur écran minimale du rideau : une pluie vue de dessus serait sinon
 *  réduite à un trait illisible. */
const float MIN_SHAFT = 0.22;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

// Une couche de gouttes : traits fins et hauts dont la position, la
// longueur et l'opacité varient. Casser cette régularité évite l'aspect
// de motif répété. La hauteur des traits est relative au rideau pour que
// les gouttes gardent la bonne longueur à l'écran.
float drops(vec2 uv, float cols, float rows, float shaftLen, float speed, float density, float slant, float seed) {
  vec2 q = vec2((uv.x + uv.y * slant) * cols, uv.y / max(shaftLen, 0.001) * rows);
  q.y += u_time * speed;
  vec2 cell = floor(q);
  vec2 f = fract(q);
  float on = step(1.0 - density, hash(cell + seed));
  // Chaque goutte a sa propre inclinaison et sa propre largeur : sans cela,
  // toutes les stries sont parallèles et le rideau paraît trop régulier.
  float tilt = (hash(cell + seed + 71.0) - 0.5) * 0.55;
  float x = f.x - 0.2 - 0.6 * hash(cell + seed + 13.0) + (f.y - 0.5) * tilt;
  float width = smoothstep(0.22 + 0.10 * hash(cell + seed + 89.0), 0.03, abs(x));
  float head = fract(f.y + hash(cell + seed + 29.0));
  float len = 0.45 + 0.55 * hash(cell + seed + 41.0);
  float body = smoothstep(0.0, 0.08, head) * smoothstep(len, len - 0.3, head);
  return on * width * body * (0.40 + 0.60 * hash(cell + seed + 57.0));
}

// Cumulonimbus : silhouette lobée par du bruit fractal, base plate et sombre,
// sommet plus clair. Le paramètre base est le centre de la base du nuage.
vec3 cumulus(vec2 p, vec2 base, vec2 size, out float alpha) {
  vec2 rel = (p - base) / max(size, vec2(0.0005));
  vec2 centered = vec2(rel.x, rel.y - 0.55);
  float detail = fbm(rel * vec2(3.4, 4.2) + vec2(u_time * 0.01, 0.0));
  float d = length(centered * vec2(0.92, 1.18)) + (0.5 - detail) * 0.78;
  float body = 1.0 - smoothstep(0.74, 1.0, d);
  float flatBase = smoothstep(0.0, 0.24, rel.y);
  alpha = body * flatBase;
  float shade = clamp(0.20 + 0.58 * rel.y + 0.55 * (detail - 0.5), 0.0, 1.0);
  vec3 deep = vec3(0.14, 0.19, 0.27);
  vec3 pale = vec3(0.94, 0.97, 1.0);
  vec3 col = mix(deep, pale, shade);
  // Liseré froid sur les flancs, comme une masse d'orage rétroéclairée.
  col = mix(col, vec3(0.58, 0.70, 0.86), smoothstep(0.58, 0.95, d) * 0.32);
  return col;
}

void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  vec3 col = c.rgb;
  float intensity = clamp(u_intensity, 0.0, 1.0);

  // Rejet rapide : hors du nuage et du rideau, on ne calcule rien.
  vec2 p = v_textureCoordinates * vec2(u_aspect, 1.0);
  vec2 cloudBase = u_cloud * vec2(u_aspect, 1.0);
  vec2 cloudRel = (p - cloudBase) / max(u_cloudSize, vec2(0.0005));
  float nearCloud = step(max(abs(cloudRel.x) / 1.35, abs(cloudRel.y - 0.55) / 1.5), 1.0);
  vec2 a0 = u_center * vec2(u_aspect, 1.0);
  vec2 b0 = u_ground * vec2(u_aspect, 1.0);
  vec2 ab0 = b0 - a0;
  float segLen0 = length(ab0);
  vec2 axis0 = segLen0 > 0.0001 ? ab0 / segLen0 : vec2(0.0, -1.0);
  float shaftLen0 = max(segLen0, MIN_SHAFT);
  float along0 = clamp(dot(p - a0, axis0), 0.0, shaftLen0);
  float nearShaft = step(length(p - (a0 + axis0 * along0)), u_radius * 1.4 + 0.02);
  // Zone violette au sol : disque autour du point de pluie
  float groundDist = length(p - b0) / max(u_radius, 0.0001);
  float nearGround = step(groundDist, 1.6);
  if (intensity <= 0.002 || (nearCloud < 0.5 && nearShaft < 0.5 && nearGround < 0.5)) {
    out_FragColor = c;
    return;
  }

  // Rideau de pluie : de la base du nuage vers le sol, prolongé à l'écran
  // lorsque la vue plongeante écrase la colonne réelle.
  vec2 a = a0;
  vec2 axis = axis0;
  float shaftLen = shaftLen0;
  float along = along0;
  float t = along / shaftLen;
  float radial = length(p - (a + axis * along)) / max(u_radius * (0.5 + 0.7 * t), 0.0001);
  // Bords et extrémités irréguliers : le bruit évite l'ovale et la ligne
  // horizontale parfaits que produirait une simple découpe.
  float wobble = (noise(vec2(t * 5.0, u_time * 0.15)) - 0.5) * 0.30;
  float edge = 1.0 - smoothstep(0.55, 1.0, radial + wobble);
  float tail = 0.62 + 0.30 * noise(vec2(t * 2.6 + u_time * 0.08, 2.0));
  float shaft = smoothstep(0.02, 0.14, t) * (1.0 - smoothstep(tail, 1.0, t));
  float k = intensity * edge * shaft;

  float r = 0.0;
  if (k > 0.001) {
    r = drops(v_textureCoordinates, 42.0, 5.0, shaftLen, 2.4, 0.45 + 0.32 * k, 0.20, 0.0) * 0.62
      + drops(v_textureCoordinates, 78.0, 8.0, shaftLen, 3.8, 0.40 + 0.30 * k, 0.24, 3.1) * 0.44
      + drops(v_textureCoordinates, 138.0, 13.0, shaftLen, 5.4, 0.34 + 0.28 * k, 0.29, 7.7) * 0.32;
    // La pluie est plus dense près du nuage et s'estompe vers le sol.
    r *= smoothstep(0.0, 0.05, k) * (0.55 + 0.45 * (1.0 - t));
  }

  // Voile gris-bleu : la pluie assombrit et désature la scène sous le nuage.
  float veil = k * (0.35 + 0.45 * (1.0 - t));
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(luma) * 0.74, 0.42 * veil);
  col = mix(col, vec3(0.40, 0.55, 0.72), 0.26 * veil);
  col += vec3(0.76, 0.87, 1.0) * r * (0.55 + 0.95 * k);

  // Zone pluvieuse au sol : simple voile très doux. La délimitation nette est
  // désormais dessinée par une ellipse vectorielle (trait franc à tout zoom),
  // et non par ce dégradé écran qui devenait flou en s'agrandissant.
  float rainGroundEdge = 1.0 - smoothstep(0.55, 1.0, groundDist);
  float groundNoise = fbm(v_textureCoordinates * 18.0 + vec2(u_time * 0.02, 0.0));
  float violetAlpha = rainGroundEdge * intensity * 0.16 * (0.65 + 0.35 * groundNoise);
  vec3 violetCol = vec3(0.45, 0.0, 0.65);
  col = mix(col, violetCol, violetAlpha);

  // Zones inondées : bleu dont l'intensité croît avec la profondeur.
  // Le bleu est appliqué via l'overlay de la surface du MNT (GroundPrimitive),
  // mais le shader ajoute un halo subtil autour de la zone d'impact.
  float floodAlpha = smoothstep(0.0, 0.5, u_flood_depth);
  vec3 floodShallow = vec3(0.40, 0.65, 1.0);  // bleu clair
  vec3 floodDeep    = vec3(0.0, 0.12, 0.55);   // bleu profond
  // On utilise u_max_depth pour moduler la couleur : plus c'est profond, plus c'est bleu pur.
  vec3 floodCol = mix(floodShallow, floodDeep, clamp(u_max_depth / 2.0, 0.0, 1.0));
  col = mix(col, floodCol, floodAlpha * 0.45 * rainGroundEdge);

  float mist = exp(-pow((t - 0.95) / 0.10, 2.0)) * edge;
  col += vec3(0.42, 0.60, 0.80) * mist * 0.16 * k;

  // Nuage par-dessus le rideau : sa base coïncide avec le haut de la pluie.
  if (nearCloud > 0.5) {
    float cloudAlpha = 0.0;
    vec3 cloudCol = cumulus(p, cloudBase, u_cloudSize, cloudAlpha);
    col = mix(col, cloudCol, clamp(cloudAlpha, 0.0, 1.0) * (0.60 + 0.36 * intensity));
  }

  out_FragColor = vec4(col, c.a);
}`;

/** Intensité visuelle 0..1 à partir d'une intensité de pluie en mm/h (saturation vers 50 mm/h). */
export const rainVisual = (mmPerHour: number) => Math.max(0, Math.min(1, mmPerHour / 50));

/** La pluie n'est dessinée que près du sol : fondu entre 2 km et 150 km d'altitude caméra. */
export const altitudeFade = (heightM: number) => Math.max(0, Math.min(1, 1 - (heightM - 2000) / 148000));
