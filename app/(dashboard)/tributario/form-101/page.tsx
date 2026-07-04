'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, startOfYear, endOfYear } from 'date-fns';
import { Download, Calculator } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Venta, FacturaProveedor, AsientoContable } from '@/types';
import { subscribeToVentas }           from '@/lib/firebase/ventas';
import { subscribeToFacturasProveedor }from '@/lib/firebase/facturas-proveedor';
import { subscribeToAsientos }         from '@/lib/firebase/asientos';

const currency = (v: number) => `$${v.toFixed(2)}`;

// Tarifas IR Ecuador 2024 (personas naturales)
const TABLA_IR = [
  { desde: 0,       hasta: 11902,  base: 0,    fraccion: 0    },
  { desde: 11902,   hasta: 15159,  base: 0,    fraccion: 5    },
  { desde: 15159,   hasta: 19682,  base: 163,  fraccion: 10   },
  { desde: 19682,   hasta: 26031,  base: 615,  fraccion: 12   },
  { desde: 26031,   hasta: 34255,  base: 1377, fraccion: 15   },
  { desde: 34255,   hasta: 45407,  base: 2611, fraccion: 20   },
  { desde: 45407,   hasta: 60450,  base: 4841, fraccion: 25   },
  { desde: 60450,   hasta: 80605,  base: 8602, fraccion: 30   },
  { desde: 80605,   hasta: Infinity,base:14648,fraccion: 35   },
];

function calcularIR(baseImponible: number): number {
  if (baseImponible <= 0) return 0;
  const tramo = TABLA_IR.find(t => baseImponible >= t.desde && baseImponible < t.hasta)
    ?? TABLA_IR[TABLA_IR.length - 1];
  return tramo.base + ((baseImponible - tramo.desde) * tramo.fraccion / 100);
}

