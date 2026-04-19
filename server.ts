import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import our "Backend Bridge" modules
import { 
  fetchStudentsFromSheet, 
  appendAttendanceRecords, 
  bulkUpdateStudents, 
  getSheetConfig 
} from './server/sheets.js';
import { scanStudentList } from './server/ai.js';
import { syncSheetsToFirestore } from './server/firebase.js';
import firebaseConfig from './firebase-applet-config.json';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mockStudents = [
  { id: 'S001', rollNo: '101', name: 'John Doe', faculty: 'Engineering', batch: '2024' },
  { id: 'S002', rollNo: '102', name: 'Jane Smith', faculty: 'Engineering', batch: '2024' },
  { id: 'S003', rollNo: '201', name: 'Alice Brown', faculty: 'Business', batch: '2023' },
  { id: 'S004', rollNo: '202', name: 'Bob Wilson', faculty: 'Business', batch: '2023' },
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' })); // Increased limit for image uploads

  // --- API Routes (The Bridge) ---

  // Sync endpoint (also called periodically)
  app.post('/api/sync', async (req, res) => {
    try {
      const students = await fetchStudentsFromSheet();
      if (students) {
        await syncSheetsToFirestore(students);
        res.json({ status: 'success', message: 'Synced Sheets to Firestore' });
      } else {
        res.status(404).json({ status: 'error', message: 'No students found in Sheets' });
      }
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Debug Permissions
  app.get('/api/debug/permissions', (req, res) => {
    const config = getSheetConfig();
    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const hasKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    
    res.json({
      status: 'diagnostic',
      checks: {
        firebaseConfigExists: !!firebaseConfig,
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId,
        serviceAccountEmail: serviceEmail || 'MISSING',
        serviceAccountKey: hasKey ? 'PRESENT' : 'MISSING',
        sheetConfigured: config.isConfigured
      },
      instructions: !serviceEmail ? [
        "1. Create a Service Account in Google Cloud Console.",
        "2. Add the email to GOOGLE_SERVICE_ACCOUNT_EMAIL secret.",
        "3. Add the private key to GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY secret.",
        "4. Share your Google Sheet with the Service Account email."
      ] : [
        "1. Ensure the Service Account email is shared to your Google Sheet.",
        "2. Ensure the Service Account has 'Firebase Editor' or 'Cloud Datastore User' role."
      ]
    });
  });

  // Fetch student list
  app.get('/api/students', async (req, res) => {
    const students = await fetchStudentsFromSheet();
    res.json(students || mockStudents);
  });

  // Save single attendance
  app.post('/api/attendance', async (req, res) => {
    try {
      const success = await appendAttendanceRecords([req.body]);
      if (success) {
        res.json({ status: 'success', message: 'Attendance saved directly to Google Sheets!' });
      } else {
        res.json({ status: 'success', message: 'Attendance saved locally (Demo Mode).' });
      }
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Save bulk attendance
  app.post('/api/attendance/bulk', async (req, res) => {
    try {
      const success = await appendAttendanceRecords(req.body.records);
      if (success) {
        res.json({ status: 'success', message: `${req.body.records.length} records saved to Google Sheets!` });
      } else {
        res.json({ status: 'success', message: `${req.body.records.length} records processed (Demo Mode).` });
      }
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // AI-powered Scanning bridge
  app.post('/api/scan', async (req, res) => {
    try {
      const { base64Data, mimeType } = req.body;
      const students = await scanStudentList(base64Data, mimeType);
      res.json(students);
    } catch (error: any) {
      console.error('Scan Bridge Error:', error.message);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Sync scanned students to sheet
  app.post('/api/students/bulk', async (req, res) => {
    try {
      await bulkUpdateStudents(req.body.students);
      res.json({ status: 'success', message: `${req.body.students.length} students synchronized to Google Sheets!` });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // --- Vite & Production Setup ---
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
    console.log(`Backend Bridge running on http://localhost:${PORT}`);
    
    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (serviceEmail) {
      console.log(`[Google Cloud] Service Account active: ${serviceEmail}`);
      console.log(`[Google Cloud] IMPORTANT: Ensure this email has "Editor" access to your Spreadsheet.`);
    }
    
    // Initial sync and then every 10 minutes
    const runSync = async () => {
      try {
        console.log('[Sync] Starting Sheets -> Firestore background sync...');
        const students = await fetchStudentsFromSheet();
        if (students) {
          await syncSheetsToFirestore(students);
          console.log(`[Sync] Successfully synced ${students.length} students.`);
        }
      } catch (error) {
        console.error('[Sync] Background sync failed:', error);
      }
    };
    runSync();
    setInterval(runSync, 10 * 60 * 1000);
  });
}

startServer();
