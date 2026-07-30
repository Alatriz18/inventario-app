# Manual de Ventas

## ¿Qué hace este módulo?

El módulo de Ventas cubre todo el ciclo de una venta en el negocio:

- **Punto de Venta (POS)** — registrar ventas nuevas, cobrar y actualizar stock.
- **Historial de Ventas** — consultar, filtrar, anular y corregir ventas ya registradas.
- **Recibos Internos** — generar un comprobante interno (sin validez tributaria) para ventas que no tienen factura ni nota de venta electrónica.
- **Clientes** — mantener el catálogo de clientes con sus datos SRI y condiciones comerciales, usado por el POS y por Facturación.

---

## Punto de Venta (POS)

### Para qué sirve

Es la pantalla donde se registra una venta: se buscan productos, se arma el carrito, se elige cliente y método de pago, y se confirma. Al confirmar, la venta descuenta stock y genera automáticamente el asiento contable correspondiente.

### Cómo registrar una venta paso a paso

1. En el buscador **"Buscar producto por nombre o SKU..."**, escribe al menos una letra. Solo aparecen productos **activos y con stock disponible** (máximo 6 resultados).
2. Haz clic sobre el producto en la lista para agregarlo al carrito. Si el producto ya está en el carrito, un segundo clic sobre él (o el botón **+**) suma una unidad más.
3. En la tabla del carrito puedes ajustar por cada ítem:
   - **Cantidad**: con los botones **+ / −** o escribiendo el número directamente (no puede ser 0 ni mayor al stock disponible; si se excede, aparece el mensaje "Stock máximo: X").
   - **Precio**: editable solo si el usuario tiene permiso `editar_precios`; si no, se muestra de solo lectura.
   - **Desc%**: descuento porcentual por ítem (0–100).
   - Para quitar un producto del carrito, usa el ícono de basurero al final de la fila.
4. Si quieres vaciar todo el carrito, usa el enlace **"Vaciar carrito"** debajo de la tabla.
5. Selecciona el **Cliente**: por defecto viene **CONSUMIDOR FINAL**. Haz clic en el recuadro de cliente para abrir el buscador y elegir uno existente, o usa **"+ Nuevo"** para crear un cliente rápido sin salir del POS. Si ya elegiste otro cliente, puedes volver a Consumidor Final con el enlace **"Cambiar a consumidor final"**.
6. Elige el **Método de pago**: `Depósito`, `Tarjeta`, `Transfer.` (transferencia), `Cheque` o `Crédito`.
   - Si eliges **Crédito**, debes indicar los **Días de crédito** (15, 30, 60 o 90) y el cliente **no puede ser Consumidor Final** — el sistema muestra "Selecciona un cliente identificado" y bloquea la venta si lo es.
7. Revisa/ajusta la **Fecha de venta** (por defecto hoy; no permite fechas futuras). Si eliges una fecha anterior, se muestra una advertencia ámbar: "Registrando con fecha anterior: [fecha]".
8. Ajusta, si aplica, el **Descuento global** (%) que se aplica sobre el subtotal completo.
9. Verifica el resumen (**Subtotal**, **Descuento**, **TOTAL**) y presiona el botón de cobro:
   - Dice **"Cobrar $X"** para métodos de contado, o **"Venta a crédito $X"** (en color ámbar) si el método es Crédito.
10. Al confirmarse, aparece el modal de éxito:
    - **"¡Venta completada!"** (ícono verde) para ventas de contado, o **"¡Venta a crédito registrada!"** (ícono ámbar) indicando que vence en N días y quedó registrada en Cuentas por Cobrar, con un enlace directo **"Ver Cuentas por Cobrar →"**.
    - Desde ahí puedes **"Imprimir Ticket (Zebra)"**, o emitir comprobante SRI con los botones **"📄 Factura"** / **"🧾 Nota de Venta"**, o cerrar con **"Nueva Venta"**.

### Ganancia estimada y colores

Debajo del carrito se muestra **"Ganancia estimada"**, calculada como la suma de ganancias de cada ítem menos el descuento global aplicado:

- **Verde** si la ganancia es positiva (≥ 0).
- **Rojo** si la ganancia es negativa.

Este dato solo se ve si el usuario tiene permiso `ver_ganancias`. De igual forma, el costo de compra en la lista de búsqueda de productos solo se muestra si el usuario tiene permiso `ver_costos`.

### Cosas a tener en cuenta

