import { RawProduct, ProcessedProduct } from "./types";

const IVA = 1.19;

function round(n: number): number {
  return Math.round(n);
}

function calcularNeto(unitario: number, tipoPrecio: "neto" | "bruto"): number {
  return tipoPrecio === "bruto" ? unitario / IVA : unitario;
}

function calcularBruto(unitario: number, tipoPrecio: "neto" | "bruto"): number {
  return tipoPrecio === "neto" ? unitario * IVA : unitario;
}

export function calcularProducto(
  raw: RawProduct,
  multiplicador: number,
  id: string
): ProcessedProduct {
  const { producto, precio_total, cantidad, unidad, tipo_precio,
          descuento_monto, descuento_pct, impuesto_adicional, rayado } = raw;

  // Precio unitario base (sin descuento)
  const unitario_sin_dto = cantidad && cantidad > 0 ? precio_total / cantidad : precio_total;

  // Calcular descuento unitario
  let dto_unitario = 0;
  if (descuento_monto && descuento_monto > 0) {
    dto_unitario = cantidad && cantidad > 0 ? descuento_monto / cantidad : descuento_monto;
  } else if (descuento_pct && descuento_pct > 0) {
    dto_unitario = unitario_sin_dto * (descuento_pct / 100);
  }

  const unitario_con_dto = unitario_sin_dto - dto_unitario;

  // Impuesto adicional (ya viene en $, se agrega al neto)
  const imp_add_unitario = impuesto_adicional && impuesto_adicional > 0
    ? (cantidad && cantidad > 0 ? impuesto_adicional / cantidad : impuesto_adicional)
    : 0;

  // Sin descuento
  const neto_sin_dto = round(calcularNeto(unitario_sin_dto, tipo_precio) + imp_add_unitario);
  const bruto_sin_dto = round(calcularBruto(unitario_sin_dto, tipo_precio) + imp_add_unitario * IVA);
  const venta_sin_dto = round(neto_sin_dto * multiplicador);

  // Con descuento
  const neto = round(calcularNeto(unitario_con_dto, tipo_precio) + imp_add_unitario);
  const bruto = round(calcularBruto(unitario_con_dto, tipo_precio) + imp_add_unitario * IVA);
  const venta = round(neto * multiplicador);

  return {
    id,
    producto,
    cantidad,
    unidad,
    tipo_precio,
    precio_total,
    descuento_monto,
    descuento_pct,
    impuesto_adicional,
    rayado,
    neto_sin_dto,
    bruto_sin_dto,
    venta_sin_dto,
    neto,
    bruto,
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
    venta: round(producto.neto * multiplicador),
    venta_sin_dto: round(producto.neto_sin_dto * multiplicador),
  };
}
