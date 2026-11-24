import React, { useEffect, useState } from 'react';
import { Award, BookOpen, CalendarCheck, Plus, User, X } from 'lucide-react';
import { apiFetch, formatDateID } from '../lib/api';
import { AchievementRecord, AttendanceRecord, GradeRecord, Student } from '../types';
import { SplitTitle } from '../components/SplitTitle';

export const WaliAcademicPage: React.FC = () => {
  const [children, setChildren] = useState<Student[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [achievements, setAchievements] = useState<AchievementRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Modal Tambah / Tautkan Anak
  const [showAddChild, setShowAddChild] = useState(false);
  const [savingChild, setSavingChild] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [modalError, setModalError] = useState('');
  const [childForm, setChildForm] = useState({
    child_mode: 'new_student' as 'new_student' | 'existing_nis',
    existing_nis: '',
    student_name: '',
    student_gender: 'L' as 'L' | 'P',
    student_birth_date: '2014-01-01',
    student_address: '',
  });

  async function loadAll(selectId?: number) {
    setLoading(true);
    try {
      const [st, gr, ach, att] = await Promise.all([
        apiFetch<{ students: Student[] }>('/master/students'),
        apiFetch<{ grades: GradeRecord[] }>('/academics/grades'),
        apiFetch<{ achievements: AchievementRecord[] }>('/academics/achievements'),
        apiFetch<{ records: AttendanceRecord[] }>('/attendance'),
      ]);
      setChildren(st.students);
      setGrades(gr.grades);
      setAchievements(ach.achievements);
      setAttendance(att.records);
      if (selectId && st.students.some((s) => s.id === selectId)) {
        setSelectedChildId(selectId);
      } else if (st.students.length > 0 && !st.students.some((s) => s.id === selectedChildId)) {
        setSelectedChildId(st.students[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleAddChildSubmit(e: React.FormEvent) {
    e.preventDefault();
    setModalError('');
    setSavingChild(true);
    try {
      const res = await apiFetch<{ student_id: number; message: string }>('/wali/children', {
        method: 'POST',
        body: JSON.stringify(childForm),
      });
      setShowAddChild(false);
      setChildForm({
        child_mode: 'new_student',
        existing_nis: '',
        student_name: '',
        student_gender: 'L',
        student_birth_date: '2014-01-01',
        student_address: '',
      });
      setFeedback({ type: 'ok', text: res.message });
      await loadAll(res.student_id);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal menambahkan data anak.');
    } finally {
      setSavingChild(false);
    }
  }

  if (loading && children.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">
        Memuat profil dan data akademik anak...
      </div>
    );
  }

  const child = children.find((c) => c.id === selectedChildId) || children[0];
  const childGrades = grades.filter((g) => g.student_id === child?.id);
  const childAchievements = achievements.filter((a) => a.student_id === child?.id);
  const childAttendance = attendance.filter((a) => a.student_id === child?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <SplitTitle as="h1" text="Profil & Info Akademik Anak" className="text-2xl font-bold text-slate-900" />
          <p className="text-sm text-slate-600 mt-1">
            Data penempatan kelas salaf, sekolah formal, kamar asrama, nilai, prestasi, dan kehadiran seluruh anak dalam 1 akun.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {children.length > 1 && (
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedChildId(c.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    c.id === child?.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {c.full_name}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setModalError('');
              setShowAddChild(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Daftarkan / Tautkan Anak</span>
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline shrink-0 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {!child && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">Belum ada data santri yang tertaut pada akun Wali Santri Anda.</p>
          <button
            type="button"
            onClick={() => setShowAddChild(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Daftarkan atau Tautkan Anak Sekarang</span>
          </button>
        </div>
      )}

      {child && (
        <>
          {/* Profil Anak */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-emerald-800" />
              <SplitTitle as="h2" text={child.full_name} className="text-base font-bold text-slate-900" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">NIS & Status</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {child.nis} · {child.status.toUpperCase()}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Kelas Salaf</div>
                <div className="font-semibold text-slate-900 mt-0.5">{child.salaf_class_name || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Kelas Sekolah Formal</div>
                <div className="font-semibold text-slate-900 mt-0.5">{child.sekolah_class_name || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Kamar Asrama</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {child.dorm_room_name || '-'} {child.dorm_building ? `(${child.dorm_building})` : ''}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4 pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">Akun Wali Santri Terhubung (Data SPP & Info Sinkron)</div>
                <div className="font-semibold text-slate-900 mt-0.5">{child.wali_names || child.wali_name || '-'}</div>
              </div>
            </div>
          </div>

          {/* Nilai Salaf & Sekolah */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-800" />
              <SplitTitle as="h2" text="Nilai Pelajaran Salaf & Sekolah" className="text-base font-bold text-slate-900" />
            </div>
            {childGrades.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Belum ada data nilai yang diinput.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Program</th>
                      <th className="px-4 py-3">Mata Pelajaran / Kitab</th>
                      <th className="px-4 py-3">Semester</th>
                      <th className="px-4 py-3 text-right">Nilai</th>
                      <th className="px-4 py-3">Predikat</th>
                      <th className="px-4 py-3">Catatan Pengajar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {childGrades.map((g) => (
                      <tr key={g.id}>
                        <td className="px-4 py-3 text-xs font-semibold text-emerald-900 uppercase">{g.class_type}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{g.subject}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{g.semester}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900">{g.score}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-800">{g.predicate}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{g.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Prestasi */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-700" />
                <SplitTitle as="h2" text="Catatan Prestasi" className="text-base font-bold text-slate-900" />
              </div>
              {childAchievements.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Belum ada catatan prestasi.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {childAchievements.map((a) => (
                    <div key={a.id} className="p-4">
                      <div className="font-semibold text-sm text-slate-900">{a.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {a.category} · Tingkat {a.level} · {formatDateID(a.date)}
                      </div>
                      {a.notes && <div className="text-xs text-slate-600 mt-1">{a.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Absensi */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-emerald-800" />
                <SplitTitle as="h2" text="Rekap Kehadiran Kelas" className="text-base font-bold text-slate-900" />
              </div>
              {childAttendance.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Belum ada catatan absensi.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {childAttendance.map((att) => (
                    <div key={att.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-medium text-slate-900">{att.class_name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {formatDateID(att.date)} · {att.class_type.toUpperCase()}
                        </div>
                        {att.complaint && <div className="text-xs text-red-700 mt-0.5">Keluhan: {att.complaint}</div>}
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          att.status === 'HADIR'
                            ? 'text-emerald-800'
                            : att.status === 'SAKIT'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {att.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showAddChild && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Daftarkan atau Tautkan Anak</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Semua anak akan terhubung ke akun Wali Santri ini tanpa perlu membuat akun baru.
                </p>
              </div>
              <button type="button" onClick={() => setShowAddChild(false)} className="text-slate-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {modalError}
              </div>
            )}

            <form onSubmit={handleAddChildSubmit} className="space-y-4">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setChildForm({ ...childForm, child_mode: 'new_student' })}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                    childForm.child_mode === 'new_student' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Daftarkan Santri Baru
                </button>
                <button
                  type="button"
                  onClick={() => setChildForm({ ...childForm, child_mode: 'existing_nis' })}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap shrink-0 ${
                    childForm.child_mode === 'existing_nis' ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Tautkan NIS Terdaftar
                </button>
              </div>

              {childForm.child_mode === 'existing_nis' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Induk Santri (NIS)</label>
                  <input
                    type="text"
                    required
                    value={childForm.existing_nis}
                    onChange={(e) => setChildForm({ ...childForm, existing_nis: e.target.value })}
                    placeholder="Contoh: TS-2026-006"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Gunakan opsi ini jika Admin Pondok atau akun Wali Santri lain (misalnya akun Ayah / Ibu) sudah mendaftarkan data anak sebelumnya. Data SPP, nilai, absensi, dan kesehatan akan otomatis sinkron di kedua akun.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap Santriwan / Santriwati</label>
                    <input
                      type="text"
                      required
                      value={childForm.student_name}
                      onChange={(e) => setChildForm({ ...childForm, student_name: e.target.value })}
                      placeholder="Nama lengkap anak ke-2 / berikutnya"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                    <select
                      value={childForm.student_gender}
                      onChange={(e) => setChildForm({ ...childForm, student_gender: e.target.value as 'L' | 'P' })}
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
                      value={childForm.student_birth_date}
                      onChange={(e) => setChildForm({ ...childForm, student_birth_date: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Domisili</label>
                    <input
                      type="text"
                      value={childForm.student_address}
                      onChange={(e) => setChildForm({ ...childForm, student_address: e.target.value })}
                      placeholder="Alamat lengkap"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddChild(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingChild}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {savingChild
                    ? 'Menyimpan...'
                    : childForm.child_mode === 'existing_nis'
                    ? 'Tautkan ke Akun'
                    : 'Daftarkan Anak'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
