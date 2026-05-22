/**
 * Copy + media map for the homepage marketing one-pager.
 * Swap imageSrc / videoSrc paths as real captures land. Set videoPoster: true to use imageSrc as a poster frame.
 *
 * After editing marketing copy here, regenerate the review export:
 *   npm run export:marketing-copy
 */

/** @typedef {'intro' | 'split' | 'showcase' | 'marquee' | 'pro' | 'faq' | 'footer' | 'refrct-teaser'} MarketingSectionType */

/**
 * @typedef {Object} MarketingProCard
 * @property {string} title
 * @property {string} body
 * @property {string} [imageSrc]
 * @property {string} [imageAlt]
 */

/**
 * Lower-third artwork credit on split (and similar) feature images.
 * @typedef {Object} MarketingImageCredit
 * @property {string} title — artwork title
 * @property {string} [artist] — creator name or handle
 * @property {string} sourceLabel — source name (e.g. Meshy); linked when sourceHref is set
 * @property {string} [sourceHref] — page where the asset was downloaded
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
 * @property {MarketingImageCredit} [imageCredit]
 * @property {{ src: string, alt: string, credit?: string, imageCredit?: MarketingImageCredit }[]} [gallery]
 * @property {{ src: string, alt: string }[]} [marquee]
 * @property {string} [videoSrc]
 * @property {boolean} [videoPoster] — split video: use imageSrc as poster (default false)
 * @property {string} [ctaLabel]
 * @property {string} [ctaHref] — mailto: or https: link (refrct teaser)
 * @property {'scroll-top' | 'browse' | 'load-sample'} [ctaAction]
 * @property {{ question: string, answer: string }[]} [faq]
 * @property {MarketingProCard[]} [cards]
 * @property {string} [footerContactEmail] — hidden; copied when “Contact” is pressed
 * @property {string} [footerPrivacyHref]
 * @property {string} [footerAboutHref]
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
      "Your model deserves better than a screenshot. Whether it's a photogrammetry scan, a game asset, or an SVG turned 3D mesh — inspect it, present it, export it without ever leaving the tab. Capture your assets the way they were meant to be seen, ready for your website, portfolio or next presentation.",
  },
  {
    type: 'split',
    id: 'orby-marketing-present',
    eyebrow: 'Set the stage',
    title: 'Your virtual studio, in the browser',
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
    title: 'Drop in — Start immediately',
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
    imageSrc: './assets/marketing/orby-section02-dropitin.jpg',
    imageAlt: 'Drag-and-drop import in Orby with a 3D model in the viewport',
    imageCredit: {
      title: 'Lemur on a Rock',
      artist: '@cyber_fox',
      sourceLabel: 'Meshy',
      sourceHref:
        'https://www.meshy.ai/sv/3d-models/Lemur-on-a-Rock-v2-019ccee8-c882-758d-b3d9-0941c257dd65',
    },
  },
  {
    type: 'split',
    id: 'orby-marketing-camera',
    eyebrow: 'Camera & FX',
    title: 'Pro framing in\nthe\u00a0viewport',
    lede:
      'Orbit, pan, and zoom with focus shortcuts, auto-orbit presentations, exposure tools, and a live histogram when you need precision.',
    bullets: [
      'FOV, tilt, and camera presets for repeatable shots',
      'Composition grid and 21∶9 letterbox for cinematic framing',
      'Auto exposure plus manual grade stack in one tab',
    ],
    layout: 'media-left',
    gallery: [
      {
        src: './assets/marketing/orby-section03-camerafx.jpg',
        alt: 'Jeep Wrangler Adventure Rubicon render with Camera & FX framing in Orby',
        imageCredit: {
          title: 'Jeep Wrangler Adventure Rubicon',
          artist: 'www.vecarz.com',
          sourceLabel: 'Sketchfab',
          sourceHref:
            'https://sketchfab.com/3d-models/jeep-wrangler-adventure-rubicon-wwwvecarzcom-aae5b65c544d40a4b8eaf95d907e67cd',
        },
      },
      {
        src: './assets/marketing/orby-section03-camerafx-2.jpg',
        alt: 'Jeep Wrangler Adventure Rubicon with composition grid and letterbox in Orby',
        imageCredit: {
          title: 'Jeep Wrangler Adventure Rubicon',
          artist: 'www.vecarz.com',
          sourceLabel: 'Sketchfab',
          sourceHref:
            'https://sketchfab.com/3d-models/jeep-wrangler-adventure-rubicon-wwwvecarzcom-aae5b65c544d40a4b8eaf95d907e67cd',
        },
      },
      {
        src: './assets/marketing/orby-section03-camerafx-3.jpg',
        alt: 'Jeep Wrangler Adventure Rubicon with Camera & FX and histogram in Orby',
        imageCredit: {
          title: 'Jeep Wrangler Adventure Rubicon',
          artist: 'www.vecarz.com',
          sourceLabel: 'Sketchfab',
          sourceHref:
            'https://sketchfab.com/3d-models/jeep-wrangler-adventure-rubicon-wwwvecarzcom-aae5b65c544d40a4b8eaf95d907e67cd',
        },
      },
    ],
  },
  {
    type: 'showcase',
    id: 'orby-marketing-showcase',
    eyebrow: 'Rendering',
    title: 'Looks this good,\nstraight in the browser',
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
    title: 'Stylized looks\non\u00a0demand',
    lede:
      'Swap the mesh into chrome, glass, plasma, toon, and more — tune motion and scale, then switch off to restore your original materials.',
    bullets: [
      'Non-destructive: your glTF materials return when you disable the preset',
      'Great for social clips, concept boards, and rapid art direction',
    ],
    layout: 'media-left',
    imageSrc: './assets/marketing/orby-section05-shaderlab-01.jpg',
    videoSrc: './assets/marketing/orby-shaderspin-1080p-60mp4.mp4',
    imageAlt: 'Female head anatomy with stylized Shader Lab look in Orby',
    imageCredit: {
      title: 'Female Head Anatomy',
      artist: 'leofinearts',
      sourceLabel: 'Sketchfab',
      sourceHref:
        'https://sketchfab.com/3d-models/female-head-anatomy-0516c68f0da747beaed75a0d762d0e8c',
    },
  },
  {
    type: 'split',
    id: 'orby-marketing-svg',
    eyebrow: 'SVG Extrude',
    title: 'Logos become geometry',
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
    title: 'Deliverables without a pipeline',
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
    title: 'Perfect transparency',
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
    title: 'Built for\nthe\u00a0details',
    lede:
      "There's more under the hood than meets the eye. UV checker, wireframe overlay, clay mode, isometric camera, and much more — the kind of tools you'd expect from a desktop app, running quietly in your browser tab.",
    cards: [
      {
        title: 'Mesh diagnostics',
        body:
          'UV checker, wireframe overlay, and clay mode. Everything you need to sanity-check your mesh without opening a DCC.',
        imageSrc: './assets/marketing/orby-section-pro-meshdiagnostics01.jpg',
        imageAlt: 'Orby viewport with mesh diagnostic overlays',
      },
      {
        title: 'Instant export',
        body:
          'PNG stills, MP4 turntables, or frame sequences — rendered directly from the viewer. No screen capture, no third-party tools.',
        imageSrc: './assets/marketing/export-golden-look.png',
        imageAlt: 'Product render ready for export from Orby',
      },
      {
        title: 'Custom HDRI',
        body:
          'Upload any .jpg, .png, or .hdr to set the mood. Reflections, backdrop, and lighting all follow your file — not a preset.',
        imageSrc: './assets/marketing/custom-hdri-placeholder.png',
        imageAlt: '3D model lit by a custom golden-hour environment in Orby',
      },
    ],
  },
  {
    type: 'faq',
    id: 'orby-marketing-faq',
    eyebrow: 'FAQ',
    title: 'Questions, answered',
    /* No lede — eyebrow + headline only. Pro→FAQ dark seam = gap-big (220px @ 1440); see --orby-marketing-pro-faq-gap. */
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
    title: 'Try it out\nfor free now',
    lede: '',
    ctaLabel: 'Browse Files',
    secondaryCtaLabel: 'Load Sample',
    footerContactEmail: 'orby-admin@proton.me',
    footerPrivacyHref: './legal/privacy-policy.html',
    footerAboutHref: './about/',
    footerCreditsHref: './credits/',
    footerGithubHref: 'https://github.com/stellanjoh2/orby',
    footerLicenseHref: './LICENSE',
  },
  {
    type: 'refrct-teaser',
    id: 'orby-marketing-refrct',
    eyebrow: 'In progress',
    title: 'Do you enjoy Orby? We got more things coming',
    lede:
      "rfrct is a design tool for distorting type and building audio-reactive visuals, right in the browser. Bend your letters through glass, push them through waves, blur the edges until they frost over. Dial in chromatic aberration, layer on refraction, and let the whole thing react to sound. When you're done, export it as a PNG, a GIF, or straight to MP4 — no plugins, no timelines, no fuss. Early access is limited.",
    layout: 'media-right',
    imageSrc: './assets/marketing/rfrct.jpg',
    videoSrc: './assets/marketing/rfrct.mp4',
    videoPoster: true,
    imageAlt: 'Refrct design tool — distorted type in the browser',
    ctaLabel: 'Request Preview',
    ctaHref: 'mailto:hello@rfrct.app?subject=rfrct%20early%20access',
  },
];
