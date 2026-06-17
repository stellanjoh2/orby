/** @param {string} label @param {() => void} onClick */
export function createMobilePanelResetBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'orby-mobile-pill-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}
