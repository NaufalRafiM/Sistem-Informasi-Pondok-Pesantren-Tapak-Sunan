import React, { useEffect, useState } from 'react';
import { Home, Plus, UserCheck, X } from 'lucide-react';
import { apiFetch, formatDateID } from '../lib/api';
import { AuthUser, DormCondition, DormRoom, Student } from '../types';
import { SplitTitle } from '../components/SplitTitle';

export const DormitoryPage: React.FC<{ user: AuthUser }> = ({ user }) => {
  const [rooms, setRooms] = useState<DormRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [conditions, setConditions] = useState<DormCondition[]>([]);
  const [tab, setTab] = useState<'rooms' | 'conditions' | 'students'>('rooms');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Room modal
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomBuilding, setRoomBuilding] = useState('Gedung Putra Timur');
  const [roomCapacity, setRoomCapacity] = useState('10');
  const [roomNote, setRoomNote] = useState('Bersih & terawat');

  // Condition form
  const [condStudentId, setCondStudentId] = useState('');
  const [condStatus, setCondStatus] = useState<'Sehat' | 'Perlu Perhatian' | 'Sakit'>('Sehat');
  const [condNote, setCondNote] = useState('');

  async function loadAll() {
    const [rRes, sRes, cRes] = await Promise.all([
      apiFetch<{ rooms: DormRoom[] }>('/master/dorm-rooms'),
      apiFetch<{ students: Student[] }>('/master/students'),
      apiFetch<{ conditions: DormCondition[] }>('/dorm/conditions'),
    ]);
    setRooms(rRes.rooms);
    setStudents(sRes.students);
    setConditions(cRes.conditions);
    if (sRes.students.length > 0 && !condStudentId) {
      setCondStudentId(String(sRes.students[0].id));
    }
  }

  useEffect(() => {
    loadAll();
  }, [user.id]);

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch('/master/dorm-rooms', {
      method: 'POST',
      body: JSON.stringify({
        name: roomName,
        building: roomBuilding,
        capacity: Number(roomCapacity),
        condition_note: roomNote,
      }),
    });
    setShowRoomModal(false);
    setRoomName('');
    setFeedback('Kamar asrama baru berhasil ditambahkan.');
    await loadAll();
  }

  async function handleAssignRoom(studentId: number, roomId: number) {
    await apiFetch(`/master/dorm-rooms/${roomId}/assign-student`, {
      method: 'PATCH',
      body: JSON.stringify({ student_id: studentId }),
    });
    setFeedback('Penempatan kamar santri berhasil diperbarui.');
    await loadAll();
  }

  async function handleLogCondition(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch('/dorm/conditions', {
      method: 'POST',
      body: JSON.stringify({
        student_id: Number(condStudentId),
        condition_status: condStatus,
        note: condNote,
      }),
    });
    setCondNote('');
    setFeedback('Catatan kondisi santri asrama berhasil disimpan.');
    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <SplitTitle as="h1" className="text-2xl font-bold text-slate-900" text="Asrama & Pembinaan Santri" />
          <p className="text-sm text-slate-600 mt-1">
            Kelola data kamar asrama, penempatan penghuni, dan pemantauan kondisi harian santri.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {[
              { id: 'rooms', label: 'Data Kamar' },
              { id: 'conditions', label: 'Pantau Kondisi Santri' },
              { id: 'students', label: 'Daftar Santri Asrama' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowRoomModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kamar</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-900 text-sm flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-xs font-semibold underline cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {tab === 'rooms' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500">{r.building}</div>
                  <SplitTitle as="h3" className="text-base font-bold text-slate-900 mt-0.5" text={r.name} stagger={0.04} />
                </div>
                <Home className="w-4 h-4 text-emerald-800 shrink-0" />
              </div>
              <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
                <span className="text-slate-500">Okupansi</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {r.occupant_count ?? 0} / {r.capacity} santri
                </span>
              </div>
              <div className="text-xs text-slate-600">
                Pembina: <span className="font-medium text-slate-900">{r.pembina_name || '-'}</span>
              </div>
              <div className="text-xs text-slate-500">{r.condition_note}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'conditions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleLogCondition} className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <SplitTitle
              as="h2"
              icon={<UserCheck className="w-4 h-4 text-emerald-800" />}
              className="text-base font-bold text-slate-900 flex items-center gap-2"
              text="Catat Pemantauan Kondisi"
            />
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Santri</label>
              <select
                required
                value={condStudentId}
                onChange={(e) => setCondStudentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.dorm_room_name || 'Asrama'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kondisi Terkini</label>
              <select
                value={condStatus}
                onChange={(e) => setCondStatus(e.target.value as 'Sehat' | 'Perlu Perhatian' | 'Sakit')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Sehat">Sehat</option>
                <option value="Perlu Perhatian">Perlu Perhatian</option>
                <option value="Sakit">Sakit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Pembina</label>
              <textarea
                rows={2}
                required
                value={condNote}
                onChange={(e) => setCondNote(e.target.value)}
                placeholder="Catatan kondisi fisik, kedisiplinan ibadah, atau kebersihan..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
            >
              Simpan Pemantauan
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Riwayat Pantau Kondisi Santri" />
            </div>
            <div className="divide-y divide-slate-100">
              {conditions.map((c) => (
                <div key={c.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">
                      {c.student_name}{' '}
                      <span className="text-xs font-normal text-slate-500">· {c.dorm_room_name || '-'}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{c.note}</p>
                    <div className="text-[11px] text-slate-400 font-mono mt-1">
                      {formatDateID(c.date)} · {c.pembina_name}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      c.condition_status === 'Sehat'
                        ? 'text-emerald-800'
                        : c.condition_status === 'Sakit'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {c.condition_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Daftar Santri Asrama & Penempatan Kamar" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">NIS</th>
                  <th className="px-4 py-3">Nama Santri</th>
                  <th className="px-4 py-3">Kelas Salaf / Sekolah</th>
                  <th className="px-4 py-3">Kamar Saat Ini</th>
                  <th className="px-4 py-3">Ubah Penempatan Kamar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.nis}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.full_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {s.salaf_class_name || '-'} · {s.sekolah_class_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.dorm_room_name || 'Belum ditempatkan'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={s.dorm_room_id || ''}
                        onChange={(e) => handleAssignRoom(s.id, Number(e.target.value))}
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                      >
                        <option value="" disabled>
                          Pilih Kamar
                        </option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Tambah Kamar Asrama</h3>
              <button type="button" onClick={() => setShowRoomModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Kamar</label>
                <input
                  type="text"
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Contoh: Kamar Ibnu Sina 03"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gedung</label>
                  <input
                    type="text"
                    required
                    value={roomBuilding}
                    onChange={(e) => setRoomBuilding(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kapasitas</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={roomCapacity}
                    onChange={(e) => setRoomCapacity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Kondisi Kamar</label>
                <input
                  type="text"
                  value={roomNote}
                  onChange={(e) => setRoomNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRoomModal(false)} className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer">
                  Simpan Kamar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
