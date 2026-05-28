import { TipoCuenta, NaturalezaCuenta } from '@/types';

interface CuentaSeed {
  codigo:            string;
  nombre:            string;
  tipo:              TipoCuenta;
  naturaleza:        NaturalezaCuenta;
  nivel:             1 | 2 | 3 | 4 | 5;
  aceptaMovimientos: boolean;
}

export const PLAN_CUENTAS_ECUADOR: CuentaSeed[] = [
  // ── ACTIVO ──────────────────────────────────────────────────────────────
  { codigo:'1',       nombre:'ACTIVO',                              tipo:'activo',    naturaleza:'deudora',   nivel:1, aceptaMovimientos:false },
  { codigo:'1.1',     nombre:'ACTIVO CORRIENTE',                    tipo:'activo',    naturaleza:'deudora',   nivel:2, aceptaMovimientos:false },
  { codigo:'1.1.01',  nombre:'Caja',                                tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.1.02',  nombre:'Bancos',                              tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.1.03',  nombre:'Cuentas y Documentos por Cobrar',     tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.1.04',  nombre:'IVA en Compras',                      tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.1.05',  nombre:'Inventario de Mercaderías',           tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.1.06',  nombre:'Retenciones en la Fuente por Cobrar', tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.1.07',  nombre:'Retenciones IVA por Cobrar',          tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.1.08',  nombre:'Anticipo Proveedores',                tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.2',     nombre:'ACTIVO NO CORRIENTE',                 tipo:'activo',    naturaleza:'deudora',   nivel:2, aceptaMovimientos:false },
  { codigo:'1.2.01',  nombre:'Propiedad, Planta y Equipo',          tipo:'activo',    naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'1.2.02',  nombre:'Depreciación Acumulada PPE',          tipo:'activo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },

  // ── PASIVO ───────────────────────────────────────────────────────────────
  { codigo:'2',       nombre:'PASIVO',                              tipo:'pasivo',    naturaleza:'acreedora', nivel:1, aceptaMovimientos:false },
  { codigo:'2.1',     nombre:'PASIVO CORRIENTE',                    tipo:'pasivo',    naturaleza:'acreedora', nivel:2, aceptaMovimientos:false },
  { codigo:'2.1.01',  nombre:'Cuentas y Documentos por Pagar',      tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'2.1.02',  nombre:'IVA en Ventas por Pagar',             tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'2.1.03',  nombre:'Retenciones en la Fuente por Pagar',  tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'2.1.04',  nombre:'Retenciones IVA por Pagar',           tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'2.1.05',  nombre:'IESS por Pagar',                      tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'2.1.06',  nombre:'ICE por Pagar',                       tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'2.1.07',  nombre:'Anticipo Clientes',                   tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'2.2',     nombre:'PASIVO NO CORRIENTE',                 tipo:'pasivo',    naturaleza:'acreedora', nivel:2, aceptaMovimientos:false },
  { codigo:'2.2.01',  nombre:'Préstamos Bancarios Largo Plazo',     tipo:'pasivo',    naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },

  // ── PATRIMONIO ───────────────────────────────────────────────────────────
  { codigo:'3',       nombre:'PATRIMONIO',                          tipo:'patrimonio',naturaleza:'acreedora', nivel:1, aceptaMovimientos:false },
  { codigo:'3.1',     nombre:'Capital Social',                      tipo:'patrimonio',naturaleza:'acreedora', nivel:2, aceptaMovimientos:true  },
  { codigo:'3.2',     nombre:'Reserva Legal',                       tipo:'patrimonio',naturaleza:'acreedora', nivel:2, aceptaMovimientos:true  },
  { codigo:'3.3',     nombre:'Utilidades Retenidas de Ejercicios Anteriores', tipo:'patrimonio',naturaleza:'acreedora', nivel:2, aceptaMovimientos:true },
  { codigo:'3.4',     nombre:'Utilidad / Pérdida del Ejercicio',    tipo:'patrimonio',naturaleza:'acreedora', nivel:2, aceptaMovimientos:true  },

  // ── INGRESOS ─────────────────────────────────────────────────────────────
  { codigo:'4',       nombre:'INGRESOS',                            tipo:'ingreso',   naturaleza:'acreedora', nivel:1, aceptaMovimientos:false },
  { codigo:'4.1',     nombre:'INGRESOS OPERACIONALES',              tipo:'ingreso',   naturaleza:'acreedora', nivel:2, aceptaMovimientos:false },
  { codigo:'4.1.01',  nombre:'Ventas gravadas IVA 15%',             tipo:'ingreso',   naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'4.1.02',  nombre:'Ventas tarifa 0% IVA',                tipo:'ingreso',   naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'4.2',     nombre:'OTROS INGRESOS',                      tipo:'ingreso',   naturaleza:'acreedora', nivel:2, aceptaMovimientos:false },
  { codigo:'4.2.01',  nombre:'Intereses Ganados',                   tipo:'ingreso',   naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'4.2.02',  nombre:'Descuentos en Compras',               tipo:'ingreso',   naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },
  { codigo:'4.2.03',  nombre:'Otros Ingresos No Operacionales',     tipo:'ingreso',   naturaleza:'acreedora', nivel:3, aceptaMovimientos:true  },

  // ── COSTOS ───────────────────────────────────────────────────────────────
  { codigo:'5',       nombre:'COSTOS',                              tipo:'costo',     naturaleza:'deudora',   nivel:1, aceptaMovimientos:false },
  { codigo:'5.1',     nombre:'COSTO DE VENTAS',                     tipo:'costo',     naturaleza:'deudora',   nivel:2, aceptaMovimientos:false },
  { codigo:'5.1.01',  nombre:'Costo de Mercaderías Vendidas',       tipo:'costo',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'5.2',     nombre:'ICE',                                 tipo:'costo',     naturaleza:'deudora',   nivel:2, aceptaMovimientos:false },
  { codigo:'5.2.01',  nombre:'ICE Tabacos y Cigarrillos',           tipo:'costo',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'5.2.02',  nombre:'ICE Bebidas Alcohólicas',             tipo:'costo',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },

  // ── GASTOS ───────────────────────────────────────────────────────────────
  { codigo:'6',       nombre:'GASTOS',                              tipo:'gasto',     naturaleza:'deudora',   nivel:1, aceptaMovimientos:false },
  { codigo:'6.1',     nombre:'GASTOS ADMINISTRATIVOS',              tipo:'gasto',     naturaleza:'deudora',   nivel:2, aceptaMovimientos:false },
  { codigo:'6.1.01',  nombre:'Sueldos y Salarios',                  tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.1.02',  nombre:'Aporte Patronal IESS',                tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.1.03',  nombre:'Arrendamiento Local',                 tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.1.04',  nombre:'Servicios Básicos',                   tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.1.05',  nombre:'Suministros de Oficina',              tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.1.06',  nombre:'Depreciaciones',                      tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.1.07',  nombre:'Honorarios Profesionales',            tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.2',     nombre:'GASTOS DE VENTAS',                    tipo:'gasto',     naturaleza:'deudora',   nivel:2, aceptaMovimientos:false },
  { codigo:'6.2.01',  nombre:'Publicidad y Propaganda',             tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.2.02',  nombre:'Comisiones por Ventas',               tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.3',     nombre:'GASTOS FINANCIEROS',                  tipo:'gasto',     naturaleza:'deudora',   nivel:2, aceptaMovimientos:false },
  { codigo:'6.3.01',  nombre:'Intereses Bancarios',                 tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
  { codigo:'6.3.02',  nombre:'Comisiones Bancarias',                tipo:'gasto',     naturaleza:'deudora',   nivel:3, aceptaMovimientos:true  },
];

export const CONFIG_CONTABLE_DEFAULT: Omit<ConfigContable,'id'> & Record<string,string> = {
  cuentaVentas12:          '4.1.01',
  cuentaVentas0:           '4.1.02',
  cuentaIVAVentas:         '2.1.02',
  cuentaCaja:              '1.1.01',
  cuentaBancos:            '1.1.02',
  cuentaCxCClientes:       '1.1.03',
  cuentaCostoVentas:       '5.1.01',
  cuentaInventario:        '1.1.05',
  cuentaIVACompras:        '1.1.04',
  cuentaCxPProveedores:    '2.1.01',
  cuentaRetFuenteClientes: '1.1.06',
  cuentaRetIVAClientes:    '1.1.07',
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