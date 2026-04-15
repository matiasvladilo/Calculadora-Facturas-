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

Responde SOLO con el array JSON, sin texto adicional. Precios SIN formato de miles: 16344 no "16.344".

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

REGLAS:
- precio_neto_total: columna "Valor"/"Neto"/"T.NETO" — MÁS CONFIABLE, úsalo cuando exista
- precio_neto_unitario: SOLO si hay columna explícita de precio neto por unidad. NUNCA calcular dividiendo total/cantidad — déjalo null si no hay columna explícita
- precio_bruto_unitario: SOLO si hay columna explícita
- cantidad: si hay CJ y UNS/UN, usar UNS/UN. Aplicar regla de formato ERP de arriba
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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 6000,
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
