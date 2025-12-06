import * as THREE from 'three';

/**
 * SceneObjectsController
 *
 * Lightweight manager for multiple loaded objects.
 * - Keeps a registry of objects (for now: primarily to support multi-mesh scenes)
 * - Tracks which object is "active" for transforms, focus, and Mesh Info
 * - Does NOT replace global lighting / camera / post FX – those stay global.
 */
export class SceneObjectsController {
  /**
   * @param {Object} options
   * @param {THREE.Group} options.sceneRoot - Parent group that holds all object roots (existing modelRoot)
   * @param {import('../EventBus.js').EventBus} options.eventBus
   * @param {Object} options.ui - UI manager (for future list updates)
   */
  constructor({ sceneRoot, eventBus, ui }) {
    this.sceneRoot = sceneRoot;
    this.eventBus = eventBus;
    this.ui = ui;

    /** @type {Array<Object>} */
    this.objects = [];
    /** @type {number|null} */
    this.activeObjectId = null;
    this._nextId = 1;
  }

  /**
   * Add a new object to the scene.
   *
   * @param {THREE.Object3D} mesh - Root mesh or group returned from the loader
   * @param {Object} options
   * @param {File} [options.file] - Source file (if available)
   * @param {Object} [options.gltfMetadata] - Optional GLTF metadata
   * @param {boolean} [options.replaceExisting=false] - If true, clears existing objects first
   * @param {boolean} [options.makeActive=true] - If true, new object becomes active
   * @returns {Object} The created object descriptor
   */
  addObject(mesh, { file, gltfMetadata, replaceExisting = false, makeActive = true } = {}) {
    if (!mesh) return null;

    if (replaceExisting) {
      this.clearAll();
    }

    const group = new THREE.Group();
    group.name = mesh.name || 'OrbyObject';
    group.add(mesh);
    this.sceneRoot.add(group);

    const id = this._nextId++;
    const nameFromFile = file?.name?.replace(/\.[^/.]+$/, '') || mesh.name || `Object ${id}`;

    const descriptor = {
      id,
      name: nameFromFile,
      group,
      mesh,
      file: file || null,
      gltfMetadata: gltfMetadata || null,
      visible: true,
    };

    this.objects.push(descriptor);

    if (makeActive) {
      this.setActiveObject(id);
    }

    return descriptor;
  }

  /**
   * Remove all objects from the scene and registry.
   */
  clearAll() {
    this.objects.forEach((obj) => {
      if (obj.group && obj.group.parent === this.sceneRoot) {
        this.sceneRoot.remove(obj.group);
      }
    });
    this.objects = [];
    this.activeObjectId = null;
  }

  /**
   * Set active object by id.
   * @param {number} id
   */
  setActiveObject(id) {
    if (this.activeObjectId === id) return;
    const obj = this.objects.find((o) => o.id === id);
    if (!obj) return;
    this.activeObjectId = id;

    // Notify listeners that the active object changed.
    // For now, we emit a single event that SceneManager can listen to.
    this.eventBus?.emit?.('objects:active-changed', {
      id: obj.id,
      name: obj.name,
      group: obj.group,
      mesh: obj.mesh,
    });
  }

  /**
   * Get the currently active object descriptor.
   * @returns {Object|null}
   */
  getActiveObject() {
    if (this.activeObjectId == null) return null;
    return this.objects.find((o) => o.id === this.activeObjectId) || null;
  }

  /**
   * Find the top-level object descriptor that owns a given mesh.
   * @param {THREE.Object3D} mesh
   * @returns {Object|null}
   */
  findObjectByMesh(mesh) {
    if (!mesh) return null;
    let node = mesh;
    while (node && node !== this.sceneRoot) {
      const found = this.objects.find((o) => o.group === node);
      if (found) return found;
      node = node.parent;
    }
    return null;
  }

  /**
   * Convenience: get all root groups for raycasting or debugging.
   * @returns {THREE.Object3D[]}
   */
  getAllGroups() {
    return this.objects.map((o) => o.group);
  }
}


