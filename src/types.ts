export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface Student {
  id: string;
  rollNo: string;
  name: string;
  faculty: string;
  batch: string;
}

export interface AttendanceRecord {
  studentId: string;
  studentName: string;
  rollNo: string;
  faculty: string;
  batch: string;
  status: AttendanceStatus;
  workSubmission: {
    classwork: boolean;
    assignment: boolean;
    classworkSubmission: boolean;
  };
  notes: string;
  date: string;
  timestamp: string;
}
