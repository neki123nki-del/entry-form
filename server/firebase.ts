import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import firebaseConfig from '../firebase-applet-config.json';

let db: any = null;

export function getFirebaseAdmin() {
  if (db) return db;

  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    const appName = 'edu-track-backend';
    let app = admin.apps.find(a => a?.name === appName);

    if (!app) {
      let medicalCredential;
      
      if (email && key) {
      console.log('[Firebase Admin] Initializing with Service Account:', email);
      key = key.replace(/\\n/g, '\n').trim();
      
      // Clean up common copy-paste errors
      if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
      if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
      
      if (!key.includes('PRIVATE KEY')) {
        throw new Error('Invalid private key format. Missing BEGIN/END PRIVATE KEY labels.');
      }

      medicalCredential = admin.credential.cert({
        projectId: firebaseConfig.projectId,
        clientEmail: email,
        privateKey: key
      });
    } else {
        console.warn('[Firebase Admin] No Service Account found. Using Application Default Credentials.');
        console.warn('[Firebase Admin] Target Project:', firebaseConfig.projectId);
        medicalCredential = admin.credential.applicationDefault();
      }

      app = admin.initializeApp({
        credential: medicalCredential,
        projectId: firebaseConfig.projectId // Force the project ID from config
      }, appName);
    }
    
    // Use getFirestore from firebase-admin/firestore to target the specific databaseId
    db = getFirestore(app!, firebaseConfig.firestoreDatabaseId);
    console.log('[Firebase Admin] Initialized for project:', firebaseConfig.projectId);
    console.log('[Firebase Admin] Database ID:', firebaseConfig.firestoreDatabaseId);
    return db;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    return null;
  }
}

export async function syncSheetsToFirestore(students: any[]) {
  const firestore = getFirebaseAdmin();
  if (!firestore) return;

  const batch = firestore.batch();
  const studentsCol = firestore.collection('students');

  students.forEach(student => {
    const docRef = studentsCol.doc(student.id);
    batch.set(docRef, student, { merge: true });
  });

  try {
    await batch.commit();
  } catch (error: any) {
    if (error.message?.includes('PERMISSION_DENIED') || error.code === 7) {
      console.error('\n' + '='.repeat(50));
      console.error('🔥 FIREBASE PERMISSION ERROR (NON-FATAL) 🔥');
      console.error('The backend fetched data from Sheets correctly, but could not save a backup to Firestore.');
      console.error('Active Project ID:', firebaseConfig.projectId);
      console.error('\nTO FIX THIS:');
      console.error('Ensure your Service Account has "Firebase Editor" role in Google Cloud Console.');
      console.error('='.repeat(50) + '\n');
      return; // Soft failure - don't throw, just exit sync silently
    }
    throw error;
  }
}

export async function saveAttendanceToFirestore(record: any) {
  const firestore = getFirebaseAdmin();
  if (!firestore) return;

  const attendanceCol = firestore.collection('attendance');
  try {
    await attendanceCol.add({
      ...record,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error: any) {
    if (error.message?.includes('PERMISSION_DENIED') || error.code === 7) {
      console.error('[Firebase Admin] Permission Denied while saving attendance (Non-fatal). Data was likely still saved to Google Sheets.');
      return; 
    }
    throw error;
  }
}
