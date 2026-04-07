import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `Analiza esta imagen de una factura o boleta chilena y extrae todos los productos con sus precios.

Devuelve SOLO un JSON válido, sin texto adicional ni markdown. Formato exacto:
[
  {
    "producto": "nombre del producto",
    "precio_total": 16344,
    "precio_bruto_factura": null,
    "cantidad": 16,
    "unidad": "un",
    "tipo_precio": "neto",
    "descuento_monto": null,
    "descuento_pct": 5,
    "ila_porcentaje": 0,
    "impuesto_adicional": null,
    "rayado": false
  }
]

---
REGLA CRÍTICA — CANTIDADES EN FACTURAS CHILENAS:
Los sistemas ERP chilenos muestran cantidades con 3 decimales usando coma como separador decimal.
  16,000 UN → cantidad: 16  |  9,000 UN → 9  |  1,800 KG → 1.8  |  0,720 LT → 0.72
Regla: "X,YYY" → valor real es X.YYY (coma = punto decimal).
Este negocio es minimarket — máximo ~200 unidades por producto. Si calculas más de 500, revisa la regla.

---
REGLA CRÍTICA — PRECIOS EN FACTURAS CON COLUMNAS:
Si la factura tiene columnas (PRECIO BASE / DESCUENTO / PRECIO FINAL / MONTO NETO):
  - "precio_total" = columna MONTO NETO (total neto de la línea, entero, puntos = miles: 16.344 → 16344)
  - "descuento_pct" = % de la columna DESCUENTO (ej: "5.00%" → 5)
  - NO uses PRECIO BASE ni PRECIO FINAL en precio_total

Si la factura tiene columna "P. BRUTO" o "PRECIO BRUTO" (ya incluye ILA + IVA):
  - "precio_bruto_factura" = ese valor (entero, puntos = miles)
  - "precio_total" = columna NETO o MONTO NETO si existe; si no, null o 0
  - NO recalcular IVA ni ILA encima del precio bruto

Si NO hay columnas separadas: usa el precio visible de la línea en "precio_total".

---
REGLA ILA (IMPUESTO A BEBIDAS ALCOHÓLICAS):
El ILA es un impuesto adicional chileno que se aplica sobre el precio neto, ANTES del IVA.

1. Si hay columna "ILA%" → usar ese valor directamente.
2. Si NO hay columna ILA, detectar por nombre del producto:
   - cerveza, sidra → ila_porcentaje: 20.5
   - vino, espumante, champagne, cava → ila_porcentaje: 20.5
   - whisky, vodka, ron, pisco, gin, licor, aperol, tequila, brandy, cognac → ila_porcentaje: 31.5
   - agua, jugo, refresco, bebida, gaseosa, lácteo, alimento → ila_porcentaje: 0
   - Si no es bebida alcohólica → ila_porcentaje: 0

IMPORTANTE: Si la factura ya tiene "P. BRUTO" que incluye ILA, igual reporta el ila_porcentaje detectado para referencia.

---
REGLAS POR CAMPO:
- "producto": nombre limpio tal como aparece
- "precio_total": MONTO NETO total de la línea (entero). 0 si se usa precio_bruto_factura
- "precio_bruto_factura": valor de columna P.BRUTO si existe (entero). null si no hay esa columna
- "cantidad": cantidad real (aplicar regla de decimales)
- "unidad": "kg", "g", "lt", "ml", "un", "caja", etc. "un" si no hay unidad
- "tipo_precio": "neto" si es FACTURA. "bruto" si es BOLETA
- "descuento_monto": descuento en $ si aparece así. null si no
- "descuento_pct": descuento en % si aparece así. null si no. No pongas ambos
- "ila_porcentaje": 0, 20.5 o 31.5 según las reglas de arriba
- "impuesto_adicional": otro impuesto extra separado del IVA e ILA, en pesos. null si no hay
- "rayado": true SOLO si una línea recta cruza de extremo a extremo el producto (anulado). NO marcar: tickets ✓, círculos, marcas al costado (son verificaciones de recepción).

Ignorar: SUB TOTAL, NETO, EXENTO, IVA, TOTAL, datos del emisor, encabezados, pie de página.`;

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
