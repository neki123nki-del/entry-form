import { google } from 'googleapis';
import dotenv from 'dotenv';
import { Student } from '../src/types';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1Z2nIYNvdPD-mXECDPMnvJ7s_4s1nkTL2y8umZvc6caY';

export const getSheetsClient = async () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !key) {
    console.warn('[Sheets] Missing credentials in environment.');
    return null;
  }

  try {
    key = key.replace(/\\n/g, '\n').replace(/^["'](.*)["']$/, '$1').replace(/^'(.*)'$/, '$1');
    if (!key.includes('PRIVATE KEY')) {
      console.warn('[Sheets] Private key format invalid.');
      return null;
    }

    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('[Sheets] Client creation error:', error);
    return null;
  }
};

export const fetchStudentsFromSheet = async (): Promise<Student[] | null> => {
  const sheets = await getSheetsClient();
  if (!sheets) {
    console.warn('[Sheets] Cannot fetch students: Client not initialized.');
    return null;
  }

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Students!A2:E',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0 || (rows.length === 1 && rows[0].includes('Name'))) return null;

    return rows
      .filter(row => row && row[0] && row[0] !== 'ID' && row[0] !== 'Student Symbol')
      .map((row, index) => ({
        id: (row[0] || `S${index}`).toString().trim(),
        rollNo: (row[1] || '').toString().trim(),
        name: (row[2] || '').toString().trim(),
        faculty: (row[3] || '').toString().trim(),
        batch: (row[4] || '').toString().trim(),
      }));
  } catch (error: any) {
    console.error('[Sheets] Fetch error:', error.message);
    return null;
  }
};

export const appendAttendanceRecords = async (records: any[]): Promise<boolean> => {
  const sheets = await getSheetsClient();
  if (!sheets) return false;

  try {
    const values = records.map(record => [
      record.date,
      record.timestamp,
      record.studentId,
      record.studentName,
      record.rollNo,
      record.faculty,
      record.batch,
      record.status,
      record.workSubmission.classwork ? 'Yes' : 'No',
      record.workSubmission.classworkSubmission ? 'Yes' : 'No',
      record.workSubmission.assignment ? 'Yes' : 'No',
      record.notes || ''
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Attendance!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return true;
  } catch (error) {
    console.error('Error appending attendance:', error);
    throw error;
  }
};

export const bulkUpdateStudents = async (newStudents: Student[]): Promise<void> => {
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error('Google Sheets not linked. Add Service Account credentials in Settings > Secrets.');

  try {
    // 1. Fetch existing students to avoid duplicates
    const existingStudents = await fetchStudentsFromSheet() || [];
    const existingIds = new Set(existingStudents.map(s => s.id));

    // 2. Filter out duplicates
    const uniqueNewStudents = newStudents.filter(s => s.id && !existingIds.has(s.id));

    if (uniqueNewStudents.length === 0) {
      console.log('[Sheets] No new unique students to add.');
      return;
    }

    const values = uniqueNewStudents.map(s => [
      s.id,
      s.rollNo || '',
      s.name || '',
      s.faculty || '',
      s.batch || ''
    ]);

    console.log(`[Sheets] Appending ${values.length} new unique students to Students!A2...`);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Students!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  } catch (error: any) {
    console.error('[Sheets] Bulk update failed:', error);
    if (error.message?.includes('permission')) {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      throw new Error(`Permission Denied: Please share your Google Sheet with the Service Account email: ${email}`);
    }
    throw new Error(`Google Sheets Update Error: ${error.message || 'Unknown error'}`);
  }
};

export const getSheetConfig = () => ({
  spreadsheetId: SPREADSHEET_ID,
  isConfigured: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.includes('PRIVATE KEY')),
  aiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY')
});
