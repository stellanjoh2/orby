/**
 * EventManager - Handles all eventBus event listeners for SceneManager
 * Centralizes all event registration and delegation to SceneManager methods
 */
export class EventManager {
  constructor(sceneManager) {
    this.scene = sceneManager;
  }

  /**
   * Register all event listeners
   * All events delegate to SceneManager methods
   */
  register() {
    const { eventBus, scene } = this;
    const s = scene; // Shorthand for readability

    // Mesh/Transform events
    eventBus.on('mesh:scale', (value) => s.setScale(value));
    eventBus.on('mesh:xOffset', (value) => s.setXOffset(value));
    eventBus.on('mesh:yOffset', (value) => s.setYOffset(value));
    eventBus.on('mesh:zOffset', (value) => s.setZOffset(value));
    eventBus.on('mesh:rotationX', (value) => s.setRotationX(value));
    eventBus.on('mesh:rotationY', (value) => s.setRotationY(value));
    eventBus.on('mesh:rotationZ', (value) => s.setRotationZ(value));
    eventBus.on('mesh:shading', (mode) => s.setShading(mode));
    eventBus.on('mesh:normals', (enabled) => s.toggleNormals(enabled));
    eventBus.on('mesh:auto-rotate', (speed) => {
      s.autoRotateSpeed = speed;
    });
    eventBus.on('mesh:clay-color', (value) => {
      s.setClaySettings({ color: value });
    });
    eventBus.on('mesh:material-brightness', (brightness) => {
      s.materialController?.setMaterialBrightness(brightness);
    });
    eventBus.on('mesh:material-metalness', (metalness) => {
      s.materialController?.setMaterialMetalness(metalness);
    });
    eventBus.on('mesh:material-roughness', (roughness) => {
      s.materialController?.setMaterialRoughness(roughness);
    });
    // Legacy support
    eventBus.on('mesh:diffuse-brightness', (value) => {
      s.materialController?.setMaterialBrightness(value);
    });
    eventBus.on('mesh:wireframe-always-on', (value) => {
      s.setWireframeSettings({ alwaysOn: value });
    });
    eventBus.on('mesh:wireframe-color', (value) => {
      s.setWireframeSettings({ color: value });
    });
    eventBus.on('mesh:wireframe-only-visible-faces', (value) => {
      s.setWireframeSettings({ onlyVisibleFaces: value });
    });
    eventBus.on('mesh:reset-transform', () => {
      s.transformController?.setRotationY(0);
    });
    
    // Transform widget visibility
    eventBus.on('mesh:move-widget-enabled', (enabled) => {
      if (s.transformControlsTranslate) {
        s.transformControlsTranslate.visible = enabled;
        if (enabled && s.currentModel && s.modelRoot) {
          s.transformControlsTranslate.attach(s.modelRoot);
        } else if (!enabled) {
          s.transformControlsTranslate.detach();
        }
      }
    });
    
    eventBus.on('mesh:rotate-widget-enabled', (enabled) => {
      if (s.transformControlsRotate) {
        s.transformControlsRotate.visible = enabled;
        if (enabled && s.currentModel && s.modelRoot) {
          s.transformControlsRotate.attach(s.modelRoot);
        } else if (!enabled) {
          s.transformControlsRotate.detach();
        }
      }
    });
    
    eventBus.on('mesh:scale-widget-enabled', (enabled) => {
      if (s.transformControlsScale) {
        s.transformControlsScale.visible = enabled;
        if (enabled && s.currentModel && s.modelRoot) {
          s.transformControlsScale.attach(s.modelRoot);
        } else if (!enabled) {
          s.transformControlsScale.detach();
        }
      }
    });

    // Camera events
    eventBus.on('camera:preset', (preset) => s.applyCameraPreset(preset));
    eventBus.on('camera:fov', (value) => {
      s.camera.fov = value;
      s.camera.updateProjectionMatrix();
    });
    eventBus.on('camera:auto-orbit', (value) => s.setCameraAutoOrbit(value));
    eventBus.on('camera:tilt', (value) => {
      s.cameraController?.setTilt(value);
    });
    eventBus.on('camera:focus', () => {
      if (s.currentModel) {
        s.cameraController?.focusOnObjectAnimated(s.currentModel, 1.0);
      }
    });
    eventBus.on('camera:reset', () => {
      s.camera.position.set(0, 1.5, 6);
      s.controls.target.set(0, 1, 0);
      s.controls.update();
    });
    eventBus.on('camera:get-state', () => {
      const state = {
        position: {
          x: s.camera.position.x,
          y: s.camera.position.y,
          z: s.camera.position.z,
        },
        target: {
          x: s.controls.target.x,
          y: s.controls.target.y,
          z: s.controls.target.z,
        },
      };
      eventBus.emit('camera:state', state);
    });
    eventBus.on('camera:set-state', (state) => {
      if (state.position) {
        s.camera.position.set(state.position.x, state.position.y, state.position.z);
      }
      if (state.target) {
        s.controls.target.set(state.target.x, state.target.y, state.target.z);
        s.controls.update();
      }
    });
    eventBus.on('camera:lock-orbit', () => {
      if (s.controls) {
        s.controls.enableRotate = false;
        s.controls.enablePan = false;
      }
    });
    eventBus.on('camera:unlock-orbit', () => {
      if (s.controls) {
        s.controls.enableRotate = true;
        s.controls.enablePan = true;
      }
    });

    // Studio/HDRI events
    eventBus.on('studio:hdri', (preset) => s.setHdriPreset(preset));
    eventBus.on('studio:hdri-enabled', (enabled) => s.setHdriEnabled(enabled));
    eventBus.on('studio:hdri-strength', (value) => s.setHdriStrength(value));
    eventBus.on('studio:hdri-blurriness', (value) => s.setHdriBlurriness(value));
    eventBus.on('studio:hdri-rotation', (value) => s.setHdriRotation(value));
    eventBus.on('studio:hdri-background', (enabled) => s.setHdriBackground(enabled));
    eventBus.on('studio:lens-flare-enabled', (enabled) => s.setLensFlareEnabled(enabled));
    eventBus.on('studio:lens-flare-rotation', (value) => s.setLensFlareRotation(value));
    eventBus.on('studio:lens-flare-height', (value) => s.setLensFlareHeight(value));
    eventBus.on('studio:lens-flare-color', (value) => s.setLensFlareColor(value));
    eventBus.on('studio:lens-flare-quality', (value) => s.setLensFlareQuality(value));
    eventBus.on('mesh:clay-normal-map', (enabled) => s.setClayNormalMap(enabled));

    // Render/Post-processing events
    eventBus.on('render:contrast', (value) => s.setContrast(value));
    eventBus.on('render:saturation', (value) => s.setSaturation(value));
    eventBus.on('render:clarity', (value) => s.setClarity(value));
    eventBus.on('render:fade', (value) => s.setFade(value));
    eventBus.on('render:sharpness', (value) => s.setSharpness(value));
    eventBus.on('render:temperature', (value) => s.setTemperature(value));
    eventBus.on('render:tint', (value) => s.setTint(value));
    eventBus.on('render:highlights', (value) => s.setHighlights(value));
    eventBus.on('render:shadows', (value) => s.setShadows(value));
    eventBus.on('render:vignette', (value) => s.setVignette(value));
    eventBus.on('render:vignette-color', (value) => s.setVignetteColor(value));
    eventBus.on('render:dof', (settings) => s.updateDof(settings));
    eventBus.on('render:bloom', (settings) => s.updateBloom(settings));
    eventBus.on('render:grain', (settings) => s.updateGrain(settings));
    eventBus.on('render:aberration', (settings) => s.updateAberration(settings));
    eventBus.on('render:fresnel', (settings) => s.setFresnelSettings(settings));
    eventBus.on('render:lens-dirt', (settings) => s.lensDirtController?.updateSettings(settings));
    eventBus.on('render:anti-aliasing', (value) => {
      if (s.fxaaPass) {
        s.fxaaPass.enabled = value === 'fxaa';
      }
    });
    eventBus.on('render:tone-mapping', (value) => s.setToneMapping(value));
    eventBus.on('render:histogram-enabled', (enabled) => {
      if (s.histogramController) {
        s.histogramController.setEnabled(enabled);
      }
    });

    // Ground/Podium events
    eventBus.on('studio:ground-solid', (enabled) => s.setGroundSolid(enabled));
    eventBus.on('studio:ground-wire', (enabled) => s.setGroundWire(enabled));
    eventBus.on('studio:ground-solid-color', (color) => s.setGroundSolidColor(color));
    eventBus.on('studio:ground-wire-color', (color) => s.setGroundWireColor(color));
    eventBus.on('studio:ground-wire-opacity', (value) => s.setGroundWireOpacity(value));
    eventBus.on('studio:ground-y', (value) => s.setGroundY(value));
    eventBus.on('studio:podium-scale', (value) => s.setPodiumScale(value));
    eventBus.on('studio:grid-scale', (value) => s.setGridScale(value));
    eventBus.on('studio:podium-snap', () => s.snapPodiumToBottom());
    eventBus.on('studio:grid-snap', () => s.snapGridToBottom());

    // Lights events
    eventBus.on('lights:update', ({ lightId, property, value }) => {
      console.log(`[SceneManager] Received lights:update event:`, { lightId, property, value });
      s.lightsController?.updateLightProperty(lightId, property, value);
    });
    eventBus.on('lights:master', (value) => s.setLightsMaster(value));
    eventBus.on('lights:enabled', (enabled) => s.setLightsEnabled(enabled));
    eventBus.on('lights:rotate', (value) => s.setLightsRotation(value));
    eventBus.on('lights:height', (value) => s.setLightsHeight(value));
    eventBus.on('lights:auto-rotate', (enabled) => s.setLightsAutoRotate(enabled));
    eventBus.on('lights:show-indicators', (enabled) => s.setShowLightIndicators(enabled));
    eventBus.on('lights:cast-shadows', (enabled) => s.setLightsCastShadows(enabled));

    // Scene/Background events
    eventBus.on('scene:background', (color) => s.backgroundController?.setColor(color));
    eventBus.on('scene:exposure', (value) => {
      s.autoExposureController?.setManualExposure(value);
      // Update UI display
      s.ui?.updateExposureDisplay?.(value);
      // Update lens dirt exposure factor
      s.lensDirtController?.updateExposureFactor();
    });
    eventBus.on('camera:auto-exposure', (enabled) => s.autoExposureController?.setEnabled(enabled));

    // File loading events
    eventBus.on('file:selected', (file) => s.loadFile(file));
    eventBus.on('file:bundle', (bundle) => s.loadFileBundle(bundle));
    eventBus.on('file:reload', () => {
      if (s.currentFile) {
        s.loadFile(s.currentFile, { silent: true });
      } else {
        s.ui.showToast('No model to reload');
      }
    });

    // Animation events
    eventBus.on('animation:toggle', () => s.animationController.togglePlayback());
    eventBus.on('animation:scrub', (value) => s.animationController.scrub(value));
    eventBus.on('animation:select', (index) => s.animationController.selectAnimation(index));

    // Export events
    eventBus.on('export:png', (settings) => s.exportPng(settings));
    
    // App events
    eventBus.on('app:reset', () => s.applyStateSnapshot(s.stateStore.getState()));
  }

  /**
   * Get eventBus from scene manager
   */
  get eventBus() {
    return this.scene.eventBus;
  }
}

