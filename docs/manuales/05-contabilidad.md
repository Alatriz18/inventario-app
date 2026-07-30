# Manual de Contabilidad

## ¿Qué hace este módulo?

El módulo de Contabilidad lleva el registro contable formal del negocio bajo normas ecuatorianas NEC/NIIF, en paralelo a las operaciones diarias de inventario, ventas y compras. La mayor parte de los asientos **no se digitan a mano**: el sistema los genera automáticamente cada vez que se registra una venta, una compra, un pago a proveedor o un cobro a cliente, usando un motor de asientos (`lib/contabilidad/motor-asientos.ts`) que traduce cada operación en líneas de Debe/Haber según el Plan de Cuentas configurado.

El módulo incluye:

- **Plan de Cuentas** — catálogo de cuentas contables.
- **Centros de Costo** — clasificación opcional de gastos/ingresos por área.
- **Configuración Contable** — mapeo de qué cuenta usar para cada tipo de operación.
- **Asientos Contables** — listado de todos los asientos (automáticos y manuales), con edición controlada.
- **Libro Diario** y **Libro Mayor** — reportes cronológicos y por cuenta.
- **Balance de Comprobación**, **Balance General** y **Estado de Resultados** — reportes financieros calculados en tiempo real a partir de los asientos.
- **Períodos Contables** — apertura, cierre y bloqueo mensual.

Para que el módulo funcione correctamente, primero debe existir el Plan de Cuentas y la Configuración Contable con los códigos de cuenta correctos. Sin eso, el motor de asientos no puede generar los asientos automáticos (las funciones fallan silenciosamente y devuelven `null` si no encuentran la configuración).

---

## Plan de Cuentas

### Para qué sirve

Es el catálogo de todas las cuentas contables del negocio (activo, pasivo, patrimonio, ingreso, costo, gasto), organizado en niveles jerárquicos (1 a 5). Todas las demás pantallas del módulo (asientos, libros, balances) dependen de este catálogo: los reportes solo consideran cuentas marcadas como **"Acepta movimientos"**.

Si el plan de cuentas está vacío, la pantalla muestra un aviso y un botón **"Cargar Plan Estándar"** que carga (vía `seedPlanCuentas()`) un plan de cuentas base para Ecuador.

### Cómo crear/editar una cuenta contable

1. Ir a **Contabilidad → Plan de Cuentas**.
2. Clic en **"Nueva Cuenta"** (o el ícono de lápiz en una fila existente para editar).
3. Completar:
   - **Código** (ej: `1.1.09`)
   - **Nivel** (1 a 5 — a mayor nivel, mayor detalle/subcuenta)
   - **Nombre**
   - **Tipo**: activo, pasivo, patrimonio, ingreso, costo o gasto
   - **Naturaleza**: deudora o acreedora (determina cómo se calcula el saldo en los libros y balances)
   - **Acepta movimientos**: si está desactivado, la cuenta es solo un título/agrupador y no puede recibir líneas de asiento
   - **Activa** (solo visible al editar): permite desactivar una cuenta sin borrarla
4. Guardar.

La pantalla permite buscar por código o nombre, filtrar por tipo, y exportar el plan de cuentas filtrado a Excel con el botón **"Excel"**.

---

## Centros de Costo

### Para qué sirve

Los centros de costo (ej. `ADM` — Administración, `VEN` — Ventas, `OPE` — Operaciones) permiten clasificar gastos e ingresos por área o departamento del negocio, independiente del Plan de Cuentas.

### Cómo usarlos

1. Ir a **Contabilidad → Centros de Costo**.
2. Clic en **"Nuevo"**, ingresar **Código** y **Nombre**, guardar.
3. Se pueden **editar** (ícono de lápiz) o **eliminar** (ícono de basura, con confirmación) en cualquier momento.
4. Cada centro tiene estado **Activo/Inactivo** (visible al editar).

---

## Configuración Contable

### Para qué sirve

Es el mapeo central que le dice al motor de asientos **qué cuenta contable usar** para cada tipo de operación del sistema. Sin esta configuración completa, los asientos automáticos no se generan.

Se accede en **Contabilidad → Configuración**. Los campos a completar (con el código sugerido según el plan estándar) son:

