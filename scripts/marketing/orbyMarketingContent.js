/**
 * Copy + media map for the homepage marketing one-pager.
 * Swap imageSrc / videoSrc paths as real captures land. Set videoPoster: true to use imageSrc as a poster frame.
 * Fast GIF-like flip: pro card `flipGallery` (2 images) or split `gallery` + `galleryFlip: true` (default 1s, hard cut).
 *
 * Section naming:
 * - CTA — lime “Try it out for free now” block (type: `cta`)
 * - In Progress — white rfrct teaser panel (type: `in-progress`)
 * - Footer — brand, legal strip, social (`.orby-marketing__footer-bar`); link fields live on the CTA section
 *
 * After editing marketing copy here, regenerate the review export:
 *   npm run export:marketing-copy
 */

/** @typedef {'intro' | 'split' | 'showcase' | 'marquee' | 'pro' | 'roadmap' | 'faq' | 'cta' | 'in-progress'} MarketingSectionType */

/**
 * @typedef {Object} MarketingGallerySlide
 * @property {string} src
 * @property {string} alt
 */

/**
 * @typedef {Object} MarketingProCard
 * @property {string} title
 * @property {string} body
 * @property {string} [imageSrc]
 * @property {string} [imageAlt]
 * @property {string} [videoSrc]
 * @property {boolean} [videoPoster] — use imageSrc as poster while the clip loads
 * @property {MarketingGallerySlide[]} [flipGallery] — 2+ frames; GIF-like fast flip (see flipGalleryIntervalMs)
 * @property {number} [flipGalleryIntervalMs] — ms between frames (default 1000)
 * @property {number} [flipGalleryFadeMs] — crossfade seconds; 0 = hard cut (default 0)
 * @property {MarketingImageCredit} [imageCredit] — listed on the credits page only (not shown on the card)
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
 * @property {string[]} [gradientPhrases] — substrings in lede/body rendered with animated lime↔purple gradient
 * @property {string[]} [bullets]
 * @property {'media-left' | 'media-right'} [layout]
 * @property {string} [imageSrc]
 * @property {string} [imageAlt]
 * @property {MarketingImageCredit} [imageCredit]
 * @property {{ src: string, alt: string, credit?: string, imageCredit?: MarketingImageCredit }[]} [gallery]
 * @property {boolean} [galleryFlip] — with gallery: fast 2-frame flip instead of slow crossfade
 * @property {number} [flipGalleryIntervalMs]
 * @property {number} [flipGalleryFadeMs]
 * @property {{ src: string, alt: string }[]} [marquee]
 * @property {string} [videoSrc]
 * @property {boolean} [videoPoster] — split video: use imageSrc as poster (default false)
 * @property {string} [ctaLabel]
 * @property {string} [ctaHref] — mailto: or https: link (In Progress section)
 * @property {'scroll-top' | 'browse' | 'load-sample'} [ctaAction]
 * @property {{ question: string, answer: string }[]} [faq]
 * @property {MarketingProCard[]} [cards]
 * @property {string} [footerContactEmail] — hidden; copied when “Contact” is pressed
 * @property {string} [footerPrivacyHref]
 * @property {string} [footerAboutHref]
 * @property {string} [footerCreditsHref]
 * @property {string} [footerSupportHref]
 * @property {string} [footerStatsHref]
 * @property {string} [footerBrandHref]
 * @property {string} [footerGithubHref]
 * @property {string} [footerInstagramHref]
 * @property {string} [footerLicenseHref]
 */

