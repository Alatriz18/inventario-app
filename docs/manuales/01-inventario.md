# Manual de Inventario

## ¿Qué hace este módulo?
El módulo de Inventario administra el catálogo de productos, sus categorías, las bodegas donde se almacenan, los proveedores que los abastecen, y todos los movimientos de stock (entradas, despachos y ajustes). Toda entrada o despacho actualiza automáticamente el stock del producto y queda registrado en el historial de Movimientos y en el Kardex.

---

## Productos

### Para qué sirve
Es el catálogo central del negocio: aquí se define cada producto que se compra y se vende, con su precio de costo, precio de venta, categoría y stock.

### Cómo crear un producto (paso a paso)
1. Ir a **Productos** y hacer clic en **Nuevo Producto**.
2. Si se desea, subir una **Imagen del producto** (botón **Seleccionar imagen**, formatos JPG/PNG/WEBP, máximo 5MB; se guarda optimizada a ~400px).
3. Llenar **SKU / Código** (obligatorio, ej: `TAB-001`).
4. Llenar **Nombre** (obligatorio).
5. Elegir **Categoría** (obligatorio). Si la categoría no existe, se puede crear al vuelo con el botón **Nueva** junto al campo, sin salir del formulario.
6. Ingresar **Precio de compra** y **Precio de venta** (obligatorios). Si el usuario no tiene permiso `editar_precios`, estos campos aparecen deshabilitados con el aviso "No tienes permiso para modificar precios".
7. Revisar el recuadro de **Ganancia unitaria** y **Margen** que aparece automáticamente al ingresar el precio de venta (solo visible con permiso `ver_ganancias`).
8. Definir **Stock inicial** y **Stock mínimo (alerta)** (por defecto 5).
9. Agregar una **Descripción** opcional.
10. Hacer clic en **Crear**.

### Cómo editar / desactivar / eliminar
- **Editar:** ícono de lápiz en la fila del producto. Abre el mismo formulario con los datos cargados; además aparece el checkbox **Producto activo** para desactivarlo sin eliminarlo.
- **Eliminar:** ícono de basurero. Muestra confirmación "¿Eliminar producto?" indicando que se eliminará el producto y su imagen, acción que no se puede deshacer.
- Ambas acciones solo están disponibles para usuarios con permiso `editar_productos`; si no se tiene el permiso, la columna de acciones muestra un guion (—).

### Filtros disponibles
- Buscador de texto por **nombre o SKU**.
- Filtro por **categoría** (selector "Todas las categorías" o una específica), con botón **Limpiar filtro**.

### Cosas a tener en cuenta
- **El precio de venta no puede ser menor al precio de compra.** El formulario valida esto y muestra el error "El precio de venta no puede ser menor al precio de costo"; además, si se ingresa un precio de venta menor al de compra, el recuadro de ganancia/margen se pinta en rojo.
- El **stock** se muestra siempre redondeado a 2 decimales en toda la interfaz.
- Cuando el stock actual es menor o igual al stock mínimo, el número se muestra en rojo con un ícono de advertencia (⚠) junto a él.
- Las columnas de **Precio de compra** y **Margen** solo se muestran a usuarios con permisos `ver_costos` y `ver_ganancias` respectivamente.
- El margen se muestra con color: verde si es ≥30%, amarillo si está entre 10% y 30%, rojo si es menor a 10%.

---

## Categorías

### Para qué sirve
Organiza los productos en grupos (ej: Flores, Follajes, Insumos) para facilitar búsquedas y reportes.

### Cómo crear una categoría (paso a paso)
1. Ir a **Categorías** y hacer clic en **Nueva Categoría**.
2. Ingresar **Nombre** (obligatorio, máximo 50 caracteres).
3. Ingresar **Descripción** opcional (máximo 200 caracteres).
4. Hacer clic en **Crear**.

