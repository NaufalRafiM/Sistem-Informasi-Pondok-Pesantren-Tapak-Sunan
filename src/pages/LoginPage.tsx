import React, { useEffect, useState } from 'react';
import { Lock, LogIn, ShieldCheck, UserCheck, UserPlus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AuthUser, ROLE_LABELS, UserRole } from '../types';
import { SplitTitle } from '../components/SplitTitle';

interface DemoAccount {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
}

interface RegClassOption {
  id: number;
  name: string;
  type: 'salaf' | 'sekolah';
  level: string;
  has_wali: boolean;
}

interface RegDormOption {
  id: number;
  name: string;
  building: string;
  has_pembina: boolean;
}

type StaffRegRole = 'wali_salaf' | 'wali_sekolah' | 'wali_kelas' | 'pembina_asrama';

const STAFF_ROLE_OPTIONS: { value: StaffRegRole; label: string; hint: string }[] = [
  { value: 'wali_salaf', label: 'Wali Kelas Salaf', hint: 'Mengampu kelas diniyah / kitab kuning (MIS).' },
  { value: 'wali_sekolah', label: 'Wali Kelas Sekolah', hint: 'Mengampu kelas sekolah formal (MTs / MA).' },
  { value: 'wali_kelas', label: 'Wali Kelas (Salaf & Sekolah)', hint: '1 akun untuk wali kelas Salaf sekaligus Sekolah.' },
  { value: 'pembina_asrama', label: 'Pembina Asrama', hint: 'Mengelola absensi asrama, kamar, dan kesehatan santri.' },
];

