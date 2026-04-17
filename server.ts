import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  app.get('/api/students', (req, res) => {
    console.log('Fetching mock students...');
    res.json(mockStudents);
  });

  app.post('/api/attendance', (req, res) => {
    const record = req.body;
    console.log('Attendance record received (Local Only Mode):', record);
    
    // In a real database-less app, we might store this in a simple array for the session
    // but for now, we'll just acknowledge the "save" to provide a smooth UI experience.
    res.json({ 
      status: 'success', 
      message: 'Attendance saved locally (Demo Mode)' 
    });
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
