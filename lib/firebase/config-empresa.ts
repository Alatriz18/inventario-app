import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  ConfigEmpresa, RegimenEmpresa,
  ComprobantesHabilitados, ReglasTributarias,
} from '@/types';

const COL    = 'config_empresa';
const DOC_ID = 'config';

// ── Defaults por régimen ──────────────────────────────────────────────────

export function getDefaultsRegimen(regimen: RegimenEmpresa): {
  comprobantesHabilitados: ComprobantesHabilitados;
  reglasTributarias: ReglasTributarias;
} {
  const base: ComprobantesHabilitados = {
    factura:              false,
    notaVenta:            false,
    notaCredito:          false,
    notaDebito:           false,
    comprobanteRetencion: false,
    liquidacionCompras:   false,
    guiaRemision:         false,
    reciboInterno:        true,  // siempre disponible para control interno
  };

  const baseReglas: ReglasTributarias = {
    cobrarIVA:             false,
    tasaIVA:               0,
    esAgenteRetencion:     false,
    obligadoContabilidad:  false,
    contribuyenteEspecial: false,
    aplicaICE:             false,
    declaraFormulario104:  false,
    declaraFormulario103:  false,
    declaraFormulario105:  false,
    declaraATS:            false,
    declaraFormulario101:  false,
    declaraRIMPE:          false,
  };

  switch (regimen) {
    // ── Régimen General ──────────────────────────────────────────────────
    // RUC, puede o no estar obligado a contabilidad.
    // Cobra IVA 15%, emite todos los comprobantes excepto nota de venta pura.
    case 'general':
      return {
        comprobantesHabilitados: {
          ...base,
          factura:            true,
          notaCredito:        true,
          notaDebito:         true,
          liquidacionCompras: true,
          guiaRemision:       true,
        },
        reglasTributarias: {
          ...baseReglas,
          cobrarIVA:            true,
          tasaIVA:              15,
          declaraFormulario104: true,
          declaraFormulario103: true,
          declaraATS:           true,
          declaraFormulario101: true,
        },
      };

    // ── RIMPE Emprendedor ─────────────────────────────────────────────────
    // RUC, ventas anuales hasta $300,000. Cobra IVA 15%.
    // Puede emitir facturas Y notas de venta (a elección en cada transacción).
    // Declara Form 104 IVA, Form 103 si tiene empleados, NO Form 101 (declara RIMPE).
    case 'rimpe_emprendedor':
      return {
        comprobantesHabilitados: {
          ...base,
          factura:            true,
          notaVenta:          true,  // puede elegir según cliente
          notaCredito:        true,
          notaDebito:         true,
          liquidacionCompras: true,
          guiaRemision:       true,
        },
        reglasTributarias: {
          ...baseReglas,
          cobrarIVA:            true,
          tasaIVA:              15,
          declaraFormulario104: true,
          declaraFormulario103: true,
          declaraATS:           true,
          declaraRIMPE:         true,  // formulario RIMPE semestral en lugar de IR
        },
      };

    // ── RIMPE Negocio Popular (antes RISE) ─────────────────────────────────
    // RUC, ventas anuales hasta $20,000. NO cobra IVA.
    // Solo emite NOTAS DE VENTA, no facturas.
    // Paga cuota fija mensual al SRI según tabla de actividad.
    // NO declara formulario 104, NO presenta ATS.
    case 'rimpe_negocio_popular':
      return {
        comprobantesHabilitados: {
          ...base,
          notaVenta:    true,  // único comprobante válido
          guiaRemision: true,
        },
        reglasTributarias: {
          ...baseReglas,
          cobrarIVA:    false,
          tasaIVA:      0,
          declaraRIMPE: true,
          // No declara IVA, no ATS, no IR anual — cuota fija
        },
      };

    // ── RIMPE Artesano Calificado JNDA ──────────────────────────────────────
    // RUC, calificado por la Junta Nacional de Defensa del Artesano.
    // Emite facturas con TARIFA IVA 0% en sus servicios artesanales.
    // Declara Form 104 (con base 0%), declara Form 101 (IR anual).
    case 'rimpe_artesano':
      return {
        comprobantesHabilitados: {
          ...base,
          factura:     true,
          notaCredito: true,
          guiaRemision:true,
        },
        reglasTributarias: {
          ...baseReglas,
          cobrarIVA:             false,  // IVA 0% en sus bienes/servicios artesanales
          tasaIVA:               0,
          declaraFormulario104:  true,
          declaraFormulario101:  true,
          declaraATS:            true,
        },
      };

    // ── Exportador Habitual ───────────────────────────────────────────────
    // RUC, régimen general pero con devolución de IVA en exportaciones.
    // Emite facturas con tarifa 0% IVA para exportaciones (codDoc distinto).
    // Puede recuperar IVA pagado en compras como crédito tributario.
    case 'exportador_habitual':
      return {
        comprobantesHabilitados: {
          ...base,
          factura:            true,
          notaCredito:        true,
          notaDebito:         true,
          liquidacionCompras: true,
          guiaRemision:       true,
        },
        reglasTributarias: {
          ...baseReglas,
          cobrarIVA:            false,  // 0% en exportaciones
          tasaIVA:              0,
          declaraFormulario104: true,
          declaraFormulario103: true,
          declaraATS:           true,
          declaraFormulario101: true,
        },
      };

    // ── Contribuyente Especial ────────────────────────────────────────────
    // Grandes empresas designadas por el SRI.
    // Son agentes de retención del 100% de IVA cuando pagan.
    // Todos los comprobantes habilitados.
    case 'contribuyente_especial':
      return {
        comprobantesHabilitados: {
          ...base,
          factura:              true,
          notaVenta:            false,
          notaCredito:          true,
          notaDebito:           true,
          comprobanteRetencion: true,
          liquidacionCompras:   true,
          guiaRemision:         true,
        },
        reglasTributarias: {
          ...baseReglas,
          cobrarIVA:             true,
          tasaIVA:               15,
          esAgenteRetencion:     true,
          contribuyenteEspecial: true,
          obligadoContabilidad:  true,
          declaraFormulario104:  true,
          declaraFormulario103:  true,
          declaraATS:            true,
          declaraFormulario101:  true,
        },
      };
  }
}

