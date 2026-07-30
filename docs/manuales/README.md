# Manuales de Usuario — Sistema de Inventario, Ventas y Contabilidad

Manuales prácticos para usar el sistema, organizados por módulo tal como aparecen en el menú lateral. Escritos en español, basados en la aplicación real (campos, botones y validaciones tal como existen hoy en el código, no funcionalidad planificada).

## Índice

1. [Inventario](01-inventario.md) — Productos, Categorías, Bodegas, Proveedores, Entradas, Despachos, Movimientos, Kardex
2. [Ventas](02-ventas.md) — Punto de Venta (POS), Historial de Ventas, Recibos Internos, Clientes
3. [Facturación SRI](03-facturacion-sri.md) — Configuración SRI, Emitir Comprobante, Comprobantes, Notas de Crédito/Débito
4. [Cuentas por Cobrar y por Pagar](04-cxc-cxp.md) — Saldos y Cobros, Cartera, Facturas de Proveedores, Pagos Pendientes
5. [Contabilidad](05-contabilidad.md) — Plan de Cuentas, Asientos automáticos y su sincronización con ventas/compras, Libros, Balances, Períodos
6. [Tributario](06-tributario.md) — Retenciones, ICE, ATS (DIMM), Formularios 101/103/104/105/RIMPE
7. [Dashboard, Reportes y Administración](07-otros-modulos.md) — Dashboard, Reportes, Activos Fijos, Conciliación Bancaria, Usuarios y Roles, Configuración

## Cómo están hechos estos manuales

Cada manual fue redactado leyendo directamente el código fuente de cada pantalla (no se documentó nada "de memoria" ni funcionalidad planeada a futuro). Cuando un módulo está incompleto o es solo un cálculo de referencia (por ejemplo, ciertos formularios tributarios), el manual lo dice explícitamente en vez de dar a entender que está terminado.

## Hallazgos útiles al escribir estos manuales

Cosas que el equipo debería conocer, encontradas durante la redacción:

- **Aging de cartera (30/60/90 días)** ya está implementado en Cuentas por Cobrar → Saldos y Cobros, aunque el `CLAUDE.md` del proyecto lo listaba como módulo pendiente.
- **Formulario 101 (IR Anual)** también está implementado con un cálculo real, no es solo un placeholder — igualmente marcado como pendiente en `CLAUDE.md`.
- **Formularios 103 (Retenciones) y 105 (ICE)** son placeholders: la pantalla existe pero siempre muestra $0, no están conectados a datos reales todavía.
- **Activos Fijos** está bastante completo: registro, cálculo de cuotas de depreciación y generación del asiento contable correspondiente.
- **Conciliación Bancaria** es básica: importación manual por CSV con formato fijo y conciliación manual (sin matching automático ni integración bancaria real), tal como advierte el `CLAUDE.md`.
- El sistema de roles (`lib/permisos.ts`) tiene **5 roles**, no 4: `admin`, `vendedor`, `bodeguero`, `contador` y **`finanzas`** — este último no estaba mencionado en la documentación previa del proyecto.

## Mantenimiento

Si se agregan o cambian pantallas, actualiza el manual correspondiente. No hace falta regenerar todos — cada archivo es independiente por módulo.
