# Manual de Tributario

## ¿Qué hace este módulo?

El módulo **Tributario** agrupa todo lo relacionado con impuestos y obligaciones ante el SRI que
no son la emisión de comprobantes de venta en sí: configuración de porcentajes de retención,
emisión y registro de comprobantes de retención (electrónicos y recibidos), configuración de ICE,
generación del anexo ATS para el DIMM, y una serie de "formularios de apoyo" (104, 103, 105,
RIMPE y 101) que resumen la información ya registrada en el sistema (ventas, compras, retenciones)
en el formato de cada formulario del SRI.

Es importante tener claro desde el inicio: **algunos formularios son cálculos de referencia**
(ayudan a llenar la declaración pero no la presentan), mientras que las **Retenciones Emitidas sí
son comprobantes electrónicos reales** que se firman y se envían al SRI. Cada sección de este
manual aclara cuál es cuál.

Encuentras estas páginas en el menú **Tributario**:
- Retenciones (configuración)
- Retenciones Emitidas
- Retenciones Recibidas
- ICE
- ATS
- Formulario 104, 103, 105, RIMPE, 101

---

## Retenciones (Configuración)

### Para qué sirve

Aquí se mantiene el catálogo de **porcentajes de retención** que usa el resto del sistema
(retenciones emitidas, formulario 103, etc.). Hay dos tipos:
- **Retenciones en la Fuente IR** — por ejemplo honorarios profesionales, servicios, arrendamiento.
- **Retenciones IVA** — 30%, 70% o 100% del IVA según el tipo de bien/servicio.

### Cómo configurar los porcentajes de retención

1. Si la lista está vacía, la página muestra un botón **"Cargar Retenciones SRI"** que llena el
   catálogo con los códigos oficiales del SRI de una vez (función de "seed").
2. Para agregar una retención manualmente, usa el botón **"Nueva"** dentro de cada pestaña
   (Retenciones IR / Retenciones IVA). El formulario pide:
   - **Código SRI** (ej. `303`)
   - **Porcentaje (%)**
   - **Descripción** (ej. "Honorarios profesionales y demás pagos...")
   - **Tipo**: Fuente IR o IVA
   - **Aplica a**: Bienes, Servicios o Ambos
3. Cada fila de la tabla se puede **editar** (lápiz) o **eliminar** (basurero). Al editar aparece
   además el checkbox **Activo** — desactivar una retención la deja fuera de los selectores sin
   borrar su historial.
4. Las retenciones inactivas se muestran atenuadas (opacas) en la tabla pero no se eliminan del
   sistema.

---

## Retenciones Emitidas

### Para qué sirve

Esta es la emisión real de **comprobantes de retención electrónicos** (tipo de comprobante SRI
`07`) que la empresa entrega a sus **proveedores** cuando les retiene IR y/o IVA al pagarles una
factura. El comprobante se genera, se firma con el certificado .p12 configurado en SRI y se envía
al webservice del SRI para autorización — el mismo flujo que una factura electrónica.

### Cómo registrar una

1. Clic en **"Nueva Retención"**.
2. Selecciona la **Factura del proveedor** (solo aparecen facturas cuyo estado no es "pagada").
   El sistema muestra el subtotal sin IVA y el IVA de esa factura como referencia.
3. Agrega una o más **líneas de retención** con el botón **"+ Agregar"**:
   - **Tipo**: IR Fuente o IVA
   - **Código de retención** (viene del catálogo configurado en la sección anterior)
   - **Base imponible** — el sistema calcula el valor retenido automáticamente (`base × %`)
4. El **Total retenido** se muestra al pie del formulario en tiempo real.
5. Clic en **"Emitir y enviar al SRI"**. El sistema:
   - Valida que exista configuración SRI y que la empresa esté marcada como **agente de
     retención**.
   - Genera la clave de acceso, arma el XML, lo firma y lo envía a `/api/sri/procesar`.
   - Guarda el comprobante con estado `pendiente`, `autorizado` o `rechazado` según la respuesta
     del SRI.
   - Crea automáticamente el **asiento contable** correspondiente.
6. En la tabla de retenciones emitidas puedes:
   - **Descargar el RIDE** (ícono de descarga) de cualquier retención.
   - **Anular** una retención (ícono de prohibido) — esto revierte el asiento contable asociado
     y marca la retención como `anulado`. No está disponible si ya está anulada.

Los estados posibles se muestran con badges de color: pendiente (amarillo), autorizado (verde),
rechazado (rojo).

---

## Retenciones Recibidas

### Para qué sirve

Registra los comprobantes de retención que **los clientes** entregan a la empresa cuando le pagan
una venta y le retienen IR y/o IVA. A diferencia de las Retenciones Emitidas, aquí **no se genera
ni se envía XML al SRI** — es un registro manual del comprobante físico/electrónico que el cliente
ya emitió, para efectos contables y de reportes.