/** @type {MarketingSection[]} */
export const MARKETING_SECTIONS = [
  {
    type: 'intro',
    id: 'orby-marketing-intro',
    title: 'Drop it in.\nSet the stage.\nSend it.',
    lede:
      "Your 3D models deserve better. Whether it's a photogrammetry scan, a game asset, or your logotype extruded into a mesh — inspect it, present it, export it without ever leaving the tab. Capture your assets the way they were meant to be seen, ready for your website, portfolio or next presentation.",
    gradientPhrases: ['deserve better'],
  },
  {
    type: 'split',
    id: 'orby-marketing-present',
    eyebrow: 'Set the stage',
    title: 'Your virtual studio, in the browser',
    lede:
      'Achieve photorealism without leaving the browser. Every tool you need to light, grade, and present your model is right here — reacting in real time while you orbit the shot.',
    bullets: [
      'Look Filter presets, luminance curve, and full color grade',
      'Real lenses — depth of field, chromatic aberration, lens flare, lens dirt, bloom, grain, anamorphic streaks, and tone mapping',
      'PBR / real materials — metalness, roughness, normals, and emissive as authored',
    ],
    layout: 'media-left',
    imageSrc: './assets/marketing/present-cinema-look.png',
    videoSrc: './assets/marketing/orby-marketing-microreel.mp4',
    imageAlt: 'Lighting and grading a model in Orby',
    imageCredit: {
      title: '(FREE) Porsche 911 Carrera 4S',
      artist: 'Lionsharp Studios',
      sourceLabel: 'Sketchfab',
      sourceHref:
        'https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf',
    },
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
        src: './assets/marketing/orby-marketing-promo1.jpg',
        alt: 'Racing spaceships hero render — three-quarter view in Orby',
        imageCredit: {
          title: 'Racing spaceships',
          artist: 'pebegou',
          sourceLabel: 'Fab',
          sourceHref:
            'https://www.fab.com/listings/1b2f7565-c9ad-433e-9a19-96c6687a55cd',
        },
      },
      {
        src: './assets/marketing/orby-marketing-promo2.jpg',
        alt: 'Racing spaceships — same ship, underside view with lens flare in Orby',
        imageCredit: {
          title: 'Racing spaceships',
          artist: 'pebegou',
          sourceLabel: 'Fab',
          sourceHref:
            'https://www.fab.com/listings/1b2f7565-c9ad-433e-9a19-96c6687a55cd',
        },
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
    videoSrc: './assets/marketing/orby-feature-3dlogo.mp4',
    imageAlt: 'SVG extrude — logotype as layered 3D geometry in Orby',
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
    imageSrc: './assets/marketing/orby-feature-sendit.jpg',
    imageAlt: 'Export stills, video, and sequences from Orby',
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
    eyebrow: 'LIGHT CONTROL',
    title: 'Goes a lot deeper\nthan you think',
    lede:
      "It's not just a viewer. It's a studio. UV checker, wireframe, clay mode, isometric camera, ColorChecker, onset reference kit, a dynamic curved studio backdrop — and the list goes on. The kind of tooling you'd expect from a desktop app, running quietly in your browser tab.",
    cards: [
      {
        title: 'Light Control',
        body:
          'Key, fill, and rim — a full studio rig ready in seconds. Per-light intensity, height, and rotation, with orbit and shadow control built in.',
        videoSrc: './assets/marketing/orby-feature-lights.mp4',
        imageAlt: 'Three-point lighting rig orbiting a product render in Orby',
      },
      {
        title: 'Mesh Diagnostics',
        body:
          'UV checker, wireframe overlay, and clay mode. Everything you need to sanity-check your mesh without opening a DCC.',
        flipGallery: [
          {
            src: './assets/marketing/pro-feature1-shoes01.jpg',
            alt: 'Sneaker product render in Orby',
          },
          {
            src: './assets/marketing/pro-feature1-shoes02.jpg',
            alt: 'Same sneaker with wireframe overlay in Orby',
          },
          {
            src: './assets/marketing/pro-feature1-shoes03.jpg',
            alt: 'Same sneaker with UV checker in Orby',
          },
          {
            src: './assets/marketing/pro-feature1-shoes04.jpg',
            alt: 'Same sneaker in clay mode in Orby',
          },
        ],
        flipGalleryIntervalMs: 2000,
        flipGalleryFadeMs: 0.405,
      },
      {
        title: 'Animation Preview',
        body:
          'Rigged clips, baked cycles, and timeline scrub. Everything you need to preview motion before you export — no DCC required.',
        videoSrc: './assets/marketing/orby-dancing-compressed.mp4',
        imageAlt: 'Orby mascot previewing animation playback in the viewport',
      },
      {
        title: 'Custom HDRI',
        body:
          'Drop your own 2:1 environment — HDR, EXR, JPG, or PNG — and light your model with your studio, location, or client asset. Same controls as the built-in library. Nothing leaves your machine.',
        videoSrc: './assets/marketing/orby-feature-custom-hdri.mp4',
        imageAlt: 'Custom HDRI upload lighting a product render in Orby',
      },
      {
        title: 'Spotlight Gobos',
        body:
          'Palm, leaf, and tree gobos on the key light — dappled shadows and instant mood. Softness, scale, and rotation without a single flag.',
        imageSrc: './assets/marketing/pro-feature-gobos.jpg',
        imageAlt: 'Key-light gobo projection with palm shadow pattern in Orby',
      },
      {
        title: 'Isometric Camera',
        body:
          "Switch to isometric view, step 45° around your model, and export 2D game assets exactly as they'll appear in your world.",
        flipGallery: [
          {
            src: './assets/marketing/orby-marketing-isocamera-01.jpg',
            alt: 'Medieval cottage render with isometric camera lock in Orby',
          },
          {
            src: './assets/marketing/orby-marketing-isocamera-02.jpg',
            alt: 'Same cottage from a stepped isometric angle in Orby',
          },
          {
            src: './assets/marketing/orby-marketing-isocamera-03.jpg',
            alt: 'Same cottage from another stepped isometric angle in Orby',
          },
        ],
        flipGalleryIntervalMs: 2000,
        flipGalleryFadeMs: 0.405,
      },
      {
        title: 'Look Filters',
        body:
          'Cinematic presets, luminance curve, and full color grade — everything you need to land the mood before export. No round trip through Lightroom.',
        flipGallery: [
          {
            src: './assets/marketing/orby-marketing-lookfilter-01.jpg',
            alt: 'Product render with a cinematic look filter preset in Orby',
          },
          {
            src: './assets/marketing/orby-marketing-lookfilter-02.jpg',
            alt: 'Same model with a different look filter grade in Orby',
          },
          {
            src: './assets/marketing/orby-marketing-lookfilter-03.jpg',
            alt: 'Same model with another look filter preset in Orby',
          },
          {
            src: './assets/marketing/orby-marketing-lookfilter-04.jpg',
            alt: 'Same model with a warm look filter treatment in Orby',
          },
          {
            src: './assets/marketing/orby-marketing-lookfilter-05.jpg',
            alt: 'Same model with a high-contrast look filter grade in Orby',
          },
        ],
        flipGalleryIntervalMs: 2000,
        flipGalleryFadeMs: 0.405,
      },
      {
        title: 'Lens Effects',
        body:
          'Lens flare, dirt, and chromatic aberration — optical polish on your hero without a post round trip. Dial intensity, color, and quality in realtime.',
        videoSrc: './assets/marketing/orby-feature-lensflare.mp4',
        videoPoster: true,
        imageSrc: './assets/marketing/orby-feature-lensflare.jpg',
        imageAlt: 'Product render with lens flare and chromatic aberration in Orby',
        imageCredit: {
          title: 'Space Station 3',
          artist: 're1monsen',
          sourceLabel: 'Sketchfab',
          sourceHref:
            'https://sketchfab.com/3d-models/space-station-3-a7a6ad10261149cab31aa394bfcf8940',
        },
      },
      {
        title: 'Color Reference',
        body:
          'Reference spheres, ColorChecker, lit/unlit toggle — everything you need to validate your grade and match your CG to the real world.',
        flipGallery: [
          {
            src: './assets/marketing/orby-feature-colorchecker.jpg',
            alt: 'Racing spaceship on a reflective podium with ColorChecker and reference spheres in Orby',
          },
          {
            src: './assets/marketing/orby-feature-colorchecker-b.jpg',
            alt: 'Racing spaceship from below with ColorChecker chart and reference spheres in Orby',
          },
        ],
        flipGalleryIntervalMs: 2000,
        flipGalleryFadeMs: 0.405,
      },
    ],
  },
  {
    type: 'roadmap',
    id: 'orby-marketing-roadmap',
    eyebrow: "What's coming",
    title: 'Roadmap',
    lede:
      "A lot is already here. A lot more is coming. Features get added, timelines shift, and we're always building — but this is our best outline of what's next and when to expect it.",
    gradientPhrases: ['A lot more is coming'],
  },
  {
    type: 'faq',
    id: 'orby-marketing-faq',
    eyebrow: 'FAQ',
    title: 'Questions, answered',
    /* No lede — eyebrow + headline only. Roadmap→FAQ dark seam = gap-big on roadmap padding-bottom. */
    faq: [
      {
        question: 'Who is Orby for?',
        answer:
          'Orby is built for 3D artists who need a fast, clean view without booting up a full DCC — and for designers who need to present 3D content without a pipeline. AI-generated models, product visuals, client presentations, logo extrusions. No setup, no commitment. Just your file and an instant virtual studio.',
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
    type: 'cta',
    id: 'orby-marketing-cta',
    title: 'Try it out\nfor free now',
    lede: '',
    ctaLabel: 'Browse Files',
    secondaryCtaLabel: 'Load Sample',
    footerContactEmail: 'orby-admin@proton.me',
    footerPrivacyHref: './legal/privacy-policy.html',
    footerAboutHref: './about/',
    footerCreditsHref: './credits/',
    footerSupportHref: './support/',
    footerStatsHref: './stats/',
    footerBrandHref: './brand/',
    footerGithubHref: 'https://github.com/stellanjoh2/orby',
    footerInstagramHref: 'https://www.instagram.com/dropittoorby',
    footerLicenseHref: './LICENSE',
  },
  {
    type: 'in-progress',
    id: 'orby-marketing-in-progress',
    eyebrow: 'In progress',
    title: 'Do you enjoy Orby? We got more things coming soon',
    gradientPhrases: ['more things'],
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
