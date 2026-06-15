/** Shared import-mesh brightness / metalness / roughness for Shader Lab prep passes. */

export const CREATIVE_LOOK_PREP_PBR_UNIFORMS_GLSL = /* glsl */ `
uniform float uMetalness;
uniform float uRoughness;
`;

export const CREATIVE_LOOK_PREP_BRIGHTNESS_UNIFORM_GLSL = /* glsl */ `
uniform float uBrightness;
`;

export const CREATIVE_LOOK_PREP_PBR_FUNCTIONS_GLSL = /* glsl */ `
vec3 creativeLookModulatePrepPbr(vec3 lit, vec3 baseCol, vec3 N, vec3 V) {
  float metal = clamp(uMetalness, 0.0, 1.0);
  float rough = clamp(uRoughness, 0.02, 1.0);
  vec3 L = normalize(vec3(0.35, 0.92, 0.42));
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float ndv = max(dot(N, V), 0.0);

  float diffScale = mix(1.0, mix(0.62, 1.08, ndl), metal * 0.45);
  lit *= diffScale;

  float specPow = mix(96.0, 6.0, rough);
  float spec = pow(ndh, specPow) * mix(0.1, 0.9, 1.0 - rough * 0.55);
  spec *= mix(0.12, 1.0, metal);
  float rim = pow(1.0 - ndv, mix(2.4, 5.5, rough));
  rim *= mix(0.05, 0.4, metal) * mix(0.5, 1.0, 1.0 - rough);
  vec3 specTint = mix(vec3(0.92, 0.94, 0.98), baseCol, metal);
  lit += specTint * (spec + rim);
  lit *= mix(0.94, 1.0, ndv);
  return clamp(lit, vec3(0.0), vec3(1.0));
}

float creativeLookPrepPbrFormBoost(vec3 N, vec3 V, vec3 baseCol) {
  float metal = clamp(uMetalness, 0.0, 1.0);
  float rough = clamp(uRoughness, 0.02, 1.0);
  vec3 L = normalize(vec3(0.35, 0.92, 0.42));
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float ndv = max(dot(N, V), 0.0);
  float specPow = mix(96.0, 6.0, rough);
  float spec = pow(ndh, specPow) * mix(0.06, 0.55, 1.0 - rough * 0.5) * mix(0.15, 1.0, metal);
  float rim = pow(1.0 - ndv, mix(2.4, 5.5, rough)) * mix(0.04, 0.22, metal);
  float baseLum = dot(baseCol, vec3(0.2126, 0.7152, 0.0722));
  return (spec + rim) * mix(0.35, 1.0, baseLum);
}
`;

/** Shader Lab presets that expose Object → Material brightness / metalness / roughness. */
export const CREATIVE_LOOK_MATERIAL_PBR_SLIDER_PRESETS = /** @type {const} */ ([
  'dither-neutral',
  'dither-tritone',
  'dither-crosshatch',
  'ega-pixel',
  'c64-pixel',
  'gameboy-pixel',
  'gba-pixel',
  'nes-pixel',
  'megadrive-pixel',
  'intellivision-pixel',
  'apple2-pixel',
  'ascii-art',
  'ascii-art-2',
  'ascii-art-3',
  'ps2-crush',
  'psx',
  'vga-dos-3d',
  'sketch',
  'sketch-colour',
  'vectrex',
]);

/** @param {string} fragmentShader */
export function prependCreativeLookPrepPbrGlsl(fragmentShader) {
  let s = fragmentShader.trim();
  if (!s.includes('uniform float uMetalness;')) {
    s = `${CREATIVE_LOOK_PREP_PBR_UNIFORMS_GLSL}\n${s}`;
  }
  if (!s.includes('creativeLookModulatePrepPbr')) {
    s = `${CREATIVE_LOOK_PREP_PBR_FUNCTIONS_GLSL}\n${s}`;
  }
  return s;
}

/**
 * Inject PBR modulation before prep-pass output (keeps each preset's custom lighting).
 * @param {string} fragmentShader
 * @param {{ mode?: 'lit' | 'lum' | 'form' | 'col' | 'sketch', normalVar?: string, baseColVar?: string, viewExpr?: string }} [options]
 */
