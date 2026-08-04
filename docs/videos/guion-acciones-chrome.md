# Guion de acciones para Claude en Chrome — Demo del sistema (SOLO NAVEGACIÓN, SIN GUARDAR NADA)

Este documento es para dárselo a la extensión de Claude para Chrome. El objetivo es que recorra la aplicación en pantalla, sección por sección, para grabar un video demo. **El sistema ya está abierto en el navegador, en el Dashboard.** Sigue las secciones en orden.

Este guion está sincronizado con `guion-demo-sistema.md` (el guion de narración que se convierte a audio). Cada sección de acá corresponde a la misma sección numerada de ese archivo, para que al reproducir el audio mientras navegas, la pantalla coincida con lo que se está diciendo.

---

## ⚠️ REGLAS DE SEGURIDAD — leer antes de empezar y respetar en TODO el recorrido

Este es un sistema real, conectado a una base de datos real y, en el módulo de Facturación/Retenciones, al SRI (Servicio de Rentas Internas de Ecuador). Si se confirma un envío real, se puede emitir un comprobante fiscal válido o modificar datos reales del negocio. Por eso:

1. **Nunca hagas clic en botones que guardan, envían, confirman o eliminan algo.** Esto incluye (pero no se limita a) cualquier botón con texto como: "Guardar", "Registrar", "Registrar Entrada", "Registrar Pago", "Registrar Factura", "Emitir", "Emitir y enviar al SRI", "Confirmar importación", "Confirmar Venta", "Cobrar", "Anular", "Pagar y generar archivo", "Cerrar período", "Eliminar".
2. **Solo navega, abre pantallas, abre diálogos para mostrar los campos, y ciérralos con "Cancelar"** (o la "X" del diálogo) en vez de guardarlos.
3. **No completes ningún formulario hasta el final ni lo envíes.** Puedes escribir texto de ejemplo en un campo para mostrar cómo se ve, pero luego cierra el diálogo sin guardar.
4. **Si un botón abre un selector de archivos del sistema operativo** (por ejemplo "Importar XML" o "Importar TXT"), haz clic para que se vea que se abre el selector, y luego ciérralo con la tecla `Escape` sin elegir ningún archivo. No completes una importación real.
5. **Si en algún momento aparece un cuadro de confirmación del navegador o del sistema operativo** (tipo "¿Estás seguro?"), elige siempre la opción de **cancelar**, nunca la de confirmar.
6. **No cierres sesión, no cambies la configuración SRI, no cambies el ambiente de pruebas/producción, no toques el certificado.**
7. Si tienes cualquier duda sobre si un botón es seguro de presionar, **no lo presiones** — simplemente descríbelo o señálalo con el cursor y pasa a la siguiente acción.
8. Muévete a un ritmo pausado, como si estuvieras dando un tour guiado: deja cada pantalla visible unos segundos antes de pasar a la siguiente, para que el video no se vea apurado.

---

## 1. Introducción [~40s]
El sistema ya está abierto en el Dashboard. No hace falta ninguna acción todavía — solo deja la pantalla quieta unos segundos mostrando el panel principal completo.

## 2. Dashboard [~45s]
- Mueve el cursor (sin hacer clic) sobre las tarjetas superiores: Ventas hoy, Mes actual, Productos, Stock bajo / Por cobrar.
- Desplaza el cursor sobre el gráfico "Ventas últimos 7 días".
- Señala la sección "Accesos rápidos" y la lista de "Ventas recientes" más abajo.
- No hagas clic en ningún acceso rápido todavía (eso se navega en la sección 4).

## 3. Inventario [~90s]
1. Abre el menú lateral → **Inventario → Productos**.
2. Deja ver la tabla completa unos segundos. Escribe algo en el buscador (por ejemplo el nombre de un producto que exista) solo para mostrar que filtra, luego bórralo.
3. Abre el selector de categoría, muéstralo desplegado un momento, y vuelve a "Todas las categorías" sin aplicar un filtro raro.
4. Haz clic en **"Nuevo Producto"** para abrir el formulario. Muestra los campos (SKU, nombre, categoría, precio de compra, precio de venta, stock, stock mínimo) sin llenarlos con datos reales. **Cierra el diálogo con "Cancelar"**, no con guardar.
5. Ve a **Inventario → Entradas**. Muestra la tabla de entradas existentes.
6. Haz clic en **"Nueva Entrada"**, muestra el selector de proveedor y el buscador de productos dentro del formulario (puedes escribir en el buscador para que aparezcan resultados). **No agregues productos al carrito de la entrada ni hagas clic en "Registrar Entrada". Cierra con "Cancelar".**
7. Ve a **Inventario → Kardex**. Selecciona una categoría, luego selecciona un producto del listado (esto solo filtra, es de lectura, no pasa nada). Deja ver el historial de movimientos que aparece. Señala el botón "Exportar Excel" sin hacer clic en él (o si haces clic, es seguro porque solo descarga un archivo, no modifica nada).

