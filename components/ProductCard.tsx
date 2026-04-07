"use client";

import { useState } from "react";
import { ProcessedProduct } from "@/lib/types";
import { Pencil, Check, Tag, AlertTriangle } from "lucide-react";

interface Props {
  product: ProcessedProduct;
  onUpdate: (id: string, field: "neto" | "bruto" | "venta", value: number) => void;
}

function fmt(n: number): string {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

interface RowProps {
  label: string;
  value: number;
  field: "neto" | "bruto" | "venta";
  highlight?: boolean;
  onSave: (field: "neto" | "bruto" | "venta", value: number) => void;
}

function EditableRow({ label, value, field, highlight, onSave }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function save() {
    const n = parseInt(draft.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > 0) onSave(field, n);
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
      <span className={`text-sm w-16 ${highlight ? "font-semibold text-zinc-800" : "text-zinc-500"}`}>
        {label}
      </span>
      {editing ? (
        <div className="flex items-center gap-2 flex-1 justify-end">
          <input
            autoFocus
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="border-b-2 border-black text-right text-base font-bold w-28 focus:outline-none"
          />
          <button onClick={save} className="text-black"><Check size={18} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold ${highlight ? "text-emerald-600" : "text-zinc-700"}`}>
            {fmt(value)}
          </span>
          <button onClick={() => { setDraft(String(value)); setEditing(true); }} className="text-zinc-400">
            <Pencil size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProductCard({ product, onUpdate }: Props) {
  const [verSinDto, setVerSinDto] = useState(true);

  const {
    id, producto, cantidad, unidad, neto, bruto, venta,
    neto_sin_dto, bruto_sin_dto, venta_sin_dto,
    descuento_monto, descuento_pct, impuesto_adicional, rayado,
    precio_total,
  } = product;

  const tieneDescuento = (descuento_monto && descuento_monto > 0) || (descuento_pct && descuento_pct > 0);
  const tieneImpAdicional = impuesto_adicional && impuesto_adicional > 0;

  const subtitulo = cantidad
    ? `${cantidad} ${unidad} · ${fmt(precio_total)} total`
    : unidad && unidad !== "un" ? unidad : null;

  const descLabel = descuento_pct
    ? `${descuento_pct}% dto`
    : descuento_monto
    ? `${fmt(descuento_monto)} dto`
    : null;

  if (rayado) {
    return (
      <div className="bg-zinc-100 rounded-2xl border border-zinc-200 p-4 opacity-50">
        <div className="flex items-center gap-2">
          <span className="line-through text-zinc-500 text-sm">{producto}</span>
          <span className="text-xs text-zinc-400 bg-zinc-200 px-2 py-0.5 rounded-full">Anulado</span>
        </div>
      </div>
    );
  }

  const netoActivo = verSinDto ? neto_sin_dto : neto;
  const brutoActivo = verSinDto ? bruto_sin_dto : bruto;
  const ventaActivo = verSinDto ? venta_sin_dto : venta;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-4">
      {/* Cabecera */}
      <div className="mb-3">
        <p className="font-bold text-base text-zinc-900 leading-tight">{producto || "Sin nombre"}</p>
        {subtitulo && <p className="text-xs text-zinc-400 mt-0.5">{subtitulo}</p>}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tieneDescuento && (
            <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              <Tag size={10} />
              {descLabel}
            </span>
          )}
          {tieneImpAdicional && (
            <span className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
              <AlertTriangle size={10} />
              Imp. adicional {fmt(impuesto_adicional!)}
            </span>
          )}
        </div>
      </div>

      {/* Toggle con/sin descuento */}
      {tieneDescuento && (
        <div className="flex rounded-xl overflow-hidden border border-zinc-200 mb-3 text-xs font-semibold">
          <button
            onClick={() => setVerSinDto(false)}
            className={`flex-1 py-1.5 transition ${!verSinDto ? "bg-black text-white" : "text-zinc-500"}`}
          >
            Con descuento
          </button>
          <button
            onClick={() => setVerSinDto(true)}
            className={`flex-1 py-1.5 transition ${verSinDto ? "bg-black text-white" : "text-zinc-500"}`}
          >
            Sin descuento
          </button>
        </div>
      )}

      {/* Precios */}
      <EditableRow label="Neto" value={netoActivo} field="neto" onSave={(f, v) => onUpdate(id, f, v)} />
      <EditableRow label="Bruto" value={brutoActivo} field="bruto" onSave={(f, v) => onUpdate(id, f, v)} />
      <EditableRow label="Venta" value={ventaActivo} field="venta" highlight onSave={(f, v) => onUpdate(id, f, v)} />
    </div>
  );
}
