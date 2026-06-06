/**
 * FBX Map Slots — texture pickers and per-material tuning (normals, ORM, UV).
 */
import {
  analyzeFbxMaterials,
  getFbxUserSlotFileNamesForMaterial,
} from '../import/fbxMaterialReport.js';
import {
  FBX_NORMAL_CONVENTION_OPTIONS,
  FBX_ORM_PACKING_OPTIONS,
  getFbxMaterialTuning,
  normalizeFbxMapSlotsState,
} from '../import/fbxMapSlotsSettings.js';

export class FbxMapSlotsControls {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} ui
   */
  constructor(eventBus, stateStore, ui) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = ui;
    this._pendingFbxMapSlot = null;
    this._fbxMaterialOptions = [];
  }

  bind() {
    const openFbxMapPicker = (slot) => {
      if (!slot) return;
      this._pendingFbxMapSlot = slot;
      this.ui.inputs.fbxMapFileInput?.click();
    };

    this.ui.inputs.fbxMapMaterial?.addEventListener('change', (event) => {
      const key = event?.target?.value ?? '';
      this.eventBus.emit('mesh:fbx-active-material', { materialKey: key });
    });

    document.querySelectorAll('.map-slot-choose[data-fbx-map-slot], .map-slot-file[data-fbx-map-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openFbxMapPicker(btn.getAttribute('data-fbx-map-slot'));
      });
    });

    document.querySelectorAll('[data-fbx-map-clear]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const slot = btn.getAttribute('data-fbx-map-clear');
        if (!slot) return;
        this.eventBus.emit('mesh:fbx-map-clear', {
          slot,
          materialKey: this._getActiveMaterialKey(),
        });
      });
    });

    this.ui.inputs.fbxMapFileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      const slot = this._pendingFbxMapSlot;
      event.target.value = '';
      this._pendingFbxMapSlot = null;
      if (!file || !slot) return;
      this.eventBus.emit('mesh:fbx-map-slot', {
        slot,
        file,
        materialKey: this._getActiveMaterialKey(),
      });
    });

    this.ui.inputs.fbxMapNormalConvention?.addEventListener('change', (event) => {
      const value = event?.target?.value ?? 'match-albedo';
      this.eventBus.emit('mesh:fbx-material-tuning', {
        materialKey: this._getActiveMaterialKey(),
        patch: { normalConvention: value },
      });
    });

    this.ui.inputs.fbxMapPbrUvChannel?.addEventListener('change', (event) => {
      const raw = parseInt(event?.target?.value, 10);
      const channel = raw === 1 ? 1 : 0;
      this.eventBus.emit('mesh:fbx-material-tuning', {
        materialKey: this._getActiveMaterialKey(),
        patch: { pbrUvChannel: channel },
      });
    });

    this.ui.inputs.fbxMapOrmPacking?.addEventListener('change', (event) => {
      const value = event?.target?.value ?? 'gltf';
      this.eventBus.emit('mesh:fbx-material-tuning', {
        materialKey: this._getActiveMaterialKey(),
        patch: { ormPacking: value },
      });
    });

    this.ui.inputs.fbxMapApplyTuningAll?.addEventListener('click', () => {
      this.eventBus.emit('mesh:fbx-apply-tuning-all', {
        materialKey: this._getActiveMaterialKey(),
      });
    });

    this.ui.inputs.fbxMapRescanFolder?.addEventListener('click', () => {
      this.eventBus.emit('mesh:fbx-rescan-folder');
    });

    this.eventBus.on('scene:fbx-map-applied', (payload) => {
      if (this._slotMatchesActiveMaterial(payload?.materialKey)) {
        this._syncMapSlotRow(payload?.slot, payload?.name);
      }
    });
    this.eventBus.on('scene:fbx-map-cleared', (payload) => {
      if (this._slotMatchesActiveMaterial(payload?.materialKey)) {
        this._syncMapSlotRow(payload?.slot, '');
      }
    });
    this.eventBus.on('scene:fbx-map-slots-reset', () => {
      this._refreshMaterialSelect();
      this._syncAllMapSlotRows();
      this.syncFromState(this.stateStore.getState());
    });
    this.eventBus.on('scene:fbx-material-report', () => {
      this._refreshMaterialSelect();
      this._syncAllMapSlotRows();
    });
    this.eventBus.on('scene:fbx-active-material', () => {
      this._syncMaterialSelectFromState();
      this._syncAllMapSlotRows();
      this.syncFromState(this.stateStore.getState());
    });
    this.eventBus.on('scene:fbx-tuning-changed', () => {
      this.syncFromState(this.stateStore.getState());
    });
  }

  syncFromState(state) {
    const fbx = normalizeFbxMapSlotsState(state?.fbxMapSlots);
    const fbxOn = !!fbx.enabled;
    const materialKey = fbx.activeMaterial || this._getActiveMaterialKey();
    const tuning = getFbxMaterialTuning(fbx, materialKey);

    if (this.ui.inputs.fbxMapMaterialLine) {
      if (fbxOn && !this._fbxMaterialOptions?.length) {
        this._refreshMaterialSelect();
      }
      const showMat = fbxOn && (this._fbxMaterialOptions?.length ?? 0) > 1;
      this.ui.inputs.fbxMapMaterialLine.hidden = !showMat;
      this.ui.setControlDisabled('fbxMapMaterial', !showMat);
      if (showMat) this._syncMaterialSelectFromState();
    }

    const tuningDisabled = !fbxOn || !materialKey;
    if (this.ui.inputs.fbxMapNormalConvention) {
      this.ui.inputs.fbxMapNormalConvention.value = tuning.normalConvention;
      this.ui.setControlDisabled('fbxMapNormalConvention', tuningDisabled);
    }
    if (this.ui.inputs.fbxMapPbrUvChannel) {
      this.ui.inputs.fbxMapPbrUvChannel.value = tuning.pbrUvChannel === 1 ? '1' : '0';
      this.ui.setControlDisabled('fbxMapPbrUvChannel', tuningDisabled);
    }
    if (this.ui.inputs.fbxMapOrmPacking) {
      this.ui.inputs.fbxMapOrmPacking.value = tuning.ormPacking;
      this.ui.setControlDisabled('fbxMapOrmPacking', tuningDisabled);
    }
    if (this.ui.inputs.fbxMapApplyTuningAll) {
      this.ui.setControlDisabled('fbxMapApplyTuningAll', tuningDisabled);
    }
    if (this.ui.inputs.fbxMapRescanFolder) {
      const hasBundle = !!window.orby?.scene?.hasFbxImportBundle?.();
      this.ui.setControlDisabled('fbxMapRescanFolder', !fbxOn || !hasBundle);
    }
  }

  _getActiveMaterialKey() {
    return this.stateStore.getState()?.fbxMapSlots?.activeMaterial ?? '';
  }

  _slotMatchesActiveMaterial(materialKey) {
    const active = this._getActiveMaterialKey();
    const key = materialKey ?? active;
    return !active || !key || active === key;
  }

  _refreshMaterialSelect() {
    const select = this.ui.inputs.fbxMapMaterial;
    const line = this.ui.inputs.fbxMapMaterialLine;
    if (!select) return;

    const model = window.orby?.scene?.currentModel;
    if (!model) {
      this._fbxMaterialOptions = [];
      select.replaceChildren();
      if (line) line.hidden = true;
      return;
    }

    const report = analyzeFbxMaterials(model);
    this._fbxMaterialOptions = report.materials;
    const active = this._getActiveMaterialKey();
    const activeValid = report.materials.some((m) => m.key === active);
    const selectedKey = activeValid ? active : report.materials[0]?.key ?? '';

    if (!activeValid && selectedKey) {
      this.stateStore.set('fbxMapSlots.activeMaterial', selectedKey);
    }

    select.replaceChildren();
    for (const entry of report.materials) {
      const opt = document.createElement('option');
      opt.value = entry.key;
      const meshLabel = entry.meshCount === 1 ? '1 mesh' : `${entry.meshCount} meshes`;
      opt.textContent = `${entry.name} (${meshLabel})`;
      select.appendChild(opt);
    }
    select.value = selectedKey;

    if (line) line.hidden = report.materialCount <= 1;
  }

  _syncMaterialSelectFromState() {
    const select = this.ui.inputs.fbxMapMaterial;
    if (!select) return;
    const active = this._getActiveMaterialKey();
    if (active && [...select.options].some((o) => o.value === active)) {
      select.value = active;
    }
  }

  _syncAllMapSlotRows() {
    const materialKey = this._getActiveMaterialKey();
    const model = window.orby?.scene?.currentModel;
    const originals = window.orby?.scene?.materialController?.originalMaterials;
    const names =
      model && originals
        ? getFbxUserSlotFileNamesForMaterial(model, originals, materialKey)
        : {};

    document.querySelectorAll('[data-fbx-map-row]').forEach((control) => {
      const slot = control.getAttribute('data-fbx-map-row');
      this._syncMapSlotRow(slot, names[slot] ?? '');
    });
  }

  /**
   * @param {string | undefined} slot
   * @param {string} [name]
   */
  _syncMapSlotRow(slot, name = '') {
    if (!slot) return;
    const control = document.querySelector(`[data-fbx-map-row="${slot}"]`);
    const choose = control?.querySelector('.map-slot-choose');
    const file = control?.querySelector('.map-slot-file');
    const clear = control?.querySelector('.map-slot-clear');
    const fullName = typeof name === 'string' ? name.trim() : '';
    const hasFile = fullName.length > 0;

    control?.classList.toggle('map-slot-control--has-file', hasFile);
    if (choose) choose.hidden = hasFile;
    if (file) {
      file.hidden = !hasFile;
      const short = fullName.length > 22 ? `${fullName.slice(0, 20)}…` : fullName;
      file.textContent = short;
      file.title = fullName;
      file.setAttribute('aria-label', fullName ? `Replace ${fullName}` : 'Replace texture');
    }
    if (clear) {
      clear.hidden = !hasFile;
      clear.tabIndex = hasFile ? 0 : -1;
    }
  }
}
