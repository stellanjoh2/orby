/** P31 phosphor green — classic vector CRT / Vectrex tone. */
export const VECTREX_PHOSPHOR_HEX = 0x33ff55;

/** Scene clear while Vectrex is active (true CRT black). */
export const VECTREX_BG_HEX = '#000000';

/** Default phosphor persistence decay per frame (~60 fps). Higher = longer ghost trails. */
export const VECTREX_PERSISTENCE_DECAY = 0.92;

/** Phosphor glow reference — viewport bloom uses Cam/FX UnrealBloom instead. */
export const VECTREX_BLOOM_STRENGTH = 0.65;
