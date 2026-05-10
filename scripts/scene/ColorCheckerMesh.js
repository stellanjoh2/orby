import * as THREE from 'three';

/**
 * X-Rite / Calibrite ColorChecker Classic — manufacturer sRGB (D65) from
 * https://en.wikipedia.org/wiki/ColorChecker (Field 1990 / Poynton table).
 * Order: 4×6 grid, row-major, top row first (indices 0–5 = row 1 in article).
 */
export const COLOR_CHECKER_SRGB_HEX = [
  '#735244',
  '#c29682',
  '#627a9d',
  '#576c43',
  '#8580b1',
  '#67bdaa',
  '#d67e2c',
  '#505ba6',
  '#c15a63',
  '#5e3c6c',
  '#9dbc40',
  '#e0a32e',
  '#383d96',
  '#469449',
  '#af363c',
  '#e7c71f',
  '#bb5695',
  '#0885a1',
  '#f3f3f3',
  '#c8c8c8',
  '#a0a0a0',
  '#7a7a7a',
  '#555555',
  '#343434',
];

/** Unlit sRGB — stable reference patches regardless of scene lighting / exposure tricks on shaded materials. */
function referenceSwatchMaterial(hex) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color().setStyle(hex),
  });
}

const FRAME_HEX = '#1a1a1a';
const BACK_HEX = '#0d0d0d';

/**
 * VFX-style probes above the chart: chrome (reflection map / HDRi orientation), 18% grey (exposure &
 * shadow softness), white diffuse (clip / highlight reference). Meshes use dedicated materials —
 * never tied to the imported mesh metalness slider — while env maps are synced from SceneManager.
 *
 * Layout is driven by card bounds (`totalW` × `totalH` in local units): chrome above the left edge,
 * grey centered, white above the right edge. Sphere diameter ≈ half the card height. Small vertical
 * lift clears the top frame; outer balls can sit slightly past the card width for wider spacing.
 *
 * @returns {THREE.Material[]} Materials for HDRI env sync (same order: chrome, grey, white).
 */
function createReferenceSphereMeshes(group, totalW, totalH) {
  const topEdge = totalH / 2;
  /** Diameter ≈ ½ card height → radius = ¼ totalH */
  const ballR = totalH * 0.25;
  /** Air gap between card top and sphere bottoms (scales with chart) */
  const liftY = totalH * 0.056;
  const cy = topEdge + ballR + liftY;
  /** Push chrome/white outward past the side edges — widens center-to-center spacing */
  const xOut = totalW * 0.06;
  /** Toward +Z (chart normal) so large spheres clear the front plane */
  const frontZ = ballR * 0.5;
  const xs = [-totalW / 2 + ballR - xOut, 0, totalW / 2 - ballR + xOut];

  const geo = new THREE.SphereGeometry(ballR, 48, 32);

  const chromeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.035,
    envMapIntensity: 1,
  });
  chromeMat.userData.meshglReferenceProbe = true;
  chromeMat.userData.referenceRole = 'chrome';
  /** Restored when HDRI blurriness is 0; blurred via same formula as main mesh / podium. */
  chromeMat.userData.referenceBaseRoughness = chromeMat.roughness;

  const greyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(0.18, 0.18, 0.18),
    metalness: 0,
    roughness: 0.93,
    envMapIntensity: 1,
  });
  greyMat.userData.meshglReferenceProbe = true;
  greyMat.userData.referenceRole = 'grey';
  greyMat.userData.referenceBaseRoughness = greyMat.roughness;

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.98,
    envMapIntensity: 1,
  });
  whiteMat.userData.meshglReferenceProbe = true;
  whiteMat.userData.referenceRole = 'white';
  whiteMat.userData.referenceBaseRoughness = whiteMat.roughness;

  const mats = [chromeMat, greyMat, whiteMat];
  const meshNames = ['ReferenceSphere_chrome', 'ReferenceSphere_grey', 'ReferenceSphere_white'];

  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(geo, mats[i]);
    mesh.name = meshNames[i];
    mesh.position.set(xs[i], cy, frontZ);
    group.add(mesh);
  }

  return mats;
}

/**
 * @returns {THREE.Group} Centered in XY, front face toward +Z, ~1.5 units wide (Classic-like aspect).
 */
