'use client';

/**
 * Página de diagnóstico de firma SRI
 * Permite ver el XML firmado y detectar problemas ANTES de enviar al SRI
 */

import { useState } from 'react';
import { toast }    from 'sonner';
import { Bug, Copy, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import PageHeader   from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { getConfigSRI } from '@/lib/firebase/config-sri';
import { useAuth }  from '@/context/AuthContext';

interface Diagnostico {
  longitud:                    number;
  tieneDeclaracionXML:         boolean;
  tieneSignature:              boolean;
  tieneSignatureValue:         boolean;
  tieneCertificado:            boolean;
  tieneSignedProperties:       boolean;
  aparicionesSignedProperties: number;
  tieneQualifyingProperties:   boolean;
  tieneEtsi:                   boolean;
  tieneXades:                  boolean;
  issuerName:                  string;
  serialNumber:                string;
  signingTime:                 string;
  prefijosUsados:              string[];
  ordenReferences:             string[];
  tieneDataObjectFormat:       boolean;
  tieneKeyInfoReference:       boolean;
}

export default function DebugFirmaPage() {
  const { user } = useAuth();
  const [xml,         setXml]         = useState('');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [xmlFirmado,  setXmlFirmado]  = useState('');
  const [diag,        setDiag]        = useState<Diagnostico | null>(null);
  const [error,       setError]       = useState('');
  const [usarConfig,  setUsarConfig]  = useState(true);
  const [enviando,    setEnviando]    = useState(false);
  const [sri,         setSri]         = useState<any>(null);
  const [contexto,    setContexto]    = useState<any>(null);

  const diagnosticar = async () => {
    setLoading(true);
    setError('');
    setDiag(null);
    setXmlFirmado('');
    setSri(null);
    setContexto(null);
    try {
      // Obtener cert de la config SRI
      const config = await getConfigSRI();
      if (!config?.certificadoP12) {
        setError('No hay certificado .p12 configurado. Ve a Facturación → Configuración SRI.');
        return;
      }
      if (!password && usarConfig && !config.certificadoPassword) {
        setError('No hay contraseña del certificado configurada.');
        return;
      }

      const body = {
        xml:       xml || generarXMLPrueba(),
        p12Base64: config.certificadoP12,
        password:  password || config.certificadoPassword,
      };

      const res  = await fetch('/api/sri/debug', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }

      setXmlFirmado(data.xmlFirmado ?? '');

      // Diagnósticos adicionales sobre el XML firmado
      const xf = data.xmlFirmado ?? '';
      const issuerMatch  = xf.match(/<ds:X509IssuerName>([^<]+)<\/ds:X509IssuerName>/);
      const serialMatch  = xf.match(/<ds:X509SerialNumber>([^<]+)<\/ds:X509SerialNumber>/);
      const timeMatch    = xf.match(/<etsi:SigningTime>([^<]+)<\/etsi:SigningTime>/) ||
                           xf.match(/<xades:SigningTime>([^<]+)<\/xades:SigningTime>/);

      // Orden de References
      const refMatches = [...xf.matchAll(/URI="([^"]+)"/g)].map(m => m[1]);

      // Prefijos usados (etsi vs xades)
      const prefijos: string[] = [];
      if (xf.includes('etsi:'))  prefijos.push('etsi:');
      if (xf.includes('xades:')) prefijos.push('xades:');

      setDiag({
        ...data.diagnostico,
        tieneEtsi:            xf.includes('etsi:'),
        tieneXades:           xf.includes('xades:'),
        issuerName:           issuerMatch?.[1] ?? '(no encontrado)',
        serialNumber:         serialMatch?.[1] ?? '(no encontrado)',
        signingTime:          timeMatch?.[1]   ?? '(no encontrado)',
        prefijosUsados:       prefijos,
        ordenReferences:      refMatches,
        tieneDataObjectFormat: xf.includes('DataObjectFormat'),
        tieneKeyInfoReference: (xf.match(/ds:Reference/g) ?? []).length >= 3,
      });

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const enviarAlSri = async () => {
    setEnviando(true);
    setError('');
    setSri(null);
    setContexto(null);
    try {
      const config = await getConfigSRI();
      if (!config?.certificadoP12) {
        setError('No hay certificado .p12 configurado. Ve a Facturación → Configuración SRI.');
        return;
      }
      const body = {
        xml:       xml || generarXMLPrueba(),
        p12Base64: config.certificadoP12,
        password:  password || config.certificadoPassword,
        enviar:    true,
      };
      const res  = await fetch('/api/sri/debug', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setXmlFirmado(data.xmlFirmado ?? '');
      setSri(data.sri ?? null);
      setContexto(data.contexto ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success('Copiado al portapapeles');
  };

  const check = (ok: boolean, label: string, detalle?: string) => (
    <div className={`flex items-start gap-2 p-2 rounded text-xs ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
      {ok
        ? <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
        : <XCircle    className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />}
      <div>
        <span className={`font-medium ${ok ? 'text-green-800' : 'text-red-800'}`}>{label}</span>
        {detalle && <p className={`mt-0.5 ${ok ? 'text-green-600' : 'text-red-600'}`}>{detalle}</p>}
      </div>
    </div>
  );

  const warn = (label: string, detalle?: string) => (
    <div className="flex items-start gap-2 p-2 rounded text-xs bg-amber-50">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
      <div>
        <span className="font-medium text-amber-800">{label}</span>
        {detalle && <p className="mt-0.5 text-amber-600">{detalle}</p>}
      </div>
    </div>
  );

  if (!user || user.rol !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <Bug className="h-12 w-12 text-slate-200 mb-4" />
        <p className="text-slate-500 text-sm">Solo el administrador puede acceder a esta página.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Diagnóstico de Firma SRI"
        description="Verifica que la firma XAdES-BES se genere correctamente antes de enviar al SRI"
      />

      <div className="max-w-3xl space-y-5">

        {/* XML de entrada */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">XML a firmar</h3>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={usarConfig}
              onChange={e => setUsarConfig(e.target.checked)}
              id="usarConfig"
            />
            <label htmlFor="usarConfig">Usar certificado y contraseña de la configuración SRI</label>
          </div>
          {!usarConfig && (
            <div className="space-y-1.5">
              <Label className="text-xs">Contraseña del .p12</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Contraseña del certificado"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">
              XML del comprobante (dejar vacío para usar XML de prueba)
            </Label>
            <Textarea
              value={xml}
              onChange={e => setXml(e.target.value)}
              placeholder="Pega aquí el XML generado por el sistema, o deja vacío para usar un XML de prueba mínimo"
              className="font-mono text-xs h-32"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button onClick={diagnosticar} disabled={loading || enviando} variant="outline" className="w-full">
              <Bug className="h-4 w-4 mr-2" />
              {loading ? 'Analizando firma...' : 'Diagnosticar Firma (local)'}
            </Button>
            <Button onClick={enviarAlSri} disabled={loading || enviando} className="w-full">
              {enviando ? 'Consultando al SRI...' : 'Enviar al SRI y ver motivo exacto'}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            "Enviar al SRI" usa el ambiente y la clave de acceso del propio XML. Si el XML tiene
            <code className="mx-1 px-1 bg-slate-100 rounded">&lt;ambiente&gt;2&lt;/ambiente&gt;</code>
            se envía a PRODUCCIÓN; para pruebas debe ser 1.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-mono">
            {error}
          </div>
        )}

        {/* Respuesta REAL del SRI */}
        {sri && (
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="font-semibold text-slate-700">Respuesta del SRI</h3>

            {contexto && (
              <div className="bg-slate-50 rounded p-3 space-y-1 text-xs font-mono">
                <p><span className="text-slate-400">Enviado a: </span>{contexto.ambienteEnviado}</p>
                <p><span className="text-slate-400">Clave acceso: </span>{contexto.claveAccesoXML || '(no detectada)'}</p>
                <p>
                  <span className="text-slate-400">Certificados en X509Data: </span>
                  <span className={contexto.certificadosEnX509Data >= 2 ? 'text-green-700' : 'text-amber-600'}>
                    {contexto.certificadosEnX509Data}
                  </span>
                  {contexto.certificadosEnX509Data < 2 &&
                    <span className="text-amber-600"> (solo hoja — falta cadena CA, p. ej. UANATACA)</span>}
                </p>
              </div>
            )}

            {/* Recepción */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 uppercase">Recepción</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  sri.recepcion?.estado === 'RECIBIDA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>{sri.recepcion?.estado ?? '—'}</span>
              </div>
              {(sri.recepcion?.mensajes ?? []).map((m: string, i: number) => (
                <div key={i} className="text-xs font-mono bg-slate-50 rounded p-2 text-slate-700 break-words">{m}</div>
              ))}
            </div>

            {/* Autorización — aquí aparece el error 39 con su motivo */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 uppercase">Autorización</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  sri.autorizacion?.estado === 'AUTORIZADO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>{sri.autorizacion?.estado ?? '—'}</span>
              </div>
              {(sri.autorizacion?.mensajes ?? []).length === 0 && sri.autorizacion?.estado === 'AUTORIZADO' && (
                <div className="text-xs font-mono bg-green-50 rounded p-2 text-green-700">
                  Nº {sri.autorizacion?.numeroAutorizacion}
                </div>
              )}
              {(sri.autorizacion?.mensajes ?? []).map((m: string, i: number) => (
                <div key={i} className="text-xs font-mono bg-red-50 rounded p-2 text-red-700 break-words">{m}</div>
              ))}
            </div>
          </div>
        )}

        {/* Resultados del diagnóstico */}
        {diag && (
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="font-semibold text-slate-700">Checklist de la firma</h3>
            <div className="grid grid-cols-1 gap-2">
              {check(diag.tieneDeclaracionXML,       '<?xml ...?> presente al inicio')}
              {check(diag.tieneSignature,             'ds:Signature presente')}
              {check(diag.tieneSignatureValue,        'ds:SignatureValue presente')}
              {check(diag.tieneCertificado,           'ds:X509Certificate presente')}
              {check(diag.tieneSignedProperties,      'etsi:SignedProperties presente')}
              {check(diag.tieneQualifyingProperties,  'etsi:QualifyingProperties presente')}
              {check(diag.tieneDataObjectFormat,      'etsi:DataObjectFormat presente (requerido Anexo 14)')}
              {check(diag.tieneKeyInfoReference,      '3 References en SignedInfo (SP + KeyInfo + Doc)',
                `Se encontraron: ${diag.ordenReferences.length} references`)}
              {check(diag.tieneEtsi && !diag.tieneXades,
                'Prefijo etsi: (no xades:)',
                `Prefijos encontrados: ${diag.prefijosUsados.join(', ') || 'ninguno'}`)}
              {check(
                diag.aparicionesSignedProperties >= 2,
                'SignedProperties aparece ≥2 veces (Id= + referencia)',
                `Apariciones: ${diag.aparicionesSignedProperties}`
              )}
            </div>

            {/* Datos del certificado */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase">Datos del certificado</p>
              <div className="bg-slate-50 rounded p-3 space-y-1 text-xs font-mono">
                <p><span className="text-slate-400">Issuer: </span>
                  <span className={diag.issuerName.includes('=') ? 'text-green-700' : 'text-red-600'}>
                    {diag.issuerName}
                  </span>
                </p>
                <p><span className="text-slate-400">Serial: </span>{diag.serialNumber}</p>
                <p><span className="text-slate-400">SigningTime: </span>{diag.signingTime}</p>
              </div>
              {!diag.issuerName.includes('=') && warn(
                'Issuer inválido',
                'Debe tener formato: CN=...,O=...,C=EC'
              )}
            </div>

            {/* Orden de References */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase">Orden de References (debe ser: SP → KeyInfo → #comprobante)</p>
              <div className="bg-slate-50 rounded p-3 space-y-1 text-xs font-mono">
                {diag.ordenReferences.map((r, i) => (
                  <p key={i}>
                    <span className="text-slate-400">{i+1}. </span>
                    <span className={
                      (i === 0 && r.includes('SignedProp')) ? 'text-green-700' :
                      (i === 1 && r.includes('Certificate')) ? 'text-green-700' :
                      (i === 2 && r === '#comprobante') ? 'text-green-700' :
                      'text-amber-600'
                    }>{r}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* XML firmado */}
        {xmlFirmado && (
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 text-sm">XML Firmado</h3>
              <Button variant="outline" size="sm" onClick={() => copiar(xmlFirmado)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
              </Button>
            </div>
            <textarea
              readOnly
              className="w-full h-64 text-xs font-mono bg-slate-900 text-green-400 p-3 rounded border-0 resize-y"
              value={xmlFirmado}
            />
            <p className="text-xs text-slate-400">
              Longitud: {xmlFirmado.length.toLocaleString()} caracteres.
              Puedes copiar este XML y validarlo en{' '}
              <a href="https://www.soapui.org" target="_blank" rel="noreferrer" className="underline">SoapUI</a>
              {' '}o pegarlo directamente al WS del SRI.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

// XML mínimo de prueba para el BCE Ecuador (ambiente pruebas)
function generarXMLPrueba(): string {
  const hoy = new Date();
  const dd   = String(hoy.getDate()).padStart(2, '0');
  const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
  const yyyy = hoy.getFullYear();
  return `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>1</ambiente><tipoEmision>1</tipoEmision><razonSocial>EMPRESA PRUEBA</razonSocial><ruc>9999999999999</ruc><claveAcceso>0101${yyyy.toString().slice(2)}019999999999990110010010000000011234567815</claveAcceso><codDoc>01</codDoc><estab>001</estab><ptoEmi>001</ptoEmi><secuencial>000000001</secuencial><dirMatriz>DIRECCION PRUEBA</dirMatriz></infoTributaria><infoFactura><fechaEmision>${dd}/${mm}/${yyyy}</fechaEmision><obligadoContabilidad>NO</obligadoContabilidad><tipoIdentificacionComprador>07</tipoIdentificacionComprador><razonSocialComprador>CONSUMIDOR FINAL</razonSocialComprador><identificacionComprador>9999999999999</identificacionComprador><totalSinImpuestos>1.00</totalSinImpuestos><totalDescuento>0.00</totalDescuento><totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>1.00</baseImponible><valor>0.15</valor></totalImpuesto></totalConImpuestos><propina>0.00</propina><importeTotal>1.15</importeTotal><moneda>DOLAR</moneda><pagos><pago><formaPago>01</formaPago><total>1.15</total><plazo>0</plazo><unidadTiempo>dias</unidadTiempo></pago></pagos></infoFactura><detalles><detalle><codigoPrincipal>001</codigoPrincipal><descripcion>PRODUCTO PRUEBA</descripcion><cantidad>1.000000</cantidad><precioUnitario>1.000000</precioUnitario><descuento>0.00</descuento><precioTotalSinImpuesto>1.00</precioTotalSinImpuesto><impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><tarifa>15</tarifa><baseImponible>1.00</baseImponible><valor>0.15</valor></impuesto></impuestos></detalle></detalles></factura>`;
}
