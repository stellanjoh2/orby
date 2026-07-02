import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import * as opentype from '../vendor/opentype.module.js';
import { FONT_EXTRUDE_TARGET_CAP_HEIGHT } from './extrudeDetail.js';
import { opentypePathToShapes } from './opentypePathToShape.js';
import { normalizeFontCircularGlyphGroupGeometry } from './fontCircularGeometryNormalize.js';

const FONT_PATH = new URL('../../assets/fonts/Mattone-Bold.ttf', import.meta.url);
const FONT_SIZE = 72;

function loadFont() {
  const buf = fs.readFileSync(FONT_PATH);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function buildCircularGlyphGroup(char) {
  const font = loadFont();
  const path = font.charToGlyph(char).getPath(0, 0, FONT_SIZE);
  const shapes = opentypePathToShapes(path, 12);
  const glyphGroup = new THREE.Group();
  for (const shape of shapes) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.04, curveSegments: 8 });
    glyphGroup.add(new THREE.Mesh(geometry));
  }
  const uniformScale = FONT_EXTRUDE_TARGET_CAP_HEIGHT / FONT_SIZE;
  normalizeFontCircularGlyphGroupGeometry(glyphGroup, uniformScale);
  return glyphGroup;
}

function glyphWorldBounds(char) {
  const group = buildCircularGlyphGroup(char);
  const box = new THREE.Box3().setFromObject(group);
  group.traverse((child) => child.geometry?.dispose());
  return box;
}

test('circular glyph normalize keeps multi-contour i ink separated', () => {
  const box = glyphWorldBounds('i');
  const height = box.max.y - box.min.y;
  assert.ok(height > 0.25, `expected tall i glyph, got height ${height}`);
  assert.ok(box.max.y > 0.25, `dot should sit above collapsed stem, maxY=${box.max.y}`);
});

test('circular glyph normalize keeps hyphen off the ring floor', () => {
  const box = glyphWorldBounds('-');
  assert.ok(box.min.y > 0.05, `hyphen should float above baseline, minY=${box.min.y}`);
  assert.ok(box.max.y > box.min.y + 0.04);
});

test('circular glyph normalize keeps underscore below baseline', () => {
  const box = glyphWorldBounds('_');
  assert.ok(box.max.y < 0, `underscore should sit below baseline, maxY=${box.max.y}`);
});

test('circular glyph normalize keeps cap letters on baseline', () => {
  const box = glyphWorldBounds('I');
  assert.ok(Math.abs(box.min.y) < 0.05, `cap letter baseline should sit near y=0, minY=${box.min.y}`);
  assert.ok(box.max.y > 0.2);
});
