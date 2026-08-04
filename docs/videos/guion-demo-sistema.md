# Guion de narración — Video demo del sistema

## Cómo usar este documento

1. Cada sección tiene dos partes:
   - **🎬 Qué mostrar en pantalla** — la secuencia de clics que debes hacer mientras suena esa parte del audio.
   - **🎙️ Narración** — el texto exacto para pegar en el conversor de texto a voz. Está en bloques de cita (`>`) para que puedas copiar cada bloque por separado si grabas en partes.
2. Grábalo por secciones (no de un tirón). Es mucho más fácil re-grabar 30 segundos que un video de 20 minutos si te equivocas en un clic.
3. Los tiempos entre corchetes `[~Xs]` son un estimado a ritmo de locución normal (unas 150 palabras por minuto), para que sepas cuánto dura cada bloque y puedas calcular cuánto video necesitas grabar.
4. Antes de grabar, abre el sistema con datos de prueba ya cargados (algunos productos, un par de ventas, un proveedor, una factura de proveedor) para que las pantallas no se vean vacías.
5. Duración total estimada del guion completo: **~18-20 minutos**. Las secciones de Compras/Proveedores, Retenciones y Contabilidad son las más largas a propósito, como pediste.

---

## 1. Introducción [~40s]

### 🎬 Qué mostrar en pantalla
Dashboard principal, recién ingresado al sistema.

### 🎙️ Narración
> Este es el sistema de inventario, ventas y contabilidad, diseñado específicamente para negocios ecuatorianos con integración directa al SRI. En este video vamos a recorrer los módulos principales, con énfasis en la parte contable, en compras a proveedores, y en las retenciones que se emiten a proveedores, que es el corazón operativo del sistema.
>
> Empezamos por el panel principal.

---

## 2. Dashboard [~45s]

### 🎬 Qué mostrar en pantalla
- Señalar las tarjetas: Ventas hoy, Mes actual, Productos, Stock bajo o Por cobrar.
- Señalar el gráfico "Ventas últimos 7 días".
- Señalar la sección de Accesos rápidos y Ventas recientes.

### 🎙️ Narración
> Al ingresar, el usuario ve un resumen general: las ventas del día, el acumulado del mes, el número de productos activos en catálogo, y una alerta de productos con stock bajo el mínimo configurado. Más abajo, un gráfico muestra la tendencia de ventas de los últimos siete días, y una lista de accesos rápidos permite saltar directamente al punto de venta, a nuevas entradas de inventario, o a emitir una factura, sin tener que navegar por los menús.

---

## 3. Inventario [~90s]

### 🎬 Qué mostrar en pantalla
- Ir a **Inventario → Productos**. Mostrar la tabla, el buscador y el filtro por categoría.
- Abrir "Nuevo Producto" brevemente, mostrar los campos (SKU, nombre, categoría, precio de compra, precio de venta, stock, stock mínimo) y cerrar sin guardar.
- Ir a **Entradas**, mostrar el botón "Nueva Entrada" y el buscador de productos dentro del formulario.
- Ir a **Kardex**, seleccionar una categoría, luego un producto, mostrar el historial de movimientos y el botón "Exportar Excel".

### 🎙️ Narración
> El módulo de inventario centraliza todo el catálogo. En Productos se registra cada artículo con su SKU, categoría, precio de compra, precio de venta y stock mínimo. El sistema valida que el precio de venta nunca sea menor al precio de costo, para evitar vender con pérdida por error de digitación.
>
> Las Entradas registran las compras de mercadería: se elige el proveedor, se buscan los productos y se ingresan las cantidades y precios; el stock se actualiza automáticamente. Los Despachos hacen lo inverso para salidas por ajuste, muestra o devolución. Todo movimiento de stock —ya sea por una venta, una entrada, un despacho o un ajuste— queda registrado en el historial de Movimientos, y se puede consultar por producto en el Kardex, con filtro por categoría, rango de fechas, y exportación a Excel.

---

## 4. Ventas [~90s]

### 🎬 Qué mostrar en pantalla
- Ir a **Ventas → Punto de Venta**. Agregar un producto al carrito, mostrar la ganancia estimada (en verde).
- Cambiar el método de pago, mostrar el botón de cobrar (sin completar la venta si no quieres registrar datos de prueba).
- Ir a **Historial de Ventas**. Mostrar el selector de período (Hoy / Esta semana / Este mes), y el filtro por categoría y producto.
- Señalar una fila con ganancia en rojo (si existe) para explicar el código de color.

