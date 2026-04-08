export interface RawProduct {
  producto: string;

  // Precios — Claude elige el campo correcto según el tipo de columna
  precio_neto_unitario: number | null;   // P.UNIT.NETO, PRECIO NETO UNIT — precio neto por unidad
  precio_bruto_unitario: number | null;  // P.UNIT.BRUTO, PRECIO BRUTO UNIT — bruto por unidad (incluye ILA+IVA)
  precio_neto_total: number | null;      // T.NETO, MONTO NETO, SUB NETO — neto total de la línea
  precio_bruto_total: number | null;     // P.BRUTO, TOTAL BRUTO — bruto total de la línea (incluye ILA+IVA)

  cantidad: number | null;
  unidad: string;
  tipo_precio: "neto" | "bruto";
  descuento_monto: number | null;
  descuento_pct: number | null;
  ila_porcentaje: number | null;
  impuesto_adicional: number | null;
  rayado: boolean;
}

export interface ProcessedProduct {
  id: string;
  producto: string;
  cantidad: number | null;
  unidad: string;
  tipo_precio: "neto" | "bruto";
  descuento_monto: number | null;
  descuento_pct: number | null;
  ila_porcentaje: number | null;
  ila_monto: number | null;
  impuesto_adicional: number | null;
  rayado: boolean;
  precio_total: number; // neto total de la línea (para mostrar en subtitle)

  // Sin descuento
  neto_sin_dto: number;
  bruto_sin_dto: number;
  venta_sin_dto: number;

  // Con descuento
  neto: number;
  bruto: number;
  venta: number;

  editado: boolean;
}
