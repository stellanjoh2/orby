import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

const HDRI_STRENGTH_UNIT = 0.4;

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
    this.dom.reloadMesh = q('#reloadMesh');

    this.inputs = {
      shading: document.querySelectorAll('input[name="shading"]'),
      scale: q('#scaleControl'),
      yOffset: q('#yOffsetControl'),
      autoRotate: document.querySelectorAll('input[name="autorotate"]'),
      showNormals: q('#showNormals'),
      hdriEnabled: q('#hdriEnabled'),
      hdriStrength: q('#hdriStrength'),
      hdriBackground: q('#hdriBackground'),
      clayColor: q('#clayColor'),
      clayRoughness: q('#clayRoughness'),
      claySpecular: q('#claySpecular'),
      groundSolid: q('#groundSolid'),
      groundWire: q('#groundWire'),
      groundSolidColor: q('#groundSolidColor'),
      groundWireColor: q('#groundWireColor'),
      groundWireOpacity: q('#groundWireOpacity'),
      groundY: q('#groundY'),
      groundHeight: q('#groundHeight'),
      hdriButtons: document.querySelectorAll('[data-hdri]'),
      lightControls: document.querySelectorAll('.light-color-row'),
      lightsEnabled: q('#lightsEnabled'),
      lightsMaster: q('#lightsMaster'),
      lightsRotation: q('#lightsRotation'),
      lightsAutoRotate: q('#lightsAutoRotate'),
      dofFocus: q('#dofFocus'),
      dofAperture: q('#dofAperture'),
      dofStrength: q('#dofStrength'),
      toggleDof: q('#toggleDof'),
      bloomThreshold: q('#bloomThreshold'),
      bloomStrength: q('#bloomStrength'),
      bloomRadius: q('#bloomRadius'),
      toggleBloom: q('#toggleBloom'),
      grainIntensity: q('#grainIntensity'),
      toggleGrain: q('#toggleGrain'),
      aberrationOffset: q('#aberrationOffset'),
      aberrationStrength: q('#aberrationStrength'),
      toggleAberration: q('#toggleAberration'),
      toggleFresnel: q('#toggleFresnel'),
      fresnelColor: q('#fresnelColor'),
      fresnelRadius: q('#fresnelRadius'),
      fresnelStrength: q('#fresnelStrength'),
      fogType: q('#fogType'),
      fogColor: q('#fogColor'),
      fogNear: q('#fogNear'),
      fogDensity: q('#fogDensity'),
      backgroundColor: q('#backgroundColor'),
      cameraFov: q('#cameraFov'),
      exposure: q('#exposure'),
    };

    this.buttons = {
      transformReset: q('#transformReset'),
      export: q('#exportPng'),
      copyStudio: q('#copyStudioSettings'),
      copyRender: q('#copyRenderSettings'),
    };
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
    this.dom.reloadMesh.addEventListener('click', () => {
      this.eventBus.emit('file:reload');
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
      this.updateValueLabel('scale', `${value.toFixed(2)}×`);
      this.stateStore.set('scale', value);
      this.eventBus.emit('mesh:scale', value);
    });
    this.inputs.yOffset.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('yOffset', `${value.toFixed(2)}m`);
      this.stateStore.set('yOffset', value);
      this.eventBus.emit('mesh:yOffset', value);
    });
    this.buttons.transformReset.addEventListener('click', () => {
      this.inputs.scale.value = 1;
      this.inputs.yOffset.value = 0;
      this.updateValueLabel('scale', '1.00×');
      this.updateValueLabel('yOffset', '0.00m');
      this.stateStore.set('scale', 1);
      this.stateStore.set('yOffset', 0);
      this.eventBus.emit('mesh:scale', 1);
      this.eventBus.emit('mesh:yOffset', 0);
      this.eventBus.emit('mesh:reset-transform');
    });
    this.inputs.autoRotate.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          const speed = parseFloat(input.value);
          this.stateStore.set('autoRotate', speed);
          this.eventBus.emit('mesh:auto-rotate', speed);
        }
      });
    });
    this.inputs.clayColor.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('clay.color', value);
      this.eventBus.emit('mesh:clay-color', value);
    });
    this.inputs.clayRoughness.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.stateStore.set('clay.roughness', value);
      this.updateValueLabel('clayRoughness', value.toFixed(2));
      this.eventBus.emit('mesh:clay-roughness', value);
    });
    this.inputs.claySpecular.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.stateStore.set('clay.specular', value);
      this.updateValueLabel('claySpecular', value.toFixed(2));
      this.eventBus.emit('mesh:clay-specular', value);
    });
    this.inputs.showNormals?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('showNormals', enabled);
      this.eventBus.emit('mesh:normals', enabled);
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
    });
    this.inputs.hdriStrength.addEventListener('input', (event) => {
      const normalized = Math.min(
        10,
        Math.max(0, parseFloat(event.target.value)),
      );
      const actual = normalized * HDRI_STRENGTH_UNIT;
      this.updateValueLabel('hdriStrength', normalized.toFixed(2));
      this.stateStore.set('hdriStrength', actual);
      this.eventBus.emit('studio:hdri-strength', actual);
    });
    this.inputs.hdriBackground.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('hdriBackground', enabled);
      this.eventBus.emit('studio:hdri-background', enabled);
      this.inputs.backgroundColor.disabled = enabled;
    });
    this.inputs.groundSolid.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('groundSolid', enabled);
      this.eventBus.emit('studio:ground-solid', enabled);
    });
    this.inputs.groundWire.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('groundWire', enabled);
      this.eventBus.emit('studio:ground-wire', enabled);
    });
    this.inputs.groundSolidColor.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('groundSolidColor', value);
      this.eventBus.emit('studio:ground-solid-color', value);
    });
    this.inputs.groundWireColor.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set('groundWireColor', value);
      this.eventBus.emit('studio:ground-wire-color', value);
    });
    this.inputs.groundWireOpacity.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('groundWireOpacity', value.toFixed(2));
      this.stateStore.set('groundWireOpacity', value);
      this.eventBus.emit('studio:ground-wire-opacity', value);
    });
    this.inputs.groundY.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('groundY', `${value.toFixed(2)}m`);
      this.stateStore.set('groundY', value);
      this.eventBus.emit('studio:ground-y', value);
    });
    this.inputs.groundHeight.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('groundHeight', `${value.toFixed(2)}m`);
      this.stateStore.set('groundHeight', value);
      this.eventBus.emit('studio:ground-height', value);
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
    this.inputs.lightsMaster?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.updateValueLabel('lightsMaster', value.toFixed(2));
      this.stateStore.set('lightsMaster', value);
      this.eventBus.emit('lights:master', value);
    });
    this.inputs.lightsEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('lightsEnabled', enabled);
      this.eventBus.emit('lights:enabled', enabled);
      this.setLightColorControlsDisabled(!enabled);
    });
    this.inputs.lightsRotation?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) || 0;
      this.updateValueLabel('lightsRotation', `${value.toFixed(0)}°`);
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
        ['dofFocus', 'dofAperture', 'dofStrength'],
        !enabled,
      );
      emitDof();
    });
    this.inputs.dofFocus.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('dofFocus', `${value.toFixed(1)}m`);
      this.stateStore.set('dof.focus', value);
      emitDof();
    });
    this.inputs.dofAperture.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('dofAperture', value.toFixed(3));
      this.stateStore.set('dof.aperture', value);
      emitDof();
    });
    this.inputs.dofStrength.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('dofStrength', value.toFixed(2));
      this.stateStore.set('dof.strength', value);
      emitDof();
    });

    const emitBloom = () =>
      this.eventBus.emit('render:bloom', this.stateStore.getState().bloom);
    this.inputs.toggleBloom.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('bloom.enabled', enabled);
      this.setEffectControlsDisabled(
        ['bloomThreshold', 'bloomStrength', 'bloomRadius'],
        !enabled,
      );
      emitBloom();
    });
    [
      ['bloomThreshold', 'threshold'],
      ['bloomStrength', 'strength'],
      ['bloomRadius', 'radius'],
    ].forEach(([inputKey, property]) => {
      this.inputs[inputKey].addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        this.updateValueLabel(inputKey, value.toFixed(2));
        this.stateStore.set(`bloom.${property}`, value);
        emitBloom();
      });
    });

    const emitGrain = () =>
      this.eventBus.emit('render:grain', this.stateStore.getState().grain);
    this.inputs.toggleGrain.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('grain.enabled', enabled);
      this.setEffectControlsDisabled(['grainIntensity'], !enabled);
      emitGrain();
    });
    this.inputs.grainIntensity.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value) * 0.15;
      this.updateValueLabel('grainIntensity', (value / 0.15).toFixed(2));
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
      emitAberration();
    });
    this.inputs.aberrationOffset.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('aberrationOffset', value.toFixed(3));
      this.stateStore.set('aberration.offset', value);
      emitAberration();
    });
    this.inputs.aberrationStrength.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('aberrationStrength', value.toFixed(2));
      this.stateStore.set('aberration.strength', value);
      emitAberration();
    });

    const emitFresnel = () =>
      this.eventBus.emit('render:fresnel', this.stateStore.getState().fresnel);
    this.inputs.toggleFresnel.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('fresnel.enabled', enabled);
      this.setEffectControlsDisabled(
        ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
        !enabled,
      );
      emitFresnel();
    });
    this.inputs.fresnelColor.addEventListener('input', (event) => {
      this.stateStore.set('fresnel.color', event.target.value);
      emitFresnel();
    });
    this.inputs.fresnelRadius.addEventListener('input', (event) => {
      const sliderValue = parseFloat(event.target.value);
      const mapped = parseFloat((6 - sliderValue).toFixed(2));
      this.updateValueLabel('fresnelRadius', mapped.toFixed(2));
      this.stateStore.set('fresnel.radius', mapped);
      emitFresnel();
    });
    this.inputs.fresnelStrength.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('fresnelStrength', value.toFixed(2));
      this.stateStore.set('fresnel.strength', value);
      emitFresnel();
    });

    const emitFog = () =>
      this.eventBus.emit('scene:fog', this.stateStore.getState().fog);
    this.inputs.fogType.addEventListener('change', (event) => {
      this.stateStore.set('fog.type', event.target.value);
      emitFog();
    });
    this.inputs.fogColor.addEventListener('input', (event) => {
      this.stateStore.set('fog.color', event.target.value);
      emitFog();
    });
    this.inputs.fogNear.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('fogNear', `${value.toFixed(1)}m`);
      this.stateStore.set('fog.near', value);
      emitFog();
    });
    this.inputs.fogDensity.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('fogDensity', value.toFixed(3));
      this.stateStore.set('fog.density', value);
      emitFog();
    });

    this.inputs.backgroundColor.addEventListener('input', (event) => {
      this.stateStore.set('background', event.target.value);
      this.eventBus.emit('scene:background', event.target.value);
    });
    this.inputs.cameraFov.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('cameraFov', `${value.toFixed(0)}°`);
      this.stateStore.set('camera.fov', value);
      this.eventBus.emit('camera:fov', value);
    });
    this.inputs.exposure.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.updateValueLabel('exposure', value.toFixed(2));
      this.stateStore.set('exposure', value);
      this.eventBus.emit('scene:exposure', value);
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
    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'v') {
        event.preventDefault();
        this.toggleUi();
      }
      if (
        key === 'escape' &&
        hasHelpOverlay &&
        hideHelp &&
        this.dom.helpOverlay &&
        !this.dom.helpOverlay.hidden
      ) {
        hideHelp();
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
        groundSolid: state.groundSolid,
        groundWire: state.groundWire,
        groundSolidColor: state.groundSolidColor,
        groundWireColor: state.groundWireColor,
        groundWireOpacity: state.groundWireOpacity,
        groundY: state.groundY,
        groundHeight: state.groundHeight,
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
        fog: state.fog,
        exposure: state.exposure,
        background: state.background,
      };
      this.copySettingsToClipboard('Render settings copied', payload);
    };
    this.buttons.copyMesh?.addEventListener('click', copyMesh);
    this.buttons.copyStudio?.addEventListener('click', copyStudio);
    this.buttons.copyRender?.addEventListener('click', copyRender);
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

  updateValueLabel(key, text) {
    const label = document.querySelector(`[data-output="${key}"]`);
    if (label) label.textContent = text;
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
    this.inputs.hdriBackground.disabled = !enabled;
    this.inputs.hdriStrength.disabled = !enabled;
    if (!enabled) {
      this.inputs.backgroundColor.disabled = false;
    }
  }

  setDropzoneVisible(visible) {
    if (!this.dom.dropzone) return;
    this.dropzoneVisible = visible;
    const shouldShow = visible && !this.uiHidden;
    this.dom.dropzone.style.pointerEvents = shouldShow ? 'auto' : 'none';
    this.dom.dropzone.style.opacity = shouldShow ? '1' : '0';
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
      triangles: stats.triangles?.toLocaleString() ?? '—',
      vertices: stats.vertices?.toLocaleString() ?? '—',
      materials: stats.materials?.toString() ?? '—',
      textures: stats.textures?.toString() ?? '—',
      fileSize: stats.fileSize ?? '—',
      bounds: stats.bounds ?? '—',
    };
    Array.from(this.dom.stats.querySelectorAll('div')).forEach((row) => {
      const label = row.querySelector('dt')?.textContent?.toLowerCase();
      const key = label?.replace(/\s/g, '');
      const targetKey =
        {
          triangles: 'triangles',
          vertices: 'vertices',
          materials: 'materials',
          textures: 'textures',
          filesize: 'fileSize',
          bounds: 'bounds',
        }[key] ?? key;
      const dd = row.querySelector('dd');
      if (dd && mapping[targetKey] !== undefined) {
        dd.textContent = mapping[targetKey];
      }
    });
  }

  updateTitle(filename) {
    document.title = `MeshGL — ${filename}`;
    if (this.dom.topBarTitle) {
      this.dom.topBarTitle.textContent = filename;
    }
  }

  updateTopBarDetail(detail) {
    if (this.dom.topBarAnimation) {
      this.dom.topBarAnimation.textContent = detail;
    }
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
      option.textContent = `${clip.name} (${clip.duration})`;
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

  syncControls(state) {
    this.setHdriActive(state.hdri);
    this.inputs.scale.value = state.scale;
    this.updateValueLabel('scale', `${state.scale.toFixed(2)}×`);
    this.inputs.yOffset.value = state.yOffset;
    this.updateValueLabel('yOffset', `${state.yOffset.toFixed(2)}m`);
    if (this.inputs.showNormals) {
    this.inputs.showNormals.checked = state.showNormals;
    }
    this.inputs.hdriEnabled.checked = !!state.hdriEnabled;
    this.toggleHdriControls(state.hdriEnabled);
    const normalizedStrength = Math.min(
      10,
      Math.max(0, state.hdriStrength / HDRI_STRENGTH_UNIT),
    );
    this.inputs.hdriStrength.value = normalizedStrength;
    this.updateValueLabel('hdriStrength', normalizedStrength.toFixed(2));
    this.inputs.hdriBackground.checked = state.hdriBackground;
    this.inputs.backgroundColor.disabled =
      state.hdriBackground && state.hdriEnabled;
    this.inputs.backgroundColor.value = state.background;
    this.inputs.clayColor.value = state.clay.color;
    this.inputs.clayRoughness.value = state.clay.roughness;
    this.updateValueLabel('clayRoughness', state.clay.roughness.toFixed(2));
    this.inputs.claySpecular.value = state.clay.specular;
    this.updateValueLabel('claySpecular', state.clay.specular.toFixed(2));
    this.inputs.groundSolid.checked = state.groundSolid;
    this.inputs.groundWire.checked = state.groundWire;
    this.inputs.groundSolidColor.value = state.groundSolidColor;
    this.inputs.groundWireColor.value = state.groundWireColor;
    this.inputs.groundWireOpacity.value = state.groundWireOpacity;
    this.updateValueLabel(
      'groundWireOpacity',
      state.groundWireOpacity.toFixed(2),
    );
    this.inputs.groundY.value = state.groundY;
    this.updateValueLabel('groundY', `${state.groundY.toFixed(2)}m`);
    this.inputs.groundHeight.value = state.groundHeight;
    this.updateValueLabel('groundHeight', `${state.groundHeight.toFixed(2)}m`);
    if (this.inputs.lightsRotation) {
      this.inputs.lightsRotation.value = state.lightsRotation ?? 0;
      this.updateValueLabel(
        'lightsRotation',
        `${(state.lightsRotation ?? 0).toFixed(0)}°`,
      );
    }
    if (this.inputs.lightsMaster) {
      const masterValue = state.lightsMaster ?? 1;
      this.inputs.lightsMaster.value = masterValue;
      this.updateValueLabel('lightsMaster', masterValue.toFixed(2));
    }
    if (this.inputs.lightsAutoRotate) {
      this.inputs.lightsAutoRotate.checked = !!state.lightsAutoRotate;
      this.setLightsRotationDisabled(!!state.lightsAutoRotate);
    }
    if (this.inputs.lightsEnabled) {
      this.inputs.lightsEnabled.checked = !!state.lightsEnabled;
      this.setLightColorControlsDisabled(!state.lightsEnabled);
    }
    this.inputs.dofFocus.value = state.dof.focus;
    this.updateValueLabel('dofFocus', `${state.dof.focus.toFixed(1)}m`);
    this.inputs.dofAperture.value = state.dof.aperture;
    this.updateValueLabel('dofAperture', state.dof.aperture.toFixed(3));
    this.inputs.dofStrength.value = state.dof.strength;
    this.updateValueLabel('dofStrength', state.dof.strength.toFixed(2));
    this.inputs.bloomThreshold.value = state.bloom.threshold;
    this.updateValueLabel('bloomThreshold', state.bloom.threshold.toFixed(2));
    this.inputs.bloomStrength.value = state.bloom.strength;
    this.updateValueLabel('bloomStrength', state.bloom.strength.toFixed(2));
    this.inputs.bloomRadius.value = state.bloom.radius;
    this.updateValueLabel('bloomRadius', state.bloom.radius.toFixed(2));
    this.inputs.grainIntensity.value = (state.grain.intensity / 0.15).toFixed(2);
    this.updateValueLabel(
      'grainIntensity',
      (state.grain.intensity / 0.15).toFixed(2),
    );
    this.inputs.aberrationOffset.value = state.aberration.offset;
    this.updateValueLabel(
      'aberrationOffset',
      state.aberration.offset.toFixed(3),
    );
    this.inputs.aberrationStrength.value = state.aberration.strength;
    this.updateValueLabel(
      'aberrationStrength',
      state.aberration.strength.toFixed(2),
    );
    this.inputs.toggleFresnel.checked = !!state.fresnel.enabled;
    this.inputs.fresnelColor.value = state.fresnel.color;
    const sliderRadius = 6 - state.fresnel.radius;
    this.inputs.fresnelRadius.value = sliderRadius;
    this.updateValueLabel('fresnelRadius', state.fresnel.radius.toFixed(2));
    this.inputs.fresnelStrength.value = state.fresnel.strength;
    this.updateValueLabel(
      'fresnelStrength',
      state.fresnel.strength.toFixed(2),
    );
    this.inputs.fogType.value = state.fog.type;
    this.inputs.fogColor.value = state.fog.color;
    this.inputs.fogNear.value = state.fog.near;
    this.updateValueLabel('fogNear', `${state.fog.near.toFixed(1)}m`);
    this.inputs.fogDensity.value = state.fog.density;
    this.updateValueLabel('fogDensity', state.fog.density.toFixed(3));
    this.inputs.cameraFov.value = state.camera.fov;
    this.updateValueLabel('cameraFov', `${state.camera.fov.toFixed(0)}°`);
    this.inputs.exposure.value = state.exposure;
    this.updateValueLabel('exposure', state.exposure.toFixed(2));

    this.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === state.hdri);
    });
    this.inputs.autoRotate.forEach((input) => {
      input.checked = parseFloat(input.value) === state.autoRotate;
    });
    this.inputs.shading.forEach((input) => {
      input.checked = input.value === state.shading;
    });
    this.inputs.lightControls.forEach((control) => {
      const lightId = control.dataset.light;
      const colorInput = control.querySelector('input[type="color"]');
      if (colorInput) {
        colorInput.value = state.lights[lightId].color;
      }
    });
    this.inputs.toggleDof.checked = !!state.dof.enabled;
    this.setEffectControlsDisabled(
      ['dofFocus', 'dofAperture', 'dofStrength'],
      !state.dof.enabled,
    );
    this.inputs.toggleBloom.checked = !!state.bloom.enabled;
    this.setEffectControlsDisabled(
      ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
      !state.bloom.enabled,
    );
    this.inputs.toggleGrain.checked = !!state.grain.enabled;
    this.setEffectControlsDisabled(['grainIntensity'], !state.grain.enabled);
    this.inputs.toggleAberration.checked = !!state.aberration.enabled;
    this.setEffectControlsDisabled(
      ['aberrationOffset', 'aberrationStrength'],
      !state.aberration.enabled,
    );
    this.setEffectControlsDisabled(
      ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
      !state.fresnel.enabled,
    );
  }

  setEffectControlsDisabled(ids, disabled) {
    ids.forEach((id) => {
      const input = this.inputs[id];
      if (!input) return;
      input.disabled = disabled;
      input.classList.toggle('is-disabled-handle', disabled);
    });
  }

  setLightsRotationDisabled(disabled) {
    if (!this.inputs.lightsRotation) return;
    this.inputs.lightsRotation.disabled = disabled;
    this.inputs.lightsRotation.classList.toggle('is-disabled-handle', disabled);
  }

  setLightsRotation(value) {
    if (!this.inputs.lightsRotation) return;
    const normalized = ((value % 360) + 360) % 360;
    this.inputs.lightsRotation.value = normalized;
    this.updateValueLabel('lightsRotation', `${normalized.toFixed(0)}°`);
  }

  setLightColorControlsDisabled(disabled) {
    this.inputs.lightControls.forEach((control) => {
      const input = control.querySelector('input[type="color"]');
      if (!input) return;
      input.disabled = disabled;
      input.classList.toggle('is-disabled-handle', disabled);
    });
    if (this.inputs.lightsMaster) {
      this.inputs.lightsMaster.disabled = disabled;
      this.inputs.lightsMaster.classList.toggle('is-disabled-handle', disabled);
    }
  }
}

