import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Analiza esta imagen de una factura o boleta chilena y extrae todos los productos con sus precios.

Devuelve SOLO un JSON válido, sin texto adicional ni markdown. Formato exacto:
[
  {
    "producto": "nombre del producto",
    "precio_total": 1190,
    "cantidad": 2,
    "unidad": "kg",
    "tipo_precio": "neto",
    "descuento_monto": null,
    "descuento_pct": null,
    "impuesto_adicional": null,
    "rayado": false
  }
]

Reglas campo por campo:
- "producto": nombre limpio del producto
- "precio_total": precio de la línea ANTES de descuento (entero, sin puntos separadores). Si el precio tiene puntos de miles (1.190 → 1190)
- "cantidad": número si aparece explícito, null si no
- "unidad": "kg", "g", "lt", "ml", "un", "caja", etc. Usa "un" si no hay unidad. Si viene en gramos (200g, 500g), usa "g"
- "tipo_precio": "neto" si es FACTURA o precios sin IVA. "bruto" si es BOLETA o precios con IVA incluido
- "descuento_monto": si hay un descuento expresado en pesos ($), ese valor como entero. null si no hay
- "descuento_pct": si hay un descuento expresado en porcentaje (%), ese número. null si no hay. NO pongas ambos, solo el que aparezca
- "impuesto_adicional": si hay impuesto adicional (alcohol, bebidas azucaradas, etc.) separado del IVA, su monto en pesos como entero. null si no hay
- "rayado": SOLO true si una línea recta cruza de extremo a extremo el texto del producto, anulándolo visualmente. Esto indica que el producto fue eliminado de la factura.
  NO marcar como rayado si: hay un ticket (✓), un círculo, una marca pequeña al costado, o rayas cortas que son solo indicadores de recepción o verificación. Esas marcas son normales en facturas físicas y el producto SÍ debe incluirse.

Ignorar: líneas de total, subtotal, IVA estándar 19%, descuentos globales, datos del proveedor, encabezados, pie de página.`;

export async function POST(req: NextRequest) {
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
      max_tokens: 2048,
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

    const texto = response.content[0].type === "text" ? response.content[0].text : "";

    const jsonMatch = texto.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "No se pudieron extraer productos de la imagen" },
        { status: 422 }
      );
    }

    const productos = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron productos en la imagen" },
        { status: 422 }
      );
    }

    return NextResponse.json({ productos });
  } catch (err) {
    console.error("Error:", err);
    return NextResponse.json({ error: "Error procesando la imagen" }, { status: 500 });
  }
}
