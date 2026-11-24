export type UserRole =
  | 'admin'
  | 'bendahara'
  | 'wali_santri'
  | 'wali_salaf'
  | 'wali_sekolah'
  | 'wali_kelas'
  | 'pembina_asrama';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin Pondok',
  bendahara: 'Bendahara / TU',
  wali_santri: 'Wali Santri',
  wali_salaf: 'Wali Kelas Salaf',
  wali_sekolah: 'Wali Kelas Sekolah',
  wali_kelas: 'Wali Kelas (Salaf & Sekolah)',
  pembina_asrama: 'Pembina Asrama',
};

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string;
  avatar_file?: string;
  registration_note?: string;
  is_active?: number;
  created_at?: string;
}

export interface PondokProfile {
  id: number;
  name: string;
  tagline: string;
  about: string;
  address: string;
  phone: string;
  email: string;
  pengasuh: string;
  history_cikal_bakal: string;
  history_pendirian: string;
  history_arti_nama: string;
  edu_jenjang: string;
  edu_kurikulum: string;
  edu_kegiatan: string;
  spmb_info: string;
  vision: string;
  mission: string;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  updated_at: string;
}

export interface Student {
  id: number;
  nis: string;
  full_name: string;
  gender: 'L' | 'P';
  birth_date: string;
  wali_user_id: number | null;
  wali_name?: string;
  wali_names?: string;
  wali_phone?: string;
  wali_email?: string;
  salaf_class_id: number | null;
  salaf_class_name?: string;
  salaf_level?: string;
  sekolah_class_id: number | null;
  sekolah_class_name?: string;
  sekolah_level?: string;
  dorm_room_id: number | null;
  dorm_room_name?: string;
  dorm_building?: string;
  status: 'aktif' | 'lulus' | 'cuti';
  address: string;
}

export interface ClassItem {
  id: number;
  name: string;
  type: 'salaf' | 'sekolah';
  level: string;
  wali_user_id: number | null;
  wali_name?: string;
  academic_year: string;
  student_count?: number;
}

export interface DormRoom {
  id: number;
  name: string;
  building: string;
  capacity: number;
  pembina_user_id: number | null;
  pembina_name?: string;
  condition_note: string;
  occupant_count?: number;
}

export interface FeeConfig {
  id: number;
  fee_type: 'spp' | 'daftar_ulang';
  title: string;
  amount: number;
  academic_year: string;
  description: string;
  updated_at: string;
}

export interface Bill {
  id: number;
  student_id: number;
  student_name: string;
  nis: string;
  wali_name?: string;
  fee_type: 'spp' | 'daftar_ulang';
  period_month: string;
  title: string;
  total_amount: number;
  paid_amount: number;
  status: 'BELUM_BAYAR' | 'MENUNGGU_VERIFIKASI' | 'SEBAGIAN' | 'LUNAS';
  due_date: string;
  latest_rejection_reason?: string | null;
  latest_payment_status?: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  bill_id: number;
  bill_title: string;
  fee_type: 'spp' | 'daftar_ulang';
  period_month: string;
  bill_total_amount: number;
  student_id: number;
  student_name: string;
  nis: string;
  wali_user_id: number | null;
  wali_name?: string;
  method: 'transfer' | 'tunai';
  amount: number;
  proof_file: string | null;
  notes: string;
  status: 'MENUNGGU_VERIFIKASI' | 'DITERIMA' | 'DITOLAK';
  rejection_reason: string | null;
  receipt_no: string | null;
  verifier_name?: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface CashEntry {
  id: number;
  type: 'masuk' | 'keluar';
  category: string;
  description: string;
  amount: number;
  ref_payment_id: number | null;
  attachment_file: string | null;
  recorder_name?: string;
  transaction_date: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  student_id: number;
  student_name: string;
  nis: string;
  class_id: number;
  class_name: string;
  class_type: 'salaf' | 'sekolah';
  date: string;
  status: 'HADIR' | 'IZIN' | 'ALPHA' | 'SAKIT';
  complaint: string;
  recorder_name?: string;
  created_at: string;
}

export interface GradeRecord {
  id: number;
  student_id: number;
  student_name: string;
  nis: string;
  class_id: number;
  class_name: string;
  class_type: 'salaf' | 'sekolah';
  subject: string;
  semester: string;
  score: number;
  predicate: string;
  notes: string;
  recorder_name?: string;
  updated_at: string;
}

export interface AchievementRecord {
  id: number;
  student_id: number;
  student_name: string;
  nis: string;
  class_type: 'salaf' | 'sekolah';
  title: string;
  category: string;
  level: string;
  date: string;
  notes: string;
  recorder_name?: string;
  created_at: string;
}

export type HealthStatus =
  | 'Dilaporkan'
  | 'Diperiksa'
  | 'Istirahat/Obat'
  | 'Dirujuk'
  | 'Dijemput Wali'
  | 'Sembuh';

export interface HealthTimelineItem {
  id: number;
  case_id: number;
  status: HealthStatus;
  action_note: string;
  medicine_note: string;
  attachment_file: string | null;
  updater_name?: string;
  created_at: string;
}

export interface HealthCase {
  id: number;
  student_id: number;
  student_name: string;
  nis: string;
  dorm_room_name?: string;
  source: 'absensi_salaf' | 'absensi_sekolah' | 'pembina';
  initial_complaint: string;
  disease_type: string;
  severity: 'Ringan' | 'Sedang' | 'Berat' | null;
  current_status: HealthStatus;
  reporter_name?: string;
  handler_name?: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  timeline: HealthTimelineItem[];
}

export interface DormCondition {
  id: number;
  student_id: number;
  student_name: string;
  nis: string;
  dorm_room_name?: string;
  pembina_name?: string;
  date: string;
  condition_status: 'Sehat' | 'Perlu Perhatian' | 'Sakit';
  note: string;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  message: string;
  category: 'keuangan' | 'kesehatan' | 'akademik' | 'umum';
  ref_type: string | null;
  ref_id: number | null;
  is_read: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string;
  user_role: string;
  action: string;
  module: string;
  detail: string;
  created_at: string;
}
