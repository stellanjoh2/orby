import { sanitizeDof } from '../constants.js';

/**
 * SceneSettingsManager
 * Handles copying and loading all scene settings (including object transforms)
 */
export class SceneSettingsManager {
  constructor(eventBus, stateStore, uiHelper) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.uiHelper = uiHelper; // UIManager methods: setHdriActive, toggleHdriControls, etc.
  }

  /**
   * Gets current camera state (position and target)
   */
  getCameraState() {
    return new Promise((resolve) => {
      const handler = (cameraState) => {
        this.eventBus.off('camera:state', handler);
        resolve(cameraState);
      };
      this.eventBus.on('camera:state', handler);
      this.eventBus.emit('camera:get-state');
    });
  }

  /**
   * Builds and returns the scene settings payload (excluding object transforms)
   */
  async buildSceneSettingsPayload() {
    const state = this.stateStore.getState();
    
    // Get camera position and target
    const cameraState = await this.getCameraState();
    
    return {
      // Mesh settings (including transforms)
      shading: state.shading,
      material: state.material ?? {
        brightness: 1.0,
        metalness: 0.0,
        roughness: 0.8,
        emissive: 0.0,
      },
      scale: state.scale,
      xOffset: state.xOffset,
      yOffset: state.yOffset,
      zOffset: state.zOffset,
      rotationX: state.rotationX,
      rotationY: state.rotationY,
      rotationZ: state.rotationZ,
      autoRotate: state.autoRotate,
      clay: state.clay,
      wireframe: state.wireframe,
      fresnel: state.fresnel,
      svgExtrude: {
        enabled: !!state.svgExtrude?.enabled,
        availableColors: Array.isArray(state.svgExtrude?.availableColors)
          ? [...state.svgExtrude.availableColors]
          : [],
        depth: state.svgExtrude?.depth ?? 0.2,
        normalAngle: state.svgExtrude?.normalAngle ?? 45,
        colorDepths: state.svgExtrude?.colorDepths ?? {},
        colorOffsets: state.svgExtrude?.colorOffsets ?? {},
        flipDirection: !!state.svgExtrude?.flipDirection,
        colorOverride: !!state.svgExtrude?.colorOverride,
        overrideColor: state.svgExtrude?.overrideColor ?? '#7ed321',
        surfacePreset: state.svgExtrude?.surfacePreset ?? 'none',
        surfaceScale: state.svgExtrude?.surfaceScale ?? 1.0,
      },
      advanced: {
        reverseNormals: !!state.advanced?.reverseNormals,
      },
      // Studio settings
      hdri: state.hdri,
      hdriEnabled: state.hdriEnabled,
      hdriStrength: state.hdriStrength,
      hdriBlurriness: state.hdriBlurriness,
      hdriRotation: state.hdriRotation,
      hdriBackground: state.hdriBackground,
      lensFlare: state.lensFlare,
      groundSolid: state.groundSolid,
      groundWire: state.groundWire,
      groundSolidColor: state.groundSolidColor,
      groundWireColor: state.groundWireColor,
      groundWireOpacity: state.groundWireOpacity,
      groundY: state.groundY,
      gridY: state.gridY,
      podiumScale: state.podiumScale,
      gridScale: state.gridScale,
      lights: state.lights,
      lightsEnabled: state.lightsEnabled,
      lightsMaster: state.lightsMaster,
      lightsRotation: state.lightsRotation,
      lightsHeight: state.lightsHeight,
      lightsAutoRotate: state.lightsAutoRotate,
      showLightIndicators: state.showLightIndicators,
      lightsCastShadows: state.lightsCastShadows,
      background: state.background,
      // Camera/Render settings
      camera: {
        fov: state.camera?.fov,
        tilt: state.camera?.tilt,
        position: cameraState?.position,
        target: cameraState?.target,
        contrast: state.camera?.contrast,
        temperature: state.camera?.temperature,
        tint: state.camera?.tint,
        highlights: state.camera?.highlights,
        shadows: state.camera?.shadows,
        saturation: state.camera?.saturation,
        clarity: state.camera?.clarity,
        fade: state.camera?.fade,
        sharpness: state.camera?.sharpness,
        vignette: state.camera?.vignette,
        vignetteColor: state.camera?.vignetteColor,
        autoOrbit: state.camera?.autoOrbit,
      },
      exposure: state.exposure,
      autoExposure: state.autoExposure,
      histogramEnabled: state.histogramEnabled,
      toneCurveOpen: state.toneCurveOpen,
      toneCurve: state.toneCurve,
      dof: state.dof,
      bloom: state.bloom,
      grain: state.grain,
      aberration: state.aberration,
      lensDirt: state.lensDirt,
      antiAliasing: state.antiAliasing,
      renderQuality: state.renderQuality,
      toneMapping: state.toneMapping,
      lookFilterPreset: state.lookFilterPreset,
      lookFilterPresetsOpen: state.lookFilterPresetsOpen,
      moveWidgetEnabled: !!state.moveWidgetEnabled,
      rotateWidgetEnabled: !!state.rotateWidgetEnabled,
      scaleWidgetEnabled: !!state.scaleWidgetEnabled,
    };
  }

  /**
   * Copies scene settings to clipboard
   */
  async copyToClipboard() {
    const payload = await this.buildSceneSettingsPayload();
    const text = JSON.stringify(payload, null, 2);
    
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
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
      return { success: true, message: 'Scene settings copied' };
    } catch (error) {
      return { success: false, message: 'Copy failed' };
    }
  }

  async getCurrentFile() {
    return new Promise((resolve) => {
      let resolved = false;
      const handler = (payload) => {
        if (resolved) return;
        resolved = true;
        this.eventBus.off('scene:current-file', handler);
        resolve(payload?.file || null);
      };
      this.eventBus.on('scene:current-file', handler);
      this.eventBus.emit('scene:get-current-file');
      // Defensive timeout to avoid hanging forever if listener is missing.
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.eventBus.off('scene:current-file', handler);
        resolve(null);
      }, 1500);
    });
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async saveOrbyToFile() {
    try {
      const sceneSettings = await this.buildSceneSettingsPayload();
      const sourceFile = await this.getCurrentFile();
      if (!sourceFile) {
        return { success: false, message: 'Load a mesh before saving .orby' };
      }

      const fileBuffer = await sourceFile.arrayBuffer();
      const orbyPayload = {
        type: 'orby-scene',
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        sceneSettings,
        asset: {
          name: sourceFile.name || 'model',
          type: sourceFile.type || '',
          lastModified: sourceFile.lastModified || Date.now(),
          dataBase64: this.arrayBufferToBase64(fileBuffer),
        },
      };

      const text = JSON.stringify(orbyPayload);
      const blob = new Blob([text], { type: 'application/json' });
      const baseName = (sourceFile.name || 'scene').replace(/\.[^/.]+$/, '');
      const fileName = `${baseName}.orby`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      return { success: true, message: '.orby scene saved' };
    } catch (error) {
      console.error('Failed to save .orby scene', error);
      return { success: false, message: 'Failed to save .orby scene' };
    }
  }

  async loadOrbyFromFile(file) {
    try {
      if (!file) {
        return { success: false, message: 'No .orby file selected' };
      }
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload?.type !== 'orby-scene' || !payload?.asset?.dataBase64 || !payload?.sceneSettings) {
        return { success: false, message: 'Invalid .orby file' };
      }
      const bytes = this.base64ToUint8Array(payload.asset.dataBase64);
      const embeddedFile = new File(
        [bytes],
        payload.asset.name || 'model.glb',
        {
          type: payload.asset.type || 'application/octet-stream',
          lastModified: payload.asset.lastModified || Date.now(),
        },
      );

      // Always start from a clean baseline so no stale settings leak from current scene.
      this.stateStore.reset();
      this.eventBus.emit('app:reset');

      const loadComplete = new Promise((resolve) => {
        let done = false;
        const handler = (result) => {
          if (done) return;
          done = true;
          this.eventBus.off('scene:model-load-complete', handler);
          resolve(result || { success: false });
        };
        this.eventBus.on('scene:model-load-complete', handler);
        setTimeout(() => {
          if (done) return;
          done = true;
          this.eventBus.off('scene:model-load-complete', handler);
          resolve({ success: false, timeout: true });
        }, 12000);
      });
      this.eventBus.emit('file:selected', embeddedFile);
      const modelLoadResult = await loadComplete;
      if (!modelLoadResult?.success) {
        return { success: false, message: 'Failed to load mesh from .orby file' };
      }

      // Apply saved scene settings after mesh load to ensure all controls (including
      // podium/ground colors and model-dependent settings) overwrite defaults cleanly.
      const sceneLoadResult = this.loadFromText(JSON.stringify(payload.sceneSettings));
      if (!sceneLoadResult.success) {
        return sceneLoadResult;
      }
      return { success: true, message: '.orby scene loaded' };
    } catch (error) {
      console.error('Error loading .orby scene:', error);
      return { success: false, message: 'Failed to load .orby file' };
    }
  }

  /**
   * Loads scene settings from JSON text
   */
  loadFromText(text) {
    try {
      const payload = JSON.parse(text);
      
      // Validate that it looks like scene settings
      const expectedKeys = ['shading', 'hdri', 'camera', 'dof', 'bloom', 'lights'];
      const hasExpectedKeys = expectedKeys.some(key => key in payload);
      
      if (!hasExpectedKeys) {
        return { success: false, message: 'Invalid scene settings - missing required fields' };
      }

      // Apply Mesh settings (including transforms)
      if (payload.shading !== undefined) {
        this.stateStore.set('shading', payload.shading);
        this.eventBus.emit('mesh:shading', payload.shading);
      }
      if (payload.material !== undefined) {
        this.stateStore.set('material', payload.material);
        if (payload.material.brightness !== undefined) {
          this.eventBus.emit('mesh:material-brightness', payload.material.brightness);
        }
        if (payload.material.metalness !== undefined) {
          this.eventBus.emit('mesh:material-metalness', payload.material.metalness);
        }
        if (payload.material.roughness !== undefined) {
          this.eventBus.emit('mesh:material-roughness', payload.material.roughness);
        }
        if (payload.material.emissive !== undefined) {
          this.eventBus.emit('mesh:material-emissive', payload.material.emissive);
        }
      }
      // Legacy support
      if (payload.diffuseBrightness !== undefined && payload.material === undefined) {
        this.stateStore.set('material.brightness', payload.diffuseBrightness);
        this.eventBus.emit('mesh:material-brightness', payload.diffuseBrightness);
      }
      // Apply transform settings
      if (payload.scale !== undefined) {
        this.stateStore.set('scale', payload.scale);
        this.eventBus.emit('mesh:scale', payload.scale);
      }
      if (payload.yOffset !== undefined) {
        this.stateStore.set('yOffset', payload.yOffset);
        this.eventBus.emit('mesh:yOffset', payload.yOffset);
      }
      if (payload.xOffset !== undefined) {
        this.stateStore.set('xOffset', payload.xOffset);
        this.eventBus.emit('mesh:xOffset', payload.xOffset);
      }
      if (payload.zOffset !== undefined) {
        this.stateStore.set('zOffset', payload.zOffset);
        this.eventBus.emit('mesh:zOffset', payload.zOffset);
      }
      if (payload.rotationX !== undefined) {
        this.stateStore.set('rotationX', payload.rotationX);
        this.eventBus.emit('mesh:rotationX', payload.rotationX);
      }
      if (payload.rotationY !== undefined) {
        this.stateStore.set('rotationY', payload.rotationY);
        this.eventBus.emit('mesh:rotationY', payload.rotationY);
      }
      if (payload.rotationZ !== undefined) {
        this.stateStore.set('rotationZ', payload.rotationZ);
        this.eventBus.emit('mesh:rotationZ', payload.rotationZ);
      }
      if (payload.autoRotate !== undefined) {
        this.stateStore.set('autoRotate', payload.autoRotate);
        this.eventBus.emit('mesh:auto-rotate', payload.autoRotate);
      }
      if (payload.clay) {
        this.stateStore.set('clay', payload.clay);
        this.eventBus.emit('mesh:clay-color', payload.clay.color);
        if (payload.clay.normalMap !== undefined) {
          this.eventBus.emit(
            'mesh:clay-normal-map',
            payload.clay.normalMap !== false,
          );
        }
        // Roughness and metalness are now controlled by Material settings, not clay settings
      }
      if (payload.wireframe) {
        this.stateStore.set('wireframe', payload.wireframe);
        this.eventBus.emit('mesh:wireframe-always-on', payload.wireframe.alwaysOn);
        this.eventBus.emit('mesh:wireframe-color', payload.wireframe.color);
        this.eventBus.emit('mesh:wireframe-only-visible-faces', payload.wireframe.onlyVisibleFaces);
        if (payload.wireframe.hideMesh !== undefined) {
          this.eventBus.emit('mesh:wireframe-hide-mesh', payload.wireframe.hideMesh);
        }
      }
      if (payload.fresnel) {
        this.stateStore.set('fresnel', payload.fresnel);
        this.eventBus.emit('render:fresnel', payload.fresnel);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
            !payload.fresnel.enabled,
          );
        }
      }
      if (payload.svgExtrude?.enabled !== undefined) {
        this.stateStore.set('svgExtrude.enabled', !!payload.svgExtrude.enabled);
      }
      if (payload.svgExtrude?.availableColors !== undefined) {
        const colors = Array.isArray(payload.svgExtrude.availableColors)
          ? payload.svgExtrude.availableColors.map((c) => String(c))
          : [];
        this.stateStore.set('svgExtrude.availableColors', colors);
      }
      if (payload.svgExtrude?.depth !== undefined) {
        this.stateStore.set('svgExtrude.depth', payload.svgExtrude.depth);
        this.eventBus.emit('mesh:svg-extrude-depth', payload.svgExtrude.depth);
      }
      if (payload.svgExtrude?.normalAngle !== undefined) {
        this.stateStore.set('svgExtrude.normalAngle', payload.svgExtrude.normalAngle);
        this.eventBus.emit('mesh:svg-extrude-normal-angle', payload.svgExtrude.normalAngle);
      }
      if (payload.svgExtrude?.colorDepths !== undefined) {
        this.stateStore.set('svgExtrude.colorDepths', payload.svgExtrude.colorDepths || {});
        this.eventBus.emit('mesh:svg-extrude-color-depths', payload.svgExtrude.colorDepths || {});
      }
      if (payload.svgExtrude?.colorOffsets !== undefined) {
        this.stateStore.set('svgExtrude.colorOffsets', payload.svgExtrude.colorOffsets || {});
        this.eventBus.emit('mesh:svg-extrude-color-offsets', payload.svgExtrude.colorOffsets || {});
      }
      if (payload.svgExtrude?.flipDirection !== undefined) {
        const enabled = !!payload.svgExtrude.flipDirection;
        this.stateStore.set('svgExtrude.flipDirection', enabled);
        this.eventBus.emit('mesh:svg-extrude-flip-direction', enabled);
      }
      if (payload.svgExtrude?.colorOverride !== undefined || payload.svgExtrude?.overrideColor !== undefined) {
        const enabled = !!payload.svgExtrude?.colorOverride;
        const color = payload.svgExtrude?.overrideColor ?? '#7ed321';
        this.stateStore.set('svgExtrude.colorOverride', enabled);
        this.stateStore.set('svgExtrude.overrideColor', color);
        this.eventBus.emit('mesh:svg-extrude-color-override', { enabled, color });
      }
      if (payload.svgExtrude?.surfacePreset !== undefined || payload.svgExtrude?.surfaceScale !== undefined) {
        if (payload.svgExtrude?.surfacePreset !== undefined) {
          this.stateStore.set('svgExtrude.surfacePreset', payload.svgExtrude.surfacePreset);
        }
        if (payload.svgExtrude?.surfaceScale !== undefined) {
          this.stateStore.set('svgExtrude.surfaceScale', payload.svgExtrude.surfaceScale);
        }
        const st = this.stateStore.getState().svgExtrude;
        this.eventBus.emit('mesh:svg-extrude-surface', {
          preset: st?.surfacePreset ?? 'none',
          scale: st?.surfaceScale ?? 1.0,
        });
      }
      if (payload.advanced?.reverseNormals !== undefined) {
        const enabled = !!payload.advanced.reverseNormals;
        this.stateStore.set('advanced.reverseNormals', enabled);
        this.eventBus.emit('mesh:reverse-normals', enabled);
      }

      // Apply Studio settings
      if (payload.hdri !== undefined) {
        this.stateStore.set('hdri', payload.hdri);
        if (this.uiHelper?.setHdriActive) {
          this.uiHelper.setHdriActive(payload.hdri);
        }
        this.eventBus.emit('studio:hdri', payload.hdri);
      }
      if (payload.hdriEnabled !== undefined) {
        this.stateStore.set('hdriEnabled', payload.hdriEnabled);
        this.eventBus.emit('studio:hdri-enabled', payload.hdriEnabled);
        if (this.uiHelper?.toggleHdriControls) {
          this.uiHelper.toggleHdriControls(payload.hdriEnabled);
        }
      }
      if (payload.hdriStrength !== undefined) {
        this.stateStore.set('hdriStrength', payload.hdriStrength);
        this.eventBus.emit('studio:hdri-strength', payload.hdriStrength);
      }
      if (payload.hdriBlurriness !== undefined) {
        this.stateStore.set('hdriBlurriness', payload.hdriBlurriness);
        this.eventBus.emit('studio:hdri-blurriness', payload.hdriBlurriness);
      }
      if (payload.hdriRotation !== undefined) {
        this.stateStore.set('hdriRotation', payload.hdriRotation);
        this.eventBus.emit('studio:hdri-rotation', payload.hdriRotation);
      }
      if (payload.hdriBackground !== undefined) {
        this.stateStore.set('hdriBackground', payload.hdriBackground);
        this.eventBus.emit('studio:hdri-background', payload.hdriBackground);
      }
      if (payload.lensFlare) {
        this.stateStore.set('lensFlare', payload.lensFlare);
        this.eventBus.emit('studio:lens-flare-enabled', payload.lensFlare.enabled);
        this.eventBus.emit('studio:lens-flare-rotation', payload.lensFlare.rotation);
        this.eventBus.emit('studio:lens-flare-height', payload.lensFlare.height);
        this.eventBus.emit('studio:lens-flare-color', payload.lensFlare.color);
        this.eventBus.emit('studio:lens-flare-quality', payload.lensFlare.quality);
      }
      if (payload.groundSolid !== undefined) {
        this.stateStore.set('groundSolid', payload.groundSolid);
        this.eventBus.emit('studio:ground-solid', payload.groundSolid);
      }
      if (payload.groundWire !== undefined) {
        this.stateStore.set('groundWire', payload.groundWire);
        this.eventBus.emit('studio:ground-wire', payload.groundWire);
      }
      if (payload.groundSolidColor !== undefined) {
        this.stateStore.set('groundSolidColor', payload.groundSolidColor);
        this.eventBus.emit('studio:ground-solid-color', payload.groundSolidColor);
      }
      if (payload.groundWireColor !== undefined) {
        this.stateStore.set('groundWireColor', payload.groundWireColor);
        this.eventBus.emit('studio:ground-wire-color', payload.groundWireColor);
      }
      if (payload.groundWireOpacity !== undefined) {
        this.stateStore.set('groundWireOpacity', payload.groundWireOpacity);
        this.eventBus.emit('studio:ground-wire-opacity', payload.groundWireOpacity);
      }
      if (payload.groundY !== undefined) {
        this.stateStore.set('groundY', payload.groundY);
        this.eventBus.emit('studio:ground-y', payload.groundY);
      }
      if (payload.gridY !== undefined) {
        this.stateStore.set('gridY', payload.gridY);
        this.eventBus.emit('studio:grid-y', payload.gridY);
      }
      if (payload.podiumScale !== undefined) {
        this.stateStore.set('podiumScale', payload.podiumScale);
        this.eventBus.emit('studio:podium-scale', payload.podiumScale);
      }
      if (payload.gridScale !== undefined) {
        this.stateStore.set('gridScale', payload.gridScale);
        this.eventBus.emit('studio:grid-scale', payload.gridScale);
      }
      if (payload.lights) {
        this.stateStore.set('lights', payload.lights);
        Object.keys(payload.lights).forEach((lightId) => {
          const light = payload.lights[lightId];
          // Apply all light properties (color, intensity, enabled, castShadows, height, rotate)
          if (light.color !== undefined) {
            this.eventBus.emit('lights:update', {
              lightId,
              property: 'color',
              value: light.color,
            });
          }
          if (light.intensity !== undefined) {
            this.eventBus.emit('lights:update', {
              lightId,
              property: 'intensity',
              value: light.intensity,
            });
          }
          if (light.enabled !== undefined) {
            this.eventBus.emit('lights:update', {
              lightId,
              property: 'enabled',
              value: light.enabled,
            });
          }
          if (light.castShadows !== undefined) {
            this.eventBus.emit('lights:update', {
              lightId,
              property: 'castShadows',
              value: light.castShadows,
            });
          }
          if (light.height !== undefined) {
            this.eventBus.emit('lights:update', {
              lightId,
              property: 'height',
              value: light.height,
            });
          }
          if (light.rotate !== undefined) {
            this.eventBus.emit('lights:update', {
              lightId,
              property: 'rotate',
              value: light.rotate,
            });
          }
        });
      }
      if (payload.lightsEnabled !== undefined) {
        this.stateStore.set('lightsEnabled', payload.lightsEnabled);
        this.eventBus.emit('lights:enabled', payload.lightsEnabled);
        if (this.uiHelper?.setLightColorControlsDisabled) {
          this.uiHelper.setLightColorControlsDisabled(!payload.lightsEnabled);
        }
      }
      if (payload.lightsMaster !== undefined) {
        this.stateStore.set('lightsMaster', payload.lightsMaster);
        this.eventBus.emit('lights:master', payload.lightsMaster);
      }
      if (payload.lightsRotation !== undefined) {
        this.stateStore.set('lightsRotation', payload.lightsRotation);
        this.eventBus.emit('lights:rotate', payload.lightsRotation);
      }
      if (payload.lightsHeight !== undefined) {
        this.stateStore.set('lightsHeight', payload.lightsHeight);
        this.eventBus.emit('lights:height', payload.lightsHeight);
      }
      if (payload.lightsAutoRotate !== undefined) {
        this.stateStore.set('lightsAutoRotate', payload.lightsAutoRotate);
        this.eventBus.emit('lights:auto-rotate', payload.lightsAutoRotate);
        if (this.uiHelper?.setLightsRotationDisabled) {
          this.uiHelper.setLightsRotationDisabled(payload.lightsAutoRotate);
        }
      }
      if (payload.showLightIndicators !== undefined) {
        this.stateStore.set('showLightIndicators', payload.showLightIndicators);
        this.eventBus.emit('lights:show-indicators', payload.showLightIndicators);
      }
      if (payload.lightsCastShadows !== undefined) {
        this.stateStore.set('lightsCastShadows', payload.lightsCastShadows);
        this.eventBus.emit('lights:cast-shadows', payload.lightsCastShadows);
      }

      if (payload.moveWidgetEnabled !== undefined) {
        const on = !!payload.moveWidgetEnabled;
        this.stateStore.set('moveWidgetEnabled', on);
        this.eventBus.emit('mesh:move-widget-enabled', on);
      }
      if (payload.rotateWidgetEnabled !== undefined) {
        const on = !!payload.rotateWidgetEnabled;
        this.stateStore.set('rotateWidgetEnabled', on);
        this.eventBus.emit('mesh:rotate-widget-enabled', on);
      }
      if (payload.scaleWidgetEnabled !== undefined) {
        const on = !!payload.scaleWidgetEnabled;
        this.stateStore.set('scaleWidgetEnabled', on);
        this.eventBus.emit('mesh:scale-widget-enabled', on);
      }

      // Apply Camera settings
      if (payload.camera) {
        if (payload.camera.fov !== undefined) {
          this.stateStore.set('camera.fov', payload.camera.fov);
          this.eventBus.emit('camera:fov', payload.camera.fov);
        }
        if (payload.camera.tilt !== undefined) {
          this.stateStore.set('camera.tilt', payload.camera.tilt);
          this.eventBus.emit('camera:tilt', payload.camera.tilt);
        }
        if (payload.camera.autoOrbit !== undefined) {
          this.stateStore.set('camera.autoOrbit', payload.camera.autoOrbit);
          this.eventBus.emit('camera:auto-orbit', payload.camera.autoOrbit);
        }
        // Restore camera position and target (orbit angle)
        if (payload.camera.position || payload.camera.target) {
          this.eventBus.emit('camera:set-state', {
            position: payload.camera.position,
            target: payload.camera.target,
          });
        }
        if (payload.camera.contrast !== undefined) {
          this.stateStore.set('camera.contrast', payload.camera.contrast);
          this.eventBus.emit('render:contrast', payload.camera.contrast);
        }
        if (payload.camera.temperature !== undefined) {
          this.stateStore.set('camera.temperature', payload.camera.temperature);
          this.eventBus.emit('render:temperature', payload.camera.temperature);
        }
        if (payload.camera.tint !== undefined) {
          this.stateStore.set('camera.tint', payload.camera.tint);
          this.eventBus.emit('render:tint', payload.camera.tint / 100);
        }
        if (payload.camera.highlights !== undefined) {
          this.stateStore.set('camera.highlights', payload.camera.highlights);
          this.eventBus.emit('render:highlights', payload.camera.highlights / 100);
        }
        if (payload.camera.shadows !== undefined) {
          this.stateStore.set('camera.shadows', payload.camera.shadows);
          this.eventBus.emit('render:shadows', payload.camera.shadows / 50);
        }
        if (payload.camera.saturation !== undefined) {
          this.stateStore.set('camera.saturation', payload.camera.saturation);
          this.eventBus.emit('render:saturation', payload.camera.saturation);
        }
        if (payload.camera.clarity !== undefined) {
          this.stateStore.set('camera.clarity', payload.camera.clarity);
          this.eventBus.emit('render:clarity', payload.camera.clarity);
        }
        if (payload.camera.fade !== undefined) {
          this.stateStore.set('camera.fade', payload.camera.fade);
          this.eventBus.emit('render:fade', payload.camera.fade);
        }
        if (payload.camera.sharpness !== undefined) {
          this.stateStore.set('camera.sharpness', payload.camera.sharpness);
          this.eventBus.emit('render:sharpness', payload.camera.sharpness);
        }
        // Store vignette values but don't apply yet - will be applied at the very end
        if (payload.camera.vignette !== undefined) {
          this.stateStore.set('camera.vignette', payload.camera.vignette);
        }
        if (payload.camera.vignetteColor !== undefined) {
          this.stateStore.set('camera.vignetteColor', payload.camera.vignetteColor);
        }
      }

      // Apply Exposure
      if (payload.exposure !== undefined) {
        this.stateStore.set('exposure', payload.exposure);
        this.eventBus.emit('scene:exposure', payload.exposure);
      }
      if (payload.autoExposure !== undefined) {
        this.stateStore.set('autoExposure', payload.autoExposure);
        this.eventBus.emit('camera:auto-exposure', payload.autoExposure);
      }
      if (payload.histogramEnabled !== undefined) {
        this.stateStore.set('histogramEnabled', !!payload.histogramEnabled);
        this.eventBus.emit('render:histogram-enabled', !!payload.histogramEnabled);
      }
      if (payload.toneCurveOpen !== undefined) {
        this.stateStore.set('toneCurveOpen', !!payload.toneCurveOpen);
      }
      if (payload.toneCurve) {
        this.stateStore.set('toneCurve', payload.toneCurve);
        this.eventBus.emit('render:tone-curve', this.stateStore.getState().toneCurve);
      }

      // Apply Post-processing
      if (payload.dof) {
        const dof = sanitizeDof(payload.dof);
        this.stateStore.set('dof', dof);
        this.eventBus.emit('render:dof', dof);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['dofFocus', 'dofAperture'],
            !payload.dof.enabled,
          );
        }
      }
      if (payload.bloom) {
        this.stateStore.set('bloom', payload.bloom);
        this.eventBus.emit('render:bloom', payload.bloom);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor'],
            !payload.bloom.enabled,
          );
        }
      }
      if (payload.grain) {
        this.stateStore.set('grain', payload.grain);
        this.eventBus.emit('render:grain', payload.grain);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(['grainIntensity'], !payload.grain.enabled);
        }
      }
      if (payload.aberration) {
        this.stateStore.set('aberration', payload.aberration);
        this.eventBus.emit('render:aberration', payload.aberration);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['aberrationOffset', 'aberrationStrength'],
            !payload.aberration.enabled,
          );
        }
      }
      if (payload.lensDirt) {
        this.stateStore.set('lensDirt', payload.lensDirt);
        this.eventBus.emit('render:lens-dirt', payload.lensDirt);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['lensDirtStrength'],
            !payload.lensDirt.enabled,
          );
        }
      }
      if (payload.antiAliasing !== undefined) {
        this.stateStore.set('antiAliasing', payload.antiAliasing);
        this.eventBus.emit('render:anti-aliasing', payload.antiAliasing);
      }
      if (payload.renderQuality !== undefined) {
        const q = payload.renderQuality;
        this.stateStore.set(
          'renderQuality',
          q === 'medium' || q === 'low' ? q : 'max',
        );
      } else if (payload.performanceMode !== undefined) {
        this.stateStore.set(
          'renderQuality',
          payload.performanceMode ? 'low' : 'medium',
        );
      }
      if (payload.toneMapping !== undefined) {
        this.stateStore.set('toneMapping', payload.toneMapping);
        this.eventBus.emit('render:tone-mapping', payload.toneMapping);
      }
      if (payload.lookFilterPreset !== undefined) {
        this.stateStore.set('lookFilterPreset', payload.lookFilterPreset);
      }
      if (payload.lookFilterPresetsOpen !== undefined) {
        this.stateStore.set(
          'lookFilterPresetsOpen',
          !!payload.lookFilterPresetsOpen,
        );
      }
      if (payload.background !== undefined) {
        this.stateStore.set('background', payload.background);
        this.eventBus.emit('scene:background', payload.background);
      }

      // Apply vignette LAST - after all other settings to ensure it's not overridden
      const finalState = this.stateStore.getState();
      const vignetteIntensity = finalState.camera?.vignette ?? 0;
      const vignetteColor = finalState.camera?.vignetteColor ?? '#000000';
      this.eventBus.emit('render:vignette', vignetteIntensity);
      this.eventBus.emit('render:vignette-color', vignetteColor);
      // Re-emit on next frame to ensure post-processing uniforms update even if pipeline reinitialized
      requestAnimationFrame(() => {
        this.eventBus.emit('render:vignette', this.stateStore.getState().camera?.vignette ?? 0);
        this.eventBus.emit('render:vignette-color', this.stateStore.getState().camera?.vignetteColor ?? '#000000');
      });

      this.eventBus.emit('render:apply-performance');

      return { success: true, message: 'Scene settings loaded' };
    } catch (error) {
      console.error('Error loading scene settings:', error);
      return { success: false, message: 'Failed to load scene settings - invalid JSON' };
    }
  }
}

