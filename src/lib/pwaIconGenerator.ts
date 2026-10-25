/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GeneratedIcons {
  appleTouchIcon: string;
  pwa192: string;
  pwa512: string;
  pwaMaskable512: string;
}

let cachedIcons: GeneratedIcons | null = null;
let injectionStarted = false;

/**
 * Creates a smooth 5-stop diagonal linear gradient across the Rose Quartz & Serenity palette.
 */
function createPaletteGradient(ctx: CanvasRenderingContext2D, size: number): CanvasGradient {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#f7cac9');
  grad.addColorStop(0.25, '#dec2cb');
  grad.addColorStop(0.5, '#c5b9cd');
  grad.addColorStop(0.75, '#abb1cf');
  grad.addColorStop(1, '#92a8d1');
  return grad;
}

/**
 * Clears the in-memory icon cache to force re-render from SVG.
 */
export function clearIconCache(): void {
  cachedIcons = null;
}

/**
 * Loads /icon.svg, draws it onto HTML5 canvases with a solid 5-stop Rose Quartz & Serenity
 * gradient base layer at various standard PWA resolutions, and produces valid PNG DataURLs.
 */
export async function generatePwaIconsFromSvg(svgUrl = '/icon.svg'): Promise<GeneratedIcons> {
  if (cachedIcons) {
    return cachedIcons;
  }

  // 1. Fetch SVG text
  const response = await fetch(svgUrl);
  if (!response.ok) {
    throw new Error(`Failed to load SVG from ${svgUrl}: ${response.statusText}`);
  }
  const svgText = await response.text();

  // 2. Load into Image object via Blob
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (err) => reject(new Error('Failed to parse SVG into Image: ' + err));
    img.src = objectUrl;
  });

  const renderToCanvas = (
    size: number,
    useGradientBg = true,
    scalePercent = 1.0
  ): string => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Solid 5-stop gradient base layer prevents black/transparent borders on iOS Safari and Android
    if (useGradientBg) {
      const grad = createPaletteGradient(ctx, size);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.clearRect(0, 0, size, size);
    }

    if (scalePercent === 1.0) {
      ctx.drawImage(img, 0, 0, size, size);
    } else {
      const drawSize = size * scalePercent;
      const offset = (size - drawSize) / 2;
      ctx.drawImage(img, offset, offset, drawSize, drawSize);
    }

    return canvas.toDataURL('image/png');
  };

  // Apple touch icon (180x180): iOS requires fully opaque background
  const appleTouchIcon = renderToCanvas(180, true, 1.0);

  // Standard PWA icons: render with solid 5-stop gradient base layer
  const pwa192 = renderToCanvas(192, true, 1.0);
  const pwa512 = renderToCanvas(512, true, 1.0);

  // Maskable icon: Needs safe-zone margin (80% diameter centered) over solid 5-stop gradient
  const pwaMaskable512 = renderToCanvas(512, true, 0.8);

  URL.revokeObjectURL(objectUrl);

  cachedIcons = {
    appleTouchIcon,
    pwa192,
    pwa512,
    pwaMaskable512,
  };

  return cachedIcons;
}

/**
 * Injects dynamically generated PNG icons into DOM head:
 * - <link rel="apple-touch-icon"> (iOS Safari requires PNG)
 * - Dynamic manifest Blob URL if static PNGs return 404
 */
export async function initPwaIconInjection(): Promise<void> {
  if (injectionStarted || typeof window === 'undefined') return;
  injectionStarted = true;

  try {
    const icons = await generatePwaIconsFromSvg('/icon.svg');

    // 1. Update Apple Touch Icon immediately
    let appleTouchLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (!appleTouchLink) {
      appleTouchLink = document.createElement('link');
      appleTouchLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleTouchLink);
    }
    appleTouchLink.href = icons.appleTouchIcon;

    // 2. Test if static PNGs are available; if 404, construct dynamic Manifest
    let hasStaticPng = false;
    try {
      const checkRes = await fetch('/pwa-192x192.png', { method: 'HEAD' });
      hasStaticPng = checkRes.ok;
    } catch {
      hasStaticPng = false;
    }

    if (!hasStaticPng) {
      const dynamicManifest = {
        id: '/',
        name: 'Mika & Xan - Hospedagem Pet',
        short_name: 'Mika & Xan',
        description: 'Sistema de gestão e ficha cadastral para hospedagem pet com suporte offline e histórico de estadias.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#FAF8F9',
        theme_color: '#92a8d1',
        categories: ['lifestyle', 'utilities', 'business'],
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: icons.pwa192,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: icons.pwa512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: icons.pwaMaskable512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: icons.appleTouchIcon,
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      };

      const manifestBlob = new Blob([JSON.stringify(dynamicManifest, null, 2)], {
        type: 'application/manifest+json',
      });
      const manifestUrl = URL.createObjectURL(manifestBlob);

      let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (manifestLink) {
        manifestLink.href = manifestUrl;
      } else {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        manifestLink.href = manifestUrl;
        document.head.appendChild(manifestLink);
      }
    }
  } catch (err) {
    console.warn('PWA dynamic icon injection warning:', err);
  }
}

/**
 * Triggers client-side download of the 4 rendered PNG files directly from icon.svg
 */
export async function downloadGeneratedIcons(): Promise<{ success: boolean; count: number }> {
  clearIconCache();
  const icons = await generatePwaIconsFromSvg('/icon.svg');

  const files = [
    { name: 'apple-touch-icon.png', dataUrl: icons.appleTouchIcon },
    { name: 'pwa-192x192.png', dataUrl: icons.pwa192 },
    { name: 'pwa-512x512.png', dataUrl: icons.pwa512 },
    { name: 'pwa-maskable-512x512.png', dataUrl: icons.pwaMaskable512 },
  ];

  for (const file of files) {
    const a = document.createElement('a');
    a.href = file.dataUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { success: true, count: files.length };
}
