// ─── USUARIOS ──────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'vendedor' | 'bodeguero' | 'contador' | 'finanzas';

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
  // Datos bancarios (para pagos por transferencia / archivo TXT)
  bancoNombre?:          string;
  bancoCodigo?:          string;   // código de la institución financiera (SBS)
  tipoCuentaBancaria?:   'corriente' | 'ahorros';
  numeroCuentaBancaria?: string;
  emailPago?:            string;   // correo para notificación de pago
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
export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito';

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
  esCxC?: boolean;       // true si es venta a crédito
  diasCredito?: number;  // días de crédito pactados
  cxcId?: string;        // ID del documento en cuentas_cobrar
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
export type EstadoFacturaProveedor = 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'anulada';

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
  xmlRaw?: string;   // XML autorizado original (para reexportar)
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
  referenciaId?:  string;   // ID del documento origen (venta, entrada, pago, etc.)
  referenciaTipo?:string;   // 'venta' | 'entrada' | 'factura_proveedor' | etc.
  lineas:         AsientoLinea[];
  totalDebe:      number;
  totalHaber:     number;
  estado:         'borrador' | 'confirmado';
  bloqueado:      boolean;  // true si el período contable está cerrado
  editadoManualmente: boolean; // true si fue modificado después de crearse automáticamente
  usuarioId:      string;
  usuarioNombre:  string;
  createdAt:      Date;
  updatedAt?:     Date;     // fecha de última edición
  usuarioEdicionId?:     string;
  usuarioEdicionNombre?: string;
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
  // Cuentas adicionales (opcionales — con defaults razonables)
  cuentaUtilidadEjercicio?:   string; // 3.x — para asiento de cierre
  cuentaCapital?:              string; // 3.x — para asiento de apertura
  cuentaProvisionCartera?:     string; // 1.2.x — provisión cuentas incobrables
  cuentaGastoProvision?:       string; // 5.x   — gasto por provisión
  cuentaRetFuenteProveedores?: string; // 2.1.x — retención recibida de proveedores / pagos
  cuentaRetIVAProveedores?:    string; // 2.1.x — retención IVA recibida
  cuentaRetFuentePorPagar?:    string; // 2.1.03 — retención en la fuente que emitimos (por pagar al SRI)
  cuentaRetIVAPorPagar?:       string; // 2.1.04 — retención de IVA que emitimos (por pagar al SRI)
}

// ─── DOCUMENTOS RECIBIDOS (NC / ND de proveedores, importados por XML) ──────

export type TipoDocRecibido = 'nota_credito' | 'nota_debito';

export interface DocumentoRecibido {
  id:              string;
  tipo:            TipoDocRecibido;
  proveedorId?:    string;
  proveedorNombre: string;
  proveedorRuc:    string;
  numero:          string;   // 001-001-000000001
  claveAcceso?:    string;
  docModificado?:  string;   // factura que modifica
  fechaEmision:    Date;
  subtotal:        number;
  iva:             number;
  total:           number;
  xmlRaw?:         string;
  asientoId?:      string;
  usuarioId:       string;
  usuarioNombre:   string;
  createdAt:       Date;
}

export interface PeriodoContable {
  id:       string;
  anio:     number;
  mes:      number;
  nombre:   string;
  estado:   'abierto' | 'cerrado';
  creadoAt: Date;
}

// ─── RÉGIMEN Y CONFIGURACIÓN DE EMPRESA ────────────────────────────────────

/**
 * Régimen tributario que define:
 *  - Qué comprobantes puede emitir
 *  - Si cobra IVA o no
 *  - Si es agente de retención
 *  - Qué formularios SRI debe declarar
 */
export type RegimenEmpresa =
  | 'general'              // RUC, obligado o no a contabilidad, IVA 15%, facturas
  | 'rimpe_emprendedor'    // RUC, hasta $300k ventas, IVA 15%, facturas + notas venta
  | 'rimpe_negocio_popular'// Antes "RISE": notas de venta, sin IVA, tarifa fija mensual
  | 'rimpe_artesano'       // Artesano calificado JNDA: factura con IVA 0%
  | 'exportador_habitual'  // IVA 0% en exportaciones, devol. IVA, facturas exportación
  | 'contribuyente_especial'; // Grandes empresas, retención del 100% IVA

export interface ComprobantesHabilitados {
  factura:           boolean;
  notaVenta:         boolean;  // Solo RIMPE negocio popular
  notaCredito:       boolean;
  notaDebito:        boolean;
  comprobanteRetencion: boolean; // Solo si es agente de retención
  liquidacionCompras:boolean;
  guiaRemision:      boolean;
  reciboInterno:     boolean;  // Sin validez tributaria, solo control interno
}

