import { RawProduct, ProcessedProduct } from "./types";

const IVA = 1.19;

function round(n: number): number {
  return Math.round(n);
}

// Calcula neto + bruto (con ILA si aplica) a partir del precio neto unitario
function calcularPrecios(
  netoUnitario: number,
  ilaPct: number,
  impAdicional: number
): { neto: number; bruto: number; ila_monto: number } {
  const neto = netoUnitario + impAdicional;
  const ila_monto = round(netoUnitario * (ilaPct / 100));
  const bruto = round((netoUnitario + ila_monto) * IVA + impAdicional * IVA);
  return { neto: round(neto), bruto, ila_monto };
}

export function calcularProducto(
  raw: RawProduct,
  multiplicador: number,
  id: string
): ProcessedProduct {
  const {
    producto, precio_total, precio_bruto_factura, cantidad, unidad, tipo_precio,
    descuento_monto, descuento_pct, ila_porcentaje, impuesto_adicional, rayado,
  } = raw;

  const ilaPct = ila_porcentaje ?? 0;
  const impAdd = impuesto_adicional ?? 0;

  // Precio unitario base (sin descuento), en neto
  let unitario_neto_sin_dto: number;

  if (precio_bruto_factura && precio_bruto_factura > 0) {
    // La factura tiene P.BRUTO — ya incluye ILA + IVA, back-calculamos el neto
    const brutoUnit = precio_bruto_factura / (cantidad && cantidad > 0 ? cantidad : 1);
    // bruto = neto * (1 + ila%) * IVA  →  neto = bruto / ((1 + ila%) * IVA)
    unitario_neto_sin_dto = brutoUnit / ((1 + ilaPct / 100) * IVA);
  } else {
    // Usamos precio_total (MONTO NETO de la línea)
    const unitario_raw = cantidad && cantidad > 0 ? precio_total / cantidad : precio_total;
    unitario_neto_sin_dto = tipo_precio === "bruto" ? unitario_raw / IVA : unitario_raw;
  }

  // Descuento unitario (en neto)
  let dto_neto = 0;
  if (descuento_monto && descuento_monto > 0) {
    const dtoTotal = cantidad && cantidad > 0 ? descuento_monto / cantidad : descuento_monto;
    dto_neto = tipo_precio === "bruto" ? dtoTotal / IVA : dtoTotal;
  } else if (descuento_pct && descuento_pct > 0) {
    dto_neto = unitario_neto_sin_dto * (descuento_pct / 100);
  }

  const unitario_neto_con_dto = unitario_neto_sin_dto - dto_neto;
  const impAddUnit = cantidad && cantidad > 0 ? impAdd / cantidad : impAdd;

  // Sin descuento
  const sin_dto = calcularPrecios(unitario_neto_sin_dto, ilaPct, impAddUnit);
  const venta_sin_dto = round(sin_dto.bruto * multiplicador);

  // Con descuento
  const con_dto = calcularPrecios(unitario_neto_con_dto, ilaPct, impAddUnit);
  const venta = round(con_dto.bruto * multiplicador);

  return {
    id,
    producto,
    cantidad,
    unidad,
    tipo_precio,
    precio_total,
    descuento_monto,
    descuento_pct,
    ila_porcentaje: ilaPct > 0 ? ilaPct : null,
    ila_monto: sin_dto.ila_monto > 0 ? sin_dto.ila_monto : null,
    impuesto_adicional,
    rayado,
    neto_sin_dto: sin_dto.neto,
    bruto_sin_dto: sin_dto.bruto,
    venta_sin_dto,
    neto: con_dto.neto,
    bruto: con_dto.bruto,
    venta,
    editado: false,
  };
}

export function recalcularVenta(
  producto: ProcessedProduct,
  multiplicador: number
): ProcessedProduct {
  return {
    ...producto,
    venta: round(producto.bruto * multiplicador),
    venta_sin_dto: round(producto.bruto_sin_dto * multiplicador),
  };
}
