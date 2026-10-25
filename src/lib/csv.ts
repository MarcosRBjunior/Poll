// CSV para Excel e Google Sheets em pt-BR (D-11): separador ";", UTF-8 com BOM, linhas CRLF.

export const CSV_BOM = "﻿";

/**
 * Uma célula. Texto que começa com `=`, `+`, `-` ou `@` ganha o prefixo `'` para a planilha
 * não executá-lo como fórmula (RN-18). Separador, aspas ou quebra de linha pedem aspas.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function csvRow(cells: string[]): string {
  return `${cells.map(csvCell).join(";")}\r\n`;
}