## 4. Ventas [~90s]
1. Ve a **Ventas → Punto de Venta**.
2. Busca un producto en el buscador y haz clic para agregarlo al carrito (esto es seguro, el carrito es solo local, no se guarda nada hasta que se hace clic en "Cobrar"). Muestra cómo se ve la "Ganancia estimada" en verde.
3. Cambia el método de pago en el selector para mostrar las opciones (efectivo, tarjeta, transferencia, crédito).
4. **No hagas clic en "Cobrar" ni en ningún botón de confirmar la venta.** Si quieres limpiar el carrito, quita los productos que agregaste haciendo clic en el ícono de eliminar de cada línea, o simplemente navega a otra pantalla (el carrito no persiste).
5. Ve a **Ventas → Historial**. Muestra el selector de período (haz clic para desplegarlo, elige "Esta semana" o "Este mes" para mostrar cómo cambian las cifras — esto es solo un filtro, seguro).
6. Muestra el filtro de categoría y de producto de la misma manera.
7. Haz clic sobre una fila de la tabla para expandir el detalle de una venta (esto es de solo lectura). Ciérralo de nuevo.
8. **No hagas clic en los íconos de anular, reparar método de pago, ni imprimir ticket** dentro de esta tabla — solo señálalos con el cursor.

## 5. Facturación Electrónica SRI [~2min]
1. Ve a **Facturación SRI → Configuración SRI**. Muestra la pantalla con los campos (RUC, razón social, certificado, ambiente, secuenciales) sin hacer clic en ningún campo de contraseña ni modificar nada. **No hagas clic en "Guardar".**
2. Ve a **Facturación SRI → Emitir Comprobante**. Abre el selector de venta y muéstralo desplegado (elegir una venta de la lista es seguro, solo carga los datos en el formulario, no emite nada). Muestra el tipo de comprobante (factura / nota de venta).
3. **No hagas clic en "Emitir y enviar al SRI" bajo ninguna circunstancia** — esto enviaría un comprobante real al SRI. Solo muestra el formulario lleno y señala el botón sin presionarlo.
4. Ve a **Facturación SRI → Comprobantes**. Muestra el listado. Si hay un comprobante autorizado, puedes hacer clic en el botón de descargar RIDE (PDF) — esto es seguro, solo descarga un archivo.
5. Ve a **Facturación SRI → Notas de Crédito**. Haz clic en **"Nueva Nota de Crédito"**. Selecciona una factura origen del selector (esto es seguro, solo carga los ítems). Muestra la tabla de ítems: cambia el precio unitario de un ítem para mostrar que es editable, marca/desmarca el checkbox de IVA de una línea. **No hagas clic en "Emitir y enviar al SRI". Cierra el diálogo con "Cancelar".**

## 6. Compras y Proveedores — Cuentas por Pagar [~4min]
Esta sección es la más larga y la más delicada: aquí es donde hay que tener más cuidado de no confirmar nada.

1. Ve a **Cuentas por Pagar → Facturas de Proveedores**.
2. Deja ver las tarjetas de resumen (Total por pagar, Vencidas, Pendientes, Pagadas) unos segundos.
3. Señala, uno por uno, los botones de la cabecera: "Importar XML", "Importar varios XML", "Buscar en mi correo", "Importar TXT (Recibidos SRI)", "Descargar todos (ZIP)", "Pago bancario (TXT)", "Nueva Factura".
4. Haz clic en **"Importar XML"**. Se abrirá el selector de archivos del sistema operativo. **Presiona `Escape` para cerrarlo sin elegir ningún archivo.** (Si por alguna razón se llega a abrir el diálogo de vista previa de una factura, ciérralo con "Cancelar", nunca con "Confirmar importación".)
5. Haz clic en **"Importar TXT (Recibidos SRI)"**. Igual que el anterior: se abre el selector de archivos, **presiona `Escape` para cerrarlo sin elegir nada.**
6. Haz clic en **"Nueva Factura"** para mostrar el formulario manual completo (proveedor, número, fechas, montos). No lo llenes con datos reales más allá de mostrar los campos vacíos. **Cierra con "Cancelar", nunca con "Registrar Factura".**
7. Vuelve a la tabla. Haz clic sobre el ícono de "Ver detalle" (el de la flecha hacia abajo) de una factura existente para mostrar su detalle, incluyendo el historial de pagos si tiene. Cierra el diálogo.
8. Si quieres mostrar el flujo de pago: haz clic en el ícono de tarjeta de crédito ("Registrar pago") de una factura pendiente para abrir el diálogo, muestra los campos de monto y método de pago, **pero cierra con "Cancelar", no con "Confirmar Pago".**
9. Haz clic en **"Pago bancario (TXT)"** para mostrar la pantalla de selección de facturas y banco. Puedes marcar el checkbox de una o dos facturas para mostrar cómo se ve seleccionado. **No hagas clic en "Pagar y generar archivo". Cierra con "Cancelar".**

