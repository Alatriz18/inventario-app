# Manual de Dashboard, Reportes y Administración

Este manual cubre los módulos transversales del sistema: el Dashboard principal, Reportes, Activos Fijos, Conciliación Bancaria, Usuarios y Roles, y Configuración General.

---

## Dashboard

Es la pantalla de inicio del sistema (`/`). Su contenido se adapta según el rol del usuario que inició sesión: los KPIs y gráficos financieros solo aparecen si el rol tiene acceso al módulo de historial de ventas o de Cuentas por Cobrar (CxC).

### Qué muestra

**Cabecera:** saludo según la hora del día (Buenos días / Buenas tardes / Buenas noches), nombre del usuario y fecha actual. Si el rol tiene acceso al POS, aparece un botón directo **"Ir al POS"**.

**Tarjetas de KPI** (arriba de la pantalla):
- **Ventas hoy** — total vendido en el día y variación porcentual contra el día anterior (solo visible si el usuario ve finanzas: admin, vendedor, contador). Si no hay ventas el día anterior para comparar, muestra el número de ventas del día en su lugar.
- **Mes actual** — total de ingresos del mes en curso.
- **Productos** — cantidad de productos activos en el catálogo (visible para todos los roles).
- **Por cobrar** (si el rol tiene acceso a CxC) — saldo pendiente total de cuentas por cobrar. Si el rol no tiene acceso a CxC, en su lugar se muestra **Stock bajo** — cantidad de productos por debajo de su stock mínimo, con la tarjeta resaltada en ámbar si hay alertas.

**Gráfico de ventas de los últimos 7 días** — barras diarias de ingresos (solo si el usuario ve finanzas), con la barra del día actual resaltada en negro. Incluye enlace directo a "Historial" de ventas.

**Panel de accesos rápidos** — enlaces a los módulos más usados, filtrados según lo que el rol puede ver (ver sección de Accesos rápidos abajo).

**Alertas de stock bajo** — lista de hasta 5 productos con stock igual o menor a su mínimo configurado, con enlace a "+N productos más" hacia el módulo de Productos si hay más de 5.

**Ventas recientes** — tabla con las últimas 5 ventas completadas (cliente, fecha/hora, método de pago, número de ítems y total), solo visible para quien ve finanzas. Incluye enlace "Ver todas" al historial.

### Accesos rápidos

Los accesos rápidos que pueden aparecer (se muestran hasta 5, y solo los que el rol tiene permitido):
- **Punto de Venta** → `/ventas/pos`
- **Nueva Entrada** → `/entradas`
- **Emitir Factura** → `/facturacion/emitir`
- **Cuentas por Cobrar** → `/cuentas-por-cobrar`
- **Clientes** → `/clientes`
- **Pagos pendientes** → `/cuentas-por-pagar/pagos`

---

## Reportes

Ruta: `/reportes`.

### Para qué sirve

Es el módulo de análisis del negocio: consolida ventas, inventario, ganancias, compras a proveedores, y desempeño de clientes y vendedores, todo filtrable por período de fechas y, opcionalmente, por categoría/producto. Todas las pestañas permiten exportar a Excel.

### Pestañas disponibles

- **📊 Resumen** — KPIs generales (Ingresos, Ganancia neta, Nº de ventas, Ticket promedio), gráfico de área de "Ventas y Ganancias por día", gráfico de barras de "Top 5 productos más vendidos" y gráfico circular de "Ventas por método de pago".
- **💰 Ventas** — tabla detallada de cada venta del período (fecha, cliente, ítems, total, ganancia, método de pago, vendedor), con totales al pie.
- **📦 Inventario** — estado actual del inventario: productos activos, productos bajo mínimo, valorización total (stock × precio de compra) y productos sin stock. Incluye tabla completa con SKU, categoría, stock, mínimo, precio de compra/venta y valorización por producto, resaltando en rojo los que están bajo el mínimo.
- **📈 Ganancias** — ganancia bruta, margen promedio y costo de ventas del período, gráfico de ganancia por producto (top 8) y tabla de rentabilidad por producto con badge de margen (verde ≥30%, amarillo ≥10%, rojo por debajo).
- **🛒 Compras** — total de compras por proveedor en el período, número de facturas y porcentaje de participación de cada proveedor.
- **👥 Clientes** — ventas agrupadas por cliente: número de compras, total vendido, ganancia generada y margen.
- **👤 Vendedores** — ventas agrupadas por vendedor: número de ventas, total vendido, ganancia generada y ticket promedio.

### Cómo filtrar por período

En la parte superior hay botones de período predefinido (presets):
- **Hoy**
- **7 días**
- **Este mes** (preset por defecto al entrar)
- **Este año**
- **Todo** (desde 2020-01-01 hasta hoy)

