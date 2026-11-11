/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';

interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

/**
 * High-performance full-screen modal lightbox for pet portraits, avatars,
 * and high-resolution vaccination cards/booklets.
 * Features:
 * - Smooth fade & scale entrance transition
 * - Backdrop click-to-close & Esc key listener
 * - Touch-friendly pan & zoom controls (1x, 1.5x, 2x, 2.5x)
 * - Minimum 44x44px accessible touch targets meeting WCAG AAA
 */
export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  title = 'Visualização da Imagem',
  subtitle,
  onClose,
}) => {
  const [scale, setScale] = useState<number>(1);

  // Reset scale whenever a new image opens
  useEffect(() => {
    if (isOpen) {
      setScale(1);
    }
  }, [isOpen, imageUrl]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.5, 0.75));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200"
    >
      {/* Top Floating Control Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-3 inset-x-3 sm:top-5 sm:inset-x-6 flex items-center justify-between pointer-events-auto z-50 max-w-4xl mx-auto"
      >
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl px-3.5 py-2 text-white shadow-xl min-w-0 mr-2">
          <h3 className="text-xs sm:text-sm font-bold truncate text-white tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] sm:text-xs text-white/70 truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Zoom In */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-black/60 hover:bg-black/80 active:scale-95 text-white border border-white/20 flex items-center justify-center transition shadow-lg cursor-pointer"
            title="Aumentar Zoom"
            aria-label="Aumentar Zoom"
          >
            <ZoomIn className="w-5 h-5 text-white" />
          </button>

          {/* Zoom Out */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-black/60 hover:bg-black/80 active:scale-95 text-white border border-white/20 flex items-center justify-center transition shadow-lg cursor-pointer"
            title="Diminuir Zoom"
            aria-label="Diminuir Zoom"
          >
            <ZoomOut className="w-5 h-5 text-white" />
          </button>

          {/* Reset Zoom */}
          {scale !== 1 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="min-w-[44px] min-h-[44px] rounded-2xl bg-black/60 hover:bg-black/80 active:scale-95 text-white border border-white/20 flex items-center justify-center transition shadow-lg cursor-pointer"
              title="Restaurar Tamanho Original"
              aria-label="Restaurar Tamanho Original"
            >
              <RotateCcw className="w-4 h-4 text-white" />
            </button>
          )}

          {/* Download Image */}
          <a
            href={imageUrl}
            download={`imagem_${Date.now()}.jpg`}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-black/60 hover:bg-black/80 active:scale-95 text-white border border-white/20 flex items-center justify-center transition shadow-lg cursor-pointer"
            title="Baixar Imagem"
            aria-label="Baixar Imagem"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="w-4 h-4 text-white" />
          </a>

          {/* Close Modal (Min 44x44px for WCAG AAA) */}
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] active:scale-95 text-white border border-red-400 flex items-center justify-center transition shadow-xl cursor-pointer ml-1"
            title="Fechar Visualização (Esc)"
            aria-label="Fechar Visualização"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Image Display Canvas with Smooth Zoom Transition */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-5xl max-h-[82vh] overflow-auto rounded-3xl p-2 flex items-center justify-center cursor-default no-scrollbar"
      >
        <img
          src={imageUrl}
          alt={title}
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
          className="max-h-[80vh] max-w-[90vw] sm:max-w-4xl object-contain rounded-2xl shadow-2xl transition-transform duration-200 select-none pointer-events-auto"
        />
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none">
        <span className="text-[11px] font-semibold text-white/70 bg-black/60 px-3 py-1 rounded-full border border-white/10 backdrop-blur-xs">
          Toque fora ou pressione <kbd className="font-mono bg-white/20 px-1 rounded">ESC</kbd> para fechar • Zoom: {Math.round(scale * 100)}%
        </span>
      </div>
    </div>
  );
};