## 7. Retenciones a Proveedores [~3min]
1. Ve a **Tributario → Retenciones (config)**. Muestra la lista de códigos y porcentajes configurados (esto es de solo lectura para el recorrido, no edites nada).
2. Ve a **Tributario → Ret. Emitidas**. Haz clic en **"Nueva Retención"** (o el botón equivalente que abre el diálogo "Emitir Comprobante de Retención").
3. Abre el selector "Factura del proveedor *" y elige una factura de la lista (esto solo carga los datos en el formulario, es seguro).
4. Haz clic en **"+ Agregar"** para mostrar una línea de retención nueva. Abre el selector de código de retención y muéstralo desplegado. Escribe un valor de ejemplo en "Base imponible" para mostrar cómo se calcula el valor retenido.
5. **No hagas clic en el botón de emitir/enviar. Cierra el diálogo con "Cancelar".**
6. Vuelve a la lista de retenciones ya emitidas y señala (sin hacer clic) el ícono de anular en alguna fila, solo para mostrar que existe la opción.

## 8. Contabilidad [~4min]
1. Ve a **Contabilidad → Plan de Cuentas**. Muestra la tabla y el buscador (escribir y borrar texto en el buscador es seguro).
2. Haz clic en **"Nueva Cuenta"** (o el botón equivalente) para mostrar el formulario (código, nivel, nombre, tipo, naturaleza). **Cierra con "Cancelar", no guardes.**
3. Ve a **Contabilidad → Config. Contable**. Muestra el mapeo de cuentas (inventario, costo de ventas, ventas, IVA, etc.) sin cambiar ningún valor.
4. Ve a **Contabilidad → Asientos Contables**. Muestra la tabla de asientos generados automáticamente. Haz clic sobre uno para ver su detalle (líneas de debe/haber). Señala, si existe, el ícono que indica que un asiento fue "editado manualmente" y el ícono de "bloqueado". Cierra el detalle sin editar nada.
5. Ve a **Contabilidad → Libro Diario**. Deja ver el listado cronológico unos segundos.
6. Ve a **Contabilidad → Libro Mayor**. Selecciona una cuenta del selector para mostrar sus movimientos (esto es solo un filtro de lectura, seguro).
7. Ve a **Contabilidad → Balance Comprobación**, luego a **Balance General**, luego a **Estado Resultados**. Muestra cada pantalla unos segundos, sin hacer clic en ningún botón de exportar o cerrar si lo hay.
8. Ve a **Contabilidad → Períodos Contables**. Muestra el listado de períodos y su estado (abierto/cerrado). **No hagas clic en "Cerrar período" ni en ningún botón que cambie el estado de un período.**

## 9. Reportes [~50s]
1. Ve a **Reportes**.
2. Haz clic en los botones de período rápido (Hoy, 7 días, Este mes, Este año) para mostrar cómo cambian las cifras — esto es solo un filtro, seguro.
3. Abre el selector de Categoría y el de Producto para mostrar el nuevo filtro (elegir una opción está bien, es de solo lectura).
4. Haz clic en cada una de las pestañas: Resumen, Ventas, Inventario, Ganancias, Compras, Clientes, Vendedores. Deja ver cada una un momento.
5. Puedes hacer clic en algún botón "Exportar Excel" si quieres mostrarlo — es seguro, solo descarga un archivo, no modifica datos.

## 10. Cierre [~25s]
Vuelve al Dashboard (menú lateral → Dashboard) y deja la pantalla ahí unos segundos para cerrar el recorrido.

---

## Resumen rápido — lo único que SÍ está permitido confirmar/hacer clic

- Navegar entre menús y pestañas.
- Abrir y cerrar diálogos con **"Cancelar"** o la **"X"**.
- Escribir y borrar texto en buscadores.
- Elegir opciones en selectores/filtros (categoría, producto, período, método de pago, etc.) — son de solo lectura.
- Expandir/colapsar filas de detalle (solo lectura).
- Marcar/desmarcar checkboxes dentro de un formulario que luego se cierra sin guardar (por ejemplo, el checkbox de IVA en Notas de Crédito).
- Botones de "Exportar Excel" / "Descargar RIDE" / "Descargar ZIP" — solo descargan archivos, no modifican nada.
- Agregar productos al carrito del Punto de Venta (no persiste hasta que se hace clic en "Cobrar", que está prohibido).

## Lo que NUNCA se debe confirmar

Guardar / Registrar (cualquier variante: Registrar Entrada, Registrar Pago, Registrar Factura) · Emitir y enviar al SRI · Confirmar importación · Cobrar / Confirmar Venta · Anular · Pagar y generar archivo · Cerrar período · Eliminar · cualquier botón de un formulario que no sea explícitamente "Cancelar".