También se pueden elegir fechas manuales con los campos **Desde** / **Hasta** (al modificarlas manualmente se deselecciona el preset activo). Junto al selector aparece un contador con el número de ventas encontradas en el período.

### Cómo filtrar por categoría y producto

Debajo del selector de fechas hay dos filtros adicionales:
- **Categoría** — limita el análisis a una categoría específica (por defecto "Todas las categorías"). Al elegir una categoría, el selector de producto se acota automáticamente a los productos de esa categoría.
- **Producto** — limita el análisis a un solo producto (por defecto "Todos los productos").

Cuando hay un filtro de categoría o producto activo, aparece el botón **"Limpiar filtro de producto"** para quitarlo rápidamente.

Este filtro recorta de forma consistente **todas** las vistas del módulo:
- Las ventas mostradas en la pestaña Ventas y sus totales solo consideran los ítems que coinciden con el filtro (no la venta completa).
- El gráfico de ventas por día y el Top de productos se recalculan solo con los ítems filtrados.
- La pestaña Inventario y su valorización se acotan a los productos de la categoría/producto elegido.
- Los KPIs de Resumen, Ganancias, Clientes y Vendedores usan los montos ya recortados por el filtro.

### Cómo exportar a Excel

Cada pestaña tiene su propio botón **"Exportar Excel"** (usa la librería `xlsx`) que descarga un archivo `.xlsx` con los datos visibles en esa pestaña y el rango de fechas actual, por ejemplo: `reporte_ventas_2026-07-01_2026-07-29.xlsx`, `reporte_inventario_2026-07-29.xlsx`, `reporte_ganancias_...`, `reporte_compras_...`, `reporte_clientes_...`, `reporte_vendedores_...`. El botón se deshabilita si no hay datos que exportar.

---

## Activos Fijos

Ruta: `/activos-fijos`.

### Para qué sirve y qué se puede hacer

Este módulo **sí está funcional**, con registro de activos y cálculo de depreciación en línea recta o saldo decreciente, con generación de asiento contable automático al registrar cada cuota mensual.

Funcionalidad disponible:
- **KPIs generales**: activos en uso, costo de adquisición total, depreciación acumulada total y valor en libros total.
- **Registrar un nuevo activo** ("Nuevo Activo"): código, categoría (Muebles y Enseres, Equipos de Cómputo, Maquinaria y Equipo, Vehículos, Edificios, Terrenos, Equipos de Oficina, Otros — cada una con una tasa NIIF sugerida por defecto), descripción, fecha de adquisición, ubicación, valor de adquisición, valor residual, método de depreciación (línea recta o saldo decreciente) y vida útil en años. El formulario calcula y muestra una vista previa de la cuota mensual/anual estimada antes de guardar. También se configuran las cuentas contables involucradas (cuenta de activo, cuenta de depreciación acumulada y cuenta de gasto por depreciación).
- **Tabla de activos**: código, descripción, categoría, fecha de adquisición, costo, depreciación acumulada, valor en libros y estado (activo, depreciado, dado de baja, vendido). Cada fila es expandible y muestra el **calendario completo de cuotas mensuales** (período, cuota, depreciación acumulada, valor en libros, si ya fue registrada o está pendiente).
- **Registrar depreciación de un mes** (botón "Depreciar", solo disponible en activos con estado "activo"): se elige el mes (AAAA-MM), el sistema muestra la cuota calculada para ese período y, al confirmar, genera automáticamente el asiento contable de depreciación y marca la cuota como registrada. Si el período ya fue registrado o no tiene cuota programada, el botón se deshabilita.

Lo que **no** incluye: no hay edición ni eliminación de activos ya creados desde la UI, no hay baja/venta de activos gestionada desde esta pantalla (el estado "dado_de_baja"/"vendido" existe en el modelo de datos pero no hay un flujo en la interfaz para llegar a ese estado), y no hay reportes específicos de activos fijos fuera de esta tabla.

---

## Conciliación Bancaria

Ruta: `/conciliacion-bancaria`.

### Para qué sirve y qué se puede hacer

Este es un módulo **básico**, tal como lo señala el CLAUDE.md del proyecto (listado como módulo pendiente en general). Lo que existe hoy:

