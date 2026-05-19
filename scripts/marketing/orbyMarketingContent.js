/**
 * Copy + media map for the homepage marketing one-pager.
 * Swap imageSrc / videoSrc paths as real captures land. videoSrc on split blocks uses imageSrc as poster when both are set.
 */

/** @typedef {'intro' | 'split' | 'showcase' | 'marquee' | 'pro' | 'faq' | 'footer'} MarketingSectionType */

/**
 * @typedef {Object} MarketingProCard
 * @property {string} title
 * @property {string} body
 * @property {string} [imageSrc]
 * @property {string} [imageAlt]
 */

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
 * @property {{ src: string, alt: string }[]} [marquee]
 * @property {string} [videoSrc]
 * @property {string} [ctaLabel]
 * @property {'scroll-top' | 'browse' | 'load-sample'} [ctaAction]
 * @property {{ question: string, answer: string }[]} [faq]
 * @property {MarketingProCard[]} [cards]
 * @property {string} [footerContactEmail] — hidden; copied when “Contact” is pressed
 * @property {string} [footerPrivacyHref]
 * @property {string} [footerCreditsHref]
 * @property {string} [footerGithubHref]
 * @property {string} [footerLicenseHref]
 */

/** @type {MarketingSection[]} */
export const MARKETING_SECTIONS = [
  {
    type: 'intro',
    id: 'orby-marketing-intro',
    title: 'Drop it in.\nSet the stage.\nSend it.',
    lede:
      "Orby is a zero-install studio for GLB, glTF, and SVG. Whether you're checking how your design looks in 3D, showcasing a photogrammetry scan, or presenting a product visualization — drag a file in, pose and light it, and ship stills and video without leaving the tab.",
  },
  {
    type: 'split',
    id: 'orby-marketing-present',
    eyebrow: 'Set the stage',
    title: 'Your virtual studio, in the browser.',
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
    id: 'orby-marketing-import',
    eyebrow: 'Drop it in',
    title: 'Drop in. Start immediately.',
    lede:
      'No accounts, no uploads, no waiting. Your models stay on your machine — Orby never trains on your work.',
    bullets: [
      'GLB / glTF, OBJ, FBX, STL, USD, and SVG extrusion',
      'Drag-and-drop or browse — plus full .orby scene recall',
      'Client-side only: close the tab and your files are gone',
    ],
    ctaLabel: 'Load Sample Object',
    ctaAction: 'load-sample',
    layout: 'media-right',
    videoSrc: './assets/marketing/import-orbit-placeholder.mp4',
    imageSrc: './assets/images/orby-lookfilter-studio.png',
    imageAlt: 'Orbit preview of a 3D model in Orby',
  },
  {
    type: 'split',
    id: 'orby-marketing-camera',
    eyebrow: 'Camera & FX',
    title: 'Pro framing in\nthe\u00a0viewport.',
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
    type: 'showcase',
    id: 'orby-marketing-showcase',
    eyebrow: 'Rendering',
    title: 'Looks this good,\nstraight in the browser.',
    lede:
      "Product visualization, automotive, architecture, game assets, scanned meshes — whatever you're working with, Orby treats it like a hero. Cinematic post-processing, HDR environments, and color grading that makes real-time look anything but.",
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
    eyebrow: 'Shader Lab',
    title: 'Stylized looks\non\u00a0demand.',
    lede:
      'Swap the mesh into chrome, glass, plasma, toon, and more — tune motion and scale, then switch off to restore your original materials.',
    bullets: [
      'Non-destructive: your glTF materials return when you disable the preset',
      'Great for social clips, concept boards, and rapid art direction',
    ],
    layout: 'media-left',
    imageSrc: './assets/images/creative-look-chrome.png',
    imageAlt: 'Chrome creative look material',
  },
  {
    type: 'split',
    id: 'orby-marketing-svg',
    eyebrow: 'SVG Extrude',
    title: 'Logos become geometry.',
    lede:
      'Import vector fills, extrude per color, and export opaque GLB for AR, slides, or the rest of your toolchain.',
    bullets: [
      'Per-fill depth and position for layered marks',
      'Scene settings remember your extrude stack in .orby files',
    ],
    layout: 'media-right',
    imageSrc: './assets/images/creative-look-glass.png',
    imageAlt: 'Glass stylized surface on extruded geometry',
  },
  {
    type: 'split',
    id: 'orby-marketing-export',
    eyebrow: 'Send it',
    title: 'Deliverables without a pipeline.',
    lede:
      'Frame the hero angle once, then export production-ready stills, vectors, turntable video, or GLB from SVG extrusions.',
    bullets: [
      'PNG stills at 1× or 2× with optional transparency',
      'MP4 turntable video and numbered PNG sequences in a zip',
      'SVG silhouette or flat color, plus GLB from SVG extrude',
    ],
    layout: 'media-left',
    imageSrc: './assets/marketing/export-golden-look.png',
    imageAlt: 'Golden hour look on a product render',
  },
  {
    type: 'marquee',
    id: 'orby-marketing-png-marquee',
    eyebrow: 'Export',
    title: 'Perfect transparency.',
    lede:
      'Icons, ecommerce cutouts, logos on any background — export PNGs with real alpha from the viewport. No cleanup pass in Photoshop.',
    /* Real RGBA PNGs required — paths in assets/marketing/png-loop/ (see README there). */
    marquee: [
      {
        src: './assets/marketing/png-loop/new-balance-574.png',
        alt: 'New Balance Classic 574 sneaker product cutout',
      },
      {
        src: './assets/marketing/png-loop/skull-salazar.png',
        alt: 'Decorative painted skull cutout',
      },
      {
        src: './assets/marketing/png-loop/loggerhead-turtle.png',
        alt: 'Loggerhead sea turtle cutout',
      },
    ],
  },
  {
    type: 'pro',
    id: 'orby-marketing-pro',
    eyebrow: 'For pros',
    title: 'Built for\nthe\u00a0details.',
    lede:
      "There's more under the hood than meets the eye. UV checker, wireframe overlay, clay mode, isometric camera, and much more — the kind of tools you'd expect from a desktop app, running quietly in your browser tab.",
    cards: [
      {
        title: 'Mesh diagnostics',
        body:
          'UV checker, wireframe overlay, clay mode, and reverse normals. Everything you need to sanity-check your mesh without opening a DCC.',
        imageSrc: './assets/marketing/feature-ui-placeholder.png',
        imageAlt: 'Orby viewport with mesh diagnostic overlays',
      },
      {
        title: 'Export without recording',
        body:
          'PNG stills, MP4 turntable, or PNG sequences. No screen capture, no third-party tools.',
        imageSrc: './assets/marketing/export-golden-look.png',
        imageAlt: 'Product render ready for export from Orby',
      },
      {
        title: 'Custom HDRI',
        body:
          'Bring your own 360° environment — a sunset field, studio softbox, or location plate. Upload .jpg, .png, or .hdr and Orby lights your model from it: reflections, backdrop, and mood follow your file, not just our presets.',
        imageSrc: './assets/marketing/custom-hdri-placeholder.png',
        imageAlt: '3D model lit by a custom golden-hour environment in Orby',
      },
    ],
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
          "No. No account, no login, no email, no waitlist. Just open the browser and drop your file. We wanted getting started to be as frictionless as possible — no hoops, no setup, no commitment. If you have a file, you're ready.",
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
    title: 'Try it out\nfor free now.',
    lede: '',
    ctaLabel: 'Browse Files',
    secondaryCtaLabel: 'Load Sample',
    footerContactEmail: 'orby-admin@proton.me',
    footerPrivacyHref: './legal/privacy-policy.html',
    footerCreditsHref: './legal/credits.html',
    footerGithubHref: 'https://github.com/stellanjoh2/orby',
    footerLicenseHref: './LICENSE',
  },
];
