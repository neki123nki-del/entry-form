import { useState, useEffect, useMemo } from 'react';
import { User, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, onSnapshot, doc, getDocFromServer } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Student } from '../types';

export function useFirebase() {
  const [user, setUser] = useState<any>({ uid: 'guest-staff', email: 'staff@edutrack.local', displayName: 'Staff' });
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{ spreadsheetId: string, isConfigured: boolean } | null>(null);

  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const studentsList = snapshot.docs.map(doc => ({ ...doc.data() } as Student));
      setStudents(studentsList);
    });

    const unsubConfig = onSnapshot(doc(db, 'config', 'main'), (snapshot) => {
      if (snapshot.exists()) {
        setConfig(snapshot.data() as any);
      }
    });

    const testConn = async () => {
      try {
        await getDocFromServer(doc(db, 'config', 'main'));
      } catch (error) {
        console.error("Firestore connectivity check failed:", error);
      }
    };
    testConn();

    setLoading(false);

    return () => {
      unsubStudents();
      unsubConfig();
    };
  }, []);

  const refetchStudents = async (retryCount = 3): Promise<Student[] | null> => {
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setStudents(data);
          return data;
        }
      }
      throw new Error(`Server status: ${res.status}`);
    } catch (e) {
      if (retryCount > 0) {
        console.warn(`[Sync] Student fetch failed, retrying in 1s... (${retryCount} left)`);
        await new Promise(r => setTimeout(r, 1000));
        return refetchStudents(retryCount - 1);
      }
      console.error('Manual refetch failed:', e);
    }
    return null;
  };

  const login = async () => {};
  const logout = () => {};

  const faculties = useMemo(() => Array.from(new Set(students.map(s => s.faculty).filter(Boolean))), [students]);

  return { 
    user, 
    students, 
    loading, 
    error, 
    setError,
    config, 
    login, 
    logout,
    faculties,
    setStudents,
    refetchStudents
  };
}


