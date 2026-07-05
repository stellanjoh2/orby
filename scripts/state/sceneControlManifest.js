/**
 * Scene-side control manifest — maps EventBus events to SceneManager apply methods.
 * Complex handlers (multi-step, async, conditional) stay in EventManager.js.
 */

/** @param {*} payload */
export function parseOverlayTogglePayload(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    Object.prototype.hasOwnProperty.call(payload, 'enabled')
  ) {
    return { enabled: !!payload.enabled, animate: !!payload.animate };
  }
  return { enabled: !!payload, animate: false };
}

/** @type {object[]} */
export const SCENE_CONTROL_MANIFEST = [
  // ── Mesh / transform ──────────────────────────────────────────────────────
  { event: 'mesh:scale', apply: 'setScale' },
  { event: 'mesh:xOffset', apply: 'setXOffset' },
  { event: 'mesh:yOffset', apply: 'setYOffset' },
  { event: 'mesh:zOffset', apply: 'setZOffset' },
  { event: 'mesh:rotationX', apply: { controller: 'transformController', method: 'setRotationX' } },
  { event: 'mesh:rotationY', apply: { controller: 'transformController', method: 'setRotationY' } },
  { event: 'mesh:rotationZ', apply: { controller: 'transformController', method: 'setRotationZ' } },
  { event: 'mesh:auto-rotate', apply: 'setAutoRotateSpeed' },
  { event: 'mesh:auto-rotate-direction', apply: 'setAutoRotateDirection' },
  {
    event: 'mesh:clay-color',
    apply: { controller: 'materialController', method: 'setClaySettings' },
    mapArg: (color) => ({ color }),
  },
  {
    event: 'mesh:material-brightness',
    apply: { controller: 'materialController', method: 'setMaterialBrightness' },
  },
  {
    event: 'mesh:material-metalness',
    apply: { controller: 'materialController', method: 'setMaterialMetalness' },
  },
  {
    event: 'mesh:material-roughness',
    apply: { controller: 'materialController', method: 'setMaterialRoughness' },
  },
  {
    event: 'mesh:material-emissive',
    apply: { controller: 'materialController', method: 'setMaterialEmissive' },
  },
  {
    event: 'mesh:diffuse-brightness',
    apply: { controller: 'materialController', method: 'setMaterialBrightness' },
  },
  { event: 'mesh:map-inspect-preview', apply: 'setMapInspectPreview' },
  { event: 'mesh:map-inspect-clear', apply: 'clearMapInspectPreview', noArg: true },
  { event: 'mesh:svg-extrude-depth', apply: 'setSvgExtrudeDepth' },
  { event: 'mesh:svg-extrude-normal-angle', apply: 'setSvgExtrudeNormalAngle' },
  { event: 'mesh:svg-extrude-hard-edge-angle', apply: 'setSvgExtrudeHardEdgeAngle' },
  { event: 'mesh:svg-extrude-bevel', apply: 'setSvgExtrudeBevel', defaultArg: {} },
  {
    event: 'mesh:font-extrude-bevel-type',
    apply: 'setFontExtrudeBevelType',
    mapArg: (payload) => payload?.type ?? payload,
  },
  { event: 'mesh:svg-extrude-detail', apply: 'setSvgExtrudeDetail' },
  { event: 'mesh:svg-extrude-color-depths', apply: 'setSvgExtrudeColorDepths' },
  { event: 'mesh:svg-extrude-color-depth', apply: 'setSvgExtrudeColorDepth' },
  { event: 'mesh:svg-extrude-color-offsets', apply: 'setSvgExtrudeColorOffsets' },
  { event: 'mesh:svg-extrude-color-offset', apply: 'setSvgExtrudeColorOffset' },
  { event: 'mesh:svg-extrude-color-replacements', apply: 'setSvgExtrudeColorReplacements' },
  { event: 'mesh:svg-extrude-color-replacement', apply: 'setSvgExtrudeColorReplacement' },
  {
    event: 'mesh:svg-extrude-color-reset',
    apply: 'resetSvgExtrudeColor',
    mapArg: (payload) => payload?.color,
  },
  { event: 'mesh:svg-extrude-flip-direction', apply: 'setSvgExtrudeFlipDirection' },
  { event: 'mesh:svg-extrude-surface', apply: 'setSvgExtrudeSurface', defaultArg: {} },
  { event: 'mesh:object-surface', apply: 'setObjectSurface', defaultArg: {} },
  { event: 'mesh:reverse-normals', apply: 'setReverseNormals' },
  { event: 'mesh:stl-smoothing', apply: 'applyImportSmoothingFromState', noArg: true },
  { event: 'mesh:recenter-pivot', apply: 'recenterPivot', defaultArg: {} },
  { event: 'mesh:object-hidden', apply: 'setObjectHidden', coerce: 'bool' },
  { event: 'mesh:uv-checker', apply: 'setUvCheckerEnabled' },
  { event: 'mesh:uv-checker-scale', apply: 'setUvCheckerScale' },
  { event: 'mesh:uv-checker-style', apply: 'setUvCheckerStyle' },
  { event: 'mesh:normal-view', apply: 'setNormalViewEnabled' },
  { event: 'mesh:normal-view-mode', apply: 'setNormalViewMode' },
  { event: 'mesh:transparency-fix', apply: 'applyTransparencyFixFromState', noArg: true },
  { event: 'mesh:glass-appearance', apply: 'applyGlassAppearanceFromState', noArg: true },
  { event: 'mesh:svg-extrude-color-override', apply: 'setSvgExtrudeColorOverride' },
  {
    event: 'mesh:wireframe-always-on',
    apply: { controller: 'materialController', method: 'setWireframeSettings' },
    mapArg: (value) => ({ alwaysOn: value }),
    afterApply: (scene) => scene.setSceneGeometryWireframe(false),
  },
  {
    event: 'mesh:wireframe-color',
    apply: { controller: 'materialController', method: 'setWireframeSettings' },
    mapArg: (value) => ({ color: value }),
  },
  {
    event: 'mesh:wireframe-only-visible-faces',
    apply: { controller: 'materialController', method: 'setWireframeSettings' },
    mapArg: (value) => ({ onlyVisibleFaces: value }),
  },
  {
    event: 'mesh:wireframe-hide-mesh',
    apply: { controller: 'materialController', method: 'setWireframeSettings' },
    mapArg: (value) => ({ hideMesh: value }),
  },
  {
    event: 'mesh:wireframe-thickness',
    apply: { controller: 'materialController', method: 'setWireframeSettings' },
    mapArg: (value) => ({ thickness: value }),
  },
  {
    event: 'mesh:wireframe-opacity',
    apply: { controller: 'materialController', method: 'setWireframeSettings' },
    mapArg: (value) => ({ opacity: value }),
  },
  { event: 'mesh:clay-normal-map', apply: 'setClayNormalMap' },

  {
    event: 'mesh:fbx-map-slot',
    apply: 'applyFbxMapSlot',
  },
  { event: 'mesh:fbx-map-clear', apply: 'clearFbxMapSlot' },
  {
    event: 'mesh:fbx-material-tuning',
    apply: 'setFbxMaterialTuning',
    mapArg: (payload) => [payload?.materialKey ?? '', payload?.patch ?? {}],
    spreadArgs: true,
  },
  {
    event: 'mesh:fbx-apply-tuning-all',
    apply: 'applyFbxTuningToAllMaterials',
    mapArg: (payload) => payload?.materialKey ?? '',
  },
  { event: 'mesh:fbx-rescan-folder', apply: 'rescanFbxMapSlotTextures', noArg: true },
  {
    event: 'mesh:fbx-restore-tuning',
    apply: { controller: 'materialController', method: 'applyFbxMapSlotsTuningFromState' },
    noArg: true,
    afterApply: (scene) => scene.eventBus.emit('scene:fbx-tuning-changed'),
  },
  {
    event: 'mesh:fbx-active-material',
    apply: 'setFbxActiveMaterial',
    mapArg: (payload) => {
      const key = payload?.materialKey ?? payload;
      return typeof key === 'string' ? key : '';
    },
  },
  {
    event: 'mesh:creative-look-live',
    apply: { controller: 'materialController', method: 'syncCreativeLookLiveFromStore' },
    noArg: true,
  },
  {
    event: 'mesh:reset-transform',
    apply: { controller: 'transformController', method: 'setRotationY' },
    defaultArg: 0,
  },
  { event: 'mesh:move-widget-enabled', apply: 'setMoveWidgetEnabled', coerce: 'bool' },
  { event: 'mesh:rotate-widget-enabled', apply: 'setRotateWidgetEnabled', coerce: 'bool' },
  { event: 'mesh:scale-widget-enabled', apply: 'setScaleWidgetEnabled', coerce: 'bool' },

  // ── Camera ────────────────────────────────────────────────────────────────
  { event: 'camera:preset', apply: 'applyCameraPreset' },
  { event: 'camera:auto-orbit', apply: 'setCameraAutoOrbit' },
  { event: 'camera:handheld', apply: 'setCameraHandheld' },
  {
    event: 'camera:tilt',
    apply: { controller: 'cameraController', method: 'setTilt' },
  },
  { event: 'camera:isometric', apply: 'applyIsometricCamera' },
  {
    event: 'camera:world-position',
    apply: { controller: 'cameraController', method: 'setWorldPosition' },
    guard: (position) => !!position,
    spreadArgs: true,
    mapArg: (position) => [position.x, position.y, position.z],
  },
  {
    event: 'camera:distance',
    apply: { controller: 'cameraController', method: 'setDistance' },
  },
  { event: 'camera:composition-guides-inverted', apply: { controller: 'viewportFramingOverlays', method: 'setCompositionGuidesInverted' }, coerce: 'bool' },
  {
    event: 'camera:composition-grid',
    apply: 'setCompositionGridOverlayVisible',
    mapArg: (payload) => {
      const parsed = parseOverlayTogglePayload(payload);
      return [parsed.enabled, { animate: parsed.animate }];
    },
    spreadArgs: true,
  },
  {
    event: 'camera:composition-portrait-crop-guide',
    apply: 'setCompositionPortraitCropGuideVisible',
    mapArg: (enabled, scene) => {
      const gridOn = !!scene.stateStore?.getState?.()?.camera?.compositionGridEnabled;
      return !!enabled && gridOn;
    },
    coerce: 'bool',
  },
  {
    event: 'camera:cinematic-letterbox-219',
    apply: 'setCinematicLetterbox219Visible',
    mapArg: (payload) => {
      const parsed = parseOverlayTogglePayload(payload);
      return [parsed.enabled, { animate: parsed.animate }];
    },
    spreadArgs: true,
  },
  { event: 'camera:fov', apply: 'syncPerspectiveCameraFovAndLens', noArg: true },
  { event: 'camera:fisheye', apply: 'syncPerspectiveCameraFovAndLens', noArg: true },
  { event: 'camera:focus', apply: 'focusCameraOnCurrentModel', noArg: true },
  {
    event: 'camera:reset',
    apply: { controller: 'cameraController', method: 'resetWorldPose' },
    noArg: true,
  },
  { event: 'render:look-filter', apply: 'applyLookFilter' },

  // ── Studio / HDRI ─────────────────────────────────────────────────────────
  { event: 'studio:hdri', apply: 'setHdriPreset' },
  { event: 'studio:hdri-upload', apply: 'loadCustomHdri' },
  { event: 'studio:hdri-clear-custom', apply: 'clearCustomHdri', noArg: true },
  { event: 'studio:hdri-enabled', apply: 'setHdriEnabled' },
  { event: 'studio:hdri-strength', apply: 'setHdriStrength' },
  { event: 'studio:hdri-blurriness', apply: 'setHdriBlurriness' },
  { event: 'studio:hdri-rotation', apply: 'setHdriRotation' },
  { event: 'studio:hdri-background', apply: 'setHdriBackground' },
  { event: 'studio:hdri-receive-shadows-ao', apply: 'setHdriReceiveShadowsAo' },
  // Pure lens-flare pass-throughs route straight to the controller (no SceneManager glue).
  { event: 'studio:lens-flare-enabled', apply: { controller: 'lensFlareController', method: 'setEnabled' } },
  { event: 'studio:lens-flare-rotation', apply: 'setLensFlareRotation' },
  { event: 'studio:lens-flare-height', apply: 'setLensFlareHeight' },
  { event: 'studio:lens-flare-color', apply: { controller: 'lensFlareController', method: 'setColor' } },
  { event: 'studio:lens-flare-quality', apply: { controller: 'lensFlareController', method: 'setQuality' } },
  { event: 'studio:lens-flare-halo', apply: { controller: 'lensFlareController', method: 'setHaloIntensity' } },
  { event: 'studio:lens-flare-streak-length', apply: { controller: 'lensFlareController', method: 'setStreakLength' } },
  { event: 'studio:lens-flare-sun-disc-scale', apply: { controller: 'lensFlareController', method: 'setSunDiscScale' } },
  { event: 'studio:lens-flare-sun-disc-blur', apply: { controller: 'lensFlareController', method: 'setSunDiscBlur' } },
  { event: 'studio:lens-flare-sun-disc-color', apply: { controller: 'lensFlareController', method: 'setSunDiscColor' } },
  { event: 'studio:lens-flare-disc-glow-intensity', apply: { controller: 'lensFlareController', method: 'setDiscGlowIntensity' } },
  { event: 'studio:lens-flare-disc-glow-size', apply: { controller: 'lensFlareController', method: 'setDiscGlowSize' } },
  { event: 'studio:lens-flare-disc-glow-color', apply: { controller: 'lensFlareController', method: 'setDiscGlowColor' } },
  { event: 'studio:lens-flare-anamorphic-bloom', apply: 'syncAnamorphicBloomFromState', noArg: true },
  // Pure god-rays pass-throughs route straight to the controller.
  { event: 'studio:god-rays-enabled', apply: { controller: 'godRaysController', method: 'setEnabled' } },
  { event: 'studio:god-rays-color', apply: { controller: 'godRaysController', method: 'setColor' } },
  { event: 'studio:god-rays-light-scale', apply: { controller: 'godRaysController', method: 'setLightScale' } },
  { event: 'studio:god-rays-opacity', apply: { controller: 'godRaysController', method: 'setOpacity' } },
  { event: 'studio:god-rays-density', apply: { controller: 'godRaysController', method: 'setDensity' } },
  { event: 'studio:god-rays-decay', apply: { controller: 'godRaysController', method: 'setDecay' } },
  { event: 'studio:god-rays-weight', apply: { controller: 'godRaysController', method: 'setWeight' } },
  { event: 'studio:god-rays-exposure', apply: { controller: 'godRaysController', method: 'setExposure' } },
  { event: 'studio:god-rays-clamp-max', apply: { controller: 'godRaysController', method: 'setClampMax' } },
  { event: 'studio:god-rays-blur', apply: { controller: 'godRaysController', method: 'setBlur' } },
  { event: 'studio:lens-flare-spin-during-orbit', apply: 'setLensFlareSpinDuringOrbit' },
  {
    event: 'studio:lens-flare-key-light-connected',
    apply: 'setLensFlareKeyLightConnected',
    coerce: 'bool',
  },
  {
    event: 'studio:lens-flare-key-light-sync',
    apply: '_syncKeyLightFromLensFlareIfConnected',
    noArg: true,
  },
  { event: 'studio:god-rays-quality', apply: { controller: 'godRaysController', method: 'setQuality' } },
  { event: 'studio:god-rays-strength', apply: { controller: 'godRaysController', method: 'setStrength' } },
  { event: 'studio:god-rays-length', apply: { controller: 'godRaysController', method: 'setLength' } },
  { event: 'studio:god-rays-softness', apply: { controller: 'godRaysController', method: 'setSoftness' } },
  { event: 'studio:god-rays-threshold', noOp: true },

  // ── Render / grading (pure pass-throughs → postPipeline) ─────────────────
  { event: 'render:contrast', apply: { controller: 'postPipeline', method: 'setContrast' } },
  { event: 'render:saturation', apply: { controller: 'postPipeline', method: 'setSaturation' } },
  { event: 'render:clarity', apply: { controller: 'postPipeline', method: 'setClarity' } },
  { event: 'render:fade', apply: { controller: 'postPipeline', method: 'setFade' } },
  { event: 'render:sharpness', apply: { controller: 'postPipeline', method: 'setSharpness' } },
  { event: 'render:tone-curve', apply: { controller: 'postPipeline', method: 'setToneCurve' } },
  { event: 'render:temperature', apply: { controller: 'postPipeline', method: 'setTemperature' } },
  { event: 'render:tint', apply: { controller: 'postPipeline', method: 'setTint' } },
  { event: 'render:highlights', apply: { controller: 'postPipeline', method: 'setHighlights' } },
  { event: 'render:shadows', apply: { controller: 'postPipeline', method: 'setShadows' } },
  { event: 'render:vignette', apply: { controller: 'postPipeline', method: 'setVignette' } },
  { event: 'render:vignette-color', apply: { controller: 'postPipeline', method: 'setVignetteColor' } },
  { event: 'render:tone-mapping', apply: { controller: 'postPipeline', method: 'setToneMapping' } },
  {
    event: 'render:histogram-enabled',
    apply: 'setHistogramEnabled',
  },
  {
    event: 'dof:reset-smooth-focus',
    apply: { controller: 'dofAutofocusController', method: 'resetSmoothFocus' },
  },
  { event: 'render:apply-performance', apply: 'applyRenderQualitySettings', noArg: true },
  { event: 'render:anti-aliasing', apply: 'setAntiAliasing' },

  // ── Camera / post-FX (slice settings — complex apply stays on SceneManager) ─
  {
    event: 'render:dof',
    apply: 'updateDof',
    afterApply: (scene) => scene.applyRenderQualityVisualOverrides(),
  },
  {
    event: 'render:bloom',
    apply: 'updateBloom',
    afterApply: (scene) => scene.applyRenderQualityVisualOverrides(),
  },
  { event: 'render:grain', apply: { controller: 'postPipeline', method: 'updateGrain' } },
  { event: 'render:aberration', apply: { controller: 'postPipeline', method: 'updateAberration' } },
  { event: 'render:ambient-occlusion', apply: 'updateAmbientOcclusion' },
  {
    event: 'render:fresnel',
    apply: { controller: 'materialController', method: 'setFresnelSettings' },
  },
  {
    event: 'render:lens-dirt',
    apply: { controller: 'lensDirtController', method: 'updateSettings' },
  },

  // ── Ground / podium / backdrop ────────────────────────────────────────────
  { event: 'studio:ground-solid', apply: 'setGroundSolid' },
  { event: 'studio:ground-wire', apply: { controller: 'groundController', method: 'setWireEnabled' } },
  { event: 'studio:ground-solid-color', apply: { controller: 'groundController', method: 'setSolidColor' } },
  { event: 'studio:ground-wire-color', apply: { controller: 'groundController', method: 'setWireColor' } },
  { event: 'studio:ground-wire-opacity', apply: { controller: 'groundController', method: 'setWireOpacity' } },
  { event: 'studio:ground-y', apply: 'setGroundY' },
  { event: 'studio:grid-y', apply: { controller: 'groundController', method: 'setGridY' } },
  { event: 'studio:base-scale', apply: 'setBaseScale' },
  { event: 'studio:base-metalness', apply: { controller: 'groundController', method: 'setBaseMetalness' } },
  { event: 'studio:base-roughness', apply: { controller: 'groundController', method: 'setBaseRoughness' } },
  { event: 'studio:base-reflection', apply: { controller: 'groundController', method: 'setBaseReflection' } },
  { event: 'studio:base-clearcoat', apply: { controller: 'groundController', method: 'setBaseClearcoat' } },
  { event: 'studio:base-surface', apply: 'setBaseSurface', defaultArg: {} },
  { event: 'studio:base-glass-surface', apply: 'setBaseGlassSurface' },
  { event: 'studio:base-glass-blur', apply: { controller: 'groundController', method: 'setBaseGlassBlur' } },
  { event: 'studio:base-glass-amount', apply: { controller: 'groundController', method: 'setBaseGlassAmount' } },
  { event: 'studio:base-glass-brightness', apply: { controller: 'groundController', method: 'setBaseGlassBrightness' } },
  { event: 'studio:backdrop-enabled', apply: 'setBackdropEnabled' },
  { event: 'studio:backdrop-scale', apply: 'setBackdropScale' },
  { event: 'studio:backdrop-width', apply: 'setBackdropWidth' },
  { event: 'studio:backdrop-color', apply: { controller: 'groundController', method: 'setBackdropColor' } },
  { event: 'studio:backdrop-rotation', apply: 'setBackdropRotation' },
  {
    event: 'studio:backdrop-y',
    apply: 'setBackdropY',
    mapArg: (value) => [value, { updateState: false }],
    spreadArgs: true,
  },
  { event: 'studio:backdrop-metalness', apply: { controller: 'groundController', method: 'setBackdropMetalness' } },
  { event: 'studio:backdrop-roughness', apply: { controller: 'groundController', method: 'setBackdropRoughness' } },
  { event: 'studio:backdrop-surface', apply: 'setBackdropSurface', defaultArg: {} },
  { event: 'studio:backdrop-snap', apply: 'snapBackdropToBottom', noArg: true },
  { event: 'studio:infinity-cove-enabled', apply: 'setInfinityCoveEnabled' },
  { event: 'studio:infinity-cove-scale', apply: 'setInfinityCoveScale' },
  { event: 'studio:infinity-cove-width', apply: 'setInfinityCoveWidth' },
  {
    event: 'studio:infinity-cove-color',
    apply: { controller: 'groundController', method: 'setInfinityCoveColor' },
  },
  { event: 'studio:infinity-cove-rotation', apply: 'setInfinityCoveRotation' },
  {
    event: 'studio:infinity-cove-y',
    apply: 'setInfinityCoveY',
    mapArg: (value) => [value, { updateState: false }],
    spreadArgs: true,
  },
  {
    event: 'studio:infinity-cove-metalness',
    apply: { controller: 'groundController', method: 'setInfinityCoveMetalness' },
  },
  {
    event: 'studio:infinity-cove-roughness',
    apply: { controller: 'groundController', method: 'setInfinityCoveRoughness' },
  },
  { event: 'studio:infinity-cove-surface', apply: 'setInfinityCoveSurface', defaultArg: {} },
  { event: 'studio:infinity-cove-snap', apply: 'snapInfinityCoveToBottom', noArg: true },
  { event: 'studio:grid-scale', apply: { controller: 'groundController', method: 'setGridScale' } },
  { event: 'studio:grid-line-width', apply: { controller: 'groundController', method: 'setGridLineWidth' } },
  { event: 'studio:base-snap', apply: 'snapBaseToBottom', noArg: true },
  { event: 'studio:grid-snap', apply: 'snapGridToBottom', noArg: true },

  // ── Lights ────────────────────────────────────────────────────────────────
  { event: 'lights:master', apply: 'setLightsMaster' },
  { event: 'lights:enabled', apply: 'setLightsEnabled' },
  { event: 'lights:rotate', apply: 'setLightsRotation' },
  { event: 'lights:height', apply: 'setLightsHeight' },
  { event: 'lights:rig-scale', apply: 'setLightsRigScale' },
  { event: 'lights:auto-rotate', apply: 'setLightsAutoRotate' },
  { event: 'lights:show-indicators', apply: 'setShowLightIndicators' },
  { event: 'lights:show-falloff-indicators', apply: 'setShowLightFalloffIndicators' },
  { event: 'lights:cast-shadows', apply: 'setLightsCastShadows' },
  { event: 'lights:shadow-quality', apply: 'setLightsShadowQuality' },
  { event: 'lights:shadow-softness', apply: 'setLightsShadowSoftness' },
  { event: 'lights:shadow-color', apply: 'setLightsShadowColor' },
  { event: 'lights:shadow-opacity', apply: 'setLightsShadowOpacity' },
  { event: 'lights:shadow-contact-offset', apply: 'setLightsShadowContactOffset' },
  { event: 'lights:shadow-normal-bias', apply: 'setLightsShadowNormalBias' },
  { event: 'lights:shadow-two-sided', apply: 'setLightsShadowTwoSided' },
  { event: 'lights:shadow-settings', apply: 'setLightsShadowSettings' },
  { event: 'lights:gobo-softness', apply: 'setGoboSoftness' },
  { event: 'lights:gobo-scale', apply: 'setGoboScale' },
  { event: 'lights:gobo-rotation', apply: 'setGoboRotation' },

  // ── Scene / background ────────────────────────────────────────────────────
  {
    event: 'scene:background',
    apply: 'syncStudioBackgroundColor',
  },
  {
    event: 'scene:background-solid-enabled',
    apply: { controller: 'backgroundController', method: 'setSolidEnabled' },
  },
  {
    event: 'scene:background-gradient',
    apply: { controller: 'backgroundGradientController', method: 'setConfig' },
  },
  {
    event: 'scene:background-image',
    apply: { controller: 'backgroundImageController', method: 'setConfig' },
    afterApply: (scene, config) => {
      if (!config?.asset?.dataBase64) {
        scene.backgroundImageController?.setImage(null);
      }
    },
  },
  {
    event: 'scene:exposure',
    apply: { controller: 'autoExposureController', method: 'setManualExposure' },
    afterApply: (scene, value) => {
      scene.ui?.updateExposureDisplay?.(value);
      scene.lensDirtController?.updateExposureFactor();
    },
  },
  {
    event: 'scene:color-checker',
    apply: 'applyColorCheckerFromState',
    mapArg: (_, scene) => scene.stateStore.getState(),
  },
  {
    event: 'scene:color-checker-reference-shading',
    apply: 'applyColorCheckerReferenceShading',
    noArg: true,
  },
  { event: 'studio:background-image-upload', apply: 'loadCustomBackgroundImage' },
  {
    event: 'camera:auto-exposure',
    apply: { controller: 'autoExposureController', method: 'setEnabled' },
  },
  { event: 'camera:clip-planes', apply: 'syncCameraClipPlanes', defaultArg: {} },

  // ── Animation ─────────────────────────────────────────────────────────────
  {
    event: 'animation:toggle',
    apply: { controller: 'animationController', method: 'togglePlayback' },
    noArg: true,
  },
  {
    event: 'animation:clip-mode',
    apply: { controller: 'animationController', method: 'setClipPlaybackMode' },
    afterApply: (scene, mode) => {
      scene.stateStore.set('animation.clipPlaybackMode', mode === 'cycle' ? 'cycle' : 'loop');
    },
  },
  { event: 'animation:display-fps', apply: 'applyAnimationDisplayFps' },
  { event: 'animation:time-reference', apply: 'applyAnimationTimeReference', coerce: 'bool' },
  {
    event: 'animation:scrub',
    apply: { controller: 'animationController', method: 'scrub' },
  },
  {
    event: 'animation:select',
    apply: { controller: 'animationController', method: 'selectAnimation' },
  },
  {
    event: 'animation:speed',
    apply: { controller: 'animationController', method: 'setPlaybackSpeed' },
  },
  {
    event: 'animation:reverse',
    apply: { controller: 'animationController', method: 'setPlaybackReverse' },
  },
  { event: 'animation:show-bones', apply: 'setAnimationShowBones' },
  { event: 'animation:show-joint-names', apply: 'setAnimationShowJointNames' },
  { event: 'animation:joint-scale', apply: 'setAnimationJointScale' },
  { event: 'animation:bone-stroke-width', apply: 'setAnimationBoneStrokeWidth' },
  { event: 'animation:hide-mesh', apply: 'setAnimationHideMesh' },

  // ── Export (simple delegates) ─────────────────────────────────────────────
  { event: 'export:image', apply: 'exportImage' },
  { event: 'export:png', apply: 'exportPng' },
  { event: 'export:svg', apply: 'exportSvgSilhouette', noArg: true },
  { event: 'export:svg-color', apply: 'exportSvgColor', defaultArg: {}, mapArg: (p) => (p && typeof p === 'object' ? p : {}) },
  { event: 'export:svg-glb', apply: 'exportSvgGlb', noArg: true },
  { event: 'export:video-capture-preview', apply: 'captureExportPreviewFrame', defaultArg: {}, mapArg: (p) => (p && typeof p === 'object' ? p : {}) },
  { event: 'export:video', apply: 'exportVideo' },
  { event: 'export:video-camera-bookmark-save', apply: 'saveExportVideoCameraBookmark', noArg: true },
  {
    event: 'export:video-camera-bookmark-restore',
    apply: 'restoreExportVideoCameraBookmark',
    noArg: true,
  },
];

/** Lookup manifest entry by event name. */
export const SCENE_CONTROL_MANIFEST_BY_EVENT = Object.freeze(
  Object.fromEntries(SCENE_CONTROL_MANIFEST.map((entry) => [entry.event, entry])),
);
