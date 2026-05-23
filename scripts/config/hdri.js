// HDRI presets and mood configurations

/** Session-only custom upload (blob URL registered at runtime). */
export const HDRI_CUSTOM_ID = 'custom';

/** @returns {'hdr' | 'exr' | 'ldr'} Custom upload types: `.hdr`/`.hdri`, `.exr`, or LDR (`.jpg`, `.png`, etc.). */
export function getCustomHdriUploadType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'exr') return 'exr';
  if (ext === 'hdr' || ext === 'hdri') return 'hdr';
  return 'ldr';
}

/** Grid / keyboard cycle order (3×3). Excludes {@link HDRI_CUSTOM_ID} until a file is uploaded. */
export const HDRI_PRESET_ORDER = [
  'congress',
  'luminous-sky',
  'sunset',
  'meadow',
  'abandoned',
  'beach',
  'blue-hour',
  'sunny-parking',
];

export const HDRI_PRESETS = {
  congress: { url: './assets/hdris/MR_INT-009_NeonsLines_PalaisCongres_4k.jpg', type: 'ldr' },
  'luminous-sky': { url: './assets/hdris/MR_EXT-003_Forest_MontRoyal_4k.jpg', type: 'ldr' },
  meadow: { url: './assets/hdris/MR_EXT-007_SunMeadow_LungernSwitzerland_4k.jpg', type: 'ldr' },
  abandoned: { url: './assets/hdris/MR_INT-022_RefugeWindowHighContrast_Aorai_4k.jpg', type: 'ldr' },
  beach: { url: './assets/hdris/MR_EXT-010_BlueEndDayPinkClouds_Moorea_4k.jpg', type: 'ldr' },
  sunset: { url: './assets/hdris/MR_EXT-014_SunsetTropicalMountains_4k.jpg', type: 'ldr' },
  'blue-hour': {
    url: './assets/hdris/MR_EXT-011_BlueHour_Rangiroa_4k.jpg',
    type: 'ldr',
  },
  'sunny-parking': {
    url: './assets/hdris/MR_EXT-001_Sunny_Parking_4k.jpg',
    type: 'ldr',
  },
};

export const HDRI_STRENGTH_UNIT = 1.0;

export const HDRI_MOODS = {
  congress: {
    bloomTint: '#f0f4f8',
    bloomStrengthMin: 0.3,
    bloomRadiusMin: 0.75,
    baseColor: '#e8e8e8',
    background: '#f5f5f5',
  },
  'luminous-sky': {
    bloomTint: '#a8d5a3',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    baseColor: '#3a4a2f',
    background: '#2d3a24',
  },
  sunset: {
    bloomTint: '#ff8c5a',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    baseColor: '#4a3a2a',
    background: '#2a1f15',
  },
  meadow: {
    bloomTint: '#fff4a8',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    baseColor: '#6b7a4a',
    background: '#4a5a35',
  },
  beach: {
    bloomTint: '#ffb3d9',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    baseColor: '#d4c5a9',
    background: '#5a7fb5',
  },
  abandoned: {
    bloomTint: '#8b6f47',
    bloomStrengthMin: 0.35,
    bloomRadiusMin: 0.75,
    baseColor: '#4a3a2a',
    background: '#2a1f15',
  },
  'blue-hour': {
    bloomTint: '#ffc48a',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    baseColor: '#5a6478',
    background: '#243044',
  },
  'sunny-parking': {
    bloomTint: '#fff0b0',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    baseColor: '#7a7d82',
    background: '#5a8ec8',
  },
};
