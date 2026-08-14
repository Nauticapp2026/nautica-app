/**
 * Regenera public/templates/socios.xlsx sin hipervínculos en la fila de ejemplo.
 * Corrige el bug donde Excel guarda el email de la fila de ejemplo como hipervínculo
 * y al editarlo mantiene el URL interno apuntando al email original.
 *
 * Uso: node scripts/generate-socios-template.mjs
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '..', 'public', 'templates', 'socios.xlsx');

const TEAL = 'FF175861';
const TEAL_LIGHT = 'FFE8F4F4';
const GRAY_HEADER = 'FF4B5563';
const GRAY_HINT = 'FF6B7280';
const WHITE = 'FFFFFFFF';

const COLUMNS = [
  { header: 'nombre *',           hint: 'Nombre del socio',                        key: 'nombre',           width: 20 },
  { header: 'apellido *',         hint: 'Apellido del socio',                       key: 'apellido',         width: 20 },
  { header: 'email *',            hint: 'Email (se usa para enviar la invitación)', key: 'email',            width: 28 },
  { header: 'telefono',           hint: 'Teléfono (opcional)',                      key: 'telefono',         width: 18 },
  { header: 'direccion',          hint: 'Calle, sin el número (opcional)',          key: 'direccion',        width: 25 },
  { header: 'numero',             hint: 'Número de la calle (opcional)',            key: 'numero',           width: 10 },
  { header: 'tipo_documento',     hint: 'DNI, CUIT o CUIL',                         key: 'tipo_documento',   width: 16 },
  { header: 'numero_documento',   hint: 'Número de documento',                      key: 'numero_documento', width: 18 },
  { header: 'razon_social',       hint: 'Razón social (si factura como empresa)',   key: 'razon_social',     width: 25 },
  { header: 'condicion_iva',      hint: 'Responsable Inscripto, Monotributista, Consumidor Final, Exento o No Responsable', key: 'condicion_iva', width: 28 },
];

const EXAMPLE_ROW = [
  'Juan',
  'García',
  'juan.garcia@ejemplo.com',   // texto plano, sin hipervínculo
  '11-1234-5678',
  'Av. Costanera',
  '123',
  'DNI',
  '12345678',
  '',
  'Consumidor Final',
];

const workbook = new ExcelJS.Workbook();
workbook.creator = 'NauticApp';

// ── Hoja Datos ──────────────────────────────────────────────────────────────
const ws = workbook.addWorksheet('Datos', {
  views: [{ state: 'frozen', ySplit: 2 }],
});

ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

// Fila 1: headers
const headerRow = ws.getRow(1);
COLUMNS.forEach((col, i) => {
  const cell = headerRow.getCell(i + 1);
  cell.value = col.header;
  cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    bottom: { style: 'thin', color: { argb: WHITE } },
    right: { style: 'thin', color: { argb: WHITE } },
  };
});
headerRow.height = 28;

// Fila 2: hints
const hintRow = ws.getRow(2);
COLUMNS.forEach((col, i) => {
  const cell = hintRow.getCell(i + 1);
  cell.value = col.hint;
  cell.font = { italic: true, color: { argb: GRAY_HINT }, size: 9 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_LIGHT } };
  cell.alignment = { vertical: 'middle', wrapText: true };
});
hintRow.height = 32;

// Fila 3: ejemplo — todos los valores como strings planos, sin hipervínculos
const exampleRow = ws.getRow(3);
EXAMPLE_ROW.forEach((val, i) => {
  const cell = exampleRow.getCell(i + 1);
  // Asignar explícitamente como string para evitar que ExcelJS cree hipervínculos
  cell.value = val;
  cell.font = { color: { argb: GRAY_HEADER }, size: 10, italic: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
});

// Filas 4-50: vacías con formato de datos
for (let r = 4; r <= 50; r++) {
  const row = ws.getRow(r);
  COLUMNS.forEach((_, i) => {
    const cell = row.getCell(i + 1);
    cell.font = { size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    cell.border = {
      bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    };
  });
  row.height = 20;
}

// ── Hoja Instrucciones ───────────────────────────────────────────────────────
const wsInst = workbook.addWorksheet('Instrucciones');
wsInst.getColumn(1).width = 80;

const instructions = [
  ['INSTRUCCIONES DE USO'],
  [''],
  ['1. Completá los datos a partir de la fila 3 de la hoja "Datos".'],
  ['2. La fila 3 es un ejemplo — podés reemplazarla con datos reales.'],
  ['3. Los campos marcados con * son obligatorios: nombre, apellido y email.'],
  ['4. El email debe ser válido. Se usa para enviar la invitación al socio.'],
  ['   IMPORTANTE: al escribir el email, escribilo como texto plano.'],
  ['   Si el email queda azul/subrayado (hipervínculo), seleccioná la celda,'],
  ['   borrala con Delete y volvé a escribir el email.'],
  [''],
  ['Columnas opcionales:'],
  ['  - telefono: cualquier formato (ej: 11-1234-5678)'],
  ['  - tipo_documento: DNI, CUIT o CUIL'],
  ['  - numero_documento: solo números'],
  ['  - condicion_iva: Responsable Inscripto, Monotributista,'],
  ['    Consumidor Final, Exento, No Responsable'],
];

instructions.forEach(([text], i) => {
  const cell = wsInst.getRow(i + 1).getCell(1);
  cell.value = text ?? '';
  if (i === 0) cell.font = { bold: true, size: 13, color: { argb: TEAL } };
  else cell.font = { size: 11 };
});

await workbook.xlsx.writeFile(OUTPUT);
console.log(`Template regenerado: ${OUTPUT}`);
