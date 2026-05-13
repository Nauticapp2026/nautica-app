'use client';

import { useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X } from 'lucide-react';

const MAX_OUTPUT_WIDTH = 1920;

type Props = {
  file: File;
  aspect: number;
  recommendedSize?: string;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
};

export function ImageCropperModal({ file, aspect, recommendedSize, onCancel, onConfirm }: Props) {
  // El componente se monta una vez por archivo (el padre cierra y vuelve a
  // abrir el modal para cada nuevo file), así que crear el ObjectURL una sola
  // vez al primer render alcanza. Limpieza al desmontar.
  const [imgSrc] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => URL.revokeObjectURL(imgSrc), [imgSrc]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initial = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
      width,
      height,
    );
    setCrop(initial);
  };

  const handleConfirm = async () => {
    setError(null);
    const image = imgRef.current;
    if (!image || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      setError('Seleccioná una región para recortar.');
      return;
    }
    setBusy(true);
    try {
      const blob = await renderCropToBlob(image, completedCrop, file.type);
      const filename = renameToJpeg(file.name);
      const cropped = new File([blob], filename, { type: blob.type });
      onConfirm(cropped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo recortar la imagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#101828' }}>
              Recortar imagen
            </h2>
            {recommendedSize && (
              <p className="mt-0.5 text-sm" style={{ color: '#669E9D' }}>
                Tamaño recomendado: {recommendedSize}
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-[8px] p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-gray-200" />

        <div className="flex-1 overflow-auto bg-[#F9FAFB] p-6">
          <div className="flex justify-center">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              keepSelection
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imgSrc}
                alt="Recortar"
                onLoad={onImageLoad}
                style={{ maxHeight: '60vh' }}
              />
            </ReactCrop>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[10px] border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#101828] hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !completedCrop || completedCrop.width === 0}
            className="rounded-[10px] bg-[#175861] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f4249] disabled:opacity-60"
          >
            {busy ? 'Procesando…' : 'Aplicar recorte'}
          </button>
        </div>
      </div>
    </div>
  );
}

async function renderCropToBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
  inputType: string,
): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const sourceX = Math.round(crop.x * scaleX);
  const sourceY = Math.round(crop.y * scaleY);
  const sourceW = Math.round(crop.width * scaleX);
  const sourceH = Math.round(crop.height * scaleY);

  // Limitamos el output a 1920px de ancho — suficiente para un banner mobile
  // y mantiene el archivo razonable.
  const scale = sourceW > MAX_OUTPUT_WIDTH ? MAX_OUTPUT_WIDTH / sourceW : 1;
  const outW = Math.round(sourceW * scale);
  const outH = Math.round(sourceH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el canvas para el recorte.');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, outW, outH);

  // PNG conserva transparencia, JPG es más liviano. Para fotos de comunicaciones
  // (donde no hay transparencia útil) JPEG con quality 0.9 está bien y achica
  // bastante el archivo.
  const mime = inputType === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = mime === 'image/jpeg' ? 0.9 : undefined;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('No se pudo generar el blob de la imagen recortada.'));
        else resolve(blob);
      },
      mime,
      quality,
    );
  });
}

function renameToJpeg(original: string): string {
  // Si el resultado va a ser JPEG, normalizo la extensión así no queda como
  // "foto.heic" con un blob image/jpeg adentro.
  const base = original.replace(/\.[^.]+$/, '');
  return `${base}.jpg`;
}
