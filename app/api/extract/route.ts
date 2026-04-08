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
Antes de extraer, razona qué representa cada columna por su nombre. No busques texto exacto — infiere semánticamente:

PRECIO BRUTO POR UNIDAD → "precio_bruto_unitario"
  Nombres posibles: "Total Unidad", "Total Unid.", "Unid.", "P.UNIT.BRUTO", "precio unit. bruto", "valor unidad", "precio por unidad"
  Este valor ya incluye ILA + IVA y es por unidad individual (no por caja/pack).
  ★ IMPORTANTE: Si la factura tiene columna "Total Unidad" — ESE es el campo a usar como precio_bruto_unitario.

PRECIO NETO TOTAL DE LA LÍNEA → "precio_neto_total"
  Nombres posibles: "Valor", "T.NETO", "Monto Neto", "Neto", "Sub Neto", "Importe"
  Es el neto acumulado de todos las unidades de esa fila, sin IVA ni ILA.

PRECIO NETO POR UNIDAD → "precio_neto_unitario"
  Nombres posibles: "Precio Unit", "Precio Unitario", "P.UNIT.NETO", "Precio Base"
  Si hay IVA desglosado al pie → es neto.

PRECIO BRUTO TOTAL → "precio_bruto_total"
  Nombres posibles: "P.BRUTO", "Total Bruto", "Total Factura línea"

Llena SOLO los campos con datos reales. Los demás déjalos en null. NO dupliques el mismo precio en dos campos.

━━━ PACKS Y SIXPACKS (cajas con unidades múltiples) ━━━
Muchas facturas de distribuidoras venden en cajas (CJ) que contienen múltiples unidades.
El nombre del producto indica el contenido: X6 = 6 unidades, X12 = 12, X24 = 24, 6PK = 6-pack, etc.

Cuando existe columna "Total Unidad":
  → "precio_bruto_unitario" = ese valor (precio por unidad individual ya con ILA+IVA)
  → "cantidad" = número de cajas (de la columna Cantidad)
  → "unidad" = "cj" (caja) o lo que diga la columna UIM/Unidad
  → NO dividas ni multipliques el precio — úsalo directo

Cuando NO existe "Total Unidad":
  → Usa "precio_neto_total" = columna Valor/Neto (total de la línea)
  → "cantidad" = número de cajas
  → El sistema calculará el precio unitario dividiendo por cajas

━━━ CANTIDADES ━━━
ERP chileno: coma = decimal. 24,0 → 24 | 3,0 → 3 | 1,800 → 1.8 | 0,720 → 0.72 | 16,000 → 16
Minimarket: máximo ~200 unidades. Si calculás más de 500, revisa.

━━━ DESCUENTOS ━━━
- "descuento_pct": % de descuento por línea (DESC%, DTO%, columna %)
- "descuento_monto": monto en $ si el descuento aparece así
- Si el precio que ves YA tiene el descuento aplicado → no pongas descuento (ya incluido)

━━━ ILA / IABA ━━━
Algunas facturas usan "IABA" en vez de "ILA" (bebidas analcohólicas con azúcar). Tratalos igual.
1. Si hay columna ILA% o IABA% con valor por fila → usar ese valor exacto por producto
2. Si hay columnas separadas IABA 10% / IABA 18% / ILA CER 20.5% / ILA VIN 20.5% / ILA 31.5%:
   → Lee cuál aplica a cada producto según en qué columna tiene valor
   → IABA 10% o IABA 18% → ila_porcentaje: 10 o 18
   → ILA CER/VIN 20.5% → ila_porcentaje: 20.5
   → ILA 31.5% → ila_porcentaje: 31.5
3. Si no hay columna ILA/IABA, detectar por nombre:
   - cerveza, sidra → 20.5
   - vino, espumante, champagne, cava → 20.5
   - whisky, vodka, ron, pisco, gin, licor, aperol, tequila, brandy, cognac → 31.5
   - bebida energética, gatorade, jugo, refresco, bebida con azúcar → 10 o 18 (usa lo que muestre la factura)
   - agua sin azúcar, lácteo, alimento sólido → 0

━━━ OTRAS REGLAS ━━━
- "rayado": true SOLO si una línea cruza TODO el texto del producto de extremo a extremo.
  Círculos ◯, tickets ✓, marcas cortas al costado = recepción verificada, NO es rayado.
- "tipo_precio": "neto" si es factura con IVA desglosado al pie. "bruto" si es boleta.
- "producto": nombre limpio. Puedes abreviar si es muy largo pero conserva la info clave (sabor, formato, tamaño).
- Ignorar: SERVICIOS LOGISTICOS, Flete de Mercaderías, filas de subtotales/totales/IVA, datos del emisor/cliente.`;

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
