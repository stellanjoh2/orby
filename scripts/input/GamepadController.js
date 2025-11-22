import { HDRI_PRESETS, HDRI_STRENGTH_UNIT } from '../config/hdri.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const DEADZONE = 0.15;
const ORBIT_SPEED = 2.6; // radians per second at full deflection
const ZOOM_SPEED = 4.8; // units per second at full deflection
const BUTTON_REPEAT_DELAY = 0.35;
const BUTTON_REPEAT_INTERVAL = 0.15;

export class GamepadController {
  constructor({
    cameraController,
    stateStore,
    eventBus,
    uiManager,
    sceneManager,
  }) {
    this.cameraController = cameraController;
    this.stateStore = stateStore;
    this.eventBus = eventBus;
    this.ui = uiManager;
    this.scene = sceneManager;
    this.activeIndex = null;
    this.lastTimestamp = null;
    this.buttonStates = new Map();
    this.connected = false;
    this.animationFrame = null;
    this.orbitVelocity = { yaw: 0, pitch: 0 };
    this.zoomVelocity = 0;

    this.handleConnect = this.handleConnect.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
    this.poll = this.poll.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('gamepadconnected', this.handleConnect);
      window.addEventListener('gamepaddisconnected', this.handleDisconnect);
    }

    if (typeof navigator?.getGamepads === 'function') {
      this.connected = true;
      this.poll(performance.now());
    } else {
      console.info('Gamepad API not available in this browser.');
    }
  }

  dispose() {
    window.removeEventListener('gamepadconnected', this.handleConnect);
    window.removeEventListener('gamepaddisconnected', this.handleDisconnect);
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  handleConnect(event) {
    if (this.activeIndex == null) {
      this.activeIndex = event.gamepad.index;
    }
    this.connected = true;
    this.buttonStates.clear();
    if (this.ui?.showToast) {
      this.ui.showToast('GAMEPAD CONNECTED');
    }
  }

  handleDisconnect(event) {
    if (this.activeIndex === event.gamepad.index) {
      this.activeIndex = null;
      this.buttonStates.clear();
    }
    const pads = navigator.getGamepads?.() ?? [];
    const stillConnected = pads.some((pad) => pad && pad.connected);
    this.connected = stillConnected;
  }

  poll(timestamp) {
    if (!this.connected) {
      this.animationFrame = requestAnimationFrame(this.poll);
      return;
    }

    const delta =
      this.lastTimestamp != null ? (timestamp - this.lastTimestamp) / 1000 : 0;
    this.lastTimestamp = timestamp;

    const gamepad = this.getActiveGamepad();
    if (gamepad) {
      this.handleAxes(gamepad, delta);
      this.handleButtons(gamepad, delta);
    }

    this.animationFrame = requestAnimationFrame(this.poll);
  }

  getActiveGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    if (this.activeIndex != null) {
      const active = pads[this.activeIndex];
      if (active && active.connected) {
        return active;
      }
    }
    const fallback = pads.find((pad) => pad && pad.connected);
    if (fallback) {
      this.activeIndex = fallback.index;
      return fallback;
    }
    return null;
  }

  handleAxes(gamepad, delta) {
    if (!this.cameraController || !delta) return;

    const [lx = 0, ly = 0, rx = 0, ry = 0] = gamepad.axes ?? [];
    const zoomStick = this.applyDeadzone(-ly);
    const orbitX = this.applyDeadzone(rx);
    const orbitY = this.applyDeadzone(ry);
    const targetDistance =
      this.cameraController?.getTargetDistance?.() ?? 5;
    const zoomScale = ZOOM_SPEED * Math.max(targetDistance * 0.25, 0.6);

    const orbitActive = Math.abs(orbitX) > 0 || Math.abs(orbitY) > 0;
    const orbitLerp = orbitActive ? 0.38 : 0.12;
    const targetYaw = orbitX * ORBIT_SPEED;
    const targetPitch = -orbitY * ORBIT_SPEED;
    this.orbitVelocity.yaw += (targetYaw - this.orbitVelocity.yaw) * orbitLerp;
    this.orbitVelocity.pitch +=
      (targetPitch - this.orbitVelocity.pitch) * orbitLerp;
    const yawStep = this.orbitVelocity.yaw * delta;
    const pitchStep = this.orbitVelocity.pitch * delta;
    if (Math.abs(yawStep) > 1e-4 || Math.abs(pitchStep) > 1e-4) {
      this.cameraController.orbit(yawStep, pitchStep);
    }

    let zoomInput = 0;
    if (Math.abs(zoomStick) > 0.01) {
      zoomInput = zoomStick;
    } else {
      const zoomIn = gamepad.buttons?.[7]?.value ?? 0;
      const zoomOut = gamepad.buttons?.[6]?.value ?? 0;
      const triggerInput = clamp(zoomIn - zoomOut, -1, 1);
      if (Math.abs(triggerInput) > 0.01) {
        zoomInput = triggerInput;
      }
    }
    if (Math.abs(zoomInput) > 0.01) {
      // handled below via smoothing
    }
    const zoomActive = Math.abs(zoomInput) > 0.01;
    const zoomLerp = zoomActive ? 0.45 : 0.15;
    const targetZoom = zoomInput * zoomScale;
    this.zoomVelocity += (targetZoom - this.zoomVelocity) * zoomLerp;
    const zoomStep = this.zoomVelocity * delta;
    if (Math.abs(zoomStep) > 1e-4) {
      this.cameraController.dolly(zoomStep);
    }
  }

  handleButtons(gamepad, delta) {
    const buttons = gamepad.buttons ?? [];
    buttons.forEach((button, index) => {
      const pressed = button?.pressed ?? false;
      const config = this.getButtonConfig(index);
      if (!config) {
        if (this.buttonStates.has(index)) {
          this.buttonStates.delete(index);
        }
        return;
      }

      const state = this.buttonStates.get(index) ?? {
        pressed: false,
        holdTime: 0,
      };

      if (pressed) {
        state.holdTime += delta;
        if (!state.pressed) {
          this.invokeAction(config);
          state.holdTime = 0;
        } else if (config.repeat && state.holdTime >= config.repeatDelay) {
          this.invokeAction(config);
          state.holdTime = config.repeatInterval;
        }
      } else {
        state.holdTime = 0;
      }

      state.pressed = pressed;
      this.buttonStates.set(index, state);
    });
  }

  getButtonConfig(index) {
    switch (index) {
      case 0:
        return { action: 'cycleAutoRotate' }; // Cross / A
      case 1:
        return { action: 'cycleShadingMode' }; // Circle / B
      case 2:
        return { action: 'resetCamera' }; // Square / X
      case 3:
        return { action: 'toggleUi' }; // Triangle / Y
      case 4:
        return { action: 'cycleHdri', direction: -1 }; // L1 / LB
      case 5:
        return { action: 'cycleHdri', direction: 1 }; // R1 / RB
      case 12:
        return {
          action: 'adjustExposure',
          amount: 0.05,
          repeat: true,
          repeatDelay: BUTTON_REPEAT_DELAY,
          repeatInterval: BUTTON_REPEAT_INTERVAL,
        }; // D-pad Up
      case 13:
        return {
          action: 'adjustExposure',
          amount: -0.05,
          repeat: true,
          repeatDelay: BUTTON_REPEAT_DELAY,
          repeatInterval: BUTTON_REPEAT_INTERVAL,
        }; // D-pad Down
      case 14:
        return {
          action: 'adjustHdriStrength',
          amount: -0.1,
          repeat: true,
          repeatDelay: BUTTON_REPEAT_DELAY,
          repeatInterval: BUTTON_REPEAT_INTERVAL,
        }; // D-pad Left
      case 15:
        return {
          action: 'adjustHdriStrength',
          amount: 0.1,
          repeat: true,
          repeatDelay: BUTTON_REPEAT_DELAY,
          repeatInterval: BUTTON_REPEAT_INTERVAL,
        }; // D-pad Right
      default:
        return null;
    }
  }

  invokeAction(config) {
    switch (config.action) {
      case 'cycleAutoRotate':
        this.cycleAutoRotate();
        break;
      case 'cycleShadingMode':
        this.cycleShadingMode();
        break;
      case 'resetCamera':
        this.resetCamera();
        break;
      case 'toggleUi':
        this.toggleUiVisibility();
        break;
      case 'cycleHdri':
        this.cycleHdri(config.direction ?? 1);
        break;
      case 'adjustExposure':
        this.adjustExposure(config.amount ?? 0);
        break;
      case 'adjustHdriStrength':
        this.adjustHdriStrength(config.amount ?? 0);
        break;
      default:
        break;
    }
  }

  cycleAutoRotate() {
    const speeds = [0, 0.2, 0.5, 1];
    const current = this.stateStore.getState().autoRotate ?? 0;
    const currentIndex = speeds.indexOf(current);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    this.stateStore.set('autoRotate', nextSpeed);
    this.eventBus.emit('mesh:auto-rotate', nextSpeed);
  }

  resetCamera() {
    if (typeof this.cameraController?.reset === 'function') {
      this.cameraController.reset();
    }
    if (this.scene?.currentModel) {
      this.scene.fitCameraToObject(this.scene.currentModel);
    }
  }

  cycleHdri(direction) {
    const presets = Object.keys(HDRI_PRESETS);
    if (!presets.length) return;
    const state = this.stateStore.getState();
    const current = state.hdri ?? presets[0];
    const currentIndex = presets.indexOf(current);
    const nextIndex =
      (currentIndex + direction + presets.length) % presets.length;
    const nextPreset = presets[nextIndex];

    this.stateStore.set('hdri', nextPreset);
    this.ui?.setHdriActive?.(nextPreset);
    this.eventBus.emit('studio:hdri', nextPreset);
  }

  adjustExposure(amount) {
    if (amount === 0) return;
    const state = this.stateStore.getState();
    const current = state.exposure ?? 1;
    const next = clamp(current + amount, 0, 5);
    if (Math.abs(next - current) < 1e-3) return;
    this.stateStore.set('exposure', next);
    this.eventBus.emit('scene:exposure', next);
  }

  adjustHdriStrength(amount) {
    if (amount === 0) return;
    const state = this.stateStore.getState();
    const currentSlider = (state.hdriStrength ?? 0) / HDRI_STRENGTH_UNIT;
    const nextSlider = clamp(currentSlider + amount, 0, 3);
    if (Math.abs(nextSlider - currentSlider) < 1e-3) return;
    const nextStrength = nextSlider * HDRI_STRENGTH_UNIT;
    this.stateStore.set('hdriStrength', nextStrength);
    this.eventBus.emit('studio:hdri-strength', nextStrength);
  }

  applyDeadzone(value) {
    return Math.abs(value) < DEADZONE ? 0 : value;
  }

  cycleShadingMode() {
    const modes = ['clay', 'wireframe', 'unlit'];
    const state = this.stateStore.getState();
    const current = state.shading ?? 'shaded';
    const currentIndex = modes.indexOf(current);
    const nextMode =
      currentIndex === -1 ? modes[0] : modes[(currentIndex + 1) % modes.length];
    this.stateStore.set('shading', nextMode);
    this.eventBus.emit('mesh:shading', nextMode);
  }

  toggleUiVisibility() {
    this.ui?.toggleUi?.();
  }
}

