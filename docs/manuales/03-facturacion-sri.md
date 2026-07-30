# Manual de Facturación Electrónica SRI

## ¿Qué hace este módulo?

El módulo de Facturación conecta las ventas del sistema con el SRI (Servicio de Rentas Internas del Ecuador) para emitir comprobantes electrónicos con validez tributaria. El flujo general es siempre el mismo:

1. **Configurar** los datos del emisor y el certificado digital (una sola vez, en *Facturación → Configuración*).
2. **Emitir** un comprobante a partir de una venta ya completada (*Facturación → Emitir*).
3. El sistema genera el XML del comprobante, lo **firma** digitalmente (XAdES-BES) con el certificado `.p12`, lo **envía** al webservice del SRI y luego **consulta la autorización**.
4. Una vez autorizado, el comprobante queda disponible en el listado (*Facturación → Comprobantes*), desde donde se puede generar el **RIDE** (representación impresa en PDF), reenviar por correo o anular.
5. Si una factura ya autorizada necesita corregirse, se usan **Notas de Crédito** (anulación total/parcial) o **Notas de Débito** (cargos adicionales).

Solo la **Factura Electrónica** y las **Notas de Crédito/Débito** pasan por firma y envío al SRI. La **Nota de Venta** es un comprobante manual/interno (usado en RIMPE Negocio Popular) que no requiere autorización electrónica: se registra directamente como "autorizado" y solo se imprime un recibo.

---

## Configuración SRI (hacer esto primero)

Página: **Facturación → Configuración** (`app/(dashboard)/facturacion/configuracion`).

### Qué datos hay que cargar

**Datos del Emisor**
- RUC (13 dígitos, obligatorio)
- Razón Social (obligatorio)
- Nombre Comercial (opcional)
- Obligado a llevar contabilidad (Sí/No)
- Dirección Matriz (obligatorio)

**Establecimiento y Ambiente**
- Establecimiento (3 dígitos, ej. `001`)
- Punto de Emisión (3 dígitos, ej. `001`)
- Ambiente SRI: **Pruebas (Certificación)** o **Producción**

**Certificado Digital (.p12)**
- Subir el archivo `.p12`/`.pfx` emitido por el Banco Central del Ecuador (BCE) o una entidad autorizada.
- Ingresar la contraseña del certificado.
- Botón **Verificar Firma Digital**: llama a `/api/sri/test-firma` y muestra titular, organización, emisor, fecha de validez y días restantes. Si el certificado está vencido, lo marca en rojo ("VENCIDO — no puede firmar comprobantes"); si vence pronto, en ámbar.
- El certificado y su contraseña se guardan en Firestore (`config_sri`) y se usan para firmar cada comprobante.

**Contribuyente Especial** (campo opcional, número de resolución si aplica).

**Secuenciales por tipo de comprobante**
Campos numéricos que indican el **próximo número** a asignar: Factura, Nota de venta, Nota de crédito, Nota de débito, Retención, Liquidación de compra, Guía de remisión. Sirven para sincronizar manualmente el sistema con la numeración real usada en el SRI (por ejemplo si antes se facturaba desde otro sistema). Cada emisión incrementa el secuencial correspondiente automáticamente.

Botón final: **Guardar Configuración**.

### Ambiente de pruebas vs producción

- **Ambiente 1 (Pruebas / Certificación)** → apunta a `celcer.sri.gob.ec`. Úsalo mientras validas que los comprobantes se autoricen correctamente.
- **Ambiente 2 (Producción)** → apunta a `cel.sri.gob.ec`. Los comprobantes emitidos aquí tienen validez tributaria real.
- La propia pantalla de configuración lo advierte: *"Inicia siempre en ambiente de Pruebas hasta validar todos los comprobantes con el SRI antes de pasar a Producción."*
- El ambiente elegido queda embebido en la clave de acceso de 49 dígitos de cada comprobante, así que un cambio de ambiente no afecta comprobantes ya emitidos.

---

## Emitir Comprobante

Página: **Facturación → Emitir** (`app/(dashboard)/facturacion/emitir`).

### Para qué sirve

Convierte una venta ya completada (registrada en el POS/historial de ventas) en un comprobante electrónico (Factura) o en un comprobante manual (Nota de Venta).

### Cómo emitir una factura/nota de venta paso a paso

1. **Selecciona la venta a facturar.** El listado muestra las 15 ventas completadas más recientes; si la venta es más antigua, usa el filtro de fecha (**Desde / Hasta**) para buscarla. Las ventas que ya tienen comprobante aparecen deshabilitadas con la marca "✅ Ya autorizada".
2. **Elige el tipo de comprobante:**
   - **Factura Electrónica** — con desglose de IVA, para clientes con RUC/cédula.
   - **Nota de Venta** — sin IVA separado, pensada para RIMPE Negocio Popular / Emprendedor.
   
   Solo se muestran los tipos habilitados según el régimen tributario configurado en *Configuración de Empresa*. Si el régimen no permite ninguno de los dos, se muestra una advertencia para revisar esa configuración.