- El carrito no permite superar el stock actual del producto; el sistema avisa con un toast de error.
- La cantidad mínima por ítem es mayor a 0 (se valida al salir del campo); si escribes 0 o vacío, se revierte al valor anterior y aparece "La cantidad debe ser mayor a 0".
- El descuento por ítem y el descuento global son independientes y ambos afectan el total final.
- Solo se puede vender a crédito a un cliente identificado (no a Consumidor Final).
- Al confirmar la venta se dispara en segundo plano la creación del asiento contable (IVA 15%); si falla, no bloquea la venta.
- Tras confirmar, el formulario se limpia automáticamente (carrito vacío, cliente vuelve a Consumidor Final, descuento en 0, método de pago vuelve a Depósito).

---

## Historial de Ventas

### Para qué sirve

Muestra el registro completo de todas las ventas realizadas, con KPIs de resumen (Total ventas, Ingresos, Ganancia estimada, Anuladas) y permite revisarlas, corregirlas o anularlas.

### Filtros disponibles

- **Buscar por cliente...**: filtra por nombre o identificación del cliente.
- **Método de pago**: `Todos los métodos`, `Efectivo`, `Tarjeta`, `Transferencia`.
- **Período**: `Todo el período`, `Hoy`, `Esta semana`, `Este mes`, `Fecha específica` (al elegir esta última aparece un selector de fecha adicional).
- **Categoría**: `Todas las categorías` o una categoría específica (solo categorías activas).
- **Producto**: `Todos los productos` o uno específico; la lista de productos se acota automáticamente a la categoría elegida.
- El botón **"Limpiar filtros"** aparece solo cuando hay algún filtro activo y los resetea todos de una vez.

Cuando filtras por **Categoría** o **Producto**, el historial:
- Solo muestra ventas que contienen al menos un ítem que coincide con ese filtro.
- Recorta el **Total**, la **Ganancia** y el conteo de **Ítems** de cada fila a únicamente los ítems que coinciden (no a la venta completa).
- Los KPIs "Ingresos" y "Ganancia estimada" y el resumen al pie de la tabla también se calculan solo sobre esos ítems filtrados.

La columna **Ganancia** (y la del pie de tabla y el detalle de venta) se muestra en **verde** si es positiva y en **rojo** si es negativa — corregido: antes de la corrección se mostraba siempre en verde sin importar el signo.

### Cómo anular una venta

1. En la fila de la venta (solo disponible si está **Completada**), haz clic en el ícono **X** ("Anular venta").
2. Confirma en el diálogo **"¿Anular esta venta?"** — advierte que "Se revertirá el stock de todos los productos vendidos. Esta acción no se puede deshacer."
3. Al confirmar, la venta pasa a estado **Anulada** (se muestra atenuada/opacada en la tabla) y el stock de los productos se revierte. Puede aparecer un toast de advertencia adicional si el sistema detecta alguna inconsistencia al revertir.

### Cómo editar el método de pago de una venta (reparar)

1. Haz clic en el ícono de llave inglesa **"Editar método de pago"** (solo en ventas Completadas).
2. En el diálogo, elige el nuevo **Método de pago** (`Efectivo`, `Tarjeta`, `Transferencia`, `Depósito`, `Cheque`, `Crédito (CxC)`).
3. Si eliges **Crédito** y la venta todavía no tiene cartera asociada, debes indicar los **Días de crédito**; el sistema avisa: "Se creará el registro en Cartera (CxC) con este plazo." Si la venta ya tiene cartera (`cxcId`), se muestra "✓ Esta venta ya tiene registro en cartera." y no se pide el plazo de nuevo.
4. Presiona **"Guardar cambios"**. El sistema confirma con "Venta corregida y cuenta por cobrar creada en cartera" (si se generó CxC) o "Método de pago actualizado correctamente".

### Cómo imprimir un ticket

En cada venta completada, el ícono de impresora **"Imprimir ticket"** descarga el ticket (formato Zebra 72mm) con los datos de la empresa configurados en SRI. Aparece el toast "Ticket descargado".

### Ver el detalle de una venta

El ícono de flecha (chevron) **"Ver detalle"** abre el diálogo **"Detalle de Venta"** con: cliente, fecha, método de pago, vendedor, lista de ítems (con SKU, cantidad, descuento si aplica, subtotal y ganancia por ítem), y el resumen de subtotal, descuento global, total y ganancia total.

---

## Recibos Internos

### Para qué sirve

