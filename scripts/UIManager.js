import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

import { HDRI_STRENGTH_UNIT } from './config/hdri.js';
import { CAMERA_TEMPERATURE_NEUTRAL_K } from './constants.js';

export class UIManager {
  constructor(eventBus, stateStore) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.dom = {};
    this.activeTab = 'mesh';
    this.uiHidden = false;
    this.currentAnimationDuration = 0;
    this.animationPlaying = false;
    this.shelfRevealed = false;
    this.dropzoneVisible = true;
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.stateStore.subscribe((state) => this.syncControls(state));
    this.syncControls(this.stateStore.getState());
    // Initialize panel header visibility
    const initialTab = this.activeTab || 'mesh';
    document.querySelectorAll('.panel-header-title').forEach((header) => {
      header.classList.toggle('visible', header.dataset.header === initialTab);
    });
  }

  cacheDom() {
    const q = (sel) => document.querySelector(sel);
    this.dom.dropzone = q('#dropzone');
    this.dom.topBarTitle = q('#topBarTitle');
    this.dom.topBarAnimation = q('#topBarAnimation');
    this.dom.resetAll = q('#resetAll');
    this.dom.helpButton = q('#helpButton');
    this.dom.helpOverlay = q('#helpOverlay');
    this.dom.closeHelp = q('#closeHelp');
    this.dom.toggleUi = q('#toggleUi');
    this.dom.shelf = q('#shelf');
    this.dom.shelf?.classList.add('is-shelf-hidden');
    this.dom.topBar = document.querySelector('.top-bar');
    this.dom.fileInput = q('#fileInput');
    this.dom.browseButton = q('#browseButton');
    this.dom.tabs = document.querySelectorAll('.tab');
    this.dom.panels = document.querySelectorAll('.panel');
    this.dom.toastTemplate = document.querySelector('#toastTemplate');
    this.dom.stats = q('#meshStats');
    this.dom.animationBlock = q('#animationBlock');
    this.dom.animationSelect = q('#animationSelect');
    this.dom.playPause = q('#playPause');
    this.dom.animationScrub = q('#animationScrub');
    this.dom.animationTime = q('#animationTime');
    this.dom.rotationNotches = document.querySelectorAll(
      '[data-rotation-axis]',
    );

    this.inputs = {
      shading: document.querySelectorAll('input[name="shading"]'),
      scale: q('#scaleControl'),
      yOffset: q('#yOffsetControl'),
      rotationX: q('#rotationXControl'),
      rotationY: q('#rotationYControl'),
      rotationZ: q('#rotationZControl'),
      autoRotate: document.querySelectorAll('input[name="autorotate"]'),
      showNormals: q('#showNormals'),
      hdriEnabled: q('#hdriEnabled'),
      hdriStrength: q('#hdriStrength'),
      hdriBlurriness: q('#hdriBlurriness'),
      hdriRotation: q('#hdriRotation'),
      hdriBackground: q('#hdriBackground'),
      lensFlareEnabled: q('#lensFlareEnabled'),
      lensFlareRotation: q('#lensFlareRotation'),
      lensFlareHeight: q('#lensFlareHeight'),
      lensFlareColor: q('#lensFlareColor'),
      lensFlareQuality: q('#lensFlareQuality'),
      clayColor: q('#clayColor'),
      clayRoughness: q('#clayRoughness'),
      claySpecular: q('#claySpecular'),
      clayNormalMap: q('#clayNormalMap'),
      wireframeAlwaysOn: q('#wireframeAlwaysOn'),
      wireframeColor: q('#wireframeColor'),
      wireframeOnlyVisibleFaces: q('#wireframeOnlyVisibleFaces'),
      groundSolid: q('#groundSolid'),
      groundWire: q('#groundWire'),
      groundSolidColor: q('#groundSolidColor'),
      groundWireColor: q('#groundWireColor'),
      groundWireOpacity: q('#groundWireOpacity'),
      groundY: q('#groundY'),
      podiumSnap: q('#podiumSnap'),
      gridSnap: q('#gridSnap'),
      gridScale: q('#gridScale'),
      podiumScale: q('#podiumScale'),
      gridScale: q('#gridScale'),
      hdriButtons: document.querySelectorAll('[data-hdri]'),
      lightControls: document.querySelectorAll('.light-color-row'),
      lightsEnabled: q('#lightsEnabled'),
      lightsMaster: q('#lightsMaster'),
      lightsRotation: q('#lightsRotation'),
      lightsAutoRotate: q('#lightsAutoRotate'),
      showLightIndicators: q('#showLightIndicators'),
      dofFocus: q('#dofFocus'),
      dofAperture: q('#dofAperture'),
      toggleDof: q('#toggleDof'),
      bloomThreshold: q('#bloomThreshold'),
      bloomStrength: q('#bloomStrength'),
      bloomRadius: q('#bloomRadius'),
      bloomColor: q('#bloomColor'),
      toggleBloom: q('#toggleBloom'),
      lensDirtEnabled: q('#lensDirtEnabled'),
      lensDirtStrength: q('#lensDirtStrength'),
      grainIntensity: q('#grainIntensity'),
      toggleGrain: q('#toggleGrain'),
      aberrationOffset: q('#aberrationOffset'),
      aberrationStrength: q('#aberrationStrength'),
      toggleAberration: q('#toggleAberration'),
      toggleFresnel: q('#toggleFresnel'),
      fresnelColor: q('#fresnelColor'),
      fresnelRadius: q('#fresnelRadius'),
      fresnelStrength: q('#fresnelStrength'),
      backgroundColor: q('#backgroundColor'),
      cameraFov: q('#cameraFov'),
      cameraTilt: q('#cameraTilt'),
      exposure: q('#exposure'),
      autoExposure: q('#autoExposure'),
      cameraContrast: q('#cameraContrast'),
      cameraTemperature: q('#cameraTemperature'),
      cameraTint: q('#cameraTint'),
      cameraHighlights: q('#cameraHighlights'),
      cameraShadows: q('#cameraShadows'),
      cameraSaturation: q('#cameraSaturation'),
      antiAliasing: q('#antiAliasing'),
      toneMapping: q('#toneMapping'),
    };

    this.buttons = {
      transformReset: q('#transformReset'),
      export: q('#exportPng'),
      copyStudio: q('#copyStudioSettings'),
      copyRender: q('#copyRenderSettings'),
      resetStudio: q('#resetStudioSettings'),
      resetMesh: q('#resetMeshSettings'),
      resetRender: q('#resetRenderSettings'),
      loadMesh: q('#loadMeshButton'),
    };

    this.dom.blocks = {};
    this.dom.subsections = {};
    document.querySelectorAll('.panel-block[data-block]').forEach((block) => {
      const key = block.dataset.block;
      if (key) {
        this.dom.blocks[key] = block;
      }
    });
    // Cache subsections for individual muting within merged blocks
    document.querySelectorAll('.subsection[data-subsection]').forEach((subsection) => {
      const key = subsection.dataset.subsection;
      if (key) {
        this.dom.subsections[key] = subsection;
      }
    });
    this.setDropzoneVisible(this.dropzoneVisible);
  }

  bindEvents() {
    this.bindDragAndDrop();
    this.bindTabs();
    this.bindMeshControls();
    this.bindStudioControls();
    this.bindRenderControls();
    this.bindGlobalControls();
    this.bindAnimationControls();
    this.bindCopyButtons();
    this.bindLocalResetButtons();
    this.bindRotationNotches();
    this.setupSliderKeyboardSupport();
  }

  bindDragAndDrop() {
    const emitFile = (file) => {
      if (!file) return;
      this.eventBus.emit('file:selected', file);
    };
    ['dragenter', 'dragover'].forEach((event) => {
      this.dom.dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dom.dropzone.classList.add('drag-active');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach((event) => {
      this.dom.dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dom.dropzone.classList.remove('drag-active');
      });
    });
    this.dom.dropzone.addEventListener('drop', (event) => {
      this.handleDropEvent(event, emitFile);
    });
    this.dom.browseButton.addEventListener('click', () =>
      this.dom.fileInput.click(),
    );
    this.dom.fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      emitFile(file);
      this.dom.fileInput.value = '';
    });
    
    this.buttons.loadMesh?.addEventListener('click', () => {
      this.dom.fileInput.click();
    });

    window.addEventListener(
      'drop',
      (event) => this.handleDropEvent(event, emitFile),
      { passive: false },
    );
  }

  handleDropEvent(event, emitFile) {
    event.preventDefault();
    event.stopPropagation();

    const entries = this.extractEntries(event.dataTransfer);
    if (entries.length) {
      this.collectFilesFromEntries(entries).then((files) => {
        if (files.length === 1) {
          emitFile(files[0].file);
        } else if (files.length > 1) {
          this.eventBus.emit('file:bundle', files);
        }
      });
      return;
    }

    const fileList = event.dataTransfer?.files;
    if (fileList && fileList.length) {
      if (fileList.length === 1) {
        emitFile(fileList[0]);
      } else {
        const files = Array.from(fileList).map((file) => ({
          file,
          path: file.webkitRelativePath || file.name,
        }));
        this.eventBus.emit('file:bundle', files);
      }
    }
  }

  extractEntries(dataTransfer) {
    const items = dataTransfer?.items;
    if (!items) return [];
    const entries = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    return entries;
  }

  async collectFilesFromEntries(entries) {
    const files = [];
    const traverse = (entry, path = '') =>
      new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((file) => {
            files.push({ file, path: `${path}${file.name}` });
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries(async (entriesList) => {
            for (const child of entriesList) {
              await traverse(child, `${path}${entry.name}/`);
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    for (const entry of entries) {
      await traverse(entry);
    }
    return files;
  }

  bindTabs() {
    this.dom.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === this.activeTab) return;
        this.activeTab = target;
        this.dom.tabs.forEach((button) => {
          const isActive = button.dataset.tab === target;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-selected', isActive);
        });
        this.dom.panels.forEach((panel) => {
          const visible = panel.dataset.panel === target;
          panel.classList.toggle('visible', visible);
          if (visible) {
            gsap.fromTo(
              panel,
              { autoAlpha: 0 },
              { autoAlpha: 1, duration: 0.25, ease: 'power2.out' },
            );
          } else {
            gsap.set(panel, { clearProps: 'opacity' });
          }
        });
        // Show/hide panel headers
        document.querySelectorAll('.panel-header-title').forEach((header) => {
          header.classList.toggle('visible', header.dataset.header === target);
        });
      });
    });
  }

  bindMeshControls() {
    this.inputs.shading.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          this.stateStore.set('shading', input.value);
          this.eventBus.emit('mesh:shading', input.value);
        }
      });
    });
    this.inputs.scale.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('scale', value, 'multiplier');
      this.stateStore.set('scale', value);
      this.eventBus.emit('mesh:scale', value);
    });
    this.enableSliderKeyboardStepping(this.inputs.scale);
    this.inputs.yOffset?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('yOffset', value, 'distance');
      this.stateStore.set('yOffset', value);
      this.eventBus.emit('mesh:yOffset', value);
    });
    if (this.inputs.yOffset) this.enableSliderKeyboardStepping(this.inputs.yOffset);
    this.inputs.rotationX?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('rotationX', value, 'angle');
      this.stateStore.set('rotationX', value);
      this.eventBus.emit('mesh:rotationX', value);
    });
    if (this.inputs.rotationX) this.enableSliderKeyboardStepping(this.inputs.rotationX);
    this.inputs.rotationY?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('rotationY', value, 'angle');
      this.stateStore.set('rotationY', value);
      this.eventBus.emit('mesh:rotationY', value);
    });
    if (this.inputs.rotationY) this.enableSliderKeyboardStepping(this.inputs.rotationY);
    this.inputs.rotationZ?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('rotationZ', value, 'angle');
      this.stateStore.set('rotationZ', value);
      this.eventBus.emit('mesh:rotationZ', value);
    });
    if (this.inputs.rotationZ) this.enableSliderKeyboardStepping(this.inputs.rotationZ);
    // Transform reset is now handled by bindLocalResetButtons
    this.inputs.autoRotate.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          const speed = parseFloat(input.value);
          this.stateStore.set('autoRotate', speed);
          this.eventBus.emit('mesh:auto-rotate', speed);
        }
      });
    });
    this.bindColorInput('clayColor', 'clay.color', 'mesh:clay-color');
    this.inputs.clayRoughness.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, 0, 1, 0.5);
      this.stateStore.set('clay.roughness', value);
      this.updateValueLabel('clayRoughness', value, 'decimal');
      this.eventBus.emit('mesh:clay-roughness', value);
    });
    this.enableSliderKeyboardStepping(this.inputs.clayRoughness);
    this.inputs.claySpecular.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, 0, 1, 0.5);
      this.stateStore.set('clay.specular', value);
      this.updateValueLabel('claySpecular', value, 'decimal');
      this.eventBus.emit('mesh:clay-specular', value);
    });
    this.enableSliderKeyboardStepping(this.inputs.claySpecular);
    this.inputs.clayNormalMap?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('clay.normalMap', enabled);
      this.eventBus.emit('mesh:clay-normal-map', enabled);
    });
    this.inputs.wireframeAlwaysOn?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('wireframe.alwaysOn', enabled);
      this.eventBus.emit('mesh:wireframe-always-on', enabled);
    });
    this.bindColorInput('wireframeColor', 'wireframe.color', 'mesh:wireframe-color');
    this.inputs.wireframeOnlyVisibleFaces?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('wireframe.onlyVisibleFaces', enabled);
      this.eventBus.emit('mesh:wireframe-only-visible-faces', enabled);
    });
    this.inputs.showNormals?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('showNormals', enabled);
      this.eventBus.emit('mesh:normals', enabled);
    });
    // Fresnel (moved from bindRenderControls since it's now in Object tab)
    const emitFresnel = () =>
      this.eventBus.emit('render:fresnel', this.stateStore.getState().fresnel);
    this.inputs.toggleFresnel.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('fresnel.enabled', enabled);
      this.setEffectControlsDisabled(
        ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
        !enabled,
      );
      // Block muting handled by applyBlockStates via syncControls
      emitFresnel();
    });
    this.inputs.fresnelColor.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('fresnel.color', value);
      emitFresnel();
    });
    this.inputs.fresnelRadius.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('fresnelRadius', value, 'decimal');
      this.stateStore.set('fresnel.radius', value);
      emitFresnel();
    });
    this.inputs.fresnelStrength.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('fresnelStrength', value, 'decimal');
      this.stateStore.set('fresnel.strength', value);
      emitFresnel();
    });
  }

  bindStudioControls() {
    this.inputs.hdriButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const preset = button.dataset.hdri;
        this.setHdriActive(preset);
        this.stateStore.set('hdri', preset);
        this.eventBus.emit('studio:hdri', preset);
      });
    });
    this.inputs.hdriEnabled.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('hdriEnabled', enabled);
      this.eventBus.emit('studio:hdri-enabled', enabled);
      this.toggleHdriControls(enabled);
      // Block muting handled by applyBlockStates via syncControls
    });
    this.inputs.hdriStrength.addEventListener('input', (event) => {
      const normalized = Math.min(
        3,
        Math.max(0, parseFloat(event.target.value)),
      );
      const actual = normalized * HDRI_STRENGTH_UNIT;
      this.updateValueLabel('hdriStrength', normalized, 'decimal');
      this.stateStore.set('hdriStrength', actual);
      this.eventBus.emit('studio:hdri-strength', actual);
    });
    this.inputs.hdriBlurriness.addEventListener('input', (event) => {
      const value = Math.min(1, Math.max(0, parseFloat(event.target.value)));
      this.updateValueLabel('hdriBlurriness', value, 'decimal');
      this.stateStore.set('hdriBlurriness', value);
      this.eventBus.emit('studio:hdri-blurriness', value);
    });
    this.inputs.hdriRotation.addEventListener('input', (event) => {
      const value = Math.min(360, Math.max(0, parseFloat(event.target.value)));
      this.updateValueLabel('hdriRotation', value, 'angle');
      this.stateStore.set('hdriRotation', value);
      this.eventBus.emit('studio:hdri-rotation', value);
    });
    this.inputs.hdriBackground.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('hdriBackground', enabled);
      this.eventBus.emit('studio:hdri-background', enabled);
      // Don't disable background color input - user should be able to set it anytime
      // It will be visible when HDRI background is off
    });
    this.inputs.lensFlareEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lensFlare.enabled', enabled);
      this.eventBus.emit('studio:lens-flare-enabled', enabled);
      if (enabled) {
        this.showToast('WARNING: LENS FLARES IS AN EXPERIMENTAL (UNOPTIMIZED) FEATURE');
      }
      this.updateLensFlareControlsDisabled();
    });
    this.inputs.lensFlareRotation?.addEventListener('input', (event) => {
      const value = Math.min(360, Math.max(0, parseFloat(event.target.value)));
      this.updateValueLabel('lensFlareRotation', value, 'angle');
      this.stateStore.set('lensFlare.rotation', value);
      this.eventBus.emit('studio:lens-flare-rotation', value);
    });
    this.inputs.lensFlareHeight?.addEventListener('input', (event) => {
      const value = Math.min(
        90,
        Math.max(0, parseFloat(event.target.value) || 0),
      );
      event.target.value = value;
      this.updateValueLabel('lensFlareHeight', value, 'angle');
      this.stateStore.set('lensFlare.height', value);
      this.eventBus.emit('studio:lens-flare-height', value);
    });
    this.bindColorInput('lensFlareColor', 'lensFlare.color', 'studio:lens-flare-color');
    this.inputs.lensFlareQuality?.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('lensFlare.quality', value);
      this.eventBus.emit('studio:lens-flare-quality', value);
    });
    this.inputs.groundSolid.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('groundSolid', enabled);
      this.eventBus.emit('studio:ground-solid', enabled);
      // Block muting handled by applyBlockStates via syncControls
    });
    this.inputs.groundWire.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('groundWire', enabled);
      this.eventBus.emit('studio:ground-wire', enabled);
      // Block muting handled by applyBlockStates via syncControls
    });
    this.bindColorInput('groundSolidColor', 'groundSolidColor', 'studio:ground-solid-color');
    this.bindColorInput('groundWireColor', 'groundWireColor', 'studio:ground-wire-color');
    this.inputs.groundWireOpacity.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('groundWireOpacity', value, 'decimal');
      this.stateStore.set('groundWireOpacity', value);
      this.eventBus.emit('studio:ground-wire-opacity', value);
    });
    this.inputs.groundY.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, -2, 2, 0);
      this.updateValueLabel('groundY', value, 'distance');
      this.stateStore.set('groundY', value);
      this.eventBus.emit('studio:ground-y', value);
    });
    this.enableSliderKeyboardStepping(this.inputs.groundY);
    this.inputs.podiumScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('podiumScale', value, 'decimal');
      this.stateStore.set('podiumScale', value);
      this.eventBus.emit('studio:podium-scale', value);
    });
    this.inputs.gridScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('gridScale', value, 'decimal');
      this.stateStore.set('gridScale', value);
      this.eventBus.emit('studio:grid-scale', value);
    });
    this.inputs.podiumSnap?.addEventListener('click', () => {
      this.eventBus.emit('studio:podium-snap');
    });
    this.inputs.gridSnap?.addEventListener('click', () => {
      this.eventBus.emit('studio:grid-snap');
    });
    this.inputs.lightControls.forEach((control) => {
      const lightId = control.dataset.light;
      const colorInput = control.querySelector('input[type="color"]');
      colorInput.addEventListener('input', () => {
        this.stateStore.set(`lights.${lightId}.color`, colorInput.value);
        this.eventBus.emit('lights:update', {
          lightId,
          property: 'color',
          value: colorInput.value,
        });
      });
    });
    this.inputs.showLightIndicators?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('showLightIndicators', enabled);
      this.eventBus.emit('lights:show-indicators', enabled);
    });

    this.inputs.lightsMaster?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.updateValueLabel('lightsMaster', value, 'decimal');
      this.stateStore.set('lightsMaster', value);
      this.eventBus.emit('lights:master', value);
    });
    this.inputs.lightsEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lightsEnabled', enabled);
      this.eventBus.emit('lights:enabled', enabled);
      this.setLightColorControlsDisabled(!enabled);
      // Block muting handled by applyBlockStates via syncControls
    });
    this.inputs.lightsRotation?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.updateValueLabel('lightsRotation', value, 'angle');
      this.stateStore.set('lightsRotation', value);
      this.eventBus.emit('lights:rotate', value);
    });
    this.inputs.lightsAutoRotate?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lightsAutoRotate', enabled);
      this.eventBus.emit('lights:auto-rotate', enabled);
      this.setLightsRotationDisabled(enabled);
    });
  }

  bindRenderControls() {
    const emitDof = () =>
      this.eventBus.emit('render:dof', this.stateStore.getState().dof);
    this.inputs.toggleDof.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('dof.enabled', enabled);
      this.setEffectControlsDisabled(
        ['dofFocus', 'dofAperture'],
        !enabled,
      );
      // Block muting handled by applyBlockStates via syncControls
      emitDof();
    });
    this.inputs.dofFocus.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('dofFocus', value, 'distance');
      this.stateStore.set('dof.focus', value);
      emitDof();
    });
    this.inputs.dofAperture.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('dofAperture', value, 'decimal', 3);
      this.stateStore.set('dof.aperture', value);
      emitDof();
    });

    const emitBloom = () =>
      this.eventBus.emit('render:bloom', this.stateStore.getState().bloom);
    this.inputs.toggleBloom.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('bloom.enabled', enabled);
      this.setEffectControlsDisabled(
        ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
        !enabled,
      );
      // Block muting handled by applyBlockStates via syncControls
      emitBloom();
    });
    [
      ['bloomThreshold', 'threshold'],
      ['bloomStrength', 'strength'],
      ['bloomRadius', 'radius'],
    ].forEach(([inputKey, property]) => {
      this.inputs[inputKey].addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.updateValueLabel(inputKey, value, 'decimal');
        this.stateStore.set(`bloom.${property}`, value);
        emitBloom();
      });
    });
    this.inputs.bloomColor.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('bloom.color', value);
      emitBloom();
    });

    const emitLensDirt = () =>
      this.eventBus.emit('render:lens-dirt', this.stateStore.getState().lensDirt);
    if (this.inputs.lensDirtEnabled) {
      this.inputs.lensDirtEnabled.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('lensDirt.enabled', enabled);
        this.setEffectControlsDisabled(['lensDirtStrength'], !enabled);
        emitLensDirt();
      });
    }
    if (this.inputs.lensDirtStrength) {
      this.inputs.lensDirtStrength.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.updateValueLabel('lensDirtStrength', value, 'decimal');
        this.stateStore.set('lensDirt.strength', value);
        emitLensDirt();
      });
    }

    const emitGrain = () =>
      this.eventBus.emit('render:grain', this.stateStore.getState().grain);
    this.inputs.toggleGrain.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('grain.enabled', enabled);
      this.setEffectControlsDisabled(['grainIntensity'], !enabled);
      // Block muting handled by applyBlockStates via syncControls
      emitGrain();
    });
    this.inputs.grainIntensity.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) * 0.15;
      this.updateValueLabel('grainIntensity', value / 0.15, 'decimal');
      this.stateStore.set('grain.intensity', value);
      emitGrain();
    });

    const emitAberration = () =>
      this.eventBus.emit(
        'render:aberration',
        this.stateStore.getState().aberration,
      );
    this.inputs.toggleAberration.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('aberration.enabled', enabled);
      this.setEffectControlsDisabled(
        ['aberrationOffset', 'aberrationStrength'],
        !enabled,
      );
      // Block muting handled by applyBlockStates via syncControls
      emitAberration();
    });
    this.inputs.aberrationOffset.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('aberrationOffset', value, 'decimal', 3);
      this.stateStore.set('aberration.offset', value);
      emitAberration();
    });
    this.inputs.aberrationStrength.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('aberrationStrength', value, 'decimal');
      this.stateStore.set('aberration.strength', value);
      emitAberration();
    });

    this.bindColorInput('backgroundColor', 'background', 'scene:background');
    this.inputs.cameraFov.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('cameraFov', value, 'angle');
      this.stateStore.set('camera.fov', value);
      this.eventBus.emit('camera:fov', value);
    });
    this.inputs.cameraTilt?.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, -45, 45, 0);
      this.updateValueLabel('cameraTilt', value, 'angle');
      this.stateStore.set('camera.tilt', value);
      this.eventBus.emit('camera:tilt', value);
    });
    if (this.inputs.cameraTilt) this.enableSliderKeyboardStepping(this.inputs.cameraTilt);
    this.inputs.exposure.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, 0, 2, 1.0);
      this.updateValueLabel('exposure', value, 'decimal');
      this.stateStore.set('exposure', value);
      this.eventBus.emit('scene:exposure', value);
    });
    this.enableSliderKeyboardStepping(this.inputs.exposure);
    if (this.inputs.autoExposure) {
      this.inputs.autoExposure.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        this.stateStore.set('autoExposure', enabled);
        this.setEffectControlsDisabled(['exposure'], enabled);
        this.eventBus.emit('camera:auto-exposure', enabled);
      });
    }
    this.inputs.cameraContrast?.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, 0, 2, 1.0);
      this.stateStore.set('camera.contrast', value);
      this.updateValueLabel('cameraContrast', value, 'decimal');
      this.eventBus.emit('render:contrast', value);
    });
    if (this.inputs.cameraContrast) this.enableSliderKeyboardStepping(this.inputs.cameraContrast);
    this.inputs.cameraTemperature?.addEventListener('input', (event) => {
      const parsed = this.applySnapToCenter(event.target, 2000, 10000, 6000);
      const kelvin = Number.isFinite(parsed) ? parsed : CAMERA_TEMPERATURE_NEUTRAL_K;
      this.stateStore.set('camera.temperature', kelvin);
      this.updateValueLabel('cameraTemperature', kelvin, 'kelvin');
      this.eventBus.emit('render:temperature', kelvin);
    });
    if (this.inputs.cameraTemperature) this.enableSliderKeyboardStepping(this.inputs.cameraTemperature);
    this.inputs.cameraTint?.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, -100, 100, 0) || 0;
      this.stateStore.set('camera.tint', value);
      this.updateValueLabel('cameraTint', value, 'integer');
      this.eventBus.emit('render:tint', value / 100);
    });
    if (this.inputs.cameraTint) this.enableSliderKeyboardStepping(this.inputs.cameraTint);
    this.inputs.cameraHighlights?.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, -100, 100, 0) || 0;
      this.stateStore.set('camera.highlights', value);
      this.updateValueLabel('cameraHighlights', value, 'integer');
      this.eventBus.emit('render:highlights', value / 100);
    });
    if (this.inputs.cameraHighlights) this.enableSliderKeyboardStepping(this.inputs.cameraHighlights);
    this.inputs.cameraShadows?.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, -50, 50, 0) || 0;
      this.stateStore.set('camera.shadows', value);
      this.updateValueLabel('cameraShadows', value, 'integer');
      this.eventBus.emit('render:shadows', value / 50);
    });
    if (this.inputs.cameraShadows) this.enableSliderKeyboardStepping(this.inputs.cameraShadows);
    this.inputs.cameraSaturation?.addEventListener('input', (event) => {
      const value = this.applySnapToCenter(event.target, 0, 2, 1.0);
      this.stateStore.set('camera.saturation', value);
      this.updateValueLabel('cameraSaturation', value, 'decimal');
      this.eventBus.emit('render:saturation', value);
    });
    if (this.inputs.cameraSaturation) this.enableSliderKeyboardStepping(this.inputs.cameraSaturation);
    this.inputs.antiAliasing.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('antiAliasing', value);
      this.eventBus.emit('render:anti-aliasing', value);
    });
    this.inputs.toneMapping.addEventListener('change', (event) => {
      const value = event.target.value;
      this.stateStore.set('toneMapping', value);
      this.eventBus.emit('render:tone-mapping', value);
    });

    this.buttons.export.addEventListener('click', () => {
      this.eventBus.emit('export:png');
    });
  }

  bindGlobalControls() {
    this.dom.resetAll?.addEventListener('click', () => {
      const snapshot = this.stateStore.reset();
      this.syncControls(snapshot);
      this.eventBus.emit('app:reset');
      this.showToast('All settings reset');
    });
    let hideHelp = null;
    const hasHelpOverlay =
      this.dom.helpOverlay !== null && this.dom.closeHelp !== null;
    if (this.dom.helpButton) {
      if (hasHelpOverlay) {
        hideHelp = () => {
          this.dom.helpOverlay.hidden = true;
        };
        this.dom.helpButton.addEventListener('click', () => {
          this.dom.helpOverlay.hidden = false;
          gsap.fromTo(
            this.dom.helpOverlay.querySelector('.help-card'),
            { scale: 0.95, autoAlpha: 0 },
            { scale: 1, autoAlpha: 1, duration: 0.25, ease: 'power2.out' },
          );
        });
        this.dom.closeHelp.addEventListener('click', hideHelp);
        this.dom.helpOverlay.addEventListener('click', (event) => {
          if (event.target === this.dom.helpOverlay) {
            hideHelp();
          }
        });
      } else {
        this.dom.helpButton.addEventListener('click', () => {
          this.showToast('Quick tour coming soon');
        });
      }
    }
    this.dom.toggleUi?.addEventListener('click', () => this.toggleUi());
    this.bindKeyboardShortcuts(hasHelpOverlay, hideHelp);
  }

  bindKeyboardShortcuts(hasHelpOverlay, hideHelp) {
    const HDRI_PRESETS = ['noir-studio', 'luminous-sky', 'sunset-cove', 'steel-lab', 'cyberpunk'];

    // Handle arrow keys for range inputs at document level
    // Check both event.target and document.activeElement to catch all cases
    document.addEventListener('keydown', (event) => {
      const key = event.key;
      const code = event.code;
      const isLeft = key === 'ArrowLeft' || code === 'ArrowLeft';
      const isRight = key === 'ArrowRight' || code === 'ArrowRight';
      
      if (!isLeft && !isRight) return;
      
      // Check both the event target and the currently focused element
      const target = event.target;
      const activeElement = document.activeElement;
      const slider = (target && target.tagName === 'INPUT' && target.type === 'range') 
        ? target 
        : (activeElement && activeElement.tagName === 'INPUT' && activeElement.type === 'range')
          ? activeElement
          : null;
      
      if (slider) {
        // Prevent default browser behavior (focus movement, value stepping)
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Get current value and constraints
        const currentValue = parseFloat(slider.value) || 0;
        const step = parseFloat(slider.step) || 0.01;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        
        // Calculate new value
        let newValue;
        if (isLeft) {
          newValue = Math.max(min, currentValue - step);
        } else {
          newValue = Math.min(max, currentValue + step);
        }
        
        // Only update if value changed
        if (Math.abs(newValue - currentValue) > 0.0001) {
          // Update value directly
          slider.value = String(newValue);
          
          // Force input event to update state and UI
          const inputEvent = new Event('input', { 
            bubbles: true, 
            cancelable: true 
          });
          slider.dispatchEvent(inputEvent);
          
          // Ensure slider stays focused
          if (document.activeElement !== slider) {
            slider.focus();
          }
        }
        
        return false;
      }
    }, true); // Capture phase - run early, before default behavior

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      
      // Don't trigger shortcuts when typing in inputs (but range inputs handled above)
      if (
        (target.tagName === 'INPUT' && target.type !== 'range') ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Allow Escape to close modals even when in inputs
        if (event.key === 'Escape') {
          if (
            hasHelpOverlay &&
            hideHelp &&
            this.dom.helpOverlay &&
            !this.dom.helpOverlay.hidden
          ) {
            event.preventDefault();
            hideHelp();
          }
        }
        return;
      }

      const key = event.key.toLowerCase();
      const isShift = event.shiftKey;
      const isCtrl = event.ctrlKey || event.metaKey;

      // Essential shortcuts
      if (key === 'f') {
        event.preventDefault();
        if (this.eventBus) {
          this.eventBus.emit('camera:focus');
        }
      }


      // Display modes: 1/2/3/4
      if (key === '1' || key === '2' || key === '3' || key === '4') {
        event.preventDefault();
        const modes = ['shaded', 'wireframe', 'clay', 'textures'];
        const modeIndex = parseInt(key) - 1;
        if (modes[modeIndex]) {
          this.stateStore.set('shading', modes[modeIndex]);
          this.eventBus.emit('mesh:shading', modes[modeIndex]);
          // Update radio buttons
          const radio = document.querySelector(`input[name="shading"][value="${modes[modeIndex]}"]`);
          if (radio) radio.checked = true;
        }
      }

      // Space - Play/Pause animation
      if (key === ' ') {
        event.preventDefault();
        if (this.dom.playPause && !this.dom.playPause.disabled) {
          this.eventBus.emit('animation:toggle');
        }
      }

      // Arrow keys - Scrub animation
      if (key === 'arrowleft') {
        event.preventDefault();
        if (this.dom.animationScrub && !this.dom.animationScrub.disabled) {
          const current = parseFloat(this.dom.animationScrub.value) || 0;
          const step = 0.01;
          const newValue = Math.max(0, current - step);
          this.dom.animationScrub.value = newValue;
          this.eventBus.emit('animation:scrub', newValue);
        }
      }

      if (key === 'arrowright') {
        event.preventDefault();
        if (this.dom.animationScrub && !this.dom.animationScrub.disabled) {
          const current = parseFloat(this.dom.animationScrub.value) || 0;
          const step = 0.01;
          const newValue = Math.min(1, current + step);
          this.dom.animationScrub.value = newValue;
          this.eventBus.emit('animation:scrub', newValue);
        }
      }

      // G - Toggle grid
      if (key === 'g') {
        event.preventDefault();
        const current = this.stateStore.getState().groundWire;
        this.stateStore.set('groundWire', !current);
        this.eventBus.emit('studio:ground-wire', !current);
        if (this.inputs.groundWire) {
          this.inputs.groundWire.checked = !current;
        }
      }

      // L - Toggle 3-point lighting
      if (key === 'l') {
        event.preventDefault();
        const current = this.stateStore.getState().lightsEnabled;
        this.stateStore.set('lightsEnabled', !current);
        this.eventBus.emit('lights:enabled', !current);
        if (this.inputs.lightsEnabled) {
          this.inputs.lightsEnabled.checked = !current;
        }
      }

      // H - Toggle UI visibility
      if (key === 'h' || key === 'v') {
        event.preventDefault();
        this.toggleUi();
      }

      // Tab - Cycle through tabs
      if (key === 'tab' && !isCtrl) {
        event.preventDefault();
        const tabs = ['mesh', 'studio', 'render', 'info'];
        const currentIndex = tabs.indexOf(this.activeTab);
        const nextIndex = isShift
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        this.activeTab = nextTab;
        const tabButton = document.querySelector(`[data-tab="${nextTab}"]`);
        if (tabButton) {
          tabButton.click();
        }
      }

      // Esc - Close modals/overlays
      if (key === 'escape') {
        if (
          hasHelpOverlay &&
          hideHelp &&
          this.dom.helpOverlay &&
          !this.dom.helpOverlay.hidden
        ) {
          event.preventDefault();
          hideHelp();
        }
      }

      // Useful shortcuts
      // S - Focus on Scale slider (reset scale to 1)
      if (key === 's') {
        event.preventDefault();
        this.stateStore.set('scale', 1);
        this.eventBus.emit('mesh:scale', 1);
        if (this.inputs.scale) {
          this.inputs.scale.value = 1;
          this.updateValueLabel('scale', 1, 'multiplier');
        }
      }

      // Y - Focus on Y Offset slider (reset to 0)
      if (key === 'y') {
        event.preventDefault();
        this.stateStore.set('yOffset', 0);
        this.eventBus.emit('mesh:yOffset', 0);
        if (this.inputs.yOffset) {
          this.inputs.yOffset.value = 0;
          this.updateValueLabel('yOffset', 0, 'distance');
        }
      }

      // 0 - Reset transform (scale + Y offset + rotations)
      if (key === '0') {
        event.preventDefault();
        this.stateStore.set('scale', 1);
        this.stateStore.set('yOffset', 0);
        this.stateStore.set('rotationX', 0);
        this.stateStore.set('rotationY', 0);
        this.stateStore.set('rotationZ', 0);
        this.eventBus.emit('mesh:scale', 1);
        this.eventBus.emit('mesh:yOffset', 0);
        this.eventBus.emit('mesh:rotationX', 0);
        this.eventBus.emit('mesh:rotationY', 0);
        this.eventBus.emit('mesh:rotationZ', 0);
        if (this.inputs.scale) {
          this.inputs.scale.value = 1;
          this.updateValueLabel('scale', 1, 'multiplier');
        }
        if (this.inputs.yOffset) {
          this.inputs.yOffset.value = 0;
          this.updateValueLabel('yOffset', 0, 'distance');
        }
        if (this.inputs.rotationX) {
          this.inputs.rotationX.value = 0;
          this.updateValueLabel('rotationX', 0, 'angle');
        }
        if (this.inputs.rotationY) {
          this.inputs.rotationY.value = 0;
          this.updateValueLabel('rotationY', 0, 'angle');
        }
        if (this.inputs.rotationZ) {
          this.inputs.rotationZ.value = 0;
          this.updateValueLabel('rotationZ', 0, 'angle');
        }
      }

      // A - Toggle auto-rotate (cycles: off -> slow -> normal -> fast -> off)
      if (key === 'a') {
        event.preventDefault();
        const current = this.stateStore.getState().autoRotate;
        const speeds = [0, 0.2, 0.5, 1];
        const currentIndex = speeds.indexOf(current);
        const nextIndex = (currentIndex + 1) % speeds.length;
        const newSpeed = speeds[nextIndex];
        this.stateStore.set('autoRotate', newSpeed);
        this.eventBus.emit('mesh:auto-rotate', newSpeed);
        // Update radio buttons
        const radio = document.querySelector(`input[name="autorotate"][value="${newSpeed}"]`);
        if (radio) radio.checked = true;
      }

      // P - Toggle podium
      if (key === 'p') {
        event.preventDefault();
        const current = this.stateStore.getState().groundSolid;
        this.stateStore.set('groundSolid', !current);
        this.eventBus.emit('studio:ground-solid', !current);
        if (this.inputs.groundSolid) {
          this.inputs.groundSolid.checked = !current;
        }
      }

      // B - Toggle HDRI background visibility
      if (key === 'b') {
        event.preventDefault();
        const current = this.stateStore.getState().hdriBackground;
        this.stateStore.set('hdriBackground', !current);
        this.eventBus.emit('studio:hdri-background', !current);
        if (this.inputs.hdriBackground) {
          this.inputs.hdriBackground.checked = !current;
        }
      }

      // X - Apply preset: HDRI background on, lights off, chroma/grain off, exposure bump, AA on
      if (key === 'x') {
        event.preventDefault();
        this.applyStudioPresetX();
      }

      // [ / ] - Cycle through HDRI presets
      if (key === '[' || key === ']') {
        event.preventDefault();
        const state = this.stateStore.getState();
        const currentPreset = state.hdri || 'noir-studio';
        let currentIndex = HDRI_PRESETS.indexOf(currentPreset);
        if (currentIndex === -1) {
          currentIndex = 0; // Fallback to first preset
        }
        const direction = key === '[' ? -1 : 1;
        const nextIndex = (currentIndex + direction + HDRI_PRESETS.length) % HDRI_PRESETS.length;
        const nextPreset = HDRI_PRESETS[nextIndex];
        this.stateStore.set('hdri', nextPreset);
        this.eventBus.emit('studio:hdri', nextPreset);
        // Update active button
        this.setHdriActive(nextPreset);
      }
    });
  }

  bindAnimationControls() {
    this.dom.animationBlock.hidden = true;
    this.dom.playPause.addEventListener('click', () => {
      this.eventBus.emit('animation:toggle');
    });
    this.dom.animationScrub.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.eventBus.emit('animation:scrub', value);
    });
    this.dom.animationSelect.addEventListener('change', (event) => {
      const index = parseInt(event.target.value, 10);
      this.eventBus.emit('animation:select', index);
    });
  }

  applyStudioPresetX() {
    // Set HDRI preset to "Meadow"
    this.stateStore.set('hdri', 'meadow');
    this.setHdriActive('meadow');
    this.eventBus.emit('studio:hdri', 'meadow');
    // HDRI background on
    this.stateStore.set('hdriBackground', true);
    this.eventBus.emit('studio:hdri-background', true);
    if (this.inputs.hdriBackground) {
      this.inputs.hdriBackground.checked = true;
    }
    // Exposure to 2 (before HDRI intensity to keep them balanced)
    this.stateStore.set('exposure', 2);
    this.eventBus.emit('scene:exposure', 2);
    if (this.inputs.exposure) {
      this.inputs.exposure.value = 2;
      this.updateValueLabel('exposure', 2, 'decimal');
    }
    // HDRI intensity to 2.50 (slider value)
    const hdriSliderValue = 2.5;
    const hdriIntensity = hdriSliderValue * HDRI_STRENGTH_UNIT;
    this.stateStore.set('hdriStrength', hdriIntensity);
    this.eventBus.emit('studio:hdri-strength', hdriIntensity);
    if (this.inputs.hdriStrength) {
      this.inputs.hdriStrength.value = hdriSliderValue;
      this.updateValueLabel('hdriStrength', hdriSliderValue, 'decimal');
    }
    // Lights off
    this.stateStore.set('lightsEnabled', false);
    this.eventBus.emit('lights:enabled', false);
    if (this.inputs.lightsEnabled) {
      this.inputs.lightsEnabled.checked = false;
    }
    // Chromatic aberration off
    this.stateStore.set('aberration.enabled', false);
    this.eventBus.emit('render:aberration', {
      enabled: false,
      offset: this.stateStore.getState().aberration.offset,
      strength: this.stateStore.getState().aberration.strength,
    });
    if (this.inputs.toggleAberration) {
      this.inputs.toggleAberration.checked = false;
    }
    // Film grain off
    this.stateStore.set('grain.enabled', false);
    this.eventBus.emit('render:grain', {
      enabled: false,
      intensity: this.stateStore.getState().grain.intensity,
      color: this.stateStore.getState().grain.color,
    });
    if (this.inputs.toggleGrain) {
      this.inputs.toggleGrain.checked = false;
    }
    // AA on (FXAA)
    this.stateStore.set('antiAliasing', 'fxaa');
    this.eventBus.emit('render:anti-aliasing', 'fxaa');
    if (this.inputs.antiAliasing) {
      this.inputs.antiAliasing.value = 'fxaa';
    }
  }

  bindCopyButtons() {
    const copyMesh = () => {
      const state = this.stateStore.getState();
      const payload = {
        display: state.shading,
        transform: { scale: state.scale, yOffset: state.yOffset },
        autoRotate: state.autoRotate,
        showNormals: state.showNormals,
      };
      this.copySettingsToClipboard('Mesh settings copied', payload);
    };
    const copyStudio = () => {
      const state = this.stateStore.getState();
      const payload = {
        hdri: state.hdri,
        hdriEnabled: state.hdriEnabled,
        hdriStrength: state.hdriStrength,
        hdriBackground: state.hdriBackground,
        lensFlare: state.lensFlare,
        groundSolid: state.groundSolid,
        groundWire: state.groundWire,
        groundSolidColor: state.groundSolidColor,
        groundWireColor: state.groundWireColor,
        groundWireOpacity: state.groundWireOpacity,
        groundY: state.groundY,
        background: state.background,
        lights: state.lights,
        lightsEnabled: state.lightsEnabled,
        lightsMaster: state.lightsMaster,
        lightsRotation: state.lightsRotation,
        lightsAutoRotate: state.lightsAutoRotate,
      };
      this.copySettingsToClipboard('Studio settings copied', payload);
    };
    const copyRender = () => {
      const state = this.stateStore.getState();
      const payload = {
        dof: state.dof,
        bloom: state.bloom,
        grain: state.grain,
        aberration: state.aberration,
        fresnel: state.fresnel,
        exposure: state.exposure,
        background: state.background,
      };
      this.copySettingsToClipboard('Render settings copied', payload);
    };
    this.buttons.copyMesh?.addEventListener('click', copyMesh);
    this.buttons.copyStudio?.addEventListener('click', copyStudio);
    this.buttons.copyRender?.addEventListener('click', copyRender);

    // Reset buttons
    const resetMesh = () => {
      const defaults = this.stateStore.getDefaults();
      this.stateStore.set('shading', defaults.shading);
      this.stateStore.set('scale', defaults.scale);
      this.stateStore.set('yOffset', defaults.yOffset);
      this.stateStore.set('autoRotate', defaults.autoRotate);
      this.stateStore.set('showNormals', defaults.showNormals);
      this.stateStore.set('clay', defaults.clay);
      
      // Emit events to update scene
      this.eventBus.emit('mesh:shading', defaults.shading);
      this.eventBus.emit('mesh:scale', defaults.scale);
      this.eventBus.emit('mesh:yOffset', defaults.yOffset);
      this.eventBus.emit('mesh:auto-rotate', defaults.autoRotate);
      this.eventBus.emit('mesh:normals', defaults.showNormals);
      this.eventBus.emit('mesh:clay-color', defaults.clay.color);
      this.eventBus.emit('mesh:clay-roughness', defaults.clay.roughness);
      this.eventBus.emit('mesh:clay-specular', defaults.clay.specular);
      
      this.syncUIFromState();
      this.showToast('Mesh settings reset');
    };

    const resetStudio = () => {
      const defaults = this.stateStore.getDefaults();
      this.stateStore.set('hdri', defaults.hdri);
      this.stateStore.set('hdriEnabled', defaults.hdriEnabled);
      this.stateStore.set('hdriStrength', defaults.hdriStrength);
      this.stateStore.set('hdriBackground', defaults.hdriBackground);
      this.stateStore.set('groundSolid', defaults.groundSolid);
      this.stateStore.set('groundWire', defaults.groundWire);
      this.stateStore.set('groundWireOpacity', defaults.groundWireOpacity);
      this.stateStore.set('groundY', defaults.groundY);
      this.stateStore.set('groundSolidColor', defaults.groundSolidColor);
      this.stateStore.set('groundWireColor', defaults.groundWireColor);
      this.stateStore.set('background', defaults.background);
      this.stateStore.set('lights', defaults.lights);
      this.stateStore.set('lightsEnabled', defaults.lightsEnabled);
      this.stateStore.set('lightsMaster', defaults.lightsMaster);
      this.stateStore.set('lightsRotation', defaults.lightsRotation);
      this.stateStore.set('lightsAutoRotate', defaults.lightsAutoRotate);
      this.stateStore.set('lensFlare', defaults.lensFlare);
      
      // Emit events to update scene
      this.setHdriActive(defaults.hdri);
      this.eventBus.emit('studio:hdri', defaults.hdri);
      this.eventBus.emit('studio:hdri-enabled', defaults.hdriEnabled);
      this.toggleHdriControls(defaults.hdriEnabled);
      const normalizedStrength = defaults.hdriStrength / HDRI_STRENGTH_UNIT;
      this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
      this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
      this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
      this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
      this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
      this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
      this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
      // Background color input is always enabled
      this.eventBus.emit('studio:ground-solid', defaults.groundSolid);
      this.eventBus.emit('studio:ground-wire', defaults.groundWire);
      this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
      this.eventBus.emit('studio:ground-y', defaults.groundY);
      this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
      this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
      this.eventBus.emit('scene:background', defaults.background);
      
      // Reset lights
      Object.keys(defaults.lights).forEach((lightId) => {
        const light = defaults.lights[lightId];
        this.eventBus.emit('lights:update', {
          lightId,
          property: 'color',
          value: light.color,
        });
        this.eventBus.emit('lights:update', {
          lightId,
          property: 'intensity',
          value: light.intensity,
        });
      });
      this.eventBus.emit('lights:master', defaults.lightsMaster);
      this.eventBus.emit('lights:enabled', defaults.lightsEnabled);
      this.setLightColorControlsDisabled(!defaults.lightsEnabled);
      this.eventBus.emit('lights:rotate', defaults.lightsRotation);
      this.eventBus.emit('lights:auto-rotate', defaults.lightsAutoRotate);
      this.setLightsRotationDisabled(defaults.lightsAutoRotate);
      this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
      this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
      
      this.syncUIFromState();
      this.showToast('Studio settings reset');
    };

    const resetRender = () => {
      const defaults = this.stateStore.getDefaults();
      this.stateStore.set('dof', defaults.dof);
      this.stateStore.set('bloom', defaults.bloom);
      this.stateStore.set('grain', defaults.grain);
      this.stateStore.set('aberration', defaults.aberration);
      this.stateStore.set('fresnel', defaults.fresnel);
      this.stateStore.set('camera', defaults.camera);
      this.stateStore.set('exposure', defaults.exposure);
      this.stateStore.set('antiAliasing', defaults.antiAliasing);
      this.stateStore.set('toneMapping', defaults.toneMapping);
      
      // Emit events to update scene
      this.eventBus.emit('render:dof', defaults.dof);
      this.setEffectControlsDisabled(
        ['dofFocus', 'dofAperture'],
        !defaults.dof.enabled,
      );
      this.eventBus.emit('render:bloom', defaults.bloom);
      this.setEffectControlsDisabled(
        ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
        !defaults.bloom.enabled,
      );
      this.eventBus.emit('render:grain', defaults.grain);
      this.setEffectControlsDisabled(['grainIntensity'], !defaults.grain.enabled);
      this.eventBus.emit('render:aberration', defaults.aberration);
      this.setEffectControlsDisabled(
        ['aberrationOffset', 'aberrationStrength'],
        !defaults.aberration.enabled,
      );
      this.eventBus.emit('render:fresnel', defaults.fresnel);
      this.setEffectControlsDisabled(
        ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
        !defaults.fresnel.enabled,
      );
      this.eventBus.emit('camera:fov', defaults.camera.fov);
      this.eventBus.emit('scene:exposure', defaults.exposure);
      this.eventBus.emit('render:anti-aliasing', defaults.antiAliasing);
      this.eventBus.emit('render:tone-mapping', defaults.toneMapping);
      
      this.syncUIFromState();
      this.showToast('FX settings reset');
    };

    this.buttons.resetMesh?.addEventListener('click', resetMesh);
    this.buttons.resetStudio?.addEventListener('click', resetStudio);
    this.buttons.resetRender?.addEventListener('click', resetRender);
  }

  bindLocalResetButtons() {
    const defaults = this.stateStore.getDefaults();
    
    document.querySelectorAll('[data-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        const resetType = button.dataset.reset;
        
        switch (resetType) {
          case 'clay':
            this.stateStore.set('clay', defaults.clay);
            this.eventBus.emit('mesh:clay-color', defaults.clay.color);
            this.eventBus.emit('mesh:clay-roughness', defaults.clay.roughness);
            this.eventBus.emit('mesh:clay-specular', defaults.clay.specular);
            this.syncUIFromState();
            break;
            
          case 'wireframe':
            this.stateStore.set('wireframe', defaults.wireframe);
            // Explicitly update UI controls first to ensure they reflect the reset
            if (this.inputs.wireframeColor) {
              this.inputs.wireframeColor.value = defaults.wireframe.color;
            }
            if (this.inputs.wireframeAlwaysOn) {
              this.inputs.wireframeAlwaysOn.checked = defaults.wireframe.alwaysOn;
            }
            if (this.inputs.wireframeOnlyVisibleFaces) {
              this.inputs.wireframeOnlyVisibleFaces.checked = defaults.wireframe.onlyVisibleFaces;
            }
            // Then emit events to update the scene
            this.eventBus.emit('mesh:wireframe-always-on', defaults.wireframe.alwaysOn);
            this.eventBus.emit('mesh:wireframe-color', defaults.wireframe.color);
            this.eventBus.emit('mesh:wireframe-only-visible-faces', defaults.wireframe.onlyVisibleFaces);
            this.syncUIFromState();
            break;
            
          case 'hdri':
            this.stateStore.set('hdri', defaults.hdri);
            this.stateStore.set('hdriStrength', defaults.hdriStrength);
            this.stateStore.set('hdriBlurriness', defaults.hdriBlurriness);
            this.stateStore.set('hdriRotation', defaults.hdriRotation);
            this.stateStore.set('hdriBackground', defaults.hdriBackground);
            this.stateStore.set('lensFlare', defaults.lensFlare);
            this.setHdriActive(defaults.hdri);
            this.eventBus.emit('studio:hdri', defaults.hdri);
            const normalizedStrength = defaults.hdriStrength / HDRI_STRENGTH_UNIT;
            this.eventBus.emit('studio:hdri-strength', defaults.hdriStrength);
            this.eventBus.emit('studio:hdri-blurriness', defaults.hdriBlurriness);
            this.eventBus.emit('studio:hdri-rotation', defaults.hdriRotation);
            this.eventBus.emit('studio:hdri-background', defaults.hdriBackground);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            // Background color input is always enabled
            this.syncUIFromState();
            break;
          
          case 'lens-flare':
            this.stateStore.set('lensFlare', defaults.lensFlare);
            this.eventBus.emit('studio:lens-flare-enabled', defaults.lensFlare.enabled);
            this.eventBus.emit('studio:lens-flare-rotation', defaults.lensFlare.rotation);
            this.eventBus.emit('studio:lens-flare-height', defaults.lensFlare.height);
            this.eventBus.emit('studio:lens-flare-color', defaults.lensFlare.color);
            this.eventBus.emit('studio:lens-flare-quality', defaults.lensFlare.quality);
            this.syncUIFromState();
            break;
            
          case 'lights':
            this.stateStore.set('lights', defaults.lights);
            this.stateStore.set('lightsMaster', defaults.lightsMaster);
            Object.keys(defaults.lights).forEach((lightId) => {
              const light = defaults.lights[lightId];
              this.eventBus.emit('lights:update', {
                lightId,
                property: 'color',
                value: light.color,
              });
              this.eventBus.emit('lights:update', {
                lightId,
                property: 'intensity',
                value: light.intensity,
              });
            });
            this.eventBus.emit('lights:master', defaults.lightsMaster);
            this.syncUIFromState();
            break;
            
          case 'podium':
            // Reset only color, position, and scale - NOT the on/off toggle
            this.stateStore.set('groundSolidColor', defaults.groundSolidColor);
            this.stateStore.set('groundY', defaults.groundY);
            this.stateStore.set('podiumScale', defaults.podiumScale);
            this.eventBus.emit('studio:ground-solid-color', defaults.groundSolidColor);
            this.eventBus.emit('studio:ground-y', defaults.groundY);
            this.eventBus.emit('studio:podium-scale', defaults.podiumScale);
            this.syncControls(this.stateStore.getState());
            break;
            
          case 'background':
            this.stateStore.set('background', defaults.background);
            this.eventBus.emit('scene:background', defaults.background);
            this.syncUIFromState();
            break;
            
          case 'grid':
            this.stateStore.set('groundWireColor', defaults.groundWireColor);
            this.stateStore.set('groundWireOpacity', defaults.groundWireOpacity);
            this.stateStore.set('gridScale', defaults.gridScale);
            this.eventBus.emit('studio:ground-wire-color', defaults.groundWireColor);
            this.eventBus.emit('studio:ground-wire-opacity', defaults.groundWireOpacity);
            this.eventBus.emit('studio:grid-scale', defaults.gridScale);
            this.syncControls(this.stateStore.getState());
            break;
            
          case 'dof':
            this.stateStore.set('dof', defaults.dof);
            this.eventBus.emit('render:dof', defaults.dof);
            this.setEffectControlsDisabled(
              ['dofFocus', 'dofAperture'],
              !defaults.dof.enabled,
            );
            this.syncUIFromState();
            break;
            
          case 'bloom':
            this.stateStore.set('bloom', defaults.bloom);
            this.eventBus.emit('render:bloom', defaults.bloom);
            this.setEffectControlsDisabled(
              ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
              !defaults.bloom.enabled,
            );
            this.syncUIFromState();
            break;

          case 'lens-dirt':
            this.stateStore.set('lensDirt', defaults.lensDirt);
            this.eventBus.emit('render:lens-dirt', defaults.lensDirt);
            this.setEffectControlsDisabled(
              ['lensDirtStrength'],
              !defaults.lensDirt.enabled,
            );
            this.syncControls(this.stateStore.getState());
            break;
            
          case 'grain':
            this.stateStore.set('grain', defaults.grain);
            this.eventBus.emit('render:grain', defaults.grain);
            this.setEffectControlsDisabled(['grainIntensity'], !defaults.grain.enabled);
            this.syncUIFromState();
            break;
            
          case 'aberration':
            this.stateStore.set('aberration', defaults.aberration);
            this.eventBus.emit('render:aberration', defaults.aberration);
            this.setEffectControlsDisabled(
              ['aberrationOffset', 'aberrationStrength'],
              !defaults.aberration.enabled,
            );
            this.syncUIFromState();
            break;
            
          case 'fresnel':
            this.stateStore.set('fresnel', defaults.fresnel);
            this.eventBus.emit('render:fresnel', defaults.fresnel);
            this.setEffectControlsDisabled(
              ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
              !defaults.fresnel.enabled,
            );
            this.syncUIFromState();
            break;
            
            
          case 'camera':
            // Reset all camera & color settings
            this.stateStore.set('camera', { ...defaults.camera });
            this.stateStore.set('exposure', defaults.exposure);
            this.stateStore.set('autoExposure', defaults.autoExposure ?? false);
            // Also reset antiAliasing and toneMapping (in Quality block, but reset together)
            this.stateStore.set('antiAliasing', defaults.antiAliasing);
            this.stateStore.set('toneMapping', defaults.toneMapping);
            // Emit all events to update the scene
            this.eventBus.emit('camera:fov', defaults.camera.fov);
            this.eventBus.emit('camera:tilt', defaults.camera.tilt ?? 0);
            this.eventBus.emit('scene:exposure', defaults.exposure);
            this.eventBus.emit('camera:auto-exposure', defaults.autoExposure ?? false);
            this.eventBus.emit('render:contrast', defaults.camera.contrast);
            this.eventBus.emit(
              'render:temperature',
              defaults.camera.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K,
            );
            this.eventBus.emit(
              'render:tint',
              (defaults.camera.tint ?? 0) / 100,
            );
            this.eventBus.emit(
              'render:highlights',
              (defaults.camera.highlights ?? 0) / 100,
            );
            this.eventBus.emit(
              'render:shadows',
              (defaults.camera.shadows ?? 0) / 100,
            );
            this.eventBus.emit('render:saturation', defaults.camera.saturation);
            this.eventBus.emit('render:anti-aliasing', defaults.antiAliasing);
            this.eventBus.emit('render:tone-mapping', defaults.toneMapping);
            // Sync UI to reflect the reset values
            this.syncControls(this.stateStore.getState());
            break;
            
          case 'transform':
            this.stateStore.set('scale', defaults.scale);
            this.stateStore.set('yOffset', defaults.yOffset);
            this.stateStore.set('rotationX', defaults.rotationX);
            this.stateStore.set('rotationY', defaults.rotationY);
            this.stateStore.set('rotationZ', defaults.rotationZ);
            this.eventBus.emit('mesh:scale', defaults.scale);
            this.eventBus.emit('mesh:yOffset', defaults.yOffset);
            this.eventBus.emit('mesh:rotationX', defaults.rotationX);
            this.eventBus.emit('mesh:rotationY', defaults.rotationY);
            this.eventBus.emit('mesh:rotationZ', defaults.rotationZ);
            this.eventBus.emit('mesh:reset-transform');
            this.syncUIFromState();
            break;
        }
      });
    });
  }

  bindRotationNotches() {
    if (!this.dom.rotationNotches) return;
    this.dom.rotationNotches.forEach((button) => {
      button.addEventListener('click', () => {
        const axis = button.dataset.rotationAxis?.toUpperCase();
        if (!axis) return;
        const input = this.inputs[`rotation${axis}`];
        if (!input) return;
        const min = parseFloat(input.min ?? '-180');
        const max = parseFloat(input.max ?? '180');
        const range = max - min || 360;
        let value = parseFloat(input.value) || 0;
        value += 90;
        if (value > max) value -= range;
        if (value < min) value += range;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  toggleUi(forceState) {
    const nextState =
      typeof forceState === 'boolean' ? forceState : !this.uiHidden;
    this.uiHidden = nextState;
    document.body.classList.toggle('ui-hidden', this.uiHidden);
    if (this.shelfRevealed && this.dom.shelf) {
      if (this.uiHidden) {
        this.dom.shelf.classList.add('is-shelf-hidden');
      } else {
        requestAnimationFrame(() =>
          this.dom.shelf.classList.remove('is-shelf-hidden'),
        );
      }
    }
    this.setDropzoneVisible(this.dropzoneVisible);
    if (this.uiHidden) {
      document.activeElement?.blur?.();
    }
    if (this.dom.toggleUi) {
      this.dom.toggleUi.textContent = this.uiHidden ? 'V Show UI' : 'V Hide UI';
      this.dom.toggleUi.blur?.();
    }
  }

  // ============================================
  // Unified Utility Methods
  // ============================================

  /**
   * Format slider value with appropriate unit and decimals
   * @param {number} value - The numeric value
   * @param {string} type - Format type: 'angle', 'distance', 'multiplier', 'decimal', 'integer'
   * @param {number} decimals - Optional override for decimal places
   * @returns {string} Formatted string
   */
  formatSliderValue(value, type = 'decimal', decimals = null) {
    if (!Number.isFinite(value)) return '—';
    
    if (type === 'kelvin') {
      const rounded = Math.round(value);
      return `${rounded}K`;
    }

    const formatMap = {
      angle: { decimals: 0, unit: '°' },
      distance: { decimals: 2, unit: 'm' },
      multiplier: { decimals: 2, unit: '×' },
      decimal: { decimals: 2, unit: '' },
      integer: { decimals: 0, unit: '' },
    };
    
    const config = formatMap[type] || formatMap.decimal;
    const dec = decimals !== null ? decimals : config.decimals;
    const formatted = dec === 0 ? Math.round(value).toString() : value.toFixed(dec);
    return config.unit ? `${formatted}${config.unit}` : formatted;
  }

  /**
   * Update value label for a slider
   * @param {string} key - The data-output key
   * @param {string|number} value - The value to display (or formatted string)
   * @param {string} type - Format type if value is number
   * @param {number} decimals - Optional override for decimal places
   */
  updateValueLabel(key, value, type = null, decimals = null) {
    const label = document.querySelector(`[data-output="${key}"]`);
    if (!label) return;
    
    if (typeof value === 'number' && type) {
      label.textContent = this.formatSliderValue(value, type, decimals);
    } else {
      label.textContent = String(value);
    }
  }

  /**
   * Apply snap-to-center for sliders with center default values
   * @param {HTMLInputElement} slider - The slider input element
   * @param {number} min - Minimum slider value
   * @param {number} max - Maximum slider value
   * @param {number} centerValue - The center/default value to snap to
   * @param {number} thresholdPercent - Threshold as percentage of range (default: 3%)
   * @returns {number} - The value (snapped if within threshold, otherwise original)
   */
  applySnapToCenter(slider, min, max, centerValue, thresholdPercent = 3) {
    if (!slider) return parseFloat(slider.value);
    
    const currentValue = parseFloat(slider.value);
    const range = max - min;
    const threshold = (range * thresholdPercent) / 100;
    const distanceFromCenter = Math.abs(currentValue - centerValue);
    
    // If within threshold, snap to center
    if (distanceFromCenter <= threshold) {
      slider.value = centerValue;
      return centerValue;
    }
    
    return currentValue;
  }

  /**
   * Setup keyboard support for all range inputs
   */
  setupSliderKeyboardSupport() {
    // Find all range inputs and ensure they're focusable
    const allSliders = document.querySelectorAll('input[type="range"]');
    allSliders.forEach((slider) => {
      // Ensure focusable
      if (!slider.hasAttribute('tabindex')) {
        slider.setAttribute('tabindex', '0');
      }
      
      // Ensure focus on click
      slider.addEventListener('click', () => {
        slider.focus();
      }, { passive: true });
    });
  }

  /**
   * Enable keyboard arrow key stepping for a slider
   * @param {HTMLInputElement} slider - The slider input element
   * @deprecated - Keyboard stepping is now handled at document level for all sliders
   */
  enableSliderKeyboardStepping(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Just ensure slider is focusable - keyboard handling is done at document level
    slider.setAttribute('tabindex', '0');
    
    // Ensure slider gets focus on click
    slider.addEventListener('click', (event) => {
      if (event.target === slider) {
        slider.focus();
      }
    });
  }

  /**
   * Unified method to set control disabled state
   * @param {string|string[]} inputIds - Single ID or array of IDs
   * @param {boolean} disabled - Whether to disable
   * @param {object} options - Additional options
   */
  setControlDisabled(inputIds, disabled, options = {}) {
    const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
    const { applyBlockMute = false, blockKey = null } = options;
    
    ids.forEach((id) => {
      const input = this.inputs[id];
      if (!input) return;
      
      input.disabled = disabled;
      // Use consistent class name
      input.classList.toggle('is-disabled-handle', disabled);
    });
    
    // Optionally apply block muting
    if (applyBlockMute && blockKey) {
      this.setBlockMuted(blockKey, disabled);
    }
  }

  /**
   * Unified color input handler
   * @param {string} inputId - The color input ID
   * @param {string} statePath - StateStore path (e.g., 'clay.color', 'lensFlare.color')
   * @param {string} eventName - Event bus event name
   */
  bindColorInput(inputId, statePath, eventName) {
    const input = this.inputs[inputId];
    if (!input) return;
    
    input.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set(statePath, value);
      this.eventBus.emit(eventName, value);
    });
  }

  /**
   * Sync UI from current state (alias for syncControls)
   */
  syncUIFromState() {
    const state = this.stateStore.getState();
    this.syncControls(state);
  }

  setHdriActive(preset) {
    this.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === preset);
    });
  }


  toggleHdriControls(enabled) {
    this.inputs.hdriButtons.forEach((button) => {
      button.disabled = !enabled;
      button.classList.toggle('is-disabled', !enabled);
    });
    // Block muting handled by applyBlockStates via syncControls
    this.inputs.hdriBackground.disabled = !enabled;
      this.inputs.hdriStrength.disabled = !enabled;
      this.inputs.hdriBlurriness.disabled = !enabled;
      if (this.inputs.hdriRotation) {
        this.inputs.hdriRotation.disabled = !enabled;
      }
    if (!enabled) {
      this.inputs.backgroundColor.disabled = false;
    }
    this.updateLensFlareControlsDisabled();
  }

  updateLensFlareControlsDisabled() {
    if (!this.inputs.lensFlareEnabled) return;
    const hdriActive = !!this.inputs.hdriEnabled?.checked;
    const enabled = hdriActive && !!this.inputs.lensFlareEnabled.checked;
    
    // Disable lens flare toggle if HDRI is off
    this.setControlDisabled('lensFlareEnabled', !hdriActive);
    
    // Disable lens flare controls if not enabled
    this.setControlDisabled(
      ['lensFlareRotation', 'lensFlareHeight', 'lensFlareColor', 'lensFlareQuality'],
      !enabled,
    );
    
    // Block muting handled by applyBlockStates via syncControls
  }

  setDropzoneVisible(visible) {
    if (!this.dom.dropzone) return;
    this.dropzoneVisible = visible;
    const shouldShow = visible && !this.uiHidden;
    this.dom.dropzone.style.pointerEvents = shouldShow ? 'auto' : 'none';
    this.dom.dropzone.style.opacity = shouldShow ? '1' : '0';
    document.body.classList.toggle('dropzone-visible', shouldShow);
  }

  revealShelf() {
    if (this.shelfRevealed || !this.dom.shelf) return;
    this.shelfRevealed = true;
    requestAnimationFrame(() => {
      if (!this.uiHidden) {
        this.dom.shelf.classList.remove('is-shelf-hidden');
      }
    });
  }

  showToast(message) {
    const template = this.dom.toastTemplate?.content?.firstElementChild;
    if (!template) return;
    const toast = template.cloneNode(true);
    toast.querySelector('.toast-message').textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  copySettingsToClipboard(message, payload) {
    const text = JSON.stringify(payload, null, 2);
    const write = async () => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    };
    write()
      .then(() => this.showToast(message))
      .catch(() => this.showToast('Copy failed'));
  }

  updateStats(stats) {
    if (!stats) return;
    const mapping = {
      assetname: stats.assetName ?? '—',
      generator: stats.generator ?? '—',
      version: stats.version ?? '—',
      copyright: stats.copyright ?? '—',
      triangles: stats.triangles?.toLocaleString() ?? '—',
      vertices: stats.vertices?.toLocaleString() ?? '—',
      materials: stats.materials?.toString() ?? '—',
      textures: stats.textures?.toString() ?? '—',
      filesize: stats.fileSize ?? '—',
      bounds: stats.bounds ?? '—',
    };
    Array.from(this.dom.stats.querySelectorAll('div')).forEach((row) => {
      const label = row.querySelector('dt')?.textContent?.toLowerCase();
      const key = label?.replace(/\s/g, '');
      const targetKey =
        {
          assetname: 'assetname',
          generator: 'generator',
          version: 'version',
          copyright: 'copyright',
          triangles: 'triangles',
          vertices: 'vertices',
          materials: 'materials',
          textures: 'textures',
          filesize: 'filesize',
          bounds: 'bounds',
        }[key] ?? key;
      const dd = row.querySelector('dd');
      if (dd && mapping[targetKey] !== undefined) {
        dd.textContent = mapping[targetKey];
      }
    });
  }

  updateTitle(filename) {
    document.title = `Orby — ${filename}`;
    if (this.dom.topBarTitle) {
      this.dom.topBarTitle.textContent = filename;
    }
  }

  updateTopBarDetail(detail) {
    if (this.dom.topBarAnimation) {
      this.dom.topBarAnimation.textContent = detail;
    }
  }

  extractAnimationName(fullName) {
    if (!fullName) return 'Animation';
    
    // Split by pipe if present
    const parts = fullName.split('|');
    
    // Find the most meaningful part (usually the last or middle part that's not common prefixes)
    let namePart = fullName;
    if (parts.length > 1) {
      // Skip common prefixes like "Armature", "baselayer", etc.
      const meaningfulParts = parts.filter(part => {
        const lower = part.toLowerCase();
        return !['armature', 'baselayer', 'mixamo', 'root'].includes(lower);
      });
      namePart = meaningfulParts.length > 0 ? meaningfulParts[meaningfulParts.length - 1] : parts[parts.length - 1];
    }
    
    // Convert underscores to spaces and title case
    return namePart
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }

  setAnimationClips(clips) {
    this.dom.animationSelect.innerHTML = '';
    if (!clips?.length) {
      this.dom.animationBlock.hidden = true;
      this.animationPlaying = false;
      this.dom.playPause.disabled = true;
      this.dom.animationScrub.disabled = true;
      return;
    }
    clips.forEach((clip, index) => {
      const option = document.createElement('option');
      option.value = index;
      const displayName = this.extractAnimationName(clip.name);
      option.textContent = displayName;
      this.dom.animationSelect.appendChild(option);
    });
    this.dom.animationBlock.hidden = false;
    this.dom.playPause.disabled = false;
    this.dom.animationScrub.disabled = false;
    this.currentAnimationDuration = clips[0].seconds ?? 0;
  }

  setAnimationPlaying(playing) {
    this.animationPlaying = playing;
    this.dom.playPause.textContent = playing ? 'Pause' : 'Play';
  }

  updateAnimationTime(current, duration) {
    if (!duration) return;
    const clamp = Math.max(0, Math.min(current, duration));
    const minutes = Math.floor(clamp / 60)
      .toString()
      .padStart(1, '0');
    const seconds = Math.floor(clamp % 60)
      .toString()
      .padStart(2, '0');
    this.dom.animationTime.textContent = `${minutes}:${seconds}`;
    const progress = duration === 0 ? 0 : clamp / duration;
    this.dom.animationScrub.value = progress;
  }

  syncMeshControls(state) {
    this.inputs.scale.value = state.scale;
    this.updateValueLabel('scale', state.scale, 'multiplier');
    this.inputs.yOffset.value = state.yOffset;
    this.updateValueLabel('yOffset', state.yOffset, 'distance');
    if (this.inputs.rotationX) {
      this.inputs.rotationX.value = state.rotationX ?? 0;
      this.updateValueLabel('rotationX', state.rotationX ?? 0, 'angle');
    }
    if (this.inputs.rotationY) {
      this.inputs.rotationY.value = state.rotationY ?? 0;
      this.updateValueLabel('rotationY', state.rotationY ?? 0, 'angle');
    }
    if (this.inputs.rotationZ) {
      this.inputs.rotationZ.value = state.rotationZ ?? 0;
      this.updateValueLabel('rotationZ', state.rotationZ ?? 0, 'angle');
    }
    if (this.inputs.showNormals) {
      this.inputs.showNormals.checked = state.showNormals;
    }
    this.inputs.clayColor.value = state.clay.color;
    this.inputs.clayRoughness.value = state.clay.roughness;
    this.updateValueLabel('clayRoughness', state.clay.roughness, 'decimal');
    this.inputs.claySpecular.value = state.clay.specular;
    this.updateValueLabel('claySpecular', state.clay.specular, 'decimal');
    if (this.inputs.clayNormalMap) {
      this.inputs.clayNormalMap.checked = state.clay.normalMap !== false;
    }
    if (state.wireframe) {
      if (this.inputs.wireframeColor) {
        this.inputs.wireframeColor.value = state.wireframe.color;
      }
      if (this.inputs.wireframeAlwaysOn) {
        this.inputs.wireframeAlwaysOn.checked = !!state.wireframe.alwaysOn;
      }
      if (this.inputs.wireframeOnlyVisibleFaces) {
        this.inputs.wireframeOnlyVisibleFaces.checked = !!state.wireframe.onlyVisibleFaces;
      }
    }
    
    // Radio buttons
    this.inputs.autoRotate.forEach((input) => {
      input.checked = parseFloat(input.value) === state.autoRotate;
    });
    this.inputs.shading.forEach((input) => {
      input.checked = input.value === state.shading;
    });
  }

  syncStudioControls(state) {
    this.setHdriActive(state.hdri);
    this.inputs.hdriEnabled.checked = !!state.hdriEnabled;
    this.toggleHdriControls(state.hdriEnabled);
    const normalizedStrength = Math.min(
      3,
      Math.max(0, state.hdriStrength / HDRI_STRENGTH_UNIT),
    );
    this.inputs.hdriStrength.value = normalizedStrength;
    this.updateValueLabel('hdriStrength', normalizedStrength, 'decimal');
    if (this.inputs.hdriBlurriness) {
      const blurriness = state.hdriBlurriness ?? 0;
      this.inputs.hdriBlurriness.value = blurriness;
      this.updateValueLabel('hdriBlurriness', blurriness, 'decimal');
    }
    if (this.inputs.hdriRotation) {
      const rotation = state.hdriRotation ?? 0;
      this.inputs.hdriRotation.value = rotation;
      this.updateValueLabel('hdriRotation', rotation, 'angle');
    }
    this.inputs.hdriBackground.checked = state.hdriBackground;
    // Background color input is always enabled - color is visible when HDRI background is off
    this.inputs.backgroundColor.value = state.background;
    
    // Lens Flare
    if (this.inputs.lensFlareEnabled) {
      this.inputs.lensFlareEnabled.checked = !!state.lensFlare?.enabled;
    }
    if (this.inputs.lensFlareRotation) {
      const rotation = state.lensFlare?.rotation ?? 0;
      this.inputs.lensFlareRotation.value = rotation;
      this.updateValueLabel('lensFlareRotation', rotation, 'angle');
    }
    if (this.inputs.lensFlareHeight) {
      const height = Math.min(
        90,
        Math.max(0, state.lensFlare?.height ?? 0),
      );
      this.inputs.lensFlareHeight.value = height;
      this.updateValueLabel('lensFlareHeight', height, 'angle');
    }
    if (this.inputs.lensFlareColor && state.lensFlare?.color) {
      this.inputs.lensFlareColor.value = state.lensFlare.color;
    }
    if (this.inputs.lensFlareQuality) {
      this.inputs.lensFlareQuality.value = state.lensFlare?.quality ?? 'maximum';
    }
    this.updateLensFlareControlsDisabled();
    
    // Ground/Podium
    this.inputs.groundSolid.checked = state.groundSolid;
    this.inputs.groundWire.checked = state.groundWire;
    this.inputs.groundSolidColor.value = state.groundSolidColor;
    this.inputs.groundWireColor.value = state.groundWireColor;
    this.inputs.groundWireOpacity.value = state.groundWireOpacity;
    this.updateValueLabel('groundWireOpacity', state.groundWireOpacity, 'decimal');
    this.inputs.groundY.value = state.groundY;
    this.updateValueLabel('groundY', state.groundY, 'distance');
    if (this.inputs.podiumScale) {
      this.inputs.podiumScale.value = state.podiumScale ?? 1;
      this.updateValueLabel('podiumScale', state.podiumScale ?? 1, 'decimal');
    }
    if (this.inputs.gridScale) {
      this.inputs.gridScale.value = state.gridScale ?? 1;
      this.updateValueLabel('gridScale', state.gridScale ?? 1, 'decimal');
    }
    
    // Lights
    if (this.inputs.lightsRotation) {
      this.inputs.lightsRotation.value = state.lightsRotation ?? 0;
      this.updateValueLabel('lightsRotation', state.lightsRotation ?? 0, 'angle');
    }
    if (this.inputs.lightsMaster) {
      const masterValue = state.lightsMaster ?? 1;
      this.inputs.lightsMaster.value = masterValue;
      this.updateValueLabel('lightsMaster', masterValue, 'decimal');
    }
    if (this.inputs.showLightIndicators) {
      this.inputs.showLightIndicators.checked = !!state.showLightIndicators;
    }
    if (this.inputs.lightsAutoRotate) {
      this.inputs.lightsAutoRotate.checked = !!state.lightsAutoRotate;
      this.setLightsRotationDisabled(!!state.lightsAutoRotate);
    }
    if (this.inputs.lightsEnabled) {
      this.inputs.lightsEnabled.checked = !!state.lightsEnabled;
      this.setLightColorControlsDisabled(!state.lightsEnabled);
    }
    this.inputs.lightControls.forEach((control) => {
      const lightId = control.dataset.light;
      const colorInput = control.querySelector('input[type="color"]');
      if (colorInput) {
        colorInput.value = state.lights[lightId].color;
      }
    });
    
    // HDRI buttons
    this.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === state.hdri);
    });
  }

  syncRenderControls(state) {
    // DOF
    this.inputs.dofFocus.value = state.dof.focus;
    this.updateValueLabel('dofFocus', state.dof.focus, 'distance');
    this.inputs.dofAperture.value = state.dof.aperture;
    this.updateValueLabel('dofAperture', state.dof.aperture, 'decimal', 3);
    this.inputs.toggleDof.checked = !!state.dof.enabled;
    this.setEffectControlsDisabled(
      ['dofFocus', 'dofAperture'],
      !state.dof.enabled,
    );
    
    // Bloom
    this.inputs.bloomThreshold.value = state.bloom.threshold;
    this.updateValueLabel('bloomThreshold', state.bloom.threshold, 'decimal');
    this.inputs.bloomStrength.value = state.bloom.strength;
    this.updateValueLabel('bloomStrength', state.bloom.strength, 'decimal');
    this.inputs.bloomRadius.value = state.bloom.radius;
    this.updateValueLabel('bloomRadius', state.bloom.radius, 'decimal');
    if (this.inputs.bloomColor && state.bloom.color) {
      this.inputs.bloomColor.value = state.bloom.color;
    }
    this.inputs.toggleBloom.checked = !!state.bloom.enabled;
    this.setEffectControlsDisabled(
      ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
      !state.bloom.enabled,
    );

    if (this.inputs.lensDirtStrength && state.lensDirt) {
      this.inputs.lensDirtStrength.value = state.lensDirt.strength;
      this.updateValueLabel('lensDirtStrength', state.lensDirt.strength, 'decimal');
    }
    if (this.inputs.lensDirtEnabled) {
      const enabled = !!state.lensDirt?.enabled;
      this.inputs.lensDirtEnabled.checked = enabled;
      this.setEffectControlsDisabled(['lensDirtStrength'], !enabled);
    }
    if (this.inputs.autoExposure) {
      const enabled = !!state.autoExposure;
      this.inputs.autoExposure.checked = enabled;
      this.setEffectControlsDisabled(['exposure'], enabled);
    }
    
    // Grain
    this.inputs.grainIntensity.value = (state.grain.intensity / 0.15).toFixed(2);
    this.updateValueLabel('grainIntensity', state.grain.intensity / 0.15, 'decimal');
    this.inputs.toggleGrain.checked = !!state.grain.enabled;
    this.setEffectControlsDisabled(['grainIntensity'], !state.grain.enabled);
    
    // Aberration
    this.inputs.aberrationOffset.value = state.aberration.offset;
    this.updateValueLabel('aberrationOffset', state.aberration.offset, 'decimal', 3);
    this.inputs.aberrationStrength.value = state.aberration.strength;
    this.updateValueLabel('aberrationStrength', state.aberration.strength, 'decimal');
    this.inputs.toggleAberration.checked = !!state.aberration.enabled;
    this.setEffectControlsDisabled(
      ['aberrationOffset', 'aberrationStrength'],
      !state.aberration.enabled,
    );
    
    // Fresnel
    this.inputs.toggleFresnel.checked = !!state.fresnel.enabled;
    this.inputs.fresnelColor.value = state.fresnel.color;
    this.inputs.fresnelRadius.value = state.fresnel.radius;
    this.updateValueLabel('fresnelRadius', state.fresnel.radius, 'decimal');
    this.inputs.fresnelStrength.value = state.fresnel.strength;
    this.updateValueLabel('fresnelStrength', state.fresnel.strength, 'decimal');
    this.setEffectControlsDisabled(
      ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
      !state.fresnel.enabled,
    );
    
    // Camera & Exposure
    this.inputs.cameraFov.value = state.camera.fov;
    this.updateValueLabel('cameraFov', state.camera.fov, 'angle');
    if (this.inputs.cameraTilt) {
      this.inputs.cameraTilt.value = state.camera.tilt ?? 0;
      this.updateValueLabel('cameraTilt', state.camera.tilt ?? 0, 'angle');
    }
    this.inputs.exposure.value = state.exposure;
    this.updateValueLabel('exposure', state.exposure, 'decimal');
    if (this.inputs.cameraContrast) {
      const contrast = state.camera?.contrast ?? 1.0;
      this.inputs.cameraContrast.value = contrast;
      this.updateValueLabel('cameraContrast', contrast, 'decimal');
    }
    if (this.inputs.cameraTemperature) {
      const temp = state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K;
      this.inputs.cameraTemperature.value = temp;
      this.updateValueLabel('cameraTemperature', temp, 'kelvin');
    }
    if (this.inputs.cameraTint) {
      const tint = state.camera?.tint ?? 0;
      this.inputs.cameraTint.value = tint;
      this.updateValueLabel('cameraTint', tint, 'integer');
    }
    if (this.inputs.cameraHighlights) {
      const highlights = state.camera?.highlights ?? 0;
      this.inputs.cameraHighlights.value = highlights;
      this.updateValueLabel('cameraHighlights', highlights, 'integer');
    }
    if (this.inputs.cameraShadows) {
      const shadows = state.camera?.shadows ?? 0;
      this.inputs.cameraShadows.value = shadows;
      this.updateValueLabel('cameraShadows', shadows, 'integer');
    }
    if (this.inputs.cameraSaturation) {
      const saturation = state.camera?.saturation ?? 1.0;
      this.inputs.cameraSaturation.value = saturation;
      this.updateValueLabel('cameraSaturation', saturation, 'decimal');
    }
    if (this.inputs.antiAliasing) {
      this.inputs.antiAliasing.value = state.antiAliasing ?? 'none';
    }
    if (this.inputs.toneMapping) {
      this.inputs.toneMapping.value = state.toneMapping ?? 'aces-filmic';
    }
  }

  syncControls(state) {
    this.syncMeshControls(state);
    this.syncStudioControls(state);
    this.syncRenderControls(state);
    this.applyBlockStates(state);
  }

  setEffectControlsDisabled(ids, disabled) {
    this.setControlDisabled(ids, disabled);
  }

  setLightsRotationDisabled(disabled) {
    this.setControlDisabled('lightsRotation', disabled);
  }

  setLightsRotation(value) {
    if (!this.inputs.lightsRotation) return;
    const normalized = ((value % 360) + 360) % 360;
    this.inputs.lightsRotation.value = normalized;
    this.updateValueLabel('lightsRotation', normalized, 'angle');
  }

  setBlockMuted(blockKey, muted) {
    // First try to find a subsection (for merged blocks)
    const subsection = this.dom?.subsections?.[blockKey];
    if (subsection) {
      subsection.classList.toggle('is-muted', muted);
      return;
    }
    // Fall back to regular block
    const block = this.dom?.blocks?.[blockKey];
    if (!block) {
      // Silently fail - block might not exist yet or key might be wrong
      return;
    }
    // Only toggle the class - don't affect other blocks
    block.classList.toggle('is-muted', muted);
  }

  applyBlockStates(state) {
    // Use the latest state to ensure accuracy
    const currentState = state || this.stateStore.getState();
    
    // Apply muting based on current state - each block is independent
    // Each block is evaluated independently based on its own state property
    // This ensures only the correct block is muted when its toggle is changed
    
    // HDRI block - only muted if hdriEnabled is false
    this.setBlockMuted('hdri', !currentState.hdriEnabled);
    
    // Lens flare block - requires both HDRI and lens flare to be enabled
    const lensEnabled = !!currentState.hdriEnabled && !!currentState.lensFlare?.enabled;
    this.setBlockMuted('lens-flare', !lensEnabled);
    
    // Lights block - only muted if lightsEnabled is false
    this.setBlockMuted('lights', !currentState.lightsEnabled);
    
    // Podium block - only muted if groundSolid is false
    this.setBlockMuted('podium', !currentState.groundSolid);
    
    // Grid block - only muted if groundWire is false
    this.setBlockMuted('grid', !currentState.groundWire);
    
    // DOF block - only muted if dof.enabled is false
    this.setBlockMuted('dof', !currentState.dof?.enabled);
    
    // Bloom block - only muted if bloom.enabled is false
    this.setBlockMuted('bloom', !currentState.bloom?.enabled);

    // Lens dirt block - only muted if lens dirt disabled
    this.setBlockMuted('lens-dirt', !currentState.lensDirt?.enabled);
    
    // Grain block - only muted if grain.enabled is false
    this.setBlockMuted('grain', !currentState.grain?.enabled);
    
    // Aberration block - only muted if aberration.enabled is false
    this.setBlockMuted('aberration', !currentState.aberration?.enabled);
    
    // Fresnel block - only muted if fresnel.enabled is false
    this.setBlockMuted('fresnel', !currentState.fresnel?.enabled);
  }

  setLightColorControlsDisabled(disabled) {
    this.inputs.lightControls.forEach((control) => {
      const input = control.querySelector('input[type="color"]');
      if (!input) return;
      input.disabled = disabled;
      input.classList.toggle('is-disabled-handle', disabled);
    });
    this.setControlDisabled('lightsMaster', disabled);
  }

  updateExposureDisplay(value) {
    if (!this.inputs.exposure) return;
    // Update slider value (as number) and label, even when slider is disabled
    this.inputs.exposure.value = value;
    this.updateValueLabel('exposure', parseFloat(value), 'decimal');
  }
}

