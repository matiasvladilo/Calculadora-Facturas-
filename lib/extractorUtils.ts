const CAMPOS_NUMERICOS = [
  "precio_neto_unitario", "precio_bruto_unitario",
  "precio_neto_total", "precio_bruto_total",
  "cantidad", "descuento_monto", "descuento_pct",
  "ila_porcentaje", "impuesto_adicional",
];

export function sanitizarNumero(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  let s = String(val).trim().replace(/[$ ]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+,0+$/.test(s)) {
    s = s.replace(/,0+$/, "");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parsearRespuesta(
  raw: string
): { productos: Record<string, unknown>[] } | { error: string; debug?: string } {
  let jsonStr: string | null = null;

  // Prioridad: array directo, luego tags <json>, luego bloque markdown
  const directMatch = raw.trim().match(/^\s*(\[[\s\S]*\])\s*$/);
  if (directMatch) jsonStr = directMatch[1];
  if (!jsonStr) {
    const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) jsonStr = codeMatch[1].trim();
  }
  if (!jsonStr) {
    const jsonTagMatch = raw.match(/<json>([\s\S]*?)<\/json>/);
    if (jsonTagMatch) {
      const inner = jsonTagMatch[1].trim();
      const arrayMatch = inner.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }
  }
  if (!jsonStr) {
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];
  }
  if (!jsonStr) {
    return {
      error: "No se pudieron extraer productos. Intenta con mejor iluminación o recortá solo la tabla.",
      debug: raw.slice(0, 800),
    };
  }

  let productos;
  try {
    productos = JSON.parse(jsonStr);
  } catch {
    return { error: "Error al interpretar la respuesta. Intenta de nuevo.", debug: jsonStr.slice(0, 500) };
  }

  if (!Array.isArray(productos) || productos.length === 0) {
    return { error: "No se encontraron productos en la imagen." };
  }

  productos = productos.map((p: Record<string, unknown>) => {
    const limpio = { ...p };
    for (const campo of CAMPOS_NUMERICOS) {
      limpio[campo] = sanitizarNumero(limpio[campo]);
    }
    return limpio;
  });

  return { productos };
}
