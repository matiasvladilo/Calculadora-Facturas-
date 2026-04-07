import { RawProduct } from "./types";

// Detecta si el documento es boleta (precios brutos) o factura (precios netos)
function detectTipoPrecio(text: string): "neto" | "bruto" {
  const upper = text.toUpperCase();
  if (upper.includes("BOLETA")) return "bruto";
  if (upper.includes("FACTURA") || upper.includes("NETO") || upper.includes("IVA")) return "neto";
  return "neto"; // default seguro para contexto chileno
}

// Limpia y parsea un número en formato chileno: "1.190,50" → 1190 | "1.190" → 1190
function parsePrecio(raw: string): number | null {
  // Eliminar símbolo $ y espacios
  let s = raw.replace(/[$\s]/g, "");
  // Si tiene coma decimal (1.190,50) → remover puntos de miles, reemplazar coma
  if (/\d+\.\d{3},\d+/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/\d+,\d{1,2}$/.test(s)) {
    // Coma decimal sin puntos de miles: "1190,50"
    s = s.replace(",", ".");
  } else {
    // Puntos como separador de miles: "1.190" → "1190"
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) || n <= 0 ? null : n;
}

// Extrae cantidad y unidad desde un fragmento de texto
// Ejemplos: "4 kg", "x5", "2 UN", "3 LT"
function extraerCantidad(texto: string): { cantidad: number | null; unidad: string } {
  const UNIDADES = ["kg", "kilo", "kilos", "lt", "lts", "litro", "litros", "un", "und", "unid", "unidad", "caja", "cajas", "saco", "sacos", "bolsa", "bolsas", "g", "gr", "gramo"];
  const re = new RegExp(
    `(?:x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES.join("|")})?`,
    "i"
  );
  const match = texto.match(re);
  if (match && match[1]) {
    const cantidad = parseFloat(match[1].replace(",", "."));
    const unidad = match[2] ? match[2].toLowerCase() : "un";
    return { cantidad: isNaN(cantidad) ? null : cantidad, unidad };
  }
  return { cantidad: null, unidad: "" };
}

// Limpia el nombre del producto
function limpiarNombre(raw: string): string {
  return raw
    .replace(/^\d+[\.\-\)]\s*/, "") // remover numeración inicial "1. " "1) "
    .replace(/[^\w\s\áéíóúÁÉÍÓÚñÑ\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Detecta si una línea es de total/subtotal (para ignorarla)
function esLineaTotal(linea: string): boolean {
  const upper = linea.toUpperCase();
  return /\b(TOTAL|SUBTOTAL|NETO|IVA|DESCUENTO|EXENTO|AFECTO|FLETE|ENVIO|RECARGO)\b/.test(upper);
}

// Precio mínimo para evitar capturar números pequeños (ej. cantidades)
const PRECIO_MINIMO = 100;

export function parseInvoiceText(text: string): RawProduct[] {
  const tipoPrecio = detectTipoPrecio(text);
  const lineas = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Regex para capturar precios: $1.190 | 1.190 | 1190 | $ 1.190,00
  const PRECIO_RE = /\$?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{4,})/g;

  const productos: RawProduct[] = [];

  for (const linea of lineas) {
    if (esLineaTotal(linea)) continue;

    // Buscar todos los precios en la línea
    const matches = [...linea.matchAll(PRECIO_RE)];
    if (matches.length === 0) continue;

    // Tomar el último número de la línea como precio (en facturas suele ser el total de línea)
    const ultimoMatch = matches[matches.length - 1];
    const precio = parsePrecio(ultimoMatch[1]);
    if (!precio || precio < PRECIO_MINIMO) continue;

    // Texto antes del precio → contiene nombre + posible cantidad
    const textoPrevio = linea.slice(0, ultimoMatch.index).trim();
    if (!textoPrevio) continue;

    // Extraer cantidad del texto previo
    const { cantidad, unidad } = extraerCantidad(textoPrevio);

    // Limpiar nombre: remover parte numérica de cantidad si se encontró
    let nombreRaw = textoPrevio;
    if (cantidad !== null) {
      nombreRaw = textoPrevio.replace(
        new RegExp(`(?:x\\s*)?${cantidad}\\s*\\w*`, "i"),
        ""
      );
    }
    const nombre = limpiarNombre(nombreRaw);
    if (!nombre || nombre.length < 2) continue;

    productos.push({
      producto: nombre,
      precio_total: precio,
      cantidad,
      unidad,
      tipo_precio: tipoPrecio,
      descuento_monto: null,
      descuento_pct: null,
      impuesto_adicional: null,
      rayado: false,
    });
  }

  return productos;
}
