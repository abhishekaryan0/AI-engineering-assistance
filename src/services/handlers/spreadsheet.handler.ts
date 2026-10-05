import * as XLSX from 'xlsx';

export class SpreadsheetHandler {
  static process(buffer: Buffer, _sessionId: string, _filename: string): string {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach((sheetName: string) => {
      const sheet = workbook.Sheets[sheetName];
      const csvContent = XLSX.utils.sheet_to_csv(sheet);
      text += `--- SHEET: ${sheetName} ---\n${csvContent}\n\n`;
    });

    text +=
      '\n[System Note: This text was extracted from a Spreadsheet. Charts, Images, and Visuals in the Excel file are NOT included here, only textual/tabular data.]';

    return text;
  }
}
