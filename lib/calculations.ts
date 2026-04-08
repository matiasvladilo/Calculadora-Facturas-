import { RawProduct, ProcessedProduct } from "./types";

const IVA = 1.19;

function round(n: number): number {
  return Math.round(n);
}

function aplicarILA(netoUnit: number, ilaPct: number): { neto: number; bruto: number; ila_monto: number } {
  const ila_monto = round(netoUnit * (ilaPct / 100));
  const bruto = round((netoUnit + ila_monto) * IVA);
  return { neto: round(netoUnit), bruto, ila_monto };
}

export function calcularProducto(raw: RawProduct, multiplicador: number, id: string): ProcessedProduct {
  const {
    producto, cantidad, unidad, tipo_precio,
    descuento_monto, descuento_pct, impuesto_adicional, rayado,
    precio_neto_unitario, precio_bruto_unitario, precio_neto_total, precio_bruto_total,
  } = raw;

  const ilaPct = raw.ila_porcentaje ?? 0;
  const cant = cantidad && cantidad > 0 ? cantidad : 1;
  const impAddUnit = impuesto_adicional ? impuesto_adicional / cant : 0;

  // ── Resolver precio neto unitario base ──────────────────────────────────────
  // Prioridad: unitario directo > total/cant > back-calc desde bruto
  let netoUnitBase: number;

  if (precio_neto_unitario && precio_neto_unitario > 0) {
    // Columna P.UNIT.NETO — ya es unitario neto
    // Sanity check: si hay precio_neto_total, verificar consistencia
    // Si precio_neto_unitario * cant difiere del total en >50%, Claude confundió la columna
    if (precio_neto_total && precio_neto_total > 0 && cant > 1) {
      const ratio = Math.abs(precio_neto_unitario * cant - precio_neto_total) / precio_neto_total;
      netoUnitBase = ratio > 0.5 ? precio_neto_total / cant : precio_neto_unitario;
    } else {
      netoUnitBase = precio_neto_unitario;
    }

  } else if (precio_bruto_unitario && precio_bruto_unitario > 0) {
    // Columna P.UNIT.BRUTO — back-calculamos neto: bruto / ((1 + ILA%) × IVA)
    netoUnitBase = precio_bruto_unitario / ((1 + ilaPct / 100) * IVA);

  } else if (precio_neto_total && precio_neto_total > 0) {
    // Columna T.NETO / MONTO NETO — dividimos por cantidad
    const rawUnit = precio_neto_total / cant;
    netoUnitBase = tipo_precio === "bruto" ? rawUnit / IVA : rawUnit;

  } else if (precio_bruto_total && precio_bruto_total > 0) {
    // Columna P.BRUTO total — back-calculamos neto unitario
    const brutoUnit = precio_bruto_total / cant;
    netoUnitBase = brutoUnit / ((1 + ilaPct / 100) * IVA);

  } else {
    netoUnitBase = 0;
  }

  // ── Descuento (en neto) ─────────────────────────────────────────────────────
  let dtoNeto = 0;
  if (descuento_monto && descuento_monto > 0) {
    dtoNeto = descuento_monto / cant;
    if (tipo_precio === "bruto") dtoNeto = dtoNeto / IVA;
  } else if (descuento_pct && descuento_pct > 0) {
    dtoNeto = netoUnitBase * (descuento_pct / 100);
  }

  const netoUnitConDto = netoUnitBase - dtoNeto;

  // ── Calcular precios finales ────────────────────────────────────────────────
  const sin = aplicarILA(netoUnitBase + impAddUnit, ilaPct);
  const con = aplicarILA(netoUnitConDto + impAddUnit, ilaPct);

  const precio_total = precio_neto_total ?? round(con.neto * cant);

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
    ila_monto: sin.ila_monto > 0 ? sin.ila_monto : null,
    impuesto_adicional,
    rayado,
    neto_sin_dto: sin.neto,
    bruto_sin_dto: sin.bruto,
    venta_sin_dto: round(sin.bruto * multiplicador),
    neto: con.neto,
    bruto: con.bruto,
    venta: round(con.bruto * multiplicador),
    editado: false,
  };
}

export function recalcularVenta(producto: ProcessedProduct, multiplicador: number): ProcessedProduct {
  return {
    ...producto,
    venta: round(producto.bruto * multiplicador),
    venta_sin_dto: round(producto.bruto_sin_dto * multiplicador),
  };
}
