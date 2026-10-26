import { ConfigContable } from '@/types';
import { PLAN_CUENTAS_SUPERCIAS, CuentaSupercias } from '@/lib/data/plan-cuentas-supercias';

/** Plan de cuentas del sistema: el oficial de la Superintendencia de Compañías. */
export const PLAN_CUENTAS_ECUADOR: CuentaSupercias[] = PLAN_CUENTAS_SUPERCIAS;

/** Cuentas por defecto de cada operación (código del plan de la Supercias). */
export const CUENTAS_POR_DEFECTO = {
  cuentaVentas12:          '410101',
  cuentaVentas0:           '410102',
  cuentaIVAVentas:         '201070101',
  cuentaCaja:              '1010101',
  cuentaBancos:            '1010102',
  cuentaCxCClientes:       '101020502',
  cuentaCostoVentas:       '510113',
  cuentaInventario:        '1010306',
  cuentaGastoCompras:      '52022801',
  cuentaIVACompras:        '101050101',
  cuentaCxPProveedores:    '2010301',
  cuentaRetFuenteClientes: '101050201',
  cuentaRetIVAClientes:    '101050102',
  cuentaRetFuentePorPagar: '201070102',
  cuentaRetIVAPorPagar:    '201070103',
  cuentaUtilidadEjercicio: '30701',
  cuentaProvisionCartera:  '1010209',
  cuentaGastoProvision:    '52022305',
  cuentaAjusteInventario:  '52022302',
  cuentaInteresesGanados:  '4302',
};

export const CONFIG_CONTABLE_DEFAULT: Omit<ConfigContable,'id'> & Record<string,string> = CUENTAS_POR_DEFECTO;

/**
 * Equivalencias del plan anterior (códigos con puntos) al plan de la Supercias.
 * Incluye códigos que el motor usaba por defecto aunque no existieran en el plan.
 * Las cuentas de agrupación (1, 1.1, 2.1, 6.1…) no se mapean: solo se desactivan.
 */
export const MAPEO_PLAN_ANTERIOR: Record<string, string> = {
  '1.1.01': '1010101',   // Caja
  '1.1.02': '1010102',   // Bancos
  '1.1.03': '101020502', // Cuentas y documentos por cobrar
  '1.1.04': '101050101', // IVA en compras
  '1.1.05': '1010306',   // Inventario de mercaderías
  '1.1.06': '101050201', // Retenciones en la fuente por cobrar
  '1.1.07': '101050102', // Retenciones IVA por cobrar
  '1.1.08': '1010403',   // Anticipo a proveedores
  '1.2.01': '1020110',   // Propiedad, planta y equipo
  '1.2.01.01': '1020112',// (código por defecto de activos fijos) depreciación acumulada
  '1.2.02': '1020112',   // Depreciación acumulada PPE
  '2.1.01': '2010301',   // Cuentas y documentos por pagar
  '2.1.02': '201070101', // IVA en ventas por pagar
  '2.1.03': '201070102', // Retenciones en la fuente por pagar
  '2.1.04': '201070103', // Retenciones IVA por pagar
  '2.1.05': '2010703',   // IESS por pagar
  '2.1.06': '201070104', // ICE por pagar
  '2.1.07': '20110',     // Anticipo de clientes
  '2.2.01': '2020301',   // Préstamos bancarios largo plazo
  '3.1':    '30101',     // Capital social
  '3.2':    '30401',     // Reserva legal
  '3.3':    '30601',     // Utilidades retenidas
  '3.4':    '30701',     // Utilidad del ejercicio
  '3.4.01': '30701',
  '4.1.01': '410101',    // Ventas gravadas
  '4.1.02': '410102',    // Ventas tarifa 0%
  '4.2.01': '4302',      // Intereses ganados
  '4.2.02': '430501',    // Descuentos en compras
  '4.2.03': '430502',    // Otros ingresos no operacionales
  '5.1.01': '510113',    // Costo de mercaderías vendidas
  '5.2.01': '52022001',  // ICE tabacos
  '5.2.02': '52022002',  // ICE bebidas
  '5.2.04': '52022305',  // (código por defecto) gasto por provisión de cartera
  '5.3.01': '52022302',  // (código por defecto) ajustes de inventario
  '6.1.01': '520201',    // Sueldos y salarios
  '6.1.02': '520202',    // Aporte patronal IESS
  '6.1.03': '520209',    // Arrendamiento
  '6.1.04': '520218',    // Servicios básicos
  '6.1.05': '52022802',  // Suministros de oficina
  '6.1.06': '52022101',  // Depreciaciones
  '6.1.07': '520205',    // Honorarios profesionales
  '6.1.08': '52022801',  // Gastos de alimentación
  '6.1.09': '520212',    // Combustibles y lubricantes
  '6.1.10': '520208',    // Mantenimiento y reparaciones
  '6.1.11': '520215',    // Transporte y fletes
  '6.1.12': '520214',    // Seguros
  '6.1.13': '52022803',  // Otros gastos generales
  '6.2.01': '520111',    // Publicidad
  '6.2.02': '520110',    // Comisiones por ventas
  '6.3.01': '520301',    // Intereses bancarios
  '6.3.02': '520302',    // Comisiones bancarias
};