### Cómo registrar una

1. Clic en **"Registrar Retención"**.
2. Completa los datos del cliente: **Cliente / Razón Social**, **RUC / Cédula**.
3. Completa los datos del comprobante: **N° Comprobante Retención**, **Fecha Emisión**,
   **Ejercicio Fiscal**, y opcionalmente una **Referencia de Venta** (ID de la venta relacionada).
4. Agrega las **líneas de retención** con **"Agregar Línea"**. Cada línea tiene:
   - **Tipo**: Retención Fuente (IR) o Retención IVA
   - **Código** — se elige de una lista fija embebida en el sistema:
     - IR Fuente: 303 (Honorarios 10%), 304 (Servicios 2%), 307 (Arrendamiento 8%),
       310 (Transferencia bienes muebles 1%), 312 (Otras compras de bienes 1%),
       340 (Otras retenciones 1%), 332 (Seguros y reaseguros 1%)
     - IVA: 721 (Bienes 30%), 723 (Servicios 70%), 725 (100% del IVA)
   - **Base Imponible** — el sistema calcula el valor retenido automáticamente.
5. Al guardar, el sistema calcula el **Total retenido** (retención fuente + retención IVA) y
   genera el **asiento contable** correspondiente; la columna "Asiento" en la tabla indica con un
   badge Sí/No si quedó registrado.

---

## ICE

### Para qué sirve

Mantiene el catálogo de tarifas del **Impuesto a los Consumos Especiales** (tabacos, cigarrillos,
bebidas alcohólicas y similares), que luego alimenta el Formulario 105.

### Cómo usarlo

1. Si la tabla está vacía, usa **"Cargar Tarifas SRI"** para poblarla con las tarifas oficiales.
2. Para agregar una tarifa manualmente, clic en **"Nuevo"** / **"Nueva Tarifa ICE"**. El
   formulario pide:
   - **Código SRI** (ej. `3610`)
   - **Unidad** (litro, unidad, kg)
   - **Descripción**
   - **Tipo de tarifa**: Específica ($ por unidad), Ad Valorem (%), o Mixta (ambas)
   - Según el tipo elegido, aparecen los campos **Tarifa específica ($)** y/o
     **Tarifa ad valorem (%)**
3. Cada tarifa se puede editar o eliminar igual que en Retenciones. Las inactivas quedan
   atenuadas en la lista.
4. La página advierte que las tarifas ICE cambian con resoluciones del SRI (NAC-DGERCGC) y que
   siempre debe verificarse la vigente antes de declarar.

**Importante:** actualmente el vínculo entre productos vendidos y su código ICE **no está
implementado** — la tabla de tarifas es solo el catálogo; el cálculo automático del ICE causado
por ventas reales todavía no existe (ver sección Formulario 105).

---

## ATS (DIMM)

### Para qué sirve

Genera el **Anexo Transaccional Simplificado (ATS)** del mes seleccionado, en formato XML listo
para subir al **DIMM del SRI** (no se envía por webservice como las facturas electrónicas —
el DIMM es una herramienta aparte que se descarga del portal del SRI). El ATS se presenta de forma
mensual, como máximo hasta el día 28 del mes siguiente.

La página también muestra un resumen del período (ventas, compras, IVA neto, retenciones emitidas
y comprobantes anulados) y permite exportar el detalle a Excel.

### Cómo generar el XML paso a paso

1. Selecciona **Año** y **Mes** en los selectores superiores.
2. Revisa el resumen de tarjetas: Ventas del mes, Compras del mes, IVA neto, Retenciones emitidas
   y Comprobantes anulados del período.
3. Opcional: clic en **"Exportar Excel"** para bajar un archivo con tres hojas (Ventas, Compras,
   Retenciones) del período — útil para revisar antes de generar el XML.
4. Clic en **"Generar XML para DIMM"**. El sistema:
   - Trae la configuración SRI (RUC, razón social, establecimiento).
   - Arma los bloques `compras`, `ventas` (agrupadas por cliente y tipo de comprobante) y
     `anulados` con la información de facturas de proveedor, ventas y comprobantes anulados del
     mes.
   - Descarga automáticamente el archivo `ATS_<año>_<mes>.xml`.

### Corrección reciente de errores de validación

Se corrigieron tres problemas que hacían que el DIMM rechazara el XML generado:
- Se quitó un atributo `id` inválido que se estaba agregando al elemento raíz del XML.
- Se corrigió el código de `TipoIDInformante`: antes se enviaba `'04'`, ahora se envía `'R'`, que
  es el código correcto para RUC del informante según la tabla de códigos del SRI para ese campo.
