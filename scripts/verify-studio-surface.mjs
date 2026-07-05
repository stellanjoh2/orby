/**
 * One-shot browser check: infinity cove surface hooks + shader inject.
 * Run: node scripts/verify-studio-surface.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.ORBY_VERIFY_URL ?? 'http://127.0.0.1:8000/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120_000 });

  const result = await page.evaluate(async () => {
    const scene = window.orby?.scene;
    if (!scene) return { ok: false, error: 'window.orby.scene missing' };

    await scene.enterBlankStudio({ skipSound: true });

    const facade = scene.studioGroundFacade;
    facade.setInfinityCoveEnabled(true);
    facade.setInfinityCoveSurface({
      preset: 'galvanizedSteel',
      scale: 0.2,
      strength: 2,
    });

    if (scene.renderer?.compile && scene.scene && scene.camera) {
      scene.renderer.compile(scene.scene, scene.camera);
    }
    scene.requestRender?.();

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const mat = scene.groundController?.infinityCove?.mesh?.material;
    if (!mat) return { ok: false, error: 'infinity cove material missing' };

    const ud = mat.userData ?? {};
    const surfaceHook = ud.svgExtrudeProceduralOnBeforeCompile;
    const shadowHook = ud.shadowTintOnBeforeCompile;
    const outerIsShadow = mat.onBeforeCompile === shadowHook;
    const shadowWrapsSurface =
      ud.orbyShadowTint?.previousOnBeforeCompile === surfaceHook;

    const mockFs = `#include <common>
#include <roughnessmap_fragment>
#include <metalnessmap_fragment>
#include <normal_fragment_begin>
#include <normal_fragment_maps>
#include <opaque_fragment>`;
    const mock = {
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: mockFs,
      uniforms: {},
    };
    if (typeof mat.onBeforeCompile === 'function') {
      mat.onBeforeCompile(mock);
    }

    return {
      ok: true,
      patched: !!ud.svgExtrudeProceduralPatched,
      preset: ud.svgExtrudeSurfacePresetId,
      normalStrength: ud.svgExtrudeProceduralUniforms?.uOrbyNormalStrength?.value,
      hasNormalMap: !!ud.svgExtrudeProceduralUniforms?.uOrbyNormalMap?.value,
      outerIsShadow,
      shadowWrapsSurface,
      hasSurfInject: /orby_svg_surf/.test(mock.fragmentShader),
      hasNormInject: /orby_svg_norm/.test(mock.fragmentShader),
      cacheKey: typeof mat.customProgramCacheKey === 'function'
        ? mat.customProgramCacheKey()
        : null,
    };
  });

  console.log(JSON.stringify(result, null, 2));

  const pass =
    result.ok
    && result.patched
    && result.preset === 'galvanizedSteel'
    && result.shadowWrapsSurface
    && result.hasSurfInject
    && result.hasNormInject;

  process.exitCode = pass ? 0 : 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
