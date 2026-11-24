import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  Home,
  Users,
  Wallet,
} from 'lucide-react';
import { SplitTitle } from '../components/SplitTitle';
import { apiFetch, formatDateTimeID, formatRupiah } from '../lib/api';
import { AuthUser, NotificationItem, ROLE_LABELS } from '../types';
import { NavSection } from '../components/DashboardLayout';

interface OverviewPageProps {
  user: AuthUser;
  onNavigate: (sec: NavSection) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ user, onNavigate }) => {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<Record<string, unknown>>('/reports/overview'),
      apiFetch<{ notifications: NotificationItem[] }>('/notifications'),
    ])
      .then(([rep, notifs]) => {
        setData(rep);
        setNotifications(notifs.notifications.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, [user.id]);

  const kpis = (data?.kpis as Record<string, number>) || {};

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800">
            {ROLE_LABELS[user.role]} · Pondok Pesantren Tapak Sunan
          </p>
          <SplitTitle
            as="h1"
            text={`Ahlan wa Sahlan, ${user.full_name}`}
            className="text-2xl font-bold text-slate-900 mt-1 text-balance"
          />
          <p className="text-sm text-slate-600 mt-1">
            Ringkasan operasional dan status terbaru sesuai hak akses peran Anda.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          {(user.role === 'admin' || user.role === 'bendahara') && (
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>Verifikasi Pembayaran</span>
            </button>
          )}
          {user.role === 'wali_santri' && (
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>Lihat Tagihan & Bayar</span>
            </button>
          )}
          {(user.role === 'wali_salaf' || user.role === 'wali_sekolah' || user.role === 'wali_kelas') && (
            <button
              type="button"
              onClick={() => onNavigate('classwork')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Catat Absensi Kelas</span>
            </button>
          )}
          {user.role === 'pembina_asrama' && (
            <button
              type="button"
              onClick={() => onNavigate('health')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <HeartPulse className="w-4 h-4" />
              <span>Tindak Lanjuti Santri Sakit</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {user.role === 'admin' && (
            <>
              <KpiCard
                title="Santri Aktif"
                value={String(kpis.active_students ?? 0)}
                sub="Terdaftar di sistem pondok"
                icon={<Users className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('master')}
              />
              <KpiCard
                title="Menunggu Verifikasi"
                value={String(kpis.pending_payments ?? 0)}
                sub="Bukti pembayaran SPP / daftar ulang"
                icon={<AlertCircle className="w-4 h-4 text-amber-700" />}
                onClick={() => onNavigate('finance')}
              />
              <KpiCard
                title="Saldo Kas Pondok"
                value={formatRupiah(kpis.saldo_kas)}
                sub={`Masuk ${formatRupiah(kpis.total_masuk)}`}
                icon={<Wallet className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('finance')}
              />
              <KpiCard
                title="Santri Sakit Aktif"
                value={String(kpis.active_health_cases ?? 0)}
                sub="Dalam pemantauan UKP/Asrama"
                icon={<HeartPulse className="w-4 h-4 text-red-700" />}
                onClick={() => onNavigate('health')}
              />
            </>
          )}

          {user.role === 'bendahara' && (
            <>
              <KpiCard
                title="Menunggu Verifikasi"
                value={String(kpis.pending_payments ?? 0)}
                sub="Bukti pembayaran SPP / daftar ulang"
                icon={<AlertCircle className="w-4 h-4 text-amber-700" />}
                onClick={() => onNavigate('finance')}
              />
              <KpiCard
                title="Saldo Kas Pondok"
                value={formatRupiah(kpis.saldo_kas)}
                sub={`Masuk ${formatRupiah(kpis.total_masuk)} · Keluar ${formatRupiah(kpis.total_keluar)}`}
                icon={<Wallet className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('finance')}
              />
              <KpiCard
                title="Total Tunggakan"
                value={formatRupiah(kpis.total_tunggakan)}
                sub={`${kpis.unpaid_bills ?? 0} tagihan belum lunas`}
                icon={<AlertCircle className="w-4 h-4 text-red-700" />}
                onClick={() => onNavigate('finance')}
              />
              <KpiCard
                title="Santri Aktif"
                value={String(kpis.active_students ?? 0)}
                sub="Penerima tagihan bulanan"
                icon={<Users className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('reports')}
              />
            </>
          )}

          {user.role === 'wali_santri' && (
            <>
              <KpiCard
                title="Jumlah Anak"
                value={String(kpis.children_count ?? 0)}
                sub="Santri aktif di Tapak Sunan"
                icon={<Users className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('wali_academic')}
              />
              <KpiCard
                title="Total Sudah Dibayar"
                value={formatRupiah(kpis.total_paid)}
                sub="Terverifikasi oleh bendahara"
                icon={<CheckCircle2 className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('finance')}
              />
              <KpiCard
                title="Sisa Tunggakan"
                value={formatRupiah(kpis.tunggakan)}
                sub={`${kpis.unpaid_count ?? 0} tagihan belum lunas`}
                icon={<Wallet className="w-4 h-4 text-amber-700" />}
                onClick={() => onNavigate('finance')}
              />
              <KpiCard
                title="Pantau Kesehatan Anak"
                value={String(kpis.active_health_cases ?? 0)}
                sub="Kasus kesehatan aktif"
                icon={<HeartPulse className="w-4 h-4 text-red-700" />}
                onClick={() => onNavigate('health')}
              />
            </>
          )}

          {(user.role === 'wali_salaf' || user.role === 'wali_sekolah' || user.role === 'wali_kelas') && (
            <>
              <KpiCard
                title="Kelas Diampu"
                value={String(kpis.class_count ?? 0)}
                sub={
                  (kpis.salaf_class_count ?? 0) > 0 && (kpis.sekolah_class_count ?? 0) > 0
                    ? `${kpis.salaf_class_count} Salaf · ${kpis.sekolah_class_count} Sekolah`
                    : user.role === 'wali_salaf' || (kpis.salaf_class_count ?? 0) > 0
                    ? 'Kelas Kitab Salaf'
                    : user.role === 'wali_sekolah' || (kpis.sekolah_class_count ?? 0) > 0
                    ? 'Kelas Sekolah Formal'
                    : 'Belum ada kelas ditugaskan'
                }
                icon={<ClipboardCheck className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('classwork')}
              />
              <KpiCard
                title="Santri Kelas"
                value={String(kpis.student_count ?? 0)}
                sub="Santri aktif binaan"
                icon={<Users className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('classwork')}
              />
              <KpiCard
                title="Rata-rata Nilai"
                value={String(kpis.avg_score ?? 0)}
                sub="Skala 0 - 100 semester berjalan"
                icon={<CheckCircle2 className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('classwork')}
              />
              <KpiCard
                title="Kasus Sakit Aktif"
                value={String(kpis.active_health_cases ?? 0)}
                sub="Termasuk laporan dari absensi"
                icon={<HeartPulse className="w-4 h-4 text-red-700" />}
                onClick={() => onNavigate('health')}
              />
            </>
          )}

          {user.role === 'pembina_asrama' && (
            <>
              <KpiCard
                title="Kamar Binaan"
                value={String(kpis.room_count ?? 0)}
                sub={`Kapasitas ${kpis.total_capacity ?? 0} tempat tidur`}
                icon={<Home className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('dormitory')}
              />
              <KpiCard
                title="Penghuni Asrama"
                value={String(kpis.occupant_count ?? 0)}
                sub="Santri mukim aktif"
                icon={<Users className="w-4 h-4 text-emerald-800" />}
                onClick={() => onNavigate('dormitory')}
              />
              <KpiCard
                title="Perlu Ditindaklanjuti"
                value={String(kpis.pending_triage ?? 0)}
                sub="Data sakit dari absensi/laporan"
                icon={<AlertCircle className="w-4 h-4 text-red-700" />}
                onClick={() => onNavigate('health')}
              />
              <KpiCard
                title="Kasus Sakit Aktif"
                value={String(kpis.active_health_cases ?? 0)}
                sub="Sedang ditangani hingga sembuh"
                icon={<HeartPulse className="w-4 h-4 text-amber-700" />}
                onClick={() => onNavigate('health')}
              />
            </>
          )}
        </div>
      )}

      {/* Two-Column Operational Split: Quick Use Case Shortcuts & Recent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <SplitTitle as="h2" text="Akses Cepat Menu Peran" className="text-base font-bold text-slate-900" />
            <p className="text-xs text-slate-500 mt-1">
              Fitur sesuai diagram Use Case untuk {ROLE_LABELS[user.role]}
            </p>
            <div className="mt-5 space-y-2.5">
              {getShortcuts(user.role).map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  onClick={() => onNavigate(sc.target)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left rounded-lg border border-slate-200 hover:border-emerald-700 hover:bg-emerald-50/40 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{sc.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{sc.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <SplitTitle as="h2" text="Notifikasi Terbaru" className="text-base font-bold text-slate-900" />
              <p className="text-xs text-slate-500 mt-0.5">
                Pemberitahuan otomatis tagihan, verifikasi SPP, dan status kesehatan santri
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap cursor-pointer"
            >
              Lihat Semua
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
              Belum ada notifikasi untuk akun Anda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div key={n.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Bell className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {n.title}{' '}
                          {n.is_read === 0 && (
                            <span className="text-xs font-medium text-amber-700">· Baru</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.message}</p>
                        <div className="text-[11px] text-slate-400 mt-1 font-mono">
                          {n.category} · {formatDateTimeID(n.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ title, value, sub, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left bg-white border border-slate-200 hover:border-emerald-700 rounded-xl p-5 transition-colors cursor-pointer flex flex-col justify-between"
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-slate-600">{title}</span>
      {icon}
    </div>
    <div className="mt-3 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
    <div className="mt-1 text-xs text-slate-500 truncate">{sub}</div>
  </button>
);

function getShortcuts(role: AuthUser['role']): { label: string; desc: string; target: NavSection }[] {
  switch (role) {
    case 'admin':
      return [
        { label: 'Verifikasi Pembayaran & Kas', desc: 'Terima/tolak bukti transfer & catat kas masuk/keluar', target: 'finance' },
        { label: 'Kelola Santri, Kelas & Akun', desc: 'Data master santri, wali, kelas salaf & sekolah, serta akun pengguna', target: 'master' },
        { label: 'Kelola Absensi, Nilai & Prestasi', desc: 'Akses langsung manajemen kelas salaf & sekolah formal seluruh pondok', target: 'classwork' },
        { label: 'Lihat Seluruh Laporan', desc: 'Rekap keuangan, tunggakan, akademik, kesehatan, dan audit log', target: 'reports' },
      ];
    case 'bendahara':
      return [
        { label: 'Verifikasi Pembayaran & Kas', desc: 'Terima/tolak bukti bayar wali, kelola kas masuk/keluar & terbit tagihan', target: 'finance' },
        { label: 'Laporan Keuangan & Ekspor PDF', desc: 'Rekap arus kas pondok, tunggakan SPP & cetak laporan resmi', target: 'reports' },
        { label: 'Profil & Rekening Pondok', desc: 'Lihat informasi rekening resmi dan profil Pondok Pesantren Tapak Sunan', target: 'pondok' },
      ];
    case 'wali_santri':
      return [
        { label: 'Tagihan SPP & Unggah Bukti Bayar', desc: 'Cek tagihan, biaya daftar ulang, riwayat, dan unduh kuitansi', target: 'finance' },
        { label: 'Info Akademik & Profil Anak', desc: 'Nilai salaf, nilai sekolah, prestasi, dan rekap absensi anak', target: 'wali_academic' },
        { label: 'Pantau Kesehatan & Penanganan', desc: 'Lihat timeline status penanganan dan riwayat kesehatan anak', target: 'health' },
      ];
    case 'wali_salaf':
    case 'wali_sekolah':
    case 'wali_kelas':
      return [
        { label: 'Catat Absensi & Lapor Santri Sakit', desc: 'Absensi harian otomatis membuat kasus sakit jika status SAKIT', target: 'classwork' },
        { label: 'Kelola Nilai Pelajaran & Prestasi', desc: 'Input nilai ujian kitab/sekolah dan prestasi santri kelas', target: 'classwork' },
        { label: 'Lihat Laporan Kelas', desc: 'Rekap absensi, rata-rata nilai, dan daftar prestasi santri', target: 'reports' },
      ];
    case 'pembina_asrama':
      return [
        { label: 'Tindak Lanjuti Santri Sakit', desc: 'Tarik data sakit dari absensi, catat jenis penyakit, update status hingga sembuh', target: 'health' },
        { label: 'Kelola Kamar & Kondisi Santri', desc: 'Penempatan kamar asrama dan pantau kondisi harian santri', target: 'dormitory' },
        { label: 'Lihat Laporan Asrama', desc: 'Rekap okupansi kamar dan pemantauan kesehatan asrama', target: 'reports' },
      ];
  }
}
