export type Term = "前期" | "後期" | "年間" | "不明";

export interface Slot {
  day: number; // 1=月 … 6=土
  period: number; // 1..7
}

export interface EvalPart {
  label: string;
  percent: number;
  category: string;
}

export interface Session {
  no: number | null;
  kind: "regular" | "ondemand";
  date: string | null;
  endDate?: string | null;
  mode: "face" | "online" | "ondemand";
  content: string;
  cancelled?: boolean;
}

export interface Course {
  id: string;
  pageId: number | null;
  code: string | null;
  name: string;
  subtitle: string;
  teachers: string[];
  department: string | null;
  syllabusDepartment: string | null;
  grade: number | null;
  term: Term;
  slots: Slot[];
  credits: number;
  lectureType: string | null;
  classGroup: string | null;
  eligibility?: Eligibility | null; // 共通・教養科目のみ
  notes: string[];
  campus: string | null;
  room: string | null;
  classFormat: "対面" | "オンライン";
  onlineMethod: string | null;
  objectives: string;
  lectureForm: string;
  evaluation: { text: string; parts: EvalPart[]; totals?: Record<string, number>; tags: string[] };
  textbooks: { name: string; author?: string; publisher?: string; publicationYear?: string }[];
  sessions: Session[];
  hasDetail: boolean;
  url: string;
}

export interface Eligibility {
  kind: "open" | "depts" | "graded" | "special" | "unknown";
  text: string;
  flags: string[];
  rules: { minGrade: number | null; maxGrade: number | null; depts: string[] | null }[];
}

export interface DeptFile {
  year: number;
  department: { code: string; name: string };
  courses: Course[];
}

export interface DataIndex {
  year: number;
  generatedAt: string;
  departments: { code: string; name: string; count: number }[];
  common?: { code: string; name: string; count: number } | null;
}

export interface ReqGroup {
  id: string;
  label: string;
  parent?: string | null;
  minCredits: number;
  requiredCredits?: number;
  note?: string;
  page: number;
}

export interface ReqCourse {
  name: string;
  credits: number;
  group: string;
  required: boolean;
  year: number;
  choice?: string;
}

export interface Requirements {
  entryYear: number;
  department: { code: string; name: string };
  verified: boolean;
  source: { url: string; title?: string; pages: number[] };
  totalCredits: number;
  groups: ReqGroup[];
  courses: ReqCourse[];
  choiceRules?: { id: string; label: string; courses: string[]; minCredits: number; page: number }[];
}

export interface Profile {
  dept: string;
  grade: number;
  entryYear: number;
}