### Cómo editar / eliminar
- **Editar:** ícono de lápiz; incluye el checkbox **Categoría activa** para desactivarla.
- **Eliminar:** ícono de basurero. La confirmación aclara que "los productos asociados a esta categoría no serán eliminados".

### Filtros disponibles
No tiene buscador propio; la lista se muestra completa.

### Cosas a tener en cuenta
- Solo las categorías marcadas como **activas** aparecen como opción al crear/editar un producto o al filtrar en otras pantallas del módulo.

---

## Bodegas

### Para qué sirve
Permite gestionar múltiples puntos de almacenamiento. El sistema aclara en su descripción que es un **módulo opcional** — si el negocio no usa varias bodegas, puede omitirse.

### Cómo crear una bodega (paso a paso)
1. Ir a **Bodegas** y hacer clic en **Nueva Bodega**.
2. Ingresar **Código** (obligatorio, ej: `BOD-01`) y **Nombre** (obligatorio, ej: `Bodega Principal`).
3. Opcional: **Responsable** y **Dirección**.
4. Marcar **Es la bodega principal** si corresponde (se marca automáticamente por defecto si es la primera bodega que se crea).
5. Opcional, en la sección **Configuración Contable**: **Cuenta de Inventario** y **Cuenta Costo de Ventas** (códigos del plan de cuentas, ej: `1.1.05.001`).
6. Hacer clic en **Crear**.

### Cómo editar / eliminar
- **Editar:** ícono de lápiz; incluye el checkbox **Bodega activa**.
- **Eliminar:** ícono de basurero. **Está deshabilitado para la bodega marcada como principal** (no se puede eliminar). La confirmación advierte "Asegúrate de que no tenga movimientos asociados."

### Filtros disponibles
No tiene buscador ni filtros; la tabla muestra todas las bodegas.

### Cosas a tener en cuenta
- La bodega principal se distingue con una estrella (★) junto al nombre.
- La columna **Cuentas config.** indica con una etiqueta si la bodega tiene cuentas contables asignadas ("Configuradas") o no ("Sin config.").

---

## Proveedores

### Para qué sirve
Registra los proveedores con toda la información necesaria para compras y para la facturación/retenciones ante el SRI.

### Cómo crear un proveedor (paso a paso)
1. Ir a **Proveedores** y hacer clic en **Nuevo Proveedor**.
2. **Identificación SRI:**
   - **Tipo de Identificación** (RUC, Cédula, Pasaporte, Identificación Exterior).
   - **Número de Identificación** (obligatorio).
   - **Razón Social / Nombre** (obligatorio) y **Nombre Comercial** (opcional).
   - **Tipo de Proveedor**: Local (Ecuador), Extranjero – Persona Natural, Extranjero – Persona Jurídica.
   - **Régimen Tributario** (lista de regímenes configurados).
3. **Contacto y Dirección:** Persona de contacto, Teléfono, Email, País, Provincia, Ciudad, Dirección.
4. **Condiciones Comerciales y SRI:**
   - **Tipo de Pago**: Contado o Crédito.
   - **Días de Crédito** (solo habilitado si el tipo de pago es Crédito).
   - **Sustento Tributario** (código SRI).
5. **Configuración Contable** (opcional): Cuenta CxP, Cuenta de Compras/Gasto, Cuenta IVA Compras.
6. **Datos Bancarios** (opcional, para pagos por transferencia/archivo): Banco, Código del banco (IFI), Tipo de cuenta (Corriente/Ahorros), Número de cuenta, Email para aviso de pago.
7. **Notas** opcionales.
8. Hacer clic en **Crear**.

### Cómo editar / eliminar
- **Editar:** ícono de lápiz; incluye el checkbox **Proveedor activo**.
- **Eliminar:** ícono de basurero, con confirmación simple ("Esta acción no se puede deshacer").

### Filtros disponibles
Buscador de texto por **nombre o identificación (RUC)**.

