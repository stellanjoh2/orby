// HDRI presets and mood configurations

export const HDRI_PRESETS = {
  'congress': { url: './assets/hdris/MR_INT-009_NeonsLines_PalaisCongres_4k.jpg', type: 'ldr' },
  'luminous-sky': { url: './assets/hdris/MR_EXT-003_Forest_MontRoyal_4k.jpg', type: 'ldr' },
  'meadow': { url: './assets/hdris/MR_EXT-007_SunMeadow_LungernSwitzerland_4k.jpg', type: 'ldr' },
  'abandoned': { url: './assets/hdris/MR_INT-022_RefugeWindowHighContrast_Aorai_4k.jpg', type: 'ldr' },
  beach: { url: './assets/hdris/MR_EXT-010_BlueEndDayPinkClouds_Moorea_4k.jpg', type: 'ldr' },
  sunset: { url: './assets/hdris/MR_EXT-014_SunsetTropicalMountains_4k.jpg', type: 'ldr' },
};

export const HDRI_STRENGTH_UNIT = 0.4;

export const HDRI_MOODS = {
  congress: {
    bloomTint: '#f0f4f8',
    bloomStrengthMin: 0.3,
    bloomRadiusMin: 0.75,
    grainTint: '#ffffff',
    podiumColor: '#e8e8e8',
    background: '#f5f5f5',
  },
  'luminous-sky': {
    bloomTint: '#a8d5a3',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    grainTint: '#d4e8d0',
    podiumColor: '#3a4a2f',
    background: '#2d3a24',
  },
  sunset: {
    bloomTint: '#ff8c5a',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    grainTint: '#ffd4a8',
    podiumColor: '#4a3a2a',
    background: '#2a1f15',
  },
  meadow: {
    bloomTint: '#fff4a8',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    grainTint: '#fff8d4',
    podiumColor: '#6b7a4a',
    background: '#4a5a35',
  },
  beach: {
    bloomTint: '#ffb3d9',
    bloomStrengthMin: 0.4,
    bloomRadiusMin: 0.75,
    grainTint: '#ffe5cc',
    podiumColor: '#d4c5a9',
    background: '#5a7fb5',
  },
  abandoned: {
    bloomTint: '#8b6f47',
    bloomStrengthMin: 0.35,
    bloomRadiusMin: 0.75,
    grainTint: '#a68b6b',
    podiumColor: '#4a3a2a',
    background: '#2a1f15',
  },
};

