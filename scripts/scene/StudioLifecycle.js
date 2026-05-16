/**
 * Deferred WebGL studio boot / full GPU teardown for the marketing home page.
 * The studio only exists while a session is active (model loaded); returning home shuts it down.
 */

/**
 * @param {import('../SceneManager.js').SceneManager} scene
 */
export async function ensureStudioActive(scene) {
  if (scene.isStudioReady) return;
  if (!scene._studioBootPromise) {
    scene._studioBootPromise = scene._bootstrapStudio().finally(() => {
      scene._studioBootPromise = null;
    });
  }
  await scene._studioBootPromise;
}

/**
 * @param {import('../SceneManager.js').SceneManager} scene
 */
export async function shutdownStudio(scene) {
  if (scene._studioBootPromise) {
    try {
      await scene._studioBootPromise;
    } catch (err) {
      console.warn('[Orby] Studio boot failed during shutdown', err);
    }
  }
  if (!scene.isStudioReady) return;
  scene._teardownStudioGpu();
}