### 🎙️ Narración
> El Punto de Venta es la pantalla que usan los vendedores día a día. Se buscan los productos, se agregan al carrito, se pueden aplicar descuentos, y el sistema calcula en tiempo real la ganancia estimada de la venta: en verde si es positiva, en rojo si por algún motivo el precio aplicado deja la venta en pérdida. Al cobrar, se elige el método de pago —efectivo, tarjeta, transferencia o crédito— y la venta queda registrada, con su asiento contable generado automáticamente por detrás.
>
> En el Historial de Ventas se puede filtrar por período —hoy, esta semana, este mes, o un rango específico— y también por categoría o producto, para saber exactamente qué se vendió y con qué margen. Desde ahí también se puede anular una venta, lo que revierte el stock, corregir el método de pago, o reimprimir el ticket.

---

## 5. Facturación Electrónica SRI [~2min]

### 🎬 Qué mostrar en pantalla
- Ir a **Facturación SRI → Configuración SRI**. Mostrar los campos: RUC, razón social, certificado .p12, ambiente (pruebas/producción), secuenciales. No mostrar la contraseña del certificado en pantalla.
- Ir a **Emitir Comprobante**. Seleccionar una venta, mostrar el tipo de comprobante (factura / nota de venta), y el botón "Emitir y enviar al SRI".
- Ir a **Comprobantes**. Mostrar un comprobante autorizado y el botón de descarga del RIDE en PDF.
- Ir a **Notas de Crédito**. Abrir "Nueva Nota de Crédito", elegir una factura origen, y mostrar la tabla de ítems con el precio unitario editable y el checkbox de IVA por línea.

### 🎙️ Narración
> Antes de emitir cualquier comprobante hay que cargar la configuración SRI una sola vez: el RUC, la razón social, el certificado de firma electrónica en formato P12, y el ambiente de trabajo. El ambiente de pruebas permite emitir comprobantes de prueba sin validez tributaria; el ambiente de producción emite comprobantes reales y válidos ante el SRI.
>
> Para emitir una factura, se selecciona la venta correspondiente. El sistema genera el XML, lo firma electrónicamente con el certificado configurado, lo envía al SRI, y consulta la autorización. Si todo sale bien, el comprobante queda autorizado y disponible para descargar su RIDE en PDF, que es la representación impresa del comprobante electrónico.
>
> Cuando hace falta anular parcial o totalmente una factura ya autorizada, se emite una Nota de Crédito. Aquí quiero detenerme un momento porque acabamos de mejorar esta pantalla: ahora se puede editar el precio unitario de cada línea y marcar si esa línea grava IVA o no, para que la nota de crédito se emita exactamente por el valor que se necesita, y no forzosamente por el total completo de la factura original.

---

## 6. Compras y Proveedores — Cuentas por Pagar [~4min]

### 🎬 Qué mostrar en pantalla
- Ir a **Cuentas por Pagar → Facturas de Proveedores**.
- Señalar las tarjetas de resumen: Total por pagar, Vencidas, Pendientes, Pagadas.
- Señalar los botones de la cabecera uno por uno: "Importar XML", "Importar varios XML", "Buscar en mi correo", **"Importar TXT (Recibidos SRI)"**, "Descargar todos (ZIP)", "Pago bancario (TXT)", "Nueva Factura".
- Hacer clic en "Importar XML", subir un XML de una factura de proveedor (puede ser el mismo XML autorizado que descarga el SRI), y mostrar el diálogo de confirmación con emisor, RUC, número, subtotal, IVA y total. Señalar la advertencia si el proveedor no existe todavía.
- Confirmar la importación y mostrar cómo el proveedor se crea automáticamente si no existía.
- Hacer clic en **"Importar TXT (Recibidos SRI)"**, subir el archivo de comprobantes recibidos descargado del portal del SRI, y mostrar el diálogo de vista previa: filas leídas, cuántas se van a importar, cuántas ya estaban registradas, cuántos proveedores nuevos se crearán. Confirmar la importación y mostrar la barra de progreso.
- Abrir el detalle de una factura, mostrar el botón de "Registrar pago", completar un pago parcial y mostrar cómo cambia el estado a "Parcial".
- Mostrar el flujo de "Pago bancario (TXT)": selección de facturas pendientes, banco, y generación del archivo para la banca electrónica.

