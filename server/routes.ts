import express from 'express';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { db } from './db.ts';
import type { UserRole } from './db.ts';
import {
  authenticateJWT,
  createNotification,
  logAudit,
  requireRoles,
  signToken,
  upload,
} from './middleware.ts';
import type { AuthenticatedRequest } from './middleware.ts';

export const apiRouter = express.Router();

function calcPredicate(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 82) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  return 'D';
}

const SEKOLAH_GRADE_ORDER = [
  'VII A',
  'VII B',
  'VIII A',
  'VIII B',
  'IX A',
  'IX B',
  'X A',
  'X B',
  'XI A',
  'XI B',
  'XII A',
  'XII B',
];

function classSortKey(c: { type: string; name: string }): string {
  if (c.type !== 'sekolah') return `0-${c.name}`;
  const normalized = c.name.replace('-', ' ').toUpperCase();
  const idx = SEKOLAH_GRADE_ORDER.findIndex((prefix) => normalized.startsWith(prefix));
  return idx >= 0 ? `1-${String(idx).padStart(2, '0')}-${c.name}` : `1-99-${c.name}`;
}

function sortClassesByGrade<T extends { type: string; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => classSortKey(a).localeCompare(classSortKey(b)));
}

function syncTeacherRoleForClass(waliUserId: number | null | undefined, classType: 'salaf' | 'sekolah'): boolean {
  if (!waliUserId) return false;
  const teacher = db.prepare('SELECT id, role FROM users WHERE id = ?').get(waliUserId) as
    | { id: number; role: UserRole }
    | undefined;
  if (!teacher) return false;
  if (
    (teacher.role === 'wali_salaf' && classType === 'sekolah') ||
    (teacher.role === 'wali_sekolah' && classType === 'salaf')
  ) {
    db.prepare("UPDATE users SET role = 'wali_kelas' WHERE id = ?").run(teacher.id);
    return true;
  }
  return false;
}

const WALI_LINKED_SQL =
  '(s.wali_user_id = ? OR EXISTS (SELECT 1 FROM student_walis sw WHERE sw.student_id = s.id AND sw.wali_user_id = ?))';

function getLinkedWaliIds(studentId: number): number[] {
  const rows = db
    .prepare(
      `SELECT wali_user_id FROM student_walis WHERE student_id = ?
       UNION
       SELECT wali_user_id FROM students WHERE id = ? AND wali_user_id IS NOT NULL`
    )
    .all(studentId, studentId) as { wali_user_id: number }[];
  return rows.map((r) => r.wali_user_id);
}

function isWaliLinkedToStudent(waliUserId: number, studentId: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM students s
       WHERE s.id = ? AND ${WALI_LINKED_SQL}`
    )
    .get(studentId, waliUserId, waliUserId);
  return Boolean(row);
}

function notifyStudentWalis(
  studentId: number,
  title: string,
  message: string,
  category: 'keuangan' | 'kesehatan' | 'akademik' | 'umum',
  refType?: string,
  refId?: number,
  excludeUserId?: number
) {
  const waliIds = getLinkedWaliIds(studentId);
  for (const wId of waliIds) {
    if (excludeUserId && wId === excludeUserId) continue;
    createNotification(wId, title, message, category, refType, refId);
  }
}

// ============================================================
// 1. AUTHENTICATION & PROFILE
// ============================================================
apiRouter.post('/auth/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username/email dan kata sandi wajib diisi.' });
    return;
  }

  const loginKey = username.trim().toLowerCase();
  const user = db
    .prepare(
      `SELECT id, username, email, password_hash, full_name, role, phone, avatar_file, registration_note, is_active
       FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?`
    )
    .get(loginKey, loginKey) as
    | {
        id: number;
        username: string;
        email: string;
        password_hash: string;
        full_name: string;
        role: UserRole;
        phone: string;
        avatar_file: string;
        registration_note: string;
        is_active: number;
      }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Username atau kata sandi salah.' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({
      error: user.registration_note
        ? 'Akun Anda masih menunggu persetujuan dan aktivasi dari Admin Pondok.'
        : 'Akun Anda sedang dinonaktifkan oleh Admin.',
    });
    return;
  }

  const token = signToken({
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
  });

  logAudit(
    { userId: user.id, username: user.username, fullName: user.full_name, role: user.role },
    'LOGIN',
    'Autentikasi',
    `Pengguna ${user.full_name} (${user.role}) masuk ke sistem`
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone,
      avatar_file: user.avatar_file || '',
    },
  });
});

apiRouter.post('/auth/register-wali', (req, res) => {
  const {
    full_name,
    username,
    email,
    phone,
    password,
    child_mode,
    existing_nis,
    student_name,
    student_gender,
    student_birth_date,
    student_address,
  } = req.body as {
    full_name?: string;
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    child_mode?: 'existing_nis' | 'new_student';
    existing_nis?: string;
    student_name?: string;
    student_gender?: 'L' | 'P';
    student_birth_date?: string;
    student_address?: string;
  };

  if (!full_name?.trim() || !username?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: 'Nama lengkap, username, email, dan kata sandi wajib diisi.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  const existingUser = db
    .prepare('SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?')
    .get(cleanUsername, cleanEmail);
  if (existingUser) {
    res.status(409).json({ error: 'Username atau email sudah terdaftar. Silakan gunakan yang lain atau masuk.' });
    return;
  }

  const mode = child_mode || 'new_student';
  if (mode === 'existing_nis') {
    if (!existing_nis?.trim()) {
      res.status(400).json({ error: 'Nomor Induk Santri (NIS) wajib diisi untuk menautkan data anak.' });
      return;
    }
    const student = db
      .prepare('SELECT id, full_name, wali_user_id FROM students WHERE LOWER(nis) = ?')
      .get(existing_nis.trim().toLowerCase()) as
      | { id: number; full_name: string; wali_user_id: number | null }
      | undefined;
    if (!student) {
      res.status(404).json({ error: `Santri dengan NIS "${existing_nis.trim()}" tidak ditemukan.` });
      return;
    }
  } else {
    if (!student_name?.trim()) {
      res.status(400).json({ error: 'Nama lengkap santri (anak) wajib diisi.' });
      return;
    }
  }

  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);

  let createdUserId = 0;
  let linkedStudentId = 0;
  let linkedStudentName = '';

  const tx = db.transaction(() => {
    const userRes = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active, created_at)
         VALUES (?, ?, ?, ?, 'wali_santri', ?, 1, ?)`
      )
      .run(cleanUsername, cleanEmail, hash, full_name.trim(), (phone || '').trim(), now);
    createdUserId = Number(userRes.lastInsertRowid);

    if (mode === 'existing_nis' && existing_nis) {
      const student = db
        .prepare('SELECT id, full_name, wali_user_id FROM students WHERE LOWER(nis) = ?')
        .get(existing_nis.trim().toLowerCase()) as { id: number; full_name: string; wali_user_id: number | null };
      db.prepare('INSERT OR IGNORE INTO student_walis (student_id, wali_user_id, created_at) VALUES (?, ?, ?)').run(
        student.id,
        createdUserId,
        now
      );
      if (!student.wali_user_id) {
        db.prepare('UPDATE students SET wali_user_id = ? WHERE id = ?').run(createdUserId, student.id);
      }
      linkedStudentId = student.id;
      linkedStudentName = student.full_name;
    } else {
      const countRow = db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number };
      const generatedNis = `TS-2026-${String(countRow.c + 1).padStart(3, '0')}`;
      const stRes = db
        .prepare(
          `INSERT INTO students (nis, full_name, gender, birth_date, wali_user_id, status, address, created_at)
           VALUES (?, ?, ?, ?, ?, 'aktif', ?, ?)`
        )
        .run(
          generatedNis,
          student_name!.trim(),
          student_gender === 'P' ? 'P' : 'L',
          student_birth_date || '2013-01-01',
          createdUserId,
          (student_address || '').trim(),
          now
        );
      const studentId = Number(stRes.lastInsertRowid);
      db.prepare('INSERT OR IGNORE INTO student_walis (student_id, wali_user_id, created_at) VALUES (?, ?, ?)').run(
        studentId,
        createdUserId,
        now
      );
      linkedStudentId = studentId;
      linkedStudentName = `${student_name!.trim()} (${generatedNis})`;

      // Terbitkan tagihan Daftar Ulang awal otomatis jika tarif tersedia
      const daftarUlang = db
        .prepare("SELECT title, amount FROM fee_configs WHERE fee_type = 'daftar_ulang'")
        .get() as { title: string; amount: number } | undefined;
      if (daftarUlang) {
        const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        db.prepare(
          `INSERT INTO bills (student_id, fee_type, period_month, title, total_amount, paid_amount, status, due_date, created_at)
           VALUES (?, 'daftar_ulang', '2026-2027', ?, ?, 0, 'BELUM_BAYAR', ?, ?)`
        ).run(studentId, daftarUlang.title, daftarUlang.amount, dueDate, now);
      }
    }
  });
  tx();

  // Notifikasi selamat datang ke Wali Santri & pemberitahuan ke Admin
  createNotification(
    createdUserId,
    'Selamat Datang di Sistem Tapak Sunan',
    `Akun Wali Santri Anda berhasil terdaftar dan tertaut dengan santri ${linkedStudentName}.`,
    'umum'
  );
  if (mode === 'existing_nis' && linkedStudentId > 0) {
    notifyStudentWalis(
      linkedStudentId,
      'Akun Wali Terhubung ke Data Santri',
      `${full_name.trim()} (@${cleanUsername}) ikut menautkan akun Wali Santri ke data ${linkedStudentName} untuk sinkronisasi SPP & perkembangan anak.`,
      'umum',
      undefined,
      undefined,
      createdUserId
    );
  }
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all() as { id: number }[];
  for (const adm of admins) {
    createNotification(
      adm.id,
      'Pendaftaran Wali Santri Baru',
      `${full_name.trim()} (@${cleanUsername}) mendaftar sebagai Wali Santri untuk ${linkedStudentName}.`,
      'umum'
    );
  }

  logAudit(
    { userId: createdUserId, username: cleanUsername, fullName: full_name.trim(), role: 'wali_santri' },
    'REGISTER_WALI',
    'Autentikasi',
    `Pendaftaran mandiri Wali Santri ${full_name.trim()} untuk ${linkedStudentName}`
  );

  const token = signToken({
    userId: createdUserId,
    username: cleanUsername,
    fullName: full_name.trim(),
    role: 'wali_santri',
  });

  res.status(201).json({
    token,
    user: {
      id: createdUserId,
      username: cleanUsername,
      email: cleanEmail,
      full_name: full_name.trim(),
      role: 'wali_santri',
      phone: (phone || '').trim(),
    },
  });
});

apiRouter.get('/auth/registration-options', (_req, res) => {
  const classes = sortClassesByGrade(
    db
      .prepare('SELECT id, name, type, level, wali_user_id FROM classes ORDER BY type, name')
      .all() as { id: number; name: string; type: 'salaf' | 'sekolah'; level: string; wali_user_id: number | null }[]
  );
  const dormRooms = db
    .prepare('SELECT id, name, building, pembina_user_id FROM dorm_rooms ORDER BY building, name')
    .all() as { id: number; name: string; building: string; pembina_user_id: number | null }[];

  res.json({
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      level: c.level,
      has_wali: Boolean(c.wali_user_id),
    })),
    dorm_rooms: dormRooms.map((d) => ({
      id: d.id,
      name: d.name,
      building: d.building,
      has_pembina: Boolean(d.pembina_user_id),
    })),
  });
});

