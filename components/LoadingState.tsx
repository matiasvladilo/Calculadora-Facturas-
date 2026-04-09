"use client";

interface Props {
  streamText?: string;
}

const PASOS = [
  "Leyendo factura...",
  "Identificando productos...",
  "Calculando precios...",
];

export default function LoadingState({ streamText }: Props) {
  // Estimamos el paso según cuánto texto llegó
  const len = streamText?.length ?? 0;
  const paso = len === 0 ? 0 : len < 300 ? 1 : 2;

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-10 h-10 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
      <p className="text-sm text-zinc-500 font-medium">{PASOS[paso]}</p>
    </div>
  );
}