- **Cuentas bancarias**: se pueden crear cuentas bancarias ("Nueva Cuenta") con banco, tipo (corriente/ahorros), número de cuenta, titular, saldo inicial y, de forma obligatoria, una **cuenta contable vinculada** del plan de cuentas (necesaria para poder conciliar contra los asientos).
- **Importar movimientos por CSV**: se sube un archivo `.csv` con formato fijo `fecha,descripcion,tipo,monto,saldo` (tipo: `credito` o `debito`, fecha en formato `dd/MM/yyyy`). No hay integración directa con bancos ni descarga automática de extractos — la importación es manual, archivo por archivo.
- **Conciliación manual**: cada movimiento importado queda "pendiente". Para conciliarlo, el usuario abre el diálogo "Conciliar" y el sistema le propone una lista de asientos contables candidatos que afectan la cuenta contable vinculada, ordenados por cercanía de monto (marca "monto exacto" si coincide con diferencia menor a $0.01). El usuario elige manualmente el asiento correcto — **no hay conciliación automática**.
- Movimientos también se pueden **ignorar** (para descartarlos sin conciliar) o **revertir** una conciliación/ignorado ya hecho.
- Pestañas de Pendientes / Conciliados / Ignorados, con saldo calculado de la cuenta (saldo inicial + créditos − débitos, excluyendo ignorados).

Lo que **no** incluye: no hay conciliación automática por matching de monto+fecha, no hay soporte de formatos de extracto bancario más allá del CSV con esas 5 columnas fijas, y no genera asientos contables desde este módulo — los asientos deben existir previamente (creados desde Contabilidad → Asientos u otro proceso) para poder conciliarlos aquí.

---

## Usuarios y Roles

Ruta: `/usuarios` (típicamente solo visible/accesible para el rol `admin`, según `lib/permisos.ts`).

### Roles disponibles

El sistema define 5 roles en `lib/permisos.ts`, cada uno con acceso a un conjunto fijo de módulos:

- **admin** — *"Acceso total al sistema"*. Ve y usa absolutamente todos los módulos: inventario completo, POS, historial de ventas, facturación SRI (incluidas notas de crédito/débito y configuración SRI), CxC, CxP, contabilidad completa (plan de cuentas, asientos, libros, balances, períodos), tributario completo (retenciones, ICE, ATS, formularios 101/103/104/105/RIMPE), activos fijos, conciliación bancaria, reportes, usuarios y configuración. Es el único rol con todas las acciones especiales: editar precios, editar productos, ver costos, ver ganancias, anular ventas, editar asientos y cerrar períodos contables.
- **vendedor** — *"POS, ventas, clientes, facturación y cobranzas"*. Ve: dashboard, productos (catálogo, sin edición de costos por defecto), POS, historial de ventas, recibos, clientes, emisión de facturas y comprobantes, y CxC/cartera. Puede anular ventas y editar precios, pero **no** tiene acceso a contabilidad, tributario, inventario (entradas/despachos/bodegas), activos fijos, conciliación bancaria ni usuarios.
- **bodeguero** — *"Inventario, productos, entradas y despachos"*. Ve: dashboard, productos, categorías, bodegas, proveedores, entradas, despachos, movimientos, kardex, y facturas/documentos de CxP (sin pagos). Puede editar productos y ver costos, pero **no** tiene acceso a ventas/POS, facturación, contabilidad ni tributario.
- **contador** — *"Contabilidad, tributario, reportes y cuentas por pagar/cobrar"*. Ve: dashboard, productos (solo lectura), historial de ventas, comprobantes de facturación, notas de crédito/débito, CxC/cartera, CxP completo (facturas, documentos y pagos), todo el módulo de contabilidad (plan de cuentas, centros de costo, configuración contable, asientos, libro diario/mayor, balances, períodos), todo tributario, activos fijos, conciliación bancaria y reportes. Puede ver costos y ganancias, editar asientos y cerrar períodos. **No** tiene acceso al POS ni a gestión de usuarios.
- **finanzas** — *"Inventario completo, pagos a proveedores y cuentas por cobrar"*. Ve: dashboard, inventario completo (productos, categorías, bodegas, proveedores, entradas, despachos, movimientos, kardex), CxP completo (facturas, documentos y pagos), CxC/cartera, clientes, e historial de ventas (solo lectura). Puede ver costos y editar productos. **No** tiene acceso a POS, facturación SRI, contabilidad, tributario, activos fijos, conciliación bancaria ni usuarios.

El Sidebar y el guard de rutas de la aplicación consultan automáticamente `lib/permisos.ts` para mostrar/ocultar módulos y bloquear el acceso directo por URL según el rol.

### Cómo crear/editar un usuario

**Crear** (botón "Nuevo Usuario"): se pide nombre completo, email, contraseña temporal (mínimo 8 caracteres) y rol (selector con los 5 roles descritos, mostrando su descripción de permisos debajo del formulario a modo de referencia). Al guardar, se llama a la API interna `POST /api/users/create`.

