import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import firebaseConfig from '../firebase-applet-config.json';

let db: any = null;

export function getFirebaseAdmin() {
  if (db) return db;

  try {
    let app;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (admin.apps.length === 0) {
      let credential;
      
      if (email && key) {
        console.log('[Firebase Admin] Using Service Account credentials from environment.');
        key = key.replace(/\\n/g, '\n').replace(/^["'](.*)["']$/, '$1').replace(/^'(.*)'$/, '$1');
        credential = admin.credential.cert({
          projectId: firebaseConfig.projectId,
          clientEmail: email,
          privateKey: key
        });
      } else {
        console.log('[Firebase Admin] Falling back to Application Default Credentials.');
        credential = admin.credential.applicationDefault();
      }

      app = admin.initializeApp({
        credential,
        projectId: firebaseConfig.projectId
      });
    } else {
      app = admin.apps[0];
    }
    
    // Use getFirestore from firebase-admin/firestore to target the specific databaseId
    db = getFirestore(app!, firebaseConfig.firestoreDatabaseId);
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

  await batch.commit();
}

export async function saveAttendanceToFirestore(record: any) {
  const firestore = getFirebaseAdmin();
  if (!firestore) return;

  const attendanceCol = firestore.collection('attendance');
  await attendanceCol.add({
    ...record,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}
