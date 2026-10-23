/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: string;
}

/**
 * Resizes and compresses any uploaded or camera photo into a lightweight
 * JPEG DataURL string (~30KB-80KB) using an HTML5 <canvas>.
 * Designed for direct storage in Firestore Pet.photoUrl (Spark plan compatible,
 * zero timeout error, 100% offline-ready).
 */
export async function compressImageToDataUrl(
  file: File,
  maxWidth = 600,
  quality = 0.7
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
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Backward-compatible wrapper returning both Blob and DataURL
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<{ blob: Blob; dataUrl: string }> {
  const { maxDimension = 600, quality = 0.7, mimeType = 'image/jpeg' } = options;
  const dataUrl = await compressImageToDataUrl(file, maxDimension, quality);
  const blob = await fetch(dataUrl).then((r) => r.blob());
  return { blob, dataUrl };
}