| Campo | Descripción | Código sugerido |
|---|---|---|
| Ventas gravadas IVA 15% | | 4.1.01 |
| Ventas tarifa 0% | | 4.1.02 |
| IVA en Ventas (pasivo) | | 2.1.02 |
| Caja | | 1.1.01 |
| Bancos | | 1.1.02 |
| Cuentas por Cobrar Clientes | | 1.1.03 |
| Costo de Ventas | | 5.1.01 |
| Inventario de Mercaderías | | 1.1.05 |
| IVA en Compras (activo) | | 1.1.04 |
| Cuentas por Pagar Proveedores | | 2.1.01 |
| Ret. Fuente por Cobrar | | 1.1.06 |
| Ret. IVA por Cobrar | | 1.1.07 |

En cada campo se ingresa el **código** de la cuenta (no el nombre), y ese código debe existir previamente en el Plan de Cuentas. Al guardar, el sistema queda listo para generar los asientos automáticos de ventas, compras, pagos y cobros usando estas cuentas.

---

## Asientos Contables (automáticos y manuales)

### Cómo se generan automáticamente (ventas, compras, pagos)

Cada operación de negocio dispara automáticamente la creación de un asiento a través del motor de asientos, sin intervención del usuario:

**Venta** (`crearAsientoVenta`):
- **Debe**: Caja (venta de contado) o Cuentas por Cobrar Clientes (venta a crédito, `esCxC=true`) por el total.
- **Haber**: Ventas 15% o Ventas 0% (según si tiene IVA) por el subtotal, más IVA en Ventas por el IVA cobrado.
- Si la venta tiene costo (`costoVenta > 0`), se agregan dos líneas adicionales: **Debe** Costo de Mercaderías Vendidas (5.1.01) y **Haber** Inventario de Mercaderías (1.1.05), usando el costo real de los productos vendidos. Así cada venta deja registrado tanto el ingreso como la salida del inventario a su costo.
- El asiento queda con `referenciaId = ventaId` y `referenciaTipo = 'venta'`, tipo `venta_factura` o `venta_nota` según si tiene IVA.

**Compra** (`crearAsientoCompra` / `crearAsientoCompraFactura`):
- **Debe**: Inventario de Mercaderías por el subtotal, más IVA en Compras por el IVA.
- **Haber**: Cuentas por Pagar Proveedores por el total.
- Referenciado con `referenciaTipo = 'entrada'` (si viene de una entrada de inventario) o `'factura_proveedor'` (si viene de importar el XML de una factura de proveedor sin entrada asociada).

**Pago a proveedor** (`crearAsientoPago`):
- **Debe**: Cuentas por Pagar Proveedores por el monto.
- **Haber**: Caja o Bancos (según `usaBanco`) por el monto.
- Referenciado con `referenciaTipo = 'factura_proveedor'`.

**Cobro a cliente / CxC** (`crearAsientoCobro`):
- **Debe**: Caja o Bancos por el neto cobrado, más Ret. Fuente/IVA por Cobrar si hubo retenciones.
- **Haber**: Cuentas por Cobrar Clientes por el monto total de la factura.
- Referenciado con `referenciaTipo = 'cxc'`.

Todos los asientos automáticos se crean con `estado: 'confirmado'`, `bloqueado: false` y `editadoManualmente: false`, y quedan visibles de inmediato en la pantalla de Asientos, Libro Diario y demás reportes.

### Sincronización bidireccional: qué pasa si editas la venta original, qué pasa si editas el asiento manualmente

Este es el comportamiento más delicado del sistema y es importante que el contador lo entienda bien:

**Si se edita la operación de origen (venta, compra, pago):**
- El módulo correspondiente llama a `recalcularAsientoVenta` / `recalcularAsientoCompra` / `recalcularAsientoPago`, que a su vez llama a `recalcularAsientoDeDocumento` (en `lib/firebase/asientos.ts`), que busca el asiento vinculado por `referenciaId` + `referenciaTipo`.
- **Si el asiento nunca fue editado manualmente** (`editadoManualmente = false`): se reemplazan sus líneas, totales y concepto con los nuevos valores calculados. El asiento se mantiene `editadoManualmente = false`.
- **Si el asiento ya fue editado manualmente** (`editadoManualmente = true`) y no se pasa `forzar: true`: el sistema **NO sobrescribe** el asiento. Devuelve una advertencia indicando que el asiento fue editado a mano y que, si se desea recalcularlo, hay que ir a Contabilidad → Asientos y usar la opción de recalcular desde el origen forzando el cambio.
- **Si el asiento está bloqueado** (porque su período contable está cerrado): tampoco se sobrescribe; se devuelve la advertencia "El período contable está cerrado".

