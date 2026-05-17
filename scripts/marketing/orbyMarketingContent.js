/**
 * Copy + media map for the homepage marketing one-pager.
 * Swap imageSrc / videoSrc paths as real captures land. videoSrc on split blocks uses imageSrc as poster when both are set.
 */

/** @typedef {'intro' | 'split' | 'showcase' | 'faq' | 'footer'} MarketingSectionType */

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
 * @property {{ src: string, alt: string, credit?: string }[]} [gallery]
 * @property {string} [videoSrc]
 * @property {string} [ctaLabel]
 * @property {{ question: string, answer: string }[]} [faq]
 */

/** @type {MarketingSection[]} */
export const MARKETING_SECTIONS = [
  {
    type: 'intro',
    id: 'orby-marketing-intro',
    eyebrow: 'Free · Browser · Private',
    title: 'Drop it in.\nSet the stage.\nSend it.',
    lede:
      'Orby is a zero-install studio for GLB, glTF, and SVG — drag a file in, light it like a set, ship stills and video without leaving the tab.',
  },
  {
    type: 'split',
    id: 'orby-marketing-import',
    eyebrow: '01 — Drop it in',
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
    eyebrow: '02 — Set the stage',
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
    id: 'orby-marketing-camera',
    eyebrow: '03 — Camera & FX',
    title: 'Pro framing in the viewport.',
    lede:
      'Orbit, pan, and zoom with focus shortcuts, auto-orbit presentations, exposure tools, and a live histogram when you need precision.',
    bullets: [
      'FOV, tilt, and camera presets for repeatable shots',
      'Composition grid and 21∶9 letterbox for cinematic framing',
      'Auto exposure plus manual grade stack in one tab',
    ],
    layout: 'media-right',
    imageSrc: './assets/marketing/feature-ui-placeholder.png',
    imageAlt: 'Orby studio UI with viewport and Camera & FX controls',
  },
  {
    type: 'showcase',
    id: 'orby-marketing-showcase',
    eyebrow: 'Rendering',
    title: 'Built to show the work.',
    lede:
      'Full-bleed frames for the moments that matter — product viz, automotive, AI meshes, and game assets at the fidelity your model deserves.',
    gallery: [
      {
        src: './assets/marketing/showcase/showcase-01-etron-gt.jpg',
        alt: 'Audi e-tron GT on a reflective platform lit in Orby',
        credit: 'Audi e-tron GT · vecarz.com',
      },
      {
        src: './assets/marketing/showcase/showcase-02-etron-detail.jpg',
        alt: 'Close-up headlight detail on a red sports car render',
        credit: 'Sports car detail · vecarz.com',
      },
      {
        src: './assets/marketing/showcase/showcase-03-jeep-rubicon.jpg',
        alt: 'Jeep Wrangler Rubicon adventure render with lake backdrop',
        credit: 'Jeep Wrangler Rubicon · vecarz.com',
      },
      {
        src: './assets/marketing/showcase/showcase-04-new-balance.jpg',
        alt: 'New Balance 574 product shot on a reflective disc',
        credit: 'New Balance 574 · vecarz.com',
      },
    ],
  },
  {
    type: 'split',
    id: 'orby-marketing-shader-lab',
    eyebrow: '04 — Shader Lab',
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
    eyebrow: '05 — SVG Extrude',
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
    type: 'split',
    id: 'orby-marketing-export',
    eyebrow: '06 — Send it',
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
    type: 'faq',
    id: 'orby-marketing-faq',
    eyebrow: 'FAQ',
    title: 'Questions, answered.',
    lede: 'Everything you need to know before you drop your first file.',
    faq: [
      {
        question: 'Who is Orby for?',
        answer:
          "Orby is made for designers who need to present 3D content without really knowing 3D — think AI-generated models, quick client presentations, product visuals, or seeing how a logo looks extruded in 3D with a single drop. It's also for 3D artists who need a fast, clean view without booting up a full DCC. No setup, no pipeline. Just your file and an instant presentation studio.",
      },
      {
        question: 'Do I need to create an account?',
        answer:
          'No. No account, no login, no email, no waitlist. Open the browser, drop your file, done.',
      },
      {
        question: 'Do my files get uploaded anywhere?',
        answer:
          "Never. Orby runs entirely in your browser — your files don't leave your device, ever. No servers, no cloud, no storage. Close the tab and the model is gone. What you load stays yours.",
      },
      {
        question: 'What formats does Orby support?',
        answer:
          "Orby is built and optimized for GLB and glTF — that's where you'll get the full experience. It also supports OBJ, FBX, STL, and USD/USDZ with basic support. For best results, export as GLB.",
      },
      {
        question: 'Can I export my renders?',
        answer:
          'Yes. You can export stills and video without leaving the tab. What you see is what you get — post-processing, lighting, materials and all.',
      },
      {
        question: 'Does it work on mobile?',
        answer:
          'Not yet. Orby is built for desktop — a proper screen, a mouse, and some GPU headroom. Mobile support is on the roadmap, but for now leave it at your desk.',
      },
      {
        question: 'Is it really free?',
        answer:
          'Completely. No hidden tiers, no export limits, no watermarks. Free now, free always.',
      },
      {
        question: 'Why does Orby exist?',
        answer:
          "Orby started as a personal learning experiment — I wanted to learn more about code and 3D on the web, and the process of building something on my own. It was never meant to be anything more than that. But it kept growing, and at some point it became something worth sharing. So here it is. I hope it's useful.",
      },
    ],
  },
  {
    type: 'footer',
    id: 'orby-marketing-footer',
    title: 'Try it out for free now.',
    lede: '',
    ctaLabel: 'Browse Files',
    secondaryCtaLabel: 'Load Sample',
  },
];
