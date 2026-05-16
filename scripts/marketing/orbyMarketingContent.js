/**
 * Copy + media map for the homepage marketing one-pager.
 * Swap imageSrc / videoSrc paths as real captures land. videoSrc on split blocks uses imageSrc as poster when both are set.
 */

/** @typedef {'intro' | 'split' | 'showcase' | 'footer'} MarketingSectionType */

/**
 * @typedef {Object} MarketingSection
 * @property {MarketingSectionType} type
 * @property {string} id
 * @property {string} [eyebrow]
 * @property {string} title
 * @property {string} lede
 * @property {string[]} [bullets]
 * @property {'media-left' | 'media-right'} [layout]
 * @property {string} [imageSrc]
 * @property {string} [imageAlt]
 * @property {string} [videoSrc]
 * @property {string} [ctaLabel]
 */

/** @type {MarketingSection[]} */
export const MARKETING_SECTIONS = [
  {
    type: 'intro',
    id: 'orby-marketing-intro',
    eyebrow: 'Free · Browser · Private',
    title: 'Import. Present. Export.',
    lede:
      'Orby is a zero-install studio for GLB, glTF, and SVG — drag a file in, light it like a set, ship stills and video without leaving the tab.',
  },
  {
    type: 'split',
    id: 'orby-marketing-import',
    eyebrow: '01 — Import',
    title: 'Drop in. Start immediately.',
    lede:
      'No accounts, no uploads, no waiting. Your models stay on your machine — Orby never trains on your work.',
    bullets: [
      'GLB / glTF, OBJ, FBX, STL, USD, and SVG extrusion',
      'Drag-and-drop or browse — plus full .orby scene recall',
      'Client-side only: close the tab and your files are gone',
    ],
    layout: 'media-right',
    videoSrc: './assets/marketing/import-orbit-placeholder.mp4',
    imageSrc: './assets/images/orby-lookfilter-studio.png',
    imageAlt: 'Orbit preview of a 3D model in Orby',
  },
  {
    type: 'split',
    id: 'orby-marketing-present',
    eyebrow: '02 — Present',
    title: 'Light it like a set.',
    lede:
      'HDR environments, 3-point lighting, look-dev presets, and cinematic post — all reacting in real time while you orbit the shot.',
    bullets: [
      'Look Filter presets, luminance curve, and full color grade',
      'Depth of field, bloom, grain, lens flare, and tone mapping',
      'Shader Lab stylized materials when you want to push beyond PBR',
    ],
    layout: 'media-left',
    imageSrc: './assets/marketing/present-cinema-look.png',
    imageAlt: 'Cinematic look filter preset in Orby',
  },
  {
    type: 'split',
    id: 'orby-marketing-export',
    eyebrow: '03 — Export',
    title: 'Deliverables without a pipeline.',
    lede:
      'Frame the hero angle once, then export production-ready stills, vectors, turntable video, or GLB from SVG extrusions.',
    bullets: [
      'PNG stills at 1× or 2× with optional transparency',
      'MP4 turntable video and numbered PNG sequences in a zip',
      'SVG silhouette or flat color, plus GLB from SVG extrude',
    ],
    layout: 'media-right',
    imageSrc: './assets/marketing/export-golden-look.png',
    imageAlt: 'Golden hour look on a product render',
  },
  {
    type: 'showcase',
    id: 'orby-marketing-showcase',
    eyebrow: 'Rendering',
    title: 'Built to show the work.',
    lede:
      'Full-bleed frames for the moments that matter — product viz, automotive, AI meshes, and game assets at the fidelity your model deserves.',
    imageSrc: './assets/images/marketing/showcase-render.png',
    imageAlt: 'High-fidelity automotive render lit in Orby',
  },
  {
    type: 'split',
    id: 'orby-marketing-camera',
    eyebrow: '04 — Camera & FX',
    title: 'Pro framing in the viewport.',
    lede:
      'Orbit, pan, and zoom with focus shortcuts, auto-orbit presentations, exposure tools, and a live histogram when you need precision.',
    bullets: [
      'FOV, tilt, and camera presets for repeatable shots',
      'Composition grid and 21∶9 letterbox for cinematic framing',
      'Auto exposure plus manual grade stack in one tab',
    ],
    layout: 'media-left',
    imageSrc: './assets/marketing/feature-ui-placeholder.png',
    imageAlt: 'Orby studio UI with viewport and Camera & FX controls',
  },
  {
    type: 'split',
    id: 'orby-marketing-shader-lab',
    eyebrow: '05 — Shader Lab',
    title: 'Stylized looks on demand.',
    lede:
      'Swap the mesh into chrome, glass, plasma, toon, and more — tune motion and scale, then switch off to restore your original materials.',
    bullets: [
      'Non-destructive: your glTF materials return when you disable the preset',
      'Great for social clips, concept boards, and rapid art direction',
    ],
    layout: 'media-right',
    imageSrc: './assets/images/creative-look-chrome.png',
    imageAlt: 'Chrome creative look material',
  },
  {
    type: 'split',
    id: 'orby-marketing-svg',
    eyebrow: '06 — SVG Extrude',
    title: 'Logos become geometry.',
    lede:
      'Import vector fills, extrude per color, and export opaque GLB for AR, slides, or the rest of your toolchain.',
    bullets: [
      'Per-fill depth and position for layered marks',
      'Scene settings remember your extrude stack in .orby files',
    ],
    layout: 'media-left',
    imageSrc: './assets/images/creative-look-glass.png',
    imageAlt: 'Glass stylized surface on extruded geometry',
  },
  {
    type: 'footer',
    id: 'orby-marketing-footer',
    title: 'Ready when you are.',
    lede: 'Scroll up, drop a GLB or SVG, and start presenting in seconds.',
    ctaLabel: 'Back to studio',
  },
];