### Cosas a tener en cuenta
- Solo los proveedores **activos** aparecen como opción al registrar una nueva Entrada de inventario.
- También se puede crear un proveedor "al vuelo" desde el formulario de Entradas con el botón **Nuevo** junto al selector de proveedor.

---

## Entradas de Inventario

### Para qué sirve
Registra compras a proveedores. Cada entrada suma stock a los productos indicados automáticamente y genera el asiento contable de compra correspondiente.

### Cómo registrar una entrada (paso a paso)
1. Ir a **Entradas de Inventario** y hacer clic en **Nueva Entrada**.
2. Seleccionar **Proveedor** (obligatorio; solo aparecen proveedores activos). Se puede crear uno nuevo con el botón **Nuevo** sin cerrar el formulario.
3. Opcional: seleccionar **Bodega** ("Sin bodega específica" por defecto).
4. Confirmar la **Fecha** (obligatoria, por defecto hoy).
5. En **Agregar Productos**, buscar por nombre o SKU y hacer clic en el producto para agregarlo a la lista. Si el producto ya está en la lista, se incrementa la cantidad en 1.
6. Para cada producto agregado, ajustar **Cantidad** y **Precio Unit.** (el precio unitario se precarga con el precio de compra del producto). El **Subtotal** por línea se calcula automáticamente.
7. Revisar el resumen de **Subtotal**, **IVA 15%** y **Total** al pie de la tabla.
8. Opcional: agregar **Notas**.
9. Hacer clic en **Registrar Entrada**. El botón queda deshabilitado si no se agregó ningún producto.

### Cómo anular una entrada
1. En la lista de Entradas, hacer clic en el ícono de **X** (anular) de la fila correspondiente. No aparece para entradas ya anuladas.
2. Confirmar en el diálogo "¿Anular esta entrada?", que advierte que **se revertirá el stock de todos los productos** de esa entrada.
3. Al confirmar, la entrada queda marcada como **Anulada** (se muestra atenuada en la tabla) y ya no se puede volver a anular.

### Filtros disponibles
- Buscador de texto por **proveedor**.
- Filtro por **Categoría** (acota el selector de producto) y por **Producto**.
- Botón **Limpiar filtro** cuando hay algún filtro de categoría/producto activo.

---

## Despachos

### Para qué sirve
Registra salidas de inventario que **no son ventas** — ajustes, muestras/regalos, devoluciones a proveedor u otros motivos. Cada despacho resta stock automáticamente.

### Cómo registrar un despacho (paso a paso)
1. Ir a **Despachos** y hacer clic en **Nuevo Despacho**.
2. Confirmar la **Fecha** (obligatoria, por defecto hoy).
3. Seleccionar el **Motivo** (obligatorio): **Ajuste de inventario**, **Muestra / regalo**, **Devolución a proveedor** u **Otro**.
4. Opcional: **Detalle del motivo** (texto libre) y **Bodega**.
5. En **Agregar Productos** (solo se listan productos con stock disponible > 0), buscar por nombre o SKU y hacer clic para agregarlo.
6. Ajustar **Cantidad** por línea — el campo tiene como máximo el stock disponible del producto (`max={stock}`) — y el **Precio Unit.** (precargado con el precio de venta).
7. Revisar el **Total** al pie de la tabla.
8. Opcional: agregar **Notas**.
9. Hacer clic en **Registrar Despacho**.

### Cómo anular un despacho
1. Ícono de **X** en la fila del despacho (no aparece si ya está anulado).
2. Confirmar "¿Anular este despacho?", que advierte que **se devolverá el stock de todos los productos al inventario**.
3. El despacho queda marcado como **Anulado** y se muestra atenuado en la tabla.

### Filtros disponibles
- Buscador de texto por **motivo o usuario**.
- Filtro por **Categoría** (acota el selector de producto) y por **Producto**.
- Botón **Limpiar filtro**.

---

## Movimientos