### 🎙️ Narración
> Esta es, junto con Contabilidad, la pantalla más importante del sistema para el trabajo diario con proveedores.
>
> Aquí arriba tenemos el resumen: cuánto se debe en total, cuántas facturas están vencidas, cuántas pendientes y cuántas ya pagadas. Y en la cabecera están las distintas formas de cargar una factura de proveedor.
>
> La primera es Importar XML: se sube el archivo XML de una factura autorizada por el SRI —el mismo que el proveedor te envía o que tú mismo descargas del portal de comprobantes recibidos— y el sistema lo lee automáticamente: extrae el proveedor, el número de factura, la fecha, el subtotal, el IVA y el total. Si el proveedor todavía no existe en el sistema, se crea automáticamente con su RUC y razón social, sin que tengas que ir a registrarlo a mano primero. Esto también genera, por detrás, el asiento contable de la compra.
>
> Importar varios XML hace exactamente lo mismo pero en lote, para cuando tienes muchos archivos descargados del SRI de una sola vez.
>
> Ahora, la funcionalidad que quiero destacar especialmente: Importar TXT, comprobantes recibidos del SRI. El portal del SRI permite descargar un reporte en formato de texto con todas las facturas recibidas en un período, en una sola línea por factura. Antes había que cargar esas facturas una por una. Ahora se sube ese mismo archivo tal cual lo entrega el SRI, y el sistema muestra una vista previa antes de importar nada: cuántas filas se leyeron, cuántas se van a importar, cuántas ya estaban registradas —para no duplicar—, y cuántos proveedores nuevos se van a crear automáticamente. Se confirma, y el sistema procesa todo el lote, creando facturas, proveedores nuevos cuando hace falta, y el asiento contable de cada una.
>
> También se puede buscar directamente en el correo electrónico configurado, para traer los XML que los proveedores envían por email sin tener que descargarlos manualmente.
>
> Cada factura de proveedor tiene su ciclo de vida: pendiente, parcial si ya se abonó algo, pagada, o vencida si se pasó la fecha límite. Para registrar un pago se abre el detalle de la factura, se indica el monto y el método de pago, y el saldo se actualiza al instante.
>
> Y para pagos masivos existe el Pago bancario por archivo TXT: se seleccionan varias facturas pendientes, se elige el banco, y el sistema registra el pago de cada una, genera el asiento contable correspondiente, y descarga el archivo en el formato que pide la banca electrónica de ese banco para subirlo directamente ahí.

---

## 7. Retenciones a Proveedores [~3min]

### 🎬 Qué mostrar en pantalla
- Ir a **Tributario → Retenciones (config)**. Mostrar la lista de códigos y porcentajes de retención configurados.
- Ir a **Tributario → Ret. Emitidas**. Hacer clic en "Nueva Retención".
- En el diálogo "Emitir Comprobante de Retención": seleccionar la "Factura del proveedor", mostrar cómo se cargan los datos de la factura.
- Hacer clic en "+ Agregar" para añadir una línea de retención, seleccionar un código de retención, ingresar la base imponible, y mostrar cómo se calcula el valor retenido.
- Emitir y mostrar el resultado: autorizado por el SRI, o el mensaje de error si algo falla (mostrar que ahora el mensaje de error es explícito).
- Volver a la lista y mostrar el botón de anular una retención.

### 🎙️ Narración
> Cuando la empresa es agente de retención, cada vez que se paga una factura a un proveedor hay que retenerle un porcentaje del impuesto a la renta, del IVA, o ambos, según el tipo de bien o servicio. Ese porcentaje se configura una sola vez en Retenciones, donde se define cada código con su descripción y su porcentaje correspondiente, según la tabla vigente del SRI.
>
> Para emitir una retención, se va a Retenciones Emitidas y se elige la factura del proveedor sobre la que se va a retener. El sistema trae automáticamente los datos del proveedor y de la factura. Luego se agregan una o varias líneas de retención: se elige el código —por ejemplo, retención en la fuente por servicios, o retención de IVA— y se ingresa la base imponible; el sistema calcula el valor retenido según el porcentaje configurado para ese código.
>
> Al emitir, igual que con las facturas y las notas de crédito, el comprobante se firma electrónicamente y se envía al SRI para su autorización. Este flujo lo acabamos de reforzar: si el SRI rechaza el comprobante por cualquier motivo —un problema de firma, un dato inválido—, ahora el sistema muestra el mensaje de error exacto que devolvió el SRI, en lugar de dejarlo como "pendiente" sin explicación. Y el registro se guarda en el sistema desde antes de enviarlo, así que nunca se pierde el número de comprobante aunque falle la conexión a mitad de camino.
>
> Una vez autorizada, la retención genera automáticamente su asiento contable, reduciendo la cuenta por pagar al proveedor por el valor retenido. Y si es necesario, se puede anular desde la misma lista, lo que revierte ese asiento.

---

## 8. Contabilidad [~4min]