export const REGIMEN_LABELS: Record<RegimenEmpresa, string> = {
  general:                 'Régimen General (RUC)',
  rimpe_emprendedor:       'RIMPE Emprendedor (hasta $300.000/año)',
  rimpe_negocio_popular:   'RIMPE Negocio Popular (hasta $20.000/año)',
  rimpe_artesano:          'Artesano Calificado JNDA',
  exportador_habitual:     'Exportador Habitual',
  contribuyente_especial:  'Contribuyente Especial',
};

export const REGIMEN_DESCRIPCION: Record<RegimenEmpresa, string> = {
  general:                'IVA 15% · Facturas · ATS mensual · Formulario 101 anual',
  rimpe_emprendedor:      'IVA 15% · Facturas o Notas de Venta · Declaración RIMPE semestral',
  rimpe_negocio_popular:  'Sin IVA · Solo Notas de Venta · Cuota fija mensual al SRI',
  rimpe_artesano:         'IVA 0% en artesanías · Facturas · Formulario 101 anual',
  exportador_habitual:    'IVA 0% en exportaciones · Devolución IVA · Facturas',
  contribuyente_especial: 'IVA 15% · Agente retención 100% IVA · Todos los comprobantes',
};

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function getConfigEmpresa(): Promise<ConfigEmpresa | null> {
  const snap = await getDoc(doc(db, COL, DOC_ID));
  return snap.exists() ? (snap.data() as ConfigEmpresa) : null;
}

export function subscribeToConfigEmpresa(
  callback: (data: ConfigEmpresa | null) => void
): () => void {
  return onSnapshot(doc(db, COL, DOC_ID), snap => {
    callback(snap.exists() ? (snap.data() as ConfigEmpresa) : null);
  });
}

export async function saveConfigEmpresa(
  data: Omit<ConfigEmpresa, 'comprobantesHabilitados' | 'reglasTributarias'> & {
    comprobantesHabilitados?: Partial<ComprobantesHabilitados>;
    reglasTributarias?:       Partial<ReglasTributarias>;
  }
): Promise<void> {
  // Calcular defaults del régimen y fusionar con lo que el admin sobreescribió
  const defaults = getDefaultsRegimen(data.regimen);
  const final: ConfigEmpresa = {
    ...data,
    comprobantesHabilitados: {
      ...defaults.comprobantesHabilitados,
      ...(data.comprobantesHabilitados ?? {}),
    },
    reglasTributarias: {
      ...defaults.reglasTributarias,
      ...(data.reglasTributarias ?? {}),
    },
    updatedAt: new Date(),
  };
  await setDoc(doc(db, COL, DOC_ID), final);
}
