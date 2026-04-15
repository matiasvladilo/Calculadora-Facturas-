import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;
export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type SupportedMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function detectMediaType(buffer: Buffer): SupportedMediaType {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (buffer.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/jpeg";
}

const PROMPT_ANALISIS = `Eres un experto en facturas chilenas. Extrae TODOS los productos de esta imagen como JSON array.

FORMATO DE CANTIDADES EN FACTURAS CHILENAS (MUY IMPORTANTE):
Los sistemas ERP chilenos usan coma como separador decimal con ceros: "16,000" = 16 unidades, NO 16000.
Regla: si ves un número en la columna cantidad con coma y ceros al final (ej: 1,000 / 2,000 / 16,000 / 24,000), es un entero — ignorá la coma y los ceros. Nunca habrá 16000 unidades de un producto.

PASO 1 — Antes de extraer, identifica el formato mirando los encabezados de columna:
- ¿Hay columna "P.Lista"? → todos los productos usan P.Lista como precio_bruto_unitario
- ¿Hay columna "PRECIO UNIT"/"Precio"? → todos usan esa columna como precio_neto_unitario
- ¿Hay mezcla de CJ y UNI en columna unidad? → aplicar regla CJ/UNI a cada fila según su valor
Aplica la MISMA regla a TODOS los productos sin excepción.

PASO 2 — Responde SOLO con el array JSON, sin texto adicional. Precios SIN formato de miles: 16344 no "16.344".

Campos por producto:
{
  "producto": "nombre limpio",
  "precio_neto_unitario": null,
  "precio_bruto_unitario": null,
  "precio_neto_total": null,
  "precio_bruto_total": null,
  "cantidad": 1,
  "unidad": "un",
  "tipo_precio": "neto",
  "descuento_monto": null,
  "descuento_pct": null,
  "ila_porcentaje": 0,
  "impuesto_adicional": null,
  "rayado": false
}

REGLAS DE CANTIDAD Y PRECIO:

Si hay columna "P.Lista" o "P.List" o "Precio Lista":
- precio_bruto_unitario = valor de P.Lista (ESTE es el precio base, ya incluye IVA + ILA)
- IGNORAR columna P.Unit para precio_bruto_unitario — P.Unit es el precio con descuento del distribuidor, NO el precio base
- ila_porcentaje = 0 (ILA ya incluido en P.Lista)
- descuento_pct = null (el usuario trabaja sobre P.Lista directamente)
- precio_neto_total = columna "Valor Total"/"Total"
- EJEMPLO: factura con "P.Lista: 1060 | P.Unit: 774 | Valor: 6966" para 9 unidades →
  precio_bruto_unitario: 1060, ila_porcentaje: 0, descuento_pct: null, precio_neto_total: 6966

Si unidad = UNI / UN / u (unidad individual):
- cantidad = valor columna CANT directamente
- precio_neto_unitario = columna "PRECIO UNIT"/"Precio"/"P.UNIT" (es neto si hay IVA al pie)
- precio_neto_total = columna "Valor"/"Total"/"T.NETO"

Si unidad = CJ / CAJA:
- Buscar N en el nombre: primer número del patrón "NxM" → ej: "6x1L" → N=6, "12x500cc" → N=12
- cantidad = CANT_CJ × N  (convertir a unidades individuales)
- precio_bruto_unitario = PRECIO_UNIT_CJ / N  (dividir precio de caja por unidades)
- precio_neto_total = columna Valor (total de la línea, ya con descuento)
- unidad = "UN"
- EJEMPLO: "1 CJ | Chocolate Suizo 6x1L | PRECIO UNIT: 14868 | VALOR: 12638" →
  cantidad: 6, precio_bruto_unitario: 2478, precio_neto_total: 12638

Si hay columna UNS/UN además de CJ → usar ese valor como cantidad directamente.
NUNCA calcular precio unitario dividiendo total/cantidad.
- tipo_precio: "neto" si hay IVA desglosado al pie, "bruto" si es boleta
- ila_porcentaje: de columna ILA/IABA si existe; si no: cerveza/vino=20.5, destilados=31.5, bebida azucarada=10-18, resto=0
- descuento_pct: % descuento por línea si existe
- rayado: true SOLO si una línea cruza completamente el texto del producto
- Ignorar: fletes, totales, IVA, subtotales, datos emisor/receptor`;


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      return NextResponse.json({ error: "No se recibió imagen" }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mediaType = detectMediaType(buffer);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT_ANALISIS },
          ],
        },
      ],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    return new Response(rawText, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error:", msg);
    return NextResponse.json({ error: "Error procesando la imagen", debug: msg }, { status: 500 });
  }
}
