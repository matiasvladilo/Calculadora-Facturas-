"use client";

import { useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import MultiplierSelector from "@/components/MultiplierSelector";
import ProductCard from "@/components/ProductCard";
import LoadingState from "@/components/LoadingState";
import { ProcessedProduct, RawProduct } from "@/lib/types";
import { calcularProducto, recalcularVenta } from "@/lib/calculations";
import { ReceiptText, RefreshCw, PlusCircle, Trash2 } from "lucide-react";

interface Factura {
  id: string;
  nombre: string;
  productos: ProcessedProduct[];
}

type Step = "input" | "loading" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [multiplicador, setMultiplicador] = useState(1.5);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      setFacturas((prev) =>
        prev.map((f) => ({
          ...f,
          productos: f.productos.map((p) => recalcularVenta(p, v)),
        }))
      );
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

      if (!res.ok) throw new Error(data.error || "Error del servidor");

      const raw: RawProduct[] = data.productos ?? [];
      const ts = Date.now();
      const processed = raw.map((r, i) => calcularProducto(r, multiplicador, `${i}-${ts}`));

      const nombre = imageFile.name !== "image" ? imageFile.name.replace(/\.[^.]+$/, "") : `Factura ${facturas.length + 1}`;

      setFacturas((prev) => [
        ...prev,
        { id: String(ts), nombre, productos: processed },
      ]);
      setStep("results");
      setImageFile(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setStep(facturas.length > 0 ? "results" : "input");
    }
  }

  function handleReset() {
    setStep("input");
    setPreview(null);
    setImageFile(null);
    setFacturas([]);
    setError(null);
  }

  function handleEliminarFactura(id: string) {
    const nuevas = facturas.filter((f) => f.id !== id);
    setFacturas(nuevas);
    if (nuevas.length === 0) setStep("input");
  }

  function handleUpdateProduct(facturaId: string, id: string, field: "neto" | "bruto" | "venta", value: number) {
    const IVA = 1.19;
    setFacturas((prev) =>
      prev.map((f) => {
        if (f.id !== facturaId) return f;
        return {
          ...f,
          productos: f.productos.map((p) => {
            if (p.id !== id) return p;
            if (field === "neto") return { ...p, neto: value, bruto: Math.round(value * IVA), venta: Math.round(value * multiplicador), editado: true };
            if (field === "bruto") {
              const neto = Math.round(value / IVA);
              return { ...p, bruto: value, neto, venta: Math.round(neto * multiplicador), editado: true };
            }
            return { ...p, venta: value, editado: true };
          }),
        };
      })
    );
  }

  return (
    <div className="flex flex-col flex-1 pb-8">
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
            <MultiplierSelector value={multiplicador} onChange={handleMultiplicadorChange} disabled={false} />

            {facturas.map((factura, fi) => (
              <div key={factura.id} className="flex flex-col gap-3">
                {/* Cabecera de factura */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white bg-black rounded-full w-5 h-5 flex items-center justify-center">
                      {fi + 1}
                    </span>
                    <span className="text-sm font-semibold text-zinc-700 truncate max-w-[220px]">
                      {factura.nombre}
                    </span>
                  </div>
                  <button
                    onClick={() => handleEliminarFactura(factura.id)}
                    className="text-zinc-400 active:text-red-500 transition p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {factura.productos.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onUpdate={(id, field, value) => handleUpdateProduct(factura.id, id, field, value)}
                  />
                ))}
              </div>
            ))}

            {/* Agregar otra factura */}
            {step === "results" && (
              <button
                onClick={() => setStep("input")}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl border-2 border-dashed border-zinc-300 text-zinc-600 font-semibold text-sm active:bg-zinc-100 transition"
              >
                <PlusCircle size={16} />
                Agregar otra factura
              </button>
            )}

            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-zinc-200 text-zinc-500 font-semibold text-sm active:bg-zinc-100 transition"
            >
              <RefreshCw size={15} />
              Empezar de nuevo
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

            <MultiplierSelector value={multiplicador} onChange={handleMultiplicadorChange} disabled={false} />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              {facturas.length > 0 && (
                <button
                  onClick={() => setStep("results")}
                  className="flex-1 py-4 rounded-2xl border-2 border-zinc-200 text-zinc-700 font-bold text-sm active:bg-zinc-100 transition"
                >
                  Volver ({facturas.length})
                </button>
              )}
              <button
                onClick={handleAnalizar}
                disabled={!imageFile}
                className="flex-1 py-4 rounded-2xl bg-black text-white font-bold text-base transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Analizar factura
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
