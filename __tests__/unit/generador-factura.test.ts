import { describe, it, expect } from 'vitest';
import { generarXMLFactura, DatosFactura, ItemXMLFactura } from '@/lib/sri/generador-factura';

const ITEM: ItemXMLFactura = {
  codigoPrincipal:        'PROD001',
  descripcion:            'Producto de prueba',
  cantidad:               2,
  precioUnitario:         10.5,
  descuento:              0,
  precioTotalSinImpuesto: 21.0,
  tieneIVA:               true,
};

const FACTURA: DatosFactura = {
  claveAcceso:          '1'.repeat(49),
  secuencial:           1,
  fechaEmision:         new Date(2024, 0, 15), // 15/01/2024
  ambiente:             '2',
  ruc:                  '1790145164001',
  razonSocial:          'Empresa S.A.',
  establecimiento:      '001',
  puntoEmision:         '001',
  direccionMatriz:      'Av. Principal 123',
  tipoIdComprador:      '05',
  identificacion:       '1234567890',
  razonSocialComprador: 'Cliente Test',
  items:                [ITEM],
  subtotal15:           21.0,
  subtotal0:            0,
  totalDescuento:       0,
  iva:                  3.15,
  total:                24.15,
  formaPago:            '01',
};

describe('generarXMLFactura — estructura general', () => {
  it('genera un string XML con declaración', () => {
    const xml = generarXMLFactura(FACTURA);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<factura');
  });

  it('incluye version 1.1.0', () => {
    expect(generarXMLFactura(FACTURA)).toContain('version="1.1.0"');
  });

  it('codDoc es siempre 01 (factura)', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<codDoc>01</codDoc>');
  });
});

describe('generarXMLFactura — infoTributaria', () => {
  it('incluye la clave de acceso', () => {
    expect(generarXMLFactura(FACTURA)).toContain(FACTURA.claveAcceso);
  });

  it('incluye el RUC del emisor', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<ruc>1790145164001</ruc>');
  });

  it('incluye el ambiente', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<ambiente>2</ambiente>');
  });

  it('establece tipoEmision en 1 (normal)', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<tipoEmision>1</tipoEmision>');
  });
});

describe('generarXMLFactura — infoFactura', () => {
  it('formatea la fecha como dd/MM/yyyy', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<fechaEmision>15/01/2024</fechaEmision>');
  });

  it('formatea el secuencial con 9 dígitos', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<secuencial>000000001</secuencial>');
  });

  it('totalSinImpuestos es la suma de bases imponibles', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<totalSinImpuestos>21.00</totalSinImpuestos>');
  });

  it('importeTotal refleja el total con IVA', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<importeTotal>24.15</importeTotal>');
  });

  it('usa moneda DOLAR', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<moneda>DOLAR</moneda>');
  });
});

describe('generarXMLFactura — ítems', () => {
  it('formatea cantidad con 6 decimales', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<cantidad>2.000000</cantidad>');
  });

  it('formatea precioUnitario con 6 decimales', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<precioUnitario>10.500000</precioUnitario>');
  });

  it('usa codigoPorcentaje 4 para IVA 15%', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<codigoPorcentaje>4</codigoPorcentaje>');
  });

  it('calcula IVA del ítem al 15%', () => {
    // 21.0 * 0.15 = 3.15
    expect(generarXMLFactura(FACTURA)).toContain('<valor>3.15</valor>');
  });

  it('usa codigoPorcentaje 0 para productos sin IVA', () => {
    const itemSinIVA: ItemXMLFactura = {
      ...ITEM, tieneIVA: false, precioTotalSinImpuesto: 50,
    };
    const xml = generarXMLFactura({
      ...FACTURA,
      items: [itemSinIVA],
      subtotal0: 50,
      subtotal15: 0,
      iva: 0,
      total: 50,
    });
    expect(xml).toContain('<codigoPorcentaje>0</codigoPorcentaje>');
    expect(xml).toContain('<valor>0.00</valor>');
  });

  it('incluye baseImponible del impuesto igual a precioTotalSinImpuesto', () => {
    expect(generarXMLFactura(FACTURA)).toContain('<baseImponible>21.00</baseImponible>');
  });
});
