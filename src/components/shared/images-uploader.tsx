'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { ImageCropperModal } from './image-cropper-modal';

type UploadFn = (file: File) => Promise<{ error?: string; url?: string }>;

export function ImagesUploader({
  urls,
  onChange,
  upload,
  onError,
  max = 10,
  cropAspectRatio,
  recommendedSize,
}: {
  urls: string[];
  onChange: (next: string[]) => void;
  upload: UploadFn;
  onError?: (msg: string) => void;
  max?: number;
  // Si está seteado, antes de subir cada imagen el usuario debe recortarla con
  // este aspect ratio. La selección queda forzada a 1 archivo por vez.
  cropAspectRatio?: number;
  // Texto que se muestra debajo del uploader. Ej: "1200×675 px (16:9)".
  recommendedSize?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);

  const cropEnabled = typeof cropAspectRatio === 'number' && cropAspectRatio > 0;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (urls.length + files.length > max) {
      onError?.(`Podés subir hasta ${max} imágenes.`);
      return;
    }
    if (cropEnabled) {
      // Sólo procesamos uno por vez (el input ya está en single-mode cuando
      // cropEnabled). Después del recorte, el upload arranca.
      setPendingCrop(files[0]);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    await uploadFiles(Array.from(files));
    if (inputRef.current) inputRef.current.value = '';
  };

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    const nuevas: string[] = [];
    for (const file of files) {
      const res = await upload(file);
      if (res.error) {
        onError?.(res.error);
        break;
      }
      if (res.url) nuevas.push(res.url);
    }
    if (nuevas.length > 0) onChange([...urls, ...nuevas]);
    setUploading(false);
  };

  const handleCropConfirm = async (cropped: File) => {
    setPendingCrop(null);
    await uploadFiles([cropped]);
  };

  const remove = (idx: number) => {
    const next = urls.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <div
            key={url}
            className="group relative h-20 w-20 overflow-hidden rounded-[10px] border border-gray-200 bg-gray-50"
          >
            <Image
              src={url}
              alt={`Imagen ${i + 1}`}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
            <button
              type="button"
              onClick={() => remove(i)}
              title="Quitar imagen"
              aria-label="Quitar imagen"
              className="absolute top-1 right-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow group-hover:flex hover:bg-red-600"
            >
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
        ))}
        {urls.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-gray-300 bg-white text-gray-400 transition-colors hover:border-[#175861] hover:text-[#175861] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px]">Agregar</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={!cropEnabled}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <p className="mt-2 text-xs text-gray-500">
        {recommendedSize && (
          <>
            Tamaño recomendado: <span className="font-semibold">{recommendedSize}</span>.{' '}
          </>
        )}
        Hasta {max} imágenes. JPG, PNG, WebP o GIF (máx. 8 MB c/u).
      </p>

      {pendingCrop && cropEnabled && (
        <ImageCropperModal
          file={pendingCrop}
          aspect={cropAspectRatio!}
          recommendedSize={recommendedSize}
          onCancel={() => setPendingCrop(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