**Si se edita el asiento directamente desde Contabilidad → Asientos:**
- Al abrir para editar un asiento generado automáticamente (tiene `referenciaId`), la pantalla muestra el aviso: *"Este asiento fue generado automáticamente por el sistema. Al editarlo se marcará como 'editado manualmente' y no se sobreescribirá si el documento origen cambia (salvo que uses 'Recalcular desde origen')."*
- Al guardar los cambios, `editarAsiento()` valida que el asiento no esté bloqueado (período cerrado) y que Debe = Haber, y marca el asiento con `editadoManualmente: true`.
- **La edición del asiento NUNCA se propaga de vuelta al documento origen** — es decir, si editas manualmente el asiento de una venta, la venta en sí (sus datos en la colección `ventas`) no cambia.

En resumen: la sincronización es de **origen → asiento**, nunca al revés, y una vez que el contador toca un asiento a mano, el sistema respeta esa corrección y deja de sobrescribirla automáticamente.

### Cómo crear un asiento manual

1. Ir a **Contabilidad → Asientos** y clic en **"Nuevo Asiento"**.
2. Completar **Fecha**, **Concepto** y el **Tipo** (manual, apertura, ajuste_inventario o cierre).
3. Agregar líneas con **"Agregar línea"**: cada línea requiere código de cuenta (debe existir en el Plan de Cuentas), y montos de Debe o Haber. Se puede eliminar una línea si hay más de dos.
4. El pie de la tabla muestra los totales de Debe y Haber en tiempo real, y si el asiento **"Cuadra"** o muestra la diferencia. El botón de guardar está deshabilitado mientras no cuadre.
5. Clic en **"Registrar Asiento"**.

Los asientos manuales creados aquí no llevan `referenciaId`, por lo que nunca son tocados por el motor de recálculo automático.

Desde la misma pantalla se puede ver el **detalle** de cualquier asiento (ícono de flecha hacia abajo) y **exportar** todos los asientos listados a Excel.

---

## Libro Diario

### Para qué sirve, cómo consultarlo

El Libro Diario (**Contabilidad → Libro Diario**) muestra todos los asientos contables en orden cronológico, con sus líneas de Debe y Haber desglosadas bajo cada encabezado de asiento (número, fecha, concepto, tipo).

Se filtra por rango de fechas (**Desde** / **Hasta**, por defecto el mes actual). Al pie se muestran los totales de Debe y Haber del período filtrado. Se puede exportar a Excel con el botón **"Exportar Excel"**.

---

## Libro Mayor

### Para qué sirve, cómo consultarlo

El Libro Mayor (**Contabilidad → Libro Mayor**) agrupa los movimientos **por cuenta contable**, mostrando para cada cuenta que tuvo movimientos en el período: sus transacciones (fecha, concepto, debe, haber) y el saldo parcial acumulado línea a línea, más los totales de Debe, Haber y Saldo final de la cuenta.

Solo se consideran cuentas que **aceptan movimientos** y están **activas**. Se filtra por rango de fechas y opcionalmente por una cuenta específica (selector "Todas las cuentas" o una en particular). Exportable a Excel.

---

## Balance de Comprobación

### Para qué sirve

El Balance de Comprobación (**Contabilidad → Balance Comprobación**) es la verificación clásica de que el sistema contable está cuadrado: suma el Debe y el Haber de cada cuenta en el rango de fechas seleccionado (por defecto, desde inicio de año) y calcula el saldo deudor o acreedor de cada una según su naturaleza.

Muestra un indicador **"✓ Cuadra"** o **"✗ No cuadra"** comparando el total general de Debe contra el total general de Haber — si no cuadra, hay un problema de integridad en los asientos que debe investigarse. Exportable a Excel.

---

## Balance General

### Para qué sirve

El Balance General (**Contabilidad → Balance General**) es el estado de situación financiera a una fecha de corte (**"Al"**, por defecto hoy). Agrupa las cuentas con saldo en tres columnas: **Activos**, **Pasivos** y **Patrimonio**, calculando el saldo de cada cuenta desde el inicio de los registros hasta la fecha de corte.

Muestra un indicador de si **Total Activos = Total Pasivo + Patrimonio** (ecuación contable fundamental). Exportable a Excel.

---

## Estado de Resultados

### Para qué sirve

El Estado de Resultados (**Contabilidad → Estado de Resultados**) muestra, para un rango de fechas (por defecto el año actual), los **Ingresos**, **Costos** y **Gastos** operacionales, con:

- **Utilidad Bruta** = Total Ingresos − Total Costos
- **Utilidad Neta** = Utilidad Bruta − Total Gastos