export function withCreativeLookPrepPbrModulation(fragmentShader, options = {}) {
  const mode = options.mode ?? 'lit';
  const nVar = options.normalVar ?? 'N';
  const baseVar = options.baseColVar ?? 'baseCol';
  const vExpr = options.viewExpr ?? 'normalize(cameraPosition - vWorldPosition)';
  let s = prependCreativeLookPrepPbrGlsl(fragmentShader);

  if (mode === 'lit') {
    if (s.includes('gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);')) {
      s = s.replace(
        '  gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);',
        `  lit = creativeLookModulatePrepPbr(lit, ${baseVar}, ${nVar}, ${vExpr});
  lit = clamp(lit, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(lit, uOpacity * mapAlpha);`,
      );
    }
    return s;
  }

  if (mode === 'lum') {
    if (s.includes('gl_FragColor = vec4(vec3(clamp(lum, 0.0, 1.0)), uOpacity * mapAlpha);')) {
      s = s.replace(
        '  gl_FragColor = vec4(vec3(clamp(lum, 0.0, 1.0)), uOpacity * mapAlpha);',
        `  vec3 outCol = creativeLookModulatePrepPbr(vec3(lum), ${baseVar}, ${nVar}, ${vExpr});
  gl_FragColor = vec4(outCol, uOpacity * mapAlpha);`,
      );
    }
    return s;
  }

  if (mode === 'form') {
    if (!s.includes('uniform float uBrightness;')) {
      s = `${CREATIVE_LOOK_PREP_BRIGHTNESS_UNIFORM_GLSL}${s}`;
    }
    if (s.includes('gl_FragColor = vec4(form, ndv, 1.0, uOpacity * mapAlpha);')) {
      const baseSample = `  vec3 baseCol = vec3(0.85);
  if (uHasMap > 0.5) {
    baseCol = texture2D(uMap, vUv).rgb;
  }
`;
      if (!s.includes('vec3 baseCol')) {
        s = s.replace(
          '  vec3 N = normalize(vWorldNormal);',
          `${baseSample}
  vec3 N = normalize(vWorldNormal);`,
        );
      }
      s = s.replace(
        '  gl_FragColor = vec4(form, ndv, 1.0, uOpacity * mapAlpha);',
        `  form = clamp(form * uBrightness + creativeLookPrepPbrFormBoost(N, ${vExpr}, baseCol), 0.0, 1.0);
  gl_FragColor = vec4(form, ndv, 1.0, uOpacity * mapAlpha);`,
      );
    }
    return s;
  }

  if (mode === 'col') {
    if (s.includes('  col = clamp(col, vec3(0.0), vec3(1.0));\n  gl_FragColor = vec4(col, uOpacity * mapAlpha);')) {
      s = s.replace(
        '  col = clamp(col, vec3(0.0), vec3(1.0));\n  gl_FragColor = vec4(col, uOpacity * mapAlpha);',
        `  col = clamp(col, vec3(0.0), vec3(1.0));
  col = creativeLookModulatePrepPbr(col, baseCol, ${nVar}, ${vExpr});
  gl_FragColor = vec4(col, uOpacity * mapAlpha);`,
      );
    } else if (s.includes('  gl_FragColor = vec4(col, uOpacity * mapAlpha);')) {
      s = s.replace(
        '  gl_FragColor = vec4(col, uOpacity * mapAlpha);',
        `  col = creativeLookModulatePrepPbr(col, baseCol, ${nVar}, ${vExpr});
  gl_FragColor = vec4(col, uOpacity * mapAlpha);`,
      );
    }
    return s;
  }

  if (mode === 'sketch' || mode === 'sketch-colour') {
    if (!s.includes('uniform float uBrightness;')) {
      s = `${CREATIVE_LOOK_PREP_BRIGHTNESS_UNIFORM_GLSL}${s}`;
    }
    if (s.includes('  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));')) {
      s = s.replace(
        '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',
        `  col *= uBrightness;
  col = creativeLookModulatePrepPbr(col, baseCol, N, V);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));`,
      );
    } else if (
      s.includes('  gl_FragColor = vec4(col, min(ndv * uOpacity * mapAlpha, 0.99));')
    ) {
      s = s.replace(
        '  gl_FragColor = vec4(col, min(ndv * uOpacity * mapAlpha, 0.99));',
        `  col *= uBrightness;
  col = creativeLookModulatePrepPbr(col, baseCol, N, V);
  gl_FragColor = vec4(col, min(ndv * uOpacity * mapAlpha, 0.99));`,
      );
    }
    return s;
  }

  if (mode === 'ps2') {
    if (
      s.includes(
        '  col += rim * mix(vec3(0.05, 0.07, 0.1), sourceCol * 0.42, 0.62) * 0.42;',
      )
    ) {
      s = s.replace(
        '  col += rim * mix(vec3(0.05, 0.07, 0.1), sourceCol * 0.42, 0.62) * 0.42;\n\n  col = clamp(col, vec3(0.0), vec3(1.0));',
        `  col += rim * mix(vec3(0.05, 0.07, 0.1), sourceCol * 0.42, 0.62) * 0.42;
  col = creativeLookModulatePrepPbr(col, sourceCol, N, V);

  col = clamp(col, vec3(0.0), vec3(1.0));`,
      );
    }
    return s;
  }

  if (mode === 'psx') {
    if (s.includes('  col += rim * mix(vec3(0.04, 0.05, 0.08), sourceCol * 0.35, 0.55) * 0.32;')) {
      s = s.replace(
        '  col += rim * mix(vec3(0.04, 0.05, 0.08), sourceCol * 0.35, 0.55) * 0.32;\n\n  float ditherCell',
        `  col += rim * mix(vec3(0.04, 0.05, 0.08), sourceCol * 0.35, 0.55) * 0.32;
  col = creativeLookModulatePrepPbr(col, sourceCol, N, V);

  float ditherCell`,
      );
    }
    return s;
  }

  if (mode === 'vga') {
    if (s.includes('  col += rim * mix(vec3(0.06, 0.07, 0.09), sourceCol * 0.28, 0.5) * 0.22;')) {
      s = s.replace(
        '  col += rim * mix(vec3(0.06, 0.07, 0.09), sourceCol * 0.28, 0.5) * 0.22;\n\n  col = quantizeVgaDos',
        `  col += rim * mix(vec3(0.06, 0.07, 0.09), sourceCol * 0.28, 0.5) * 0.22;
  col = creativeLookModulatePrepPbr(col, sourceCol, N, V);

  col = quantizeVgaDos`,
      );
    }
    return s;
  }

  if (mode === 'vectrex') {
    if (s.includes('  gl_FragColor = vec4(col, alpha);')) {
      s = s.replace(
        '  gl_FragColor = vec4(col, alpha);',
        `  col = creativeLookModulatePrepPbr(col, wireHot, N, V);
  gl_FragColor = vec4(col, alpha);`,
      );
    }
    return s;
  }

  return s;
}

/** @param {string} preset */
export function isCreativeLookMaterialPbrSliderPreset(preset) {
  return CREATIVE_LOOK_MATERIAL_PBR_SLIDER_PRESETS.includes(preset);
}
