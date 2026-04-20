import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  User as UserIcon, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Save, 
  GraduationCap, 
  Users, 
  FileText,
  ChevronDown,
  Loader2,
  AlertCircle,
  ExternalLink,
  Camera,
  Upload,
  LogOut,
  LogIn,
  RefreshCw,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Student, AttendanceStatus, AttendanceRecord } from './types';
import { db } from './lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
} from 'firebase/firestore';
import { GoogleGenAI, Type } from '@google/genai';
import { useFirebase } from './hooks/useFirebase';

const DEMO_STUDENTS: Student[] = [
  { id: 'DEMO-001', rollNo: '001', name: 'Aarav Sharma', faculty: 'Science', batch: '2024' },
  { id: 'DEMO-002', rollNo: '002', name: 'Isha Patel', faculty: 'Science', batch: '2024' },
  { id: 'DEMO-003', rollNo: '101', name: 'Rohan Gupta', faculty: 'Management', batch: '2023' },
  { id: 'DEMO-004', rollNo: '102', name: 'Sanya Singh', faculty: 'Management', batch: '2023' },
  { id: 'DEMO-005', rollNo: '501', name: 'Kunal Verma', faculty: 'Arts', batch: '2022' }
];

export default function App() {
  const { 
    user, 
    students, 
    loading, 
    error, 
    setError,
    login, 
    logout,
    faculties,
    setStudents,
    refetchStudents
  } = useFirebase() as any; 

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'lookup' | 'mass'>('lookup');
  const [massRollNos, setMassRollNos] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [dismissDiagnostic, setDismissDiagnostic] = useState(false);
  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Check camera availability
  useEffect(() => {
    async function checkCamera() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setHasCamera(devices.some(device => device.kind === 'videoinput'));
      } catch (err) {
        console.warn('Camera detection failed:', err);
      }
    }
    checkCamera();
  }, []);

  // Form State
  const [selectedFaculty, setSelectedFaculty] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [searchRollNo, setSearchRollNo] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>('present');
  const [workSubmission, setWorkSubmission] = useState({
    classwork: false,
    classworkSubmission: false,
    assignment: false
  });
  const [teacherNotes, setTeacherNotes] = useState('');

  // Derived Data
  const batches = useMemo(() => {
    if (!selectedFaculty) return [];
    return Array.from(new Set(students.filter(s => s.faculty === selectedFaculty).map(s => s.batch).filter(Boolean)));
  }, [students, selectedFaculty]);

  const filteredStudents = useMemo(() => {
    if (!selectedFaculty || !selectedBatch) return [];
    return students.filter(s => s.faculty === selectedFaculty && s.batch === selectedBatch);
  }, [students, selectedFaculty, selectedBatch]);

  // Search student when roll no, faculty, or batch changes
  useEffect(() => {
    if (searchRollNo && selectedFaculty && selectedBatch) {
      const student = students.find(s => 
        s.rollNo.toString().trim() === searchRollNo.toString().trim() && 
        s.faculty.toString().trim().toLowerCase() === selectedFaculty.toString().trim().toLowerCase() && 
        s.batch.toString().trim().toLowerCase() === selectedBatch.toString().trim().toLowerCase()
      );
      if (student) setSelectedStudent(student);
    }
  }, [searchRollNo, selectedFaculty, selectedBatch, students]);

  const loadDemoData = () => {
    setStudents(DEMO_STUDENTS);
    setSaveStatus({ type: 'success', message: 'Loaded demo records for testing!' });
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSaveStatus(null);
    try {
      // 1. Trigger background sync
      const res = await fetch('/api/sync', { method: 'POST' });
      const syncData = await res.json();
      
      // 2. Regardless of sync success (in case Firestore is blocked), fetch directly to UI
      const freshStudents = await refetchStudents();
      
      if (res.ok) {
        setSaveStatus({ type: 'success', message: `${freshStudents?.length || syncData.count} students fetched from Google Sheets!` });
        setDiagnostics(null);
      } else {
        if (syncData.message?.includes('PERMISSION_DENIED')) {
          checkDiagnostics();
          if (freshStudents && freshStudents.length > 0) {
            setSaveStatus({ type: 'success', message: 'Sheets connected! (Note: Background sync to database was skipped)' });
          }
        }
        if (!freshStudents || freshStudents.length === 0) {
          throw new Error(syncData.message || 'Sync failed');
        }
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const checkDiagnostics = async (retryCount = 2) => {
    try {
      const res = await fetch('/api/debug/permissions');
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(data);
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (e) {
      if (retryCount > 0) {
        setTimeout(() => checkDiagnostics(retryCount - 1), 2000);
      } else {
        console.error('Failed to run diagnostics');
      }
    }
  };

  useEffect(() => {
    checkDiagnostics();
    refetchStudents();
  }, []);

  const handleSave = async () => {
    if (!selectedStudent || !user) return;

    setSaving(true);
    setSaveStatus(null);

    const now = new Date();
    const record: any = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      rollNo: selectedStudent.rollNo,
      faculty: selectedStudent.faculty,
      batch: selectedStudent.batch,
      status: attendanceStatus,
      workSubmission,
      notes: teacherNotes,
      date: now.toISOString().split('T')[0],
      timestamp: now.toLocaleTimeString(),
      teacherId: user.uid,
      teacherEmail: user.email,
      createdAt: serverTimestamp()
    };

    try {
      // Save local to Firestore for instant multi-device sync
      await addDoc(collection(db, 'attendance'), record);

      // Also bridge to Google Sheets via server
      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });

      setSaveStatus({ type: 'success', message: 'Attendance saved and synced!' });
      // Reset form
      setSearchRollNo('');
      setSelectedStudent(null);
      setAttendanceStatus('present');
      setWorkSubmission({ classwork: false, classworkSubmission: false, assignment: false });
      setTeacherNotes('');
    } catch (err) {
      setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setSaving(false);
    }
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      stopCamera();
      setIsCameraActive(false);
    } else {
      try {
        setIsCameraActive(true);
        // We'll initialize the actual stream in a useEffect or after state update
      } catch (err) {
        setSaveStatus({ type: 'error', message: 'Could not access camera' });
      }
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (isCameraActive && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      }).then(s => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      }).catch(err => {
        console.error('Camera access error:', err);
        setIsCameraActive(false);
        setSaveStatus({ type: 'error', message: 'Camera access denied' });
      });
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive]);

  const stopCamera = () => {
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
            const mockEvent = { target: { files: [file] } } as any;
            handleImageScan(mockEvent);
            stopCamera();
          }
        }, 'image/jpeg');
      }
    }
  };

  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setScanning(true);
    setSaveStatus(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;

      // Call Backend AI Bridge
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType: file.type })
      });

      if (!scanRes.ok) {
        const errData = await scanRes.json().catch(() => ({}));
        throw new Error(errData.message || 'AI Scan failed on server');
      }

      const extractedStudents = await scanRes.json();
      
      const syncRes = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: extractedStudents })
      });

      if (syncRes.ok) {
        setSaveStatus({ type: 'success', message: 'AI Scan complete! Data syncing...' });
        // Manually refetch to update UI instantly even if Firestore listener is slow
        refetchStudents();
      } else {
        throw new Error('Failed to update sheets');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'AI Scan failed' });
    } finally {
      setScanning(false);
    }
  };

  const handleMassSave = async () => {
    if (!selectedFaculty || !selectedBatch || !massRollNos.trim() || !user) return;

    setSaving(true);
    setSaveStatus(null);

    const rollNoList = massRollNos.split(/[\s,]+/).map(r => r.trim()).filter(r => r);
    const matchedStudents = rollNoList.map(roll => {
      return students.find(s => 
        s.rollNo === roll && 
        s.faculty === selectedFaculty && 
        s.batch === selectedBatch
      );
    }).filter(s => s) as Student[];

    if (matchedStudents.length === 0) {
      setSaveStatus({ type: 'error', message: 'No matching students found.' });
      setSaving(false);
      return;
    }

    const now = new Date();
    const records = matchedStudents.map(student => ({
      studentId: student.id,
      studentName: student.name,
      rollNo: student.rollNo,
      faculty: student.faculty,
      batch: student.batch,
      status: 'present' as AttendanceStatus,
      workSubmission: { classwork: false, classworkSubmission: false, assignment: false },
      notes: 'Mass Update',
      date: now.toISOString().split('T')[0],
      timestamp: now.toLocaleTimeString(),
      teacherId: user.uid,
      createdAt: serverTimestamp()
    }));

    try {
      // Parallel sync to Firestore and Sheets
      const firestorePromises = records.map(r => addDoc(collection(db, 'attendance'), r));
      const sheetsPromise = fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });

      await Promise.all([...firestorePromises, sheetsPromise]);

      setSaveStatus({ type: 'success', message: `${records.length} marks synced locally and to Sheets!` });
      setMassRollNos('');
    } catch (err) {
      setSaveStatus({ type: 'error', message: 'Sync failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-slate-800 leading-none">EduTrack</h1>
              <div className="flex items-center gap-2 mt-1">
                {students.length > 0 && (
                  <div className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider inline-block">
                    {students.length} Students Loaded
                  </div>
                )}
                <button 
                  onClick={handleManualSync}
                  disabled={syncing}
                  className="p-1 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
                  title="Refresh from Google Sheets"
                >
                  <RefreshCw className={cn("w-3 h-3 text-blue-600", syncing && "animate-spin")} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-6 space-y-6">
        {/* Permission Diagnostics Alert */}
        {diagnostics && !dismissDiagnostic && (diagnostics.checks.serviceAccountEmail === 'MISSING' || diagnostics.checks.firestoreConnection === 'FAILED') && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3 relative"
          >
            <button 
              onClick={() => setDismissDiagnostic(true)}
              className="absolute top-4 right-4 p-1 text-amber-400 hover:text-amber-600 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-amber-700 pr-8">
              <AlertCircle className="w-5 h-5" />
              <h3 className="font-bold text-sm">Database Sync (Optional) Delayed</h3>
            </div>
            <p className="text-[11px] text-amber-600 leading-relaxed font-medium">
              We've connected to the server! However, we found some configuration issues that prevent data from saving correctly.
            </p>
            <div className="bg-white/50 rounded-xl p-3 space-y-2 border border-amber-100">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider underline">Urgent Fixes Required:</p>
              
              {diagnostics.checks.sheetsConnection === 'FAILED' && (
                <div className="bg-red-50 border border-red-200 p-2 rounded-lg mb-2">
                  <p className="text-[10px] text-red-800 font-bold flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Sheets Access Denied
                  </p>
                  <p className="text-[9px] text-red-700 leading-tight mt-1">
                    Your spreadsheet is not shared with the Service Account.
                  </p>
                  <p className="text-[9px] text-red-700 font-bold mt-1">
                    Fix: Copy the Service Account email below and share your Google Sheet with it as "Editor".
                  </p>
                </div>
              )}

              {diagnostics.checks.projectMismatch && (
                <div className="bg-red-50 border border-red-200 p-2 rounded-lg mb-2">
                  <p className="text-[10px] text-red-800 font-bold flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Project ID Mismatch
                  </p>
                  <p className="text-[9px] text-red-700 leading-tight mt-1">
                    Your service account belongs to a different Google Cloud project. It must belong to <b>{diagnostics.checks.projectId}</b>.
                  </p>
                </div>
              )}

              {diagnostics.checks.firestoreConnection === 'FAILED' && !diagnostics.checks.projectMismatch && (
                <div className="bg-amber-100 p-2 rounded-lg mb-2">
                  <p className="text-[10px] text-amber-800 font-bold">Database Test Failed:</p>
                  <p className="text-[9px] text-amber-700 italic">{diagnostics.checks.error || 'Missing Permission'}</p>
                </div>
              )}

              <ul className="text-[10px] text-red-700 list-disc list-inside space-y-1">
                {diagnostics.instructions.map((step: string, i: number) => (
                  <li key={i}>
                    {step.includes('https://') ? (
                      <>
                        {step.split('https://')[0]}
                        <a 
                          href={'https://' + step.split('https://')[1].split(' ')[0]} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-blue-600 underline font-bold"
                        >
                          Console Link
                        </a>
                        {' ' + (step.split('https://')[1].split(' ').slice(1).join(' ') || '')}
                      </>
                    ) : (
                      step
                    )}
                  </li>
                ))}
              </ul>
              <button 
                onClick={checkDiagnostics}
                className="w-full mt-2 bg-amber-600 text-white text-[10px] font-bold py-1.5 rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3 h-3" /> Re-Check Connection
              </button>

              <div className="pt-2 mt-2 border-t border-amber-100">
                <details className="cursor-pointer group">
                  <summary className="text-[9px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1 group-open:mb-2">
                    <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" /> Technical Inspection
                  </summary>
                  <div className="bg-slate-900 rounded-lg p-3 font-mono text-[8px] text-slate-300 space-y-1.5 overflow-x-auto">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500 italic">Project ID:</span>
                      <span className="text-blue-400">{diagnostics.checks.projectId}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500 italic">Database ID:</span>
                      <span className="text-blue-400">{diagnostics.checks.databaseId || '(default)'}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1 items-center">
                      <span className="text-slate-500 italic">Service Acc:</span>
                      <div className="flex items-center gap-2 max-w-[150px]">
                        <span className="text-amber-400 truncate text-right flex-1" title={diagnostics.checks.serviceAccountEmail}>
                          {diagnostics.checks.serviceAccountEmail}
                        </span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(diagnostics.checks.serviceAccountEmail);
                            alert('Email copied to clipboard!');
                          }}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500 italic">Sheets:</span>
                      <span className={cn(
                        "font-bold",
                        diagnostics.checks.sheetsConnection === 'SUCCESS' ? "text-green-400" : "text-red-400"
                      )}>
                        {diagnostics.checks.sheetsConnection}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500 italic">Firestore:</span>
                      <span className={cn(
                        "font-bold",
                        diagnostics.checks.firestoreConnection === 'SUCCESS' ? "text-green-400" : "text-red-400"
                      )}>
                        {diagnostics.checks.firestoreConnection}
                      </span>
                    </div>
                  </div>
                </details>
              </div>
            </div>
            <p className="text-[9px] text-red-400 italic">This is required for the server to securely communicate between Sheets and Firestore.</p>
          </motion.div>
        )}

        {/* Tab Switcher */}
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('lookup')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all",
              activeTab === 'lookup' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Search className="w-4 h-4" /> Single Lookup
          </button>
          <button 
            onClick={() => setActiveTab('mass')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all",
              activeTab === 'mass' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Users className="w-4 h-4" /> Mass Entry
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'lookup' ? (
            <motion.div 
              key="lookup"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Selection Section */}
              <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-slate-50">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Student Lookup
                  </h3>
                  {hasCamera ? (
                    <button 
                      onClick={toggleCamera}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                    >
                      {scanning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      {scanning ? 'Scanning...' : 'Take Photo'}
                    </button>
                  ) : (
                    <label className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg transition-colors">
                      {scanning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      {scanning ? 'Scanning...' : 'Upload Image'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageScan} disabled={scanning} />
                    </label>
                  )}
                </div>

                {isCameraActive && (
                  <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
                    <div className="relative w-full max-w-sm aspect-[3/4] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/20">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 border-2 border-white/20 pointer-events-none m-8 rounded-2xl">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/80 rounded-tl-xl"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/80 rounded-tr-xl"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/80 rounded-bl-xl"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/80 rounded-br-xl"></div>
                      </div>
                    </div>
                    
                    <div className="mt-8 flex items-center gap-6">
                      <button 
                        onClick={stopCamera}
                        className="p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all active:scale-95"
                      >
                        <X className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={capturePhoto}
                        className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                      >
                        <div className="w-16 h-16 rounded-full border-4 border-slate-900"></div>
                      </button>
                      <label className="p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all active:scale-95 cursor-pointer">
                        <Upload className="w-6 h-6" />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleImageScan(e); stopCamera(); }} />
                      </label>
                    </div>
                    
                    <canvas ref={canvasRef} className="hidden" />
                    <p className="mt-6 text-white/60 text-xs font-medium tracking-wide">Align text within the frame</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Faculty
                    </label>
                    <div className="relative">
                      <select 
                        value={selectedFaculty}
                        onChange={(e) => {
                          setSelectedFaculty(e.target.value);
                          setSelectedBatch('');
                        }}
                        disabled={faculties.length === 0}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
                      >
                        <option value="">{faculties.length === 0 ? 'No Data Found' : 'Select Faculty'}</option>
                        {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Batch
                    </label>
                    <div className="relative">
                      <select 
                        value={selectedBatch}
                        onChange={(e) => setSelectedBatch(e.target.value)}
                        disabled={!selectedFaculty || batches.length === 0}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
                      >
                        <option value="">{batches.length === 0 && selectedFaculty ? 'No Batches Found' : 'Select Batch'}</option>
                        {batches.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 mt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5" /> Select Student
                    </label>
                    <div className="relative">
                      <select 
                        value={selectedStudent?.id || ''}
                        onChange={(e) => {
                          const student = students.find(s => s.id === e.target.value);
                          setSelectedStudent(student || null);
                        }}
                        disabled={filteredStudents.length === 0}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
                      >
                        <option value="">{filteredStudents.length === 0 ? 'Select Faculty/Batch First' : `Select from ${filteredStudents.length} Students`}</option>
                        {filteredStudents.map(s => (
                          <option key={s.id} value={s.id}>{s.rollNo} - {s.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5" /> Quick Roll Search
                      </label>
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="Roll No"
                          value={searchRollNo}
                          onChange={(e) => setSearchRollNo(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                        />
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>
                  </div>
                </div>

                {faculties.length === 0 && !loading && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-blue-900">No Student Data Found</h4>
                      <p className="text-[10px] text-blue-800 leading-relaxed">
                        The student list is currently empty. Please ensure:
                        <br />1. Your Google Sheet has a tab named <strong>"Students"</strong>.
                        <br />2. Data starts from row 2 (A: ID, B: Roll No, C: Name, D: Faculty, E: Batch).
                        <br />3. Click the <RefreshCw className="inline w-3 h-3 text-blue-600 animate-pulse" /> icon in header to sync.
                      </p>
                      <button 
                        onClick={loadDemoData}
                        className="mt-2 text-[10px] font-bold text-blue-600 bg-white border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        Load Demo Data Instead
                      </button>
                    </div>
                  </motion.div>
                )}

                {searchRollNo && selectedFaculty && selectedBatch && !selectedStudent && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-2 text-amber-700 text-[10px] font-semibold"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Roll No. {searchRollNo} not found in this Faculty/Batch.</span>
                  </motion.div>
                )}
              </section>

              {/* Student Details Section with its own AnimatePresence */}
              <AnimatePresence mode="wait">
                {selectedStudent ? (
                  <motion.section 
                    key="details"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-6"
                  >
                    {/* Student Card */}
                    <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-200 relative overflow-hidden">
                      <div className="relative z-10 flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="text-blue-100 text-xs font-medium uppercase tracking-widest">Student Profile</p>
                          <h2 className="text-2xl font-bold">{selectedStudent.name}</h2>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight">ID: {selectedStudent.id}</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight">Roll: {selectedStudent.rollNo}</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight">{selectedStudent.faculty}</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight">{selectedStudent.batch}</span>
                          </div>
                        </div>
                        <div className="bg-white/20 p-3 rounded-full">
                          <UserIcon className="w-8 h-8" />
                        </div>
                      </div>
                      {/* Decorative background circle */}
                      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                    </div>

                    {/* Attendance Marking */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600" /> Attendance Status
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: 'present', label: 'Present', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
                          { id: 'absent', label: 'Absent', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
                          { id: 'late', label: 'Late', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
                        ].map((status) => (
                          <button
                            key={status.id}
                            onClick={() => setAttendanceStatus(status.id as AttendanceStatus)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                              attendanceStatus === status.id 
                                ? cn(status.bg, status.border, "ring-2 ring-offset-1 ring-blue-500/20") 
                                : "bg-slate-50 border-slate-100 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                            )}
                          >
                            <status.icon className={cn("w-6 h-6", attendanceStatus === status.id ? status.color : "text-slate-400")} />
                            <span className={cn("text-xs font-bold", attendanceStatus === status.id ? "text-slate-800" : "text-slate-500")}>
                              {status.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Work Submission */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" /> Work Submission
                      </h3>
                      <div className="space-y-3">
                        {[
                          { id: 'classwork', label: 'Work Submission on class' },
                          { id: 'classworkSubmission', label: 'Submission of classwork' },
                          { id: 'assignment', label: 'Submission of assignment' }
                        ].map((item) => (
                          <label 
                            key={item.id}
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                          >
                            <span className="text-sm font-medium text-slate-700">{item.label}</span>
                            <input 
                              type="checkbox"
                              checked={workSubmission[item.id as keyof typeof workSubmission]}
                              onChange={(e) => setWorkSubmission(prev => ({ ...prev, [item.id]: e.target.checked }))}
                              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Teacher's Notes */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" /> Teacher's Notes
                      </h3>
                      <textarea 
                        placeholder="Add any specific observations or notes here..."
                        value={teacherNotes}
                        onChange={(e) => setTeacherNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none min-h-[100px] resize-none"
                      />
                    </div>

                    {/* Save Button */}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                      {saving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      {saving ? 'Saving...' : 'Save Attendance'}
                    </button>
                  </motion.section>
                ) : searchRollNo && selectedFaculty && selectedBatch ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2"
                  >
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                    <h3 className="font-bold text-amber-800">Student Not Found</h3>
                    <p className="text-sm text-amber-700">No student matches Roll No. {searchRollNo} in {selectedFaculty} - {selectedBatch}.</p>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-slate-100 border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-3"
                  >
                    <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <Search className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">Search for a student to begin marking attendance</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div 
              key="mass"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Mass Entry Section */}
              <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Mass Attendance Update
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Faculty
                    </label>
                    <div className="relative">
                      <select 
                        value={selectedFaculty}
                        onChange={(e) => {
                          setSelectedFaculty(e.target.value);
                          setSelectedBatch('');
                        }}
                        disabled={faculties.length === 0}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
                      >
                        <option value="">{faculties.length === 0 ? 'No Data Found' : 'Select Faculty'}</option>
                        {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Batch
                    </label>
                    <div className="relative">
                      <select 
                        value={selectedBatch}
                        onChange={(e) => setSelectedBatch(e.target.value)}
                        disabled={!selectedFaculty || batches.length === 0}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
                      >
                        <option value="">{batches.length === 0 && selectedFaculty ? 'No Batches Found' : 'Select Batch'}</option>
                        {batches.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Student Roll Numbers
                  </label>
                  <textarea 
                    placeholder="Enter Roll Numbers separated by commas or lines... (e.g. 001, 002, 005)"
                    value={massRollNos}
                    onChange={(e) => setMassRollNos(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none min-h-[150px] resize-none"
                  />
                  <p className="text-[10px] text-slate-400 font-medium px-1">Note: All students entered will be marked as "Present".</p>
                </div>

                <button
                  onClick={handleMassSave}
                  disabled={saving || !selectedFaculty || !selectedBatch || !massRollNos.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                >
                  {saving ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  {saving ? 'Processing...' : 'Mark All Present'}
                </button>
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Messages */}
        <AnimatePresence>
          {saveStatus && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "fixed bottom-6 left-6 right-6 p-4 rounded-xl shadow-xl flex items-center gap-3 z-50",
                saveStatus.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
              )}
            >
              {saveStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-bold">{saveStatus.message}</p>
              <button 
                onClick={() => setSaveStatus(null)}
                className="ml-auto text-white/80 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
