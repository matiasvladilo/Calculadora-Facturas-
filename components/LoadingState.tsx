"use client";

interface Props {
  streamText?: string;
}

export default function LoadingState({ streamText }: Props) {
  // Extraer solo la parte del análisis (antes del JSON) para mostrar
  const analisis = streamText
    ? streamText.replace(/<json>[\s\S]*/i, "").replace(/<\/?analisis>/gi, "").trim()
    : "";

  const lineas = analisis
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(-6); // mostrar solo las últimas líneas

  return (
    <div className="flex flex-col items-center py-12 gap-5">
      <div className="w-10 h-10 border-4 border-zinc-200 border-t-black rounded-full animate-spin" />
      <p className="text-sm text-zinc-500 font-medium">Analizando factura...</p>

      {lineas.length > 0 && (
        <div className="w-full bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 space-y-1">
          {lineas.map((linea, i) => (
            <p
              key={i}
              className="text-xs text-zinc-400 leading-relaxed"
              style={{ opacity: 0.4 + (i / lineas.length) * 0.6 }}
            >
              {linea}
            </p>
          ))}
          <span className="inline-block w-1.5 h-3.5 bg-zinc-400 rounded-sm animate-pulse ml-0.5" />
        </div>
      )}
    </div>
  );
}
