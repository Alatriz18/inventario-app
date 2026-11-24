'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useModoMantenimiento } from '@/hooks/useModoMantenimiento';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Building2, Receipt, Ban, ArrowRightLeft, FileText } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaBancaria, MovimientoBancario, CuentaContable, LoteReclasificacion, ItemLoteReclasificacion, ExtractoBancario } from '@/types';
import {
  subscribeToCuentasBancarias, createCuentaBancaria,
  subscribeToMovimientosBancarios, subscribeToMovimientosBancariosDeCuentas, importarMovimientosBancarios,
  subscribeToMovimientosRango, getMovimientosRango,
  registrarMovimientoBancario, anularMovimientoBancario, conciliarMovimiento,
  marcarMovimientoReclasificado, restaurarMovimiento,
} from '@/lib/firebase/cuentas-bancarias';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';
import { reclasificarCuentaEnAsiento, reclasificarCuentaEnAsientoSiEsUnica, getAsientos } from '@/lib/firebase/asientos';
import { getOrCreateConfigContable } from '@/lib/firebase/config-contable';
import {
  crearLoteReclasificacion, subscribeToLotesReclasificacion, marcarLoteRevertido,
} from '@/lib/firebase/reclasificaciones';
import {
  crearAsientoMovimientoBancario, crearAsientoReversion, crearAsientoReclasificacionCaja,
} from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';
import ContracuentasEditor from '@/components/shared/ContracuentasEditor';
import CuentaCombobox from '@/components/shared/CuentaCombobox';
import { useOpcionesCuentasMovimiento } from '@/hooks/useOpcionesCuentasMovimiento';
import {
  resumirContrapartidas, TIPOS_MOVIMIENTO_BANCO, type LineaContra, type TipoMovimientoBanco,
} from '@/lib/bancos/contrapartidas';
import {
  claveDescripcion, sugerirContrapartida, CUENTAS_SUGERIDAS, periodoDe, inicioDePeriodo, finDePeriodo, aFecha,
} from '@/lib/bancos/conciliacion';
import { asegurarCuenta } from '@/lib/contabilidad/reclasificar-compras';
import { planificarImportacion } from '@/lib/bancos/importacion';
import { guardarExtractos, subscribeToExtractos } from '@/lib/firebase/extractos-bancarios';
import { extraerTextoPDF } from '@/lib/bancos/leer-pdf';
import { interpretarEstadoCuentaPichincha, type ResultadoEstadoCuenta } from '@/lib/bancos/estado-cuenta-pichincha';

const currency = (v: number) => `$${v.toFixed(2)}`;
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const nombreMesES = (p: string) => { const [y, m] = p.split('-').map(Number); return `${MESES_ES[m - 1]} de ${y}`; };

const ESTADO_LABEL: Record<string, string> = {
  no_conciliado: 'Pendiente', conciliado: 'Conciliado', ignorado: 'Ignorado', anulado: 'Anulado',
};
const ESTADO_COLOR: Record<string, string> = {
  no_conciliado: 'bg-amber-100 text-amber-700', conciliado: 'bg-green-100 text-green-700',
  ignorado: 'bg-slate-100 text-slate-500', anulado: 'bg-red-100 text-red-500',
};

