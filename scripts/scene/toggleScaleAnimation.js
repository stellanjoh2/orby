/**
 * Shared scale-in/out timing for UI reveals (ColorChecker, podium, etc.).
 * In: ease-out expo + longer ms — readable settle. Out: ease-in cubic + shorter ms — crisp dismiss.
 */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export const SCALE_TOGGLE_IN_MS = 380;
export const SCALE_TOGGLE_OUT_MS = 250;

export function easeOutExpo(t) {
  return t <= 0 ? 0 : t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

export function easeInCubic(t) {
  return t * t * t;
}

/** Initial mutable state for {@link stepToggleScaleAnimation}. */
export function createToggleScaleContext() {
  return {
    prevEnabled: false,
    /** @type {'idle' | 'in' | 'out'} */
    phase: 'idle',
    start: 0,
    enterFrom: 0,
    exitFrom: 1,
  };
}

/**
 * @param {ReturnType<typeof createToggleScaleContext>} ctx
 * @param {number} now - `performance.now()`
 * @param {boolean} enabled - target on/off
 * @returns {{ animMul: number, visible: boolean, skipRest: boolean }}
 */
export function stepToggleScaleAnimation(ctx, now, enabled) {
  const Din = SCALE_TOGGLE_IN_MS;
  const Dout = SCALE_TOGGLE_OUT_MS;

  const sampleMul = () => {
    if (ctx.phase === 'in') {
      const t = Math.min(1, (now - ctx.start) / Din);
      return lerp(ctx.enterFrom, 1, easeOutExpo(t));
    }
    if (ctx.phase === 'out') {
      const t = Math.min(1, (now - ctx.start) / Dout);
      return ctx.exitFrom * (1 - easeInCubic(t));
    }
    return enabled ? 1 : 0;
  };

  if (enabled !== ctx.prevEnabled) {
    if (enabled) {
      let from = 0;
      if (ctx.phase === 'out') {
        from = sampleMul();
      } else if (ctx.phase === 'in') {
        const t = Math.min(1, (now - ctx.start) / Din);
        from = lerp(ctx.enterFrom, 1, easeOutExpo(t));
      }
      ctx.enterFrom = from;
      ctx.phase = 'in';
      ctx.start = now;
    } else {
      let m = 1;
      if (ctx.phase === 'in') {
        const t = Math.min(1, (now - ctx.start) / Din);
        m = lerp(ctx.enterFrom, 1, easeOutExpo(t));
      } else if (ctx.phase === 'out') {
        const t = Math.min(1, (now - ctx.start) / Dout);
        m = ctx.exitFrom * (1 - easeInCubic(t));
      }
      ctx.exitFrom = m;
      ctx.phase = 'out';
      ctx.start = now;
    }
  }

  let animMul = 1;
  let visible = true;

  if (ctx.phase === 'in') {
    const t = Math.min(1, (now - ctx.start) / Din);
    animMul = lerp(ctx.enterFrom, 1, easeOutExpo(t));
    if (t >= 1) ctx.phase = 'idle';
    visible = true;
  } else if (ctx.phase === 'out') {
    const t = Math.min(1, (now - ctx.start) / Dout);
    animMul = ctx.exitFrom * (1 - easeInCubic(t));
    if (t >= 1) {
      ctx.phase = 'idle';
      visible = false;
      animMul = 0;
    } else {
      visible = true;
    }
  } else {
    animMul = enabled ? 1 : 0;
    if (!enabled) {
      visible = false;
      ctx.prevEnabled = enabled;
      return { animMul: 0, visible: false, skipRest: true };
    }
    visible = true;
  }

  if (!visible && animMul <= 1e-6) {
    ctx.prevEnabled = enabled;
    return { animMul: 0, visible: false, skipRest: true };
  }

  ctx.prevEnabled = enabled;
  return { animMul, visible, skipRest: false };
}
