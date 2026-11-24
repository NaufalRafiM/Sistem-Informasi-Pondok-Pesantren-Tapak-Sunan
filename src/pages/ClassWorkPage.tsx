import React, { useEffect, useState } from 'react';
import { Award, Check, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { apiFetch, formatDateID } from '../lib/api';
import { AchievementRecord, AttendanceRecord, AuthUser, ClassItem, GradeRecord, Student } from '../types';
import { SplitTitle } from '../components/SplitTitle';

interface ClassWorkPageProps {
  user: AuthUser;
  onRefreshNotifications: () => void;
}

export const ClassWorkPage: React.FC<ClassWorkPageProps> = ({ user, onRefreshNotifications }) => {
  const [tab, setTab] = useState<'attendance' | 'grades' | 'achievements' | 'students'>('attendance');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [achievements, setAchievements] = useState<AchievementRecord[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftAtt, setDraftAtt] = useState<Record<number, { status: 'HADIR' | 'IZIN' | 'ALPHA' | 'SAKIT'; complaint: string }>>({});
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const activeClass = classes.find((c) => c.id === selectedClassId) || classes[0];
  const isSalaf = activeClass ? activeClass.type === 'salaf' : user.role === 'wali_salaf';
  const hasSalaf = classes.some((c) => c.type === 'salaf');
  const hasSekolah = classes.some((c) => c.type === 'sekolah');
  const isDualProgram = user.role === 'wali_kelas' || (hasSalaf && hasSekolah);

  // Grade form
  const [gradeStudentId, setGradeStudentId] = useState('');
  const [gradeSubject, setGradeSubject] = useState(
    user.role === 'wali_sekolah' ? 'Matematika' : 'Fiqih (Safinatun Najah)'
  );
  const [gradeSemester, setGradeSemester] = useState('Ganjil 2026/2027');
  const [gradeScore, setGradeScore] = useState('88');
  const [gradeNotes, setGradeNotes] = useState('');

  // Achievement form
  const [achStudentId, setAchStudentId] = useState('');
  const [achClassType, setAchClassType] = useState<'salaf' | 'sekolah'>(
    user.role === 'wali_sekolah' ? 'sekolah' : 'salaf'
  );
  const [achTitle, setAchTitle] = useState('');
  const [achCategory, setAchCategory] = useState(
    user.role === 'wali_sekolah' ? 'Akademik' : 'Kitab Kuning'
  );
  const [achLevel, setAchLevel] = useState('Kabupaten');
  const [achDate, setAchDate] = useState(new Date().toISOString().slice(0, 10));
  const [achNotes, setAchNotes] = useState('');

  async function loadAll() {
    const [clsRes, stRes, attRes, grRes, achRes] = await Promise.all([
      apiFetch<{ classes: ClassItem[] }>('/master/classes'),
      apiFetch<{ students: Student[] }>('/master/students'),
      apiFetch<{ records: AttendanceRecord[] }>('/attendance'),
      apiFetch<{ grades: GradeRecord[] }>('/academics/grades'),
      apiFetch<{ achievements: AchievementRecord[] }>('/academics/achievements'),
    ]);
    setClasses(clsRes.classes);
    setStudents(stRes.students);
    setAttendanceRecords(attRes.records);
    setGrades(grRes.grades);
    setAchievements(achRes.achievements);

    const firstCls = clsRes.classes[0]?.id || 0;
    setSelectedClassId((prev) => (prev && clsRes.classes.some((c) => c.id === prev) ? prev : firstCls));
    if (stRes.students.length > 0) {
      setAchStudentId((prev) => prev || String(stRes.students[0].id));
    }
  }

  useEffect(() => {
    loadAll();
  }, [user.id]);

  const classStudents = students.filter((s) =>
    activeClass
      ? activeClass.type === 'salaf'
        ? s.salaf_class_id === activeClass.id
        : s.sekolah_class_id === activeClass.id
      : false
  );

  // Sync student & default subject/category when active class changes
  useEffect(() => {
    if (classStudents.length > 0) {
      const stillValid = classStudents.some((s) => String(s.id) === gradeStudentId);
      if (!stillValid) {
        setGradeStudentId(String(classStudents[0].id));
      }
    } else {
      setGradeStudentId('');
    }
  }, [activeClass?.id, students.length]);

  useEffect(() => {
    if (!activeClass) return;
    if (activeClass.type === 'salaf' && gradeSubject === 'Matematika') {
      setGradeSubject('Fiqih (Safinatun Najah)');
    } else if (activeClass.type === 'sekolah' && gradeSubject === 'Fiqih (Safinatun Najah)') {
      setGradeSubject('Matematika');
    }
    setAchClassType(activeClass.type);
    if (activeClass.type === 'salaf' && achCategory === 'Akademik') {
      setAchCategory('Kitab Kuning');
    } else if (activeClass.type === 'sekolah' && achCategory === 'Kitab Kuning') {
      setAchCategory('Akademik');
    }
  }, [activeClass?.id, activeClass?.type]);

  useEffect(() => {
    const nextDraft: Record<number, { status: 'HADIR' | 'IZIN' | 'ALPHA' | 'SAKIT'; complaint: string }> = {};
    for (const st of classStudents) {
      const existing = attendanceRecords.find(
        (r) => r.student_id === st.id && r.class_id === selectedClassId && r.date === date
      );
      nextDraft[st.id] = {
        status: existing?.status || 'HADIR',
        complaint: existing?.complaint || '',
      };
    }
    setDraftAtt(nextDraft);
  }, [selectedClassId, date, students.length, attendanceRecords.length]);

  async function handleSaveAttendance(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId) return;
    setFeedback(null);
    try {
      const entries = classStudents.map((st) => ({
        student_id: st.id,
        status: draftAtt[st.id]?.status || 'HADIR',
        complaint: draftAtt[st.id]?.complaint || '',
      }));
      const res = await apiFetch<{ sick_cases_created: number }>('/attendance', {
        method: 'POST',
        body: JSON.stringify({ class_id: selectedClassId, date, entries }),
      });
      setFeedback({
        type: 'ok',
        text:
          res.sick_cases_created > 0
            ? `Absensi disimpan. ${res.sick_cases_created} laporan SAKIT otomatis dibuat ke antrian Kesehatan Pembina Asrama & dikirim ke Wali Santri.`
            : 'Absensi kelas berhasil disimpan.',
      });
      await loadAll();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan absensi.' });
    }
  }

  async function handleSaveGrade(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId || !gradeStudentId) return;
    setFeedback(null);
    try {
      await apiFetch('/academics/grades', {
        method: 'POST',
        body: JSON.stringify({
          student_id: Number(gradeStudentId),
          class_id: selectedClassId,
          subject: gradeSubject,
          semester: gradeSemester,
          score: Number(gradeScore),
          notes: gradeNotes,
        }),
      });
      setGradeNotes('');
      setFeedback({ type: 'ok', text: 'Nilai pelajaran berhasil disimpan.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan nilai.' });
    }
  }

  async function handleSaveAchievement(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/academics/achievements', {
        method: 'POST',
        body: JSON.stringify({
          student_id: Number(achStudentId),
          class_type: isDualProgram ? achClassType : isSalaf ? 'salaf' : 'sekolah',
          title: achTitle,
          category: achCategory,
          level: achLevel,
          date: achDate,
          notes: achNotes,
        }),
      });
      setAchTitle('');
      setAchNotes('');
      setFeedback({ type: 'ok', text: 'Prestasi santri berhasil dicatat dan notifikasi dikirim ke Wali Santri.' });
      await loadAll();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mencatat prestasi.' });
    }
  }

  async function handleDeleteAchievement(id: number) {
    await apiFetch(`/academics/achievements/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <SplitTitle
            as="h1"
            className="text-2xl font-bold text-slate-900"
            text={
              isDualProgram
                ? 'Manajemen Kelas Salaf & Sekolah'
                : isSalaf
                ? 'Manajemen Kelas Salaf'
                : 'Manajemen Kelas Sekolah Formal'
            }
          />
          <p className="text-sm text-slate-600 mt-1">
            Catat absensi harian (status SAKIT otomatis masuk modul Kesehatan), kelola nilai, dan prestasi santri.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {[
            { id: 'attendance', label: 'Absensi & Lapor Sakit' },
            { id: 'grades', label: isDualProgram ? 'Nilai Kelas' : isSalaf ? 'Nilai Salaf' : 'Nilai Sekolah' },
            { id: 'achievements', label: 'Prestasi Santri' },
            { id: 'students', label: 'Daftar Santri' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Class Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        {classes.length === 0 ? (
          <div className="text-sm text-slate-600">
            Belum ada kelas yang ditugaskan ke akun Anda. Hubungi Admin Pondok untuk menugaskan kelas Salaf atau Sekolah.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">Kelas Aktif:</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-medium"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.type.toUpperCase()}] {c.name} ({c.level})
                  </option>
                ))}
              </select>
            </div>
            {tab === 'attendance' && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Tanggal:</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            )}
          </div>
        )}

        {activeClass && (
          <div className="text-xs font-semibold text-emerald-900">
            Program Aktif: {isSalaf ? 'Kelas Kitab Salaf' : 'Sekolah Formal'} · {classStudents.length} Santri
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-sm flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-xs font-semibold underline cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* TAB: ATTENDANCE */}
      {tab === 'attendance' && (
        <form onSubmit={handleSaveAttendance} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <SplitTitle
              as="h2"
              icon={<ClipboardCheck className="w-4 h-4 text-emerald-800" />}
              className="text-base font-bold text-slate-900 flex items-center gap-2"
              text="Catat Absensi & Lapor Santri Sakit"
            />
            <button
              type="submit"
              disabled={classStudents.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Simpan Absensi</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">NIS</th>
                  <th className="px-4 py-3">Nama Santri</th>
                  <th className="px-4 py-3">Status Kehadiran</th>
                  <th className="px-4 py-3">Keluhan / Keterangan (Wajib jika Sakit)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Belum ada santri terdaftar di kelas ini.
                    </td>
                  </tr>
                ) : (
                  classStudents.map((st) => {
                    const row = draftAtt[st.id] || { status: 'HADIR', complaint: '' };
                    return (
                      <tr key={st.id}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{st.nis}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{st.full_name}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {(['HADIR', 'IZIN', 'ALPHA', 'SAKIT'] as const).map((statusOpt) => (
                              <button
                                key={statusOpt}
                                type="button"
                                onClick={() =>
                                  setDraftAtt((prev) => ({
                                    ...prev,
                                    [st.id]: { ...row, status: statusOpt },
                                  }))
                                }
                                className={`px-2.5 py-1 text-xs font-semibold rounded border cursor-pointer ${
                                  row.status === statusOpt
                                    ? statusOpt === 'SAKIT'
                                      ? 'bg-red-700 text-white border-red-700'
                                      : statusOpt === 'HADIR'
                                      ? 'bg-emerald-800 text-white border-emerald-800'
                                      : 'bg-amber-700 text-white border-amber-700'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {statusOpt}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            required={row.status === 'SAKIT'}
                            value={row.complaint}
                            onChange={(e) =>
                              setDraftAtt((prev) => ({
                                ...prev,
                                [st.id]: { ...row, complaint: e.target.value },
                              }))
                            }
                            placeholder={
                              row.status === 'SAKIT'
                                ? 'Tuliskan keluhan sakit (otomatis dikirim ke Pembina Asrama)...'
                                : 'Catatan opsional'
                            }
                            className={`w-full px-3 py-1.5 text-xs border rounded-lg ${
                              row.status === 'SAKIT' ? 'border-red-300 bg-red-50/40' : 'border-slate-300'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </form>
      )}

      {/* TAB: GRADES */}
      {tab === 'grades' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveGrade} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <SplitTitle
              as="h2"
              className="text-base font-bold text-slate-900"
              text={`Input Nilai ${isSalaf ? 'Pelajaran Salaf' : 'Pelajaran Sekolah'}`}
            />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Santri</label>
              <select
                required
                value={gradeStudentId}
                onChange={(e) => setGradeStudentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {classStudents.length === 0 ? (
                  <option value="">-- Tidak ada santri di kelas ini --</option>
                ) : (
                  classStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isSalaf ? 'Kitab / Mata Pelajaran Salaf' : 'Mata Pelajaran Sekolah'}
              </label>
              <input
                type="text"
                required
                value={gradeSubject}
                onChange={(e) => setGradeSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Semester</label>
                <input
                  type="text"
                  required
                  value={gradeSemester}
                  onChange={(e) => setGradeSemester(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nilai (0-100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={gradeScore}
                  onChange={(e) => setGradeScore(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Ustadz / Guru</label>
              <input
                type="text"
                value={gradeNotes}
                onChange={(e) => setGradeNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={classStudents.length === 0}
              className="w-full py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              Simpan Nilai
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Daftar Nilai Kelas" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Santri</th>
                    <th className="px-4 py-3">Program & Kelas</th>
                    <th className="px-4 py-3">Mata Pelajaran</th>
                    <th className="px-4 py-3">Semester</th>
                    <th className="px-4 py-3 text-right">Nilai</th>
                    <th className="px-4 py-3">Predikat</th>
                    <th className="px-4 py-3">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grades.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Belum ada nilai tercatat.
                      </td>
                    </tr>
                  ) : (
                    grades.map((g) => (
                      <tr key={g.id}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{g.student_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <span className="uppercase font-semibold text-emerald-800">{g.class_type}</span> · {g.class_name}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{g.subject}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{g.semester}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900">{g.score}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-800">{g.predicate}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{g.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ACHIEVEMENTS */}
      {tab === 'achievements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveAchievement} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <SplitTitle
              as="h2"
              icon={<Award className="w-4 h-4 text-amber-700" />}
              className="text-base font-bold text-slate-900 flex items-center gap-2"
              text="Catat Prestasi Santri"
            />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Santri</label>
              <select
                required
                value={achStudentId}
                onChange={(e) => setAchStudentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
            {isDualProgram && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Program Prestasi</label>
                <select
                  value={achClassType}
                  onChange={(e) => setAchClassType(e.target.value as 'salaf' | 'sekolah')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="salaf">Kelas Salaf / Kitab</option>
                  <option value="sekolah">Sekolah Formal</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Judul Prestasi</label>
              <input
                type="text"
                required
                value={achTitle}
                onChange={(e) => setAchTitle(e.target.value)}
                placeholder="Contoh: Juara 1 Musabaqah Qiraatil Kutub"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                <input
                  type="text"
                  required
                  value={achCategory}
                  onChange={(e) => setAchCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tingkat</label>
                <select
                  value={achLevel}
                  onChange={(e) => setAchLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="Pondok">Pondok</option>
                  <option value="Kecamatan">Kecamatan</option>
                  <option value="Kabupaten">Kabupaten</option>
                  <option value="Provinsi">Provinsi</option>
                  <option value="Nasional">Nasional</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal</label>
              <input
                type="date"
                required
                value={achDate}
                onChange={(e) => setAchDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={achNotes}
                onChange={(e) => setAchNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={students.length === 0}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Simpan Prestasi</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Daftar Prestasi Santri" />
            </div>
            <div className="divide-y divide-slate-100">
              {achievements.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">Belum ada prestasi tercatat.</div>
              ) : (
                achievements.map((a) => (
                  <div key={a.id} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-sm text-slate-900">{a.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        <span className="uppercase font-semibold text-emerald-800">{a.class_type}</span> · {a.student_name} · {a.category} · Tingkat {a.level} · {formatDateID(a.date)}
                      </div>
                      {a.notes && <div className="text-xs text-slate-500 mt-1">{a.notes}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAchievement(a.id)}
                      aria-label="Hapus prestasi"
                      className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: STUDENTS LIST */}
      {tab === 'students' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <SplitTitle
              as="h2"
              className="text-base font-bold text-slate-900"
              text={`Daftar Santri ${activeClass ? activeClass.name : 'Kelas'}`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">NIS</th>
                  <th className="px-4 py-3">Nama Santri</th>
                  <th className="px-4 py-3">L/P</th>
                  <th className="px-4 py-3">Kamar Asrama</th>
                  <th className="px-4 py-3">Wali Santri</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Belum ada santri terdaftar di kelas ini.
                    </td>
                  </tr>
                ) : (
                  classStudents.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.nis}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.full_name}</td>
                      <td className="px-4 py-3 text-xs">{s.gender}</td>
                      <td className="px-4 py-3 text-slate-700">{s.dorm_room_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{s.wali_name || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
