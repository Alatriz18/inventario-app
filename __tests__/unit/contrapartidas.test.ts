import { describe, it, expect } from 'vitest';
import { resumirContrapartidas } from '@/lib/bancos/contrapartidas';

describe('resumirContrapartidas', () => {
  it('acepta una sola cuenta por el monto completo', () => {
    const r = resumirContrapartidas(100, [{ codigo: '1010101', monto: '100' }]);
    expect(r.ok).toBe(true);
    expect(r.lineas).toEqual([{ codigo: '1010101', monto: 100 }]);
  });

  it('acepta repartir entre varias cuentas (comisión + IVA)', () => {
    const r = resumirContrapartidas(0.41, [
      { codigo: '520302', monto: '0.36' }, { codigo: '101050101', monto: '0.05' },
    ]);
    expect(r.ok).toBe(true);
    expect(r.suma).toBe(0.41);
  });

  it('avisa lo que falta o sobra', () => {
    expect(resumirContrapartidas(10, [{ codigo: 'A', monto: '4' }]).error).toBe('Falta repartir $6.00');
    expect(resumirContrapartidas(10, [{ codigo: 'A', monto: '12' }]).error).toBe('Sobran $2.00');
  });

  it('exige cuenta en cada línea con monto y un monto positivo', () => {
    expect(resumirContrapartidas(10, [{ codigo: '', monto: '10' }]).ok).toBe(false);
    expect(resumirContrapartidas(10, [{ codigo: 'A', monto: '0' }]).ok).toBe(false);
    expect(resumirContrapartidas(0, [{ codigo: 'A', monto: '0' }]).error).toBe('Ingresa el monto del movimiento');
    expect(resumirContrapartidas(10, []).error).toBe('Elige al menos una cuenta contable');
  });

  it('tolera los decimales de punto flotante', () => {
    const r = resumirContrapartidas(0.3, [{ codigo: 'A', monto: '0.1' }, { codigo: 'B', monto: '0.2' }]);
    expect(r.ok).toBe(true);
  });
});