apiRouter.post('/auth/register-staff', (req, res) => {
  const {
    full_name,
    username,
    email,
    phone,
    password,
    role,
    requested_class_ids,
    requested_dorm_ids,
    assignment_note,
  } = req.body as {
    full_name?: string;
    username?: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: UserRole;
    requested_class_ids?: number[];
    requested_dorm_ids?: number[];
    assignment_note?: string;
  };

  const allowedStaffRoles: UserRole[] = ['wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'];
  if (!full_name?.trim() || !username?.trim() || !email?.trim() || !password || !role || !allowedStaffRoles.includes(role)) {
    res.status(400).json({ error: 'Nama lengkap, peran, username, email, dan kata sandi wajib diisi.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  const existingUser = db
    .prepare('SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?')
    .get(cleanUsername, cleanEmail);
  if (existingUser) {
    res.status(409).json({ error: 'Username atau email sudah terdaftar. Silakan gunakan yang lain atau masuk.' });
    return;
  }

  const noteParts: string[] = [];
  if (role !== 'pembina_asrama' && Array.isArray(requested_class_ids) && requested_class_ids.length > 0) {
    const classIds = requested_class_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    if (classIds.length > 0) {
      const placeholders = classIds.map(() => '?').join(',');
      const clsRows = db
        .prepare(`SELECT name, type FROM classes WHERE id IN (${placeholders})`)
        .all(...classIds) as { name: string; type: string }[];
      if (clsRows.length > 0) {
        noteParts.push(`Mengajukan kelas: ${clsRows.map((c) => `[${c.type.toUpperCase()}] ${c.name}`).join(', ')}`);
      }
    }
  }
  if (role === 'pembina_asrama' && Array.isArray(requested_dorm_ids) && requested_dorm_ids.length > 0) {
    const dormIds = requested_dorm_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    if (dormIds.length > 0) {
      const placeholders = dormIds.map(() => '?').join(',');
      const dormRows = db
        .prepare(`SELECT name, building FROM dorm_rooms WHERE id IN (${placeholders})`)
        .all(...dormIds) as { name: string; building: string }[];
      if (dormRows.length > 0) {
        noteParts.push(`Mengajukan kamar: ${dormRows.map((d) => `${d.name} (${d.building})`).join(', ')}`);
      }
    }
  }
  if (assignment_note?.trim()) {
    noteParts.push(assignment_note.trim());
  }

  const roleLabels: Record<string, string> = {
    wali_salaf: 'Wali Kelas Salaf',
    wali_sekolah: 'Wali Kelas Sekolah',
    wali_kelas: 'Wali Kelas (Salaf & Sekolah)',
    pembina_asrama: 'Pembina Asrama',
  };
  const registrationNote = noteParts.join(' · ') || `Pendaftaran mandiri sebagai ${roleLabels[role]}`;

  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);

  let createdUserId = 0;
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, full_name, role, phone, registration_note, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(cleanUsername, cleanEmail, hash, full_name.trim(), role, (phone || '').trim(), registrationNote, now);

    createdUserId = Number(result.lastInsertRowid);

    if (role !== 'pembina_asrama' && Array.isArray(requested_class_ids) && requested_class_ids.length > 0) {
      const classIds = requested_class_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
      const assignCls = db.prepare('UPDATE classes SET wali_user_id = ? WHERE id = ? AND wali_user_id IS NULL');
      for (const cid of classIds) {
        assignCls.run(createdUserId, cid);
      }
    }

    if (role === 'pembina_asrama' && Array.isArray(requested_dorm_ids) && requested_dorm_ids.length > 0) {
      const dormIds = requested_dorm_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
      const assignDorm = db.prepare('UPDATE dorm_rooms SET pembina_user_id = ? WHERE id = ? AND pembina_user_id IS NULL');
      for (const did of dormIds) {
        assignDorm.run(createdUserId, did);
      }
    }
  });
  tx();

  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all() as { id: number }[];
  for (const adm of admins) {
    createNotification(
      adm.id,
      `Pendaftaran ${roleLabels[role]} Baru`,
      `${full_name.trim()} (@${cleanUsername}) mendaftar dan aktif sebagai ${roleLabels[role]}. ${registrationNote}.`,
      'umum',
      'user',
      createdUserId
    );
  }

  logAudit(
    { userId: createdUserId, username: cleanUsername, fullName: full_name.trim(), role },
    'REGISTER_STAFF',
    'Autentikasi',
    `Pendaftaran mandiri ${roleLabels[role]} (${full_name.trim()}) langsung aktif. ${registrationNote}`
  );

  const token = signToken({
    userId: createdUserId,
    username: cleanUsername,
    fullName: full_name.trim(),
    role,
  });

  res.status(201).json({
    token,
    pending_approval: false,
    message: `Pendaftaran sebagai ${roleLabels[role]} berhasil dan akun Anda (@${cleanUsername}) langsung aktif.`,
    user: {
      id: createdUserId,
      username: cleanUsername,
      email: cleanEmail,
      full_name: full_name.trim(),
      role,
      phone: (phone || '').trim(),
      avatar_file: '',
      registration_note: registrationNote,
      is_active: 1,
    },
  });
});

apiRouter.get('/auth/demo-accounts', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, username, full_name, role FROM users
       WHERE username IN ('admin','bendahara','wali.santri','wali.salaf','wali.sekolah','pembina')
       ORDER BY CASE role
         WHEN 'admin' THEN 1
         WHEN 'bendahara' THEN 2
         WHEN 'wali_santri' THEN 3
         WHEN 'wali_salaf' THEN 4
         WHEN 'wali_sekolah' THEN 5
         WHEN 'pembina_asrama' THEN 6
       END`
    )
    .all();
  res.json({ accounts: rows });
});

apiRouter.get('/auth/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = db
    .prepare('SELECT id, username, email, full_name, role, phone, avatar_file, is_active, created_at FROM users WHERE id = ?')
    .get(req.user!.userId);
  res.json({ user });
});

apiRouter.put(
  '/auth/profile/photo',
  authenticateJWT,
  upload.single('photo'),
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Pilih file foto profil terlebih dahulu (JPG, PNG, atau WEBP).' });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const allowedImageExt = ['.jpg', '.jpeg', '.png', '.webp'];
    if (!allowedImageExt.includes(ext)) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'Foto profil harus berformat gambar JPG, PNG, atau WEBP.' });
      return;
    }

    const userId = req.user!.userId;
    const current = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(userId) as
      | { avatar_file?: string }
      | undefined;

    if (current?.avatar_file && current.avatar_file.startsWith('/uploads/')) {
      const oldPath = path.resolve(process.cwd(), current.avatar_file.slice(1));
      if (oldPath !== req.file.path && fs.existsSync(oldPath)) {
        fs.unlink(oldPath, () => {});
      }
    }

    const nextAvatarUrl = `/uploads/${req.file.filename}`;
    db.prepare('UPDATE users SET avatar_file = ? WHERE id = ?').run(nextAvatarUrl, userId);

    logAudit(req.user, 'UPDATE_AVATAR', 'Profil', 'Memperbarui foto profil akun');

    const updated = db
      .prepare('SELECT id, username, email, full_name, role, phone, avatar_file, is_active, created_at FROM users WHERE id = ?')
      .get(userId);
    res.json({ user: updated });
  }
);

apiRouter.delete('/auth/profile/photo', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const current = db.prepare('SELECT avatar_file FROM users WHERE id = ?').get(userId) as
    | { avatar_file?: string }
    | undefined;

  if (current?.avatar_file && current.avatar_file.startsWith('/uploads/')) {
    const oldPath = path.resolve(process.cwd(), current.avatar_file.slice(1));
    if (fs.existsSync(oldPath)) {
      fs.unlink(oldPath, () => {});
    }
  }

  db.prepare("UPDATE users SET avatar_file = '' WHERE id = ?").run(userId);
  logAudit(req.user, 'DELETE_AVATAR', 'Profil', 'Menghapus foto profil akun');

  const updated = db
    .prepare('SELECT id, username, email, full_name, role, phone, avatar_file, is_active, created_at FROM users WHERE id = ?')
    .get(userId);
  res.json({ user: updated });
});

apiRouter.put('/auth/password', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const { current_password, new_password, confirm_password } = req.body as {
    current_password?: string;
    new_password?: string;
    confirm_password?: string;
  };

  if (!current_password || !new_password || !confirm_password) {
    res.status(400).json({ error: 'Kata sandi saat ini, kata sandi baru, dan konfirmasi wajib diisi.' });
    return;
  }
  if (new_password.length < 6) {
    res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
    return;
  }
  if (new_password !== confirm_password) {
    res.status(400).json({ error: 'Konfirmasi kata sandi baru tidak cocok.' });
    return;
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user!.userId) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    res.status(401).json({ error: 'Kata sandi saat ini salah.' });
    return;
  }

  const nextHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextHash, user.id);

  logAudit(req.user, 'CHANGE_PASSWORD', 'Profil', 'Mengubah kata sandi akun secara mandiri');
  res.json({ success: true, message: 'Kata sandi berhasil diperbarui.' });
});

// Pondok Profile
apiRouter.get('/pondok', authenticateJWT, (_req, res) => {
  const profile = db.prepare('SELECT * FROM pondok_profile WHERE id = 1').get();
  res.json({ profile });
});

apiRouter.get('/pondok/maps-config', authenticateJWT, (_req, res) => {
  const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
  res.json({ apiKey });
});

apiRouter.get('/pondok/geocode', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const rawAddress = typeof req.query.address === 'string' ? req.query.address.trim() : '';
  const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (!rawAddress) {
    res.status(400).json({ error: 'Parameter alamat wajib diisi.' });
    return;
  }
  if (!apiKey) {
    res.status(503).json({ error: 'Konfigurasi Google Maps API belum tersedia.' });
    return;
  }

  try {
    const encodedAddress = encodeURIComponent(rawAddress);
    const geocodeUrl = `https://geocode.googleapis.com/v4/geocode/address/${encodedAddress}?regionCode=ID&languageCode=id`;
    const upstream = await fetch(geocodeUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'results.placeId,results.location,results.formattedAddress,results.viewport',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      },
    });

    const data = (await upstream.json()) as {
      results?: Array<{
        placeId?: string;
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        viewport?: {
          low?: { latitude?: number; longitude?: number };
          high?: { latitude?: number; longitude?: number };
        };
      }>;
      error?: { status?: string; message?: string; code?: number };
    };

    if (upstream.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED') {
      res.status(429).json({
        error: 'Google Maps Platform quota reached.',
        status: 'RESOURCE_EXHAUSTED',
      });
      return;
    }

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: data?.error?.message || 'Gagal melakukan geocoding alamat pondok.',
        status: data?.error?.status,
      });
      return;
    }

    const first = data?.results?.[0];
    if (!first?.location || typeof first.location.latitude !== 'number' || typeof first.location.longitude !== 'number') {
      res.status(404).json({ error: 'Koordinat lokasi tidak ditemukan untuk alamat tersebut.' });
      return;
    }

    res.json({
      location: {
        lat: first.location.latitude,
        lng: first.location.longitude,
      },
      placeId: first.placeId || null,
      formattedAddress: first.formattedAddress || rawAddress,
      viewport: first.viewport || null,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Gagal menghubungi layanan Geocoding API.',
    });
  }
});

apiRouter.put('/pondok', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const {
    name,
    tagline,
    about,
    address,
    phone,
    email,
    pengasuh,
    history_cikal_bakal,
    history_pendirian,
    history_arti_nama,
    edu_jenjang,
    edu_kurikulum,
    edu_kegiatan,
    spmb_info,
    vision,
    mission,
    bank_name,
    bank_account,
    bank_holder,
  } = req.body;
  if (!name || !address) {
    res.status(400).json({ error: 'Nama pondok dan alamat wajib diisi.' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE pondok_profile SET
       name = ?, tagline = ?, about = ?, address = ?, phone = ?, email = ?, pengasuh = ?,
       history_cikal_bakal = ?, history_pendirian = ?, history_arti_nama = ?,
       edu_jenjang = ?, edu_kurikulum = ?, edu_kegiatan = ?, spmb_info = ?,
       vision = ?, mission = ?, bank_name = ?, bank_account = ?, bank_holder = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    name,
    tagline || '',
    about || '',
    address,
    phone || '',
    email || '',
    pengasuh || '',
    history_cikal_bakal || '',
    history_pendirian || '',
    history_arti_nama || '',
    edu_jenjang || '',
    edu_kurikulum || '',
    edu_kegiatan || '',
    spmb_info || '',
    vision || '',
    mission || '',
    bank_name || '',
    bank_account || '',
    bank_holder || '',
    now
  );

  logAudit(req.user, 'UPDATE_PONDOK', 'Profil Pondok', `Memperbarui profil ${name}`);
  const profile = db.prepare('SELECT * FROM pondok_profile WHERE id = 1').get();
  res.json({ profile });
});

// ============================================================
// 2. AKUN PENGGUNA (Admin)
// ============================================================
apiRouter.get('/users', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const roleFilter = req.query.role as string | undefined;
  let rows;
  if (roleFilter) {
    rows = db
      .prepare('SELECT id, username, email, full_name, role, phone, registration_note, is_active, created_at FROM users WHERE role = ? ORDER BY is_active ASC, id DESC')
      .all(roleFilter);
  } else {
    rows = db
      .prepare('SELECT id, username, email, full_name, role, phone, registration_note, is_active, created_at FROM users ORDER BY is_active ASC, id DESC')
      .all();
  }
  res.json({ users: rows });
});

