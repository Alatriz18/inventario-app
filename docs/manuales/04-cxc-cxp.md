# Manual de Cuentas por Cobrar y Cuentas por Pagar

## ¿Qué hace este módulo?

Este módulo controla el dinero que **nos deben los clientes** (Cuentas por Cobrar, CxC) y el dinero que **le debemos a los proveedores** (Cuentas por Pagar, CxP).

- Las **CxC** se generan automáticamente cuando en el POS o en el Historial de Ventas se registra una venta pagada a crédito. También se pueden crear manualmente desde el módulo.
- Las **CxP** se alimentan de facturas de proveedores, que se pueden cargar de forma manual, importando el XML del SRI (uno por uno o en lote), o buscándolas directamente en el correo electrónico configurado.
- Cada cobro o pago registrado genera automáticamente su asiento contable correspondiente (motor de asientos), por lo que no es necesario contabilizar nada a mano.

El módulo tiene seis pantallas, accesibles desde el menú lateral:

**Cuentas por Cobrar**
1. Saldos y Cobros (`/cuentas-por-cobrar`)
2. Cartera — Facturas Emitidas (`/cuentas-por-cobrar/cartera`)
3. Reporte de Cobros (`/cuentas-por-cobrar/reportes`)

**Cuentas por Pagar**
4. Facturas de Proveedores (`/cuentas-por-pagar/facturas`)
5. Documentos Recibidos — NC/ND (`/cuentas-por-pagar/documentos-recibidos`)
6. Pagos Pendientes (`/cuentas-por-pagar/pagos`)

---

## Cuentas por Cobrar (CxC)

### Saldos y Cobros — para qué sirve, cómo registrar un cobro

Es la pantalla principal de CxC (`/cuentas-por-cobrar`). Muestra:

- **KPIs**: Saldo total pendiente, Facturas pendientes, Facturas vencidas, Cobradas este mes.
- **Aging de saldos (días vencidos)**: cinco columnas — Corriente, 1-30 días, 31-60 días, 61-90 días, > 90 días — calculadas sobre la fecha de vencimiento de cada CxC activa (no pagada ni anulada). Esta tabla de aging sí está implementada en esta pantalla.
- **Tabla de cuentas por cobrar** con pestañas: Pendientes, Vencidas, Cobradas, Todas. Cada fila muestra cliente, identificación, fecha de emisión, fecha de vencimiento, total, saldo, estado (`pendiente`, `parcial`, `pagada`, `vencida`) y los días de atraso o restantes. Las CxC en estado `anulada` nunca se muestran en esta tabla.
- Botón **Buscar cliente...** para filtrar por nombre o cédula/RUC.
- Botón **Exportar** para descargar la lista filtrada en Excel.

**Crear una CxC manual**
Botón **Nueva CxC** abre un diálogo donde se busca al cliente (por nombre o cédula/RUC), se ingresa el **Monto ($)**, los **Días de crédito** y opcionalmente una **Descripción / Referencia** (por ejemplo el número de factura). Al guardar, la fecha de vencimiento se calcula sumando los días de crédito a la fecha actual.

**Registrar un cobro**
En cualquier fila con estado distinto de `pagada` aparece el botón **Cobrar**, que abre el diálogo "Registrar cobro" con:
- Saldo pendiente (informativo, no editable).
- **Monto a cobrar** (por defecto el saldo total; no puede superar el saldo pendiente).
- **Método de pago**: Papeleta de depósito, Cheque, Transferencia, Tarjeta.
- **Referencia / N° cheque** (opcional).
- **Ret. Fuente recibida ($)** y **Ret. IVA recibida ($)**, para registrar retenciones que el cliente nos haya practicado al pagar.

Al confirmar, el sistema registra el cobro sobre la CxC (actualiza el saldo pendiente y el estado) y crea automáticamente el asiento contable de cobro.

### Cartera (Facturas) — qué muestra, cómo se relaciona con las ventas a crédito