Genera un **comprobante interno sin validez tributaria** para ventas completadas que todavía **no tienen** un comprobante electrónico SRI asociado (factura o nota de venta). Es útil cuando el cliente no requiere documento electrónico. El módulo lo advierte explícitamente: "Los recibos internos no tienen validez tributaria. No reemplazan a una factura ni a una nota de venta."

La lista solo muestra ventas con estado **completada** que **no** tienen `comprobanteId` (es decir, no se les emitió factura/nota de venta electrónica).

### Cómo usarlo

1. Ubica la venta en la tabla (columnas: Fecha, Cliente, Identificación, Total, Pago).
2. **Ver**: abre el recibo en formato A4 en una pestaña nueva (requiere tener configurado el SRI; si no, muestra "Configura el SRI primero").
3. **Zebra**: descarga el ticket de 72mm listo para impresora térmica, con el aviso "Ticket listo para imprimir".
4. Si se accede a esta página con un `ventaId` en la URL (por ejemplo, desde el POS), el ticket Zebra se descarga automáticamente.

---

## Clientes

### Para qué sirve

Es el catálogo de clientes con sus datos completos para el SRI (identificación, tipo, dirección) y sus condiciones comerciales (contado/crédito). Se usa desde el POS para asociar clientes a las ventas y desde Facturación para emitir comprobantes electrónicos.

### Cómo crear/editar un cliente

1. Haz clic en **"Nuevo Cliente"** (o el ícono de lápiz en una fila existente para editar).
2. Completa la sección **Identificación SRI**:
   - **Tipo de Identificación** (obligatorio): `RUC`, `Cédula`, `Pasaporte`, `Consumidor Final`, `Identificación Exterior`. Si eliges `Consumidor Final`, los campos **Número de Identificación** y **Nombre / Razón Social** se autocompletan (`9999999999999` / `CONSUMIDOR FINAL`) y quedan deshabilitados.
   - **Número de Identificación** y **Nombre / Razón Social** (obligatorios).
   - **Nombre Comercial** (opcional).
   - **Tipo de Cliente** (obligatorio): `Local (Ecuador)` o `Extranjero`.
3. Completa **Contacto y Dirección**: Teléfono, Email (valida formato), País (autocompleta el código de país), Provincia, Ciudad, Dirección.
4. Completa **Condiciones Comerciales**:
   - **Tipo de Pago** (obligatorio): `Contado` o `Crédito`.
   - **Días de Crédito** y **Límite de Crédito ($)** — solo habilitados si el Tipo de Pago es Crédito.
5. Opcional: **Configuración Contable** — **Cuenta CxC de este cliente** (ej: `1.1.03.001`).
6. Si estás editando, puedes marcar/desmarcar la casilla **"Cliente activo"**.
7. Presiona **"Crear"** (o **"Actualizar"** si editas). El sistema confirma con "Cliente creado" / "Cliente actualizado".

Para eliminar, usa el ícono de basurero en la fila y confirma en el diálogo **"¿Eliminar cliente?"** ("Esta acción no se puede deshacer").

### Cómo buscar clientes

Usa el campo **"Buscar por nombre o identificación..."** encima de la tabla; filtra en tiempo real por nombre o número de identificación.

---

## Preguntas frecuentes / Tips

1. **No puedo vender a crédito a un cliente nuevo sin identificar** — el POS bloquea el crédito si el cliente sigue siendo Consumidor Final. Primero selecciona o crea un cliente identificado (usa "+ Nuevo" para no perder la venta en curso).
2. **Si me equivoco al registrar el método de pago**, no anules la venta: usa el botón de llave inglesa ("Editar método de pago") en el Historial para corregirlo, incluso para convertirla a crédito y generar la cuenta por cobrar automáticamente.
3. **La ganancia en rojo no es un error** — significa que esa venta o ítem se vendió por debajo del costo de compra registrado. Antes había un bug que mostraba todo en verde; ahora el color refleja el signo real.
4. **Filtrar por categoría/producto en el historial recorta los totales**, no solo la lista: los KPIs de Ingresos y Ganancia y los totales del pie de tabla cambian para reflejar solo los ítems que coinciden con el filtro.
5. **Anular una venta es irreversible** y repone el stock — úsalo solo cuando la venta completa deba eliminarse, no para corregir el método de pago (para eso está "reparar").
6. **Los Recibos Internos no sirven para declarar impuestos** — son solo control interno. Si el cliente necesita un documento válido ante el SRI, emite Factura o Nota de Venta desde el modal de éxito del POS o desde Facturación.
