'use client';

import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Separator }from '@/components/ui/separator';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { Venta, FacturaProveedor } from '@/types';
import { subscribeToVentas }            from '@/lib/firebase/ventas';
import { subscribeToFacturasProveedor } from '@/lib/firebase/facturas-proveedor';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function currency(v: number) { return `$${Math.abs(v).toFixed(2)}`; }

interface CampoFormulario {
  campo: string;
  descripcion: string;
  valor: number;
  tipo?: 'normal' | 'subtotal' | 'total' | 'resultado';
}

export default function Form104Page() {
  const [ventas,  setVentas]  = useState<Venta[]>([]);
  const [compras, setCompras] = useState<FacturaProveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [anio,    setAnio]    = useState(String(new Date().getFullYear()));
  const [mes,     setMes]     = useState(String(new Date().getMonth() + 1));

  useEffect(() => {
    const u1 = subscribeToVentas(d => { setVentas(d); setLoading(false); });
    const u2 = subscribeToFacturasProveedor(setCompras);
    return () => { u1(); u2(); };
  }, []);

  const filtrar = (items: any[], campoFecha: string) => {
    return items.filter(item => {
      const f = item[campoFecha]?.toDate?.() ?? new Date(item[campoFecha]);
      return f.getFullYear() === Number(anio) && f.getMonth() + 1 === Number(mes);
    });
  };

  const ventasMes  = useMemo(() => filtrar(ventas.filter(v => v.estado !== 'anulada'), 'fecha'), [ventas, anio, mes]);
  const comprasMes = useMemo(() => filtrar(compras, 'fechaEmision'), [compras, anio, mes]);

  const calculo = useMemo(() => {
    const ventas15  = ventasMes.reduce((s, v) => s + v.subtotal, 0);
    const ventas0   = 0; // por implementar si hay productos exentos
    const ivaVentas = ventasMes.reduce((s, v) => s + Math.max(0, v.total - v.subtotal), 0);

    const compras15  = comprasMes.reduce((s, f) => s + f.subtotal12, 0);
    const ivaCompras = comprasMes.reduce((s, f) => s + f.iva, 0);

    const ivaNeto = ivaVentas - ivaCompras;

    return {
      // Ventas
      v401_ventas15:    ventas15,
      v411_ventas0:     ventas0,
      v415_totalVentas: ventas15 + ventas0,
      v500_ivaVentas:   ivaVentas,
      // Compras
      v510_ivaCompras:  ivaCompras,
      v520_basesCompras:compras15,
      // Liquidación
      v601_ivaPagar:    Math.max(0, ivaNeto),
      v605_ivaFavor:    Math.max(0, -ivaNeto),
    };
  }, [ventasMes, comprasMes]);

  const campos: CampoFormulario[] = [
    { campo:'', descripcion:'VENTAS', valor:0, tipo:'subtotal' },
    { campo:'401', descripcion:'Ventas netas gravadas tarifa diferente 0% (sin IVA)', valor:calculo.v401_ventas15 },
    { campo:'411', descripcion:'Ventas tarifa 0%', valor:calculo.v411_ventas0 },
    { campo:'415', descripcion:'TOTAL VENTAS Y OTRAS OPERACIONES', valor:calculo.v415_totalVentas, tipo:'subtotal' },
    { campo:'', descripcion:'IVA GENERADO', valor:0, tipo:'subtotal' },
    { campo:'500', descripcion:'IVA generado por ventas', valor:calculo.v500_ivaVentas },
    { campo:'', descripcion:'CRÉDITO TRIBUTARIO', valor:0, tipo:'subtotal' },
    { campo:'510', descripcion:'IVA en compras que da crédito tributario', valor:calculo.v510_ivaCompras },
    { campo:'520', descripcion:'Base imponible de compras tarifa 15%', valor:calculo.v520_basesCompras },
    { campo:'', descripcion:'LIQUIDACIÓN DEL IMPUESTO', valor:0, tipo:'subtotal' },
    { campo:'601', descripcion:'IVA a pagar (500 - 510)', valor:calculo.v601_ivaPagar, tipo:'total' },
    { campo:'605', descripcion:'Crédito tributario a favor (510 > 500)', valor:calculo.v605_ivaFavor, tipo:'resultado' },
  ];

  const exportar = () => {
    const rows = campos.filter(c => c.campo).map(c => ({
      Campo: c.campo, Descripción: c.descripcion, Valor: c.valor,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Formulario 104');
    XLSX.writeFile(wb, `Form104_IVA_${anio}_${mes.padStart(2,'0')}.xlsx`);
  };

  const anios = Array.from({length:4}, (_,i) => String(new Date().getFullYear() - 1 + i));

  return (
    <div>
      <PageHeader
        title="Formulario 104 — Declaración IVA"
        description="Resumen mensual para completar el Formulario 104 del SRI"
        action={
          <Button variant="outline" onClick={exportar} disabled={loading}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">
        ℹ️ Este es un <strong>resumen de apoyo</strong>. Debes ingresar los valores al SRI en línea o en el DIMM.
        Verifica siempre los datos antes de declarar.
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center mb-5">
        <Select onValueChange={setAnio} defaultValue={anio}>
          <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anios.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={setMes} defaultValue={mes}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? <Skeleton className="h-96 w-full" /> : (
        <div className="max-w-2xl bg-white rounded-xl border overflow-hidden">
          <div className="bg-slate-900 text-white px-6 py-4">
            <p className="font-bold text-lg">FORMULARIO 104 — IVA MENSUAL</p>
            <p className="text-slate-300 text-sm">{MESES[Number(mes)-1]} {anio}</p>
          </div>

          <div className="p-5 space-y-1">
            {campos.map((c, i) => {
              if (c.tipo === 'subtotal') return (
                <div key={i} className="pt-4 pb-1">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{c.descripcion}</p>
                  <Separator className="mt-1" />
                </div>
              );

              return (
                <div key={i} className={`flex justify-between items-center py-2 px-3 rounded-lg ${
                  c.tipo === 'total' ? 'bg-red-50 font-bold' :
                  c.tipo === 'resultado' ? 'bg-green-50 font-bold' : 'hover:bg-slate-50'
                }`}>
                  <div className="flex items-center gap-3">
                    {c.campo && (
                      <span className="text-xs font-mono font-bold text-slate-400 w-10">{c.campo}</span>
                    )}
                    <span className={`text-sm ${c.tipo === 'total' || c.tipo === 'resultado' ? 'font-bold' : ''}`}>
                      {c.descripcion}
                    </span>
                  </div>
                  <span className={`font-bold text-sm ${
                    c.tipo === 'total' && c.valor > 0 ? 'text-red-600' :
                    c.tipo === 'resultado' && c.valor > 0 ? 'text-green-600' :
                    'text-slate-700'
                  }`}>
                    {currency(c.valor)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className={`mx-5 mb-5 rounded-xl p-4 text-center ${
            calculo.v601_ivaPagar > 0 ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}>
            <p className="text-sm font-medium opacity-80">
              {calculo.v601_ivaPagar > 0 ? 'IVA A PAGAR AL SRI' : 'CRÉDITO TRIBUTARIO A FAVOR'}
            </p>
            <p className="text-3xl font-bold mt-1">
              {currency(calculo.v601_ivaPagar > 0 ? calculo.v601_ivaPagar : calculo.v605_ivaFavor)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}