// ─── USUARIOS ──────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'vendedor' | 'bodeguero' | 'contador';

export interface AppUser {
  uid: string;
  nombre: string;
  email: string;
  rol: UserRole;
  activo: boolean;
  createdAt: Date;
}

// ─── BODEGAS ───────────────────────────────────────────────────────────────
export interface Bodega {
  id: string;
  codigo: string;
  nombre: string;
  direccion?: string;
  responsable?: string;
  esPrincipal: boolean;
  // Cuentas contables opcionales (Sprint 7)
  cuentaInventario?: string;
  cuentaCostoVentas?: string;
  activa: boolean;
  createdAt: Date;
}

// ─── CATEGORÍAS ────────────────────────────────────────────────────────────
export interface Categoria {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

// ─── PROVEEDORES ───────────────────────────────────────────────────────────
export type TipoIdentificacionProv =
  | 'ruc'
  | 'cedula'
  | 'pasaporte'
  | 'identificacion_exterior';

export type TipoProveedor =
  | 'local'
  | 'extranjero_persona_natural'
  | 'extranjero_persona_juridica';

export type RegimenTributario =
  | 'general'
  | 'rimpe_emprendedor'
  | 'rimpe_negocio_popular'
  | 'rimpe_artesano';

export type TipoPago = 'contado' | 'credito';

export interface Proveedor {
  id: string;
  // Identificación SRI
  tipoIdentificacion: TipoIdentificacionProv;
  ruc: string;
  nombre: string;
  nombreComercial?: string;
  tipoProveedor: TipoProveedor;
  regimen?: RegimenTributario;
  // Contacto
  email?: string;
  telefono?: string;
  contacto?: string;
  // Dirección
  pais: string;
  codigoPais: string;
  provincia?: string;
  ciudad?: string;
  direccion?: string;
  // Condiciones comerciales
  tipoPago: TipoPago;
  diasCredito?: number;
  // SRI
  codigoSustento?: string;
  // Configuración contable (Sprint 7)
  cuentaCxP?: string;
  cuentaGasto?: string;
  cuentaIVACompras?: string;
  // Estado
  activo: boolean;
  createdAt: Date;
  notas?: string;
}

// ─── CLIENTES ──────────────────────────────────────────────────────────────
export type TipoIdentificacionCliente =
  | 'ruc'
  | 'cedula'
  | 'pasaporte'
  | 'consumidor_final'
  | 'identificacion_exterior';

export type TipoCliente = 'local' | 'extranjero';

export interface Cliente {
  id: string;
  // Identificación SRI
  tipoIdentificacion: TipoIdentificacionCliente;
  identificacion: string;
  nombre: string;
  nombreComercial?: string;
  tipoCliente: TipoCliente;
  // Contacto
  email?: string;
  telefono?: string;
  // Dirección
  pais: string;
  codigoPais: string;
  provincia?: string;
  ciudad?: string;
  direccion?: string;
  // Condiciones comerciales
  tipoPago: TipoPago;
  diasCredito?: number;
  limiteCredito?: number;
  // Configuración contable (Sprint 7)
  cuentaCxC?: string;
  // Estado
  activo: boolean;
  createdAt: Date;
}

// ─── PRODUCTOS ─────────────────────────────────────────────────────────────
export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion?: string;
  categoriaId: string;
  categoriaNombre?: string;
  precioCompra: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  imagen?: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── VENTAS ────────────────────────────────────────────────────────────────
export interface ItemVenta {
  productoId: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  precioCompra: number;
  descuento: number;
  subtotal: number;
  ganancia: number;
}

export type EstadoVenta = 'completada' | 'anulada';
export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';

export interface Venta {
  id: string;
  fecha: Date;
  clienteId: string;
  clienteNombre: string;
  clienteIdentificacion: string;
  items: ItemVenta[];
  subtotal: number;
  descuentoGlobal: number;
  total: number;
  gananciaTotal: number;
  metodoPago: MetodoPago;
  estado: EstadoVenta;
  usuarioId: string;
  usuarioNombre: string;
  comprobanteId?: string;
}

// ─── COMPROBANTES ──────────────────────────────────────────────────────────
export type TipoComprobante = 'factura' | 'nota_venta';
export type EstadoComprobante = 'pendiente' | 'autorizado' | 'rechazado' | 'anulado';

export interface Comprobante {
  id: string;
  ventaId: string;
  tipo: TipoComprobante;
  secuencial: string;
  claveAcceso: string;
  numeroAutorizacion?: string;
  fechaAutorizacion?: Date;
  estado: EstadoComprobante;
  rideUrl?: string;
  xmlUrl?: string;
  emailEnviado: boolean;
  fechaEmision: Date;
}

// ─── INVENTARIO ────────────────────────────────────────────────────────────
export type TipoMovimiento =
  | 'entrada' | 'salida' | 'ajuste_positivo'
  | 'ajuste_negativo' | 'devolucion_cliente' | 'devolucion_proveedor';

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  bodegaId?: string;
  bodegaNombre?: string;
  referencia: string;
  referenciaType: 'venta' | 'entrada' | 'ajuste' | 'devolucion';
  usuarioId: string;
  usuarioNombre: string;
  fecha: Date;
  notas?: string;
}

