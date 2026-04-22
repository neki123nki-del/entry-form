import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import firebaseConfig from '../firebase-applet-config.json';

let db: any = null;
let initializationPromise: Promise<any> | null = null;

export async function getFirebaseAdmin() {
  if (db) return db;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

      const appName = 'edu-track-backend';
      let app = admin.apps.find(a => a?.name === appName);

      if (!app) {
        let credential;
        
        if (email && key) {
          console.log('[Firebase Admin] Initializing with Service Account:', email);
          console.log('[Firebase Admin] Target Project ID:', firebaseConfig.projectId);
          console.log('[Firebase Admin] Target Database ID:', firebaseConfig.firestoreDatabaseId || '(default)');
          
          // Clean up common copy-paste errors
          key = key.trim();
          if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
          if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
          key = key.replace(/\\n/g, '\n').trim();
          
          if (!key.includes('PRIVATE KEY')) {
            throw new Error('Invalid private key format. Missing BEGIN/END PRIVATE KEY labels.');
          }

          credential = admin.credential.cert({
            projectId: firebaseConfig.projectId,
            clientEmail: email,
            privateKey: key
          });
        } else {
          console.warn('[Firebase Admin] No Service Account found. Using Application Default Credentials.');
          credential = admin.credential.applicationDefault();
        }

        app = admin.initializeApp({
          credential,
          projectId: firebaseConfig.projectId 
        }, appName);
      }
      
      db = getFirestore(app!, firebaseConfig.firestoreDatabaseId);
      console.log('[Firebase Admin] Successfully initialized Firestore.');
      return db;
    } catch (error) {
      console.error('[Firebase Admin] Initialization FAILED:', error);
      initializationPromise = null;
      return null;
    }
  })();

  return initializationPromise;
}

export async function syncSheetsToFirestore(students: any[]) {
  const firestore = await getFirebaseAdmin();
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
      console.warn('[Sync] Firestore backup skipped (Missing IAM permissions). Google Sheets sync complete.');
      return; // Soft failure - don't throw, just exit sync silently
    }
    throw error;
  }
}

export async function saveAttendanceToFirestore(record: any) {
  const firestore = await getFirebaseAdmin();
  if (!firestore) return;

  const attendanceCol = firestore.collection('attendance');
  try {
    await attendanceCol.add({
      ...record,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error: any) {
    if (error.message?.includes('PERMISSION_DENIED') || error.code === 7) {
      console.warn('[Sync] Firestore attendance backup skipped (Missing IAM permissions).');
      return; 
    }
    throw error;
  }
}

export async function getFirestoreDiagnostics() {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const hasKey = !!rawKey;
  
  let firestoreTest = 'UNTRIED';
  let errorMessage = null;
  let projectMismatch = false;

  if (serviceEmail) {
    const emailParts = serviceEmail.split('@');
    if (emailParts.length > 1) {
      const emailDomain = emailParts[1].split('.')[0];
      if (!firebaseConfig.projectId.includes(emailDomain)) {
        projectMismatch = true;
      }
    }
  }

  if (serviceEmail && hasKey) {
    try {
      const db = await getFirebaseAdmin();
      if (db) {
        try {
          await db.collection('config').doc('main').get();
          firestoreTest = 'SUCCESS';
        } catch (configErr: any) {
          firestoreTest = 'FAILED';
          errorMessage = configErr.message;
        }
      } else {
        firestoreTest = 'FAILED_TO_INIT';
      }
    } catch (err: any) {
      firestoreTest = 'FAILED';
      errorMessage = err.message;
    }
  }

  const iamLink = `https://console.cloud.google.com/iam-admin/iam?project=${firebaseConfig.projectId}`;

  return {
    status: 'diagnostic',
    checks: {
      firebaseConfigExists: !!firebaseConfig,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      serviceAccountEmail: serviceEmail || 'MISSING',
      serviceAccountKey: hasKey ? 'PRESENT' : 'MISSING',
      firestoreConnection: firestoreTest,
      error: errorMessage,
      projectMismatch
    },
    instructions: !serviceEmail ? [
      "1. Create a Service Account in Google Cloud Console.",
      "2. Add the email to GOOGLE_SERVICE_ACCOUNT_EMAIL secret.",
      "3. Share your Google Sheet with the Service Account email."
    ] : (projectMismatch ? [
      `⚠️ PROJECT MISMATCH: Your Service Account seems to be from another project.`,
      `Your app is targeting project: ${firebaseConfig.projectId}`,
      `1. Open IAM Console: ${iamLink}`,
      "2. Add your Service Account email as a member with 'Firebase Editor' and 'Cloud Datastore User' roles."
    ] : (firestoreTest === 'FAILED' ? [
      `1. Open IAM Console: ${iamLink}`,
      "2. Find your Service Account email.",
      "3. Important: Grant 'Cloud Datastore User' AND 'Firebase Editor' roles.",
      "4. If still failing, check if the PRIVATE_KEY in Secrets starts and ends correctly."
    ] : [
      "1. Ensure the Service Account email is shared to your Google Sheet as Editor.",
      "2. Search and Sheets are now fully the primary data source."
    ]))
  };
}
