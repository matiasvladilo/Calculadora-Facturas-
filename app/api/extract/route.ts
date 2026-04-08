import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type SupportedMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function detectMediaType(buffer: Buffer): SupportedMediaType {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (buffer.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/jpeg"; // fallback seguro
}

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
8. ¿Las cantidades usan coma como decimal? (ej: 24,0 = 24 unidades; 16,000 = 16 unidades, NO 16000)
9. ¿Hay productos en packs/cajas con múltiples unidades? (X6, X12, 6PK, etc.)
10. ¿Hay DOS columnas de cantidad? Por ejemplo "CJ" (cajas) Y "UNS/UN" (unidades). Si hay ambas, ¿cuál representa las unidades individuales de consumo?
</analisis>

<json>
Basándote en tu análisis, extrae TODOS los productos como array JSON.
IMPORTANTE: Todos los valores numéricos deben ser números planos SIN formato — sin puntos ni comas como separadores de miles. Usa punto decimal si es necesario. Ejemplos: 16344 no "16.344", 16 no "16,000", 1636.2 no "1.636,2".
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
- precio_neto_unitario: precio por unidad SIN IVA. SOLO usar si la factura tiene columna EXPLÍCITA de precio neto por unidad (ej: "P.UNIT.NETO", "PRECIO UNIT NETO"). NO calcular dividiendo el total.
- precio_bruto_unitario: precio por unidad individual YA con IVA e ILA incluidos. SOLO usar si la factura lo da directamente (ej: columna "Total Unidad", "Precio Unidad", "P.UNIT.BRUTO").
- precio_neto_total: total neto de la línea (todas las unidades, sin IVA). Ej: columna "Valor", "Neto", "T.NETO", "Monto Neto". Este es el campo MÁS CONFIABLE en facturas chilenas — úsalo cuando exista.
- precio_bruto_total: total de la línea con IVA+ILA. Ej: columna "P.BRUTO", "Total Factura".
- Llena SOLO los campos relevantes. Los demás null. NO dupliques el mismo precio en dos campos. Si hay precio_neto_total, no necesitas calcular precio_neto_unitario.

- cantidad: número de UNIDADES INDIVIDUALES de consumo. Si hay columnas "CJ" (cajas) Y "UNS/UN" (unidades), usa SIEMPRE el valor de unidades individuales (UNS/UN), NO el de cajas. Si la factura muestra "16,000" con coma decimal → 16 unidades (la coma es decimal, NO separador de miles). Si muestra cajas (CJ) sin columna de unidades individuales, y el precio ya es por unidad individual ("Total Unidad"), entonces cantidad = número de cajas.
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
    const mediaType = detectMediaType(buffer);

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

    // Sanitizar: Claude a veces devuelve números como strings con formato ("1,636.2", "5.698", etc.)
    const CAMPOS_NUMERICOS = [
      "precio_neto_unitario", "precio_bruto_unitario",
      "precio_neto_total", "precio_bruto_total",
      "cantidad", "descuento_monto", "descuento_pct",
      "ila_porcentaje", "impuesto_adicional",
    ];

    productos = productos.map((p: Record<string, unknown>) => {
      const limpio = { ...p };
      for (const campo of CAMPOS_NUMERICOS) {
        const val = limpio[campo];
        if (val === null || val === undefined) { limpio[campo] = null; continue; }
        // Siempre sanitizar — Claude puede devolver 16.344 como float JSON (= 16344 pesos chilenos)
        // String() convierte el number a string, luego la regex detecta el formato correcto
        let s = String(val).trim().replace(/[$ ]/g, "");
        if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
          // Formato con punto miles y coma decimal: "1.636,2" → "1636.2"
          s = s.replace(/\./g, "").replace(",", ".");
        } else if (/^\d+,0+$/.test(s)) {
          // Formato ERP chileno: "16,000" = 16 unidades (coma decimal, ceros finales)
          s = s.replace(/,0+$/, "");
        } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
          // Formato anglosajón con coma miles y punto decimal: "1,636.2" → "1636.2"
          s = s.replace(/,/g, "");
        } else {
          // Sin separador de miles: reemplazar coma decimal si existe
          s = s.replace(",", ".");
        }
        const n = parseFloat(s);
        limpio[campo] = isNaN(n) ? null : n;
      }
      return limpio;
    });

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json({ error: "No se encontraron productos en la imagen." }, { status: 422 });
    }

    return NextResponse.json({ productos });
  } catch (err) {
    console.error("Error:", err, "Raw:", rawRespuesta.slice(0, 300));
    return NextResponse.json({ error: "Error procesando la imagen" }, { status: 500 });
  }
}