interface LoginPageProps {
  onLoginSuccess: (token: string, user: AuthUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register_wali' | 'register_staff'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [regOptions, setRegOptions] = useState<{ classes: RegClassOption[]; dorm_rooms: RegDormOption[] }>({
    classes: [],
    dorm_rooms: [],
  });

  // Registration state (Wali Santri)
  const [regForm, setRegForm] = useState({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    child_mode: 'new_student' as 'new_student' | 'existing_nis',
    existing_nis: '',
    student_name: '',
    student_gender: 'L' as 'L' | 'P',
    student_birth_date: '2013-01-01',
    student_address: '',
  });

  // Registration state (Wali Kelas Salaf / Sekolah / Pembina Asrama)
  const [staffForm, setStaffForm] = useState({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'wali_salaf' as StaffRegRole,
    requested_class_ids: [] as number[],
    requested_dorm_ids: [] as number[],
    assignment_note: '',
  });

  useEffect(() => {
    apiFetch<{ accounts: DemoAccount[] }>('/auth/demo-accounts')
      .then((res) => setDemoAccounts(res.accounts))
      .catch(() => {});
    apiFetch<{ classes: RegClassOption[]; dorm_rooms: RegDormOption[] }>('/auth/registration-options')
      .then((res) => setRegOptions(res))
      .catch(() => {});
  }, []);

  async function submitLogin(u: string, p: string) {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
      });
      onLoginSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitLogin(username, password);
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/auth/register-wali', {
        method: 'POST',
        body: JSON.stringify(regForm),
      });
      onLoginSuccess(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftarkan akun Wali Santri.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStaffRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token?: string; user: AuthUser }>('/auth/register-staff', {
        method: 'POST',
        body: JSON.stringify(staffForm),
      });
      if (res.token && res.user) {
        onLoginSuccess(res.token, res.user);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftarkan akun.');
    } finally {
      setLoading(false);
    }
  }

  function toggleClassId(id: number) {
    setStaffForm((prev) => ({
      ...prev,
      requested_class_ids: prev.requested_class_ids.includes(id)
        ? prev.requested_class_ids.filter((item) => item !== id)
        : [...prev.requested_class_ids, id],
    }));
  }

  function toggleDormId(id: number) {
    setStaffForm((prev) => ({
      ...prev,
      requested_dorm_ids: prev.requested_dorm_ids.includes(id)
        ? prev.requested_dorm_ids.filter((item) => item !== id)
        : [...prev.requested_dorm_ids, id],
    }));
  }

  const filteredStaffClasses = regOptions.classes.filter((cls) => {
    if (staffForm.role === 'wali_salaf') return cls.type === 'salaf';
    if (staffForm.role === 'wali_sekolah') return cls.type === 'sekolah';
    if (staffForm.role === 'wali_kelas') return true;
    return false;
  });

  const activeStaffRoleMeta = STAFF_ROLE_OPTIONS.find((opt) => opt.value === staffForm.role);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto bg-white border-2 border-emerald-800/40 rounded-xl shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Identity Column */}
        <div className="lg:col-span-5 bg-emerald-900 text-white p-8 lg:p-10 flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-xl p-2 mb-6 shadow-xs overflow-hidden">
              <img
                src="/assets/aistudio/images_b6b04964.jpg"
                alt="Logo Pondok Pesantren Tapak Sunan"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <SplitTitle
              as="h1"
              text="Sistem Informasi Pondok Pesantren Tapak Sunan"
              className="text-2xl lg:text-3xl font-bold tracking-tight text-balance leading-snug text-white"
            />
            <p className="mt-3 text-sm text-emerald-100 leading-relaxed">
              Platform terpadu untuk pengelolaan keuangan SPP & kas pondok, akademik kelas salaf dan sekolah formal,
              pembinaan asrama, serta pemantauan penanganan kesehatan santri secara real-time.
            </p>
          </div>

          <div className="mt-10 pt-6 border-t border-emerald-800 space-y-3 text-xs text-emerald-100">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
              <span>
                Pendaftaran mandiri tersedia untuk Wali Kelas Salaf, Wali Kelas Sekolah (1 akun bisa rangkap), dan Pembina Asrama serta langsung aktif.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
              <span>Wali Santri dapat mendaftar mandiri untuk memantau tagihan SPP, akademik, dan kesehatan anak.</span>
            </div>
          </div>
        </div>

        {/* Right Login / Register Form */}
        <div className="lg:col-span-7 p-8 lg:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-transparent">
          <div>
            {/* Mode Switcher */}
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg overflow-x-auto self-start max-w-full">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register_wali');
                    setError('');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    mode === 'register_wali' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Daftar Wali Santri
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register_staff');
                    setError('');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    mode === 'register_staff' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Daftar Pengajar & Pembina
                </button>
              </div>

              <div>
                <SplitTitle
                  as="h2"
                  text={
                    mode === 'login'
                      ? 'Masuk ke Portal Sistem'
                      : mode === 'register_wali'
                      ? 'Pendaftaran Akun Wali Santri'
                      : 'Pendaftaran Wali Kelas & Pembina Asrama'
                  }
                  className="text-xl font-bold text-slate-900"
                />
                <p className="mt-1 text-sm text-slate-600">
                  {mode === 'login'
                    ? 'Gunakan akun terdaftar atau pilih salah satu peran di bawah.'
                    : mode === 'register_wali'
                    ? 'Buat akun Wali Santri untuk memantau pembayaran SPP, akademik, dan kesehatan anak.'
                    : 'Daftarkan akun Wali Kelas Salaf, Wali Kelas Sekolah, atau Pembina Asrama untuk ditinjau Admin Pondok.'}
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {error}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleFormSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="login-username" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Username atau Email
                  </label>
                  <input
                    id="login-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Contoh: admin, bendahara, wali.santri"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700 pr-10"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{loading ? 'Memproses...' : 'Masuk ke Sistem'}</span>
                </button>
              </form>
            )}

            {mode === 'register_wali' && (
              <form onSubmit={handleRegisterSubmit} className="mt-5 space-y-3.5">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  1 anak bisa diakses oleh 2 akun Wali Santri (misalnya akun Ayah & akun Ibu) dengan menautkan <span className="font-semibold">NIS Terdaftar</span> yang sama. Jika ingin menambah anak ke-2 di akun yang sudah ada, <button type="button" onClick={() => setMode('login')} className="font-semibold text-emerald-800 underline cursor-pointer">Masuk</button> lalu pilih <span className="font-semibold">Akademik Anak → Daftarkan / Tautkan Anak</span>.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap Wali</label>
                    <input
                      type="text"
                      required
                      value={regForm.full_name}
                      onChange={(e) => setRegForm({ ...regForm, full_name: e.target.value })}
                      placeholder="Contoh: Bpk. Ahmad Fauzi"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">No. HP / WhatsApp</label>
                    <input
                      type="text"
                      required
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      placeholder="0812-xxxx-xxxx"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Username Login</label>
                    <input
                      type="text"
                      required
                      value={regForm.username}
                      onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                      placeholder="contoh: ahmad.fauzi"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      placeholder="nama@email.com"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kata Sandi (min. 6 karakter)</label>
                  <input
                    type="password"
                    minLength={6}
                    required
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                    placeholder="Buat kata sandi akun"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">Data Santri (Anak)</span>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 border border-slate-200 rounded-md">
                      <button
                        type="button"
                        onClick={() => setRegForm({ ...regForm, child_mode: 'new_student' })}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer whitespace-nowrap shrink-0 ${
                          regForm.child_mode === 'new_student' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Daftarkan Santri Baru
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegForm({ ...regForm, child_mode: 'existing_nis' })}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer whitespace-nowrap shrink-0 ${
                          regForm.child_mode === 'existing_nis' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Tautkan NIS Terdaftar
                      </button>
                    </div>
                  </div>

                  {regForm.child_mode === 'existing_nis' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Induk Santri (NIS)</label>
                      <input
                        type="text"
                        required
                        value={regForm.existing_nis}
                        onChange={(e) => setRegForm({ ...regForm, existing_nis: e.target.value })}
                        placeholder="Contoh: TS-2026-001 (bisa ditautkan Ayah & Ibu)"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Data SPP, tagihan, nilai, dan kesehatan anak akan tersinkronisasi antara akun ini dan akun Wali lain yang menautkan NIS yang sama.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap Santri</label>
                        <input
                          type="text"
                          required
                          value={regForm.student_name}
                          onChange={(e) => setRegForm({ ...regForm, student_name: e.target.value })}
                          placeholder="Nama lengkap anak"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                        <select
                          value={regForm.student_gender}
                          onChange={(e) => setRegForm({ ...regForm, student_gender: e.target.value as 'L' | 'P' })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        >
                          <option value="L">Laki-laki</option>
                          <option value="P">Perempuan</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                        <input
                          type="date"
                          value={regForm.student_birth_date}
                          onChange={(e) => setRegForm({ ...regForm, student_birth_date: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Domisili</label>
                        <input
                          type="text"
                          value={regForm.student_address}
                          onChange={(e) => setRegForm({ ...regForm, student_address: e.target.value })}
                          placeholder="Kota / Alamat lengkap"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{loading ? 'Mendaftarkan Akun...' : 'Daftar & Masuk sebagai Wali Santri'}</span>
                </button>
              </form>
            )}

            {mode === 'register_staff' && (
              <form onSubmit={handleStaffRegisterSubmit} className="mt-5 space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Pilih Tugas / Peran</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STAFF_ROLE_OPTIONS.map((opt) => {
                        const selected = staffForm.role === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setStaffForm((prev) => ({
                                ...prev,
                                role: opt.value,
                                requested_class_ids: [],
                                requested_dorm_ids: [],
                              }))
                            }
                            className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                              selected
                                ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <div className="text-xs font-semibold">{opt.label}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.hint}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap & Gelar</label>
                      <input
                        type="text"
                        required
                        value={staffForm.full_name}
                        onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                        placeholder="Contoh: Ust. M. Rifqi, S.Pd."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">No. HP / WhatsApp</label>
                      <input
                        type="text"
                        required
                        value={staffForm.phone}
                        onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                        placeholder="0812-xxxx-xxxx"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Username Login</label>
                      <input
                        type="text"
                        required
                        value={staffForm.username}
                        onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                        placeholder="contoh: muhammad.rifqi"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        required
                        value={staffForm.email}
                        onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                        placeholder="ustadz@tapaksunan.sch.id"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Kata Sandi (min. 6 karakter)</label>
                    <input
                      type="password"
                      minLength={6}
                      required
                      value={staffForm.password}
                      onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                      placeholder="Buat kata sandi akun"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-2.5">
                    {staffForm.role === 'pembina_asrama' ? (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-800">Pengajuan Kamar Asrama (opsional)</span>
                          <span className="text-[11px] text-slate-500">Pilih kamar yang dibina</span>
                        </div>
                        {regOptions.dorm_rooms.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                            {regOptions.dorm_rooms.map((room) => (
                              <label
                                key={room.id}
                                className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={staffForm.requested_dorm_ids.includes(room.id)}
                                  onChange={() => toggleDormId(room.id)}
                                  className="mt-0.5 rounded border-slate-300 text-emerald-700"
                                />
                                <div>
                                  <div className="font-semibold text-slate-900">{room.name}</div>
                                  <div className="text-[11px] text-slate-500">
                                    {room.building}
                                    {room.has_pembina ? ' · Sudah ada pembina' : ' · Belum ada pembina'}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">Daftar kamar asrama akan ditugaskan oleh Admin Pondok.</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-slate-800">Pengajuan Kelas Ampuan (opsional)</span>
                          <span className="text-[11px] text-slate-500">{activeStaffRoleMeta?.label}</span>
                        </div>
                        {filteredStaffClasses.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                            {filteredStaffClasses.map((cls) => (
                              <label
                                key={cls.id}
                                className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={staffForm.requested_class_ids.includes(cls.id)}
                                  onChange={() => toggleClassId(cls.id)}
                                  className="mt-0.5 rounded border-slate-300 text-emerald-700"
                                />
                                <div>
                                  <div className="font-semibold text-slate-900">{cls.name}</div>
                                  <div className="text-[11px] text-slate-500">
                                    {cls.type === 'salaf' ? 'Salaf' : 'Sekolah'} · {cls.level}
                                    {cls.has_wali ? ' · Sudah ada wali' : ' · Belum ada wali'}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">Penugasan kelas akan diatur oleh Admin Pondok saat aktivasi.</p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Catatan Penugasan / Keterangan (opsional)
                      </label>
                      <input
                        type="text"
                        value={staffForm.assignment_note}
                        onChange={(e) => setStaffForm({ ...staffForm, assignment_note: e.target.value })}
                        placeholder="Misal: Mengajar Fikih kelas Wustha & Bahasa Arab MTs 8A"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Kelas atau kamar yang belum memiliki penanggung jawab otomatis tertaut ke akun Anda. Penugasan tambahan dapat diatur Admin Pondok.
                  </p>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? 'Mendaftarkan Akun...' : `Daftar & Masuk sebagai ${activeStaffRoleMeta?.label}`}</span>
                  </button>
                </form>
            )}
          </div>

          {mode === 'login' && demoAccounts.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-700">Akses Cepat {demoAccounts.length} Peran Sistem</span>
                <span className="text-xs text-slate-500 font-mono">Sandi: tapaksunan123</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setUsername(acc.username);
                      setPassword('tapaksunan123');
                      submitLogin(acc.username, 'tapaksunan123');
                    }}
                    className="text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-700 hover:bg-emerald-50/40 transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-emerald-900">{ROLE_LABELS[acc.role]}</div>
                    <div className="text-xs text-slate-600 mt-0.5 truncate">{acc.full_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">@{acc.username}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
