import React, { useRef, useState } from 'react';
import { Camera, KeyRound, Lock, Trash2, User } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AuthUser, ROLE_LABELS } from '../types';
import { SplitTitle } from '../components/SplitTitle';

interface ProfilePageProps {
  user: AuthUser;
  onUserUpdated: (updated: AuthUser) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUserUpdated }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [pwdForm, setPwdForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdFeedback, setPwdFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const initials = (user.full_name || user.username || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFeedback(null);
    setPhotoBusy(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await apiFetch<{ user: AuthUser }>('/auth/profile/photo', {
        method: 'PUT',
        body: fd,
      });
      onUserUpdated(res.user);
      setPhotoFeedback({ type: 'ok', text: 'Foto profil berhasil diperbarui.' });
    } catch (err) {
      setPhotoFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengunggah foto profil.',
      });
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleRemovePhoto() {
    setPhotoFeedback(null);
    setPhotoBusy(true);
    try {
      const res = await apiFetch<{ user: AuthUser }>('/auth/profile/photo', {
        method: 'DELETE',
      });
      onUserUpdated(res.user);
      setPhotoFeedback({ type: 'ok', text: 'Foto profil berhasil dihapus.' });
    } catch (err) {
      setPhotoFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menghapus foto profil.',
      });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwdFeedback(null);
    if (pwdForm.new_password.length < 6) {
      setPwdFeedback({ type: 'err', text: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      setPwdFeedback({ type: 'err', text: 'Konfirmasi kata sandi baru tidak cocok.' });
      return;
    }

    setPwdBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/auth/password', {
        method: 'PUT',
        body: JSON.stringify(pwdForm),
      });
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
      setPwdFeedback({ type: 'ok', text: res.message || 'Kata sandi berhasil diperbarui.' });
    } catch (err) {
      setPwdFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memperbarui kata sandi.',
      });
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <SplitTitle as="h1" text="Edit Profil Akun" className="text-2xl font-bold text-slate-900" />
        <p className="text-sm text-slate-600 mt-1">
          Perbarui foto profil dan kata sandi akun Anda. Data identitas utama (ID, nama, email, dan nomor telepon) dikunci oleh sistem.
        </p>
      </div>

      {/* Foto Profil */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <SplitTitle as="h2" text="Foto Profil" className="text-base font-bold text-slate-900" />
            <p className="text-xs text-slate-500 mt-0.5">
              Format yang didukung: JPG, PNG, atau WEBP (maksimal 8 MB).
            </p>
          </div>
        </div>

        {photoFeedback && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
              photoFeedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <span>{photoFeedback.text}</span>
            <button type="button" onClick={() => setPhotoFeedback(null)} className="underline font-semibold cursor-pointer">
              Tutup
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-24 h-24 rounded-xl border border-slate-200 bg-emerald-900/5 flex items-center justify-center overflow-hidden shrink-0">
            {user.avatar_file ? (
              <img
                src={user.avatar_file}
                alt={`Foto profil ${user.full_name}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xl font-bold text-emerald-900 select-none">{initials}</span>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-slate-900">{user.full_name}</div>
            <div className="text-xs text-slate-500">
              {ROLE_LABELS[user.role]} · @{user.username}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelected}
                className="hidden"
              />
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{photoBusy ? 'Mengunggah...' : user.avatar_file ? 'Ganti Foto' : 'Unggah Foto'}</span>
              </button>

              {user.avatar_file && (
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={handleRemovePhoto}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Foto</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identitas Akun (Terkunci) */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SplitTitle
                as="h2"
                text="Data Identitas Akun"
                icon={<User className="w-4 h-4 text-emerald-800" />}
                className="text-base font-bold text-slate-900 flex items-center gap-2"
              />
              <p className="text-xs text-slate-500 mt-0.5">
                ID, nama, email, dan nomor telepon dikunci dan tidak dapat diubah secara mandiri.
              </p>
            </div>
            <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ID Akun</label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={`#${user.id}`}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-mono tabular-nums cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={`@${user.username}`}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-mono cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                readOnly
                disabled
                value={user.full_name}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                readOnly
                disabled
                value={user.email}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">No. Telepon / WhatsApp</label>
              <input
                type="text"
                readOnly
                disabled
                value={user.phone || '-'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-mono cursor-not-allowed"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed pt-1 border-t border-slate-100">
            Hubungi Admin Pondok apabila terdapat kesalahan penulisan nama, alamat email, atau nomor telepon aktif.
          </p>
        </section>

        {/* Ganti Password */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <SplitTitle
              as="h2"
              text="Ganti Kata Sandi"
              icon={<KeyRound className="w-4 h-4 text-emerald-800" />}
              className="text-base font-bold text-slate-900 flex items-center gap-2"
            />
            <p className="text-xs text-slate-500 mt-0.5">
              Gunakan minimal 6 karakter kombinasi huruf dan angka untuk keamanan akun Anda.
            </p>
          </div>

          {pwdFeedback && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                pwdFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <span>{pwdFeedback.text}</span>
              <button type="button" onClick={() => setPwdFeedback(null)} className="underline font-semibold cursor-pointer">
                Tutup
              </button>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <div>
              <label htmlFor="pwd-current" className="block text-xs font-medium text-slate-700 mb-1">
                Kata Sandi Saat Ini
              </label>
              <input
                id="pwd-current"
                type="password"
                required
                value={pwdForm.current_password}
                onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
                placeholder="Masukkan kata sandi lama"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="pwd-new" className="block text-xs font-medium text-slate-700 mb-1">
                Kata Sandi Baru (min. 6 karakter)
              </label>
              <input
                id="pwd-new"
                type="password"
                required
                minLength={6}
                value={pwdForm.new_password}
                onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                placeholder="Buat kata sandi baru"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="pwd-confirm" className="block text-xs font-medium text-slate-700 mb-1">
                Konfirmasi Kata Sandi Baru
              </label>
              <input
                id="pwd-confirm"
                type="password"
                required
                minLength={6}
                value={pwdForm.confirm_password}
                onChange={(e) => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
                placeholder="Ulangi kata sandi baru"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={pwdBusy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{pwdBusy ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}</span>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};
