import jsPDF from 'jspdf';

export interface ColumnaPDF {
  key:    string;
  header: string;
  width:  number; // mm
  align?: 'left' | 'right' | 'center';
}

export interface GenerarTablaPDFOpts {
  titulo:        string;
  subtitulo?:    string;
  columnas:      ColumnaPDF[];
  filas:         Record<string, string>[];
  totales?:      Record<string, string>;
  nombreArchivo: string;
}

const MARGIN  = 8;
const ROW_H   = 6;
const HEAD_H  = 7;

function celda(doc: jsPDF, text: string, x: number, y: number, w: number, align: 'left' | 'right' | 'center' = 'left') {
  const linea = doc.splitTextToSize(text, w - 2)[0] ?? '';
  const tx = align === 'right' ? x + w - 1.5 : align === 'center' ? x + w / 2 : x + 1.5;
  doc.text(linea, tx, y, { align });
}

/** Genera y descarga un PDF de reporte tabular paginado, en orientación horizontal. */
export function generarTablaPDF(opts: GenerarTablaPDFOpts): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const anchoTabla = opts.columnas.reduce((s, c) => s + c.width, 0);

  let y = MARGIN;

  function drawColHeader() {
    doc.setFillColor(230, 230, 230);
    doc.setDrawColor(170, 170, 170);
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    let x = MARGIN;
    opts.columnas.forEach(c => {
      doc.rect(x, y, c.width, HEAD_H, 'FD');
      celda(doc, c.header, x, y + 4.6, c.width, c.align ?? 'left');
      x += c.width;
    });
    y += HEAD_H;
  }

  function drawPageHeader(first: boolean) {
    if (first) {
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(opts.titulo, PW / 2, y, { align: 'center' });
      y += 5;
      if (opts.subtitulo) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(opts.subtitulo, PW / 2, y, { align: 'center' });
        y += 5;
      }
      y += 2;
    }
    drawColHeader();
  }

  drawPageHeader(true);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setDrawColor(210, 210, 210);
  opts.filas.forEach((fila, i) => {
    if (y + ROW_H > PH - MARGIN - 10) {
      doc.addPage();
      y = MARGIN;
      drawPageHeader(false);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
    }
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(MARGIN, y, anchoTabla, ROW_H, 'F');
    }
    doc.setTextColor(30, 30, 30);
    let x = MARGIN;
    opts.columnas.forEach(c => {
      celda(doc, String(fila[c.key] ?? ''), x, y + 4.2, c.width, c.align ?? 'left');
      doc.rect(x, y, c.width, ROW_H, 'S');
      x += c.width;
    });
    y += ROW_H;
  });

  if (opts.totales) {
    if (y + ROW_H > PH - MARGIN - 10) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(235, 235, 235);
    doc.rect(MARGIN, y, anchoTabla, ROW_H, 'F');
    let x = MARGIN;
    opts.columnas.forEach(c => {
      celda(doc, String(opts.totales![c.key] ?? ''), x, y + 4.2, c.width, c.align ?? 'left');
      doc.rect(x, y, c.width, ROW_H, 'S');
      x += c.width;
    });
    y += ROW_H;
  }

  doc.save(opts.nombreArchivo);
}
