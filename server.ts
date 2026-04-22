import express from 'express';
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
import { 
  syncSheetsToFirestore, 
  getFirebaseAdmin,
  saveAttendanceToFirestore,
  getFirestoreDiagnostics
} from './server/firebase.js';
import firebaseConfig from './firebase-applet-config.json';
import admin from 'firebase-admin';

dotenv.config();

// Critical Error Handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mockStudents = [
  { id: 'S001', rollNo: '101', name: 'John Doe', faculty: 'Engineering', batch: '2024' },
  { id: 'S002', rollNo: '102', name: 'Jane Smith', faculty: 'Engineering', batch: '2024' },
  { id: 'S003', rollNo: '201', name: 'Alice Brown', faculty: 'Business', batch: '2023' },
  { id: 'S004', rollNo: '202', name: 'Bob Wilson', faculty: 'Business', batch: '2023' },
];

export const app = express();

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
  app.get('/api/debug/permissions', async (req, res) => {
    try {
      const { testSheetsAccess } = await import('./server/sheets.js');
      const sheetsTest = await testSheetsAccess();
      const diagnostics = await getFirestoreDiagnostics();
      
      // Merge Sheets info into diagnostics
      res.json({
        ...diagnostics,
        checks: {
          ...diagnostics.checks,
          sheetsConnection: sheetsTest.success ? 'SUCCESS' : 'FAILED',
          sheetsError: sheetsTest.error || null
        }
      });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
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
      
      // Optional: Save to Firestore as backup
      try {
        await saveAttendanceToFirestore(req.body);
      } catch (e) {
        console.warn('[Sync] Firestore backup failed (Non-fatal):', e.message);
      }

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

      // Optional: Save to Firestore as backup
      try {
        for (const record of req.body.records) {
          await saveAttendanceToFirestore(record);
        }
      } catch (e) {
        console.warn('[Sync] Bulk Firestore backup failed (Non-fatal):', e.message);
      }

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
      
      // Trigger immediate sync to Firestore so UI updates fast
      try {
        const students = await fetchStudentsFromSheet();
        if (students) {
          await syncSheetsToFirestore(students);
          console.log(`[Sync] Immediate post-bulk sync successful for ${students.length} students.`);
        }
      } catch (syncErr) {
        console.warn('[Sync] Immediate post-bulk sync failed:', syncErr);
      }

      res.json({ status: 'success', message: `${req.body.students.length} students synchronized to Google Sheets!` });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

// --- Vercel Export OR Local Server Start ---

if (!process.env.VERCEL) {
  // We only run this full server setup locally or on Cloud Run, NOT on Vercel Serverless
  const startServer = async () => {
    const PORT = parseInt(process.env.PORT || '3000', 10);
    
    // --- Vite & Production Setup ---
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
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
      }
      
      // Initial sync and then every 10 minutes
      const runSync = async () => {
        try {
          console.log('[Sync] Starting Sheets -> Firestore background sync...');
          const students = await fetchStudentsFromSheet();
          if (students) {
            await syncSheetsToFirestore(students);
          }
        } catch (error) {
          console.error('[Sync] Background sync failed:', error);
        }
      };
      
      setTimeout(runSync, 5000);
      setInterval(runSync, 10 * 60 * 1000);
    });
  };

  startServer();
}