export interface ReglasTributarias {
  cobrarIVA:              boolean;   // false para negocio popular y artesanos
  tasaIVA:                number;    // 15 general, 0 exportador/artesano
  esAgenteRetencion:      boolean;   // Puede emitir comp. retención
  obligadoContabilidad:   boolean;
  contribuyenteEspecial:  boolean;
  aplicaICE:              boolean;   // Tabacos, licores, etc.
  // Declaraciones requeridas
  declaraFormulario104:   boolean;
  declaraFormulario103:   boolean;
  declaraFormulario105:   boolean;
  declaraATS:             boolean;
  declaraFormulario101:   boolean;  // IR anual
  declaraRIMPE:           boolean;  // Formulario RIMPE semestral
}

export interface ConfigEmpresa {
  // Identificación
  nombreEmpresa:     string;
  nombreComercial?:  string;
  ruc:               string;
  direccion:         string;
  telefono?:         string;
  email?:            string;
  ciudad?:           string;
  provincia?:        string;
  logo?:             string;  // base64 o URL
  // Régimen tributario — el campo más importante
  regimen:           RegimenEmpresa;
  // Derivados del régimen (calculados automáticamente, sobreescribibles)
  comprobantesHabilitados: ComprobantesHabilitados;
  reglasTributarias:       ReglasTributarias;
  // Facturación
  moneda:            string;  // USD
  // Pie de RIDE / recibos
  mensajeAdicional?: string;
  updatedAt?:        Date;
}

// ─── CONFIGURACIÓN DE CORREO (SMTP) ────────────────────────────────────────

export type ProveedorEmail = 'gmail' | 'outlook' | 'otro';

export interface ConfigEmail {
  proveedor: ProveedorEmail;
  email:     string;   // usuario SMTP y dirección remitente
  password:  string;   // contraseña de aplicación (NO la contraseña normal)
  fromName?: string;   // nombre que aparece como remitente
  // Solo para proveedor 'otro'
  host?:     string;
  port?:     number;
  updatedAt?: Date;
}

// ─── CUENTAS POR COBRAR (CxC) ──────────────────────────────────────────────

export type EstadoCxC = 'pendiente' | 'parcial' | 'pagada' | 'vencida';

export interface CobroCxC {
  id:           string;
  fecha:        Date;
  monto:        number;
  metodoPago:   MetodoPago;
  referencia?:  string;
  notas?:       string;
  usuarioId:    string;
  usuarioNombre:string;
}

export interface CuentaCobrar {
  id:                  string;
  ventaId:             string;
  comprobanteId?:      string;
  clienteId:           string;
  clienteNombre:       string;
  clienteIdentificacion:string;
  fechaEmision:        Date;
  fechaVencimiento:    Date;
  diasCredito:         number;
  total:               number;
  saldoPendiente:      number;
  estado:              EstadoCxC;
  cobros:              CobroCxC[];
  retencionesFuenteRecibidas?: number;
  retencionesIVARecibidas?:    number;
  usuarioId:           string;
  usuarioNombre:       string;
  createdAt:           Date;
  notas?:              string;
}

// ─── NOTAS DE CRÉDITO SRI ──────────────────────────────────────────────────

export type EstadoNotaCredito = 'pendiente' | 'autorizada' | 'rechazada' | 'anulada';
export type MotivoNotaCredito = 'devolucion' | 'descuento' | 'error' | 'anulacion';

export interface ItemNotaCredito {
  codigoPrincipal:       string;
  descripcion:           string;
  cantidad:              number;
  precioUnitario:        number;
  descuento:             number;
  precioTotalSinImpuesto:number;
  tieneIVA:              boolean;
}

export interface NotaCredito {
  id:                   string;
  comprobanteOrigenId:  string;
  numeroComprobanteOrigen: string;
  fechaEmisionOrigen:   Date;
  clienteId:            string;
  clienteNombre:        string;
  clienteIdentificacion:string;
  tipo:                 'nota_credito';
  secuencial:           string;
  claveAcceso:          string;
  numeroAutorizacion?:  string;
  fechaAutorizacion?:   Date;
  estado:               EstadoNotaCredito;
  motivo:               MotivoNotaCredito;
  descripcionMotivo:    string;
  fechaEmision:         Date;
  items:                ItemNotaCredito[];
  subtotal:             number;
  iva:                  number;
  total:                number;
  xmlUrl?:              string;
  rideUrl?:             string;
  usuarioId:            string;
  usuarioNombre:        string;
  createdAt:            Date;
}

// ─── NOTAS DE DÉBITO SRI ───────────────────────────────────────────────────

export type EstadoNotaDebito = 'pendiente' | 'autorizada' | 'rechazada' | 'anulada';

export interface RazonNotaDebito {
  descripcion: string;
  valor:       number;
}

export interface NotaDebito {
  id:                   string;
  comprobanteOrigenId:  string;
  numeroComprobanteOrigen: string;
  fechaEmisionOrigen:   Date;
  clienteId:            string;
  clienteNombre:        string;
  clienteIdentificacion:string;
  tipo:                 'nota_debito';
  secuencial:           string;
  claveAcceso:          string;
  numeroAutorizacion?:  string;
  fechaAutorizacion?:   Date;
  estado:               EstadoNotaDebito;
  fechaEmision:         Date;
  razones:              RazonNotaDebito[];
  subtotal:             number;
  iva:                  number;
  total:                number;
  xmlUrl?:              string;
  usuarioId:            string;
  usuarioNombre:        string;
  createdAt:            Date;
}

