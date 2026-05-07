import * as THREE from 'three';

/** Mesh picking on the canvas: click vs drag; toggles transform widgets (rotate vs none). */
export class SceneMeshClickHandler {
  constructor(deps) {
    this.canvas = deps.canvas;
    this.camera = deps.camera;
    this.getCurrentModel = deps.getCurrentModel;
    this.stateStore = deps.stateStore;
    this.eventBus = deps.eventBus;

    this.raycaster = new THREE.Raycaster();
    this.mouseDownPos = null;
    this.mouseDownTime = null;
    this.mouseDownOnCanvas = false;

    this._onMouseDown = null;
    this._onMouseUp = null;
  }

  attach() {
    const CLICK_THRESHOLD = 5;
    const CLICK_TIME_THRESHOLD = 200;

    this._onMouseDown = (event) => {
      if (event.button !== 0) return;

      const target = event.target;
      const clickedOnCanvas =
        target === this.canvas || this.canvas.contains(target);

      if (clickedOnCanvas) {
        this.mouseDownOnCanvas = true;
        this.mouseDownPos = {
          x: event.clientX,
          y: event.clientY,
        };
        this.mouseDownTime = performance.now();
      }
    };

    this._onMouseUp = (event) => {
      if (event.button !== 0) return;

      const target = event.target;
      const clickedOnCanvas =
        target === this.canvas || this.canvas.contains(target);

      const currentModel = this.getCurrentModel();

      if (this.mouseDownOnCanvas && this.mouseDownPos && this.mouseDownTime) {
        const mouseMove = Math.sqrt(
          Math.pow(event.clientX - this.mouseDownPos.x, 2) +
            Math.pow(event.clientY - this.mouseDownPos.y, 2),
        );
        const mouseTime = performance.now() - this.mouseDownTime;

        const wasClick =
          mouseMove < CLICK_THRESHOLD && mouseTime < CLICK_TIME_THRESHOLD;

        if (wasClick && currentModel && clickedOnCanvas) {
          const rect = this.canvas.getBoundingClientRect();
          const mouse = new THREE.Vector2();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          this.raycaster.setFromCamera(mouse, this.camera);
          const intersects = this.raycaster.intersectObject(currentModel, true);

          if (intersects.length > 0) {
            this.stateStore.set('moveWidgetEnabled', false);
            this.stateStore.set('rotateWidgetEnabled', true);
            this.stateStore.set('scaleWidgetEnabled', false);
            this.eventBus.emit('mesh:move-widget-enabled', false);
            this.eventBus.emit('mesh:rotate-widget-enabled', true);
            this.eventBus.emit('mesh:scale-widget-enabled', false);
          } else {
            this.stateStore.set('moveWidgetEnabled', false);
            this.stateStore.set('rotateWidgetEnabled', false);
            this.stateStore.set('scaleWidgetEnabled', false);
            this.eventBus.emit('mesh:move-widget-enabled', false);
            this.eventBus.emit('mesh:rotate-widget-enabled', false);
            this.eventBus.emit('mesh:scale-widget-enabled', false);
          }
        }
      } else if (!clickedOnCanvas) {
        this.stateStore.set('moveWidgetEnabled', false);
        this.stateStore.set('rotateWidgetEnabled', false);
        this.stateStore.set('scaleWidgetEnabled', false);
        this.eventBus.emit('mesh:move-widget-enabled', false);
        this.eventBus.emit('mesh:rotate-widget-enabled', false);
        this.eventBus.emit('mesh:scale-widget-enabled', false);
      }

      this.mouseDownPos = null;
      this.mouseDownTime = null;
      this.mouseDownOnCanvas = false;
    };

    this.canvas.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  detach() {
    if (this._onMouseDown) {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
    }
    if (this._onMouseUp) {
      document.removeEventListener('mouseup', this._onMouseUp);
    }
    this._onMouseDown = null;
    this._onMouseUp = null;
  }
}
