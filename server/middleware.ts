import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from './db.ts';
import type { UserRole } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'tapak-sunan-ponpes-jwt-dev-secret-2026';

export interface AuthPayload {
  userId: number;
  username: string;
  fullName: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token autentikasi tidak ditemukan. Silakan masuk terlebih dahulu.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const dbUser = db.prepare('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?').get(decoded.userId) as
      | { id: number; username: string; full_name: string; role: UserRole; is_active: number }
      | undefined;

    if (!dbUser || !dbUser.is_active) {
      res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan.' });
      return;
    }

    req.user = {
      userId: dbUser.id,
      username: dbUser.username,
      fullName: dbUser.full_name,
      role: dbUser.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Sesi atau token JWT tidak valid atau telah kedaluwarsa.' });
  }
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Autentikasi diperlukan.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Akses ditolak (RBAC). Peran Anda (${req.user.role}) tidak memiliki izin untuk aksi ini.`,
      });
      return;
    }
    next();
  };
}

// File storage (bukti bayar, foto, nota, surat dokter)
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file harus berupa JPG, PNG, WEBP, atau PDF.'));
    }
  },
});

export function logAudit(
  user: AuthPayload | undefined,
  action: string,
  module: string,
  detail: string
) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_name, user_role, action, module, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user?.userId ?? null,
    user?.fullName ?? 'Sistem',
    user?.role ?? 'system',
    action,
    module,
    detail,
    now
  );
}

export function createNotification(
  userId: number | null | undefined,
  title: string,
  message: string,
  category: 'keuangan' | 'kesehatan' | 'akademik' | 'umum',
  refType?: string,
  refId?: number
) {
  if (!userId) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (user_id, title, message, category, ref_type, ref_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(userId, title, message, category, refType ?? null, refId ?? null, now);
}
