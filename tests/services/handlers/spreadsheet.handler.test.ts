/**
 * Spreadsheet Handler Tests
 * Tests for spreadsheet processing and conversion
 */

import { SpreadsheetHandler } from '../../../src/services/handlers/spreadsheet.handler';
import * as XLSX from 'xlsx';

jest.mock('xlsx', () => {
  return {
    read: jest.fn(() => ({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {},
      },
    })),
    utils: {
      sheet_to_csv: jest.fn(() => 'id,name\n1,test'),
    },
  };
});

describe('Spreadsheet Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should process spreadsheet and return CSV content', () => {
      const buffer = Buffer.from('mock-excel-content');

      const result = SpreadsheetHandler.process(buffer, 'session-id', 'test.xlsx');

      expect(result).toContain('--- SHEET: Sheet1 ---');
      expect(result).toContain('id,name');
      expect(result).toContain('1,test');
      expect(XLSX.read).toHaveBeenCalledWith(buffer, { type: 'buffer' });
    });

    it('should handle multiple sheets', () => {
      (XLSX.read as jest.Mock).mockReturnValueOnce({
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {},
          Sheet2: {},
        },
      });
      (XLSX.utils.sheet_to_csv as jest.Mock)
        .mockReturnValueOnce('s1-data')
        .mockReturnValueOnce('s2-data');

      const buffer = Buffer.from('multi-sheet');
      const result = SpreadsheetHandler.process(buffer, 'session-id', 'multi.xlsx');

      expect(result).toContain('--- SHEET: Sheet1 ---');
      expect(result).toContain('s1-data');
      expect(result).toContain('--- SHEET: Sheet2 ---');
      expect(result).toContain('s2-data');
    });

    it('should handle empty sheet', () => {
      (XLSX.utils.sheet_to_csv as jest.Mock).mockReturnValueOnce('');

      const buffer = Buffer.from('empty-sheet');
      const result = SpreadsheetHandler.process(buffer, 'session-id', 'empty.xlsx');

      expect(result).toContain('--- SHEET: Sheet1 ---');
      // Check if it handles empty content gracefully (it should just double newline)
    });

    it('should add system note at the end', () => {
      const buffer = Buffer.from('content');
      const result = SpreadsheetHandler.process(buffer, 'session-id', 'test.xlsx');

      expect(result).toContain('[System Note: This text was extracted from a Spreadsheet');
    });

    it('should handle error during read', () => {
      (XLSX.read as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Read error');
      });

      const buffer = Buffer.from('bad-file');

      expect(() => {
        SpreadsheetHandler.process(buffer, 'session-id', 'bad.xlsx');
      }).toThrow('Read error');
    });
  });
});