// ─── COMPROBANTES DE RETENCIÓN EMITIDOS (a proveedores) ───────────────────

export type EstadoRetencion = 'pendiente' | 'autorizado' | 'rechazado' | 'anulado';

export interface LineaRetencion {
  id:           string;
  tipo:         'fuente_ir' | 'iva';
  codigo:       string;
  descripcion:  string;
  porcentaje:   number;
  baseImponible:number;
  valorRetenido:number;
}

export interface RetencionEmitida {
  id:                   string;
  facturaProveedorId:   string;
  numeroFacturaProveedor:string;
  proveedorId:          string;
  proveedorNombre:      string;
  proveedorRuc:         string;
  fechaFactura:         Date;
  secuencial:           string;
  claveAcceso:          string;
  numeroAutorizacion?:  string;
  fechaAutorizacion?:   Date;
  estado:               EstadoRetencion;
  fechaEmision:         Date;
  ejercicioFiscal:      string;
  lineas:               LineaRetencion[];
  totalRetenido:        number;
  xmlUrl?:              string;
  usuarioId:            string;
  usuarioNombre:        string;
  createdAt:            Date;
}

// ─── CONCILIACIÓN BANCARIA ─────────────────────────────────────────────────

export interface CuentaBancaria {
  id:           string;
  banco:        string;
  tipoCuenta:   'corriente' | 'ahorros';
  numeroCuenta: string;
  titular:      string;
  moneda:       string;
  saldoInicial: number;
  cuentaContableId?: string;
  cuentaContableCodigo?: string;
  cuentaContableNombre?: string;
  activa:       boolean;
  createdAt:    Date;
}

export type TipoMovBanco = 'credito' | 'debito';
export type EstadoConciliacion = 'no_conciliado' | 'conciliado' | 'ignorado';

export interface MovimientoBancario {
  id:             string;
  cuentaBancariaId:string;
  fecha:          Date;
  descripcion:    string;
  tipo:           TipoMovBanco;
  monto:          number;
  saldo?:         number;
  referencia?:    string;
  estado:         EstadoConciliacion;
  asientoId?:     string;
  createdAt:      Date;
}

// ─── ACTIVOS FIJOS ─────────────────────────────────────────────────────────

export type MetodoDepreciacion = 'linea_recta' | 'saldo_decreciente' | 'unidades_produccion';
export type EstadoActivo = 'activo' | 'depreciado' | 'dado_de_baja' | 'vendido';

export interface CuotaDepreciacion {
  id:             string;
  anio:           number;
  mes:            number;
  cuota:          number;
  depAcumulada:   number;
  valorLibros:    number;
  asientoId?:     string;
  registrado:     boolean;
}

export interface ActivoFijo {
  id:                    string;
  codigo:                string;
  descripcion:           string;
  categoria:             string;
  proveedor?:            string;
  fechaAdquisicion:      Date;
  valorAdquisicion:      number;
  valorResidual:         number;
  vidaUtilAnios:         number;
  metodoDepreciacion:    MetodoDepreciacion;
  tasaDepreciacion:      number;
  depreciacionAcumulada: number;
  valorLibros:           number;
  estado:                EstadoActivo;
  ubicacion?:            string;
  // Cuentas contables
  cuentaActivoId?:       string;
  cuentaActivoCodigo?:   string;
  cuentaDepAcumId?:      string;
  cuentaDepAcumCodigo?:  string;
  cuentaGastoDepId?:     string;
  cuentaGastoDepCodigo?: string;
  cuotas:                CuotaDepreciacion[];
  createdAt:             Date;
  updatedAt:             Date;
  notas?:                string;
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

// ─── RETENCIONES RECIBIDAS (clientes nos retienen al pagar) ────────────────

export interface LineaRetencionRecibida {
  tipo:          'fuente_ir' | 'iva';
  codigo:        string;
  descripcion:   string;
  porcentaje:    number;
  baseImponible: number;
  valorRetenido: number;
}

export interface RetencionRecibida {
  id:                  string;
  ventaId:             string;           // Venta o comprobante al que aplica
  numeroComprobante:   string;           // Ej: 001-001-000000001
  clienteId:           string;
  clienteNombre:       string;
  clienteIdentificacion: string;
  // Datos del comprobante de retención recibido
  numeroRetencion:     string;           // Número que emitió el cliente
  claveAcceso?:        string;           // para evitar duplicados al reimportar
  fechaEmision:        Date;
  ejercicioFiscal:     string;           // MM/YYYY
  lineas:              LineaRetencionRecibida[];
  totalRetenido:       number;
  retFuente:           number;
  retIVA:              number;
  // Contabilidad
  asientoId?:          string;
  usuarioId:           string;
  usuarioNombre:       string;
  createdAt:           Date;
}