**Editar** (ícono de lápiz en la fila del usuario): se puede cambiar el nombre, el rol, y opcionalmente asignar una nueva contraseña (si se deja vacío, no se cambia). Se guarda vía `PUT /api/users/[uid]`.

**Activar/Desactivar**: cada usuario (excepto el propio usuario logueado) tiene un botón para desactivarlo o reactivarlo. Un usuario desactivado no puede iniciar sesión hasta ser reactivado; se confirma con un diálogo de alerta antes de aplicar el cambio.

La pantalla también muestra estadísticas rápidas (total de usuarios, activos, inactivos) y un buscador por nombre o email.

---

## Configuración General

Ruta: `/configuracion`.

### Qué se configura ahí

**Datos de la Empresa**: Razón Social, Nombre Comercial (opcional), RUC (validado a 13 dígitos), Dirección, Ciudad, Provincia, Teléfono y Email de contacto.

**Régimen Tributario**: selector con los regímenes soportados — General, RIMPE Emprendedor, RIMPE Negocio Popular, RIMPE Artesano, Exportador Habitual y Contribuyente Especial. Al elegir un régimen, la pantalla muestra automáticamente una vista previa de:
- **Comprobantes habilitados** para ese régimen: Factura electrónica, Nota de venta, Nota de crédito, Nota de débito, Comprobante de retención, Liquidación de compras, Guía de remisión, Recibo interno.
- **Reglas tributarias** aplicadas: tasa de IVA, si es agente de retención, si está obligado a llevar contabilidad, si es contribuyente especial, si aplica ICE, y qué declaraciones debe presentar (Formulario 104-IVA, Formulario 103-Retenciones, Formulario 105-ICE, ATS mensual, Formulario 101-IR anual, Declaración RIMPE).
- Avisos contextuales: para **RIMPE Negocio Popular** advierte que solo puede emitir notas de venta (no facturas) y que no cobra IVA separado; para **Exportador Habitual** advierte que sus ventas al exterior tienen tarifa IVA 0% y que tiene derecho a devolución del IVA de compras locales.

**Opciones Adicionales**: Moneda (actualmente solo USD disponible) y un mensaje adicional que se imprime en los comprobantes (ej. "Gracias por su compra").

**Correo para enviar comprobantes (SMTP)**: sección aparte para configurar el envío de comprobantes por correo — proveedor (Gmail, Outlook/Office 365, u Otro con SMTP personalizado), nombre del remitente, correo, contraseña de aplicación (con instrucciones para generarla en Gmail/Outlook), y host/puerto si el proveedor es "Otro". Se guarda de forma independiente al resto de la configuración de empresa.

---

## Preguntas frecuentes / Tips

**¿Por qué no veo el gráfico de ventas ni los KPIs de ingresos en el Dashboard?**
Depende de tu rol. Solo los roles con acceso al módulo `historial_ventas` (admin, vendedor, contador) ven las cifras de ventas e ingresos. Si tu rol no tiene ese acceso (por ejemplo bodeguero), verás en su lugar la tarjeta de "Stock bajo" y accesos rápidos en un layout más ancho.

**El filtro de categoría/producto en Reportes no muestra nada en una pestaña.**
Revisa que el período de fechas cubra ventas reales para ese producto/categoría — el filtro de producto y el de fechas se combinan (ambos deben cumplirse). Usa "Limpiar filtro de producto" para volver a ver todo.

**¿Puedo conciliar un movimiento bancario sin haber creado el asiento contable primero?**
No. La conciliación busca coincidencias entre el movimiento importado y asientos contables ya existentes que afecten la cuenta contable vinculada a la cuenta bancaria. Si no aparece ningún candidato, primero registra el asiento correspondiente (pago, cobro, comisión bancaria, etc.) en Contabilidad → Asientos.

**Registré un activo fijo pero no veo la opción de generar su primera cuota de depreciación.**
El botón "Depreciar" solo aparece para activos con estado "activo". Al abrir el diálogo, selecciona el mes (AAAA-MM); si no hay una cuota programada para ese período o ya fue registrada, el sistema te lo indicará y no dejará confirmar.

**Cambié el régimen tributario en Configuración, ¿se actualizan automáticamente los comprobantes ya emitidos?**
No. El régimen controla qué comprobantes están disponibles para emitir **desde ahora en adelante** en toda la interfaz; no modifica comprobantes ya generados.

**¿Cómo agrego un nuevo vendedor o contador al sistema?**
Solo un usuario con rol `admin` puede hacerlo desde Usuarios → "Nuevo Usuario", asignando el rol correspondiente. El nuevo usuario inicia sesión con la contraseña temporal que le asignes.
