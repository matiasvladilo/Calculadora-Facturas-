export interface RawProduct {
  producto: string;
  precio_total: number;              // MONTO NETO de la línea (antes de IVA e ILA)
  precio_bruto_factura: number | null; // P.BRUTO si existe en la factura (ya incluye ILA + IVA)
  cantidad: number | null;
  unidad: string;
  tipo_precio: "neto" | "bruto";
  descuento_monto: number | null;
  descuento_pct: number | null;
  ila_porcentaje: number | null;     // 0, 20.5 o 31.5
  impuesto_adicional: number | null; // otros impuestos adicionales en $
  rayado: boolean;
}

export interface ProcessedProduct {
  id: string;
  producto: string;
  cantidad: number | null;
  unidad: string;
  tipo_precio: "neto" | "bruto";
  precio_total: number;
  descuento_monto: number | null;
  descuento_pct: number | null;
  ila_porcentaje: number | null;
  ila_monto: number | null;          // $ ILA unitario calculado
  impuesto_adicional: number | null;
  rayado: boolean;

  // Sin descuento
  neto_sin_dto: number;
  bruto_sin_dto: number;   // incluye ILA + IVA
  venta_sin_dto: number;

  // Con descuento
  neto: number;
  bruto: number;           // incluye ILA + IVA
  venta: number;

  editado: boolean;
}