Incluye KPIs resumen, un gráfico de barras comparativo y el detalle por cuenta de cada sección (ingresos, costos de ventas, gastos operacionales). Exportable a Excel.

---

## Períodos Contables

### Para qué sirve

Los períodos contables (**Contabilidad → Períodos**) organizan la contabilidad en meses. Cada período tiene estado **Abierto** o **Cerrado**, y permite generar sus asientos especiales de **Apertura** y **Cierre**:

- **Asiento de Apertura**: registra los saldos iniciales de las cuentas de activo, pasivo y patrimonio al comenzar el período (líneas manuales de código de cuenta + Debe/Haber, debe cuadrar). Queda referenciado a `referenciaTipo = 'periodo'`.
- **Asiento de Cierre**: cierra los Ingresos y Gastos del período contra la cuenta de Utilidad/Pérdida del Ejercicio. Los totales de Ingresos y Gastos se calculan automáticamente a partir de los asientos del período (sumando cuentas tipo `ingreso` en el Haber, y `gasto`/`costo` en el Debe), aunque se pueden ajustar manualmente antes de generar el asiento. El resultado (utilidad o pérdida) se muestra antes de confirmar.

### Cómo cerrar un período (y qué implica: bloqueo de asientos)

1. Ir a **Contabilidad → Períodos**.
2. Si el período no existe todavía, crearlo con **"Nuevo Período"** (seleccionar Año y Mes).
3. En la fila del período, clic en **"Cerrar"** (ícono de candado).
4. Al cerrar, el sistema:
   - Cambia el estado del período a **cerrado**.
   - Llama a `bloquearAsientosDePeriodo(anio, mes, true)`, que marca `bloqueado = true` en **todos** los asientos cuya fecha cae dentro de ese mes.
5. Un asiento bloqueado **no se puede editar** — al intentar abrirlo para edición desde la pantalla de Asientos aparece el error *"Asiento bloqueado — el período contable está cerrado"*, y en la lista de asientos se muestra la etiqueta **"período cerrado"**.
6. Un período cerrado puede **reabrirse** con el botón **"Abrir"**, lo que desbloquea nuevamente todos sus asientos (`bloqueado = false`). Esta acción debería reservarse a un administrador, ya que vuelve editables asientos que ya se consideraban definitivos.

---

## Preguntas frecuentes / Tips

- **Si edito una venta después de haber corregido su asiento a mano, ¿se pierde mi corrección?** No. Si el asiento tiene `editadoManualmente = true`, el sistema no lo sobrescribe al recalcular desde la venta — solo muestra una advertencia. Tu corrección manual queda intacta hasta que alguien la recalcule forzadamente desde Asientos.

- **¿Cómo fuerzo que un asiento editado manualmente se actualice con los datos actuales del documento origen?** Debe usarse la opción "Recalcular desde origen" (con `forzar: true`) desde Contabilidad → Asientos; de lo contrario el sistema seguirá respetando la versión editada manualmente.

- **No puedo editar un asiento y me dice "período cerrado".** Es esperado: los asientos de un período cerrado quedan bloqueados. Si realmente necesitas corregirlo, un administrador debe reabrir el período correspondiente en Contabilidad → Períodos, hacer la corrección, y volver a cerrarlo.

- **Edité un asiento automático manualmente. ¿Esto cambia la venta o compra original?** No. La edición de un asiento nunca se propaga de vuelta al documento de origen (venta, entrada, factura de proveedor). Solo afecta el registro contable.

- **¿Por qué no se generan los asientos automáticos de mis ventas/compras?** Verifica que Configuración Contable tenga todos los códigos de cuenta completos y que esos códigos existan en el Plan de Cuentas. Si falta la configuración, el motor de asientos no crea el asiento (falla silenciosamente).

- **El Balance de Comprobación no cuadra.** Esto indica una inconsistencia en los asientos (por ejemplo, un asiento con Debe ≠ Haber cargado manualmente por fuera del flujo normal). Revisa el Libro Diario del período para ubicar el asiento problemático.

- **¿Qué cuentas aparecen en los libros y balances?** Solo las marcadas como "Acepta movimientos" y "Activa" en el Plan de Cuentas. Cuentas de título/agrupador (que no aceptan movimientos) no aparecen con saldos propios.

- **El costo de ventas ya está incluido automáticamente.** Cada venta con costo genera, además de las líneas de ingreso e IVA, el asiento de Costo de Mercaderías Vendidas (Debe) contra Inventario de Mercaderías (Haber), por lo que el Estado de Resultados y el Balance General ya reflejan el costo real vendido sin necesidad de ajustes manuales adicionales.