- La **razón social** de la empresa se sanea automáticamente antes de escribirse en el XML: se
  quitan puntos y otros caracteres que el XSD del SRI no admite en ese campo (por ejemplo,
  `"S.A.S."` queda como `"SAS"`). Esta limpieza aplica solo al valor dentro del XML, no modifica
  el dato guardado en la configuración de la empresa.

Si el SRI/DIMM vuelve a rechazar el archivo por otro motivo, el validador indica el mensaje de
error específico con línea y columna del XML — hay que revisar ese detalle puntual (suele ser un
campo con un carácter no permitido o un formato de fecha/número incorrecto) en lugar de asumir que
es el mismo problema ya corregido.

### Cómo subirlo al DIMM del SRI (fuera del sistema)

1. Descarga e instala el programa DIMM Formularios desde el portal del SRI (fuera de este
   sistema).
2. Abre el módulo de Anexo Transaccional Simplificado dentro del DIMM.
3. Importa el archivo `ATS_<año>_<mes>.xml` generado por el sistema.
4. Revisa las validaciones que muestre el propio DIMM antes de enviar.
5. Envía la declaración desde el DIMM (esto genera el archivo final para subir a Servicios en
   Línea del SRI). El sistema de inventario **no realiza este envío** — solo prepara el XML de
   entrada.

---

## Formulario 104 – IVA

### Para qué sirve

Resumen mensual de apoyo para llenar el Formulario 104 (declaración de IVA) del SRI. **No se
presenta desde aquí** — es una vista de cálculo. La propia página lo indica: "Este es un resumen
de apoyo. Debes ingresar los valores al SRI en línea o en el DIMM."

Muestra, para el año/mes elegidos:
- **VENTAS**: campo 401 (ventas netas gravadas), 411 (ventas tarifa 0%, actualmente fijo en 0
  porque no hay productos exentos implementados), 415 (total ventas).
- **IVA GENERADO**: campo 500 (IVA generado por ventas).
- **CRÉDITO TRIBUTARIO**: campo 510 (IVA en compras) y 520 (base imponible de compras 15%).
- **LIQUIDACIÓN**: campo 601 (IVA a pagar) o 605 (crédito tributario a favor), destacado al final
  en rojo (a pagar) o verde (a favor).

Incluye botón **"Exportar Excel"** para bajar los mismos campos en una hoja de cálculo.

---

## Formulario 103 – Retenciones

### Para qué sirve

Muestra los **códigos de retención en la fuente IR configurados** (los mismos de la sección
Retenciones) junto con el número de facturas de proveedores y el total de compras del período
elegido.

**Aviso importante:** este formulario **todavía no calcula montos reales**. La tabla de códigos
siempre muestra base imponible y valor retenido en `$0.00` — es un placeholder que lista los
códigos disponibles, no un cálculo basado en las retenciones emitidas realmente. La propia página
lo advierte: *"El cálculo automático del Formulario 103 se habilitará cuando se implemente el
módulo de comprobantes de retención electrónicos."* (Nota: el módulo de Retenciones Emitidas ya
existe, pero el Formulario 103 todavía no está conectado a esos datos reales). Incluye botón
**"Exportar Excel"** aunque, con los valores en cero, su utilidad actual es limitada.

---

## Formulario 105 – ICE

### Para qué sirve

Resumen para la declaración mensual del **Impuesto a los Consumos Especiales**. Muestra el número
de ventas y el total de ventas del período, junto con la tabla de **tarifas ICE configuradas**
(código, descripción, tipo de tarifa, tarifa específica y ad valorem).

**Aviso importante:** al igual que el Formulario 103, este formulario es actualmente un
**placeholder de cálculo**: las columnas de unidades vendidas, base imponible e ICE calculado
siempre muestran `0`, porque los productos del inventario todavía no tienen asignado un código
ICE. La página lo indica explícitamente: *"Para el cálculo automático del ICE, los productos deben
tener asignado su código ICE correspondiente. Próximamente disponible."* Incluye botón
**"Exportar Excel"**.

---

## Formulario RIMPE

### Para qué sirve

Resumen de la obligación tributaria mensual bajo el régimen **RIMPE**, con dos variantes que se
detectan automáticamente según la configuración de la empresa (`regimen` en Configuración de
Empresa), aunque también se puede cambiar manualmente con el selector **"Tipo RIMPE"**:

- **RIMPE Emprendedor**: aplica una tasa del **2% sobre los ingresos brutos acumulados del
  ejercicio** (año hasta el mes seleccionado). Muestra los campos 101 (ingresos del mes), 102
  (ingresos acumulados), 201 (impuesto causado) y 299 (impuesto a pagar).