export default function MovimientosBancariosPage() {
  const router = useRouter();
  const mantenimiento = useModoMantenimiento();
  const { user } = useAuth();
  const [cuentas,   setCuentas]   = useState<CuentaBancaria[]>([]);
  // 'todas' = ver movimientos de todas las cuentas juntos (vista por defecto,
  // no obliga a elegir una cuenta primero para poder ver algo).
  const [cuentaSel, setCuentaSel] = useState<string>('todas');
  const [movs,      setMovs]      = useState<MovimientoBancario[]>([]);
  /** Mes que se está viendo ('yyyy-MM'): solo se leen de la base los movimientos de ese mes. */
  const [mes,       setMes]       = useState(() => periodoDe(new Date()));
  const [extractos, setExtractos] = useState<ExtractoBancario[]>([]);
  /** Movimientos ya registrados en las fechas del PDF que se va a importar (para no duplicar). */
  const [existentesPdf, setExistentesPdf] = useState<MovimientoBancario[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const [planCuentas, setPlanCuentas] = useState<CuentaContable[]>([]);

  // Dialog nueva cuenta
  const [dlgCuenta,  setDlgCuenta]  = useState(false);
  const [formCuenta, setFormCuenta] = useState({
    banco: '', tipoCuenta: 'corriente' as 'corriente' | 'ahorros',
    numeroCuenta: '', titular: '', saldoInicial: '', moneda: 'USD',
    cuentaContableCodigo: '',
  });

  // Importar movimientos CSV
  const fileRef  = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Importar el estado de cuenta en PDF del banco (se revisa antes de guardar)
  const pdfRef = useRef<HTMLInputElement>(null);
  const [leyendoPdf,    setLeyendoPdf]    = useState(false);
  const [dlgPdf,        setDlgPdf]        = useState(false);
  const [pdfRes,        setPdfRes]        = useState<ResultadoEstadoCuenta | null>(null);
  const [importandoPdf, setImportandoPdf] = useState(false);
  const [progresoPdf,   setProgresoPdf]   = useState({ hechos: 0, total: 0 });
  /** Contracuenta elegida por tipo de movimiento: clave `${tipo}|${descripción normalizada}` → código ('' = pendiente) */
  const [contrasPdf,    setContrasPdf]    = useState<Record<string, string>>({});

  // Dialog registrar movimiento bancario directo (comisión, cargo, interés…)
  const [dlgMov, setDlgMov] = useState(false);
  const [savingMov, setSavingMov] = useState(false);
  const formMovInicial = () => ({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    tipoMov: 'nota_debito' as TipoMovimientoBanco,
    concepto: '', monto: '', referencia: '', beneficiario: '',
  });
  const [formMov, setFormMov] = useState(formMovInicial);
  // Contracuentas del movimiento manual (una o varias; cualquier cuenta, incluida Caja)
  const [contrasMov, setContrasMov] = useState<LineaContra[]>([{ codigo: '', monto: '' }]);
  const opcionesCuentas = useOpcionesCuentasMovimiento();

  // Dialog reclasificar saldo completo de la cuenta a Caja General
  const [dlgReclasificar, setDlgReclasificar] = useState(false);
  const [savingReclasificar, setSavingReclasificar] = useState(false);

  // Dialog mover TODOS los movimientos (y sus asientos) de la cuenta a Caja General
  const [dlgMoverTodo, setDlgMoverTodo] = useState(false);
  const [moviendoTodo, setMoviendoTodo] = useState(false);
  const [progresoMoverTodo, setProgresoMoverTodo] = useState(0);

  // Lotes de reclasificación (para poder deshacer "Mover TODO el historial a Caja")
  const [lotes, setLotes] = useState<LoteReclasificacion[]>([]);
  const [revirtiendoLoteId, setRevirtiendoLoteId] = useState<string | null>(null);

  // Dialog recuperar movimientos bancarios faltantes (asientos que sí tocan un
  // banco pero nunca generaron su registro en esta pantalla — típicamente por
  // errores de permisos ya corregidos)
  const [dlgRecuperar, setDlgRecuperar] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [progresoRecuperar, setProgresoRecuperar] = useState(0);
  const [resumenRecuperar, setResumenRecuperar] = useState<{ candidatos: number } | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  useEffect(() => {
    const u1 = subscribeToCuentasBancarias(setCuentas);
    const u2 = subscribeToCuentas(setPlanCuentas);
    return () => { u1(); u2(); };
  }, []);

  // Si el negocio tiene una sola cuenta bancaria, se elige sola (una vez) para que se vean
  // de inmediato los botones de importar
  const autoElegida = useRef(false);
  useEffect(() => {
    if (autoElegida.current) return;
    const activas = cuentas.filter(c => c.activa);
    if (activas.length === 1) { autoElegida.current = true; setCuentaSel(activas[0].id); }
  }, [cuentas]);

  // Para no gastar lecturas de la base, se carga solo el mes que se está viendo. El modo mantenimiento
  // (herramientas que necesitan todo el historial) sí lee todo.
  const cargaCompleta = mantenimiento;
  useEffect(() => {
    if (!cuentaSel) return;
    if (cuentaSel === 'todas' && cuentas.length === 0) return; // esperar a que carguen las cuentas
    setLoading(true);
    const onErr = () => {
      toast.error('No se pudieron cargar los movimientos');
      setLoading(false);
    };
    if (cargaCompleta) {
      return cuentaSel === 'todas'
        ? subscribeToMovimientosBancariosDeCuentas(
            cuentas.filter(c => c.activa).map(c => c.id),
            d => { setMovs(d); setLoading(false); }, onErr
          )
        : subscribeToMovimientosBancarios(cuentaSel, d => { setMovs(d); setLoading(false); }, onErr);
    }
    const ids = new Set(cuentaSel === 'todas' ? cuentas.filter(c => c.activa).map(c => c.id) : [cuentaSel]);
    return subscribeToMovimientosRango(
      inicioDePeriodo(mes), finDePeriodo(mes),
      d => { setMovs(d.filter(m => ids.has(m.cuentaBancariaId))); setLoading(false); }, onErr
    );
  }, [cuentaSel, cuentas, cargaCompleta, mes]);

  // Saldos que declara el banco al cierre de cada mes (colección pequeña: un registro por mes)
  useEffect(() => {
    if (!cuentaSel || cuentaSel === 'todas') { setExtractos([]); return; }
    return subscribeToExtractos(cuentaSel, setExtractos, () => {});
  }, [cuentaSel]);

  useEffect(() => {
    if (!cuentaSel || cuentaSel === 'todas') { setLotes([]); return; }
    return subscribeToLotesReclasificacion(cuentaSel, setLotes);
  }, [cuentaSel]);

  const cuentaSelObj = useMemo(
    () => cuentaSel === 'todas' ? null : cuentas.find(c => c.id === cuentaSel) ?? null,
    [cuentas, cuentaSel]
  );
  const cuentaPorId = useMemo(() => new Map(cuentas.map(c => [c.id, c])), [cuentas]);

  const movsFiltrados = useMemo(() => {
    if (filtroEstado === 'todos') return movs;
    return movs.filter(m => m.estado === filtroEstado);
  }, [movs, filtroEstado]);

  // Meses para elegir: los últimos 24 y los que tienen estado de cuenta guardado
  const opcionesMes = useMemo(() => {
    const s = new Set<string>([mes]);
    const hoy = new Date();
    for (let i = 0; i < 24; i++) s.add(periodoDe(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)));
    extractos.forEach(e => s.add(e.periodo));
    return [...s].sort().reverse();
  }, [mes, extractos]);
  const extractoMes = useMemo(() => extractos.find(e => e.periodo === mes), [extractos, mes]);
  const totalesMes = useMemo(() => {
    const validos = movs.filter(m => m.estado !== 'anulado' && m.estado !== 'ignorado');
    return {
      creditos: validos.filter(m => m.tipo === 'credito').reduce((s, m) => s + m.monto, 0),
      debitos:  validos.filter(m => m.tipo === 'debito').reduce((s, m) => s + m.monto, 0),
    };
  }, [movs]);

  const saldoCalculado = useMemo(() => {
    if (!cuentaSelObj) return 0;
    return movs.filter(m => m.estado !== 'ignorado' && m.estado !== 'anulado').reduce((s, m) => {
      return m.tipo === 'credito' ? s + m.monto : s - m.monto;
    }, cuentaSelObj.saldoInicial);
  }, [movs, cuentaSelObj]);

  // Movimientos de esta cuenta que todavía cuentan para su saldo/conciliación
  // (candidatos a moverse a Caja General)
  const movsParaMover = useMemo(
    () => movs.filter(m => m.estado !== 'anulado' && m.estado !== 'ignorado'),
    [movs]
  );

  // Movimientos del PDF separados en nuevos y ya registrados (misma fecha, documento, tipo y monto)
  const pdfPlan = useMemo(() => {
    if (!pdfRes) return null;
    return planificarImportacion({ movimientosPdf: pdfRes.movimientos, existentes: existentesPdf, cuentaBancariaId: cuentaSel });
  }, [pdfRes, existentesPdf, cuentaSel]);

  // Tipos de movimiento del PDF (comisión, IVA, depósito, transferencia…) para elegir su contracuenta de una vez
  const gruposPdf = useMemo(() => {
    if (!pdfPlan) return [];
    const m = new Map<string, { key: string; clave: string; tipo: 'credito' | 'debito'; n: number; total: number }>();
    for (const mv of pdfPlan.nuevos) {
      const clave = claveDescripcion(mv.descripcion);
      const key = `${mv.tipo}|${clave}`;
      const g = m.get(key) ?? { key, clave, tipo: mv.tipo, n: 0, total: 0 };
      g.n++; g.total = Math.round((g.total + mv.monto) * 100) / 100;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [pdfPlan]);

  // Al leer un PDF nuevo se proponen las contracuentas obvias (comisión, IVA, intereses, retención, depósitos → Caja)
  useEffect(() => {
    if (!pdfRes) { setContrasPdf({}); return; }
    const inicial: Record<string, string> = {};
    for (const p of pdfRes.movimientos) {
      const tipo = p.debito > 0 ? 'debito' : 'credito';
      const clave = claveDescripcion(p.descripcion);
      const sug = sugerirContrapartida(clave, tipo, CUENTAS_SUGERIDAS);
      if (sug) inicial[`${tipo}|${clave}`] = sug.codigo;
    }
    setContrasPdf(inicial);
  }, [pdfRes]);

  // Crear cuenta bancaria
  const handleCrearCuenta = async () => {
    if (!formCuenta.banco || !formCuenta.numeroCuenta) {
      toast.error('Banco y número de cuenta son requeridos');
      return;
    }
    try {
      const ctaContable = planCuentas.find(c => c.codigo === formCuenta.cuentaContableCodigo);
      await createCuentaBancaria({
        banco:        formCuenta.banco,
        tipoCuenta:   formCuenta.tipoCuenta,
        numeroCuenta: formCuenta.numeroCuenta,
        titular:      formCuenta.titular,
        moneda:       formCuenta.moneda,
        saldoInicial: parseFloat(formCuenta.saldoInicial) || 0,
        cuentaContableCodigo: ctaContable?.codigo,
        cuentaContableNombre: ctaContable?.nombre,
        activa: true,
      });
      toast.success('Cuenta bancaria creada');
      setDlgCuenta(false);
      setFormCuenta({ banco: '', tipoCuenta: 'corriente', numeroCuenta: '', titular: '', saldoInicial: '', moneda: 'USD', cuentaContableCodigo: '' });
    } catch (e: any) {
      toast.error(e.message ?? 'Error al crear cuenta');
    }
  };

  // Importar CSV del banco
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cuentaSel) return;
    setImporting(true);
    try {
      const text  = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      // Formato esperado: fecha,descripcion,tipo,monto,saldo,referencia
      // tipo: credito o debito — referencia (n° de comprobante/documento) es opcional
      const nuevosMovs: Omit<MovimientoBancario, 'id' | 'createdAt'>[] = [];
      for (const line of lines.slice(1)) { // skip header
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols.length < 4) continue;
        const [fechaStr, descripcion, tipo, montoStr, saldoStr, referenciaStr] = cols;
        const partes = fechaStr.split('/');
        const fecha  = partes.length === 3
          ? new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]))
          : new Date(fechaStr);
        if (isNaN(fecha.getTime())) continue;
        nuevosMovs.push({
          cuentaBancariaId: cuentaSel,
          fecha,
          descripcion,
          tipo:  (tipo.toLowerCase().includes('cred') ? 'credito' : 'debito') as 'credito' | 'debito',
          monto: Math.abs(parseFloat(montoStr) || 0),
          ...(saldoStr ? { saldo: parseFloat(saldoStr) } : {}),
          ...(referenciaStr ? { referencia: referenciaStr } : {}),
          estado:'no_conciliado',
        });
      }
      if (nuevosMovs.length === 0) {
        toast.error('No se encontraron movimientos válidos en el archivo');
        return;
      }
      await importarMovimientosBancarios(nuevosMovs);
      toast.success(`${nuevosMovs.length} movimientos importados — ve a Conciliación Bancaria para cuadrarlos con la contabilidad`);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al importar CSV');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Leer el PDF del estado de cuenta y mostrar la revisión
  const handleLeerPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cuentaSel || cuentaSel === 'todas') return;
    setLeyendoPdf(true);
    try {
      const items = await extraerTextoPDF(await file.arrayBuffer());
      const res = interpretarEstadoCuentaPichincha(items);
      if (res.movimientos.length === 0) {
        toast.error('No se encontraron movimientos. Verifica que sea el estado de cuenta en PDF del Banco Pichincha.');
        return;
      }
      // Se leen de la base solo los movimientos de las fechas del PDF, para detectar los que ya están registrados
      const tiempos = res.movimientos.map(m => m.fecha.getTime());
      const unDia = 24 * 60 * 60 * 1000;
      const yaEnBase = await getMovimientosRango(new Date(Math.min(...tiempos) - unDia), new Date(Math.max(...tiempos) + unDia));
      setExistentesPdf(yaEnBase.filter(m => m.cuentaBancariaId === cuentaSel));
      setPdfRes(res);
      setDlgPdf(true);
    } catch (err) {
      console.error('Error al leer el PDF del banco:', err);
      toast.error('No se pudo leer el PDF. Si es un archivo escaneado (imagen), descárgalo de nuevo desde la banca en línea.');
    } finally {
      setLeyendoPdf(false);
      if (pdfRef.current) pdfRef.current.value = '';
    }
  };

  const handleConfirmarPDF = async () => {
    if (!pdfPlan) return;
    setImportandoPdf(true);
    setProgresoPdf({ hechos: 0, total: 0 });
    try {
      const ids = await importarMovimientosBancarios(pdfPlan.nuevos);

      // Contabilizar al importar: los tipos de movimiento con contracuenta elegida generan su asiento
      // y quedan conciliados; el resto queda pendiente para conciliar.
      let contabilizados = 0, fallidos = 0;
      const bancoCodigo = cuentaSelObj?.cuentaContableCodigo;
      const aContabilizar = pdfPlan.nuevos
        .map((m, i) => ({ m, i, codigo: contrasPdf[`${m.tipo}|${claveDescripcion(m.descripcion)}`] }))
        .filter(x => x.codigo);
      if (aContabilizar.length > 0 && bancoCodigo && user) {
        setProgresoPdf({ hechos: 0, total: aContabilizar.length });
        for (const c of new Set(aContabilizar.map(x => x.codigo))) await asegurarCuenta(c);
        for (let k = 0; k < aContabilizar.length; k++) {
          const { m, i, codigo } = aContabilizar[k];
          try {
            const asientoId = await crearAsientoMovimientoBancario({
              movId: ids[i], fecha: m.fecha, concepto: m.descripcion, monto: m.monto,
              cuentaBancoCodigo: bancoCodigo, cuentaContrapartidaCodigo: codigo,
              tipo: m.tipo === 'debito' ? 'cargo' : 'abono',
              usuarioId: user.uid, usuarioNombre: user.nombre,
            });
            if (asientoId) { await conciliarMovimiento(ids[i], asientoId); contabilizados++; } else fallidos++;
          } catch { fallidos++; }
          setProgresoPdf({ hechos: k + 1, total: aContabilizar.length });
        }
      }
      // Se guarda también el corte de cada mes (saldos que declara el banco): base de la conciliación mensual
      let extractos = 0;
      try {
        extractos = pdfRes ? await guardarExtractos(cuentaSel, pdfRes.cortes, user?.nombre ?? '') : 0;
      } catch {
        toast.warning('Los movimientos se importaron, pero no se pudieron guardar los saldos de cada mes del banco. Revisa los permisos (reglas de Firestore) y vuelve a importar el PDF.', { duration: 12000 });
      }
      toast.success(
        `${pdfPlan.nuevos.length} movimientos importados${extractos ? ` en ${extractos} corte(s) mensual(es)` : ''}` +
        (contabilizados ? ` · ${contabilizados} contabilizados con su contracuenta` : ''),
        { duration: 12000, action: { label: 'Ir a conciliar', onClick: () => router.push('/conciliacion-bancaria') } }
      );
      if (fallidos > 0) {
        toast.warning(`${fallidos} movimiento(s) no se pudieron contabilizar (¿período contable cerrado?). Quedaron pendientes: contabilízalos desde Conciliación Bancaria.`, { duration: 14000 });
      }
      // Se muestra el último mes importado para ver el resultado
      if (pdfPlan.nuevos.length > 0) setMes(periodoDe(new Date(Math.max(...pdfPlan.nuevos.map(m => m.fecha.getTime())))));
      setDlgPdf(false);
      setPdfRes(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al importar los movimientos');
    } finally {
      setImportandoPdf(false);
    }
  };

  // Registrar movimiento bancario directo (comisión, cargo, interés ganado…)
  const handleRegistrarMov = async () => {
    if (!user || !cuentaSelObj?.cuentaContableCodigo) return;
    const monto = Math.round((parseFloat(formMov.monto) || 0) * 100) / 100;
    const tipoInfo = TIPOS_MOVIMIENTO_BANCO.find(t => t.value === formMov.tipoMov)!;
    if (!formMov.concepto.trim()) { toast.error('Ingresa el detalle del movimiento'); return; }
    if (!formMov.fecha)           { toast.error('Ingresa la fecha'); return; }
    const resumen = resumirContrapartidas(monto, contrasMov);
    if (!resumen.ok)              { toast.error(resumen.error ?? 'Revisa las cuentas contables'); return; }

    setSavingMov(true);
    try {
      const fecha = new Date(formMov.fecha + 'T12:00:00');
      for (const c of new Set(resumen.lineas.map(l => l.codigo))) await asegurarCuenta(c);

      // Se crea pendiente y solo se concilia si el asiento se generó bien
      const movId = await registrarMovimientoBancario({
        cuentaBancariaId: cuentaSel,
        fecha,
        descripcion: formMov.concepto.trim(),
        tipo:   tipoInfo.entra ? 'credito' : 'debito',
        monto,
        tipoDocumento: formMov.tipoMov,
        ...(formMov.referencia.trim() ? { referencia: formMov.referencia.trim() } : {}),
        ...(formMov.beneficiario.trim() ? { beneficiario: formMov.beneficiario.trim() } : {}),
        estado: 'no_conciliado',
      });

      const asientoId = await crearAsientoMovimientoBancario({
        movId, fecha,
        concepto: formMov.concepto.trim(),
        monto,
        cuentaBancoCodigo: cuentaSelObj.cuentaContableCodigo,
        contrapartidas:    resumen.lineas,
        tipo: tipoInfo.entra ? 'abono' : 'cargo',
        usuarioId: user.uid, usuarioNombre: user.nombre,
      });

      if (asientoId) {
        await conciliarMovimiento(movId, asientoId);
        toast.success('Movimiento bancario registrado y contabilizado');
      } else {
        toast.warning('El movimiento se registró, pero el asiento contable NO se pudo generar (¿período cerrado?). Queda pendiente: contabilízalo desde Conciliación Bancaria.', { duration: 12000 });
      }
      setDlgMov(false);
      setMes(periodoDe(fecha)); // se muestra el mes del movimiento registrado
      setFormMov(formMovInicial());
      setContrasMov([{ codigo: '', monto: '' }]);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar el movimiento');
    } finally {
      setSavingMov(false);
    }
  };

  // Anular un movimiento bancario (revierte su asiento si fue creado con "Comisión/Cargo";
  // si el movimiento se concilió con el asiento de un pago/cobro/venta, no se toca desde aquí).
  const handleAnularMov = async (mov: MovimientoBancario) => {
    if (!user) return;
    if (!window.confirm(`¿Anular el movimiento "${mov.descripcion}" de ${currency(mov.monto)}?`)) return;
    try {
      if (mov.asientoId) {
        const rev = await crearAsientoReversion({
          referenciaId: mov.id, referenciaTipo: 'movimiento_bancario',
          fecha: new Date(), concepto: `Anulación: ${mov.descripcion}`,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (!rev.ok) {
          toast.error(`No se pudo anular desde aquí (${rev.advertencia}). Si es un pago, cobro o venta, anúlalo desde esa pantalla — ahí se revierte su asiento correctamente.`, { duration: 12000 });
          return;
        }
      }
      await anularMovimientoBancario(mov.id);
      toast.success('Movimiento bancario anulado' + (mov.asientoId ? ' y asiento revertido' : ''));
    } catch (e: any) {
      toast.error(e.message ?? 'Error al anular el movimiento');
    }
  };

  // Reclasifica TODO el saldo actual de la cuenta seleccionada a Caja General,
  // con un único asiento (Debe Caja / Haber Banco) — no toca ningún asiento anterior.
  const handleReclasificarACaja = async () => {
    if (!user || !cuentaSelObj?.cuentaContableCodigo || saldoCalculado <= 0) return;
    setSavingReclasificar(true);
    try {
      const fecha = new Date();
      const concepto = `Reclasificación de saldo de ${cuentaSelObj.banco} a Caja General (pendiente de conciliación bancaria)`;
      const movId = await registrarMovimientoBancario({
        cuentaBancariaId: cuentaSel,
        fecha,
        descripcion: concepto,
        tipo: 'debito',
        monto: saldoCalculado,
        estado: 'no_conciliado',
      });

      const asientoId = await crearAsientoReclasificacionCaja({
        movId, fecha, concepto,
        monto: saldoCalculado,
        cuentaBancoCodigo: cuentaSelObj.cuentaContableCodigo,
        usuarioId: user.uid, usuarioNombre: user.nombre,
      });

      if (asientoId) {
        await conciliarMovimiento(movId, asientoId);
        toast.success(`${currency(saldoCalculado)} reclasificados de ${cuentaSelObj.banco} a Caja General`);
      } else {
        toast.warning('El movimiento se registró, pero el asiento contable NO se pudo generar. Revísalo en Contabilidad → Libro Diario.', { duration: 12000 });
      }
      setDlgReclasificar(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al reclasificar el saldo');
    } finally {
      setSavingReclasificar(false);
    }
  };

  // Mueve TODO lo que toque la cuenta de este banco a Caja General:
  //  1. Los movimientos bancarios ya registrados (y su asiento, si tienen).
  //  2. CUALQUIER otro asiento que tenga una línea contra este banco pero que
  //     nunca tuvo un movimiento bancario propio (ej. cobros/pagos antiguos,
  //     de antes de que existiera el registro automático en Movimientos
  //     Bancarios) — se busca directamente en el Libro Diario.
  // No crea ni borra ningún asiento, solo reclasifica la cuenta dentro de
  // cada uno; todo queda registrado en un lote que se puede deshacer.
  // Recupera movimientos bancarios que deberían existir (asientos de cobro/pago
  // que sí tocan una cuenta de banco) pero nunca se guardaron aquí — típicamente
  // porque los permisos de Firestore de esta colección fallaban hasta ahora.
  // Arma el mapa código-contable → cuenta bancaria y busca en TODO el libro
  // diario los asientos que tocan esos códigos y todavía no tienen su
  // movimiento bancario registrado. Compartido entre la vista previa (al
  // abrir el diálogo) y la ejecución real.
  const buscarCandidatosRecuperar = async () => {
    const cuentasActivas = cuentas.filter(c => c.activa);
    const cuentaPorCodigo = new Map<string, CuentaBancaria>(
      cuentasActivas.filter(c => c.cuentaContableCodigo).map(c => [c.cuentaContableCodigo as string, c])
    );
    // Los cobros/pagos por banco SIEMPRE se contabilizan contra la cuenta de
    // "Bancos" general de la configuración contable (no contra la cuenta
    // contable vinculada a cada cuenta bancaria individual) — si solo hay
    // una cuenta bancaria activa, se le atribuyen esos movimientos a ella.
    const config = await getOrCreateConfigContable();
    if (config.cuentaBancos && !cuentaPorCodigo.has(config.cuentaBancos) && cuentasActivas.length === 1) {
      cuentaPorCodigo.set(config.cuentaBancos, cuentasActivas[0]);
    }
    const existentes = new Set(movs.filter(m => m.asientoId).map(m => m.asientoId));

    // OJO: no se filtra por referenciaTipo. Un cobro/pago SIN cobroId/pagoId propio
    // (ej. una CxC cancelada directo, o un pago registrado junto con la factura)
    // queda con referenciaTipo 'cxc' o 'factura_proveedor', no 'cobro_cliente'/
    // 'pago_proveedor' — filtrar por tipo dejaba fuera la mayoría del historial real.
    // Lo único que importa es si el asiento efectivamente toca una cuenta de banco.
    const todosAsientos = await getAsientos();
    const candidatos = todosAsientos.filter(a =>
      !existentes.has(a.id) &&
      a.lineas.some(l => cuentaPorCodigo.has(l.cuentaCodigo))
    );
    return { candidatos, cuentaPorCodigo };
  };

  const handleAbrirRecuperar = async () => {
    setDlgRecuperar(true);
    setResumenRecuperar(null);
    setCargandoResumen(true);
    try {
      const { candidatos } = await buscarCandidatosRecuperar();
      setResumenRecuperar({ candidatos: candidatos.length });
    } catch {
      setResumenRecuperar(null);
    } finally {
      setCargandoResumen(false);
    }
  };

  const handleRecuperarFaltantes = async () => {
    if (!user) return;
    setRecuperando(true);
    setProgresoRecuperar(0);
    let ok = 0, err = 0;
    try {
      const { candidatos, cuentaPorCodigo } = await buscarCandidatosRecuperar();

      for (let i = 0; i < candidatos.length; i++) {
        const asiento = candidatos[i];
        try {
          const linea = asiento.lineas.find(l => cuentaPorCodigo.has(l.cuentaCodigo))!;
          const cuenta = cuentaPorCodigo.get(linea.cuentaCodigo)!;
          const tipo   = linea.debe > 0 ? 'credito' : 'debito';
          const monto  = linea.debe > 0 ? linea.debe : linea.haber;
          await registrarMovimientoBancario({
            cuentaBancariaId: cuenta.id,
            fecha: asiento.fecha,
            descripcion: asiento.concepto,
            tipo, monto,
            estado: 'conciliado',
            asientoId: asiento.id,
          });
          ok++;
        } catch {
          err++;
        }
        setProgresoRecuperar(i + 1);
      }

      if (candidatos.length === 0) {
        toast.info('No se encontró ningún cobro/pago de banco sin su movimiento — ya está todo al día.');
      } else {
        toast.success(`${ok} movimiento(s) recuperados` + (err ? ` — ${err} con error` : ''), { duration: 10000 });
      }
      setDlgRecuperar(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al recuperar movimientos');
    } finally {
      setRecuperando(false);
    }
  };

  const handleMoverTodoACaja = async () => {
    if (!user || !cuentaSelObj?.cuentaContableCodigo) return;
    setMoviendoTodo(true);
    setProgresoMoverTodo(0);
    let ok = 0, sinAsiento = 0, bloqueados = 0, err = 0;
    const items: ItemLoteReclasificacion[] = [];
    const bancoCodigo = cuentaSelObj.cuentaContableCodigo;
    try {
      const config = await getOrCreateConfigContable();
      const cuentaCaja = planCuentas.find(c => c.codigo === config.cuentaCaja);
      const destino = { codigo: config.cuentaCaja, nombre: cuentaCaja?.nombre ?? 'Caja General' };
      // Devuelve el nombre/id de la cuenta contable de un código, para poder
      // reconstruirlo exacto si hace falta deshacer la reclasificación después.
      const origenPorCodigo = (codigo: string) => {
        const c = planCuentas.find(pc => pc.codigo === codigo);
        return { codigo, nombre: c?.nombre ?? codigo, id: c?.id ?? codigo };
      };

      // Los cobros/pagos por banco se contabilizan contra la cuenta de "Bancos"
      // general de la configuración contable, que puede no ser la misma que la
      // vinculada a esta cuenta bancaria en particular — se buscan ambos códigos.
      const codigosBanco = new Set([bancoCodigo, config.cuentaBancos].filter(Boolean));

      // 1) Todos los asientos del sistema que tocan la cuenta de este banco
      const todosAsientos = await getAsientos();
      const asientosDelBanco = todosAsientos.filter(a =>
        a.lineas.some(l => codigosBanco.has(l.cuentaCodigo))
      );
      const asientosBloqueados = asientosDelBanco.filter(a => a.bloqueado);
      const asientosAProcesar  = asientosDelBanco.filter(a => !a.bloqueado);
      bloqueados = asientosBloqueados.length;

      // Movimiento bancario vinculado a cada asiento (si existe), para poder
      // marcarlo también como reclasificado.
      const movPorAsiento = new Map(movsParaMover.filter(m => m.asientoId).map(m => [m.asientoId as string, m]));

      const total = asientosAProcesar.length;
      for (let i = 0; i < total; i++) {
        const asiento = asientosAProcesar[i];
        try {
          // El código que realmente aparece en ESTE asiento puede ser el de la
          // cuenta bancaria o el genérico de "Bancos" — se usa el que coincida.
          const codigoEnAsiento = asiento.lineas.find(l => codigosBanco.has(l.cuentaCodigo))?.cuentaCodigo ?? bancoCodigo;
          const origen = origenPorCodigo(codigoEnAsiento);
          const huboAsiento = await reclasificarCuentaEnAsiento(
            asiento.id, codigoEnAsiento, destino, user.uid, user.nombre
          );
          if (!huboAsiento) sinAsiento++;

          const mov = movPorAsiento.get(asiento.id);
          if (mov) {
            await marcarMovimientoReclasificado(mov.id, `${mov.descripcion} (reclasificado a Caja General)`);
          }

          items.push({
            ...(mov ? { movId: mov.id, estadoMovOriginal: mov.estado, descripcionMovOriginal: mov.descripcion } : {}),
            asientoId: asiento.id, huboAsiento,
            cuentaOrigenCodigo: origen.codigo,
            cuentaOrigenNombre: origen.nombre,
            cuentaOrigenId:     origen.id,
          });
          ok++;
        } catch {
          err++;
        }
        setProgresoMoverTodo(i + 1);
      }

      // 2) Movimientos bancarios sin ningún asiento vinculado: no hay nada que
      // reclasificar contablemente, pero igual dejan de contar para el saldo.
      const origenCuentaSel = origenPorCodigo(bancoCodigo);
      for (const mov of movsParaMover) {
        if (mov.asientoId) continue; // ya se procesó (o se procesará) arriba
        try {
          await marcarMovimientoReclasificado(mov.id, `${mov.descripcion} (reclasificado a Caja General)`);
          items.push({
            movId: mov.id, estadoMovOriginal: mov.estado, descripcionMovOriginal: mov.descripcion,
            huboAsiento: false,
            cuentaOrigenCodigo: origenCuentaSel.codigo, cuentaOrigenNombre: origenCuentaSel.nombre, cuentaOrigenId: origenCuentaSel.id,
          });
          sinAsiento++;
        } catch {
          err++;
        }
      }

      if (items.length > 0) {
        await crearLoteReclasificacion({
          cuentaBancariaId: cuentaSel,
          cuentaBancoNombre: cuentaSelObj.banco,
          cuentaDestinoCodigo: destino.codigo,
          cuentaDestinoNombre: destino.nombre,
          fecha: new Date(),
          items,
          usuarioId: user.uid,
          usuarioNombre: user.nombre,
        });
      }

      toast.success(
        `${ok} asiento(s) reclasificados a Caja General` +
        (sinAsiento ? ` — ${sinAsiento} sin línea de banco que reclasificar` : '') +
        (bloqueados ? ` — ${bloqueados} en períodos cerrados (no se tocaron)` : '') +
        (err ? ` — ${err} con error` : ''),
        { duration: 14000 }
      );
      if (items.length === 0) {
        toast.info('No se encontró nada que mover: ningún asiento ni movimiento de esta cuenta hace referencia al banco.');
      }
      setDlgMoverTodo(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al mover los movimientos a Caja');
    } finally {
      setMoviendoTodo(false);
    }
  };

  // Deshace un lote de "Mover TODO el historial a Caja": regresa cada asiento
  // y cada movimiento a como estaban antes.
  const handleDeshacerLote = async (lote: LoteReclasificacion) => {
    if (!user) return;
    if (!window.confirm(`¿Deshacer esta reclasificación de ${lote.items.length} movimiento(s) y devolverlos a ${lote.items[0]?.cuentaOrigenNombre ?? 'su cuenta original'}?`)) return;
    setRevirtiendoLoteId(lote.id);
    let ok = 0, err = 0, ambiguos = 0, cerrados = 0;
    try {
      for (const item of lote.items) {
        try {
          if (item.huboAsiento && item.asientoId) {
            // Si el asiento quedó con varias líneas de Caja (p. ej. un depósito Bancos/Caja) no se puede
            // saber cuál era la del banco: se deja como está para revisarlo a mano.
            const r = await reclasificarCuentaEnAsientoSiEsUnica(
              item.asientoId, lote.cuentaDestinoCodigo,
              { codigo: item.cuentaOrigenCodigo, nombre: item.cuentaOrigenNombre, id: item.cuentaOrigenId },
              user.uid, user.nombre
            );
            if (r === 'ambigua') { ambiguos++; continue; }
          }
          if (item.movId && item.estadoMovOriginal && item.descripcionMovOriginal !== undefined) {
            await restaurarMovimiento(item.movId, {
              estado: item.estadoMovOriginal,
              descripcion: item.descripcionMovOriginal,
            });
          }
          ok++;
        } catch (e) {
          if (e instanceof Error && /cerrado/i.test(e.message)) cerrados++; else err++;
        }
      }
      await marcarLoteRevertido(lote.id);
      toast.success(
        `${ok} movimiento(s) devueltos a ${lote.cuentaBancoNombre}` +
        (ambiguos ? ` — ${ambiguos} asiento(s) tienen Bancos y Caja a la vez (p. ej. depósitos) y NO se tocaron: corrígelos a mano en Contabilidad → Asientos` : '') +
        (cerrados ? ` — ${cerrados} en períodos cerrados (reábrelos para devolverlos)` : '') +
        (err ? ` — ${err} con error` : ''),
        { duration: 20000 }
      );
    } catch (e: any) {
      toast.error(e.message ?? 'Error al deshacer la reclasificación');
    } finally {
      setRevirtiendoLoteId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movimientos Bancarios"
        description="Registro de todo lo que entra y sale de tus cuentas bancarias — comisiones, cargos, depósitos, extractos importados"
        action={
          <Button size="sm" onClick={() => setDlgCuenta(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva Cuenta
          </Button>
        }
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        Aquí registras e importas los movimientos de cada cuenta bancaria. Para cuadrarlos contra tus asientos
        contables (pagos, cobros, ventas), ve a <strong>Conciliación Bancaria</strong>.
      </div>

      {/* Selector de cuenta */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-64">
          <Label className="text-xs">Cuenta bancaria</Label>
          <Select value={cuentaSel} onValueChange={setCuentaSel}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Seleccionar cuenta…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las cuentas</SelectItem>
              {cuentas.filter(c => c.activa).map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="font-medium">{c.banco}</span>
                  <span className="text-slate-400 ml-2 text-xs">{c.numeroCuenta}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {cuentaSel && (
          <div className="min-w-48">
            <Label className="text-xs">Mes</Label>
            <Select value={mes} onValueChange={setMes} disabled={cargaCompleta}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {opcionesMes.map(p => <SelectItem key={p} value={p}>{nombreMesES(p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {cuentaSel && cuentaSel !== 'todas' && (
          <>
            <div className="text-sm">
              <p className="text-xs text-slate-400">{cargaCompleta ? 'Saldo calculado' : 'Saldo del banco al cierre del mes'}</p>
              <p className="font-bold text-slate-800">
                {cargaCompleta ? currency(saldoCalculado) : extractoMes ? currency(extractoMes.saldoActual) : '—'}
              </p>
              {!cargaCompleta && (
                <p className="text-[10px] text-slate-400">
                  {extractoMes ? 'según el estado de cuenta · ' : 'sin estado de cuenta de este mes · '}
                  mes: +{currency(totalesMes.creditos)} / −{currency(totalesMes.debitos)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportCSV}
              />
              <Button variant="outline" size="sm" disabled={importing}
                onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {importing ? 'Importando…' : 'Importar CSV'}
              </Button>
              <input
                ref={pdfRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleLeerPDF}
              />
              <Button variant="outline" size="sm" disabled={leyendoPdf}
                title="Carga el estado de cuenta en PDF del Banco Pichincha: crea un movimiento por cada renglón"
                onClick={() => pdfRef.current?.click()}>
                <FileText className="mr-2 h-4 w-4" />
                {leyendoPdf ? 'Leyendo PDF…' : 'Importar PDF del banco'}
              </Button>
              <Button variant="outline" size="sm"
                disabled={!cuentaSelObj?.cuentaContableCodigo}
                title={!cuentaSelObj?.cuentaContableCodigo ? 'Primero vincula esta cuenta a una cuenta contable' : undefined}
                onClick={() => setDlgMov(true)}>
                <Receipt className="mr-2 h-4 w-4" /> Movimiento manual
              </Button>
              <Button variant="outline" size="sm"
                disabled={!cuentaSelObj?.cuentaContableCodigo || !cargaCompleta || saldoCalculado <= 0}
                title={!cuentaSelObj?.cuentaContableCodigo ? 'Primero vincula esta cuenta a una cuenta contable'
                  : !cargaCompleta ? 'Necesita todo el historial de la cuenta: se habilita en modo mantenimiento (?mantenimiento=1)'
                  : 'Mueve solo el saldo actual de esta cuenta a Caja General (un asiento nuevo)'}
                onClick={() => setDlgReclasificar(true)}>
                <ArrowRightLeft className="mr-2 h-4 w-4" /> Reclasificar saldo a Caja
              </Button>
              {mantenimiento && (
              <Button variant="outline" size="sm" className="text-amber-700 border-amber-300 hover:bg-amber-50"
                disabled={!cuentaSelObj?.cuentaContableCodigo}
                title={!cuentaSelObj?.cuentaContableCodigo ? 'Primero vincula esta cuenta a una cuenta contable' : 'Busca en TODO el Libro Diario los asientos de este banco y los reclasifica a Caja'}
                onClick={() => setDlgMoverTodo(true)}>
                <ArrowRightLeft className="mr-2 h-4 w-4" /> Mover TODO el historial a Caja
              </Button>
              )}
            </div>
          </>
        )}
        {cuentaSel === 'todas' && (
          <>
            <p className="text-xs text-slate-400 max-w-xs">
              Viendo movimientos de todas las cuentas ({movs.length} registrado{movs.length === 1 ? '' : 's'}).
              {cuentas.length === 0
                ? ' Primero crea tu cuenta bancaria con «Nueva Cuenta» (arriba a la derecha); luego podrás importar el PDF del banco.'
                : ' Elige una cuenta específica para importar el PDF o CSV del banco, registrar comisiones o reclasificar a Caja.'}
            </p>
            <Button variant="outline" size="sm"
              onClick={() => {
                if (cuentas.length === 0) {
                  toast.info('Primero crea la cuenta bancaria: se importa el PDF dentro de una cuenta.');
                  setDlgCuenta(true);
                } else {
                  toast.info('Elige primero la cuenta bancaria a la que pertenece el estado de cuenta.');
                }
              }}>
              <FileText className="mr-2 h-4 w-4" /> Importar PDF del banco
            </Button>
            {mantenimiento && (
            <Button variant="outline" size="sm" onClick={handleAbrirRecuperar}>
              Recuperar movimientos faltantes
            </Button>
            )}
          </>
        )}
      </div>

      {/* Formato CSV info */}
      {cuentaSel && cuentaSel !== 'todas' && (
        <div className="bg-slate-50 border rounded-xl p-3 text-xs text-slate-500">
          Formato CSV esperado: <code className="font-mono bg-white px-1 py-0.5 rounded border">fecha,descripcion,tipo,monto,saldo,referencia</code>
          &nbsp;— tipo: <em>credito</em> o <em>debito</em> — fecha: dd/MM/yyyy — saldo y referencia (n° de comprobante) son opcionales
        </div>
      )}

      {cuentas.length === 0 ? (
        <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Todavía no tienes cuentas bancarias registradas</p>
          <Button className="mt-4" size="sm" onClick={() => setDlgCuenta(true)}>
            Crear primera cuenta bancaria
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-slate-700">Movimientos</p>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="no_conciliado">Pendientes</SelectItem>
                <SelectItem value="conciliado">Conciliados</SelectItem>
                <SelectItem value="ignorado">Ignorados</SelectItem>
                <SelectItem value="anulado">Anulados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Fecha</TableHead>
                  {cuentaSel === 'todas' && <TableHead>Cuenta</TableHead>}
                  <TableHead>Descripción</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: cuentaSel === 'todas' ? 9 : 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : movsFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cuentaSel === 'todas' ? 9 : 8} className="text-center py-10 text-slate-400">
                      No hay movimientos en esta categoría.
                    </TableCell>
                  </TableRow>
                ) : movsFiltrados.map(m => (
                  <TableRow key={m.id} className={m.estado === 'anulado' ? 'opacity-50' : ''}>
                    <TableCell className="text-sm text-slate-500">
                      {format((m.fecha as any)?.toDate?.() ?? new Date(m.fecha), 'dd/MM/yyyy')}
                    </TableCell>
                    {cuentaSel === 'todas' && (
                      <TableCell className="text-xs text-slate-500">
                        {cuentaPorId.get(m.cuentaBancariaId)?.banco ?? '—'}
                      </TableCell>
                    )}
                    <TableCell className={`text-sm max-w-64 truncate ${m.estado === 'anulado' ? 'line-through' : ''}`}>{m.descripcion}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">{m.referencia ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.tipo === 'credito' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {m.tipo === 'credito' ? '+ Crédito' : '− Débito'}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${
                      m.tipo === 'credito' ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {m.tipo === 'credito' ? '+' : '-'}{currency(m.monto)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-500">
                      {m.saldo != null ? currency(m.saldo) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[m.estado] ?? ''}`}>
                        {ESTADO_LABEL[m.estado] ?? m.estado}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {m.estado !== 'anulado' && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                          title="Anular" onClick={() => handleAnularMov(m)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Historial de reclasificaciones masivas — permite deshacer */}
      {cuentaSel && lotes.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-4 border-b">
            <p className="font-semibold text-slate-700">Reclasificaciones a Caja realizadas</p>
          </div>
          <div className="divide-y">
            {lotes.map(lote => (
              <div key={lote.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm">
                    <strong>{lote.items.length}</strong> movimiento(s) de <strong>{lote.cuentaBancoNombre}</strong> → {lote.cuentaDestinoNombre}
                  </p>
                  <p className="text-xs text-slate-400">
                    {format((lote.fecha as any)?.toDate?.() ?? new Date(lote.fecha), 'dd/MM/yyyy HH:mm')} — {lote.usuarioNombre}
                    {lote.estado === 'revertido' && <span className="ml-2 text-amber-600 font-medium">· Revertido</span>}
                  </p>
                </div>
                {lote.estado === 'aplicado' && (
                  <Button variant="outline" size="sm" disabled={revirtiendoLoteId === lote.id}
                    onClick={() => handleDeshacerLote(lote)}>
                    {revirtiendoLoteId === lote.id ? 'Deshaciendo…' : 'Deshacer'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog nueva cuenta */}
      {/* Revisión del estado de cuenta en PDF antes de importar */}
      <Dialog open={dlgPdf} onOpenChange={(o) => { if (!importandoPdf) { setDlgPdf(o); if (!o) setPdfRes(null); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Importar estado de cuenta — {cuentaSelObj?.banco} {cuentaSelObj?.numeroCuenta}
            </DialogTitle>
          </DialogHeader>
          {pdfRes && pdfPlan && (
            <div className="space-y-4 py-1">
              {pdfRes.numeroCuenta && cuentaSelObj
                && !cuentaSelObj.numeroCuenta.replace(/\D/g, '').endsWith(pdfRes.numeroCuenta.slice(-6)) && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  ⚠ Este PDF es de la cuenta <strong>{pdfRes.numeroCuenta}</strong>, pero elegiste la cuenta{' '}
                  <strong>{cuentaSelObj.numeroCuenta}</strong>. Verifica antes de importar.
                </p>
              )}
              <p className="text-xs text-slate-500">
                El archivo trae {pdfRes.cortes.filter(c => !c.repetido).length} corte(s) mensual(es). Cada uno se verifica por separado
                y se guarda con los saldos del banco: la conciliación se hace mes a mes.
              </p>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Corte</TableHead>
                      <TableHead className="text-right">Movimientos</TableHead>
                      <TableHead className="text-right">Saldo inicial</TableHead>
                      <TableHead className="text-right">Saldo final</TableHead>
                      <TableHead>Verificación con el banco</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...pdfRes.cortes].sort((a, b) => a.corte.getTime() - b.corte.getTime()).map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{format(c.corte, 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-right text-xs">{c.movimientos.length}</TableCell>
                        <TableCell className="text-right text-xs">{c.saldoAnterior === null ? '—' : currency(c.saldoAnterior)}</TableCell>
                        <TableCell className="text-right text-xs">{c.saldoActual === null ? '—' : currency(c.saldoActual)}</TableCell>
                        <TableCell className="text-xs">
                          {c.repetido ? (
                            <span className="text-slate-500">Repetido en el archivo — se omite</span>
                          ) : c.cuadra ? (
                            <span className="text-green-700">✓ Créditos, débitos y saldos cuadran</span>
                          ) : (
                            <span className="text-amber-700">⚠ {c.avisos.join(' · ')}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span><strong>{pdfPlan.nuevos.length}</strong> movimientos nuevos para importar</span>
                {pdfPlan.yaRegistrados > 0 && (
                  <span className="text-slate-500">{pdfPlan.yaRegistrados} ya estaban registrados (se omiten)</span>
                )}
              </div>
              {pdfRes.cortes.some(c => !c.repetido && !c.cuadra) && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  Algún corte no cuadra con los totales del banco. Revisa los avisos antes de importar.
                </p>
              )}

              {pdfPlan.nuevos.length > 0 && (
                <div className="rounded-lg border">
                  <div className="px-3 py-2 border-b bg-slate-50">
                    <p className="text-sm font-medium text-slate-700">Contracuenta de cada tipo de movimiento</p>
                    <p className="text-[11px] text-slate-400">
                      {cuentaSelObj?.cuentaContableCodigo
                        ? <>Elige a qué cuenta contable va cada tipo (gastos del banco, Caja, otra cuenta…) y se contabiliza y concilia al importar.
                            Lo que dejes sin cuenta queda pendiente para conciliar contra un pago o cobro ya registrado. Contabilizar crea un asiento por movimiento,
                            así que un PDF grande tarda.</>
                        : 'Vincula esta cuenta bancaria a una cuenta contable para poder contabilizar al importar.'}
                    </p>
                  </div>
                  {cuentaSelObj?.cuentaContableCodigo && (
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {gruposPdf.slice(0, 40).map(g => (
                        <div key={g.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                          <div className="min-w-0 flex-1 basis-44">
                            <p className="text-sm font-medium truncate">{g.clave}</p>
                            <p className="text-[11px] text-slate-400">
                              {g.n} movimiento{g.n === 1 ? '' : 's'} · {g.tipo === 'credito' ? 'créditos' : 'débitos'} por {currency(g.total)}
                            </p>
                          </div>
                          <div className="w-full sm:w-72">
                            <CuentaCombobox
                              value={contrasPdf[g.key] ?? ''}
                              onChange={v => setContrasPdf(c => ({ ...c, [g.key]: v }))}
                              opciones={opcionesCuentas}
                              vacioLabel="Dejar pendiente (conciliar después)"
                              placeholder="Dejar pendiente"
                            />
                          </div>
                        </div>
                      ))}
                      {gruposPdf.length > 40 && (
                        <p className="px-3 py-2 text-[11px] text-slate-400">
                          +{gruposPdf.length - 40} tipos menos frecuentes quedan pendientes.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {pdfPlan.nuevos.length > 0 && (
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Oficina</TableHead>
                        <TableHead>N° documento</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Débito</TableHead>
                        <TableHead className="text-right">Crédito</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pdfPlan.nuevos.slice(0, 300).map((m, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs whitespace-nowrap">{format(m.fecha, 'dd/MM/yyyy')}</TableCell>
                          <TableCell className="text-xs">{m.oficina}</TableCell>
                          <TableCell className="font-mono text-xs">{m.referencia}</TableCell>
                          <TableCell className="text-xs">{m.descripcion}</TableCell>
                          <TableCell className="text-right text-xs">{m.tipo === 'debito' ? currency(m.monto) : ''}</TableCell>
                          <TableCell className="text-right text-xs">{m.tipo === 'credito' ? currency(m.monto) : ''}</TableCell>
                          <TableCell className="text-right text-xs">{m.saldo === undefined ? '' : currency(m.saldo)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {pdfPlan.nuevos.length > 300 && (
                <p className="text-[11px] text-slate-400">Se muestran los primeros 300; se importarán los {pdfPlan.nuevos.length}.</p>
              )}
              <p className="text-[11px] text-slate-400">
                Cada renglón se guarda como un movimiento pendiente, con su fecha, oficina, N° de documento, descripción,
                débito o crédito y saldo. Luego los concilias o los contabilizas desde Conciliación Bancaria.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={importandoPdf} onClick={() => { setDlgPdf(false); setPdfRes(null); }}>
              Cancelar
            </Button>
            <Button disabled={importandoPdf || !pdfPlan} onClick={handleConfirmarPDF}>
              {importandoPdf
                ? (progresoPdf.total > 0 ? `Contabilizando ${progresoPdf.hechos} de ${progresoPdf.total}…` : 'Importando…')
                : (pdfPlan?.nuevos.length ?? 0) > 0 ? `Importar ${pdfPlan?.nuevos.length} movimientos`
                : 'Guardar los saldos de cada mes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlgCuenta} onOpenChange={setDlgCuenta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta Bancaria</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Banco *</Label>
              <Input value={formCuenta.banco}
                onChange={e => setFormCuenta(f => ({ ...f, banco: e.target.value }))}
                placeholder="Ej: Banco Pichincha" className="mt-1" />
            </div>
            <div>
              <Label>Tipo de cuenta</Label>
              <Select value={formCuenta.tipoCuenta}
                onValueChange={v => setFormCuenta(f => ({ ...f, tipoCuenta: v as 'corriente'|'ahorros' }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corriente">Corriente</SelectItem>
                  <SelectItem value="ahorros">Ahorros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número de cuenta *</Label>
              <Input value={formCuenta.numeroCuenta}
                onChange={e => setFormCuenta(f => ({ ...f, numeroCuenta: e.target.value }))}
                className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Titular</Label>
              <Input value={formCuenta.titular}
                onChange={e => setFormCuenta(f => ({ ...f, titular: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <Label>Saldo inicial ($)</Label>
              <Input type="number" step="0.01" value={formCuenta.saldoInicial}
                onChange={e => setFormCuenta(f => ({ ...f, saldoInicial: e.target.value }))}
                className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Cuenta contable vinculada *</Label>
              <Select value={formCuenta.cuentaContableCodigo}
                onValueChange={v => setFormCuenta(f => ({ ...f, cuentaContableCodigo: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecciona la cuenta de bancos del plan…" />
                </SelectTrigger>
                <SelectContent>
                  {planCuentas
                    .filter(c => c.aceptaMovimientos && c.tipo === 'activo')
                    .map(c => (
                      <SelectItem key={c.id} value={c.codigo}>
                        <span className="font-mono text-xs">{c.codigo}</span> · {c.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                Permite conciliar los movimientos del extracto contra los asientos que afectan esta cuenta.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgCuenta(false)}>Cancelar</Button>
            <Button onClick={handleCrearCuenta}>Crear cuenta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog registrar comisión / cargo / interés bancario */}
      <Dialog open={dlgMov} onOpenChange={o => { if (!savingMov) setDlgMov(o); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar movimiento bancario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de movimiento *</Label>
                <Select value={formMov.tipoMov}
                  onValueChange={v => setFormMov(f => ({ ...f, tipoMov: v as TipoMovimientoBanco }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_MOVIMIENTO_BANCO.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label} ({t.entra ? '+ entra' : '− sale'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha *</Label>
                <Input type="date" value={formMov.fecha}
                  onChange={e => setFormMov(f => ({ ...f, fecha: e.target.value }))}
                  max={new Date().toISOString().split('T')[0]} className="mt-1" />
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-slate-400">
              {TIPOS_MOVIMIENTO_BANCO.find(t => t.value === formMov.tipoMov)?.ayuda}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>N° de comprobante / documento</Label>
                <Input value={formMov.referencia}
                  onChange={e => setFormMov(f => ({ ...f, referencia: e.target.value }))}
                  placeholder="N° de nota, cheque o depósito" className="mt-1" />
              </div>
              <div>
                <Label>Monto *</Label>
                <Input type="number" min="0" step="0.01" value={formMov.monto}
                  onChange={e => setFormMov(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0.00" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Detalle *</Label>
                <Input value={formMov.concepto}
                  onChange={e => setFormMov(f => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Comisión mantenimiento de cuenta" className="mt-1" />
              </div>
              <div>
                <Label>Beneficiario</Label>
                <Input value={formMov.beneficiario}
                  onChange={e => setFormMov(f => ({ ...f, beneficiario: e.target.value }))}
                  placeholder="Opcional" className="mt-1" />
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div>
                <Label>Contracuenta(s) contable(s) *</Label>
                <p className="text-[11px] text-slate-400">
                  ¿A dónde va este movimiento? Puede ser cualquier cuenta: un gasto, Caja, otra cuenta de balance… Con «Agregar cuenta» lo repartes
                  (por ejemplo comisión + IVA).
                </p>
              </div>
              <ContracuentasEditor opciones={opcionesCuentas} total={parseFloat(formMov.monto) || 0}
                value={contrasMov} onChange={setContrasMov} />
              <div className="rounded-md bg-slate-50 p-2 text-[11px] text-slate-500">
                Asiento: {TIPOS_MOVIMIENTO_BANCO.find(t => t.value === formMov.tipoMov)?.entra
                  ? 'Debe Banco · Haber contracuenta(s)'
                  : 'Debe contracuenta(s) · Haber Banco'}
                {' '}({cuentaSelObj?.cuentaContableCodigo}).
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
              Se creará el movimiento en <strong>{cuentaSelObj?.banco}</strong> ya conciliado con su propio asiento contable
              (no necesitas conciliarlo manualmente después).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={savingMov} onClick={() => setDlgMov(false)}>Cancelar</Button>
            <Button onClick={handleRegistrarMov} disabled={savingMov}>
              {savingMov ? 'Registrando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog reclasificar saldo completo a Caja General */}
      <Dialog open={dlgReclasificar} onOpenChange={setDlgReclasificar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reclasificar saldo a Caja General</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Se creará <strong>un solo asiento</strong> que mueve todo el saldo actual de{' '}
              <strong>{cuentaSelObj?.banco}</strong> a <strong>Caja General</strong>:
            </p>
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Debe — Caja General</span>
                <span className="font-semibold text-green-700">{currency(saldoCalculado)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Haber — {cuentaSelObj?.banco}</span>
                <span className="font-semibold text-red-600">{currency(saldoCalculado)}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              La cuenta bancaria queda en $0.00 y el movimiento entra ya conciliado. No se modifica
              ningún asiento anterior — esto es una reclasificación nueva, con fecha de hoy, que puedes
              anular después desde "Anular" si hace falta corregirla.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgReclasificar(false)}>Cancelar</Button>
            <Button onClick={handleReclasificarACaja} disabled={savingReclasificar}>
              {savingReclasificar ? 'Reclasificando…' : `Reclasificar ${currency(saldoCalculado)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog recuperar movimientos bancarios faltantes */}
      <Dialog open={dlgRecuperar} onOpenChange={(o) => !recuperando && setDlgRecuperar(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Recuperar movimientos faltantes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Busca en todo el Libro Diario los cobros y pagos que sí se contabilizaron contra una
              cuenta bancaria, pero que por algún motivo (ej. un error de permisos ya corregido)
              nunca quedaron guardados aquí como movimiento — y los reconstruye, ya conciliados con
              su asiento, sin crear ni modificar ningún asiento.
            </p>
            {cargandoResumen && (
              <p className="text-sm text-slate-500">Contando asientos pendientes…</p>
            )}
            {!cargandoResumen && resumenRecuperar && !recuperando && (
              <p className="text-sm font-medium">
                {resumenRecuperar.candidatos === 0
                  ? 'No se encontró ningún asiento de banco sin su movimiento — ya está todo al día.'
                  : `Se encontraron ${resumenRecuperar.candidatos} asiento(s) de banco sin movimiento registrado.`}
              </p>
            )}
            {recuperando && (
              <p className="text-sm text-slate-500">Revisando asientos… {progresoRecuperar}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgRecuperar(false)} disabled={recuperando}>Cancelar</Button>
            <Button onClick={handleRecuperarFaltantes} disabled={recuperando}>
              {recuperando ? 'Recuperando…' : 'Buscar y recuperar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog mover TODO el historial de movimientos (y sus asientos) a Caja General */}
      <Dialog open={dlgMoverTodo} onOpenChange={(o) => !moviendoTodo && setDlgMoverTodo(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mover todo el historial a Caja General</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Esto va a buscar en <strong>todo el Libro Diario</strong> cada asiento que tenga una línea
              contra <strong>{cuentaSelObj?.banco}</strong> — incluidos cobros/pagos antiguos que nunca
              tuvieron un movimiento bancario propio — y cambiar esa línea a <strong>Caja General</strong>{' '}
              (mismo monto, misma fecha original).
            </div>
            <ul className="text-xs text-slate-500 list-disc pl-4 space-y-1">
              <li>No se crea ni se borra ningún asiento — se reclasifica la cuenta dentro de cada uno.</li>
              <li>Los montos, fechas y el resto de líneas (retenciones, etc.) no cambian.</li>
              <li>Los asientos de períodos ya cerrados no se pueden tocar y se avisan aparte.</li>
              <li>Puede tardar un momento si hay muchos asientos — no cierres esta ventana mientras procesa.</li>
              <li><strong>Se puede deshacer</strong> después con un clic — queda un registro del lote debajo de la tabla.</li>
            </ul>
            {moviendoTodo && (
              <p className="text-sm text-slate-500">
                {progresoMoverTodo > 0 ? `Procesando asiento ${progresoMoverTodo}…` : 'Buscando asientos de este banco…'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgMoverTodo(false)} disabled={moviendoTodo}>Cancelar</Button>
            <Button onClick={handleMoverTodoACaja} disabled={moviendoTodo}
              className="bg-amber-600 hover:bg-amber-700">
              {moviendoTodo ? 'Moviendo…' : 'Buscar y mover a Caja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
