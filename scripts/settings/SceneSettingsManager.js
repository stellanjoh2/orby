import { clampExtrudeBevelAmount } from '../import/extrudeBevel.js';
import { DEFAULT_EXTRUDE_DEPTH, resolveSvgExtrudeDefaults } from '../import/extrudeDefaults.js';
import {
  sanitizeDof,
  sanitizeAmbientOcclusion,
  effectiveVignetteIntensity,
  isBloomTuningActive,
  isVignetteUiEnabled,
  cameraShadowsUiToShader,
} from '../constants.js';
import { HDRI_CUSTOM_ID, HDRI_MOODS } from '../config/hdri.js';
import { migrateLegacyGroundKeys } from '../state/migrateLegacyGroundKeys.js';
import { mergeAberrationSettings } from '../render/chromaticAberration.js';
import { resolveCreativeLookPresetChoice } from '../render/CreativeLookMaterials.js';
import { normalizeStoredGoboScale } from '../render/GoboProjection.js';
import { resolveDiscGlowFromState } from '../render/LensFlareController.js';
import { emitGodRaysStudioEvents } from '../GodRaysEffect.js';
import { deepClone } from '../utils/deepClone.js';
import {
  arrayBufferToBase64,
  base64ToUint8Array,
  fileFromEmbeddedAsset,
} from '../utils/binaryAsset.js';

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
   * Builds and returns the full scene settings payload (all StateStore keys + live camera pose).
   */
  async buildSceneSettingsPayload() {
    const state = this.stateStore.getState();
    const cameraState = await this.getCameraState();
    const activeMoodBaseColor = HDRI_MOODS[state.hdri]?.baseColor;

    const payload = deepClone(state);
    delete payload.ui;
    payload.baseColor = activeMoodBaseColor ?? state.groundSolidColor;
    payload.camera = {
      ...payload.camera,
      position: cameraState?.position,
      target: cameraState?.target,
    };
    payload.svgExtrude = this._serializeSvgExtrude(state.svgExtrude);
    return payload;
  }

  _serializeSvgExtrude(svgExtrude) {
    const svg = resolveSvgExtrudeDefaults(svgExtrude);
    return {
      enabled: !!svgExtrude?.enabled,
      availableColors: Array.isArray(svgExtrude?.availableColors)
        ? [...svgExtrude.availableColors]
        : [],
      depth: svg.depth,
      normalAngle: svg.normalAngle,
      hardEdgeAngle: svg.hardEdgeAngle,
      colorDepths: svg.colorDepths,
      colorOffsets: svg.colorOffsets,
      flipDirection: svg.flipDirection,
      colorOverride: svg.colorOverride,
      overrideColor: svg.overrideColor,
      surfacePreset: svg.surfacePreset,
      surfaceScale: svg.surfaceScale,
      surfaceStrength: svg.surfaceStrength,
      bevelAmount: svg.bevelAmount,
      detail: svg.detail,
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

  async restoreEmbeddedAssets(payload) {
    if (payload.hdri === HDRI_CUSTOM_ID && payload.hdriCustomAsset?.dataBase64) {
      const file = fileFromEmbeddedAsset(payload.hdriCustomAsset, 'custom.hdr');
      if (file && this.uiHelper?.loadCustomHdriFile) {
        await this.uiHelper.loadCustomHdriFile(file);
      }
    }
    if (payload.backgroundImage?.asset?.dataBase64) {
      this.stateStore.set('backgroundImage', payload.backgroundImage);
      await window.orby?.scene?.restoreBackgroundImageFromState?.(payload.backgroundImage);
    }
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
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        sceneSettings,
        asset: {
          name: sourceFile.name || 'model',
          type: sourceFile.type || '',
          lastModified: sourceFile.lastModified || Date.now(),
          dataBase64: arrayBufferToBase64(fileBuffer),
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
      const bytes = base64ToUint8Array(payload.asset.dataBase64);
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
      this.eventBus.emit('scene:orby-import-start');
      this.eventBus.emit('file:selected', embeddedFile);
      const modelLoadResult = await loadComplete;
      if (!modelLoadResult?.success) {
        return { success: false, message: 'Failed to load mesh from .orby file' };
      }

      // Apply saved scene settings after mesh load to ensure all controls (including
      // podium/ground colors and model-dependent settings) overwrite defaults cleanly.
      const sceneLoadResult = await this.loadFromText(JSON.stringify(payload.sceneSettings));
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
   * Applies scene settings from pasted JSON text (e.g. from clipboard).
   */
  async loadFromText(text) {
    try {
      const payload = JSON.parse(text);
      migrateLegacyGroundKeys(payload);
      delete payload.ui;

      // Validate that it looks like scene settings
      const expectedKeys = [
        'shading',
        'hdri',
        'camera',
        'dof',
        'bloom',
        'lights',
        'animation',
        'fontExtrude',
      ];
      const hasExpectedKeys = expectedKeys.some((key) => key in payload);

      if (!hasExpectedKeys) {
        return { success: false, message: 'Invalid scene settings - missing required fields' };
      }

      // Replace current settings so nothing leaks from the previous scene.
      this.stateStore.reset();
      await this.restoreEmbeddedAssets(payload);

      this.eventBus.emit('scene:batch-apply-start');
      try {
      this.stateStore.batch(() => {
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
      if (payload.autoRotateDirection !== undefined) {
        const direction = payload.autoRotateDirection === 'reverse' ? 'reverse' : 'forward';
        this.stateStore.set('autoRotateDirection', direction);
        this.eventBus.emit('mesh:auto-rotate-direction', direction);
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
        if (payload.wireframe.thickness !== undefined) {
          this.eventBus.emit('mesh:wireframe-thickness', payload.wireframe.thickness);
        }
      }
      if (payload.creativeLook) {
        this.stateStore.set('creativeLook', payload.creativeLook);
        if (payload.creativeLook.enabled) {
          this.stateStore.set('creativeLookSectionOpen', true);
        }
        const chosen = resolveCreativeLookPresetChoice(payload.creativeLook.preset);
        const sectionOpen =
          !!payload.creativeLookSectionOpen || !!payload.creativeLook.enabled;
        if (this.uiHelper?.setCreativeLookActive) {
          this.uiHelper.setCreativeLookActive(
            sectionOpen && chosen ? chosen : null,
          );
        }
        if (this.uiHelper?.toggleCreativeLookGrid) {
          this.uiHelper.toggleCreativeLookGrid(
            !!payload.creativeLookSectionOpen || !!payload.creativeLook.enabled,
          );
        }
        this.eventBus.emit('mesh:creative-look');
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
      /* Subsurface paste — events disabled; state kept for when feature is re-enabled (SUBSURFACE_FEATURE_ENABLED).
      if (payload.subsurface) {
        this.stateStore.set('subsurface', payload.subsurface);
        this.eventBus.emit('mesh:subsurface', payload.subsurface);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['subsurfaceTranslucency', 'subsurfaceScatterTint'],
            !payload.subsurface.enabled,
          );
        }
      }
      */
      if (payload.subsurface) {
        this.stateStore.set('subsurface', payload.subsurface);
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
      if (payload.svgExtrude?.hardEdgeAngle !== undefined) {
        this.stateStore.set('svgExtrude.hardEdgeAngle', payload.svgExtrude.hardEdgeAngle);
        this.eventBus.emit('mesh:svg-extrude-hard-edge-angle', payload.svgExtrude.hardEdgeAngle);
      }
      if (payload.svgExtrude?.bevelAmount !== undefined) {
        const depth = Number(this.stateStore.getState().svgExtrude?.depth ?? DEFAULT_EXTRUDE_DEPTH);
        const amount = clampExtrudeBevelAmount(payload.svgExtrude.bevelAmount, depth);
        this.stateStore.set('svgExtrude.bevelAmount', amount);
        this.eventBus.emit('mesh:svg-extrude-bevel', { amount });
      }
      if (payload.svgExtrude?.detail !== undefined) {
        this.stateStore.set('svgExtrude.detail', payload.svgExtrude.detail);
        this.eventBus.emit('mesh:svg-extrude-detail', payload.svgExtrude.detail);
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
      if (
        payload.svgExtrude?.surfacePreset !== undefined ||
        payload.svgExtrude?.surfaceScale !== undefined ||
        payload.svgExtrude?.surfaceStrength !== undefined
      ) {
        if (payload.svgExtrude?.surfacePreset !== undefined) {
          this.stateStore.set('svgExtrude.surfacePreset', payload.svgExtrude.surfacePreset);
        }
        if (payload.svgExtrude?.surfaceScale !== undefined) {
          this.stateStore.set('svgExtrude.surfaceScale', payload.svgExtrude.surfaceScale);
        }
        if (payload.svgExtrude?.surfaceStrength !== undefined) {
          this.stateStore.set('svgExtrude.surfaceStrength', payload.svgExtrude.surfaceStrength);
        }
        const st = this.stateStore.getState().svgExtrude;
        this.eventBus.emit('mesh:svg-extrude-surface', {
          preset: st?.surfacePreset ?? 'none',
          scale: st?.surfaceScale ?? 1.0,
          strength: st?.surfaceStrength ?? 1.0,
        });
      }
      if (payload.advanced?.reverseNormals !== undefined) {
        const enabled = !!payload.advanced.reverseNormals;
        this.stateStore.set('advanced.reverseNormals', enabled);
        this.eventBus.emit('mesh:reverse-normals', enabled);
      }
      if (payload.advanced?.transparencyFix !== undefined) {
        const allowed = ['default', 'opaqueBlend', 'frontFace', 'opaqueAndFrontFace'];
        const tf = allowed.includes(payload.advanced.transparencyFix)
          ? payload.advanced.transparencyFix
          : 'default';
        this.stateStore.set('advanced.transparencyFix', tf);
        this.eventBus.emit('mesh:transparency-fix');
      }
      if (payload.advanced?.blendSortingMitigation !== undefined) {
        this.stateStore.set(
          'advanced.blendSortingMitigation',
          !!payload.advanced.blendSortingMitigation,
        );
        this.eventBus.emit('mesh:transparency-fix');
      }
      if (payload.advanced?.flipGlassNormalMapY !== undefined) {
        this.stateStore.set(
          'advanced.flipGlassNormalMapY',
          !!payload.advanced.flipGlassNormalMapY,
        );
        this.eventBus.emit('mesh:glass-appearance');
      }
      if (payload.advanced?.glassFrontFacesOnly !== undefined) {
        this.stateStore.set(
          'advanced.glassFrontFacesOnly',
          !!payload.advanced.glassFrontFacesOnly,
        );
        this.eventBus.emit('mesh:glass-appearance');
      }
      if (
        payload.advanced?.glassOpacity !== undefined ||
        payload.advanced?.glassReflection !== undefined ||
        payload.advanced?.glassTint !== undefined ||
        payload.advanced?.glassBody !== undefined
      ) {
        if (payload.advanced?.glassOpacity !== undefined) {
          const o = Number(payload.advanced.glassOpacity);
          if (Number.isFinite(o)) {
            this.stateStore.set('advanced.glassOpacity', Math.min(1, Math.max(0.02, o)));
          }
        }
        if (payload.advanced?.glassReflection !== undefined) {
          const r = Number(payload.advanced.glassReflection);
          if (Number.isFinite(r)) {
            this.stateStore.set('advanced.glassReflection', Math.min(4, Math.max(0, r)));
          }
        }
        if (payload.advanced?.glassTint !== undefined) {
          const t = String(payload.advanced.glassTint).trim();
          if (/^#[0-9A-Fa-f]{6}$/.test(t)) {
            this.stateStore.set('advanced.glassTint', t);
          }
        }
        if (payload.advanced?.glassBody !== undefined) {
          const b = Number(payload.advanced.glassBody);
          if (Number.isFinite(b)) {
            this.stateStore.set('advanced.glassBody', Math.min(1, Math.max(0, b)));
          }
        }
        this.eventBus.emit('mesh:glass-appearance');
      }
      if (payload.advanced?.uvChecker !== undefined) {
        const enabled = !!payload.advanced.uvChecker;
        this.stateStore.set('advanced.uvChecker', enabled);
        this.eventBus.emit('mesh:uv-checker', enabled);
      }
      if (payload.advanced?.uvCheckerScale !== undefined) {
        const raw = Number(payload.advanced.uvCheckerScale);
        if (Number.isFinite(raw)) {
          const scale = Math.max(0.05, Math.min(10, raw));
          this.stateStore.set('advanced.uvCheckerScale', scale);
          this.eventBus.emit('mesh:uv-checker-scale', scale);
        }
      }
      if (payload.advanced?.uvCheckerStyle !== undefined) {
        const allowed = ['orby', 'classic', 'monochrome'];
        const mapped = payload.advanced.uvCheckerStyle === 'vibrant'
          ? 'classic'
          : payload.advanced.uvCheckerStyle;
        const style = allowed.includes(mapped)
          ? mapped
          : 'orby';
        this.stateStore.set('advanced.uvCheckerStyle', style);
        this.eventBus.emit('mesh:uv-checker-style', style);
      }
      if (payload.advanced?.normalView !== undefined) {
        const enabled = !!payload.advanced.normalView;
        this.stateStore.set('advanced.normalView', enabled);
        this.eventBus.emit('mesh:normal-view', enabled);
      }
      if (payload.advanced?.normalViewMode !== undefined) {
        const allowed = ['geometry', 'tangent'];
        const mode = allowed.includes(payload.advanced.normalViewMode)
          ? payload.advanced.normalViewMode
          : 'geometry';
        this.stateStore.set('advanced.normalViewMode', mode);
        this.eventBus.emit('mesh:normal-view-mode', mode);
      }
      if (
        payload.advanced?.stlSmoothShading !== undefined ||
        payload.advanced?.stlSmoothingAngle !== undefined
      ) {
        if (payload.advanced?.stlSmoothShading !== undefined) {
          this.stateStore.set('advanced.stlSmoothShading', !!payload.advanced.stlSmoothShading);
        }
        if (payload.advanced?.stlSmoothingAngle !== undefined) {
          const raw = Number(payload.advanced.stlSmoothingAngle);
          if (Number.isFinite(raw)) {
            this.stateStore.set(
              'advanced.stlSmoothingAngle',
              Math.max(0, Math.min(180, raw)),
            );
          }
        }
        this.eventBus.emit('mesh:stl-smoothing');
      }
      if (payload.fbxMapSlots) {
        const d = this.stateStore.getDefaults().fbxMapSlots;
        const merged = { ...d, ...payload.fbxMapSlots };
        this.stateStore.set('fbxMapSlots', merged);
        this.eventBus.emit('mesh:fbx-invert-normal-y', !!merged.invertNormalY);
        this.eventBus.emit('mesh:fbx-pbr-uv-channel', merged.pbrUvChannel === 1 ? 1 : 0);
        if (merged.activeMaterial) {
          this.eventBus.emit('mesh:fbx-active-material', {
            materialKey: merged.activeMaterial,
          });
        }
      }
      if (payload.svgColorDetail !== undefined) {
        const level = payload.svgColorDetail;
        if (level === 'low' || level === 'medium' || level === 'high') {
          this.stateStore.set('svgColorDetail', level);
        }
      }
      if (payload.fontExtrude) {
        const d = this.stateStore.getDefaults().fontExtrude;
        this.stateStore.set('fontExtrude', { ...d, ...payload.fontExtrude });
      }
      if (payload.animation) {
        const d = this.stateStore.getDefaults().animation;
        const merged = { ...d, ...payload.animation };
        this.stateStore.set('animation', merged);
        this.eventBus.emit('animation:show-bones', !!merged.showBones);
        this.eventBus.emit('animation:show-joint-names', !!merged.showJointNames);
        this.eventBus.emit('animation:joint-scale', merged.jointScale ?? 0.5);
        this.eventBus.emit('animation:bone-stroke-width', merged.boneStrokeWidth ?? 2);
        this.eventBus.emit('animation:hide-mesh', !!merged.hideMesh);
        this.eventBus.emit('animation:clip-mode', merged.clipPlaybackMode ?? 'loop');
        this.eventBus.emit('animation:display-fps', merged.displayFps ?? 60);
        this.eventBus.emit('animation:time-reference', !!merged.timeReferenceEnabled);
      }
      if (payload.hdriCustomAsset !== undefined && payload.hdri !== HDRI_CUSTOM_ID) {
        this.stateStore.set('hdriCustomAsset', payload.hdriCustomAsset);
      }

      // Apply Studio settings
      if (payload.hdriCustomName !== undefined) {
        this.stateStore.set('hdriCustomName', payload.hdriCustomName);
      }
      if (payload.hdri !== undefined) {
        if (payload.hdri === HDRI_CUSTOM_ID) {
          if (payload.hdriCustomAsset?.dataBase64) {
            this.stateStore.set('hdri', HDRI_CUSTOM_ID);
            this.stateStore.set(
              'hdriCustomName',
              payload.hdriCustomName ?? payload.hdriCustomAsset.name ?? null,
            );
            this.stateStore.set('hdriCustomAsset', payload.hdriCustomAsset);
            if (this.uiHelper?.setHdriActive) {
              this.uiHelper.setHdriActive(HDRI_CUSTOM_ID);
            }
            this.eventBus.emit('studio:hdri', HDRI_CUSTOM_ID);
            if (payload.hdriCustomName ?? payload.hdriCustomAsset.name) {
              this.uiHelper?.setHdriUploadLoaded?.(
                payload.hdriCustomName ?? payload.hdriCustomAsset.name,
              );
            }
          } else {
            const fallback = this.stateStore.getDefaults().hdri ?? 'beach';
            this.stateStore.set('hdri', fallback);
            this.stateStore.set('hdriCustomName', null);
            this.stateStore.set('hdriCustomAsset', null);
            this.eventBus.emit('studio:hdri-clear-custom');
            if (this.uiHelper?.setHdriActive) {
              this.uiHelper.setHdriActive(fallback);
            }
            this.eventBus.emit('studio:hdri', fallback);
            this.uiHelper?.showToast?.(
              'Custom HDRI is not included in scene JSON — re-upload your file.',
              4200,
            );
          }
        } else {
          this.stateStore.set('hdri', payload.hdri);
          if (this.uiHelper?.setHdriActive) {
            this.uiHelper.setHdriActive(payload.hdri);
          }
          this.eventBus.emit('studio:hdri', payload.hdri);
        }
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
        this.uiHelper?.updateHdriReceiveShadowsAoDisabled?.();
      }
      if (payload.hdriReceiveShadowsAo !== undefined) {
        this.stateStore.set('hdriReceiveShadowsAo', !!payload.hdriReceiveShadowsAo);
        this.eventBus.emit('studio:hdri-receive-shadows-ao', !!payload.hdriReceiveShadowsAo);
      }
      if (payload.lensFlare) {
        const d = this.stateStore.getDefaults().lensFlare;
        const merged = {
          ...d,
          ...payload.lensFlare,
          anamorphicBloom: {
            ...d.anamorphicBloom,
            ...(payload.lensFlare.anamorphicBloom ?? {}),
          },
        };
        if (
          merged.spinDuringOrbit === undefined &&
          payload.godRays?.spinDuringOrbit != null
        ) {
          merged.spinDuringOrbit = payload.godRays.spinDuringOrbit;
        }
        const discGlow = resolveDiscGlowFromState(merged, d);
        merged.discGlowIntensity = discGlow.intensity;
        merged.discGlowSize = discGlow.size;
        merged.discGlowColor = discGlow.color;
        this.stateStore.set('lensFlare', merged);
        this.eventBus.emit('studio:lens-flare-enabled', merged.enabled);
        this.eventBus.emit('studio:lens-flare-rotation', merged.rotation);
        this.eventBus.emit('studio:lens-flare-height', merged.height);
        this.eventBus.emit('studio:lens-flare-color', merged.color);
        this.eventBus.emit('studio:lens-flare-quality', merged.quality);
        this.eventBus.emit(
          'studio:lens-flare-spin-during-orbit',
          !!merged.spinDuringOrbit,
        );
        this.eventBus.emit('studio:lens-flare-halo', merged.haloIntensity);
        this.eventBus.emit('studio:lens-flare-streak-length', merged.streakLength);
        this.eventBus.emit('studio:lens-flare-sun-disc-scale', merged.sunDiscScale);
        this.eventBus.emit('studio:lens-flare-sun-disc-blur', merged.sunDiscBlur);
        this.eventBus.emit('studio:lens-flare-sun-disc-color', merged.sunDiscColor);
        this.eventBus.emit('studio:lens-flare-disc-glow-intensity', merged.discGlowIntensity);
        this.eventBus.emit('studio:lens-flare-disc-glow-size', merged.discGlowSize);
        this.eventBus.emit('studio:lens-flare-disc-glow-color', merged.discGlowColor);
        this.eventBus.emit('studio:lens-flare-anamorphic-bloom');
        this.uiHelper?.syncLensFlareKeyLightConnectButton?.();
        if (merged.keyLightConnected) {
          this.eventBus.emit('studio:lens-flare-key-light-sync');
        }
      }
      if (payload.godRays) {
        const d = this.stateStore.getDefaults().godRays;
        const merged = {
          ...d,
          ...payload.godRays,
        };
        this.stateStore.set('godRays', merged);
        emitGodRaysStudioEvents(this.eventBus, merged, d);
      }
      if (payload.groundSolid !== undefined) {
        this.stateStore.set('groundSolid', payload.groundSolid);
        this.eventBus.emit('studio:ground-solid', payload.groundSolid);
      }
      if (payload.groundWire !== undefined) {
        this.stateStore.set('groundWire', payload.groundWire);
        this.eventBus.emit('studio:ground-wire', payload.groundWire);
      }
      const restoredBaseColor = payload.baseColor ?? payload.podiumColor ?? payload.groundSolidColor;
      if (restoredBaseColor !== undefined) {
        this.stateStore.set('groundSolidColor', restoredBaseColor);
        this.eventBus.emit('studio:ground-solid-color', restoredBaseColor);
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
      if (payload.baseScale !== undefined) {
        this.stateStore.set('baseScale', payload.baseScale);
        this.eventBus.emit('studio:base-scale', payload.baseScale);
      }
      if (payload.baseMetalness !== undefined) {
        this.stateStore.set('baseMetalness', payload.baseMetalness);
        this.eventBus.emit('studio:base-metalness', payload.baseMetalness);
      }
      if (payload.baseRoughness !== undefined) {
        this.stateStore.set('baseRoughness', payload.baseRoughness);
        this.eventBus.emit('studio:base-roughness', payload.baseRoughness);
      }
      if (payload.baseReflection !== undefined) {
        this.stateStore.set('baseReflection', payload.baseReflection);
        this.eventBus.emit('studio:base-reflection', payload.baseReflection);
      }
      if (payload.baseClearcoat !== undefined) {
        this.stateStore.set('baseClearcoat', payload.baseClearcoat);
        this.eventBus.emit('studio:base-clearcoat', payload.baseClearcoat);
      }
      if (
        payload.baseSurfacePreset !== undefined ||
        payload.baseSurfaceScale !== undefined ||
        payload.baseSurfaceStrength !== undefined
      ) {
        if (payload.baseSurfacePreset !== undefined) {
          this.stateStore.set('baseSurfacePreset', payload.baseSurfacePreset);
        }
        if (payload.baseSurfaceScale !== undefined) {
          this.stateStore.set('baseSurfaceScale', payload.baseSurfaceScale);
        }
        if (payload.baseSurfaceStrength !== undefined) {
          this.stateStore.set('baseSurfaceStrength', payload.baseSurfaceStrength);
        }
        const st = this.stateStore.getState();
        this.eventBus.emit('studio:base-surface', {
          preset: st.baseSurfacePreset ?? 'none',
          scale: st.baseSurfaceScale ?? 1,
          strength: st.baseSurfaceStrength ?? 1,
        });
      }
      if (payload.baseGlassSurface !== undefined) {
        this.stateStore.set('baseGlassSurface', payload.baseGlassSurface);
        this.eventBus.emit('studio:base-glass-surface', payload.baseGlassSurface);
      } else if (payload.podiumReflectMesh !== undefined) {
        this.stateStore.set('baseGlassSurface', payload.podiumReflectMesh);
        this.eventBus.emit('studio:base-glass-surface', payload.podiumReflectMesh);
      }
      if (payload.baseGlassBlur !== undefined) {
        this.stateStore.set('baseGlassBlur', payload.baseGlassBlur);
        this.eventBus.emit('studio:base-glass-blur', payload.baseGlassBlur);
      }
      if (payload.baseGlassAmount !== undefined) {
        this.stateStore.set('baseGlassAmount', payload.baseGlassAmount);
        this.eventBus.emit('studio:base-glass-amount', payload.baseGlassAmount);
      }
      if (payload.baseGlassBrightness !== undefined) {
        this.stateStore.set('baseGlassBrightness', payload.baseGlassBrightness);
        this.eventBus.emit('studio:base-glass-brightness', payload.baseGlassBrightness);
      }
      if (payload.backdropEnabled !== undefined) {
        this.stateStore.set('backdropEnabled', !!payload.backdropEnabled);
        this.eventBus.emit('studio:backdrop-enabled', !!payload.backdropEnabled);
      }
      if (payload.backdropScale !== undefined) {
        this.stateStore.set('backdropScale', payload.backdropScale);
        this.eventBus.emit('studio:backdrop-scale', payload.backdropScale);
      }
      if (payload.backdropWidth !== undefined) {
        this.stateStore.set('backdropWidth', payload.backdropWidth);
        this.eventBus.emit('studio:backdrop-width', payload.backdropWidth);
      }
      if (payload.backdropColor !== undefined) {
        this.stateStore.set('backdropColor', payload.backdropColor);
        this.eventBus.emit('studio:backdrop-color', payload.backdropColor);
      }
      if (payload.backdropRotation !== undefined) {
        this.stateStore.set('backdropRotation', payload.backdropRotation);
        this.eventBus.emit('studio:backdrop-rotation', payload.backdropRotation);
      }
      if (payload.backdropY !== undefined) {
        this.stateStore.set('backdropY', payload.backdropY);
        this.eventBus.emit('studio:backdrop-y', payload.backdropY);
      }
      if (payload.backdropMetalness !== undefined) {
        this.stateStore.set('backdropMetalness', payload.backdropMetalness);
        this.eventBus.emit('studio:backdrop-metalness', payload.backdropMetalness);
      }
      if (payload.backdropRoughness !== undefined) {
        this.stateStore.set('backdropRoughness', payload.backdropRoughness);
        this.eventBus.emit('studio:backdrop-roughness', payload.backdropRoughness);
      }
      if (
        payload.backdropSurfacePreset !== undefined ||
        payload.backdropSurfaceScale !== undefined ||
        payload.backdropSurfaceStrength !== undefined
      ) {
        if (payload.backdropSurfacePreset !== undefined) {
          this.stateStore.set('backdropSurfacePreset', payload.backdropSurfacePreset);
        }
        if (payload.backdropSurfaceScale !== undefined) {
          this.stateStore.set('backdropSurfaceScale', payload.backdropSurfaceScale);
        }
        if (payload.backdropSurfaceStrength !== undefined) {
          this.stateStore.set('backdropSurfaceStrength', payload.backdropSurfaceStrength);
        }
        const st = this.stateStore.getState();
        this.eventBus.emit('studio:backdrop-surface', {
          preset: st.backdropSurfacePreset ?? 'none',
          scale: st.backdropSurfaceScale ?? 1,
          strength: st.backdropSurfaceStrength ?? 1,
        });
      }
      if (payload.gridScale !== undefined) {
        this.stateStore.set('gridScale', payload.gridScale);
        this.eventBus.emit('studio:grid-scale', payload.gridScale);
      }
      if (payload.gridLineWidth !== undefined) {
        this.stateStore.set('gridLineWidth', payload.gridLineWidth);
        this.eventBus.emit('studio:grid-line-width', payload.gridLineWidth);
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
      }
      if (payload.lightsShadowQuality !== undefined) {
        this.stateStore.set('lightsShadowQuality', payload.lightsShadowQuality);
      }
      if (payload.lightsShadowSoftness !== undefined) {
        this.stateStore.set('lightsShadowSoftness', payload.lightsShadowSoftness);
      }
      if (payload.lightsShadowColor !== undefined) {
        this.stateStore.set('lightsShadowColor', payload.lightsShadowColor);
      }
      if (payload.lightsShadowOpacity !== undefined) {
        this.stateStore.set('lightsShadowOpacity', payload.lightsShadowOpacity);
      }
      if (payload.lightsShadowContactOffset !== undefined) {
        this.stateStore.set(
          'lightsShadowContactOffset',
          payload.lightsShadowContactOffset,
        );
      }
      if (payload.lightsShadowNormalBias !== undefined) {
        this.stateStore.set('lightsShadowNormalBias', payload.lightsShadowNormalBias);
      }
      if (payload.lightsShadowTwoSided !== undefined) {
        this.stateStore.set('lightsShadowTwoSided', payload.lightsShadowTwoSided);
      }
      if (
        payload.lightsCastShadows !== undefined
        || payload.lightsShadowQuality !== undefined
        || payload.lightsShadowSoftness !== undefined
        || payload.lightsShadowColor !== undefined
        || payload.lightsShadowOpacity !== undefined
        || payload.lightsShadowContactOffset !== undefined
        || payload.lightsShadowNormalBias !== undefined
        || payload.lightsShadowTwoSided !== undefined
      ) {
        this.eventBus.emit('lights:shadow-settings', {
          castShadows: payload.lightsCastShadows,
          quality: payload.lightsShadowQuality,
          softness: payload.lightsShadowSoftness,
          color: payload.lightsShadowColor,
          opacity: payload.lightsShadowOpacity ?? 0.25,
          contactOffset: payload.lightsShadowContactOffset,
          normalBias: payload.lightsShadowNormalBias,
          twoSided: payload.lightsShadowTwoSided,
        });
      }

      if (payload.gobo !== undefined) {
        const gobo = payload.gobo ?? {};
        this.stateStore.batch(() => {
          if (gobo.enabled !== undefined) this.stateStore.set('gobo.enabled', !!gobo.enabled);
          if (gobo.panelOpen !== undefined) this.stateStore.set('gobo.panelOpen', !!gobo.panelOpen);
          if (gobo.texture !== undefined) this.stateStore.set('gobo.texture', gobo.texture);
          if (gobo.softness !== undefined) this.stateStore.set('gobo.softness', gobo.softness);
          if (gobo.scale !== undefined) {
            const uiScale = normalizeStoredGoboScale(gobo.scale, gobo.scaleSpace);
            this.stateStore.set('gobo.scale', uiScale);
            this.stateStore.set('gobo.scaleSpace', 'ui');
          }
          if (gobo.rotation !== undefined) this.stateStore.set('gobo.rotation', gobo.rotation);
        });
        if (gobo.texture !== undefined) {
          this.eventBus.emit('lights:gobo-texture', gobo.texture);
        }
        if (gobo.softness !== undefined) {
          this.eventBus.emit('lights:gobo-softness', gobo.softness);
        }
        if (gobo.scale !== undefined) {
          this.eventBus.emit('lights:gobo-scale', this.stateStore.getState().gobo?.scale);
        }
        if (gobo.rotation !== undefined) {
          this.eventBus.emit('lights:gobo-rotation', gobo.rotation);
        }
        if (gobo.enabled !== undefined) {
          this.eventBus.emit('lights:gobo-enabled', !!gobo.enabled);
        }
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
        if (payload.camera.lensFocalMm !== undefined) {
          this.stateStore.set('camera.lensFocalMm', payload.camera.lensFocalMm);
        }
        if (payload.camera.lensSensorId !== undefined) {
          this.stateStore.set('camera.lensSensorId', payload.camera.lensSensorId);
        }
        if (payload.camera.tilt !== undefined) {
          this.stateStore.set('camera.tilt', payload.camera.tilt);
          this.eventBus.emit('camera:tilt', payload.camera.tilt);
        }
        if (payload.camera.autoOrbit !== undefined) {
          this.stateStore.set('camera.autoOrbit', payload.camera.autoOrbit);
          this.eventBus.emit('camera:auto-orbit', payload.camera.autoOrbit);
        }
        if (payload.camera.handheld !== undefined) {
          let h = payload.camera.handheld;
          if (h === 'medium') h = 'high';
          this.stateStore.set('camera.handheld', h);
          this.eventBus.emit('camera:handheld', h);
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
          this.eventBus.emit(
            'render:shadows',
            cameraShadowsUiToShader(payload.camera.shadows),
          );
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
        if (payload.camera.vignetteEnabled !== undefined) {
          this.stateStore.set('camera.vignetteEnabled', !!payload.camera.vignetteEnabled);
        }
        if (payload.camera.vignette !== undefined) {
          this.stateStore.set('camera.vignette', payload.camera.vignette);
        }
        if (payload.camera.vignetteColor !== undefined) {
          this.stateStore.set('camera.vignetteColor', payload.camera.vignetteColor);
        }
        if (payload.camera.compositionGridEnabled !== undefined) {
          this.stateStore.set(
            'camera.compositionGridEnabled',
            !!payload.camera.compositionGridEnabled,
          );
          this.eventBus.emit(
            'camera:composition-grid',
            !!payload.camera.compositionGridEnabled,
          );
        }
        if (payload.camera.compositionGuidesInverted !== undefined) {
          this.stateStore.set(
            'camera.compositionGuidesInverted',
            !!payload.camera.compositionGuidesInverted,
          );
          this.eventBus.emit(
            'camera:composition-guides-inverted',
            !!payload.camera.compositionGuidesInverted,
          );
        }
        if (payload.camera.cinematicLetterbox219 !== undefined) {
          this.stateStore.set(
            'camera.cinematicLetterbox219',
            !!payload.camera.cinematicLetterbox219,
          );
          this.eventBus.emit(
            'camera:cinematic-letterbox-219',
            !!payload.camera.cinematicLetterbox219,
          );
        }
        if (payload.camera.isometric !== undefined) {
          this.stateStore.set('camera.isometric', payload.camera.isometric);
          this.eventBus.emit('camera:isometric', payload.camera.isometric);
        }
        if (payload.camera.clipPlanes !== undefined) {
          this.stateStore.set('camera.clipPlanes', payload.camera.clipPlanes);
          this.eventBus.emit('camera:clip-planes');
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
        this.uiHelper?.renderControls?.syncDofUiState?.(dof);
      }
      if (payload.bloom) {
        this.stateStore.set('bloom', payload.bloom);
        this.eventBus.emit('render:bloom', payload.bloom);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor', 'bloomQuality'],
            !isBloomTuningActive(this.stateStore.getState()),
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
        const ab = mergeAberrationSettings(payload.aberration);
        this.stateStore.set('aberration', ab);
        this.eventBus.emit('render:aberration', ab);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['aberrationAmount'],
            !payload.aberration.enabled,
          );
        }
      }
      if (payload.ambientOcclusion) {
        const ao = sanitizeAmbientOcclusion(payload.ambientOcclusion);
        this.stateStore.set('ambientOcclusion', ao);
        this.eventBus.emit('render:ambient-occlusion', ao);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            [
              'ambientOcclusionIntensity',
              'ambientOcclusionRadius',
              'ambientOcclusionColor',
              'ambientOcclusionQuality',
            ],
            !ao.enabled,
          );
        }
      }
      if (payload.lensDirt) {
        this.stateStore.set('lensDirt', payload.lensDirt);
        this.eventBus.emit('render:lens-dirt', payload.lensDirt);
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            ['lensDirtStrength', 'lensDirtTintColor'],
            !payload.lensDirt.enabled,
          );
        }
      }
      if (payload.fisheye) {
        this.stateStore.set('fisheye', payload.fisheye);
        this.eventBus.emit('camera:fisheye');
        if (this.uiHelper?.setEffectControlsDisabled) {
          this.uiHelper.setEffectControlsDisabled(
            [
              'fisheyeHorizontalFOV',
              'fisheyeStrength',
              'fisheyeCylindricalRatio',
            ],
            !payload.fisheye.enabled,
          );
        }
      }
      if (payload.colorChecker !== undefined) {
        const base = this.stateStore.getDefaults().colorChecker;
        this.stateStore.set('colorChecker', {
          ...base,
          ...(payload.colorChecker && typeof payload.colorChecker === 'object'
            ? payload.colorChecker
            : {}),
        });
        this.eventBus.emit('scene:color-checker');
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
      if (payload.creativeLookSectionOpen !== undefined) {
        this.stateStore.set(
          'creativeLookSectionOpen',
          !!payload.creativeLookSectionOpen,
        );
      }
      if (payload.background !== undefined) {
        this.stateStore.set('background', payload.background);
        this.eventBus.emit('scene:background', payload.background);
      }
      if (payload.backgroundSolidEnabled !== undefined) {
        this.stateStore.set('backgroundSolidEnabled', !!payload.backgroundSolidEnabled);
        this.eventBus.emit('scene:background-solid-enabled', !!payload.backgroundSolidEnabled);
      }
      if (payload.backgroundGradient !== undefined) {
        this.stateStore.set('backgroundGradient', payload.backgroundGradient);
        this.eventBus.emit('scene:background-gradient', payload.backgroundGradient);
      }
      if (payload.backgroundImage !== undefined) {
        this.stateStore.set('backgroundImage', payload.backgroundImage);
        this.eventBus.emit('scene:background-image', payload.backgroundImage);
      }

      // Apply vignette LAST - after all other settings to ensure it's not overridden
      const finalState = this.stateStore.getState();
      const defaultCam = this.stateStore.getDefaults().camera ?? {};
      const fsCam = finalState.camera ?? {};
      const vignetteIntensity = effectiveVignetteIntensity(fsCam, defaultCam);
      const vignetteColor = fsCam.vignetteColor ?? '#080808';
      this.eventBus.emit('render:vignette', vignetteIntensity);
      this.eventBus.emit('render:vignette-color', vignetteColor);
      if (this.uiHelper?.setEffectControlsDisabled) {
        this.uiHelper.setEffectControlsDisabled(
          ['vignetteIntensity', 'vignetteColor'],
          !isVignetteUiEnabled(fsCam),
        );
      }
      // Re-emit on next frame to ensure post-processing uniforms update even if pipeline reinitialized
      requestAnimationFrame(() => {
        const cam = this.stateStore.getState().camera ?? {};
        this.eventBus.emit(
          'render:vignette',
          effectiveVignetteIntensity(cam, defaultCam),
        );
        this.eventBus.emit(
          'render:vignette-color',
          cam.vignetteColor ?? '#080808',
        );
      });

      this.eventBus.emit('render:apply-performance');
      });

      this.eventBus.emit('scene:settings-restored');

      if (this.uiHelper?.restoreFontExtrudeSettings) {
        await this.uiHelper.restoreFontExtrudeSettings(this.stateStore.getState().fontExtrude);
      }

      return { success: true, message: 'Scene settings applied' };
      } finally {
        this.eventBus.emit('scene:batch-apply-end');
      }
    } catch (error) {
      console.error('Error applying pasted scene settings:', error);
      return { success: false, message: 'Invalid pasted scene settings — could not parse JSON' };
    }
  }
}