3. Revisa el **Resumen** (cliente, identificación, cantidad de ítems, total).
4. Presiona **Emitir Factura** / **Emitir Nota de Venta**.

### Qué pasa después de emitir

**Si es Nota de Venta:** se guarda directamente con estado `autorizado` (mensaje interno: *"Emitida manualmente — la Nota de Venta no requiere autorización electrónica del SRI"*), se vincula a la venta y se abre automáticamente un **recibo** imprimible/descargable (no un RIDE del SRI).

**Si es Factura:**
1. Se obtiene el secuencial y se genera la clave de acceso (49 dígitos).
2. Se calcula el desglose: como los precios del catálogo ya incluyen IVA, el sistema extrae la base imponible dividiendo entre 1.15 (IVA 15% vigente desde abril 2024).
3. Se genera el XML de la factura.
4. Se crea el registro del comprobante en Firestore con estado `pendiente`.
5. Se envía a `POST /api/sri/procesar`, que internamente:
   - **Firma** el XML con el certificado `.p12` (XAdES-BES).
   - **Envía** el XML firmado al webservice de recepción del SRI.
   - **Consulta la autorización** (si no llega autorizado a la primera consulta, espera 4 segundos y reintenta una vez).
6. Según el resultado:
   - **AUTORIZADO** → el comprobante se marca `autorizado`, se guarda el número de autorización, fecha, XML firmado y XML autorizado; se vincula a la venta.
   - **DEVUELTA / ERROR** → el comprobante se marca `rechazado` y se muestran los mensajes de error exactos que devolvió el SRI.

### Errores comunes

La pantalla identifica en qué **etapa** ocurrió el error (mostrado como `[ETAPA] mensaje`):
- `validacion` — falta XML, falta certificado, falta contraseña, falta clave de acceso, o la clave de acceso no tiene 49 dígitos.
- `firma` — error al firmar el XML (certificado inválido, contraseña incorrecta, certificado vencido).
- `recepcion` — el SRI devolvió el comprobante al enviarlo (errores de validación del XML).
- `autorizacion` — el comprobante fue recibido pero no se autorizó (DEVUELTA/ERROR), o la consulta demoró más de lo esperado.
- `interno` — error inesperado del servidor.

Herramientas de diagnóstico disponibles en la misma pantalla:
- **Diagnosticar Firma** (solo para Factura) — llama a `/api/sri/debug-xml` y muestra: datos del certificado (CN, OU, serialNumber, RUC en certificado, fecha de vencimiento), si el RUC del certificado coincide con el RUC del XML, si el XML tiene el `id="comprobante"` requerido, y si la firma XML (`ds:Signature`) se generó correctamente. Útil cuando la emisión falla en la etapa de firma.
- **Descargar XML** — genera y descarga el XML sin enviarlo al SRI, para revisión manual.
- Cuando hay error de firma, se puede expandir **"Ver XML firmado (diagnóstico)"** para inspeccionar el XML tal como se firmó.

---

## Comprobantes (listado)

Página: **Facturación → Comprobantes** (`app/(dashboard)/facturacion/comprobantes`).

### Para qué sirve

Es el historial de todos los comprobantes emitidos (facturas, notas de venta, notas de crédito/débito, retenciones, liquidaciones, guías), con contadores de **Autorizados**, **Pendientes** y **Rechazados** en la parte superior.

Se puede filtrar por texto (cliente, clave de acceso o número de autorización) y por estado (Todos / Autorizados / Pendientes / Rechazados / Anulados).

### Cómo consultar/reimprimir/descargar el RIDE

Acciones disponibles por fila (icono de acción):
- **Consultar autorización SRI** (solo si está `pendiente` o `enviado`) — reconsulta el estado en el SRI usando la clave de acceso; si ya se autorizó, actualiza el registro.
- **Ver RIDE en nueva pestaña** — abre el PDF del RIDE (representación impresa del comprobante) sin descargarlo.
- **Descargar RIDE PDF** — descarga el mismo PDF.
- **Descargar XML autorizado** (solo si está `autorizado`) — descarga el XML tal como fue autorizado por el SRI.
- **Enviar por correo** (solo si está `autorizado`) — pide el correo del destinatario y envía el comprobante.
- **Anular comprobante** (si no está ya `anulado`) — pide confirmación; si el comprobante está vinculado a una venta, revierte el stock de esa venta (`anularVenta`) y reversa su asiento contable (`crearAsientoReversion`); luego marca el comprobante como `anulado`.

El RIDE es generado por `lib/sri/ride-pdf.ts` y soporta: Factura, Nota de venta, Nota de crédito, Nota de débito, Comprobante de retención y Recibo interno (sin validez tributaria, usado para la Nota de Venta).

---

## Notas de Crédito

Página: **Facturación → Notas de Crédito** (`app/(dashboard)/facturacion/notas-credito`).

### Para qué sirve

Anula total o parcialmente una **Factura Electrónica ya autorizada** (devoluciones, descuentos posteriores, errores de facturación, anulaciones). Solo se pueden seleccionar como origen facturas con estado `autorizado`.