Pantalla `/cuentas-por-cobrar/cartera` ("Cartera — Facturas Emitidas"). Lista **todas** las facturas y notas de venta emitidas (comprobantes tipo `factura` o `nota_venta`), tanto de contado como de crédito, cruzando cada comprobante con su CxC asociada (por `ventaId`):

- Si el comprobante **tiene una CxC asociada**, la fila muestra tipo "Crédito", el monto ya cobrado (total − saldo pendiente), el saldo, el estado de la CxC y la fecha de vencimiento.
- Si el comprobante **no tiene CxC** (venta de contado), se muestra tipo "Contado" con saldo $0 y estado "Cobrada" (se asume cobrada al momento de la venta).
- Si el comprobante está **anulado**, la fila se marca con estado "Anulada" y aparece atenuada.

Incluye 4 tarjetas de resumen (Total facturado, Cobrado, Por cobrar, Vencido), filtro por estado (Todas, Cobradas, Pendientes, Parciales, Vencidas, Anuladas), buscador por cliente o número de comprobante, y exportación a Excel.

Esta es la pantalla ideal para ver, factura por factura, qué ventas a crédito quedaron pendientes de cobro y cuáles ya se saldaron.

### Reporte de Cobros — para qué sirve

Pantalla `/cuentas-por-cobrar/reportes`. Analiza únicamente los **cobros ya registrados** (no las CxC pendientes) dentro de un rango de fechas, con presets rápidos: Hoy, 7 días, Este mes, Este año, Todo (o un rango personalizado con Desde/Hasta). Los cobros de CxC anuladas se excluyen del reporte.

Incluye:
- KPIs: Total Cobrado, Nº de Cobros, Promedio, Clientes (únicos).
- Gráfico de barras: cobros por día.
- Gráfico de pastel: cobros por método de pago (Efectivo, Tarjeta, Transferencia, Depósito, Cheque, Crédito).
- Tabla de detalle con fecha, cliente, identificación, método, referencia, usuario que registró el cobro y monto.
- Exportación a Excel.

### Nota sobre aging / vencimientos

El aging de saldos (Corriente / 1-30 / 31-60 / 61-90 / >90 días) **sí existe** y se calcula en tiempo real dentro de la pantalla "Saldos y Cobros" descrita arriba. Lo que **no existe todavía** en el sistema es un módulo completo de CxC con cobros parciales avanzados, retenciones recibidas asociadas automáticamente a la CxC, o un reporte de aging independiente — el `CLAUDE.md` del proyecto lo lista como pendiente ("Módulo CxC completo"), aunque en la práctica ya hay una versión funcional básica (saldos, cobros, aging simple y reportes) como se documenta aquí.

---

## Cuentas por Pagar (CxP)

### Facturas de Proveedores — cómo cargar una factura (manual o por XML del SRI)

Pantalla `/cuentas-por-pagar/facturas`. Es el centro de control de CxP, con estas acciones en la cabecera:

- **Importar XML**: sube un solo archivo `.xml` de una factura del SRI. El sistema lo parsea, muestra un diálogo de confirmación con emisor, RUC, número, fecha, subtotal, IVA y total, y advierte si el proveedor (por RUC) todavía no está registrado (la factura se importa igual, sin asociar proveedor). Al confirmar, crea (o reutiliza) el proveedor por RUC, registra la factura y genera automáticamente el asiento contable de compra.
- **Importar varios XML**: igual que el anterior pero en lote (selección múltiple de archivos), pensado para los XML descargados del portal del SRI. Al terminar muestra un resumen: importadas, duplicadas (por clave de acceso repetida) y con error.
- **Importar TXT (Recibidos SRI)**: carga el archivo `.txt` (separado por tabulaciones) que el SRI genera desde el portal "Comprobantes Recibidos" — un reporte con muchas facturas a la vez, sin necesidad de tener cada XML por separado. Antes de importar muestra un diálogo con: total de filas leídas, cuántas se van a importar, cuántas ya están registradas (duplicadas por clave de acceso) y cuántos proveedores nuevos se crearán automáticamente (por RUC, igual que la importación XML). Solo procesa filas de tipo "Factura"; las de nota de crédito/débito o retención quedan marcadas como "no soportadas" y hay que cargarlas por XML en su sección correspondiente. Cada fila importada genera también su asiento contable de compra.
- **Buscar en mi correo**: si está configurado el correo en Configuración → Correo, revisa los últimos 30 días vía IMAP y procesa automáticamente los XML de facturas que encuentre adjuntos.
- **Descargar todos (ZIP)**: exporta en un `.zip` todos los XML de comprobantes recibidos que se hayan guardado al importar.
- **Pago bancario (TXT)**: ver más abajo.
- **Nueva Factura**: registro 100% manual.

