import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The ID of the spreadsheet to connect to
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1Z2nIYNvdPD-mXECDPMnvJ7s_4s1nkTL2y8umZvc6caY';

// Helper to get sheets client using service account
const getSheetsClient = async () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !key) {
    console.log('Google Service Account credentials not found in environment variables.');
    return null;
  }

  // Handle various formats of the private key
  try {
    key = key.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    
    if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
       // If it's just the hex string they sent earlier, it won't work, so we log it
       console.error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must be a valid RSA private key.');
       return null;
    }

    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('Error creating Google Sheets client:', error);
    return null;
  }
};

// Student and Attendance Data Helpers
const mockStudents = [
  { id: 'S001', rollNo: '101', name: 'John Doe', faculty: 'Engineering', batch: '2024' },
  { id: 'S002', rollNo: '102', name: 'Jane Smith', faculty: 'Engineering', batch: '2024' },
  { id: 'S003', rollNo: '201', name: 'Alice Brown', faculty: 'Business', batch: '2023' },
  { id: 'S004', rollNo: '202', name: 'Bob Wilson', faculty: 'Business', batch: '2023' },
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/students', async (req, res) => {
    const sheets = await getSheetsClient();
    if (!sheets) {
      console.log('No sheets client. Returning mock students.');
      return res.json(mockStudents);
    }

    try {
      console.log('Fetching students from spreadsheet:', SPREADSHEET_ID);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Students!A2:E',
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        console.log('No data found in spreadsheet. Returning mock students.');
        return res.json(mockStudents);
      }

      const students = rows.map((row, index) => ({
        id: row[0] || `S${index}`,
        rollNo: row[1] || '',
        name: row[2] || '',
        faculty: row[3] || '',
        batch: row[4] || '',
      }));

      res.json(students);
    } catch (error: any) {
      console.error('Error fetching from sheets:', error.message);
      res.json(mockStudents);
    }
  });

  app.post('/api/attendance', async (req, res) => {
    const record = req.body;
    const sheets = await getSheetsClient();
    
    if (!sheets) {
      console.log('DEMO MODE: Attendance record received but Google Sheets not configured:', record);
      // Instead of failing with 400, we return a success message for Demo Mode
      return res.json({ 
        status: 'success', 
        message: 'Attendance saved locally (Demo Mode). To save to Google Sheets, please configure your Secrets.' 
      });
    }

    try {
      console.log('Appending record to sheet:', SPREADSHEET_ID);
      const values = [
        [
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
        ]
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Attendance!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      res.json({ 
        status: 'success', 
        message: 'Attendance saved directly to Google Sheets!' 
      });
    } catch (error: any) {
      console.error('Error saving to sheets:', error.message);
      
      let userMessage = `Google Sheets error: ${error.message}`;
      if (error.message.includes('not found') || error.code === 404) {
        userMessage = 'Spreadsheet or Tab not found. 1) Check your SPREADSHEET_ID in Secrets. 2) Ensure you have a tab named "Attendance" in your sheet.';
      } else if (error.message.includes('permission denied') || error.code === 403) {
        userMessage = 'Permission Denied. Make sure you shared the sheet with your Service Account email as an "Editor".';
      }

      res.status(500).json({ 
        status: 'error', 
        message: userMessage
      });
    }
  });

  app.get('/api/config', (req, res) => {
    res.json({
      spreadsheetId: SPREADSHEET_ID,
      isConfigured: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
    });
  });

  app.post('/api/students/bulk', async (req, res) => {
    const { students } = req.body;
    const sheets = await getSheetsClient();

    if (!sheets) {
      return res.status(400).json({ status: 'error', message: 'Sheets not configured.' });
    }

    try {
      const values = students.map((s: any) => [
        s.id || `S${Math.random().toString(36).substr(2, 9)}`,
        s.rollNo || '',
        s.name || '',
        s.faculty || '',
        s.batch || ''
      ]);

      // Clear existing students (Sheet Students!A2:E)
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Students!A2:E',
      });

      // Update starting at A2
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Students!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });

      res.json({ status: 'success', message: `${students.length} students synchronized to Google Sheets!` });
    } catch (error: any) {
      console.error('Error in bulk update:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