export function createColorCheckerMeshGroup() {
  const group = new THREE.Group();
  group.name = 'ColorChecker';

  const rows = 4;
  const cols = 6;
  const patch = 1;
  const gutter = 0.045;
  /** Slightly thicker than the original 0.028 so the card reads as a solid slab */
  const depth = 0.04;
  const frameW = 0.11;
  const cornerMark = 0.07;
  const cornerTh = 0.006;

  const innerW = cols * patch + (cols - 1) * gutter;
  const innerH = rows * patch + (rows - 1) * gutter;

  const totalW = innerW + 2 * frameW;
  const totalH = innerH + 2 * frameW;

  const frameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setStyle(FRAME_HEX),
  });
  const backMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setStyle(BACK_HEX),
  });
  const markMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setStyle('#e8e8e8'),
  });

  // Back plate (full card) — plain box, a bit deeper than early builds for extra physical thickness
  const backGeo = new THREE.BoxGeometry(totalW + 0.02, totalH + 0.02, depth * 0.42);
  const backMesh = new THREE.Mesh(backGeo, backMat);
  backMesh.position.z = -depth * 0.56;
  group.add(backMesh);

  // Frame rails (outer ring)
  const topBotH = frameW;
  const topBotGeo = new THREE.BoxGeometry(totalW, topBotH, depth * 0.52);
  const top = new THREE.Mesh(topBotGeo, frameMat);
  top.position.set(0, innerH / 2 + frameW / 2, -depth * 0.12);
  const bot = top.clone();
  bot.position.set(0, -innerH / 2 - frameW / 2, -depth * 0.12);
  group.add(top, bot);

  const sideGeo = new THREE.BoxGeometry(frameW, innerH, depth * 0.52);
  const left = new THREE.Mesh(sideGeo, frameMat);
  left.position.set(-innerW / 2 - frameW / 2, 0, -depth * 0.12);
  const right = left.clone();
  right.position.set(innerW / 2 + frameW / 2, 0, -depth * 0.12);
  group.add(left, right);

  // Inner gutter dividers (thin — cosmetic)
  const divThin = 0.018;
  const divZ = depth * 0.38;
  const divMat = frameMat;
  for (let c = 1; c < cols; c++) {
    const x = -innerW / 2 + c * (patch + gutter) - gutter / 2;
    const g = new THREE.BoxGeometry(divThin, innerH, divZ);
    const m = new THREE.Mesh(g, divMat);
    m.position.set(x, 0, depth * 0.12);
    group.add(m);
  }
  for (let r = 1; r < rows; r++) {
    const y = innerH / 2 - r * (patch + gutter) + gutter / 2;
    const g = new THREE.BoxGeometry(innerW, divThin, divZ);
    const m = new THREE.Mesh(g, divMat);
    m.position.set(0, y, depth * 0.12);
    group.add(m);
  }

  // 24 swatches
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = -innerW / 2 + patch / 2 + c * (patch + gutter);
      const cy = innerH / 2 - patch / 2 - r * (patch + gutter);
      const geo = new THREE.BoxGeometry(patch - 0.004, patch - 0.004, depth);
      const mat = referenceSwatchMaterial(COLOR_CHECKER_SRGB_HEX[idx]);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, cy, depth * 0.5);
      mesh.name = `ColorCheckerPatch_${idx + 1}`;
      group.add(mesh);
      idx++;
    }
  }

  // Corner registration marks (+ shapes, simplified)
  const corners = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (const [sx, sy] of corners) {
    const ox = sx * (innerW / 2 + frameW * 0.35);
    const oy = sy * (innerH / 2 + frameW * 0.35);
    const h = new THREE.BoxGeometry(cornerMark, cornerTh, cornerTh);
    const v = new THREE.BoxGeometry(cornerTh, cornerMark, cornerTh);
    const mh = new THREE.Mesh(h, markMat);
    const mv = new THREE.Mesh(v, markMat);
    mh.position.set(ox, oy, depth * 1.1);
    mv.position.set(ox, oy, depth * 1.1);
    group.add(mh, mv);
  }

  const referenceProbeMaterials = createReferenceSphereMeshes(group, totalW, totalH);
  group.userData.referenceProbeMaterials = referenceProbeMaterials;

  const targetWidth = 0.42;
  group.scale.setScalar(targetWidth / totalW);

  return group;
}
