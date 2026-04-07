"use client";

import { useRef, useState } from "react";
import { Camera, Upload, X, ImageUp } from "lucide-react";

interface Props {
  onImage: (file: File) => void;
  preview: string | null;
  onClear: () => void;
  disabled: boolean;
}

export default function ImageUploader({ onImage, preview, onClear, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onImage(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onImage(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Solo desactivar si salimos del contenedor completo
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  }

  if (preview) {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-zinc-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Factura" className="w-full object-contain max-h-64" />
        {!disabled && (
          <button
            onClick={onClear}
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
          >
            <X size={18} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

      {/* Zona drag & drop */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
          dragging
            ? "border-black bg-zinc-100 scale-[0.99]"
            : "border-zinc-300 bg-zinc-50 active:bg-zinc-100"
        }`}
      >
        <ImageUp size={32} className={dragging ? "text-black" : "text-zinc-400"} />
        <div className="text-center">
          <p className={`text-sm font-semibold ${dragging ? "text-black" : "text-zinc-600"}`}>
            {dragging ? "Suelta aquí" : "Arrastra la factura aquí"}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">o toca para buscar archivo</p>
        </div>
      </div>

      {/* Botón cámara (mobile) */}
      <button
        onClick={() => cameraRef.current?.click()}
        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-zinc-200 bg-white active:bg-zinc-50 transition"
      >
        <Camera size={20} className="text-zinc-500" />
        <span className="text-sm font-medium text-zinc-600">Usar cámara</span>
      </button>
    </div>
  );
}
