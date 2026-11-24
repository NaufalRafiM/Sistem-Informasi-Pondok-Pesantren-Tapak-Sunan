import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AuthUser, ClassItem, DormRoom, ROLE_LABELS, Student, UserRole } from '../types';
import { SplitTitle } from '../components/SplitTitle';

export const MasterAdminPage: React.FC = () => {
  const [tab, setTab] = useState<'students' | 'users' | 'classes'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [rooms, setRooms] = useState<DormRoom[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Student Modal
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [stForm, setStForm] = useState({
    nis: '',
    full_name: '',
    gender: 'L' as 'L' | 'P',
    birth_date: '2013-01-01',
    wali_user_id: '',
    salaf_class_id: '',
    sekolah_class_id: '',
    dorm_room_id: '',
    address: '',
  });

  // User Modal (Create & Edit)
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [usrForm, setUsrForm] = useState({
    username: '',
    email: '',
    full_name: '',
    role: 'wali_santri' as UserRole,
    phone: '',
    password: 'tapaksunan123',
    is_active: 1,
  });

  // Class Modal (Create & Edit)
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [clsForm, setClsForm] = useState({
    name: '',
    type: 'salaf' as 'salaf' | 'sekolah',
    level: 'Ula',
    wali_user_id: '',
    academic_year: '2026/2027',
  });

  async function loadAll() {
    const [sRes, uRes, cRes, rRes] = await Promise.all([
      apiFetch<{ students: Student[] }>('/master/students'),
      apiFetch<{ users: AuthUser[] }>('/users'),
      apiFetch<{ classes: ClassItem[] }>('/master/classes'),
      apiFetch<{ rooms: DormRoom[] }>('/master/dorm-rooms'),
    ]);
    setStudents(sRes.students);
    setUsers(uRes.users);
    setClasses(cRes.classes);
    setRooms(rRes.rooms);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const waliUsers = users.filter((u) => u.role === 'wali_santri');
  const teacherUsers = users.filter(
    (u) => u.role === 'wali_salaf' || u.role === 'wali_sekolah' || u.role === 'wali_kelas'
  );
  const salafClasses = classes.filter((c) => c.type === 'salaf');
  const sekolahClasses = classes.filter((c) => c.type === 'sekolah');

  async function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/master/students', {
        method: 'POST',
        body: JSON.stringify({
          ...stForm,
          wali_user_id: stForm.wali_user_id ? Number(stForm.wali_user_id) : null,
          salaf_class_id: stForm.salaf_class_id ? Number(stForm.salaf_class_id) : null,
          sekolah_class_id: stForm.sekolah_class_id ? Number(stForm.sekolah_class_id) : null,
          dorm_room_id: stForm.dorm_room_id ? Number(stForm.dorm_room_id) : null,
        }),
      });
      setShowStudentModal(false);
      setStForm({ ...stForm, nis: '', full_name: '', address: '' });
      setFeedback({ type: 'ok', text: 'Data santri baru berhasil ditambahkan.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan santri.' });
    }
  }

  async function handleDeleteStudent(id: number) {
    await apiFetch(`/master/students/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  function openCreateUserModal() {
    setEditingUserId(null);
    setUsrForm({
      username: '',
      email: '',
      full_name: '',
      role: 'wali_santri',
      phone: '',
      password: 'tapaksunan123',
      is_active: 1,
    });
    setShowUserModal(true);
  }

  function openEditUserModal(u: AuthUser) {
    setEditingUserId(u.id);
    setUsrForm({
      username: u.username,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      phone: u.phone || '',
      password: '',
      is_active: u.is_active ?? 1,
    });
    setShowUserModal(true);
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      if (editingUserId) {
        await apiFetch(`/users/${editingUserId}`, {
          method: 'PUT',
          body: JSON.stringify({
            full_name: usrForm.full_name,
            email: usrForm.email,
            role: usrForm.role,
            phone: usrForm.phone,
            is_active: usrForm.is_active,
            ...(usrForm.password.trim().length >= 6 ? { password: usrForm.password.trim() } : {}),
          }),
        });
        setFeedback({ type: 'ok', text: `Akun ${usrForm.full_name} berhasil diperbarui.` });
      } else {
        await apiFetch('/users', { method: 'POST', body: JSON.stringify(usrForm) });
        setFeedback({ type: 'ok', text: 'Akun pengguna baru berhasil dibuat.' });
      }
      setShowUserModal(false);
      setEditingUserId(null);
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan akun.' });
    }
  }

  const pendingApprovalCount = users.filter((u) => !u.is_active && Boolean(u.registration_note)).length;

  async function handleToggleUser(u: AuthUser) {
    setFeedback(null);
    try {
      const activating = !u.is_active;
      await apiFetch(`/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          phone: u.phone,
          is_active: activating ? 1 : 0,
        }),
      });
      if (activating && u.registration_note) {
        setFeedback({
          type: 'ok',
          text: `Akun @${u.username} disetujui & diaktifkan. Tugaskan kelas di tab Kelas Salaf & Sekolah jika perlu.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `Akun @${u.username} ${activating ? 'diaktifkan' : 'dinonaktifkan'}.`,
        });
      }
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal memperbarui status akun.' });
    }
  }

  function openCreateClassModal() {
    setEditingClassId(null);
    setClsForm({
      name: '',
      type: 'salaf',
      level: 'Ula',
      wali_user_id: '',
      academic_year: '2026/2027',
    });
    setShowClassModal(true);
  }

  function openEditClassModal(c: ClassItem) {
    setEditingClassId(c.id);
    setClsForm({
      name: c.name,
      type: c.type,
      level: c.level,
      wali_user_id: c.wali_user_id ? String(c.wali_user_id) : '',
      academic_year: c.academic_year || '2026/2027',
    });
    setShowClassModal(true);
  }

  async function handleSaveClass(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      const payload = {
        ...clsForm,
        wali_user_id: clsForm.wali_user_id ? Number(clsForm.wali_user_id) : null,
      };
      let promoted = false;
      if (editingClassId) {
        const res = await apiFetch<{ success: boolean; promoted?: boolean }>(`/master/classes/${editingClassId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        promoted = Boolean(res.promoted);
      } else {
        const res = await apiFetch<{ id: number; promoted?: boolean }>('/master/classes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        promoted = Boolean(res.promoted);
      }
      setShowClassModal(false);
      setEditingClassId(null);
      setFeedback({
        type: 'ok',
        text: promoted
          ? 'Kelas berhasil disimpan. Akun wali kelas otomatis ditingkatkan menjadi Wali Kelas (Salaf & Sekolah) karena mengampu kedua program.'
          : editingClassId
          ? 'Data kelas berhasil diperbarui.'
          : 'Kelas baru berhasil ditambahkan.',
      });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan kelas.' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <SplitTitle as="h1" className="text-2xl font-bold text-slate-900" text="Data Master & Akun Pengguna" />
          <p className="text-sm text-slate-600 mt-1">
            Kelola akun pengguna (Admin, Bendahara / TU, Wali Santri, Wali Kelas, Pembina Asrama), santri, dan kelas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
            {[
              { id: 'students', label: `Santri & Wali (${students.length})` },
              {
                id: 'users',
                label:
                  pendingApprovalCount > 0
                    ? `Akun Pengguna (${users.length} · ${pendingApprovalCount} Menunggu)`
                    : `Akun Pengguna (${users.length})`,
              },
              { id: 'classes', label: `Kelas Salaf & Sekolah (${classes.length})` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              if (tab === 'students') setShowStudentModal(true);
              if (tab === 'users') openCreateUserModal();
              if (tab === 'classes') openCreateClassModal();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>
              {tab === 'students' ? 'Tambah Santri' : tab === 'users' ? 'Tambah Akun' : 'Tambah Kelas'}
            </span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-sm flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-xs font-semibold underline shrink-0 cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {tab === 'students' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">NIS</th>
                  <th className="px-4 py-3">Nama Santri</th>
                  <th className="px-4 py-3">Wali Santri</th>
                  <th className="px-4 py-3">Kelas Salaf</th>
                  <th className="px-4 py-3">Kelas Sekolah</th>
                  <th className="px-4 py-3">Asrama</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.nis}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.full_name}</td>
                    <td className="px-4 py-3 text-slate-700">{s.wali_names || s.wali_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.salaf_class_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.sekolah_class_name || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.dorm_room_name || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(s.id)}
                        className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                        aria-label="Hapus santri"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          {pendingApprovalCount > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
              Ada <span className="font-bold font-mono tabular-nums">{pendingApprovalCount}</span> pendaftaran pengajar / pembina asrama baru yang menunggu persetujuan. Tinjau catatan pengajuan lalu klik <span className="font-semibold">Setujui & Aktifkan</span>.
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Nama Lengkap</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Peran (RBAC)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const isPending = !u.is_active && Boolean(u.registration_note);
                    return (
                      <tr key={u.id} className={isPending ? 'bg-amber-50/40' : ''}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{u.full_name}</div>
                          {u.registration_note && (
                            <div className="text-xs text-slate-500 mt-0.5 max-w-md">{u.registration_note}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">@{u.username}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{u.email}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-emerald-900">{ROLE_LABELS[u.role]}</td>
                        <td className="px-4 py-3 text-xs font-medium">
                          {u.is_active ? (
                            <span className="text-emerald-800">Aktif</span>
                          ) : isPending ? (
                            <span className="text-amber-700 font-semibold">Menunggu Persetujuan</span>
                          ) : (
                            <span className="text-red-700">Nonaktif</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditUserModal(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-300 bg-white rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Ubah</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleUser(u)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                                isPending
                                  ? 'bg-emerald-800 text-white hover:bg-emerald-900 border border-emerald-800'
                                  : 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              {u.is_active ? 'Nonaktifkan' : isPending ? 'Setujui & Aktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'classes' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nama Kelas</th>
                  <th className="px-4 py-3">Program</th>
                  <th className="px-4 py-3">Jenjang</th>
                  <th className="px-4 py-3">Wali Kelas</th>
                  <th className="px-4 py-3">Tahun Ajaran</th>
                  <th className="px-4 py-3 text-right">Jumlah Santri</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-xs font-semibold uppercase text-emerald-800">{c.type}</td>
                    <td className="px-4 py-3 text-slate-700">{c.level}</td>
                    <td className="px-4 py-3 text-slate-700">{c.wali_name || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.academic_year}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {c.student_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditClassModal(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Ubah</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Add Student */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Tambah Data Santri Baru</h3>
              <button type="button" onClick={() => setShowStudentModal(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateStudent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">NIS</label>
                  <input
                    type="text"
                    required
                    value={stForm.nis}
                    onChange={(e) => setStForm({ ...stForm, nis: e.target.value })}
                    placeholder="TS-2026-006"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={stForm.gender}
                    onChange={(e) => setStForm({ ...stForm, gender: e.target.value as 'L' | 'P' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap Santri</label>
                <input
                  type="text"
                  required
                  value={stForm.full_name}
                  onChange={(e) => setStForm({ ...stForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Wali Santri</label>
                <select
                  value={stForm.wali_user_id}
                  onChange={(e) => setStForm({ ...stForm, wali_user_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="">-- Pilih Wali Santri --</option>
                  {waliUsers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kelas Salaf</label>
                  <select
                    value={stForm.salaf_class_id}
                    onChange={(e) => setStForm({ ...stForm, salaf_class_id: e.target.value })}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="">Pilih</option>
                    {salafClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kelas Sekolah</label>
                  <select
                    value={stForm.sekolah_class_id}
                    onChange={(e) => setStForm({ ...stForm, sekolah_class_id: e.target.value })}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="">Pilih</option>
                    {sekolahClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kamar Asrama</label>
                  <select
                    value={stForm.dorm_room_id}
                    onChange={(e) => setStForm({ ...stForm, dorm_room_id: e.target.value })}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="">Pilih</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowStudentModal(false)} className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg cursor-pointer">
                  Simpan Santri
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add / Edit User */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingUserId ? 'Ubah Akun Pengguna' : 'Buat Akun Pengguna Baru'}
              </h3>
              <button type="button" onClick={() => setShowUserModal(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={usrForm.full_name}
                  onChange={(e) => setUsrForm({ ...usrForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingUserId)}
                    value={usrForm.username}
                    onChange={(e) => setUsrForm({ ...usrForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Peran RBAC</label>
                  <select
                    value={usrForm.role}
                    onChange={(e) => setUsrForm({ ...usrForm, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="admin">Admin Pondok</option>
                    <option value="bendahara">Bendahara / TU</option>
                    <option value="wali_santri">Wali Santri</option>
                    <option value="wali_salaf">Wali Kelas Salaf</option>
                    <option value="wali_sekolah">Wali Kelas Sekolah</option>
                    <option value="wali_kelas">Wali Kelas (Salaf & Sekolah)</option>
                    <option value="pembina_asrama">Pembina Asrama</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={usrForm.email}
                    onChange={(e) => setUsrForm({ ...usrForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. HP / WhatsApp</label>
                  <input
                    type="text"
                    value={usrForm.phone}
                    onChange={(e) => setUsrForm({ ...usrForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {editingUserId ? 'Kata Sandi Baru (kosongkan jika tidak diubah)' : 'Kata Sandi Awal'}
                </label>
                <input
                  type="text"
                  required={!editingUserId}
                  minLength={editingUserId ? undefined : 6}
                  value={usrForm.password}
                  onChange={(e) => setUsrForm({ ...usrForm, password: e.target.value })}
                  placeholder={editingUserId ? 'Minimal 6 karakter jika ingin ubah sandi' : ''}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUserModal(false)} className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg cursor-pointer">
                  {editingUserId ? 'Simpan Perubahan' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add / Edit Class */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingClassId ? 'Ubah Kelas Salaf / Sekolah' : 'Tambah Kelas Salaf / Sekolah'}
              </h3>
              <button type="button" onClick={() => setShowClassModal(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveClass} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Kelas</label>
                <input
                  type="text"
                  required
                  value={clsForm.name}
                  onChange={(e) => setClsForm({ ...clsForm, name: e.target.value })}
                  placeholder="Contoh: Ulya A - Alfiyah Ibnu Malik"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Program</label>
                  <select
                    value={clsForm.type}
                    onChange={(e) => setClsForm({ ...clsForm, type: e.target.value as 'salaf' | 'sekolah' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="salaf">Kelas Salaf</option>
                    <option value="sekolah">Kelas Sekolah</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenjang</label>
                  <input
                    type="text"
                    required
                    value={clsForm.level}
                    onChange={(e) => setClsForm({ ...clsForm, level: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tahun Ajaran</label>
                  <input
                    type="text"
                    required
                    value={clsForm.academic_year}
                    onChange={(e) => setClsForm({ ...clsForm, academic_year: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Wali Kelas</label>
                <select
                  value={clsForm.wali_user_id}
                  onChange={(e) => setClsForm({ ...clsForm, wali_user_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="">-- Pilih Wali Kelas --</option>
                  {teacherUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({ROLE_LABELS[u.role]})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  1 pengajar cukup 1 akun: menugaskan Wali Kelas Salaf ke kelas Sekolah (atau sebaliknya) otomatis menggabungkan akses ke peran Wali Kelas (Salaf & Sekolah).
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowClassModal(false)} className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg cursor-pointer">
                  {editingClassId ? 'Simpan Perubahan' : 'Simpan Kelas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