### Cómo emitir una

1. Botón **Nueva Nota de Crédito**.
2. Selecciona la **Factura origen (autorizada)** — al elegirla se muestran cliente, identificación y total, y se cargan automáticamente los ítems de la venta original.
3. Elige el **Motivo**: Devolución de mercadería, Descuento comercial, Error en facturación o Anulación de factura.
4. Escribe la **Descripción** del motivo (obligatoria).
5. Ajusta la **cantidad a acreditar** por cada ítem (no puede superar la cantidad original de la venta); el subtotal y el IVA se recalculan en vivo.
6. Verifica los totales (Subtotal sin IVA / IVA 15% / Total NC). El total no puede ser $0.00.
7. **Emitir y enviar al SRI** — genera la clave de acceso (tipo de documento `04`), arma el XML de nota de crédito referenciando la factura origen, y lo envía por el mismo flujo firma → envío → autorización de `/api/sri/procesar`.

Según la respuesta del SRI la NC queda `autorizada`, `rechazada` o `pendiente`. Al autorizarse se genera automáticamente su asiento contable (`crearAsientoNotaCredito`), en segundo plano.

Desde el listado (fila expandible) se puede **descargar el RIDE (PDF)** de la nota de crédito y **anular** una NC ya emitida (revierte su asiento contable con `crearAsientoReversion`).

---

## Notas de Débito

Página: **Facturación → Notas de Débito** (`app/(dashboard)/facturacion/notas-debito`).

### Para qué sirve

Registra cargos adicionales sobre una **Factura Electrónica ya autorizada** (por ejemplo intereses por mora u otros valores no incluidos en la factura original). Al igual que las NC, solo permite elegir como origen facturas `autorizado`.

### Cómo emitir una

1. Botón **Nueva Nota de Débito**.
2. Selecciona el **Comprobante origen** (factura autorizada).
3. Agrega una o más **Razones del cargo**, cada una con Descripción y Valor (botón **+ Agregar** para sumar líneas, ícono de basura para quitarlas).
4. El sistema calcula automáticamente el IVA 15% sobre la suma de las razones y muestra: Subtotal + IVA 15% = Total.
5. **Emitir y enviar al SRI** — genera la clave de acceso (tipo de documento `05`), arma el XML referenciando la factura origen y sigue el mismo flujo firma → envío → autorización.

Queda `autorizada`, `rechazada` o `pendiente` según la respuesta del SRI, y genera su asiento contable automáticamente (`crearAsientoNotaDebito`) en segundo plano.

Desde el listado se puede **descargar el RIDE** y **anular** una nota de débito (revierte su asiento).

---

## Preguntas frecuentes / Tips

**¿Por qué no puedo emitir factura, solo nota de venta (o viceversa)?**
Porque el régimen tributario configurado en *Configuración de Empresa* controla qué tipos de comprobante están habilitados. Por ejemplo, RIMPE Negocio Popular solo habilita Nota de Venta, sin IVA. Revisa/ajusta el régimen en Configuración → Empresa.

**"No hay certificado digital configurado" al emitir una factura.**
Ve a Facturación → Configuración y sube el archivo `.p12`. Las Notas de Venta no necesitan certificado porque no se firman ni se envían al SRI.

**El certificado sale como "VENCIDO" al verificar.**
Usa el botón **Verificar Firma Digital** en Configuración SRI para confirmar la fecha de vencimiento; un certificado vencido no puede firmar comprobantes y hay que renovarlo con el BCE o la entidad certificadora.

**Emití en Pruebas por error / necesito pasar a Producción.**
Cambia el campo **Ambiente SRI** en Configuración a "Producción" antes de emitir. Los comprobantes ya emitidos en ambiente 1 no tienen validez tributaria real y deben re-emitirse en ambiente 2 una vez confirmado que todo funciona bien.

**El SRI "devolvió" el comprobante (estado DEVUELTA/ERROR).**
Revisa los mensajes exactos que se muestran en pantalla (vienen tal cual los entrega el SRI). Las causas más comunes son datos del RUC/razón social que no coinciden con el certificado, o desfases de secuencial (ajústalo en Configuración → Secuenciales).

**Error en la etapa "firma".**
Usa el botón **Diagnosticar Firma** en Emitir Comprobante: compara el RUC del certificado contra el RUC del XML, confirma si el `id="comprobante"` está presente y si la firma `ds:Signature` se generó. Normalmente indica contraseña incorrecta o certificado corrupto/vencido.

**¿Puedo anular una venta ya facturada?**
Sí, desde Comprobantes → botón Anular: repone el stock de la venta, reversa el asiento contable, y marca el comprobante como `anulado`. Para corregir montos de una factura ya autorizada sin anular la venta completa, usa una Nota de Crédito (a favor del cliente) o una Nota de Débito (cargo adicional) en su lugar.

**IVA aplicado.**
El sistema usa 15% de IVA (vigente desde abril 2024) tanto para calcular la base imponible de facturas como para las notas de crédito/débito.
