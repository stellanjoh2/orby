/**
 * N8AO view-settle cache — unit tests for recompute gating.
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { describe, it } from 'node:test';
import {
  cameraViewChangedSinceCache,
  modelRootChangedSinceCache,
  needsN8aoViewRecompute,
  snapshotN8aoViewCache,
} from './meshglN8aoViewCache.js';

describe('meshglN8aoViewCache', () => {
  it('detects camera movement since cache snapshot', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const pos = camera.position.clone();
    const quat = camera.quaternion.clone();
    const proj = camera.projectionMatrix.clone();

    assert.equal(cameraViewChangedSinceCache(camera, pos, quat, proj), false);

    camera.position.x += 0.01;
    assert.equal(cameraViewChangedSinceCache(camera, pos, quat, proj), true);
  });

  it('detects model root movement since cache snapshot', () => {
    const modelRoot = new THREE.Group();
    modelRoot.position.set(1, 0, 0);
    modelRoot.updateMatrixWorld(true);

    const cached = modelRoot.matrixWorld.clone();
    assert.equal(modelRootChangedSinceCache(modelRoot, cached), false);

    modelRoot.rotation.y = 0.5;
    modelRoot.updateMatrixWorld(true);
    assert.equal(modelRootChangedSinceCache(modelRoot, cached), true);
  });

  it('requires recompute when force callback is true (scrub / gizmo)', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.updateProjectionMatrix();
    const scene = new THREE.Scene();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const proj = new THREE.Matrix4();
    const modelMatrix = new THREE.Matrix4();

    snapshotN8aoViewCache({
      camera,
      scene,
      cacheCameraPos: pos,
      cacheCameraQuat: quat,
      cacheProjection: proj,
      cacheModelMatrix: modelMatrix,
    });

    assert.equal(
      needsN8aoViewRecompute({
        viewCacheValid: true,
        camera,
        scene,
        cacheCameraPos: pos,
        cacheCameraQuat: quat,
        cacheProjection: proj,
        cacheModelMatrix: modelMatrix,
        cacheHadGlassMesh: false,
        resolveForceAoRecompute: () => false,
      }),
      false,
    );

    assert.equal(
      needsN8aoViewRecompute({
        viewCacheValid: true,
        camera,
        scene,
        cacheCameraPos: pos,
        cacheCameraQuat: quat,
        cacheProjection: proj,
        cacheModelMatrix: modelMatrix,
        cacheHadGlassMesh: false,
        resolveForceAoRecompute: () => true,
      }),
      true,
    );
  });

  it('requires recompute when cache is invalid or glass mesh appears', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.updateProjectionMatrix();
    const scene = new THREE.Scene();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const proj = new THREE.Matrix4();
    const modelMatrix = new THREE.Matrix4();

    assert.equal(
      needsN8aoViewRecompute({
        viewCacheValid: false,
        camera,
        scene,
        cacheHadGlassMesh: false,
      }),
      true,
    );

    snapshotN8aoViewCache({
      camera,
      scene,
      cacheCameraPos: pos,
      cacheCameraQuat: quat,
      cacheProjection: proj,
      cacheModelMatrix: modelMatrix,
    });

    assert.equal(
      needsN8aoViewRecompute({
        viewCacheValid: true,
        camera,
        scene,
        cacheCameraPos: pos,
        cacheCameraQuat: quat,
        cacheProjection: proj,
        cacheModelMatrix: modelMatrix,
        cacheHadGlassMesh: false,
      }),
      false,
    );

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    glass.userData.meshglBaseGlassReflector = true;
    scene.add(glass);

    assert.equal(
      needsN8aoViewRecompute({
        viewCacheValid: true,
        camera,
        scene,
        cacheCameraPos: pos,
        cacheCameraQuat: quat,
        cacheProjection: proj,
        cacheModelMatrix: modelMatrix,
        cacheHadGlassMesh: false,
      }),
      true,
    );
  });
});
