import { useState, useEffect, useMemo } from 'react';
import { User, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { collection, onSnapshot, doc, getDocFromServer } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Student } from '../types';

export function useFirebase() {
  const [user, setUser] = useState<User | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{ spreadsheetId: string, isConfigured: boolean } | null>(null);

  useEffect(() => {
    let unsubStudents: (() => void) | null = null;
    let unsubConfig: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      
      if (user) {
        unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
          const studentsList = snapshot.docs.map(doc => ({ ...doc.data() } as Student));
          setStudents(studentsList);
        });

        unsubConfig = onSnapshot(doc(db, 'config', 'main'), (snapshot) => {
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
      } else {
        setStudents([]);
        setConfig(null);
        if (unsubStudents) unsubStudents();
        if (unsubConfig) unsubConfig();
      }
      setLoading(false);
    });

    return () => {
      unsubAuth();
      if (unsubStudents) unsubStudents();
      if (unsubConfig) unsubConfig();
    };
  }, []);

  const refetchStudents = async () => {
    try {
      const res = await fetch('/api/students');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setStudents(data);
          return data;
        }
      }
    } catch (e) {
      console.error('Manual refetch failed:', e);
    }
    return null;
  };

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const logout = () => signOut(auth);

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


