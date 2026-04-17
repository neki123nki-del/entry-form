import { useState, useEffect, useMemo } from 'react';
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
  AlertCircle
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
  const faculties = useMemo(() => Array.from(new Set(students.map(s => s.faculty))), [students]);
  const batches = useMemo(() => {
    if (!selectedFaculty) return [];
    return Array.from(new Set(students.filter(s => s.faculty === selectedFaculty).map(s => s.batch)));
  }, [students, selectedFaculty]);

  // Fetch students
  const fetchStudents = async () => {
    try {
      const response = await fetch('/api/students');
      if (!response.ok) throw new Error('Failed to fetch students');
      const data = await response.json();
      setStudents(data);
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
            <h1 className="text-xl font-bold tracking-tight text-slate-800">EduTrack</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-6 space-y-6">
        {/* Selection Section */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
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

        {/* Student Details Section */}
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
