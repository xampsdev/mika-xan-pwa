/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: string;
}

export interface DocumentProcessingResult {
  dataUrl: string;
  isPdf: boolean;
  pageCount: number;
  message?: string;
}

/**
 * Resizes and compresses any uploaded or camera photo into a lightweight
 * DataURL string (~30KB-80KB) using an HTML5 <canvas>.
 * Designed for direct storage in Firestore Pet.photoUrl (Spark plan compatible,
 * zero timeout error, 100% offline-ready).
 */
export async function compressImageToDataUrl(
  file: File,
  maxWidth = 600,
  quality = 0.7,
  mimeType = 'image/webp'
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao carregar a imagem na memória.'));

      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Contexto Canvas 2D indisponível.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = '';
        try {
          dataUrl = canvas.toDataURL(mimeType, quality);
          // Fallback if browser does not support requested mimeType
          if (!dataUrl || !dataUrl.startsWith(`data:${mimeType}`)) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
        } catch {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Client-side PDF page 1 renderer:
 * Parses page 1 of a PDF file using pdfjs-dist entirely in the browser,
 * renders its viewport onto an HTML5 canvas with crisp resolution (1.5x - 2.0x),
 * and compresses it to a lightweight WebP DataURL (< 100KB) for direct Firestore storage.
 */
export async function convertPdfPageToDataUrl(
  file: File,
  scale = 1.75,
  maxWidth = 900,
  quality = 0.75
): Promise<{ dataUrl: string; pageCount: number; isMultiPage: boolean }> {
  try {
    const pdfjsLib = await import('pdfjs-dist');

    // Configure client-side worker using reliable cdnjs matching installed major version
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;

    const pageCount = pdfDoc.numPages;
    const isMultiPage = pageCount > 1;

    // Render strictly page 1
    const page = await pdfDoc.getPage(1);
    const unscaledViewport = page.getViewport({ scale: 1 });

    // Calculate optimal scale respecting maxWidth
    let actualScale = scale;
    if (unscaledViewport.width * actualScale > maxWidth) {
      actualScale = maxWidth / unscaledViewport.width;
    }

    const viewport = page.getViewport({ scale: actualScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Contexto Canvas 2D indisponível para renderização do PDF.');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Convert canvas to lightweight WebP DataURL (< 100KB)
    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/webp', quality);
      if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
    } catch {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    return {
      dataUrl,
      pageCount,
      isMultiPage,
    };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    if (errMessage.toLowerCase().includes('password')) {
      throw new Error('O arquivo PDF está protegido por senha. Por favor, anexe uma versão desbloqueada.');
    }
    throw new Error(`Falha ao ler o arquivo PDF: ${errMessage || 'Arquivo inválido ou corrompido.'}`);
  }
}

/**
 * Universal Vaccination Document Processor (Images & PDFs):
 * Routes image/* through compressImageToDataUrl and application/pdf through convertPdfPageToDataUrl.
 */
export async function processVaccinationCardFile(file: File): Promise<DocumentProcessingResult> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const { dataUrl, pageCount, isMultiPage } = await convertPdfPageToDataUrl(file);
    let message: string | undefined;
    if (isMultiPage) {
      message = `PDF com ${pageCount} páginas detectado. A página 1 foi salva com sucesso como comprovante principal.`;
    }
    return {
      dataUrl,
      isPdf: true,
      pageCount,
      message,
    };
  }

  // Standard image file (JPEG, PNG, WebP, HEIC/browser-supported)
  const dataUrl = await compressImageToDataUrl(file, 850, 0.75, 'image/webp');
  return {
    dataUrl,
    isPdf: false,
    pageCount: 1,
  };
}

/**
 * Backward-compatible wrapper returning both Blob and DataURL
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<{ blob: Blob; dataUrl: string }> {
  const { maxDimension = 600, quality = 0.7, mimeType = 'image/jpeg' } = options;
  const dataUrl = await compressImageToDataUrl(file, maxDimension, quality, mimeType);
  const blob = await fetch(dataUrl).then((r) => r.blob());
  return { blob, dataUrl };
}
