export interface RawProduct {
  producto: string;
  precio_total: number;              // precio antes de descuento
  cantidad: number | null;
  unidad: string;
  tipo_precio: "neto" | "bruto";
  descuento_monto: number | null;    // monto descuento en $, si existe
  descuento_pct: number | null;      // % descuento, si existe
  impuesto_adicional: number | null; // impuesto extra (alcohol, etc.) en $
  rayado: boolean;                   // si la línea estaba tachada en la factura
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
  impuesto_adicional: number | null;
  rayado: boolean;

  // Sin descuento (precio original)
  neto_sin_dto: number;
  bruto_sin_dto: number;
  venta_sin_dto: number;

  // Con descuento aplicado
  neto: number;
  bruto: number;
  venta: number;

  editado: boolean;
}
