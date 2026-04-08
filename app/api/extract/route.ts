import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Analiza esta imagen de una factura o boleta chilena y extrae todos los productos con sus precios.

Tu respuesta debe ser ÚNICAMENTE el array JSON, sin explicaciones, sin markdown, sin texto antes o después.
Empieza tu respuesta con [ y termina con ]

Formato de cada producto:
{
  "producto": "nombre del producto",
  "precio_total": 0,
  "precio_bruto_factura": null,
  "cantidad": 1,
  "unidad": "un",
  "tipo_precio": "neto",
  "descuento_monto": null,
  "descuento_pct": null,
  "ila_porcentaje": 0,
  "impuesto_adicional": null,
  "rayado": false
}

━━━ CANTIDADES ━━━
Los ERP chilenos usan coma como decimal con 1-3 decimales:
  24,0 → 24  |  3,0 → 3  |  1,800 → 1.8  |  0,720 → 0.72  |  16,000 → 16
Negocio minimarket: máximo ~200 unidades. Si te sale más de 500, revisa.

━━━ COLUMNAS DE PRECIO — lee en este orden de prioridad ━━━

CASO A — factura con columnas P.UNIT.BRUTO + P.BRUTO (precio bruto ya incluye ILA + IVA):
  → "precio_bruto_factura" = columna P.BRUTO (total de la línea, entero sin puntos)
  → "precio_total" = 0
  → "descuento_pct" = columna DESC%
  → NO recalcular impuestos encima

CASO B — factura con columnas MONTO NETO / T.NETO (precio neto sin IVA):
  → "precio_total" = esa columna (entero sin puntos)
  → "precio_bruto_factura" = null
  → "descuento_pct" = columna DESCUENTO %

CASO C — boleta o factura simple sin columnas separadas:
  → "precio_total" = precio visible
  → "precio_bruto_factura" = null
  → "tipo_precio" = "bruto" si es boleta

━━━ ILA ━━━
1. Si hay columna ILA% → usar ese valor exacto (ej: 20,50 → 20.5)
2. Sin columna ILA, detectar por nombre:
   - cerveza, sidra → 20.5
   - vino, espumante, champagne, cava → 20.5
   - whisky, vodka, ron, pisco, gin, licor, aperol, tequila, brandy, cognac → 31.5
   - todo lo demás → 0

━━━ OTRAS REGLAS ━━━
- "rayado": true SOLO si una línea cruza de punta a punta el texto del producto. Círculos, tickets ✓ y marcas al costado son señales de recepción — NO es rayado.
- "producto": nombre limpio sin código ni datos de cantidad
- Ignorar: SERVICIOS LOGISTICOS, totales, IVA, descuentos globales, datos del cliente/emisor`;

export async function POST(req: NextRequest) {
  let rawRespuesta = "";
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      return NextResponse.json({ error: "No se recibió imagen" }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mediaType = (image.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif") || "image/jpeg";

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    rawRespuesta = response.content[0].type === "text" ? response.content[0].text : "";

    // Extraer JSON — intentar múltiples estrategias
    let jsonStr: string | null = null;

    // 1. Buscar array JSON completo
    const arrayMatch = rawRespuesta.match(/\[[\s\S]*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];

    // 2. Si no, intentar extraer de bloque de código markdown
    if (!jsonStr) {
      const codeMatch = rawRespuesta.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeMatch) jsonStr = codeMatch[1].trim();
    }

    if (!jsonStr) {
      return NextResponse.json(
        { error: "La IA no devolvió datos estructurados. Intenta con mejor iluminación o recorta solo la tabla de productos.", debug: rawRespuesta.slice(0, 500) },
        { status: 422 }
      );
    }

    let productos;
    try {
      productos = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "Error al interpretar la respuesta. Intenta de nuevo.", debug: jsonStr.slice(0, 500) },
        { status: 422 }
      );
    }

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron productos en la imagen." },
        { status: 422 }
      );
    }

    return NextResponse.json({ productos });
  } catch (err) {
    console.error("Error:", err, "Raw:", rawRespuesta.slice(0, 300));
    return NextResponse.json({ error: "Error procesando la imagen" }, { status: 500 });
  }
}
