import React, { useEffect, useState } from 'react';
import {
  Award,
  CalendarCheck,
  Download,
  FileText,
  GraduationCap,
  HeartPulse,
  Printer,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatDateID, formatDateTimeID, formatRupiah } from '../lib/api';
import { downloadReportPdf, FullReportData, ReportPdfScope } from '../lib/reportPdf';
import { AuditLog, AuthUser, ROLE_LABELS } from '../types';
import { billStatusBadge, healthStatusBadge } from '../components/StatusText';
import { SplitTitle } from '../components/SplitTitle';

type ReportTab = 'finance' | 'academic' | 'attendance' | 'health' | 'audit';

export const ReportsPage: React.FC<{ user: AuthUser }> = ({ user }) => {
  const isAdmin = user.role === 'admin';
  const isBendahara = user.role === 'bendahara';
  const canSeeFinance = isAdmin || isBendahara;
  const canSeeAcademic =
    isAdmin || user.role === 'wali_salaf' || user.role === 'wali_sekolah' || user.role === 'wali_kelas';
  const canSeeAttendanceHealth = !isBendahara;

  const defaultTab: ReportTab = canSeeFinance
    ? 'finance'
    : canSeeAcademic
    ? 'academic'
    : 'health';

  const [tab, setTab] = useState<ReportTab>(defaultTab);
  const [report, setReport] = useState<FullReportData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const reqs: Promise<unknown>[] = [apiFetch<FullReportData>('/reports/full')];
    if (isAdmin) {
      reqs.push(apiFetch<{ logs: AuditLog[] }>('/audit-logs'));
    }
    Promise.all(reqs)
      .then(([fullRep, logs]) => {
        setReport(fullRep as FullReportData);
        if (logs) setAuditLogs((logs as { logs: AuditLog[] }).logs);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Gagal memuat data laporan.');
      })
      .finally(() => setLoading(false));
  }, [user.id]);

  function handleDownload(scope: ReportPdfScope) {
    if (!report) return;
    downloadReportPdf(report, user, scope);
  }

  return (
    <div className="space-y-6">
      {/* Header + Primary PDF Download */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <SplitTitle
            as="h1"
            className="text-2xl font-bold text-slate-900"
            text={
              isAdmin
                ? 'Pusat Laporan Sistem & Ekspor PDF'
                : isBendahara
                ? 'Laporan Keuangan Pondok & Ekspor PDF'
                : user.role === 'pembina_asrama'
                ? 'Laporan Asrama, Absensi & Kesehatan Santri'
                : 'Laporan Akademik, Absensi & Kesehatan Kelas'
            }
          />
          <p className="text-sm text-slate-600 mt-1">
            {isBendahara
              ? `Rangkuman arus kas masuk/keluar, tagihan SPP, dan tunggakan sesuai wewenang ${ROLE_LABELS[user.role]}.`
              : `Rangkuman keuangan, akademik, absensi, serta santri sakit dan sembuh sesuai wewenang ${ROLE_LABELS[user.role]}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 no-print">
          <button
            type="button"
            disabled={!report || loading}
            onClick={() => handleDownload(isBendahara ? 'finance' : 'all')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isBendahara ? 'Unduh Laporan Keuangan (PDF)' : 'Unduh Laporan Lengkap (PDF)'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Halaman</span>
          </button>
        </div>
      </div>

      {/* Quick Per-Module PDF Download Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
          {canSeeFinance && report.finance && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Rangkuman Keuangan</span>
                  <Wallet className="w-4 h-4 text-emerald-800" />
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900 font-mono tabular-nums">
                  {formatRupiah(report.finance.summary.saldo_kas)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Tunggakan: {formatRupiah(report.finance.summary.total_tunggakan)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDownload('finance')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh PDF Keuangan</span>
              </button>
            </div>
          )}

          {canSeeAcademic && report.academic && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Rangkuman Akademik</span>
                  <GraduationCap className="w-4 h-4 text-emerald-800" />
                </div>
                <div className="mt-2 text-lg font-bold text-slate-900 font-mono tabular-nums">
                  Rata-rata {report.academic.summary.avg_score}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {report.academic.summary.total_grades} nilai · {report.academic.summary.total_achievements} prestasi
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDownload('academic')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh PDF Akademik</span>
              </button>
            </div>
          )}

          {canSeeAttendanceHealth && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Laporan Absensi</span>
                    <CalendarCheck className="w-4 h-4 text-emerald-800" />
                  </div>
                  <div className="mt-2 text-lg font-bold text-slate-900 font-mono tabular-nums">
                    {report.attendance.total} Catatan
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    Hadir {report.attendance.counts.HADIR} · Izin {report.attendance.counts.IZIN} · Alpha {report.attendance.counts.ALPHA} · Sakit {report.attendance.counts.SAKIT}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload('attendance')}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh PDF Absensi</span>
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Laporan Sakit & Sembuh</span>
                    <HeartPulse className="w-4 h-4 text-red-700" />
                  </div>
                  <div className="mt-2 text-lg font-bold text-slate-900 font-mono tabular-nums">
                    {report.health.active_count} Sakit · {report.health.recovered_count} Sembuh
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Pemantauan aktif & riwayat sembuh
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload('health')}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh PDF Sakit & Sembuh</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Segmented View Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start w-fit no-print">
        {canSeeFinance && (
          <TabBtn active={tab === 'finance'} onClick={() => setTab('finance')}>
            Rangkuman Keuangan
          </TabBtn>
        )}
        {canSeeAcademic && (
          <TabBtn active={tab === 'academic'} onClick={() => setTab('academic')}>
            Rangkuman Akademik
          </TabBtn>
        )}
        {canSeeAttendanceHealth && (
          <>
            <TabBtn active={tab === 'attendance'} onClick={() => setTab('attendance')}>
              Laporan Absen
            </TabBtn>
            <TabBtn active={tab === 'health'} onClick={() => setTab('health')}>
              Laporan Sakit & Sembuh
            </TabBtn>
          </>
        )}
        {isAdmin && (
          <TabBtn active={tab === 'audit'} onClick={() => setTab('audit')}>
            Audit Log
          </TabBtn>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      {loading || !report ? (
        <div className="p-10 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">
          Menyiapkan rangkuman laporan...
        </div>
      ) : (
        <>
          {/* TAB 1: FINANCE */}
          {tab === 'finance' && report.finance && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatBox label="Total Kas Masuk" value={formatRupiah(report.finance.summary.total_masuk)} tone="emerald" />
                <StatBox label="Total Kas Keluar" value={formatRupiah(report.finance.summary.total_keluar)} tone="red" />
                <StatBox label="Saldo Kas Bersih" value={formatRupiah(report.finance.summary.saldo_kas)} tone="slate" />
                <StatBox
                  label={`Tunggakan (${report.finance.summary.belum_lunas_count} Tagihan)`}
                  value={formatRupiah(report.finance.summary.total_tunggakan)}
                  tone="amber"
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <SplitTitle
                    as="h2"
                    icon={<FileText className="w-4 h-4 text-emerald-800" />}
                    className="text-base font-bold text-slate-900 flex items-center gap-2"
                    text="Rincian Arus Kas Masuk & Keluar"
                  />
                  <button
                    type="button"
                    onClick={() => handleDownload('finance')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg no-print cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF Keuangan</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Jenis</th>
                        <th className="px-4 py-3">Kategori</th>
                        <th className="px-4 py-3">Keterangan</th>
                        <th className="px-4 py-3 text-right">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.finance.cash_entries.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{formatDateID(c.transaction_date)}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold">
                            <span className={c.type === 'masuk' ? 'text-emerald-800' : 'text-red-700'}>
                              {c.type === 'masuk' ? 'Kas Masuk' : 'Kas Keluar'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{c.category}</td>
                          <td className="px-4 py-2.5 text-slate-600">{c.description}</td>
                          <td
                            className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold ${
                              c.type === 'masuk' ? 'text-emerald-800' : 'text-red-700'
                            }`}
                          >
                            {c.type === 'masuk' ? '+' : '-'} {formatRupiah(c.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Rekap Status Tagihan SPP & Daftar Ulang" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Santri</th>
                        <th className="px-4 py-3">Tagihan</th>
                        <th className="px-4 py-3 text-right">Nominal</th>
                        <th className="px-4 py-3 text-right">Terbayar</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.finance.bills.map((b) => (
                        <tr key={b.id}>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-900">{b.student_name}</div>
                            <div className="text-xs font-mono text-slate-500">{b.nis}</div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{b.title}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatRupiah(b.total_amount)}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-800">
                            {formatRupiah(b.paid_amount)}
                          </td>
                          <td className="px-4 py-2.5">{billStatusBadge(b.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ACADEMIC */}
          {tab === 'academic' && report.academic && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Rekap Nilai Pelajaran Salaf & Sekolah" />
                    <p className="text-xs text-slate-500 mt-0.5">
                      Total {report.academic.summary.total_grades} data nilai · Rata-rata {report.academic.summary.avg_score}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload('academic')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg no-print cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF Akademik</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">NIS</th>
                        <th className="px-4 py-3">Santri</th>
                        <th className="px-4 py-3">Program & Kelas</th>
                        <th className="px-4 py-3">Mata Pelajaran / Kitab</th>
                        <th className="px-4 py-3 text-right">Nilai</th>
                        <th className="px-4 py-3">Predikat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.academic.grades.map((g) => (
                        <tr key={g.id}>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{g.nis}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">{g.student_name}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            <span className="uppercase font-semibold text-emerald-800">{g.class_type}</span> · {g.class_name}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{g.subject}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-slate-900">{g.score}</td>
                          <td className="px-4 py-2.5 font-semibold text-emerald-800">{g.predicate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <SplitTitle
                    as="h2"
                    icon={<Award className="w-4 h-4 text-amber-700" />}
                    className="text-base font-bold text-slate-900 flex items-center gap-2"
                    text="Daftar Prestasi Santri"
                  />
                </div>
                <div className="divide-y divide-slate-100">
                  {report.academic.achievements.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">Belum ada prestasi tercatat.</div>
                  ) : (
                    report.academic.achievements.map((a) => (
                      <div key={a.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                        <div>
                          <div className="font-semibold text-sm text-slate-900">{a.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {a.student_name} ({a.nis}) · {a.category} · Tingkat {a.level}
                          </div>
                        </div>
                        <div className="text-xs font-mono text-slate-500 shrink-0">{formatDateID(a.date)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ATTENDANCE */}
          {tab === 'attendance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatBox label="Hadir" value={String(report.attendance.counts.HADIR)} tone="emerald" />
                <StatBox label="Izin" value={String(report.attendance.counts.IZIN)} tone="slate" />
                <StatBox label="Alpha" value={String(report.attendance.counts.ALPHA)} tone="amber" />
                <StatBox label="Sakit" value={String(report.attendance.counts.SAKIT)} tone="red" />
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Laporan Detail Absensi Santri" />
                  <button
                    type="button"
                    onClick={() => handleDownload('attendance')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg no-print cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF Absensi</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Santri</th>
                        <th className="px-4 py-3">Kelas</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Keluhan / Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.attendance.records.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{formatDateID(r.date)}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-900">{r.student_name}</div>
                            <div className="text-xs font-mono text-slate-500">{r.nis}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            <span className="uppercase font-semibold text-emerald-800">{r.class_type}</span> · {r.class_name}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-bold">
                            <span
                              className={
                                r.status === 'HADIR'
                                  ? 'text-emerald-800'
                                  : r.status === 'SAKIT'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{r.complaint || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: HEALTH (SAKIT & SEMBUH) */}
          {tab === 'health' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <SplitTitle
                      as="h2"
                      className="text-base font-bold text-slate-900"
                      text={`Laporan Santri Sakit Aktif (${report.health.active_count})`}
                    />
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kasus yang sedang dalam pemeriksaan, pengobatan, rujukan, atau pemantauan asrama.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload('health')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg no-print cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF Sakit & Sembuh</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Tgl Lapor</th>
                        <th className="px-4 py-3">Santri & Asrama</th>
                        <th className="px-4 py-3">Jenis Penyakit / Keparahan</th>
                        <th className="px-4 py-3">Keluhan & Tindakan Terakhir</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.health.sick_cases.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            Tidak ada santri sakit aktif saat ini.
                          </td>
                        </tr>
                      ) : (
                        report.health.sick_cases.map((hc) => (
                          <tr key={hc.id}>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                              {formatDateID(hc.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{hc.student_name}</div>
                              <div className="text-xs text-slate-500">{hc.dorm_room_name || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-700">
                              {hc.disease_type ? `${hc.disease_type} (${hc.severity || '-'})` : 'Menunggu pemeriksaan'}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              <div>{hc.initial_complaint}</div>
                              {hc.latest_action && (
                                <div className="text-slate-500 mt-0.5">Tindakan: {hc.latest_action}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">{healthStatusBadge(hc.current_status)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <SplitTitle
                    as="h2"
                    className="text-base font-bold text-slate-900"
                    text={`Riwayat Santri Telah Sembuh (${report.health.recovered_count})`}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Santri</th>
                        <th className="px-4 py-3">Jenis Penyakit</th>
                        <th className="px-4 py-3">Keluhan Awal</th>
                        <th className="px-4 py-3">Tgl Lapor</th>
                        <th className="px-4 py-3">Tgl Sembuh</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.health.recovered_cases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                            Belum ada riwayat santri sembuh.
                          </td>
                        </tr>
                      ) : (
                        report.health.recovered_cases.map((hc) => (
                          <tr key={hc.id}>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{hc.student_name}</div>
                              <div className="text-xs font-mono text-slate-500">{hc.nis}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-700">
                              {hc.disease_type ? `${hc.disease_type} (${hc.severity || '-'})` : '-'}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">{hc.initial_complaint}</td>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">{formatDateID(hc.created_at)}</td>
                            <td className="px-4 py-3 text-xs font-mono text-emerald-800">{formatDateID(hc.closed_at)}</td>
                            <td className="px-4 py-3">{healthStatusBadge(hc.current_status)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOG (Admin) */}
          {isAdmin && tab === 'audit' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <SplitTitle as="h2" className="text-base font-bold text-slate-900" text="Jejak Audit Sistem (Audit Log ORM)" />
                <p className="text-xs text-slate-500 mt-0.5">
                  Catatan otomatis setiap aktivitas autentikasi, keuangan, absensi, dan kesehatan.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Waktu</th>
                      <th className="px-4 py-3">Pengguna</th>
                      <th className="px-4 py-3">Modul</th>
                      <th className="px-4 py-3">Aksi</th>
                      <th className="px-4 py-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTimeID(log.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-semibold text-slate-900">{log.user_name}</div>
                          <div className="text-[11px] text-slate-500">{log.user_role}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium text-emerald-800">{log.module}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{log.action}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{log.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
      active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
);

const StatBox: React.FC<{ label: string; value: string; tone: 'emerald' | 'red' | 'amber' | 'slate' }> = ({
  label,
  value,
  tone,
}) => {
  const color =
    tone === 'emerald'
      ? 'text-emerald-800'
      : tone === 'red'
      ? 'text-red-700'
      : tone === 'amber'
      ? 'text-amber-800'
      : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1.5 text-xl font-bold font-mono tabular-nums ${color}`}>{value}</div>
    </div>
  );
};
