import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Analiza esta imagen de una factura o boleta chilena y extrae todos los productos.

Tu respuesta debe ser ÚNICAMENTE el array JSON. Empieza con [ y termina con ]. Sin markdown, sin texto extra.

Formato por producto:
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

━━━ RAZONAMIENTO DE COLUMNAS ━━━
Antes de extraer, identifica qué representa cada columna por su nombre. Razona semánticamente:

→ Si el nombre dice "precio unitario bruto", "P.UNIT.BRUTO", "precio unit. bruto", "unit. bruto" o similar
   = precio bruto POR UNIDAD (ya incluye ILA + IVA) → "precio_bruto_unitario"

→ Si el nombre dice "precio bruto total", "P.BRUTO", "total bruto", "monto bruto" o similar
   = precio bruto TOTAL de la línea → "precio_bruto_total"

→ Si el nombre dice "precio unitario neto", "P.UNIT.NETO", "unit. neto", "precio neto unit." o similar
   = precio neto POR UNIDAD → "precio_neto_unitario"

→ Si el nombre dice "total neto", "T.NETO", "monto neto", "neto total" o similar
   = precio neto TOTAL de la línea → "precio_neto_total"

→ Si el nombre dice "precio base", "precio lista", "valor unit." sin indicar si es neto o bruto:
   - Si la factura tiene IVA desglosado al final → probablemente neto → "precio_neto_unitario"
   - Si es boleta → probablemente bruto → "precio_bruto_unitario"

Llena SOLO los campos que tengan datos reales. Los demás déjalos en null.
NO dupliques el mismo precio en varios campos.

━━━ CANTIDADES ━━━
ERP chileno: coma = separador decimal. 24,0 → 24 | 3,0 → 3 | 1,800 → 1.8 | 0,720 → 0.72 | 16,000 → 16
Minimarket: máximo ~200 unidades por ítem.

━━━ DESCUENTOS ━━━
- "descuento_pct": porcentaje de descuento por línea (DESC%, DTO%)
- "descuento_monto": monto en pesos si el descuento aparece en $
- Si el precio que ves YA tiene el descuento aplicado (precio final), no pongas descuento — ya está incorporado

━━━ ILA ━━━
1. Si hay columna "ILA%" → usar ese valor exacto (20,50 → 20.5 | 31,50 → 31.5)
2. Si no hay columna, detectar por nombre de producto:
   - cerveza, sidra → 20.5
   - vino, espumante, champagne, cava → 20.5
   - whisky, vodka, ron, pisco, gin, licor, aperol, tequila, brandy, cognac → 31.5
   - todo lo demás → 0

━━━ OTRAS REGLAS ━━━
- "rayado": true SOLO si una línea recta cruza TODO el texto del producto de punta a punta.
  Círculos ◯, tickets ✓, marcas cortas al costado = verificación de recepción, NO es rayado.
- "tipo_precio": "neto" si es factura con IVA desglosado. "bruto" si es boleta.
- Ignorar: SERVICIOS LOGISTICOS, filas de totales, IVA, descuentos globales, datos del emisor/cliente.`;

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
