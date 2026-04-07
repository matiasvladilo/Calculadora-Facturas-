"use client";

import { useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import MultiplierSelector from "@/components/MultiplierSelector";
import ProductCard from "@/components/ProductCard";
import LoadingState from "@/components/LoadingState";
import { ProcessedProduct, RawProduct } from "@/lib/types";
import { calcularProducto, recalcularVenta } from "@/lib/calculations";
import { ReceiptText, RefreshCw } from "lucide-react";

type Step = "input" | "loading" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [multiplicador, setMultiplicador] = useState(1.5);
  const [productos, setProductos] = useState<ProcessedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [textoOCR, setTextoOCR] = useState<string | null>(null);
  const [mostrarOCR, setMostrarOCR] = useState(false);

  function handleImage(file: File) {
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
  }

  function handleClear() {
    setImageFile(null);
    setPreview(null);
    setError(null);
  }

  function handleMultiplicadorChange(v: number) {
    setMultiplicador(v);
    if (step === "results") {
      setProductos((prev) => prev.map((p) => recalcularVenta(p, v)));
    }
  }

  async function handleAnalizar() {
    if (!imageFile) {
      setError("Selecciona una imagen primero");
      return;
    }

    setStep("loading");
    setError(null);

    try {
      const form = new FormData();
      form.append("image", imageFile);

      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();

      if (data.textoOCR) setTextoOCR(data.textoOCR);
      if (!res.ok) throw new Error(data.error || "Error del servidor");

      const raw: RawProduct[] = data.productos ?? [];
      const processed = raw.map((r, i) =>
        calcularProducto(r, multiplicador, `${i}-${Date.now()}`)
      );

      setProductos(processed);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setStep("input");
    }
  }

  function handleReset() {
    setStep("input");
    setPreview(null);
    setImageFile(null);
    setProductos([]);
    setError(null);
    setTextoOCR(null);
    setMostrarOCR(false);
  }

  function handleUpdateProduct(
    id: string,
    field: "neto" | "bruto" | "venta",
    value: number
  ) {
    setProductos((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const IVA = 1.19;
        if (field === "neto") {
          return { ...p, neto: value, bruto: Math.round(value * IVA), venta: Math.round(value * multiplicador), editado: true };
        }
        if (field === "bruto") {
          const neto = Math.round(value / IVA);
          return { ...p, bruto: value, neto, venta: Math.round(neto * multiplicador), editado: true };
        }
        return { ...p, venta: value, editado: true };
      })
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-8">
      {/* Header */}
      <header className="px-4 pt-10 pb-6">
        <div className="flex items-center gap-2">
          <ReceiptText size={22} className="text-black" />
          <h1 className="text-lg font-bold text-zinc-900">Calculadora Facturas</h1>
        </div>
        <p className="text-sm text-zinc-500 mt-1">Sube una foto y calcula precios al instante</p>
      </header>

      <div className="px-4 flex flex-col gap-5 flex-1">
        {step === "loading" ? (
          <LoadingState />
        ) : step === "results" ? (
          <>
            {/* Multiplicador editable en resultados */}
            <MultiplierSelector
              value={multiplicador}
              onChange={handleMultiplicadorChange}
              disabled={false}
            />

            <div className="flex flex-col gap-3">
              {productos.map((p) => (
                <ProductCard key={p.id} product={p} onUpdate={handleUpdateProduct} />
              ))}
            </div>

            {textoOCR && (
              <div className="text-xs text-zinc-400 space-y-1">
                <button
                  onClick={() => setMostrarOCR((v) => !v)}
                  className="underline"
                >
                  {mostrarOCR ? "Ocultar texto OCR" : "Ver texto detectado"}
                </button>
                {mostrarOCR && (
                  <pre className="bg-zinc-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words text-zinc-600">
                    {textoOCR}
                  </pre>
                )}
              </div>
            )}

            <button
              onClick={handleReset}
              className="mt-2 flex items-center justify-center gap-2 w-full py-4 rounded-2xl border-2 border-zinc-200 text-zinc-700 font-semibold text-sm active:bg-zinc-100 transition"
            >
              <RefreshCw size={16} />
              Nueva factura
            </button>
          </>
        ) : (
          <>
            <ImageUploader
              onImage={handleImage}
              preview={preview}
              onClear={handleClear}
              disabled={false}
            />

            <MultiplierSelector
              value={multiplicador}
              onChange={handleMultiplicadorChange}
              disabled={false}
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 space-y-2">
                <p>{error}</p>
                {textoOCR && (
                  <>
                    <button
                      onClick={() => setMostrarOCR((v) => !v)}
                      className="text-xs underline text-red-500"
                    >
                      {mostrarOCR ? "Ocultar" : "Ver texto detectado"}
                    </button>
                    {mostrarOCR && (
                      <pre className="text-xs bg-red-100 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {textoOCR}
                      </pre>
                    )}
                  </>
                )}
              </div>
            )}

            <button
              onClick={handleAnalizar}
              disabled={!imageFile}
              className="w-full py-4 rounded-2xl bg-black text-white font-bold text-base transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Analizar factura
            </button>
          </>
        )}
      </div>
    </div>
  );
}
