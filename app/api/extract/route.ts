import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_ANALISIS = `Eres un experto en facturas chilenas de distribuidoras de alimentos y bebidas.

Primero analiza la estructura de este documento dentro de <analisis> tags.
Luego extrae los productos como JSON dentro de <json> tags.

<analisis>
Responde estas preguntas observando la imagen:
1. ¿Qué tipo de documento es? (factura electrónica, boleta, guía despacho, etc.)
2. ¿Qué columnas tiene la tabla de productos? Lista cada columna exactamente como aparece
3. ¿Cuál columna tiene el precio POR UNIDAD INDIVIDUAL de consumo? (no por caja)
4. ¿Cuál columna tiene el precio TOTAL de la línea?
5. ¿Los precios son netos (sin IVA) o brutos (con IVA incluido)?
6. ¿Hay columnas de ILA, IABA u otro impuesto adicional? ¿Con qué porcentaje?
7. ¿Hay columna de descuento? ¿En % o en $?
8. ¿Las cantidades usan coma como decimal? (ej: 24,0 = 24 unidades)
9. ¿Hay productos en packs/cajas con múltiples unidades? (X6, X12, 6PK, etc.)
</analisis>

<json>
Basándote en tu análisis, extrae TODOS los productos como array JSON.
Un objeto por producto, con estos campos exactos:

{
  "producto": "nombre limpio del producto",
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

REGLAS DE CAMPOS:
- precio_bruto_unitario: precio por unidad individual YA con IVA e ILA incluidos. Usar cuando la factura lo da directamente (ej: columna "Total Unidad", "Precio Unidad", "P.UNIT.BRUTO")
- precio_neto_unitario: precio por unidad sin IVA. Usar cuando la factura lo da directamente
- precio_neto_total: total neto de la línea (todas las unidades, sin IVA). Ej: columna "Valor", "Neto", "T.NETO", "Monto Neto"
- precio_bruto_total: total de la línea con IVA+ILA. Ej: columna "P.BRUTO", "Total Factura"
- Llena SOLO los campos relevantes. Los demás null. NO dupliques el mismo precio en dos campos.

- cantidad: número real de unidades. Si la factura muestra "24,0" con coma decimal → 24. Si muestra cajas (CJ) de X6 → cantidad = número de cajas, el precio unitario viene de "Total Unidad"
- ila_porcentaje: usa el valor exacto de la columna ILA/IABA si existe por fila. Si no, infiere por tipo de producto: cerveza/vino 20.5, destilados 31.5, bebida azucarada 10-18, resto 0
- descuento_pct: % de descuento por línea si existe como columna separada
- rayado: true SOLO si una línea recta cruza completamente el texto del producto. Círculos, ticks ✓ y marcas al costado = recepción verificada, NO es rayado
- tipo_precio: "neto" si la factura tiene IVA desglosado al pie. "bruto" si es boleta
- Ignorar: servicios logísticos, fletes, filas de totales/IVA/subtotales, datos de emisor/cliente
</json>`;

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

    rawRespuesta = response.content[0].type === "text" ? response.content[0].text : "";

    // Extraer JSON de dentro de <json> tags
    let jsonStr: string | null = null;

    const jsonTagMatch = rawRespuesta.match(/<json>([\s\S]*?)<\/json>/);
    if (jsonTagMatch) {
      const inner = jsonTagMatch[1].trim();
      const arrayMatch = inner.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }

    // Fallback: buscar array JSON en cualquier parte
    if (!jsonStr) {
      const arrayMatch = rawRespuesta.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }

    // Fallback: bloque markdown
    if (!jsonStr) {
      const codeMatch = rawRespuesta.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeMatch) jsonStr = codeMatch[1].trim();
    }

    if (!jsonStr) {
      return NextResponse.json(
        { error: "No se pudieron extraer productos. Intenta con mejor iluminación o recorta solo la tabla.", debug: rawRespuesta.slice(0, 800) },
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
      return NextResponse.json({ error: "No se encontraron productos en la imagen." }, { status: 422 });
    }

    return NextResponse.json({ productos });
  } catch (err) {
    console.error("Error:", err, "Raw:", rawRespuesta.slice(0, 300));
    return NextResponse.json({ error: "Error procesando la imagen" }, { status: 500 });
  }
}