- **RIMPE Negocio Popular**: aplica una **cuota fija mensual** que no depende de los ingresos.
  Las cuotas están definidas en el código para 2024 ($60), 2025 y 2026 ($65) según la Resolución
  SRI NAC-DGERCGC22-00000026; el sistema advierte que este régimen solo emite notas de venta, sin
  IVA. Los ingresos del mes se muestran solo como dato informativo.

La página incluye selector de **Año**, **Mes** y **Tipo RIMPE**, tarjetas resumen, tabla de campos
del formulario, botón **"Exportar Excel"**, y una nota final recordando que la declaración
definitiva se presenta en el portal del SRI (Servicios en Línea → RIMPE) dentro de los primeros
28 días del mes siguiente.

---

## Formulario 101 – IR Anual

### Para qué sirve (estado real vs. lo esperado)

El `CLAUDE.md` del proyecto lista el "Formulario 101 IR anual" como módulo **pendiente**, pero al
revisar el código existe una página funcional en `app/(dashboard)/tributario/form-101/page.tsx`
que sí calcula un resumen anual — no es un simple placeholder vacío como el 103 o el 105. Aun así,
es un **cálculo orientativo**, no una presentación oficial: la propia página lo dice ("Resumen
anual para declaración de IR — orientativo, verifique con su contador").

Qué hace concretamente:
- Permite elegir el **Ejercicio fiscal** (año).
- Calcula **Total ingresos** a partir de las ventas no anuladas del año.
- Calcula **Costos y gastos** a partir de las facturas de proveedores del año más los asientos
  contables cuyo código de cuenta empieza con `5.` (cuentas de gasto).
- Calcula **Utilidad del ejercicio** = ingresos − gastos, **15% participación trabajadores**,
  **Base imponible**, e **Impuesto a la renta causado** aplicando la tabla progresiva de IR de
  personas naturales vigente para 2024 (tramos de 0% a 35%, embebida en el código).
- Muestra el resultado en una tabla de campos con códigos tipo SRI (601, 699, 710, 797, 801, 803,
  841, 849, 869) y también la tabla progresiva completa, resaltando el tramo aplicado.
- Botón **"Exportar Excel"** para bajar el detalle.
- **No considera retenciones recibidas como anticipo** todavía — el campo está en el código pero
  fijo en `0` ("Se configuraría con retenciones del período").

En resumen: es más que un placeholder, pero no reemplaza la declaración oficial ni conecta aún con
las retenciones recibidas registradas en el sistema — trátalo como un estimado para conversar con
el contador antes de declarar.

---

## Preguntas frecuentes / Tips

**¿Cuál es la diferencia entre Retenciones Emitidas y Retenciones Recibidas?**
Emitidas = la empresa retiene a sus proveedores y envía el comprobante al SRI (flujo electrónico
completo). Recibidas = un cliente le retuvo a la empresa y esta solo registra el dato para
contabilidad; no hay envío al SRI.

**¿Por qué no puedo emitir una retención a un proveedor?**
Verifica que: (1) la factura del proveedor no esté ya "pagada" (solo aparecen facturas pendientes
en el selector), (2) la configuración SRI exista y tenga marcado **agente de retención**, y
(3) el certificado .p12 esté cargado y la contraseña sea correcta.

**¿Los formularios 103, 105 y 101 presentan la declaración al SRI?**
No. Ninguno de los formularios de este módulo envía nada al SRI. Son resúmenes/calculadoras de
apoyo para preparar la declaración manual en el portal del SRI o en el DIMM. El único flujo que sí
firma y envía XML al SRI dentro de Tributario es **Retenciones Emitidas**.

**¿Por qué el Formulario 103 y el Formulario 105 muestran todo en $0.00?**
Porque todavía no están conectados a datos reales: el 103 no vincula retenciones emitidas reales
por factura, y el 105 no vincula productos con código ICE. Ambos son catálogos de referencia por
ahora, no cálculos completos.

**¿Cómo cargo los catálogos de retenciones o de ICE la primera vez?**
Usa los botones **"Cargar Retenciones SRI"** o **"Cargar Tarifas SRI"** que aparecen cuando la
tabla respectiva está vacía — llenan el catálogo oficial de una sola vez.

**¿Qué pasa si anulo una Retención Emitida?**
Se marca como `anulado` y se revierte automáticamente el asiento contable asociado (si existe). No
se puede anular una retención que ya está anulada.

**¿El ATS incluye los comprobantes anulados del mes?**
Sí, si hay comprobantes anulados en el período seleccionado se agrega un bloque `anulados` al XML
con el tipo de comprobante, establecimiento, punto de emisión, secuencial y autorización de cada
uno.

**Recordatorio de plazos:**
- ATS: hasta el día 28 del mes siguiente.
- Retenciones al proveedor: máximo 5 días hábiles desde la recepción de la factura.
- IVA (15% desde abril 2024): declaración mensual según noveno dígito del RUC.
