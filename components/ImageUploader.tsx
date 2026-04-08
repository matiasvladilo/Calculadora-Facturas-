"use client";

import { useRef, useState, useEffect } from "react";
import { Camera, X, ImageUp, ClipboardPaste } from "lucide-react";

interface Props {
  onImage: (file: File) => void;
  preview: string | null;
  onClear: () => void;
  disabled: boolean;
}

// Convierte cualquier imagen (HEIC, BMP, WEBP, etc.) a JPEG vía canvas
// Garantiza que Anthropic siempre recibe un formato soportado
function toJpeg(source: File | Blob): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(new File([blob], "factura.jpg", { type: "image/jpeg" }));
          else reject(new Error("No se pudo convertir la imagen"));
        },
        "image/jpeg",
        0.92
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagen inválida")); };
    img.src = url;
  });
}

export default function ImageUploader({ onImage, preview, onClear, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState(false);

  async function processFile(source: File | Blob) {
    try {
      const jpeg = await toJpeg(source);
      onImage(jpeg);
    } catch {
      // Si la conversión falla (ej. archivo corrupto), ignorar
    }
  }

  // Paste global Ctrl+V / Cmd+V
  useEffect(() => {
    if (preview) return;
    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            await processFile(file);
            setPasted(true);
            setTimeout(() => setPasted(false), 1500);
          }
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    e.target.value = "";
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }

  if (preview) {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-zinc-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Factura" className="w-full object-contain max-h-64" />
        {!disabled && (
          <button onClick={onClear} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
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

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
          pasted ? "border-emerald-400 bg-emerald-50"
          : dragging ? "border-black bg-zinc-100"
          : "border-zinc-300 bg-zinc-50 active:bg-zinc-100"
        }`}
      >
        <ImageUp size={32} className={dragging ? "text-black" : pasted ? "text-emerald-500" : "text-zinc-400"} />
        <div className="text-center">
          <p className={`text-sm font-semibold ${dragging ? "text-black" : pasted ? "text-emerald-600" : "text-zinc-600"}`}>
            {pasted ? "¡Imagen pegada!" : dragging ? "Suelta aquí" : "Arrastra o toca para subir"}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">También puedes pegar con Ctrl+V</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={async () => {
            try {
              const items = await navigator.clipboard.read();
              for (const item of items) {
                const imgType = item.types.find((t) => t.startsWith("image/"));
                if (imgType) {
                  const blob = await item.getType(imgType);
                  await processFile(blob);
                  break;
                }
              }
            } catch {
              // clipboard.read() puede fallar por permisos — el paste Ctrl+V sigue disponible
            }
          }}
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-zinc-200 bg-white active:bg-zinc-50 transition"
        >
          <ClipboardPaste size={18} className="text-zinc-500" />
          <span className="text-sm font-medium text-zinc-600">Pegar</span>
        </button>

        <button
          onClick={() => cameraRef.current?.click()}
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-zinc-200 bg-white active:bg-zinc-50 transition"
        >
          <Camera size={18} className="text-zinc-500" />
          <span className="text-sm font-medium text-zinc-600">Cámara</span>
        </button>
      </div>
    </div>
  );
}
