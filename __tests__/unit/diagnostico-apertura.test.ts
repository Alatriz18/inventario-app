import { describe, it, expect } from 'vitest';
import { diagnosticarApertura } from '@/lib/bancos/diagnostico-apertura';

describe('diagnosticarApertura (caso de la captura de febrero: $10 por explicar)', () => {
  it('apertura duplicada y con monto distinto al del banco: lo explica todo', () => {
    const avisos = diagnosticarApertura({
      aperturaBanco: 4369.82,
      registrado: 4359.82,
      asientosApertura: [{ numero: 'AJ-2026-000374', montoBanco: 10000, visto: false }],
    });
    const textos = avisos.map(a => a.texto).join('\n');
    expect(avisos.every(a => a.nivel === 'error')).toBe(true);
    expect(textos).toContain('dos veces');
    expect(textos).toContain('AJ-2026-000374');
    expect(textos).toContain('$10,000.00');
    expect(textos).toContain('$5,630.18'); // 10 000 − 4 369.82
  });

  it('un solo saldo inicial registrado con $10 de error se señala con su diferencia', () => {
    const avisos = diagnosticarApertura({ aperturaBanco: 4369.82, registrado: 4359.82, asientosApertura: [] });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toContain('$10.00');
  });

  it('un asiento de apertura correcto solo pide el visto; con el visto no avisa nada', () => {
    const correcto = { numero: 'AJ-1', montoBanco: 4369.82 };
    expect(diagnosticarApertura({ aperturaBanco: 4369.82, asientosApertura: [{ ...correcto, visto: false }] })[0].nivel).toBe('info');
    expect(diagnosticarApertura({ aperturaBanco: 4369.82, asientosApertura: [{ ...correcto, visto: true }] })).toEqual([]);
  });

  it('sin estado de cuenta no se compara el monto, pero sí se detecta la duplicación', () => {
    const avisos = diagnosticarApertura({ aperturaBanco: null, registrado: 100, asientosApertura: [{ numero: 'AJ-1', montoBanco: 500, visto: true }] });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toContain('dos veces');
  });
});