export interface ItemEntrada {
  productoId: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Entrada {
  id: string;
  fecha: Date;
  proveedorId: string;
  proveedorNombre: string;
  bodegaId?: string;
  bodegaNombre?: string;
  items: ItemEntrada[];
  subtotal: number;
  iva: number;
  total: number;
  facturaProveedorId?: string;
  usuarioId: string;
  usuarioNombre: string;
  notas?: string;
  createdAt: Date;
}

// ─── CUENTAS POR PAGAR ─────────────────────────────────────────────────────
export type EstadoFacturaProveedor = 'pendiente' | 'parcial' | 'pagada' | 'vencida';

export interface PagoFactura {
  id: string;
  fecha: Date;
  monto: number;
  metodoPago: MetodoPago;
  referencia?: string;
  usuarioId: string;
  usuarioNombre: string;
}

export interface FacturaProveedor {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRuc: string;
  numeroFactura: string;
  claveAcceso?: string;
  numeroAutorizacion?: string;
  fechaEmision: Date;
  fechaVencimiento?: Date;
  subtotal12: number;
  subtotal0: number;
  iva: number;
  total: number;
  saldoPendiente: number;
  estado: EstadoFacturaProveedor;
  pagos: PagoFactura[];
  xmlUrl?: string;
  pdfUrl?: string;
  xmlData?: any;
  entradaId?: string;
  usuarioId: string;
  usuarioNombre: string;
  createdAt: Date;
  notas?: string;
}

// ─── SRI XML PARSER ────────────────────────────────────────────────────────
export interface FacturaSRIData {
  infoTributaria: {
    ruc: string;
    razonSocial: string;
    nombreComercial?: string;
    estab: string;
    ptoEmi: string;
    secuencial: string;
    claveAcceso: string;
    tipoEmision: string;
  };
  infoFactura: {
    fechaEmision: string;
    razonSocialComprador: string;
    identificacionComprador: string;
    totalSinImpuestos: number;
    totalDescuento: number;
    importeTotal: number;
    moneda: string;
  };
  detalles: Array<{
    codigoPrincipal: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    precioTotalSinImpuesto: number;
  }>;
  infoAdicional?: Array<{ nombre: string; valor: string }>;
}
// ─── CONTABILIDAD ──────────────────────────────────────────────────────────

export type TipoCuenta     = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto';
export type NaturalezaCuenta = 'deudora' | 'acreedora';

export interface CuentaContable {
  id:                 string;
  codigo:             string;
  nombre:             string;
  tipo:               TipoCuenta;
  naturaleza:         NaturalezaCuenta;
  nivel:              1 | 2 | 3 | 4 | 5;
  padreId?:           string;
  aceptaMovimientos:  boolean;
  activa:             boolean;
}

export interface CentroCosto {
  id:     string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface AsientoLinea {
  id:               string;
  cuentaId:         string;
  cuentaCodigo:     string;
  cuentaNombre:     string;
  centroCostoId?:   string;
  centroCostoNombre?:string;
  debe:             number;
  haber:            number;
  descripcion?:     string;
}

export type TipoAsiento =
  | 'venta_factura' | 'venta_nota' | 'compra_proveedor'
  | 'pago_proveedor' | 'cobro_cliente' | 'ajuste_inventario'
  | 'apertura' | 'cierre' | 'manual';

export interface AsientoContable {
  id:             string;
  numero?:         string;
  fecha:          Date;
  concepto:       string;
  tipo:           TipoAsiento;
  referenciaId?:  string;
  referenciaTipo?:string;
  lineas:         AsientoLinea[];
  totalDebe:      number;
  totalHaber:     number;
  estado:         'borrador' | 'confirmado';
  usuarioId:      string;
  usuarioNombre:  string;
  createdAt:      Date;
}

export interface ConfigContable {
  cuentaVentas12:          string;
  cuentaVentas0:           string;
  cuentaIVAVentas:         string;
  cuentaCaja:              string;
  cuentaBancos:            string;
  cuentaCxCClientes:       string;
  cuentaCostoVentas:       string;
  cuentaInventario:        string;
  cuentaIVACompras:        string;
  cuentaCxPProveedores:    string;
  cuentaRetFuenteClientes: string;
  cuentaRetIVAClientes:    string;
}

export interface PeriodoContable {
  id:       string;
  anio:     number;
  mes:      number;
  nombre:   string;
  estado:   'abierto' | 'cerrado';
  creadoAt: Date;
}

// ─── TRIBUTARIO ────────────────────────────────────────────────────────────

export interface ConfigRetencion {
  id:          string;
  tipo:        'fuente_ir' | 'iva';
  codigo:      string;
  descripcion: string;
  porcentaje:  number;
  aplicaA:     'bienes' | 'servicios' | 'ambos';
  activo:      boolean;
}

export interface ConfigICE {
  id:          string;
  codigo:      string;
  descripcion: string;
  tipoTarifa:  'especifica' | 'ad_valorem' | 'mixta';
  tarifaEspecifica?: number;
  tarifaAdValorem?:  number;
  unidad?:     string;
  activo:      boolean;
}