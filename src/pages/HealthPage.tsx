import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  HeartPulse,
  Plus,
  Stethoscope,
  X,
} from 'lucide-react';
import { apiFetch, formatDateTimeID } from '../lib/api';
import { AuthUser, HealthCase, HealthStatus, Student } from '../types';
import { healthStatusBadge } from '../components/StatusText';
import { SplitTitle } from '../components/SplitTitle';

const FLOW_STAGES: HealthStatus[] = [
  'Dilaporkan',
  'Diperiksa',
  'Istirahat/Obat',
  'Dirujuk',
  'Dijemput Wali',
  'Sembuh',
];

const SOURCE_LABELS: Record<HealthCase['source'], string> = {
  absensi_salaf: 'Absensi Kelas Salaf',
  absensi_sekolah: 'Absensi Kelas Sekolah',
  pembina: 'Laporan Pembina Asrama',
};

interface HealthPageProps {
  user: AuthUser;
  onRefreshNotifications: () => void;
}

export const HealthPage: React.FC<HealthPageProps> = ({ user, onRefreshNotifications }) => {
  const canHandle = user.role === 'pembina_asrama' || user.role === 'admin';
  const [cases, setCases] = useState<HealthCase[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tab, setTab] = useState<'aktif' | 'riwayat'>('aktif');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create direct case modal
  const [showCreate, setShowCreate] = useState(false);
  const [newStudentId, setNewStudentId] = useState('');
  const [newComplaint, setNewComplaint] = useState('');
  const [newDisease, setNewDisease] = useState('');
  const [newSeverity, setNewSeverity] = useState<'Ringan' | 'Sedang' | 'Berat'>('Ringan');

  // Triage form
  const [triageDisease, setTriageDisease] = useState('');
  const [triageSeverity, setTriageSeverity] = useState<'Ringan' | 'Sedang' | 'Berat'>('Ringan');

  // Timeline update form
  const [nextStatus, setNextStatus] = useState<HealthStatus>('Diperiksa');
  const [actionNote, setActionNote] = useState('');
  const [medicineNote, setMedicineNote] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [hcRes, stRes] = await Promise.all([
        apiFetch<{ cases: HealthCase[] }>('/health/cases'),
        canHandle ? apiFetch<{ students: Student[] }>('/master/students') : Promise.resolve({ students: [] }),
      ]);
      setCases(hcRes.cases);
      setStudents(stRes.students);
      if (hcRes.cases.length > 0 && !selectedId) {
        setSelectedId(hcRes.cases[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user.id]);

  const filteredCases = cases.filter((c) =>
    tab === 'aktif' ? c.current_status !== 'Sembuh' : c.current_status === 'Sembuh'
  );
  const selectedCase =
    filteredCases.find((c) => c.id === selectedId) || filteredCases[0] || null;

  useEffect(() => {
    if (selectedCase) {
      setTriageDisease(selectedCase.disease_type || '');
      setTriageSeverity(selectedCase.severity || 'Ringan');
      const idx = FLOW_STAGES.indexOf(selectedCase.current_status);
      const suggested = FLOW_STAGES[Math.min(idx + 1, FLOW_STAGES.length - 1)];
      setNextStatus(suggested);
    }
  }, [selectedCase?.id, selectedCase?.current_status]);

  async function handleCreateCase(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch<{ id: number }>('/health/cases', {
        method: 'POST',
        body: JSON.stringify({
          student_id: Number(newStudentId),
          initial_complaint: newComplaint,
          disease_type: newDisease,
          severity: newSeverity,
        }),
      });
      setShowCreate(false);
      setNewComplaint('');
      setNewDisease('');
      setSelectedId(res.id);
      setTab('aktif');
      setFeedback({ type: 'ok', text: 'Kasus santri sakit berhasil dibuat dan notifikasi telah dikirim ke Wali Santri.' });
      await loadData();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal membuat kasus.' });
    }
  }

  async function handleSaveTriage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) return;
    setFeedback(null);
    try {
      await apiFetch(`/health/cases/${selectedCase.id}/triage`, {
        method: 'PATCH',
        body: JSON.stringify({ disease_type: triageDisease, severity: triageSeverity }),
      });
      setFeedback({ type: 'ok', text: 'Jenis penyakit dan tingkat keparahan berhasil disimpan.' });
      await loadData();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan data sakit.' });
    }
  }

  async function handleAddTimeline(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) return;
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('status', nextStatus);
      fd.append('action_note', actionNote);
      fd.append('medicine_note', medicineNote);
      if (attachment) {
        fd.append('attachment', attachment);
      }
      await apiFetch(`/health/cases/${selectedCase.id}/timeline`, {
        method: 'POST',
        body: fd,
      });
      setActionNote('');
      setMedicineNote('');
      setAttachment(null);
      setFeedback({
        type: 'ok',
        text:
          nextStatus === 'Sembuh'
            ? 'Kasus ditutup sebagai Sembuh dan tersimpan di Riwayat Kesehatan. Wali Santri telah diberi notifikasi.'
            : `Status penanganan diperbarui ke "${nextStatus}" dan notifikasi dikirim ke Wali Santri.`,
      });
      await loadData();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal memperbarui status.' });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <SplitTitle as="h1" className="text-2xl font-bold text-slate-900" text="Penanganan Kesehatan Santri" />
          <p className="text-sm text-slate-600 mt-1">
            Alur tindak lanjut kasus sakit dari absensi kelas atau laporan pembina hingga dinyatakan sembuh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('aktif')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                tab === 'aktif' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Perlu Ditindaklanjuti & Aktif ({cases.filter((c) => c.current_status !== 'Sembuh').length})
            </button>
            <button
              type="button"
              onClick={() => setTab('riwayat')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                tab === 'riwayat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Riwayat Kesehatan ({cases.filter((c) => c.current_status === 'Sembuh').length})
            </button>
          </div>

          {canHandle && (
            <button
              type="button"
              onClick={() => {
                if (students.length > 0 && !newStudentId) {
                  setNewStudentId(String(students[0].id));
                }
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Kasus Sakit Langsung</span>
            </button>
          )}
        </div>
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

      {loading ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">
          Memuat data kesehatan santri...
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">
          {tab === 'aktif'
            ? 'Tidak ada kasus santri sakit yang aktif saat ini.'
            : 'Belum ada riwayat kasus kesehatan yang selesai.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Queue */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
              Daftar Kasus ({filteredCases.length})
            </div>
            {filteredCases.map((hc) => {
              const active = selectedCase?.id === hc.id;
              return (
                <button
                  key={hc.id}
                  type="button"
                  onClick={() => setSelectedId(hc.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate">{hc.student_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {SOURCE_LABELS[hc.source]} · {hc.dorm_room_name || 'Asrama'}
                      </div>
                    </div>
                    {healthStatusBadge(hc.current_status)}
                  </div>
                  <p className="mt-2 text-xs text-slate-600 line-clamp-2">{hc.initial_complaint}</p>
                  <div className="mt-2 text-[11px] text-slate-400 font-mono">
                    {hc.disease_type ? `${hc.disease_type} (${hc.severity})` : 'Belum didiagnosis awal'} ·{' '}
                    {formatDateTimeID(hc.updated_at)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Detail & Flowchart Stepper */}
          {selectedCase && (
            <div className="lg:col-span-7 space-y-6">
              {/* Case Summary + Flowchart Stepper */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">
                      {SOURCE_LABELS[selectedCase.source]} · NIS {selectedCase.nis}
                    </div>
                    <SplitTitle as="h2" className="text-lg font-bold text-slate-900 mt-0.5" text={selectedCase.student_name} />
                    <p className="text-sm text-slate-700 mt-1">Keluhan Awal: {selectedCase.initial_complaint}</p>
                  </div>
                  {healthStatusBadge(selectedCase.current_status)}
                </div>

                {/* Flowchart Stage Bar */}
                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-600 mb-2">Tahapan Penanganan (Flowchart)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {FLOW_STAGES.map((st, idx) => {
                      const currentIdx = FLOW_STAGES.indexOf(selectedCase.current_status);
                      const passed = idx <= currentIdx;
                      return (
                        <div
                          key={st}
                          className={`px-2.5 py-2 rounded-lg border text-center text-[11px] font-medium ${
                            st === selectedCase.current_status
                              ? 'bg-emerald-900 text-white border-emerald-900'
                              : passed
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {idx + 1}. {st}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pembina Triage Form: Jenis Penyakit & Tingkat Keparahan */}
                {canHandle && selectedCase.current_status !== 'Sembuh' && (
                  <form onSubmit={handleSaveTriage} className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <Stethoscope className="w-4 h-4 text-emerald-800" />
                      <span>Catat Jenis Penyakit & Tingkat Keparahan</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        value={triageDisease}
                        onChange={(e) => setTriageDisease(e.target.value)}
                        placeholder="Jenis penyakit (mis. Demam / ISPA)"
                        className="sm:col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                      <select
                        value={triageSeverity}
                        onChange={(e) => setTriageSeverity(e.target.value as 'Ringan' | 'Sedang' | 'Berat')}
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      >
                        <option value="Ringan">Ringan</option>
                        <option value="Sedang">Sedang</option>
                        <option value="Berat">Berat</option>
                      </select>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
                      >
                        Simpan Jenis Sakit
                      </button>
                    </div>
                  </form>
                )}

                {/* Pembina Update Status Penanganan + Tindakan / Obat / Lampiran */}
                {canHandle && selectedCase.current_status !== 'Sembuh' && (
                  <form onSubmit={handleAddTimeline} className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <HeartPulse className="w-4 h-4 text-emerald-800" />
                      <span>Perbarui Status Penanganan & Tindakan</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Status Penanganan Berikutnya</label>
                        <select
                          value={nextStatus}
                          onChange={(e) => setNextStatus(e.target.value as HealthStatus)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        >
                          {FLOW_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st === 'Sembuh' ? 'Sembuh (Tutup Kasus ke Riwayat)' : st}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Obat / Resep</label>
                        <input
                          type="text"
                          value={medicineNote}
                          onChange={(e) => setMedicineNote(e.target.value)}
                          placeholder="Contoh: Paracetamol 3x1, Vitamin C"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Catatan Tindakan / Observasi</label>
                      <textarea
                        rows={2}
                        required
                        value={actionNote}
                        onChange={(e) => setActionNote(e.target.value)}
                        placeholder="Jelaskan kondisi terkini, tindakan pemeriksaan, atau konfirmasi sembuh..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Lampiran Surat Dokter / Foto (Opsional)</label>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.pdf"
                          onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                          className="text-xs text-slate-600"
                        />
                      </div>
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Simpan Update & Kirim Notifikasi</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Chronological Timeline (Visible to Wali Santri & All Authorized Roles) */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <SplitTitle as="h3" className="text-base font-bold text-slate-900" text="Timeline Penanganan & Riwayat Tindakan" />
                <p className="text-xs text-slate-500 mt-0.5">
                  Setiap perubahan status tercatat berurutan dan mengirimkan notifikasi kepada Wali Santri.
                </p>

                <div className="mt-5 space-y-4">
                  {selectedCase.timeline.map((item) => (
                    <div key={item.id} className="pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {healthStatusBadge(item.status)}
                        <span className="text-xs font-mono text-slate-400">
                          {formatDateTimeID(item.created_at)} · {item.updater_name || 'Petugas'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-800">{item.action_note}</p>
                      {item.medicine_note && (
                        <div className="mt-1 text-xs text-slate-600">
                          <span className="font-semibold">Obat / Terapi:</span> {item.medicine_note}
                        </div>
                      )}
                      {item.attachment_file && (
                        <a
                          href={item.attachment_file}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Lihat Lampiran Surat Dokter / Dokumen</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Pembina Create Direct Sick Case */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Buat Kasus Santri Sakit Langsung</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Pilih Santri</label>
                <select
                  required
                  value={newStudentId}
                  onChange={(e) => setNewStudentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.nis}) — {s.dorm_room_name || 'Asrama'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Keluhan Awal</label>
                <textarea
                  rows={2}
                  required
                  value={newComplaint}
                  onChange={(e) => setNewComplaint(e.target.value)}
                  placeholder="Contoh: Mengeluh panas dingin dan mual setelah shalat subuh"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dugaan / Jenis Sakit</label>
                  <input
                    type="text"
                    value={newDisease}
                    onChange={(e) => setNewDisease(e.target.value)}
                    placeholder="Opsional"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Keparahan</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as 'Ringan' | 'Sedang' | 'Berat')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="Ringan">Ringan</option>
                    <option value="Sedang">Sedang</option>
                    <option value="Berat">Berat</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer">
                  Simpan & Kirim Notifikasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