export default function Form101Page() {
  const [ventas,    setVentas]    = useState<Venta[]>([]);
  const [facturas,  setFacturas]  = useState<FacturaProveedor[]>([]);
  const [asientos,  setAsientos]  = useState<AsientoContable[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [anio,      setAnio]      = useState(new Date().getFullYear().toString());

  useEffect(() => {
    const u1 = subscribeToVentas(d => { setVentas(d); setLoading(false); });
    const u2 = subscribeToFacturasProveedor(setFacturas);
    const u3 = subscribeToAsientos(setAsientos, 100000);
    return () => { u1(); u2(); u3(); };
  }, []);

  const anioNum = parseInt(anio) || new Date().getFullYear();
  const desde   = new Date(anioNum, 0, 1);
  const hasta   = new Date(anioNum, 11, 31, 23, 59, 59);

  const flt = (d: any) => {
    const date = d?.toDate?.() ?? new Date(d);
    return date >= desde && date <= hasta;
  };

  // ── Cálculos IR 101 ─────────────────────────────────────────────────────
  const datos = useMemo(() => {
    // Ingresos
    const ventasFiltradas = ventas.filter(v => v.estado !== 'anulada' && flt(v.fecha));
    const totalIngresos   = ventasFiltradas.reduce((s, v) => s + v.total, 0);

    // Gastos (facturas de proveedores en el año)
    const facturasFiltradas = facturas.filter(f => flt(f.createdAt));
    const totalGastos     = facturasFiltradas.reduce((s, f) => s + f.subtotal12 + f.subtotal0, 0);
    const totalIVACompras = facturasFiltradas.reduce((s, f) => s + f.iva, 0);

    // Gastos de asientos manuales de tipo gastos
    const gastosAsientos = asientos
      .filter(a => flt(a.fecha))
      .flatMap(a => a.lineas)
      .filter(l => l.cuentaCodigo?.startsWith('5.'))
      .reduce((s, l) => s + l.debe, 0);

    const utilidadBruta    = totalIngresos - totalGastos - gastosAsientos;
    const participacion15  = Math.max(0, utilidadBruta * 0.15);
    const baseImponible    = Math.max(0, utilidadBruta - participacion15);
    const impuestoRenta    = calcularIR(baseImponible);

    // Retenciones recibidas (estimado)
    const antRetenciones  = 0; // Se configuraría con retenciones del período

    const irACausar = Math.max(0, impuestoRenta - antRetenciones);

    return {
      totalIngresos, totalGastos, totalIVACompras,
      gastosAsientos, utilidadBruta, participacion15,
      baseImponible, impuestoRenta, irACausar,
      numVentas: ventasFiltradas.length,
      numFacturas: facturasFiltradas.length,
    };
  }, [ventas, facturas, asientos, anioNum]);

  const exportarForm101 = () => {
    const rows = [
      ['FORMULARIO 101 — IMPUESTO A LA RENTA', `Ejercicio fiscal ${anio}`],
      [],
      ['INGRESOS'],
      ['Total ingresos por ventas', datos.totalIngresos],
      ['N° facturas de venta', datos.numVentas],
      [],
      ['COSTOS Y GASTOS'],
      ['Total compras a proveedores', datos.totalGastos],
      ['Gastos contabilizados', datos.gastosAsientos],
      ['Total costos y gastos', datos.totalGastos + datos.gastosAsientos],
      [],
      ['CÁLCULO IR'],
      ['Utilidad del ejercicio', datos.utilidadBruta],
      ['(-) 15% participación trabajadores', datos.participacion15],
      ['Base imponible', datos.baseImponible],
      ['Impuesto a la renta causado', datos.impuestoRenta],
      ['IR a pagar (sin anticipos/retenciones)', datos.irACausar],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Form101');
    XLSX.writeFile(wb, `formulario_101_${anio}.xlsx`);
  };

  const CAMPOS = [
    // [código, descripción, valor]
    ['601',  'VENTAS NETAS LOCALES GRAVADAS CON TARIFA 15%',  datos.totalIngresos, 'ingreso'],
    ['699',  'TOTAL INGRESOS',                                 datos.totalIngresos, 'subtotal'],
    ['710',  'COMPRAS NETAS LOCALES DE BIENES',                datos.totalGastos,   'gasto'],
    ['797',  'TOTAL COSTOS Y GASTOS',                          datos.totalGastos + datos.gastosAsientos, 'subtotal'],
    ['801',  'UTILIDAD DEL EJERCICIO',                         Math.max(0, datos.utilidadBruta), 'resultado'],
    ['803',  '(-) 15% PARTICIPACIÓN TRABAJADORES',             datos.participacion15, 'deduccion'],
    ['841',  'BASE IMPONIBLE',                                 datos.baseImponible, 'subtotal'],
    ['849',  'IMPUESTO A LA RENTA CAUSADO',                    datos.impuestoRenta, 'resultado'],
    ['869',  'IR A PAGAR (neto estimado)',                     datos.irACausar, 'final'],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Formulario 101 — Impuesto a la Renta"
        description="Resumen anual para declaración de IR (orientativo — verifique con su contador)"
        action={
          <Button variant="outline" size="sm" onClick={exportarForm101}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      {/* Selector de año */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label>Ejercicio fiscal</Label>
          <Input type="number" value={anio} onChange={e => setAnio(e.target.value)}
            min="2020" max="2030" className="mt-1 w-32" />
        </div>
        <Badge variant="outline" className="mb-0.5 text-xs">
          Datos calculados automáticamente de Firestore
        </Badge>
      </div>

      {/* Aviso */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
        <strong>Aviso:</strong> Este formulario es orientativo. Los valores mostrados provienen
        de los datos registrados en el sistema. Para la declaración oficial use el sistema DIMM
        del SRI o consulte a su contador.
      </div>

      {/* Campos Form 101 */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-left px-4 py-3 w-20">Campo</th>
                <th className="text-left px-4 py-3">Descripción</th>
                <th className="text-right px-4 py-3 w-40">Valor ($)</th>
              </tr>
            </thead>
            <tbody>
              {CAMPOS.map(([codigo, desc, valor, tipo], i) => (
                <tr key={codigo as string}
                  className={
                    tipo === 'subtotal' ? 'bg-slate-50 font-semibold' :
                    tipo === 'resultado'? 'bg-blue-50 font-bold' :
                    tipo === 'final'    ? 'bg-green-50 font-bold text-green-800' :
                    tipo === 'deduccion'? 'bg-red-50/50' :
                    i % 2 === 0        ? 'bg-white' : 'bg-slate-50/30'
                  }>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{codigo}</td>
                  <td className="px-4 py-3">{desc as string}</td>
                  <td className="text-right px-4 py-3 font-mono">
                    {currency(valor as number)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Tabla IR */}
      <div className="bg-white rounded-xl border p-5">
        <p className="font-semibold text-slate-700 mb-3">
          Tabla progresiva IR 2024 — Base imponible: {currency(datos.baseImponible)}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="text-right px-3 py-2">Desde ($)</th>
                <th className="text-right px-3 py-2">Hasta ($)</th>
                <th className="text-right px-3 py-2">Impuesto base ($)</th>
                <th className="text-right px-3 py-2">% fracción excedente</th>
              </tr>
            </thead>
            <tbody>
              {TABLA_IR.map((t, i) => {
                const activo = datos.baseImponible >= t.desde && datos.baseImponible < t.hasta;
                return (
                  <tr key={i} className={activo ? 'bg-blue-50 font-semibold' : ''}>
                    <td className="text-right px-3 py-1.5">{currency(t.desde)}</td>
                    <td className="text-right px-3 py-1.5">
                      {t.hasta === Infinity ? 'En adelante' : currency(t.hasta)}
                    </td>
                    <td className="text-right px-3 py-1.5">{currency(t.base)}</td>
                    <td className="text-right px-3 py-1.5">{t.fraccion}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