### 🎬 Qué mostrar en pantalla
- Ir a **Contabilidad → Plan de Cuentas**. Mostrar el buscador, y abrir "Nueva Cuenta" para mostrar los campos (código, nivel, nombre, tipo, naturaleza) sin guardar.
- Ir a **Contabilidad → Config. Contable**. Mostrar el mapeo de cuentas (inventario, costo de ventas, ventas, IVA, etc.), sin entrar en detalle de cada una.
- Ir a **Contabilidad → Asientos Contables**. Mostrar un asiento generado automáticamente desde una venta (con las líneas de venta, IVA, y costo de mercadería vendida contra inventario). Señalar el ícono que indica "editado manualmente" en algún asiento si existe, y el ícono de "bloqueado".
- Abrir el detalle de un asiento y explicar el balance debe/haber.
- Ir a **Libro Diario** y mostrar el listado cronológico.
- Ir a **Libro Mayor**, seleccionar una cuenta y mostrar sus movimientos.
- Ir a **Balance de Comprobación**, luego a **Balance General** y **Estado de Resultados**, mostrando cada uno brevemente.
- Ir a **Períodos Contables**, mostrar un período abierto y explicar qué pasa al cerrarlo (sin cerrarlo realmente si es un período con datos reales).

### 🎙️ Narración
> Todo lo que hemos visto hasta ahora —ventas, compras, pagos, retenciones— alimenta automáticamente la contabilidad, sin que nadie tenga que digitar un asiento a mano para la operación normal del negocio.
>
> La base es el Plan de Cuentas, siguiendo la estructura NEC y NIIF aplicable en Ecuador: cada cuenta tiene un código, un nivel dentro de la jerarquía, un tipo —activo, pasivo, patrimonio, ingreso o gasto— y una naturaleza, deudora o acreedora. En Configuración Contable se define qué cuenta específica del plan se usa para cada tipo de operación: cuál es la cuenta de inventario, cuál la de costo de ventas, cuál la de IVA en ventas y en compras, y así con cada concepto.
>
> Con esa configuración, el motor de asientos automáticos entra en acción. Cuando se registra una venta, se genera un asiento que reconoce el ingreso y el IVA, y además —esto es importante— un segundo movimiento que debita el costo de la mercadería vendida y acredita el inventario, usando el costo real de cada producto vendido. Es decir, el sistema calcula automáticamente el costo de ventas en cada transacción, no solo el ingreso. Lo mismo ocurre al registrar una compra a un proveedor, un pago, o una retención: cada operación genera su asiento correspondiente, siempre con la referencia al documento de origen.
>
> Aquí hay una regla clave que hay que entender bien: si el contador edita manualmente un asiento generado automáticamente, el sistema lo marca como editado manualmente, y a partir de ese momento, si se vuelve a editar la venta o la compra de origen, el sistema no va a sobrescribir ese asiento sin avisar; respeta el ajuste manual salvo que explícitamente se fuerce la actualización. Y cuando se cierra un período contable, todos los asientos de ese período quedan bloqueados: ya no se pueden modificar, lo que da seguridad de que un período cerrado no cambia después.
>
> Desde estos asientos se arman automáticamente el Libro Diario, en orden cronológico; el Libro Mayor, que muestra el movimiento de cada cuenta específica; el Balance de Comprobación; y los estados financieros formales: el Balance General y el Estado de Resultados. Todo se recalcula solo, en tiempo real, a medida que se opera el sistema.
>
> Y en Períodos Contables se administra la apertura y cierre de cada mes o cada año fiscal. Cerrar un período es la manera de decir "esto ya quedó firme", bloqueando cualquier cambio posterior a esos asientos.

---

## 9. Reportes [~50s]

### 🎬 Qué mostrar en pantalla
- Ir a **Reportes**. Mostrar los presets de período (Hoy, 7 días, Este mes, Este año).
- Mostrar el nuevo filtro de Categoría y Producto.
- Recorrer brevemente las pestañas: Resumen, Ventas, Inventario, Ganancias, Compras, Clientes, Vendedores.
- Mostrar el botón "Exportar Excel" en una de las pestañas.

### 🎙️ Narración
> Por último, el módulo de Reportes reúne todo en un solo lugar para el análisis del negocio: ventas por día, inventario valorizado, ganancias por producto, compras por proveedor, y ranking de clientes y vendedores. Se puede filtrar por período con los accesos rápidos de hoy, siete días, este mes o este año, y además, recientemente agregamos el filtro por categoría y por producto, para poder ver el desempeño de una línea específica del negocio sin mezclarla con el resto. Cada pestaña se puede exportar a Excel con un clic.

---

## 10. Cierre [~25s]

### 🎬 Qué mostrar en pantalla
Volver al Dashboard.

### 🎙️ Narración
> En resumen: el sistema cubre todo el ciclo del negocio, desde el inventario y la venta, hasta la facturación electrónica, las compras a proveedores, las retenciones, y la contabilidad completa, generada automáticamente a partir de la operación diaria. Esto reduce el trabajo manual y el margen de error, y mantiene la información contable y tributaria siempre al día.