export const RETENCIONES_IR_INICIAL = [
  { codigo:'303', descripcion:'Honorarios profesionales',                        porcentaje:10,  aplicaA:'servicios' },
  { codigo:'304', descripcion:'Servicios predomina mano de obra',                porcentaje:2,   aplicaA:'servicios' },
  { codigo:'307', descripcion:'Publicidad y comunicación',                       porcentaje:1,   aplicaA:'servicios' },
  { codigo:'308', descripcion:'Servicio de transporte privado/carga',            porcentaje:1,   aplicaA:'servicios' },
  { codigo:'310', descripcion:'Arrendamiento bienes inmuebles',                  porcentaje:8,   aplicaA:'servicios' },
  { codigo:'312', descripcion:'Transferencia de bienes muebles',                 porcentaje:1,   aplicaA:'bienes'    },
  { codigo:'320', descripcion:'Compra de bienes muebles corporales',             porcentaje:1,   aplicaA:'bienes'    },
  { codigo:'322', descripcion:'Otros servicios no especificados',                porcentaje:2,   aplicaA:'servicios' },
  { codigo:'325', descripcion:'Liquidación de compras (sin RUC)',                porcentaje:2,   aplicaA:'ambos'     },
  { codigo:'332', descripcion:'Venta de combustibles',                           porcentaje:0.1, aplicaA:'bienes'    },
  { codigo:'340', descripcion:'Otras retenciones al 1%',                        porcentaje:1,   aplicaA:'ambos'     },
  { codigo:'341', descripcion:'Otras retenciones al 2%',                        porcentaje:2,   aplicaA:'ambos'     },
  { codigo:'343', descripcion:'Otras retenciones al 8%',                        porcentaje:8,   aplicaA:'servicios' },
];

export const RETENCIONES_IVA_INICIAL = [
  { codigo:'721', descripcion:'Bienes — retención 30% del IVA',              porcentaje:30,  aplicaA:'bienes'    },
  { codigo:'723', descripcion:'Servicios — retención 70% del IVA',           porcentaje:70,  aplicaA:'servicios' },
  { codigo:'725', descripcion:'Servicios intelecto — retención 100% del IVA',porcentaje:100, aplicaA:'servicios' },
  { codigo:'727', descripcion:'Arrendamiento inmueble PN — 100% del IVA',    porcentaje:100, aplicaA:'servicios' },
];

export const ICE_INICIAL = [
  { codigo:'3610', descripcion:'Cigarrillos rubios',          tipoTarifa:'especifica', tarifaEspecifica:0.1723, unidad:'unidad'     },
  { codigo:'3620', descripcion:'Cigarrillos negros',          tipoTarifa:'especifica', tarifaEspecifica:0.1723, unidad:'unidad'     },
  { codigo:'3690', descripcion:'Otros tabacos',               tipoTarifa:'ad_valorem', tarifaAdValorem:150,     unidad:'unidad'     },
  { codigo:'2411', descripcion:'Cervezas',                    tipoTarifa:'mixta',      tarifaEspecifica:0.9124, tarifaAdValorem:30, unidad:'litro' },
  { codigo:'2421', descripcion:'Vinos',                       tipoTarifa:'mixta',      tarifaEspecifica:0.9124, tarifaAdValorem:30, unidad:'litro' },
  { codigo:'2422', descripcion:'Bebidas alcohólicas spirits', tipoTarifa:'mixta',      tarifaEspecifica:0.9124, tarifaAdValorem:30, unidad:'litro' },
];