apiRouter.post('/users', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const { username, email, password, full_name, role, phone } = req.body;
  if (!username || !email || !full_name || !role) {
    res.status(400).json({ error: 'Username, email, nama lengkap, dan peran wajib diisi.' });
    return;
  }
  const validRoles: UserRole[] = ['admin', 'bendahara', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: 'Peran pengguna tidak valid.' });
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.trim(), email.trim());
  if (existing) {
    res.status(409).json({ error: 'Username atau email sudah terdaftar.' });
    return;
  }

  const hash = bcrypt.hashSync(password || 'tapaksunan123', 10);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .run(username.trim(), email.trim(), hash, full_name.trim(), role, phone || '', now);

  logAudit(req.user, 'CREATE_USER', 'Akun', `Menambah akun ${full_name} (${role})`);
  const created = db
    .prepare('SELECT id, username, email, full_name, role, phone, registration_note, is_active, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json({ user: created });
});

apiRouter.put('/users/:id', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { full_name, email, role, phone, is_active, password } = req.body;
  const existing = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(id) as
    | { id: number; is_active: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    return;
  }

  const validRoles: UserRole[] = ['admin', 'bendahara', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'];
  if (!full_name?.trim() || !email?.trim() || !validRoles.includes(role)) {
    res.status(400).json({ error: 'Nama lengkap, email, dan peran pengguna yang valid wajib diisi.' });
    return;
  }

  const dupEmail = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
    .get(String(email).trim().toLowerCase(), id);
  if (dupEmail) {
    res.status(409).json({ error: 'Email sudah digunakan oleh akun lain.' });
    return;
  }

  const nextActive = is_active ? 1 : 0;
  db.prepare(
    `UPDATE users SET full_name = ?, email = ?, role = ?, phone = ?, is_active = ? WHERE id = ?`
  ).run(String(full_name).trim(), String(email).trim(), role, String(phone || '').trim(), nextActive, id);

  if (password && String(password).trim().length >= 6) {
    const hash = bcrypt.hashSync(String(password).trim(), 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  if (existing.is_active === 0 && nextActive === 1) {
    createNotification(
      id,
      'Akun Anda Telah Diaktifkan',
      'Admin Pondok telah menyetujui dan mengaktifkan akun Anda. Selamat bertugas di Sistem Informasi Pondok Pesantren Tapak Sunan.',
      'umum'
    );
  }

  logAudit(req.user, 'UPDATE_USER', 'Akun', `Memperbarui akun ID #${id} (${String(full_name).trim()} · ${role})`);
  const updated = db
    .prepare('SELECT id, username, email, full_name, role, phone, registration_note, is_active, created_at FROM users WHERE id = ?')
    .get(id);
  res.json({ user: updated });
});

apiRouter.delete('/users/:id', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (id === req.user!.userId) {
    res.status(400).json({ error: 'Tidak dapat menghapus akun yang sedang digunakan.' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logAudit(req.user, 'DELETE_USER', 'Akun', `Menghapus akun ID #${id}`);
  res.json({ success: true });
});

// ============================================================
// 3. DATA MASTER (Santri, Kelas Salaf/Sekolah, Asrama)
// ============================================================
apiRouter.get('/master/students', authenticateJWT, requireRoles('admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  const baseQuery = `
    SELECT s.*,
      u.full_name as wali_name, u.phone as wali_phone, u.email as wali_email,
      COALESCE(
        (SELECT GROUP_CONCAT(u2.full_name, ', ')
         FROM student_walis sw2 JOIN users u2 ON sw2.wali_user_id = u2.id
         WHERE sw2.student_id = s.id),
        u.full_name
      ) as wali_names,
      cs.name as salaf_class_name, cs.level as salaf_level, cs.wali_user_id as salaf_wali_id,
      ck.name as sekolah_class_name, ck.level as sekolah_level, ck.wali_user_id as sekolah_wali_id,
      dr.name as dorm_room_name, dr.building as dorm_building, dr.pembina_user_id as pembina_id
    FROM students s
    LEFT JOIN users u ON s.wali_user_id = u.id
    LEFT JOIN classes cs ON s.salaf_class_id = cs.id
    LEFT JOIN classes ck ON s.sekolah_class_id = ck.id
    LEFT JOIN dorm_rooms dr ON s.dorm_room_id = dr.id
  `;

  let students;
  if (role === 'wali_santri') {
    students = db.prepare(`${baseQuery} WHERE ${WALI_LINKED_SQL} ORDER BY s.full_name`).all(userId, userId);
  } else if (role === 'wali_salaf') {
    students = db.prepare(`${baseQuery} WHERE cs.wali_user_id = ? AND s.status = 'aktif' ORDER BY s.full_name`).all(userId);
  } else if (role === 'wali_sekolah') {
    students = db.prepare(`${baseQuery} WHERE ck.wali_user_id = ? AND s.status = 'aktif' ORDER BY s.full_name`).all(userId);
  } else if (role === 'wali_kelas') {
    students = db
      .prepare(`${baseQuery} WHERE (cs.wali_user_id = ? OR ck.wali_user_id = ?) AND s.status = 'aktif' ORDER BY s.full_name`)
      .all(userId, userId);
  } else if (role === 'pembina_asrama') {
    students = db.prepare(`${baseQuery} WHERE (dr.pembina_user_id = ? OR dr.pembina_user_id IS NULL) AND s.status = 'aktif' ORDER BY dr.name, s.full_name`).all(userId);
  } else {
    students = db.prepare(`${baseQuery} ORDER BY s.id DESC`).all();
  }

  res.json({ students });
});

apiRouter.post('/wali/children', authenticateJWT, requireRoles('wali_santri'), (req: AuthenticatedRequest, res: Response) => {
  const waliUserId = req.user!.userId;
  const {
    child_mode,
    existing_nis,
    student_name,
    student_gender,
    student_birth_date,
    student_address,
  } = req.body as {
    child_mode?: 'new_student' | 'existing_nis';
    existing_nis?: string;
    student_name?: string;
    student_gender?: 'L' | 'P';
    student_birth_date?: string;
    student_address?: string;
  };

  const mode = child_mode || 'new_student';
  const now = new Date().toISOString();

  if (mode === 'existing_nis') {
    if (!existing_nis?.trim()) {
      res.status(400).json({ error: 'Nomor Induk Santri (NIS) wajib diisi.' });
      return;
    }
    const student = db
      .prepare('SELECT id, nis, full_name, wali_user_id FROM students WHERE LOWER(nis) = ?')
      .get(existing_nis.trim().toLowerCase()) as
      | { id: number; nis: string; full_name: string; wali_user_id: number | null }
      | undefined;

    if (!student) {
      res.status(404).json({ error: `Santri dengan NIS "${existing_nis.trim()}" tidak ditemukan.` });
      return;
    }
    if (isWaliLinkedToStudent(waliUserId, student.id)) {
      res.status(409).json({ error: `Santri ${student.full_name} sudah tertaut di akun Anda.` });
      return;
    }

    db.prepare('INSERT OR IGNORE INTO student_walis (student_id, wali_user_id, created_at) VALUES (?, ?, ?)').run(
      student.id,
      waliUserId,
      now
    );
    if (!student.wali_user_id) {
      db.prepare('UPDATE students SET wali_user_id = ? WHERE id = ?').run(waliUserId, student.id);
    }

    notifyStudentWalis(
      student.id,
      'Wali Lain Terhubung ke Data Anak',
      `${req.user!.fullName} menautkan akunnya ke data santri ${student.full_name} (${student.nis}) untuk berbagi akses SPP & akademik.`,
      'umum',
      undefined,
      undefined,
      waliUserId
    );

    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all() as { id: number }[];
    for (const adm of admins) {
      createNotification(
        adm.id,
        'Penautan Anak Wali Santri',
        `${req.user!.fullName} menautkan santri ${student.full_name} (${student.nis}) ke akun Wali Santri.`,
        'umum'
      );
    }
    logAudit(req.user, 'LINK_WALI_CHILD', 'Data Master', `Wali Santri menautkan anak ${student.full_name} (${student.nis})`);

    res.status(200).json({
      student_id: student.id,
      message: `Data santri ${student.full_name} (${student.nis}) berhasil ditautkan ke akun Anda. Semua tagihan SPP dan info akademik kini tersinkron.`,
    });
    return;
  }

  if (!student_name?.trim()) {
    res.status(400).json({ error: 'Nama lengkap santri (anak) wajib diisi.' });
    return;
  }

  let createdStudentId = 0;
  let generatedNis = '';

  const tx = db.transaction(() => {
    const countRow = db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number };
    let seq = countRow.c + 1;
    do {
      generatedNis = `TS-2026-${String(seq).padStart(3, '0')}`;
      seq += 1;
    } while (db.prepare('SELECT id FROM students WHERE nis = ?').get(generatedNis));

    const stRes = db
      .prepare(
        `INSERT INTO students (nis, full_name, gender, birth_date, wali_user_id, status, address, created_at)
         VALUES (?, ?, ?, ?, ?, 'aktif', ?, ?)`
      )
      .run(
        generatedNis,
        student_name.trim(),
        student_gender === 'P' ? 'P' : 'L',
        student_birth_date || '2014-01-01',
        waliUserId,
        (student_address || '').trim(),
        now
      );
    createdStudentId = Number(stRes.lastInsertRowid);
    db.prepare('INSERT OR IGNORE INTO student_walis (student_id, wali_user_id, created_at) VALUES (?, ?, ?)').run(
      createdStudentId,
      waliUserId,
      now
    );

    const daftarUlang = db
      .prepare("SELECT title, amount FROM fee_configs WHERE fee_type = 'daftar_ulang'")
      .get() as { title: string; amount: number } | undefined;
    if (daftarUlang) {
      const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      db.prepare(
        `INSERT INTO bills (student_id, fee_type, period_month, title, total_amount, paid_amount, status, due_date, created_at)
         VALUES (?, 'daftar_ulang', '2026-2027', ?, ?, 0, 'BELUM_BAYAR', ?, ?)`
      ).run(createdStudentId, daftarUlang.title, daftarUlang.amount, dueDate, now);
    }
  });
  tx();

  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1").all() as { id: number }[];
  for (const adm of admins) {
    createNotification(
      adm.id,
      'Pendaftaran Anak Tambahan Santri Baru',
      `${req.user!.fullName} mendaftarkan santri baru ${student_name.trim()} (${generatedNis}) melalui akun Wali Santri.`,
      'umum'
    );
  }
  logAudit(req.user, 'ADD_WALI_CHILD', 'Data Master', `Wali Santri mendaftarkan anak baru ${student_name.trim()} (${generatedNis})`);

  res.status(201).json({
    student_id: createdStudentId,
    nis: generatedNis,
    message: `Santri baru ${student_name.trim()} (${generatedNis}) berhasil didaftarkan ke akun Anda.`,
  });
});

apiRouter.post('/master/students', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const { nis, full_name, gender, birth_date, wali_user_id, salaf_class_id, sekolah_class_id, dorm_room_id, status, address } =
    req.body;
  if (!nis || !full_name || !gender) {
    res.status(400).json({ error: 'NIS, nama lengkap santri, dan jenis kelamin wajib diisi.' });
    return;
  }
  const dup = db.prepare('SELECT id FROM students WHERE nis = ?').get(nis.trim());
  if (dup) {
    res.status(409).json({ error: 'NIS sudah terdaftar.' });
    return;
  }
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO students (nis, full_name, gender, birth_date, wali_user_id, salaf_class_id, sekolah_class_id, dorm_room_id, status, address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      nis.trim(),
      full_name.trim(),
      gender,
      birth_date || '2013-01-01',
      wali_user_id || null,
      salaf_class_id || null,
      sekolah_class_id || null,
      dorm_room_id || null,
      status || 'aktif',
      address || '',
      now
    );

  const createdStudentId = Number(result.lastInsertRowid);
  if (wali_user_id) {
    db.prepare('INSERT OR IGNORE INTO student_walis (student_id, wali_user_id, created_at) VALUES (?, ?, ?)').run(
      createdStudentId,
      Number(wali_user_id),
      now
    );
  }

  logAudit(req.user, 'CREATE_STUDENT', 'Data Master', `Menambah santri ${full_name} (${nis})`);
  res.status(201).json({ id: createdStudentId });
});

apiRouter.put('/master/students/:id', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { nis, full_name, gender, birth_date, wali_user_id, salaf_class_id, sekolah_class_id, dorm_room_id, status, address } =
    req.body;
  db.prepare(
    `UPDATE students SET
       nis = ?, full_name = ?, gender = ?, birth_date = ?, wali_user_id = ?,
       salaf_class_id = ?, sekolah_class_id = ?, dorm_room_id = ?, status = ?, address = ?
     WHERE id = ?`
  ).run(
    nis,
    full_name,
    gender,
    birth_date,
    wali_user_id || null,
    salaf_class_id || null,
    sekolah_class_id || null,
    dorm_room_id || null,
    status || 'aktif',
    address || '',
    id
  );
  if (wali_user_id) {
    db.prepare('INSERT OR IGNORE INTO student_walis (student_id, wali_user_id, created_at) VALUES (?, ?, ?)').run(
      id,
      Number(wali_user_id),
      new Date().toISOString()
    );
  }
  logAudit(req.user, 'UPDATE_STUDENT', 'Data Master', `Memperbarui data santri ${full_name} (ID #${id})`);
  res.json({ success: true });
});

apiRouter.delete('/master/students/:id', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM students WHERE id = ?').run(id);
  logAudit(req.user, 'DELETE_STUDENT', 'Data Master', `Menghapus santri ID #${id}`);
  res.json({ success: true });
});

// Classes (Salaf & Sekolah)
apiRouter.get('/master/classes', authenticateJWT, requireRoles('admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  const baseQuery = `
    SELECT c.*, u.full_name as wali_name,
      (SELECT COUNT(*) FROM students s WHERE (c.type='salaf' AND s.salaf_class_id=c.id) OR (c.type='sekolah' AND s.sekolah_class_id=c.id)) as student_count
    FROM classes c
    LEFT JOIN users u ON c.wali_user_id = u.id
  `;
  let classes: { type: string; name: string }[];
  if (role === 'wali_salaf') {
    classes = db.prepare(`${baseQuery} WHERE c.type = 'salaf' AND c.wali_user_id = ?`).all(userId) as { type: string; name: string }[];
  } else if (role === 'wali_sekolah') {
    classes = db.prepare(`${baseQuery} WHERE c.type = 'sekolah' AND c.wali_user_id = ?`).all(userId) as { type: string; name: string }[];
  } else if (role === 'wali_kelas') {
    classes = db.prepare(`${baseQuery} WHERE c.wali_user_id = ?`).all(userId) as { type: string; name: string }[];
  } else {
    classes = db.prepare(baseQuery).all() as { type: string; name: string }[];
  }
  res.json({ classes: sortClassesByGrade(classes) });
});

apiRouter.post('/master/classes', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const { name, type, level, wali_user_id, academic_year } = req.body;
  if (!name || !type || !level || !['salaf', 'sekolah'].includes(type)) {
    res.status(400).json({ error: 'Nama kelas, jenis (salaf/sekolah), dan jenjang wajib diisi.' });
    return;
  }
  const waliId = wali_user_id ? Number(wali_user_id) : null;
  const result = db
    .prepare('INSERT INTO classes (name, type, level, wali_user_id, academic_year) VALUES (?, ?, ?, ?, ?)')
    .run(String(name).trim(), type, String(level).trim(), waliId, academic_year || '2026/2027');
  const promoted = syncTeacherRoleForClass(waliId, type);
  logAudit(req.user, 'CREATE_CLASS', 'Data Master', `Menambah kelas ${type}: ${name}`);
  res.status(201).json({ id: result.lastInsertRowid, promoted });
});

apiRouter.put('/master/classes/:id', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { name, type, level, wali_user_id, academic_year } = req.body;
  if (!name || !type || !level || !['salaf', 'sekolah'].includes(type)) {
    res.status(400).json({ error: 'Nama kelas, jenis (salaf/sekolah), dan jenjang wajib diisi.' });
    return;
  }
  const waliId = wali_user_id ? Number(wali_user_id) : null;
  db.prepare('UPDATE classes SET name = ?, type = ?, level = ?, wali_user_id = ?, academic_year = ? WHERE id = ?').run(
    String(name).trim(),
    type,
    String(level).trim(),
    waliId,
    academic_year || '2026/2027',
    id
  );
  const promoted = syncTeacherRoleForClass(waliId, type);
  logAudit(req.user, 'UPDATE_CLASS', 'Data Master', `Memperbarui kelas ${name}`);
  res.json({ success: true, promoted });
});

apiRouter.delete('/master/classes/:id', authenticateJWT, requireRoles('admin'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM classes WHERE id = ?').run(id);
  logAudit(req.user, 'DELETE_CLASS', 'Data Master', `Menghapus kelas ID #${id}`);
  res.json({ success: true });
});

// Dorm Rooms
apiRouter.get('/master/dorm-rooms', authenticateJWT, requireRoles('admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  const baseQuery = `
    SELECT dr.*, u.full_name as pembina_name,
      (SELECT COUNT(*) FROM students s WHERE s.dorm_room_id = dr.id AND s.status = 'aktif') as occupant_count
    FROM dorm_rooms dr
    LEFT JOIN users u ON dr.pembina_user_id = u.id
  `;
  const rooms =
    role === 'pembina_asrama'
      ? db.prepare(`${baseQuery} WHERE dr.pembina_user_id = ? ORDER BY dr.name`).all(userId)
      : db.prepare(`${baseQuery} ORDER BY dr.building, dr.name`).all();
  res.json({ rooms });
});

apiRouter.post('/master/dorm-rooms', authenticateJWT, requireRoles('admin', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { name, building, capacity, pembina_user_id, condition_note } = req.body;
  if (!name || !building) {
    res.status(400).json({ error: 'Nama kamar dan gedung wajib diisi.' });
    return;
  }
  const pembinaId = req.user!.role === 'pembina_asrama' ? req.user!.userId : pembina_user_id || null;
  const result = db
    .prepare('INSERT INTO dorm_rooms (name, building, capacity, pembina_user_id, condition_note) VALUES (?, ?, ?, ?, ?)')
    .run(name, building, Number(capacity) || 10, pembinaId, condition_note || 'Baik');
  logAudit(req.user, 'CREATE_DORM_ROOM', 'Asrama', `Menambah kamar asrama ${name}`);
  res.status(201).json({ id: result.lastInsertRowid });
});

apiRouter.put('/master/dorm-rooms/:id', authenticateJWT, requireRoles('admin', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { name, building, capacity, pembina_user_id, condition_note } = req.body;
  const existing = db.prepare('SELECT pembina_user_id FROM dorm_rooms WHERE id = ?').get(id) as { pembina_user_id: number | null } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Kamar tidak ditemukan.' });
    return;
  }
  const nextPembina = req.user!.role === 'pembina_asrama' ? existing.pembina_user_id : pembina_user_id || null;
  db.prepare('UPDATE dorm_rooms SET name = ?, building = ?, capacity = ?, pembina_user_id = ?, condition_note = ? WHERE id = ?').run(
    name,
    building,
    Number(capacity) || 10,
    nextPembina,
    condition_note || '',
    id
  );
  logAudit(req.user, 'UPDATE_DORM_ROOM', 'Asrama', `Memperbarui kamar ${name}`);
  res.json({ success: true });
});

apiRouter.patch('/master/dorm-rooms/:id/assign-student', authenticateJWT, requireRoles('admin', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const roomId = Number(req.params.id);
  const { student_id } = req.body;
  db.prepare('UPDATE students SET dorm_room_id = ? WHERE id = ?').run(roomId, Number(student_id));
  logAudit(req.user, 'ASSIGN_DORM', 'Asrama', `Menempatkan santri #${student_id} ke kamar #${roomId}`);
  res.json({ success: true });
});

// ============================================================
// 4. KEUANGAN (SPP, Daftar Ulang, Pembayaran, Verifikasi, Kas)
// ============================================================
apiRouter.get('/finance/fees', authenticateJWT, (_req, res) => {
  const fees = db.prepare('SELECT * FROM fee_configs ORDER BY fee_type').all();
  res.json({ fees });
});

apiRouter.put('/finance/fees/:feeType', authenticateJWT, requireRoles('admin', 'bendahara'), (req: AuthenticatedRequest, res: Response) => {
  const feeType = req.params.feeType;
  const { title, amount, academic_year, description } = req.body;
  if (!['spp', 'daftar_ulang'].includes(feeType)) {
    res.status(400).json({ error: 'Jenis biaya tidak valid.' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE fee_configs SET title = ?, amount = ?, academic_year = ?, description = ?, updated_at = ? WHERE fee_type = ?`
  ).run(title, Number(amount), academic_year, description || '', now, feeType);
  logAudit(req.user, 'UPDATE_FEE_CONFIG', 'Keuangan', `Mengubah tarif ${feeType} menjadi Rp ${Number(amount).toLocaleString('id-ID')}`);
  res.json({ success: true });
});

// Generate monthly SPP / Daftar Ulang bills for all active santri (Flowchart step 1 & 2)
apiRouter.post('/finance/bills/generate', authenticateJWT, requireRoles('admin', 'bendahara'), (req: AuthenticatedRequest, res: Response) => {
  const { fee_type, period_month, title, due_date } = req.body as {
    fee_type: 'spp' | 'daftar_ulang';
    period_month: string;
    title: string;
    due_date: string;
  };
  if (!fee_type || !period_month || !title || !due_date) {
    res.status(400).json({ error: 'Jenis biaya, periode, judul tagihan, dan jatuh tempo wajib diisi.' });
    return;
  }
  const fee = db.prepare('SELECT amount FROM fee_configs WHERE fee_type = ?').get(fee_type) as { amount: number } | undefined;
  if (!fee) {
    res.status(404).json({ error: 'Konfigurasi tarif belum ditemukan.' });
    return;
  }

  const activeStudents = db.prepare("SELECT id, full_name, wali_user_id FROM students WHERE status = 'aktif'").all() as {
    id: number;
    full_name: string;
    wali_user_id: number | null;
  }[];

  const now = new Date().toISOString();
  let createdCount = 0;

  const insertBill = db.prepare(`
    INSERT INTO bills (student_id, fee_type, period_month, title, total_amount, paid_amount, status, due_date, created_at)
    VALUES (?, ?, ?, ?, ?, 0, 'BELUM_BAYAR', ?, ?)
  `);

  for (const st of activeStudents) {
    const existing = db
      .prepare('SELECT id FROM bills WHERE student_id = ? AND fee_type = ? AND period_month = ?')
      .get(st.id, fee_type, period_month);
    if (!existing) {
      const info = insertBill.run(st.id, fee_type, period_month, title, fee.amount, due_date, now);
      createdCount++;
      // Flowchart step 2: Semua Wali tertaut menerima notifikasi tagihan
      notifyStudentWalis(
        st.id,
        `Tagihan Baru: ${title}`,
        `Tagihan ${title} sebesar Rp ${fee.amount.toLocaleString('id-ID')} untuk ${st.full_name} telah terbit. Jatuh tempo: ${due_date}.`,
        'keuangan',
        'bill',
        Number(info.lastInsertRowid)
      );
    }
  }

  logAudit(req.user, 'GENERATE_BILLS', 'Keuangan', `Menerbitkan ${createdCount} tagihan "${title}" untuk santri aktif`);
  res.json({ created_count: createdCount });
});

apiRouter.get('/finance/bills', authenticateJWT, requireRoles('admin', 'bendahara', 'wali_santri'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  const query = `
    SELECT b.*, s.full_name as student_name, s.nis, s.wali_user_id,
      COALESCE(
        (SELECT GROUP_CONCAT(u2.full_name, ', ')
         FROM student_walis sw2 JOIN users u2 ON sw2.wali_user_id = u2.id
         WHERE sw2.student_id = s.id),
        u.full_name
      ) as wali_name,
      (SELECT p.rejection_reason FROM payments p WHERE p.bill_id = b.id AND p.status = 'DITOLAK' ORDER BY p.id DESC LIMIT 1) as latest_rejection_reason,
      (SELECT p.status FROM payments p WHERE p.bill_id = b.id ORDER BY p.id DESC LIMIT 1) as latest_payment_status
    FROM bills b
    JOIN students s ON b.student_id = s.id
    LEFT JOIN users u ON s.wali_user_id = u.id
  `;
  const bills =
    role === 'wali_santri'
      ? db.prepare(`${query} WHERE ${WALI_LINKED_SQL} ORDER BY b.id DESC`).all(userId, userId)
      : db.prepare(`${query} ORDER BY b.id DESC`).all();
  res.json({ bills });
});

apiRouter.get('/finance/payments', authenticateJWT, requireRoles('admin', 'bendahara', 'wali_santri'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  const query = `
    SELECT p.*, b.title as bill_title, b.fee_type, b.period_month, b.total_amount as bill_total_amount,
      s.full_name as student_name, s.nis, u.full_name as wali_name, v.full_name as verifier_name
    FROM payments p
    JOIN bills b ON p.bill_id = b.id
    JOIN students s ON p.student_id = s.id
    LEFT JOIN users u ON p.wali_user_id = u.id
    LEFT JOIN users v ON p.verified_by = v.id
  `;
  const payments =
    role === 'wali_santri'
      ? db.prepare(`${query} WHERE ${WALI_LINKED_SQL} ORDER BY p.id DESC`).all(userId, userId)
      : db.prepare(`${query} ORDER BY p.id DESC`).all();
  res.json({ payments });
});

// Flowchart step 3 & 4: Wali membayar (transfer/tunai) & unggah bukti -> MENUNGGU_VERIFIKASI
apiRouter.post(
  '/finance/payments',
  authenticateJWT,
  requireRoles('wali_santri', 'admin', 'bendahara'),
  upload.single('proof'),
  (req: AuthenticatedRequest, res: Response) => {
    const { bill_id, method, amount, notes } = req.body;
    const billId = Number(bill_id);
    const payAmount = Number(amount);

    if (!billId || !payAmount || payAmount <= 0) {
      res.status(400).json({ error: 'Tagihan dan nominal pembayaran wajib diisi dengan benar.' });
      return;
    }

    const bill = db
      .prepare(
        `SELECT b.*, s.wali_user_id, s.full_name as student_name
         FROM bills b JOIN students s ON b.student_id = s.id WHERE b.id = ?`
      )
      .get(billId) as
      | {
          id: number;
          student_id: number;
          title: string;
          total_amount: number;
          paid_amount: number;
          wali_user_id: number | null;
          student_name: string;
        }
      | undefined;

    if (!bill) {
      res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
      return;
    }

    if (req.user!.role === 'wali_santri' && !isWaliLinkedToStudent(req.user!.userId, bill.student_id)) {
      res.status(403).json({ error: 'Anda hanya dapat mengunggah pembayaran untuk anak yang tertaut pada akun Anda.' });
      return;
    }

    const proofFile = req.file ? `/uploads/${req.file.filename}` : null;
    if (method === 'transfer' && !proofFile) {
      res.status(400).json({ error: 'Pembayaran transfer wajib melampirkan file bukti transfer.' });
      return;
    }

    const payerWaliId =
      req.user!.role === 'wali_santri' ? req.user!.userId : (bill.wali_user_id ?? req.user!.userId);

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO payments (bill_id, student_id, wali_user_id, method, amount, proof_file, notes, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'MENUNGGU_VERIFIKASI', ?)`
      )
      .run(
        bill.id,
        bill.student_id,
        payerWaliId,
        method || 'transfer',
        payAmount,
        proofFile,
        notes || '',
        now
      );

    db.prepare(`UPDATE bills SET status = 'MENUNGGU_VERIFIKASI' WHERE id = ? AND status != 'LUNAS'`).run(bill.id);

    // Notify co-walis (e.g., if Ibu submits, Ayah gets notified too)
    notifyStudentWalis(
      bill.student_id,
      'Pembayaran Tagihan Diunggah',
      `${req.user!.fullName} mengunggah pembayaran ${bill.title} untuk ${bill.student_name} sebesar Rp ${payAmount.toLocaleString('id-ID')} (menunggu verifikasi).`,
      'keuangan',
      'payment',
      Number(result.lastInsertRowid),
      req.user!.userId
    );

    // Notify all active Admins & Bendahara / TU
    const financeManagers = db
      .prepare("SELECT id FROM users WHERE role IN ('admin', 'bendahara') AND is_active = 1")
      .all() as { id: number }[];
    for (const mgr of financeManagers) {
      createNotification(
        mgr.id,
        'Pembayaran Menunggu Verifikasi',
        `${req.user!.fullName} mengunggah pembayaran ${bill.title} (${bill.student_name}) sebesar Rp ${payAmount.toLocaleString('id-ID')}.`,
        'keuangan',
        'payment',
        Number(result.lastInsertRowid)
      );
    }

    logAudit(
      req.user,
      'UPLOAD_PAYMENT',
      'Keuangan',
      `Mengunggah pembayaran ${bill.title} untuk ${bill.student_name} sebesar Rp ${payAmount.toLocaleString('id-ID')}`
    );

    res.status(201).json({ id: result.lastInsertRowid, status: 'MENUNGGU_VERIFIKASI' });
  }
);

// Flowchart step 5-9: Admin/Bendahara verifies payment (Ya: DITERIMA -> Lunas/Sebagian + Kas Masuk + Kuitansi; Tidak: DITOLAK + Alasan)
apiRouter.patch('/finance/payments/:id/verify', authenticateJWT, requireRoles('admin', 'bendahara'), (req: AuthenticatedRequest, res: Response) => {
  const paymentId = Number(req.params.id);
  const { decision, rejection_reason } = req.body as {
    decision: 'DITERIMA' | 'DITOLAK';
    rejection_reason?: string;
  };

  const payment = db
    .prepare(
      `SELECT p.*, b.title as bill_title, b.fee_type, b.total_amount, b.paid_amount, s.full_name as student_name, s.wali_user_id
       FROM payments p
       JOIN bills b ON p.bill_id = b.id
       JOIN students s ON p.student_id = s.id
       WHERE p.id = ?`
    )
    .get(paymentId) as
    | {
        id: number;
        bill_id: number;
        student_id: number;
        wali_user_id: number | null;
        amount: number;
        status: string;
        bill_title: string;
        fee_type: string;
        total_amount: number;
        paid_amount: number;
        student_name: string;
      }
    | undefined;

  if (!payment) {
    res.status(404).json({ error: 'Data pembayaran tidak ditemukan.' });
    return;
  }
  if (payment.status !== 'MENUNGGU_VERIFIKASI') {
    res.status(400).json({ error: 'Pembayaran ini sudah diverifikasi sebelumnya.' });
    return;
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  if (decision === 'DITOLAK') {
    if (!rejection_reason || !rejection_reason.trim()) {
      res.status(400).json({ error: 'Alasan penolakan wajib diisi jika pembayaran ditolak.' });
      return;
    }

    db.prepare(
      `UPDATE payments SET status = 'DITOLAK', rejection_reason = ?, verified_by = ?, verified_at = ? WHERE id = ?`
    ).run(rejection_reason.trim(), req.user!.userId, now, paymentId);

    const nextBillStatus = payment.paid_amount > 0 ? 'SEBAGIAN' : 'BELUM_BAYAR';
    db.prepare('UPDATE bills SET status = ? WHERE id = ?').run(nextBillStatus, payment.bill_id);

    notifyStudentWalis(
      payment.student_id,
      `Pembayaran Ditolak: ${payment.bill_title}`,
      `Pembayaran untuk ${payment.student_name} ditolak oleh Bendahara/Admin. Alasan: ${rejection_reason.trim()}. Silakan unggah ulang bukti pembayaran.`,
      'keuangan',
      'bill',
      payment.bill_id
    );

    logAudit(req.user, 'REJECT_PAYMENT', 'Keuangan', `Menolak pembayaran #${paymentId} (${payment.student_name}): ${rejection_reason}`);
    res.json({ status: 'DITOLAK' });
    return;
  }

  if (decision === 'DITERIMA') {
    const receiptNo = `KWT-TS-${today.replace(/-/g, '').slice(0, 6)}-${String(paymentId).padStart(3, '0')}`;
    const newPaidAmount = payment.paid_amount + payment.amount;
    const nextBillStatus = newPaidAmount >= payment.total_amount ? 'LUNAS' : 'SEBAGIAN';

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE payments SET status = 'DITERIMA', receipt_no = ?, verified_by = ?, verified_at = ? WHERE id = ?`
      ).run(receiptNo, req.user!.userId, now, paymentId);

      db.prepare('UPDATE bills SET paid_amount = ?, status = ? WHERE id = ?').run(newPaidAmount, nextBillStatus, payment.bill_id);

      // Otomatis tercatat ke Kas Masuk
      db.prepare(
        `INSERT INTO cash_ledger (type, category, description, amount, ref_payment_id, recorded_by, transaction_date, created_at)
         VALUES ('masuk', ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        payment.fee_type === 'spp' ? 'Pembayaran SPP' : 'Daftar Ulang',
        `${payment.bill_title} - ${payment.student_name} (${receiptNo})`,
        payment.amount,
        paymentId,
        req.user!.userId,
        today,
        now
      );
    });
    tx();

    notifyStudentWalis(
      payment.student_id,
      `Pembayaran Diterima (${nextBillStatus}): ${payment.bill_title}`,
      `Pembayaran sebesar Rp ${payment.amount.toLocaleString('id-ID')} untuk ${payment.student_name} telah diverifikasi (${nextBillStatus}). Kuitansi ${receiptNo} siap diunduh.`,
      'keuangan',
      'payment',
      paymentId
    );

    logAudit(
      req.user,
      'APPROVE_PAYMENT',
      'Keuangan',
      `Menerima pembayaran #${paymentId} (${payment.student_name}) Rp ${payment.amount.toLocaleString('id-ID')} -> Kas Masuk (${receiptNo})`
    );

    res.json({ status: 'DITERIMA', bill_status: nextBillStatus, receipt_no: receiptNo });
    return;
  }

  res.status(400).json({ error: 'Keputusan verifikasi harus DITERIMA atau DITOLAK.' });
});

apiRouter.get('/finance/payments/:id/receipt', authenticateJWT, requireRoles('admin', 'bendahara', 'wali_santri'), (req: AuthenticatedRequest, res: Response) => {
  const paymentId = Number(req.params.id);
  const receipt = db
    .prepare(
      `SELECT p.*, b.title as bill_title, b.period_month, b.total_amount as bill_total_amount, b.paid_amount as bill_paid_amount, b.status as bill_status,
        s.full_name as student_name, s.nis, u.full_name as wali_name, v.full_name as verifier_name
       FROM payments p
       JOIN bills b ON p.bill_id = b.id
       JOIN students s ON p.student_id = s.id
       LEFT JOIN users u ON p.wali_user_id = u.id
       LEFT JOIN users v ON p.verified_by = v.id
       WHERE p.id = ? AND p.status = 'DITERIMA'`
    )
    .get(paymentId) as { student_id: number; wali_user_id: number | null } | undefined;

  if (!receipt) {
    res.status(404).json({ error: 'Kuitansi resmi tidak ditemukan atau pembayaran belum diterima.' });
    return;
  }
  if (req.user!.role === 'wali_santri' && !isWaliLinkedToStudent(req.user!.userId, receipt.student_id)) {
    res.status(403).json({ error: 'Akses kuitansi ditolak.' });
    return;
  }
  const pondok = db.prepare('SELECT name, address, phone, email, pengasuh FROM pondok_profile WHERE id = 1').get();
  res.json({ receipt, pondok });
});

// Kas Masuk & Keluar
apiRouter.get('/finance/cash', authenticateJWT, requireRoles('admin', 'bendahara'), (_req, res) => {
  const entries = db
    .prepare(
      `SELECT c.*, u.full_name as recorder_name
       FROM cash_ledger c LEFT JOIN users u ON c.recorded_by = u.id
       ORDER BY c.transaction_date DESC, c.id DESC`
    )
    .all();

  const summary = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='masuk' THEN amount ELSE 0 END), 0) as total_masuk,
         COALESCE(SUM(CASE WHEN type='keluar' THEN amount ELSE 0 END), 0) as total_keluar
       FROM cash_ledger`
    )
    .get() as { total_masuk: number; total_keluar: number };

  res.json({
    entries,
    summary: {
      ...summary,
      saldo: summary.total_masuk - summary.total_keluar,
    },
  });
});

apiRouter.post(
  '/finance/cash',
  authenticateJWT,
  requireRoles('admin', 'bendahara'),
  upload.single('attachment'),
  (req: AuthenticatedRequest, res: Response) => {
    const { type, category, description, amount, transaction_date } = req.body;
    if (!['masuk', 'keluar'].includes(type) || !category || !description || !Number(amount)) {
      res.status(400).json({ error: 'Jenis kas, kategori, keterangan, dan nominal wajib diisi.' });
      return;
    }
    const now = new Date().toISOString();
    const attachment = req.file ? `/uploads/${req.file.filename}` : null;
    const txDate = transaction_date || now.slice(0, 10);

    const result = db
      .prepare(
        `INSERT INTO cash_ledger (type, category, description, amount, attachment_file, recorded_by, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(type, category, description, Number(amount), attachment, req.user!.userId, txDate, now);

    logAudit(req.user, 'CREATE_CASH_ENTRY', 'Keuangan', `Mencatat kas ${type}: ${category} Rp ${Number(amount).toLocaleString('id-ID')}`);
    res.status(201).json({ id: result.lastInsertRowid });
  }
);

// ============================================================
// 5. ABSENSI KELAS (Wali Kelas Salaf / Sekolah) -> Auto Lapor Sakit
// ============================================================
apiRouter.get('/attendance', authenticateJWT, requireRoles('admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  const dateFilter = req.query.date as string | undefined;
  const classId = req.query.class_id ? Number(req.query.class_id) : undefined;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (role === 'wali_santri') {
    where += ` AND ${WALI_LINKED_SQL}`;
    params.push(userId, userId);
  } else if (role === 'wali_salaf') {
    where += " AND a.class_type = 'salaf' AND c.wali_user_id = ?";
    params.push(userId);
  } else if (role === 'wali_sekolah') {
    where += " AND a.class_type = 'sekolah' AND c.wali_user_id = ?";
    params.push(userId);
  } else if (role === 'wali_kelas') {
    where += ' AND c.wali_user_id = ?';
    params.push(userId);
  }

  if (dateFilter) {
    where += ' AND a.date = ?';
    params.push(dateFilter);
  }
  if (classId) {
    where += ' AND a.class_id = ?';
    params.push(classId);
  }

  const records = db
    .prepare(
      `SELECT a.*, s.full_name as student_name, s.nis, c.name as class_name, u.full_name as recorder_name
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       JOIN classes c ON a.class_id = c.id
       LEFT JOIN users u ON a.recorded_by = u.id
       ${where}
       ORDER BY a.date DESC, s.full_name ASC`
    )
    .all(...params);

  res.json({ records });
});

apiRouter.post('/attendance', authenticateJWT, requireRoles('wali_salaf', 'wali_sekolah', 'wali_kelas', 'admin'), (req: AuthenticatedRequest, res: Response) => {
  const { class_id, date, entries } = req.body as {
    class_id: number;
    date: string;
    entries: { student_id: number; status: 'HADIR' | 'IZIN' | 'ALPHA' | 'SAKIT'; complaint?: string }[];
  };

  if (!class_id || !date || !Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ error: 'Kelas, tanggal, dan daftar absensi santri wajib diisi.' });
    return;
  }

  const cls = db.prepare('SELECT id, name, type, wali_user_id FROM classes WHERE id = ?').get(Number(class_id)) as
    | { id: number; name: string; type: 'salaf' | 'sekolah'; wali_user_id: number | null }
    | undefined;
  if (!cls) {
    res.status(404).json({ error: 'Kelas tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'admin' && cls.wali_user_id !== req.user!.userId) {
    res.status(403).json({ error: 'Anda tidak ditugaskan sebagai wali kelas untuk kelas ini.' });
    return;
  }

  const now = new Date().toISOString();
  let sickCasesCreated = 0;

  const pembinas = db.prepare("SELECT id FROM users WHERE role = 'pembina_asrama' AND is_active = 1").all() as { id: number }[];

  const tx = db.transaction(() => {
    for (const entry of entries) {
      const existing = db
        .prepare('SELECT id, status FROM attendance WHERE student_id = ? AND class_id = ? AND date = ?')
        .get(entry.student_id, cls.id, date) as { id: number; status: string } | undefined;

      let attendanceId: number;
      if (existing) {
        db.prepare('UPDATE attendance SET status = ?, complaint = ?, recorded_by = ? WHERE id = ?').run(
          entry.status,
          entry.complaint || '',
          req.user!.userId,
          existing.id
        );
        attendanceId = existing.id;
      } else {
        const ins = db
          .prepare(
            `INSERT INTO attendance (student_id, class_id, class_type, date, status, complaint, recorded_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(entry.student_id, cls.id, cls.type, date, entry.status, entry.complaint || '', req.user!.userId, now);
        attendanceId = Number(ins.lastInsertRowid);
      }

      // Flowchart Penanganan Santri Sakit: Wali kelas mencatat absensi status SAKIT (+ keluhan) -> Kasus sakit dibuat!
      if (entry.status === 'SAKIT') {
        const existingCase = db.prepare('SELECT id FROM health_cases WHERE attendance_id = ?').get(attendanceId);
        if (!existingCase) {
          const student = db
            .prepare('SELECT full_name, wali_user_id FROM students WHERE id = ?')
            .get(entry.student_id) as { full_name: string; wali_user_id: number | null } | undefined;
          const source = cls.type === 'salaf' ? 'absensi_salaf' : 'absensi_sekolah';
          const complaintText = entry.complaint?.trim() || `Dilaporkan sakit saat absensi kelas ${cls.name}`;

          const hcRes = db
            .prepare(
              `INSERT INTO health_cases (student_id, source, attendance_id, initial_complaint, current_status, reported_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'Dilaporkan', ?, ?, ?)`
            )
            .run(entry.student_id, source, attendanceId, complaintText, req.user!.userId, now, now);

          const caseId = Number(hcRes.lastInsertRowid);
          db.prepare(
            `INSERT INTO health_timeline (case_id, status, action_note, medicine_note, updated_by, created_at)
             VALUES (?, 'Dilaporkan', ?, '', ?, ?)`
          ).run(caseId, `Dilaporkan oleh ${req.user!.fullName} melalui absensi ${cls.name}. Keluhan: ${complaintText}`, req.user!.userId, now);

          sickCasesCreated++;

          if (student) {
            notifyStudentWalis(
              entry.student_id,
              `Laporan Sakit: ${student.full_name}`,
              `${student.full_name} tercatat SAKIT pada absensi kelas ${cls.name} (${date}). Keluhan: ${complaintText}`,
              'kesehatan',
              'health_case',
              caseId
            );
            for (const p of pembinas) {
              createNotification(
                p.id,
                `Perlu Ditindaklanjuti: ${student.full_name}`,
                `Kasus sakit baru dari absensi ${cls.name}: ${student.full_name} — ${complaintText}`,
                'kesehatan',
                'health_case',
                caseId
              );
            }
          }
        }
      }
    }
  });
  tx();

  logAudit(req.user, 'RECORD_ATTENDANCE', 'Absensi', `Mencatat absensi kelas ${cls.name} tanggal ${date} (${entries.length} santri, ${sickCasesCreated} kasus sakit baru)`);
  res.json({ success: true, sick_cases_created: sickCasesCreated });
});

// ============================================================
// 6. NILAI & PRESTASI (Wali Kelas Salaf / Sekolah & Wali Santri)
// ============================================================
apiRouter.get('/academics/grades', authenticateJWT, requireRoles('admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (role === 'wali_santri') {
    where += ` AND ${WALI_LINKED_SQL}`;
    params.push(userId, userId);
  } else if (role === 'wali_salaf') {
    where += " AND g.class_type = 'salaf' AND c.wali_user_id = ?";
    params.push(userId);
  } else if (role === 'wali_sekolah') {
    where += " AND g.class_type = 'sekolah' AND c.wali_user_id = ?";
    params.push(userId);
  } else if (role === 'wali_kelas') {
    where += ' AND c.wali_user_id = ?';
    params.push(userId);
  }

  const grades = db
    .prepare(
      `SELECT g.*, s.full_name as student_name, s.nis, c.name as class_name, u.full_name as recorder_name
       FROM grades g
       JOIN students s ON g.student_id = s.id
       JOIN classes c ON g.class_id = c.id
       LEFT JOIN users u ON g.recorded_by = u.id
       ${where}
       ORDER BY g.updated_at DESC`
    )
    .all(...params);

  res.json({ grades });
});

apiRouter.post('/academics/grades', authenticateJWT, requireRoles('wali_salaf', 'wali_sekolah', 'wali_kelas', 'admin'), (req: AuthenticatedRequest, res: Response) => {
  const { student_id, class_id, subject, semester, score, notes } = req.body;
  if (!student_id || !class_id || !subject || !semester || score === undefined) {
    res.status(400).json({ error: 'Santri, kelas, mata pelajaran, semester, dan nilai wajib diisi.' });
    return;
  }

  const cls = db.prepare('SELECT id, type, wali_user_id FROM classes WHERE id = ?').get(Number(class_id)) as
    | { id: number; type: 'salaf' | 'sekolah'; wali_user_id: number | null }
    | undefined;
  if (!cls) {
    res.status(404).json({ error: 'Kelas tidak ditemukan.' });
    return;
  }
  if (req.user!.role !== 'admin' && cls.wali_user_id !== req.user!.userId) {
    res.status(403).json({ error: 'Anda tidak ditugaskan sebagai wali kelas untuk kelas ini.' });
    return;
  }

  const numScore = Math.max(0, Math.min(100, Number(score)));
  const predicate = calcPredicate(numScore);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO grades (student_id, class_id, class_type, subject, semester, score, predicate, notes, recorded_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, class_id, subject, semester)
     DO UPDATE SET score = excluded.score, predicate = excluded.predicate, notes = excluded.notes, recorded_by = excluded.recorded_by, updated_at = excluded.updated_at`
  ).run(Number(student_id), cls.id, cls.type, subject.trim(), semester.trim(), numScore, predicate, notes || '', req.user!.userId, now);

  logAudit(req.user, 'UPSERT_GRADE', 'Nilai & Prestasi', `Menginput nilai ${subject} (${numScore}/${predicate}) untuk santri #${student_id}`);
  res.json({ success: true });
});

apiRouter.get('/academics/achievements', authenticateJWT, requireRoles('admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  if (role === 'wali_santri') {
    where += ` AND ${WALI_LINKED_SQL}`;
    params.push(userId, userId);
  } else if (role === 'wali_salaf') {
    where += " AND a.class_type = 'salaf'";
  } else if (role === 'wali_sekolah') {
    where += " AND a.class_type = 'sekolah'";
  } else if (role === 'wali_kelas') {
    where += ` AND (
      a.recorded_by = ?
      OR EXISTS (
        SELECT 1 FROM classes c
        WHERE c.wali_user_id = ?
          AND ((a.class_type = 'salaf' AND s.salaf_class_id = c.id) OR (a.class_type = 'sekolah' AND s.sekolah_class_id = c.id))
      )
    )`;
    params.push(userId, userId);
  }

  const achievements = db
    .prepare(
      `SELECT a.*, s.full_name as student_name, s.nis, u.full_name as recorder_name
       FROM achievements a
       JOIN students s ON a.student_id = s.id
       LEFT JOIN users u ON a.recorded_by = u.id
       ${where}
       ORDER BY a.date DESC, a.id DESC`
    )
    .all(...params);
  res.json({ achievements });
});

apiRouter.post('/academics/achievements', authenticateJWT, requireRoles('wali_salaf', 'wali_sekolah', 'wali_kelas', 'admin'), (req: AuthenticatedRequest, res: Response) => {
  const { student_id, class_type, title, category, level, date, notes } = req.body;
  if (!student_id || !title || !category || !level || !date) {
    res.status(400).json({ error: 'Santri, judul prestasi, kategori, tingkat, dan tanggal wajib diisi.' });
    return;
  }
  const effectiveType =
    req.user!.role === 'wali_salaf'
      ? 'salaf'
      : req.user!.role === 'wali_sekolah'
      ? 'sekolah'
      : class_type === 'sekolah'
      ? 'sekolah'
      : 'salaf';
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO achievements (student_id, class_type, title, category, level, date, notes, recorded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(Number(student_id), effectiveType, title.trim(), category, level, date, notes || '', req.user!.userId, now);

  const student = db.prepare('SELECT full_name, wali_user_id FROM students WHERE id = ?').get(Number(student_id)) as
    | { full_name: string; wali_user_id: number | null }
    | undefined;
  if (student) {
    notifyStudentWalis(
      Number(student_id),
      `Prestasi Baru: ${student.full_name}`,
      `${student.full_name} meraih prestasi "${title}" tingkat ${level}.`,
      'akademik',
      'achievement',
      Number(result.lastInsertRowid)
    );
  }

  logAudit(req.user, 'CREATE_ACHIEVEMENT', 'Nilai & Prestasi', `Mencatat prestasi "${title}" untuk santri #${student_id}`);
  res.status(201).json({ id: result.lastInsertRowid });
});

apiRouter.delete('/academics/achievements/:id', authenticateJWT, requireRoles('wali_salaf', 'wali_sekolah', 'wali_kelas', 'admin'), (req: AuthenticatedRequest, res: Response) => {
  db.prepare('DELETE FROM achievements WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// ============================================================
// 7. KESEHATAN SANTRI (Flowchart Penanganan Santri Sakit)
// ============================================================
apiRouter.get('/health/cases', authenticateJWT, requireRoles('admin', 'wali_santri', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'), (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (role === 'wali_santri') {
    where += ` AND ${WALI_LINKED_SQL}`;
    params.push(userId, userId);
  } else if (role === 'wali_salaf') {
    where += " AND (hc.source = 'absensi_salaf' OR hc.reported_by = ?)";
    params.push(userId);
  } else if (role === 'wali_sekolah') {
    where += " AND (hc.source = 'absensi_sekolah' OR hc.reported_by = ?)";
    params.push(userId);
  } else if (role === 'wali_kelas') {
    where += " AND (hc.source IN ('absensi_salaf','absensi_sekolah') OR hc.reported_by = ?)";
    params.push(userId);
  }

  const cases = db
    .prepare(
      `SELECT hc.*, s.full_name as student_name, s.nis, dr.name as dorm_room_name,
        rep.full_name as reporter_name, hnd.full_name as handler_name
       FROM health_cases hc
       JOIN students s ON hc.student_id = s.id
       LEFT JOIN dorm_rooms dr ON s.dorm_room_id = dr.id
       LEFT JOIN users rep ON hc.reported_by = rep.id
       LEFT JOIN users hnd ON hc.handled_by = hnd.id
       ${where}
       ORDER BY CASE WHEN hc.current_status = 'Sembuh' THEN 1 ELSE 0 END, hc.updated_at DESC`
    )
    .all(...params) as { id: number }[];

  const getTimeline = db.prepare(
    `SELECT ht.*, u.full_name as updater_name
     FROM health_timeline ht LEFT JOIN users u ON ht.updated_by = u.id
     WHERE ht.case_id = ? ORDER BY ht.id ASC`
  );

  const enriched = cases.map((c) => ({
    ...c,
    timeline: getTimeline.all(c.id),
  }));

  res.json({ cases: enriched });
});

// Pembina Asrama creates direct health case (asal = pembina)
apiRouter.post('/health/cases', authenticateJWT, requireRoles('pembina_asrama', 'admin'), (req: AuthenticatedRequest, res: Response) => {
  const { student_id, initial_complaint, disease_type, severity } = req.body;
  if (!student_id || !initial_complaint) {
    res.status(400).json({ error: 'Santri dan keluhan awal wajib diisi.' });
    return;
  }
  const now = new Date().toISOString();
  const student = db.prepare('SELECT full_name, wali_user_id FROM students WHERE id = ?').get(Number(student_id)) as
    | { full_name: string; wali_user_id: number | null }
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Santri tidak ditemukan.' });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO health_cases (student_id, source, initial_complaint, disease_type, severity, current_status, reported_by, handled_by, created_at, updated_at)
       VALUES (?, 'pembina', ?, ?, ?, 'Dilaporkan', ?, ?, ?, ?)`
    )
    .run(Number(student_id), initial_complaint.trim(), disease_type || '', severity || null, req.user!.userId, req.user!.userId, now, now);

  const caseId = Number(result.lastInsertRowid);
  db.prepare(
    `INSERT INTO health_timeline (case_id, status, action_note, medicine_note, updated_by, created_at)
     VALUES (?, 'Dilaporkan', ?, '', ?, ?)`
  ).run(caseId, `Kasus dibuat langsung oleh Pembina Asrama (${req.user!.fullName}). Keluhan: ${initial_complaint.trim()}`, req.user!.userId, now);

  notifyStudentWalis(
    Number(student_id),
    `Informasi Kesehatan: ${student.full_name}`,
    `Pembina asrama melaporkan ${student.full_name} sedang sakit (${initial_complaint.trim()}). Pemantauan penanganan sedang berjalan.`,
    'kesehatan',
    'health_case',
    caseId
  );

  logAudit(req.user, 'CREATE_HEALTH_CASE', 'Kesehatan', `Membuat kasus sakit langsung untuk ${student.full_name}`);
  res.status(201).json({ id: caseId });
});

// Pembina mengisi jenis penyakit & tingkat keparahan
apiRouter.patch('/health/cases/:id/triage', authenticateJWT, requireRoles('pembina_asrama', 'admin'), (req: AuthenticatedRequest, res: Response) => {
  const caseId = Number(req.params.id);
  const { disease_type, severity } = req.body;
  if (!disease_type || !['Ringan', 'Sedang', 'Berat'].includes(severity)) {
    res.status(400).json({ error: 'Jenis penyakit dan tingkat keparahan (Ringan/Sedang/Berat) wajib diisi.' });
    return;
  }

  const hc = db
    .prepare(
      `SELECT hc.id, hc.student_id, s.full_name, s.wali_user_id
       FROM health_cases hc JOIN students s ON hc.student_id = s.id WHERE hc.id = ?`
    )
    .get(caseId) as { id: number; student_id: number; full_name: string; wali_user_id: number | null } | undefined;
  if (!hc) {
    res.status(404).json({ error: 'Kasus kesehatan tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE health_cases SET disease_type = ?, severity = ?, handled_by = ?, updated_at = ? WHERE id = ?`
  ).run(disease_type.trim(), severity, req.user!.userId, now, caseId);

  notifyStudentWalis(
    hc.student_id,
    `Hasil Pemeriksaan Awal: ${hc.full_name}`,
    `Pembina Asrama mencatat jenis keluhan "${disease_type.trim()}" dengan tingkat keparahan ${severity}.`,
    'kesehatan',
    'health_case',
    caseId
  );

  logAudit(req.user, 'TRIAGE_HEALTH_CASE', 'Kesehatan', `Mencatat jenis sakit "${disease_type}" (${severity}) untuk kasus #${caseId}`);
  res.json({ success: true });
});

// Pembina update status penanganan + catat tindakan / obat / lampiran (surat dokter) -> Notifikasi ke Wali tiap perubahan
apiRouter.post(
  '/health/cases/:id/timeline',
  authenticateJWT,
  requireRoles('pembina_asrama', 'admin'),
  upload.single('attachment'),
  (req: AuthenticatedRequest, res: Response) => {
    const caseId = Number(req.params.id);
    const { status, action_note, medicine_note } = req.body;
    const allowedStatuses = ['Dilaporkan', 'Diperiksa', 'Istirahat/Obat', 'Dirujuk', 'Dijemput Wali', 'Sembuh'];
    if (!allowedStatuses.includes(status) || !action_note) {
      res.status(400).json({ error: 'Status penanganan yang valid dan catatan tindakan wajib diisi.' });
      return;
    }

    const hc = db
      .prepare(
        `SELECT hc.*, s.full_name as student_name, s.wali_user_id
         FROM health_cases hc JOIN students s ON hc.student_id = s.id WHERE hc.id = ?`
      )
      .get(caseId) as { id: number; student_id: number; student_name: string; wali_user_id: number | null } | undefined;
    if (!hc) {
      res.status(404).json({ error: 'Kasus kesehatan tidak ditemukan.' });
      return;
    }

    const now = new Date().toISOString();
    const attachmentFile = req.file ? `/uploads/${req.file.filename}` : null;
    const closedAt = status === 'Sembuh' ? now : null;

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO health_timeline (case_id, status, action_note, medicine_note, attachment_file, updated_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(caseId, status, action_note.trim(), medicine_note || '', attachmentFile, req.user!.userId, now);

      db.prepare(
        `UPDATE health_cases SET current_status = ?, handled_by = ?, closed_at = COALESCE(?, closed_at), updated_at = ? WHERE id = ?`
      ).run(status, req.user!.userId, closedAt, now, caseId);
    });
    tx();

    const notifTitle =
      status === 'Sembuh'
        ? `Santri Sembuh: ${hc.student_name}`
        : `Update Kesehatan (${status}): ${hc.student_name}`;
    const notifMessage =
      status === 'Sembuh'
        ? `Alhamdulillah, kondisi ${hc.student_name} dinyatakan SEMBUH dan kasus ditutup ke riwayat kesehatan. Catatan: ${action_note.trim()}`
        : `Status penanganan ${hc.student_name} diperbarui menjadi "${status}". Tindakan: ${action_note.trim()}${medicine_note ? ` · Obat: ${medicine_note}` : ''}`;

    notifyStudentWalis(hc.student_id, notifTitle, notifMessage, 'kesehatan', 'health_case', caseId);

    logAudit(req.user, 'UPDATE_HEALTH_STATUS', 'Kesehatan', `Kasus #${caseId} (${hc.student_name}) -> ${status}`);
    res.status(201).json({ success: true, status });
  }
);

// ============================================================
// 8. ASRAMA - Pantau Kondisi Santri (Pembina Asrama)
// ============================================================
apiRouter.get('/dorm/conditions', authenticateJWT, requireRoles('pembina_asrama', 'admin'), (_req, res) => {
  const conditions = db
    .prepare(
      `SELECT dc.*, s.full_name as student_name, s.nis, dr.name as dorm_room_name, u.full_name as pembina_name
       FROM dorm_conditions dc
       JOIN students s ON dc.student_id = s.id
       LEFT JOIN dorm_rooms dr ON s.dorm_room_id = dr.id
       LEFT JOIN users u ON dc.pembina_user_id = u.id
       ORDER BY dc.date DESC, dc.id DESC`
    )
    .all();
  res.json({ conditions });
});

apiRouter.post('/dorm/conditions', authenticateJWT, requireRoles('pembina_asrama', 'admin'), (req: AuthenticatedRequest, res: Response) => {
  const { student_id, date, condition_status, note } = req.body;
  if (!student_id || !condition_status) {
    res.status(400).json({ error: 'Santri dan status kondisi wajib diisi.' });
    return;
  }
  const now = new Date().toISOString();
  const txDate = date || now.slice(0, 10);
  const result = db
    .prepare(
      `INSERT INTO dorm_conditions (student_id, pembina_user_id, date, condition_status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(Number(student_id), req.user!.userId, txDate, condition_status, note || '', now);

  logAudit(req.user, 'LOG_DORM_CONDITION', 'Asrama', `Mencatat kondisi asrama santri #${student_id}: ${condition_status}`);
  res.status(201).json({ id: result.lastInsertRowid });
});

// ============================================================
// 9. NOTIFIKASI
// ============================================================
apiRouter.get('/notifications', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(req.user!.userId);
  const unread = (
    db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.userId) as { c: number }
  ).c;
  res.json({ notifications, unread_count: unread });
});

apiRouter.patch('/notifications/:id/read', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user!.userId);
  res.json({ success: true });
});

apiRouter.patch('/notifications/read-all', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.userId);
  res.json({ success: true });
});

// ============================================================
// 10. LAPORAN & AUDIT LOG
// ============================================================
apiRouter.get('/reports/overview', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const { role, userId } = req.user!;
  const today = new Date().toISOString().slice(0, 10);

  const activeStudentsCount = (db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'aktif'").get() as { c: number }).c;
  const activeHealthCasesCount = (db.prepare("SELECT COUNT(*) as c FROM health_cases WHERE current_status != 'Sembuh'").get() as { c: number }).c;
  const pendingTriageCount = (db.prepare("SELECT COUNT(*) as c FROM health_cases WHERE current_status = 'Dilaporkan'").get() as { c: number }).c;

  if (role === 'admin' || role === 'bendahara') {
    const pendingPaymentsCount = (
      db.prepare("SELECT COUNT(*) as c FROM payments WHERE status = 'MENUNGGU_VERIFIKASI'").get() as { c: number }
    ).c;
    const cashSummary = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type='masuk' THEN amount ELSE 0 END), 0) as total_masuk,
           COALESCE(SUM(CASE WHEN type='keluar' THEN amount ELSE 0 END), 0) as total_keluar
         FROM cash_ledger`
      )
      .get() as { total_masuk: number; total_keluar: number };
    const arrearsSummary = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total_tunggakan,
           COUNT(CASE WHEN status != 'LUNAS' THEN 1 END) as unpaid_bills
         FROM bills`
      )
      .get() as { total_tunggakan: number; unpaid_bills: number };
    const attendanceStats = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM attendance GROUP BY status`
      )
      .all();

    res.json({
      role,
      kpis: {
        active_students: activeStudentsCount,
        pending_payments: pendingPaymentsCount,
        active_health_cases: activeHealthCasesCount,
        saldo_kas: cashSummary.total_masuk - cashSummary.total_keluar,
        total_masuk: cashSummary.total_masuk,
        total_keluar: cashSummary.total_keluar,
        total_tunggakan: arrearsSummary.total_tunggakan,
        unpaid_bills: arrearsSummary.unpaid_bills,
      },
      attendance_stats: attendanceStats,
    });
    return;
  }

  if (role === 'wali_santri') {
    const childrenCount = (
      db
        .prepare(`SELECT COUNT(DISTINCT s.id) as c FROM students s WHERE ${WALI_LINKED_SQL}`)
        .get(userId, userId) as { c: number }
    ).c;
    const finance = db
      .prepare(
        `SELECT
           COALESCE(SUM(b.total_amount), 0) as total_billed,
           COALESCE(SUM(b.paid_amount), 0) as total_paid,
           COUNT(CASE WHEN b.status != 'LUNAS' THEN 1 END) as unpaid_count
         FROM bills b JOIN students s ON b.student_id = s.id WHERE ${WALI_LINKED_SQL}`
      )
      .get(userId, userId) as { total_billed: number; total_paid: number; unpaid_count: number };
    const activeChildSick = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM health_cases hc JOIN students s ON hc.student_id = s.id
           WHERE ${WALI_LINKED_SQL} AND hc.current_status != 'Sembuh'`
        )
        .get(userId, userId) as { c: number }
    ).c;

    res.json({
      role,
      kpis: {
        children_count: childrenCount,
        total_billed: finance.total_billed,
        total_paid: finance.total_paid,
        tunggakan: finance.total_billed - finance.total_paid,
        unpaid_count: finance.unpaid_count,
        active_health_cases: activeChildSick,
      },
    });
    return;
  }

  if (role === 'wali_salaf' || role === 'wali_sekolah' || role === 'wali_kelas') {
    const salafClassCount =
      role === 'wali_sekolah'
        ? 0
        : (db.prepare("SELECT COUNT(*) as c FROM classes WHERE type = 'salaf' AND wali_user_id = ?").get(userId) as { c: number }).c;
    const sekolahClassCount =
      role === 'wali_salaf'
        ? 0
        : (db.prepare("SELECT COUNT(*) as c FROM classes WHERE type = 'sekolah' AND wali_user_id = ?").get(userId) as { c: number }).c;
    const classCount = salafClassCount + sekolahClassCount;

    const studentCount =
      role === 'wali_kelas'
        ? (
            db
              .prepare(
                `SELECT COUNT(DISTINCT s.id) as c FROM students s
                 JOIN classes c ON (s.salaf_class_id = c.id OR s.sekolah_class_id = c.id)
                 WHERE c.wali_user_id = ? AND s.status = 'aktif'`
              )
              .get(userId) as { c: number }
          ).c
        : (
            db
              .prepare(
                `SELECT COUNT(*) as c FROM students s
                 JOIN classes c ON ${role === 'wali_salaf' ? 's.salaf_class_id' : 's.sekolah_class_id'} = c.id
                 WHERE c.wali_user_id = ? AND s.status = 'aktif'`
              )
              .get(userId) as { c: number }
          ).c;

    const typeFilter = role === 'wali_salaf' ? "AND c.type = 'salaf'" : role === 'wali_sekolah' ? "AND c.type = 'sekolah'" : '';
    const attendanceToday = db
      .prepare(
        `SELECT a.status, COUNT(*) as count
         FROM attendance a JOIN classes c ON a.class_id = c.id
         WHERE c.wali_user_id = ? ${typeFilter} AND a.date = ?
         GROUP BY a.status`
      )
      .all(userId, today);
    const avgGrade = (
      db
        .prepare(
          `SELECT ROUND(AVG(g.score), 1) as avg_score
           FROM grades g JOIN classes c ON g.class_id = c.id WHERE c.wali_user_id = ? ${typeFilter}`
        )
        .get(userId) as { avg_score: number | null }
    ).avg_score;

    res.json({
      role,
      kpis: {
        class_count: classCount,
        salaf_class_count: salafClassCount,
        sekolah_class_count: sekolahClassCount,
        student_count: studentCount,
        avg_score: avgGrade ?? 0,
        active_health_cases: activeHealthCasesCount,
      },
      attendance_today: attendanceToday,
    });
    return;
  }

  // pembina_asrama
  const roomSummary = db
    .prepare(
      `SELECT COUNT(*) as room_count, COALESCE(SUM(capacity), 0) as total_capacity
       FROM dorm_rooms WHERE pembina_user_id = ?`
    )
    .get(userId) as { room_count: number; total_capacity: number };
  const occupantCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM students s JOIN dorm_rooms dr ON s.dorm_room_id = dr.id
         WHERE dr.pembina_user_id = ? AND s.status = 'aktif'`
      )
      .get(userId) as { c: number }
  ).c;

  res.json({
    role,
    kpis: {
      room_count: roomSummary.room_count,
      total_capacity: roomSummary.total_capacity,
      occupant_count: occupantCount,
      pending_triage: pendingTriageCount,
      active_health_cases: activeHealthCasesCount,
    },
  });
});

apiRouter.get(
  '/reports/full',
  authenticateJWT,
  requireRoles('admin', 'bendahara', 'wali_salaf', 'wali_sekolah', 'wali_kelas', 'pembina_asrama'),
  (req: AuthenticatedRequest, res: Response) => {
    const { role, userId } = req.user!;
    const pondok = db.prepare('SELECT name, address, phone, email, pengasuh FROM pondok_profile WHERE id = 1').get();

    // 1. Finance summary (Admin & Bendahara / TU)
    let finance: Record<string, unknown> | null = null;
    if (role === 'admin' || role === 'bendahara') {
      const cashSummary = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN type='masuk' THEN amount ELSE 0 END), 0) as total_masuk,
             COALESCE(SUM(CASE WHEN type='keluar' THEN amount ELSE 0 END), 0) as total_keluar
           FROM cash_ledger`
        )
        .get() as { total_masuk: number; total_keluar: number };
      const billsSummary = db
        .prepare(
          `SELECT
             COALESCE(SUM(total_amount), 0) as total_tertagih,
             COALESCE(SUM(paid_amount), 0) as total_terbayar,
             COALESCE(SUM(total_amount - paid_amount), 0) as total_tunggakan,
             COUNT(CASE WHEN status = 'LUNAS' THEN 1 END) as lunas_count,
             COUNT(CASE WHEN status != 'LUNAS' THEN 1 END) as belum_lunas_count
           FROM bills`
        )
        .get() as Record<string, number>;
      const cashEntries = db
        .prepare(
          `SELECT c.id, c.type, c.category, c.description, c.amount, c.transaction_date, u.full_name as recorder_name
           FROM cash_ledger c LEFT JOIN users u ON c.recorded_by = u.id
           ORDER BY c.transaction_date DESC, c.id DESC`
        )
        .all();
      const bills = db
        .prepare(
          `SELECT b.id, b.title, b.period_month, b.total_amount, b.paid_amount, b.status, b.due_date,
             s.full_name as student_name, s.nis
           FROM bills b JOIN students s ON b.student_id = s.id
           ORDER BY b.id DESC`
        )
        .all();

      finance = {
        summary: {
          ...cashSummary,
          saldo_kas: cashSummary.total_masuk - cashSummary.total_keluar,
          ...billsSummary,
        },
        cash_entries: cashEntries,
        bills,
      };
    }

    // 2. Academic (Admin, Wali Salaf, Wali Sekolah, Wali Kelas)
    let academic: Record<string, unknown> | null = null;
    if (role === 'admin' || role === 'wali_salaf' || role === 'wali_sekolah' || role === 'wali_kelas') {
      let gradeWhere = '';
      const gradeParams: unknown[] = [];
      let achWhere = '';
      const achParams: unknown[] = [];

      if (role === 'wali_salaf') {
        gradeWhere = "WHERE g.class_type = 'salaf' AND c.wali_user_id = ?";
        gradeParams.push(userId);
        achWhere = "WHERE a.class_type = 'salaf'";
      } else if (role === 'wali_sekolah') {
        gradeWhere = "WHERE g.class_type = 'sekolah' AND c.wali_user_id = ?";
        gradeParams.push(userId);
        achWhere = "WHERE a.class_type = 'sekolah'";
      } else if (role === 'wali_kelas') {
        gradeWhere = 'WHERE c.wali_user_id = ?';
        gradeParams.push(userId);
        achWhere = `WHERE (
          a.recorded_by = ?
          OR EXISTS (
            SELECT 1 FROM classes c
            WHERE c.wali_user_id = ?
              AND ((a.class_type = 'salaf' AND s.salaf_class_id = c.id) OR (a.class_type = 'sekolah' AND s.sekolah_class_id = c.id))
          )
        )`;
        achParams.push(userId, userId);
      }

      const grades = db
        .prepare(
          `SELECT g.id, s.nis, s.full_name as student_name, c.name as class_name, g.class_type,
             g.subject, g.semester, g.score, g.predicate, g.notes
           FROM grades g
           JOIN students s ON g.student_id = s.id
           JOIN classes c ON g.class_id = c.id
           ${gradeWhere}
           ORDER BY g.class_type, c.name, s.full_name`
        )
        .all(...gradeParams) as { score: number }[];

      const achievements = db
        .prepare(
          `SELECT a.id, s.nis, s.full_name as student_name, a.class_type, a.title, a.category, a.level, a.date, a.notes
           FROM achievements a
           JOIN students s ON a.student_id = s.id
           ${achWhere}
           ORDER BY a.date DESC`
        )
        .all(...achParams);

      const avgScore =
        grades.length > 0
          ? Math.round((grades.reduce((sum, g) => sum + g.score, 0) / grades.length) * 10) / 10
          : 0;

      academic = {
        summary: {
          total_grades: grades.length,
          avg_score: avgScore,
          total_achievements: achievements.length,
        },
        grades,
        achievements,
      };
    }

    // 3. Attendance (Admin, Wali Salaf, Wali Sekolah, Wali Kelas, Pembina Asrama)
    let attendanceRecords: { status: string }[] = [];
    const attCounts = { HADIR: 0, IZIN: 0, ALPHA: 0, SAKIT: 0 };
    if (role !== 'bendahara') {
      let attWhere = '';
      const attParams: unknown[] = [];
      if (role === 'wali_salaf') {
        attWhere = "WHERE a.class_type = 'salaf' AND c.wali_user_id = ?";
        attParams.push(userId);
      } else if (role === 'wali_sekolah') {
        attWhere = "WHERE a.class_type = 'sekolah' AND c.wali_user_id = ?";
        attParams.push(userId);
      } else if (role === 'wali_kelas') {
        attWhere = 'WHERE c.wali_user_id = ?';
        attParams.push(userId);
      }

      attendanceRecords = db
        .prepare(
          `SELECT a.id, a.date, a.status, a.complaint, a.class_type, s.nis, s.full_name as student_name, c.name as class_name
           FROM attendance a
           JOIN students s ON a.student_id = s.id
           JOIN classes c ON a.class_id = c.id
           ${attWhere}
           ORDER BY a.date DESC, s.full_name ASC`
        )
        .all(...attParams) as { status: string }[];

      for (const r of attendanceRecords) {
        if (r.status in attCounts) {
          attCounts[r.status as keyof typeof attCounts]++;
        }
      }
    }

    // 4. Health: Sakit & Sembuh (All pengurus & admin, excluding bendahara)
    let sickCases: { current_status: string }[] = [];
    let recoveredCases: { current_status: string }[] = [];
    if (role !== 'bendahara') {
      let healthWhere = '';
      const healthParams: unknown[] = [];
      if (role === 'wali_salaf') {
        healthWhere = "WHERE (hc.source = 'absensi_salaf' OR hc.reported_by = ?)";
        healthParams.push(userId);
      } else if (role === 'wali_sekolah') {
        healthWhere = "WHERE (hc.source = 'absensi_sekolah' OR hc.reported_by = ?)";
        healthParams.push(userId);
      } else if (role === 'wali_kelas') {
        healthWhere = "WHERE (hc.source IN ('absensi_salaf','absensi_sekolah') OR hc.reported_by = ?)";
        healthParams.push(userId);
      }

      const allHealthCases = db
        .prepare(
          `SELECT hc.*, s.full_name as student_name, s.nis, dr.name as dorm_room_name,
             rep.full_name as reporter_name, hnd.full_name as handler_name,
             (SELECT ht.action_note FROM health_timeline ht WHERE ht.case_id = hc.id ORDER BY ht.id DESC LIMIT 1) as latest_action,
             (SELECT ht.medicine_note FROM health_timeline ht WHERE ht.case_id = hc.id ORDER BY ht.id DESC LIMIT 1) as latest_medicine
           FROM health_cases hc
           JOIN students s ON hc.student_id = s.id
           LEFT JOIN dorm_rooms dr ON s.dorm_room_id = dr.id
           LEFT JOIN users rep ON hc.reported_by = rep.id
           LEFT JOIN users hnd ON hc.handled_by = hnd.id
           ${healthWhere}
           ORDER BY hc.updated_at DESC`
        )
        .all(...healthParams) as { current_status: string }[];

      sickCases = allHealthCases.filter((c) => c.current_status !== 'Sembuh');
      recoveredCases = allHealthCases.filter((c) => c.current_status === 'Sembuh');
    }

    res.json({
      pondok,
      generated_at: new Date().toISOString(),
      finance,
      academic,
      attendance: {
        counts: attCounts,
        total: attendanceRecords.length,
        records: attendanceRecords,
      },
      health: {
        active_count: sickCases.length,
        recovered_count: recoveredCases.length,
        sick_cases: sickCases,
        recovered_cases: recoveredCases,
      },
    });
  }
);

apiRouter.get('/audit-logs', authenticateJWT, requireRoles('admin'), (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
  res.json({ logs });
});

