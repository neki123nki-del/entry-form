import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  User, 
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
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Student, AttendanceStatus, AttendanceRecord } from './types';

export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [config, setConfig] = useState<{ spreadsheetId: string, isConfigured: boolean } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'lookup' | 'mass'>('lookup');
  const [massRollNos, setMassRollNos] = useState('');

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
  const faculties = useMemo(() => Array.from(new Set(students.map(s => s.faculty).filter(Boolean))), [students]);
  const batches = useMemo(() => {
    if (!selectedFaculty) return [];
    return Array.from(new Set(students.filter(s => s.faculty === selectedFaculty).map(s => s.batch).filter(Boolean)));
  }, [students, selectedFaculty]);

  // Fetch students
  const fetchStudents = async () => {
    try {
      // Fetch both students and config in parallel
      const [studentsRes, configRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/config')
      ]);

      if (!studentsRes.ok) throw new Error('Failed to fetch students');
      
      const studentsData = await studentsRes.json();
      setStudents(studentsData);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Search student when roll no, faculty, or batch changes
  useEffect(() => {
    if (searchRollNo && selectedFaculty && selectedBatch) {
      const student = students.find(s => 
        s.rollNo === searchRollNo && 
        s.faculty === selectedFaculty && 
        s.batch === selectedBatch
      );
      setSelectedStudent(student || null);
    } else {
      setSelectedStudent(null);
    }
  }, [searchRollNo, selectedFaculty, selectedBatch, students]);

  const handleSave = async () => {
    if (!selectedStudent) return;

    setSaving(true);
    setSaveStatus(null);

    const now = new Date();
    const record: AttendanceRecord = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      rollNo: selectedStudent.rollNo,
      faculty: selectedStudent.faculty,
      batch: selectedStudent.batch,
      status: attendanceStatus,
      workSubmission,
      notes: teacherNotes,
      date: now.toISOString().split('T')[0],
      timestamp: now.toLocaleTimeString()
    };

    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });

      const result = await response.json();
      if (response.ok) {
        setSaveStatus({ type: 'success', message: result.message || 'Attendance saved successfully!' });
        // Reset form for next student
        setSearchRollNo('');
        setSelectedStudent(null);
        setAttendanceStatus('present');
        setWorkSubmission({ classwork: false, classworkSubmission: false, assignment: false });
        setTeacherNotes('');
      } else {
        throw new Error(result.message || 'Failed to save attendance');
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setSaveStatus(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;
      const base64Data = base64.split(',')[1];

      // Call server-side scan
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType: file.type })
      });

      if (!scanRes.ok) {
        const errData = await scanRes.json();
        throw new Error(errData.message || 'AI Scan failed');
      }

      const extractedStudents = await scanRes.json();
      
      const syncRes = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: extractedStudents })
      });

      const result = await syncRes.json();
      if (syncRes.ok) {
        setSaveStatus({ type: 'success', message: result.message });
        fetchStudents(); // Refresh the list
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      console.error('Scan error:', err);
      setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'AI Scan failed' });
    } finally {
      setScanning(false);
    }
  };

  const handleMassSave = async () => {
    if (!selectedFaculty || !selectedBatch || !massRollNos.trim()) return;

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
      setSaveStatus({ type: 'error', message: 'No matching students found for the entered roll numbers in the selected Faculty/Batch.' });
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
      notes: 'Mass Attendance Update',
      date: now.toISOString().split('T')[0],
      timestamp: now.toLocaleTimeString()
    }));

    try {
      const response = await fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });

      const result = await response.json();
      if (response.ok) {
        setSaveStatus({ 
          type: 'success', 
          message: `${records.length} students marked present successfully!` + 
                   (matchedStudents.length < rollNoList.length ? ` (${rollNoList.length - matchedStudents.length} invalid roll nos skipped)` : '')
        });
        setMassRollNos('');
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save attendance' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

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
              <div className="flex items-center gap-1.5 mt-1">
                <div className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider",
                  config?.isConfigured 
                    ? "bg-green-100 text-green-700" 
                    : "bg-amber-100 text-amber-700"
                )}>
                  <div className={cn("w-1 h-1 rounded-full", config?.isConfigured ? "bg-green-500" : "bg-amber-500 animate-pulse")} />
                  {config?.isConfigured ? 'Live' : 'Demo'}
                </div>
                {students.length > 0 && (
                  <div className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">
                    {students.length} Students
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {config && (
              <a 
                href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Open Google Sheet"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
            <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-6 space-y-6">
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

        {/* Config Alert */}
        {config && !config.isConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900">Direct Link Not Configured</h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                App is running in <strong>Demo Mode</strong>. To save to Google Sheets, add your Service Account credentials in <strong>Settings &gt; Secrets</strong>.
              </p>
            </div>
          </div>
        )}

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
                  <label className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg transition-colors">
                    {scanning ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Camera className="w-3 h-3" />
                    )}
                    {scanning ? 'Scanning...' : 'Scan List'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageScan} disabled={scanning} />
                  </label>
                </div>

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
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                      >
                        <option value="">Select</option>
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
                        disabled={!selectedFaculty}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
                      >
                        <option value="">Select</option>
                        {batches.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" /> Roll No.
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Enter Roll Number"
                      value={searchRollNo}
                      onChange={(e) => setSearchRollNo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
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
                          <div className="flex items-center gap-2 mt-2">
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">ID: {selectedStudent.id}</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Roll: {selectedStudent.rollNo}</span>
                          </div>
                        </div>
                        <div className="bg-white/20 p-3 rounded-full">
                          <User className="w-8 h-8" />
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
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                      >
                        <option value="">Select</option>
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
                        disabled={!selectedFaculty}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none disabled:opacity-50"
                      >
                        <option value="">Select</option>
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
