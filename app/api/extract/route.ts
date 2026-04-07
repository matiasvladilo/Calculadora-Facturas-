import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Analiza esta imagen de una factura o boleta chilena y extrae todos los productos con sus precios.

Devuelve SOLO un JSON válido, sin texto adicional ni markdown. Formato exacto:
[
  {
    "producto": "nombre del producto",
    "precio_total": 16344,
    "cantidad": 16,
    "unidad": "un",
    "tipo_precio": "neto",
    "descuento_monto": null,
    "descuento_pct": 5,
    "impuesto_adicional": null,
    "rayado": false
  }
]

---
REGLA CRÍTICA — CANTIDADES EN FACTURAS CHILENAS:
Los sistemas ERP chilenos muestran cantidades con 3 decimales usando coma como separador decimal.
Ejemplos reales:
  16,000 UN → cantidad: 16   (NO 16000)
   9,000 UN → cantidad: 9
  48,000 UN → cantidad: 48
   2,000 KG → cantidad: 2
   1,800 KG → cantidad: 1.8
   0,720 LT → cantidad: 0.72
Regla: si ves "X,YYY" en la columna CANTIDAD, el valor real es X.YYY (coma = punto decimal).
Este negocio es un minimarket — las cantidades reales son siempre pequeñas (1–200 unidades máximo). Si calculas más de 500 unidades, revisa si aplicaste mal la regla.

---
REGLA CRÍTICA — PRECIOS EN FACTURAS CON COLUMNAS:
Si la factura tiene columnas (PRECIO BASE, DESCUENTO, PRECIO FINAL, MONTO NETO):
  - "precio_total" = columna MONTO NETO de esa línea (total neto de la línea, entero sin puntos)
  - "descuento_pct" = el porcentaje de descuento de la columna DESCUENTO (ej: "5.00%" → 5)
  - NO uses PRECIO BASE ni PRECIO FINAL en precio_total
Si la factura NO tiene columnas separadas, usa el precio visible de la línea.

---
REGLAS POR CAMPO:
- "producto": nombre limpio del producto tal como aparece
- "precio_total": MONTO NETO total de la línea (entero). Puntos = separador miles (16.344 → 16344)
- "cantidad": cantidad real aplicando la regla de decimales arriba
- "unidad": "kg", "g", "lt", "ml", "un", "caja", etc. Usa "un" si no hay unidad
- "tipo_precio": "neto" si es FACTURA o hay columna NETO. "bruto" si es BOLETA
- "descuento_monto": monto de descuento en pesos si aparece así. null si no
- "descuento_pct": porcentaje de descuento si aparece así. null si no. No pongas ambos
- "impuesto_adicional": impuesto extra (alcohol, bebidas azucaradas, etc.) separado del IVA 19%, en pesos. null si no hay
- "rayado": true SOLO si una línea recta cruza de extremo a extremo todo el texto del producto (producto anulado). NO marcar como rayado: tickets ✓, círculos, marcas pequeñas al costado — esas son señales de recepción/verificación y el producto SÍ se incluye.

Ignorar: filas de SUB TOTAL, NETO, EXENTO, IVA, TOTAL, datos del emisor, encabezados, pie de página.`;

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
