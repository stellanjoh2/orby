/** Built-in gobo texture presets (grayscale masks projected from the key directional light). */
export const GOBO_PRESETS = [
  {
    id: 'palm',
    label: 'Palm',
    path: './assets/gobos/orby-spotlight-gobo01-palm.jpg',
  },
  {
    id: 'leaf',
    label: 'Leaf',
    path: './assets/gobos/orby-spotlight-gobo02-leaf.jpg',
  },
  {
    id: 'tree',
    label: 'Tree',
    path: './assets/gobos/orby-spotlight-gobo03-tree.jpg',
  },
];

export const DEFAULT_GOBO_TEXTURE_ID = 'palm';
export const DEFAULT_GOBO_SOFTNESS = 0.3;

export function getGoboPreset(id) {
  return GOBO_PRESETS.find((preset) => preset.id === id) ?? GOBO_PRESETS[0];
}
