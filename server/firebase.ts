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
    if (admin.apps.length === 0) {
      app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
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
