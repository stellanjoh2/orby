/** Export tab — collapse Image / SVG / GLB / Video blocks behind section toggles. */
const EXPORT_SECTIONS = /** @type {const} */ ([
  { key: 'image', inputId: 'exportImageSectionOpen', foldout: 'image', size: 'md' },
  { key: 'svg', inputId: 'exportSvgSectionOpen', foldout: 'svg', size: 'md' },
  { key: 'glb', inputId: 'exportGlbSectionOpen', foldout: 'glb', size: 'md' },
  { key: 'video', inputId: 'exportVideoSectionOpen', foldout: 'video', size: 'xl' },
]);

export class ExportSectionControls {
  constructor(ui) {
    this.ui = ui;
  }

  bind() {
    EXPORT_SECTIONS.forEach(({ key, inputId }) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('change', () => {
        const open = !!input.checked;
        this.ui.exportSettings.sections[key] = open;
        this.setSectionOpen(key, open);
      });
      const open = !!this.ui.exportSettings.sections[key];
      input.checked = open;
      this.setSectionOpen(key, open);
    });
  }

  /** @param {'image' | 'svg' | 'glb' | 'video'} key */
  setSectionOpen(key, open) {
    const config = EXPORT_SECTIONS.find((section) => section.key === key);
    if (!config) return;
    const foldout = document.querySelector(
      `[data-export-foldout="${config.foldout}"]`,
    );
    if (!foldout) return;
    foldout.classList.toggle('effect-foldout--collapsed', !open);
    foldout.classList.toggle('effect-foldout--expanded', open);
    foldout.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  syncFromSettings() {
    EXPORT_SECTIONS.forEach(({ key, inputId }) => {
      const input = document.getElementById(inputId);
      const open = !!this.ui.exportSettings.sections?.[key];
      if (input) input.checked = open;
      this.setSectionOpen(key, open);
    });
  }
}
