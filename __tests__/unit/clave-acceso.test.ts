import { describe, it, expect } from 'vitest';
import { modulo11, generarClaveAcceso } from '@/lib/sri/clave-acceso';

describe('modulo11', () => {
  it('retorna 0 cuando el resultado sería 11', () => {
    // "0" → suma = 0*2 = 0, residuo = 0, resultado = 11 → retorna 0
    expect(modulo11('0')).toBe(0);
  });

  it('retorna 1 cuando el resultado sería 10', () => {
    // "5" → suma = 5*2 = 10, residuo = 10, resultado = 11-10 = 1
    expect(modulo11('5')).toBe(1);
  });

  it('usa pesos cíclicos 2-7 correctamente con 12 dígitos', () => {
    // "111111111111" → suma = 1*(7+6+5+4+3+2+7+6+5+4+3+2) = 54
    // 54 % 11 = 10, resultado = 11-10 = 1
    expect(modulo11('111111111111')).toBe(1);
  });

  it('retorna un valor entre 0 y 9', () => {
    const resultado = modulo11('01102024011234567890001000000001234567890123456');
    expect(resultado).toBeGreaterThanOrEqual(0);
    expect(resultado).toBeLessThanOrEqual(9);
  });
});

describe('generarClaveAcceso', () => {
  const params = {
    fecha: new Date(2024, 0, 15), // 15 enero 2024
    tipoComprobante: '01',
    ruc: '1234567890001',
    ambiente: '2' as const,
    establecimiento: '001',
    puntoEmision: '001',
    secuencial: 1,
    codigoNumerico: '12345678',
  };

  it('retorna exactamente 49 caracteres', () => {
    expect(generarClaveAcceso(params)).toHaveLength(49);
  });

  it('empieza con la fecha en formato ddMMaaaa', () => {
    const clave = generarClaveAcceso({ ...params, fecha: new Date(2024, 2, 5) });
    expect(clave.startsWith('05032024')).toBe(true);
  });

  it('incluye el RUC en la posición correcta (chars 10–22)', () => {
    // base = 8(fecha) + 2(tipo) + 13(ruc) + ...
    const clave = generarClaveAcceso(params);
    expect(clave.substring(10, 23)).toBe('1234567890001');
  });

  it('secuencial se rellena con ceros a 9 dígitos (chars 30–38)', () => {
    const clave = generarClaveAcceso({ ...params, secuencial: 42 });
    // serie (6 chars) empieza en pos 8+2+13+1 = 24, sec empieza en pos 30
    expect(clave.substring(30, 39)).toBe('000000042');
  });

  it('el último carácter es el dígito verificador mod11', () => {
    const clave = generarClaveAcceso(params);
    const base = clave.slice(0, 48);
    const dv   = Number(clave.slice(48));
    expect(dv).toBe(modulo11(base));
  });

  it('solo contiene dígitos', () => {
    const clave = generarClaveAcceso(params);
    expect(clave).toMatch(/^\d{49}$/);
  });
});
