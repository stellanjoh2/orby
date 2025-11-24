/**
 * SceneSettingsManager
 * Handles copying and loading scene settings (excluding object-specific transforms)
 */
export class SceneSettingsManager {
  constructor(eventBus, stateStore, uiHelper) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.uiHelper = uiHelper; // UIManager methods: setHdriActive, toggleHdriControls, etc.
  }

  /**
   * Builds and returns the scene settings payload (excluding object transforms)
   */
  buildSceneSettingsPayload() {
    const state = this.stateStore.getState();
    return {
      // Mesh settings (excluding transforms)
      shading: state.shading,
      showNormals: state.showNormals,
      clay: state.clay,
      wireframe: state.wireframe,
      fresnel: state.fresnel,
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
      podiumScale: state.podiumScale,
      gridScale: state.gridScale,
      lights: state.lights,
      lightsEnabled: state.lightsEnabled,
      lightsMaster: state.lightsMaster,
      lightsRotation: state.lightsRotation,
      lightsAutoRotate: state.lightsAutoRotate,
      showLightIndicators: state.showLightIndicators,
      background: state.background,
      // Camera/Render settings
      camera: {
        fov: state.camera?.fov,
        tilt: state.camera?.tilt,
        contrast: state.camera?.contrast,
        temperature: state.camera?.temperature,
        tint: state.camera?.tint,
        highlights: state.camera?.highlights,
        shadows: state.camera?.shadows,
        saturation: state.camera?.saturation,
        vignette: state.camera?.vignette,
        vignetteColor: state.camera?.vignetteColor,
      },
      exposure: state.exposure,
      autoExposure: state.autoExposure,
      dof: state.dof,
      bloom: state.bloom,
      grain: state.grain,
      aberration: state.aberration,
      lensDirt: state.lensDirt,
      antiAliasing: state.antiAliasing,
      toneMapping: state.toneMapping,
    };
  }

  /**
   * Copies scene settings to clipboard
   */
  async copyToClipboard() {
    const payload = this.buildSceneSettingsPayload();
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

      // Apply Mesh settings (excluding transforms)
      if (payload.shading !== undefined) {
        this.stateStore.set('shading', payload.shading);
        this.eventBus.emit('mesh:shading', payload.shading);
      }
      if (payload.showNormals !== undefined) {
        this.stateStore.set('showNormals', payload.showNormals);
        this.eventBus.emit('mesh:normals', payload.showNormals);
      }
      if (payload.clay) {
        this.stateStore.set('clay', payload.clay);
        this.eventBus.emit('mesh:clay-color', payload.clay.color);
        this.eventBus.emit('mesh:clay-roughness', payload.clay.roughness);
        this.eventBus.emit('mesh:clay-specular', payload.clay.specular);
      }
      if (payload.wireframe) {
        this.stateStore.set('wireframe', payload.wireframe);
        this.eventBus.emit('mesh:wireframe-always-on', payload.wireframe.alwaysOn);
        this.eventBus.emit('mesh:wireframe-color', payload.wireframe.color);
        this.eventBus.emit('mesh:wireframe-only-visible-faces', payload.wireframe.onlyVisibleFaces);
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
        // Handle vignette - emit both intensity and color together
        if (payload.camera.vignette !== undefined || payload.camera.vignetteColor !== undefined) {
          const vignetteIntensity = payload.camera.vignette !== undefined 
            ? payload.camera.vignette 
            : this.stateStore.getState().camera?.vignette ?? 0;
          const vignetteColor = payload.camera.vignetteColor !== undefined 
            ? payload.camera.vignetteColor 
            : this.stateStore.getState().camera?.vignetteColor ?? '#000000';
          
          if (payload.camera.vignette !== undefined) {
            this.stateStore.set('camera.vignette', vignetteIntensity);
          }
          if (payload.camera.vignetteColor !== undefined) {
            this.stateStore.set('camera.vignetteColor', vignetteColor);
          }
          this.eventBus.emit('render:vignette', { intensity: vignetteIntensity, color: vignetteColor });
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

      // Apply Post-processing
      if (payload.dof) {
        this.stateStore.set('dof', payload.dof);
        this.eventBus.emit('render:dof', payload.dof);
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
      if (payload.toneMapping !== undefined) {
        this.stateStore.set('toneMapping', payload.toneMapping);
        this.eventBus.emit('render:tone-mapping', payload.toneMapping);
      }
      if (payload.background !== undefined) {
        this.stateStore.set('background', payload.background);
        this.eventBus.emit('scene:background', payload.background);
      }

      return { success: true, message: 'Scene settings loaded' };
    } catch (error) {
      console.error('Error loading scene settings:', error);
      return { success: false, message: 'Failed to load scene settings - invalid JSON' };
    }
  }
}