### Qué muestra esta pantalla
Es una vista de **solo lectura**: el historial completo de todos los cambios de stock del sistema (entradas, salidas, ajustes positivos/negativos, devoluciones de cliente y de proveedor), generados automáticamente por Entradas, Despachos, ventas, etc. Incluye 4 tarjetas de resumen (Entradas, Salidas, Ajustes, Devoluciones) con el conteo total de movimientos de cada tipo.

Cada fila muestra: Fecha y hora, Tipo (con color e ícono), Producto, Cantidad (con signo + o −), Stock anterior, Stock nuevo, Bodega, Usuario y Notas.

### Filtros disponibles
- Buscador de texto por **producto o usuario**.
- Filtro por **Tipo de movimiento**: Todos los tipos, Entradas, Salidas, Ajustes (+), Ajustes (−), Dev. Clientes, Dev. Proveedores.
- Filtro por **fecha exacta**.
- Filtro por **Categoría** (acota el selector de producto) y por **Producto**.
- Botón **Limpiar filtros** que resetea todos los filtros a la vez.
- Al pie de la tabla se muestra "Mostrando X de Y movimientos".

---

## Kardex

### Para qué sirve
Da trazabilidad completa de un **producto específico**: todos sus movimientos ordenados cronológicamente con saldo acumulado, para auditar entradas/salidas y verificar el stock.

### Cómo usarlo paso a paso
1. Ir a **Inventario > Kardex**.
2. (Opcional) Elegir una **Categoría** para acotar la lista del selector de producto.
3. Elegir el **Producto** (obligatorio para ver resultados; el selector muestra SKU y nombre).
4. (Opcional) Definir rango de fechas con **Desde** y **Hasta**. Botón **Limpiar fechas** para quitar el filtro.
5. Revisar las tarjetas de resumen: **Stock actual**, **Entradas período**, **Salidas período**, **Precio compra**.
6. Revisar la tabla con columnas: Fecha, Tipo, Referencia, Bodega, Entradas, Salidas, Saldo, Responsable, Notas.
7. Al pie se muestra el total de movimientos y los totales de Entradas, Salidas y Saldo final del período.

### Exportar a Excel
- Botón **Exportar Excel** (arriba a la derecha). Está deshabilitado si no hay un producto seleccionado o no hay movimientos en el rango de fechas.
- Genera un archivo `kardex_<SKU>_<fecha>.xlsx` con las columnas: Fecha, Tipo, Referencia, Bodega, Cantidad (negativa para salidas/ajustes negativos/devoluciones a proveedor), Stock Anterior, Stock Nuevo, Notas, Responsable.

---

## Preguntas frecuentes / Tips

- **¿Por qué no me deja guardar un producto?** Lo más común es que el precio de venta sea menor al precio de compra — el sistema lo bloquea con el mensaje "El precio de venta no puede ser menor al precio de costo".
- **El stock se ve raro con muchos decimales.** No debería: en toda la interfaz el stock se redondea a 2 decimales (kardex, tablas de productos, formularios de entrada/despacho).
- **No puedo eliminar una bodega.** Si es la bodega marcada como **principal**, el botón de eliminar está deshabilitado — primero hay que asignar otra bodega como principal.
- **¿Cómo corrijo una entrada o despacho mal registrado?** No se editan: se **anulan**. Anular una Entrada revierte el stock que había sumado; anular un Despacho devuelve el stock que había restado. Luego se registra el movimiento correcto.
- **Un producto no aparece en el buscador de Despachos.** El buscador de productos en Despachos solo muestra productos con **stock disponible mayor a 0**.
- **¿Cómo veo rápido si hay stock bajo?** En Productos, el número de stock aparece en **rojo** con un ícono ⚠ cuando el stock actual es menor o igual al stock mínimo configurado para ese producto.
- **No veo el precio de compra ni el margen de un producto.** Esas columnas dependen de los permisos `ver_costos` y `ver_ganancias` del usuario; si no se tienen, simplemente no se muestran.
