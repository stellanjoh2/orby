/**
 * Object → Advanced — mesh topology health check (warnings only, no repair).
 */
import { analyzeModelTopology } from '../mesh/topologyAnalysis.js';
import { withViewportLoadSpinner } from '../utils/viewportLoadSpinner.js';

export class TopologyWarningsControls {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} uiManager
   */
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    /** @type {(() => import('three').Object3D | null) | null} */
    this._getModel = null;
    this._scanning = false;
    this._active = false;
    /** @type {import('../mesh/topologyAnalysis.js').TopologyAnalysisResult | null} */
    this._result = null;
    /** @type {import('../mesh/topologyAnalysis.js').TopologyWarningCategory | null} */
    this._selectedCategory = null;
  }

  /**
   * @param {() => import('three').Object3D | null} getModel
   */
  setModelAccessor(getModel) {
    this._getModel = getModel;
  }

  bind() {
    this._block = document.getElementById('topologyWarningsBlock');
    this._scanBtn = document.getElementById('topologyWarningsScan');
    this._results = document.getElementById('topologyWarningsResults');
    this._list = document.getElementById('topologyWarningsList');

    this._scanBtn?.addEventListener('click', () => this.toggle());

    this.eventBus.on('scene:model-load-complete', (payload) => {
      if (payload?.success === false) {
        this.close();
        return;
      }
      this.close();
    });
    this.eventBus.on('scene:model-cleared', () => this.close());

    this._syncButtonState();
  }

  toggle() {
    if (this._active) {
      this.close();
      return;
    }
    this.open();
  }

  async open() {
    if (this._scanning || this._active) return;

    const model = this._getModel?.() ?? null;
    if (!model) {
      this.renderResult(analyzeModelTopology(null));
      return;
    }

    this._scanning = true;
    this._setButtonBusy(true);

    try {
      await withViewportLoadSpinner(this.ui, 'Checking mesh health', async () => {
        const result = analyzeModelTopology(model);
        this._result = result;
        this._selectedCategory = this._firstIssueCategory(result);
        this.renderResult(result);
        await window.orby?.scene?.setTopologyWarningsEnabled?.(
          true,
          this._selectedCategory,
          { skipSpinner: true },
        );
      });
      this._active = true;
      this._syncButtonState();
      this.ui.uiSounds?.playSelect?.();
    } finally {
      this._scanning = false;
      this._setButtonBusy(false);
      this._syncButtonState();
    }
  }

  close() {
    window.orby?.scene?.setTopologyWarningsEnabled?.(false);
    this._active = false;
    this._result = null;
    this._selectedCategory = null;
    if (this._results) this._results.hidden = true;
    if (this._list) this._list.replaceChildren();
    this._syncButtonState();
  }

  /**
   * @param {import('../mesh/topologyAnalysis.js').TopologyWarningCategory} category
   */
  async selectCategory(category) {
    if (!this._active || this._selectedCategory === category) return;

    this._selectedCategory = category;
    this._updateTabSelection();
    await window.orby?.scene?.setTopologyWarningsCategory?.(category);
    this.ui.uiSounds?.playSelect?.();
  }

  /**
   * @param {import('../mesh/topologyAnalysis.js').TopologyAnalysisResult | null} result
   * @returns {import('../mesh/topologyAnalysis.js').TopologyWarningCategory | null}
   */
  _firstIssueCategory(result) {
    return result?.warnings?.find((item) => item.kind === 'issue' && item.category)?.category ?? null;
  }

  _setButtonBusy(busy) {
    if (!this._scanBtn) return;
    this._scanBtn.disabled = busy || !this._getModel?.();
    if (busy) {
      this._scanBtn.textContent = 'Checking…';
    }
  }

  _syncButtonState() {
    if (!this._scanBtn || this._scanning) return;

    const hasModel = !!this._getModel?.();
    this._scanBtn.disabled = !hasModel;
    this._scanBtn.classList.toggle('is-active', this._active);

    if (this._active) {
      this._scanBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Close Mesh Health';
      this._scanBtn.dataset.tooltip = 'Hide topology warnings and viewport highlights';
    } else {
      this._scanBtn.innerHTML = '<i class="fa-solid fa-stethoscope" aria-hidden="true"></i> Run Mesh Health Check';
      this._scanBtn.dataset.tooltip = 'Analyze the loaded model for common topology problems';
    }
  }

  _updateTabSelection() {
    if (!this._list) return;

    this._list.querySelectorAll('.topology-warnings-tab').forEach((tab) => {
      const selected = tab.dataset.category === this._selectedCategory;
      tab.classList.toggle('is-selected', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  /**
   * @param {import('../mesh/topologyAnalysis.js').TopologyAnalysisResult} result
   */
  renderResult(result) {
    if (!this._results || !this._list) return;

    this._results.hidden = false;
    this._list.replaceChildren();

    const issues = result.warnings.filter((item) => item.kind === 'issue');
    if (issues.length > 0) {
      this._list.setAttribute('role', 'tablist');
      this._list.setAttribute('aria-label', 'Topology warnings');
    } else {
      this._list.removeAttribute('role');
      this._list.removeAttribute('aria-label');
    }

    for (const warning of result.warnings) {
      if (warning.kind === 'issue' && warning.category) {
        const item = document.createElement('li');
        item.setAttribute('role', 'presentation');

        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'topology-warnings-tab';
        tab.dataset.category = warning.category;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', warning.category === this._selectedCategory ? 'true' : 'false');
        tab.classList.toggle('is-selected', warning.category === this._selectedCategory);

        const title = document.createElement('span');
        title.className = 'topology-warnings-list__label';
        title.textContent = warning.label;

        const detail = document.createElement('span');
        detail.className = 'topology-warnings-list__detail';
        detail.textContent = warning.detail;

        tab.append(title, detail);
        tab.addEventListener('click', () => this.selectCategory(warning.category));
        item.append(tab);
        this._list.append(item);
        continue;
      }

      const item = document.createElement('li');
      item.className = `topology-warnings-list__item is-${warning.kind}`;
      item.dataset.kind = warning.kind;

      const title = document.createElement('span');
      title.className = 'topology-warnings-list__label';
      title.textContent = warning.label;

      const detail = document.createElement('span');
      detail.className = 'topology-warnings-list__detail';
      detail.textContent = warning.detail;

      item.append(title, detail);
      this._list.append(item);
    }
  }
}