Al importar por XML, el mismo flujo también reconoce y procesa automáticamente:
- **Notas de crédito recibidas** → se guardan en Documentos Recibidos y generan el asiento de reversa de compra.
- **Notas de débito recibidas** → se guardan en Documentos Recibidos y aumentan la CxP con su asiento correspondiente.
- **Retenciones recibidas** (cuando un cliente nos retuvo) → se guardan y generan su asiento de retención recibida.
- Cualquier otro tipo de comprobante (p. ej. liquidaciones) se omite y se reporta como "omitido".
- Las claves de acceso duplicadas se detectan y no se vuelven a importar.

**Registrar una factura manual**
Diálogo "Registrar Factura de Proveedor" con: Proveedor (obligatorio), Número de factura, Clave de acceso SRI (opcional, 49 dígitos), Fecha de emisión, Fecha de vencimiento (opcional), Base imponible 15%, Base imponible 0%, IVA 15% (se calcula automáticamente al 15% de la base) y Total (se recalcula automáticamente pero es editable). Notas libres opcionales.

**Registrar un pago**
El ícono de tarjeta en cada fila (facturas no pagadas ni anuladas) abre "Registrar Pago": muestra proveedor, número de factura, total y saldo pendiente; se ingresa el **Monto a pagar** (no puede superar el saldo), **Método de pago** (Efectivo, Transferencia, Tarjeta) y una **Referencia / Número de transacción** opcional. Al confirmar se registra el pago (actualiza saldo y estado) y se crea el asiento contable de egreso.

**Pago bancario por archivo TXT**
Botón "Pago bancario (TXT)" abre un diálogo para seleccionar varias facturas pendientes a la vez, elegir el banco (de una lista de bancos ecuatorianos soportados) y, al confirmar, el sistema:
1. Registra el pago de cada factura seleccionada (por su saldo total).
2. Genera el asiento contable de egreso (CxP / Bancos) de cada una.
3. Descarga un archivo `.txt` listo para cargar en la banca electrónica, con los datos bancarios de cada proveedor (RUC/cédula, banco, tipo y número de cuenta, valor, referencia y correo). Si un proveedor no tiene los datos bancarios completos, se marca con advertencia "⚠ faltan" en la lista y se contabiliza aparte en el resumen final.

**Anular una factura**
El ícono de "Anular factura" (prohibido) permite anular una factura de proveedor **solo si no tiene pagos registrados**. Al anular, se intenta revertir el asiento contable original (buscando primero por `factura_proveedor` y, si no existe, por el `entradaId` asociado si la factura vino de una entrada de inventario), y la factura queda con estado `anulada` y saldo pendiente en $0.

**Ver detalle**
El ícono de flecha abre el detalle completo: datos del proveedor, clave de acceso (si tiene), desglose de base 15% / base 0% / IVA / total / saldo pendiente, e historial de todos los pagos registrados sobre esa factura.

### Documentos Recibidos — para qué sirve

