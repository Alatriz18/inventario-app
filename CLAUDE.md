# Sistema de Inventario, Ventas y Contabilidad — Ecuador

## Contexto del proyecto
Sistema web completo para gestión de inventario, ventas y contabilidad,
diseñado específicamente para negocios ecuatorianos con integración al SRI.

**Stack:** Next.js 14 (App Router) + Firebase Firestore + TypeScript + Tailwind CSS + shadcn/ui  
**Deploy:** Vercel (frontend) + Firebase (backend/DB)  
**Desarrollador:** Kevin Santana

---

## Estado actual del proyecto (Junio 2025)

### ✅ Módulos completos
- Autenticación (Firebase Auth, roles: admin/vendedor/bodeguero/contador)
- Inventario (productos, categorías, bodegas, entradas, despachos, movimientos)
- Ventas — POS + historial + clientes
- Facturación SRI — Factura electrónica XML v1.1.0 + Nota de venta + Firmador XAdES-BES (.p12)
- Cuentas por Pagar (CxP) — facturas proveedor, pagos, parser XML SRI
- Contabilidad — Plan de cuentas NEC/NIIF, motor de asientos automáticos, libro diario/mayor, balances
- Tributario — Retenciones config, ICE, ATS, Form-103/104/105
- RIDE PDF — generador completo (autorizado, borrador, recibo interno)
- Configuración de empresa por régimen tributario (general, RIMPE, artesano, exportador, contribuyente especial)
- Asientos editables con sincronización bidireccional (editar venta → recalcula asiento, editar asiento → marca editadoManualmente)
- Períodos contables con bloqueo automático de asientos al cerrar

### ❌ Módulos pendientes (en orden de prioridad)
1. **Módulo CxC** (Cuentas por Cobrar) — ventas a crédito, cobros parciales, aging 30/60/90 días, retenciones recibidas
2. **Notas de crédito electrónicas SRI** — anulación parcial/total de facturas
3. **Notas de débito electrónicas SRI**
4. **Conciliación bancaria**
5. **Comprobantes de retención electrónicos SRI**
6. **Activos fijos con depreciación NIIF**
7. **Formulario 101 IR anual / Declaración RIMPE**

---

## Arquitectura y convenciones

### Estructura de carpetas
```
app/(dashboard)/          → páginas protegidas
app/api/sri/              → API routes para firma y envío al SRI
lib/firebase/             → CRUD de Firestore (un archivo por colección)
lib/sri/                  → generadores XML, firmador, webservice, RIDE PDF
lib/contabilidad/         → motor de asientos automáticos
hooks/                    → hooks reutilizables (useRIDE, etc.)
types/index.ts            → todos los tipos TypeScript del proyecto
components/shared/        → Sidebar, Header, PageHeader
components/ui/            → shadcn/ui components
```

### Colecciones Firestore
- `productos`, `categorias`, `bodegas`, `proveedores`, `clientes`
- `ventas`, `entradas`, `despachos`, `movimientos`
- `comprobantes` — facturas/notas de venta emitidas al SRI
- `facturas_proveedor`, `pagos_proveedor`
- `asientos` — libro contable (con campos: referenciaId, referenciaTipo, bloqueado, editadoManualmente)
- `plan_cuentas`, `centros_costo`, `periodos_contables`
- `config_sri` (doc: 'config') — credenciales SRI, secuenciales, certificado .p12
- `config_empresa` (doc: 'config') — régimen tributario, comprobantes habilitados
- `config_contable` (doc: 'config') — mapeo de cuentas contables
- `retenciones_config`, `ice_config`

### Patrones importantes

**Asientos automáticos + sincronización bidireccional:**
- Cada operación (venta, compra, pago) llama a `crearAsiento*()` en `lib/contabilidad/motor-asientos.ts`
- Al editar una operación se llama `recalcularAsiento*()` que busca el asiento por `referenciaId`
- Si el asiento fue editado manualmente (`editadoManualmente=true`), NO se sobreescribe salvo `forzar:true`
- Al cerrar un período contable, sus asientos quedan `bloqueado=true`

**Comprobantes SRI:**
- Flujo: generar XML → firmar con .p12 → enviar a webservice → consultar autorización
- API route: `POST /api/sri/procesar` recibe `{xml, p12Base64, password, claveAcceso, ambiente}`
- Ambiente 1 = pruebas (celcer.sri.gob.ec), Ambiente 2 = producción (cel.sri.gob.ec)

**Configuración de régimen tributario:**
- `lib/firebase/config-empresa.ts` → `getDefaultsRegimen(regimen)` devuelve comprobantes habilitados y reglas tributarias
- El régimen controla qué comprobantes aparecen disponibles en toda la UI

**RIDE PDF:**
- `lib/sri/ride-pdf.ts` → `generarRIDE(datos: DatosRIDE)` → retorna Uint8Array
- `descargarRIDE()` y `abrirRIDEenNuevaPestana()` para usar en el browser
- `hooks/useRIDE.ts` → hook que conecta un Comprobante de Firestore con el generador

### Normas de Ecuador importantes
- IVA: 15% desde abril 2024 (antes era 12%)
- Código IVA en XML SRI: `codigoPorcentaje = '4'` para 15%, `'0'` para 0%
- Clave de acceso: 49 dígitos (fecha+tipoDoc+RUC+ambiente+serie+secuencial+codigoNum+tipoEmision+dígVerif)
- Retenciones: plazo máximo 5 días hábiles desde recepción de factura del proveedor
- ATS: presentación mensual, máximo hasta el 28 del mes siguiente
- RIMPE Negocio Popular: solo notas de venta, sin IVA, cuota fija mensual
- ICE: aplica a tabacos, cigarrillos, bebidas alcohólicas — declaración mensual Form 105

### Librerías clave
- `xmlbuilder2` — generación de XML SRI
- `node-forge` — firma XAdES-BES del XML
- `jsPDF` — generación del RIDE PDF
- `react-hook-form` + `zod` — formularios con validación
- `sonner` — toasts/notificaciones
- `date-fns` — manejo de fechas
- `xlsx` — exportación a Excel

---

## Reglas de código

1. **Siempre TypeScript estricto** — no usar `any` salvo casos justificados
2. **Un archivo por colección** en `lib/firebase/`
3. **Transacciones Firestore** para operaciones que tocan stock + movimientos + asientos simultáneamente
4. **shadcn/ui** para todos los componentes UI
5. **PageHeader** component para el encabezado de cada página
6. **toast** de sonner para feedback al usuario
7. **Tailwind CSS** para estilos — no CSS modules ni styled-components
8. Al crear un asiento automático, siempre incluir `referenciaId` y `referenciaTipo` para poder recalcular
9. El campo `obligadoContabilidad` en la config SRI determina si el sistema genera asientos o no

