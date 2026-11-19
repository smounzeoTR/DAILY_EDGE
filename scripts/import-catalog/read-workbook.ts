// .xlsx file -> plain rows keyed by header (formula cells give their cached result).
import ExcelJS from 'exceljs';

import type { CellValue, SheetRow, Workbook } from './types.ts';

function cellValue(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === 'string' || typeof result === 'number' ? result : null;
  }
  if ('text' in value) return String(value.text);
  return null;
}

export async function readWorkbook(path: string): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const out: Workbook = {};
  for (const ws of wb.worksheets) {
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cellValue(cell.value) ?? '').trim();
    });
    const rows: SheetRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells: Record<string, CellValue> = {};
      let empty = true;
      headers.forEach((header, i) => {
        if (!header) return;
        const value = cellValue(row.getCell(i + 1).value);
        if (value !== null && String(value).trim() !== '') empty = false;
        cells[header] = value;
      });
      if (!empty) rows.push({ rowNumber, cells });
    });
    out[ws.name] = { headers: headers.filter(Boolean), rows };
  }
  return out;
}