Pantalla `/cuentas-por-pagar/documentos-recibidos`. Lista únicamente las **notas de crédito y notas de débito de proveedores** que fueron importadas por XML (no se pueden crear manualmente desde aquí — el mensaje de la pantalla vacía indica "Impórtalas en Facturas de Proveedores"). Cada fila muestra tipo (Nota de crédito / Nota de débito), proveedor, número, documento modificado (la factura original a la que corresponde), fecha, subtotal, IVA y total. Se puede filtrar por proveedor, RUC o número. Estos documentos ya quedan contabilizados automáticamente al momento de importarse (ver sección anterior).

### Pagos Pendientes — cómo registrar un pago a proveedor

Pantalla `/cuentas-por-pagar/pagos`. Es una vista de **solo lectura y priorización** (no permite registrar pagos directamente desde aquí): lista todas las facturas de proveedores con estado distinto de `pagada`, ordenadas primero por vencidas y luego por fecha de vencimiento. Muestra:

- Alerta roja si hay facturas vencidas, con el total vencido.
- Alerta ámbar si hay facturas que vencen en los próximos 7 días, con el total próximo a vencer.
- KPIs: Total pendiente, número de Facturas, Vencidas.
- Tabla con proveedor, factura, vencimiento (con "Vencida hace N días" / "Vence hoy" / "N días"), total, saldo y una etiqueta de urgencia: **Vencida** (rojo), **Urgente** (0-3 días, ámbar), **Esta semana** (4-7 días, azul) o **Normal**.
- Botón **Ir a Facturas**, que lleva a `/cuentas-por-pagar/facturas` donde sí se puede registrar el pago (ver sección anterior).

---

## Preguntas frecuentes / Tips

**¿Cómo se genera una CxC desde una venta?**
No hace falta crearla manualmente: al registrar una venta a crédito desde el POS o el Historial de Ventas, el sistema crea automáticamente la CxC asociada mediante el `ventaId`. Esa relación es la que usa la pantalla de Cartera para saber si una factura es "Contado" o "Crédito" y para calcular su saldo cobrado/pendiente.

**¿Qué pasa si anulo una venta que tiene una CxC generada?**
La pantalla de Cartera detecta el comprobante anulado (`estado === 'anulado'`) y lo muestra como fila "Anulada" con saldo $0, sin importar el estado de la CxC. En la pantalla de Saldos y Cobros, las CxC con estado `anulada` nunca se listan (se filtran siempre), aunque sigan existiendo en la base de datos.

**¿Puedo cobrar o pagar más del saldo pendiente?**
No. Tanto en el diálogo de "Registrar cobro" (CxC) como en "Registrar Pago" y "Pago bancario" (CxP), el sistema valida que el monto ingresado no supere el saldo pendiente de la factura y muestra un error si se intenta.

**¿Las retenciones que me hacen los clientes o que le hago yo a mis proveedores se registran aquí?**
Al registrar un cobro de CxC se pueden indicar Ret. Fuente y Ret. IVA recibidas del cliente. Del lado de CxP, cuando se importa un XML de tipo "retención" (un cliente nos retuvo y nos envía el comprobante), se guarda como retención recibida y genera su propio asiento — recuerda que en Ecuador el comprobante de retención debe emitirse dentro de un plazo máximo de 5 días hábiles desde la recepción de la factura del proveedor.

**¿Cómo evito importar la misma factura de proveedor dos veces?**
El sistema usa la **clave de acceso** (49 dígitos) del XML del SRI como identificador único. Si ya existe una factura, nota de crédito, nota de débito o retención con esa misma clave, la importación (individual, en lote o desde el correo) la marca como duplicada y no la vuelve a registrar.

**¿Por qué no veo el botón para registrar un pago en "Pagos Pendientes"?**
Esa pantalla es solo un tablero de priorización por urgencia (vencidas, próximas a vencer, normales). Para registrar el pago hay que ir a **Facturas de Proveedores** (botón "Ir a Facturas" o el menú lateral) y usar el ícono de tarjeta de crédito en la fila correspondiente, o el flujo de "Pago bancario (TXT)" si se quiere pagar varias a la vez.
