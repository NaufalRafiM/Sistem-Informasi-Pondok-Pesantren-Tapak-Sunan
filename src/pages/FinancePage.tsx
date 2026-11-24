import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Plus,
  Printer,
  Receipt,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatDateID, formatDateTimeID, formatRupiah } from '../lib/api';
import { SplitTitle } from '../components/SplitTitle';
import { AuthUser, Bill, CashEntry, FeeConfig, Payment, PondokProfile } from '../types';
import { billStatusBadge, paymentStatusBadge } from '../components/StatusText';
import { TapakSunanLogo } from '../components/TapakSunanLogo';

interface FinancePageProps {
  user: AuthUser;
  onRefreshNotifications: () => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({ user, onRefreshNotifications }) => {
  const isAdmin = user.role === 'admin' || user.role === 'bendahara';
  const [tab, setTab] = useState<'bills' | 'verify' | 'cash' | 'config' | 'history'>(
    isAdmin ? 'verify' : 'bills'
  );
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [cashSummary, setCashSummary] = useState({ total_masuk: 0, total_keluar: 0, saldo: 0 });
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const [pondok, setPondok] = useState<PondokProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modals
  const [uploadBill, setUploadBill] = useState<Bill | null>(null);
  const [payMethod, setPayMethod] = useState<'transfer' | 'tunai'>('transfer');
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [submittingPay, setSubmittingPay] = useState(false);

  const [verifyTarget, setVerifyTarget] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [receiptData, setReceiptData] = useState<{ receipt: Payment & { bill_paid_amount: number; bill_status: string }; pondok: PondokProfile } | null>(null);

  // Admin Generate Bills
  const [genType, setGenType] = useState<'spp' | 'daftar_ulang'>('spp');
  const [genMonth, setGenMonth] = useState('2026-12');
  const [genTitle, setGenTitle] = useState('SPP Desember 2026');
  const [genDueDate, setGenDueDate] = useState('2026-12-10');

  // Admin Cash Entry
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashType, setCashType] = useState<'masuk' | 'keluar'>('keluar');
  const [cashCategory, setCashCategory] = useState('Operasional Pondok');
  const [cashDesc, setCashDesc] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashFile, setCashFile] = useState<File | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const reqs: Promise<unknown>[] = [
        apiFetch<{ bills: Bill[] }>('/finance/bills'),
        apiFetch<{ payments: Payment[] }>('/finance/payments'),
        apiFetch<{ fees: FeeConfig[] }>('/finance/fees'),
        apiFetch<{ profile: PondokProfile }>('/pondok'),
      ];
      if (isAdmin) {
        reqs.push(apiFetch<{ entries: CashEntry[]; summary: { total_masuk: number; total_keluar: number; saldo: number } }>('/finance/cash'));
      }
      const results = await Promise.all(reqs);
      setBills((results[0] as { bills: Bill[] }).bills);
      setPayments((results[1] as { payments: Payment[] }).payments);
      setFees((results[2] as { fees: FeeConfig[] }).fees);
      setPondok((results[3] as { profile: PondokProfile }).profile);
      if (isAdmin && results[4]) {
        const c = results[4] as { entries: CashEntry[]; summary: { total_masuk: number; total_keluar: number; saldo: number } };
        setCashEntries(c.entries);
        setCashSummary(c.summary);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [user.id]);

  // Wali Santri totals
  const totalBilled = bills.reduce((s, b) => s + b.total_amount, 0);
  const totalPaid = bills.reduce((s, b) => s + b.paid_amount, 0);
  const totalArrears = Math.max(0, totalBilled - totalPaid);
  const pendingPayments = payments.filter((p) => p.status === 'MENUNGGU_VERIFIKASI');

  async function handleUploadPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadBill) return;
    setSubmittingPay(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('bill_id', String(uploadBill.id));
      fd.append('method', payMethod);
      fd.append('amount', payAmount);
      fd.append('notes', payNotes);
      if (payFile) {
        fd.append('proof', payFile);
      }
      await apiFetch('/finance/payments', { method: 'POST', body: fd });
      setUploadBill(null);
      setPayFile(null);
      setPayNotes('');
      setFeedback({ type: 'ok', text: 'Bukti pembayaran berhasil dikirim dan berstatus Menunggu Verifikasi Bendahara / Admin.' });
      await loadAll();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mengirim pembayaran.' });
    } finally {
      setSubmittingPay(false);
    }
  }

  async function handleVerify(decision: 'DITERIMA' | 'DITOLAK') {
    if (!verifyTarget) return;
    setVerifying(true);
    setFeedback(null);
    try {
      await apiFetch(`/finance/payments/${verifyTarget.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, rejection_reason: rejectReason }),
      });
      setVerifyTarget(null);
      setRejectReason('');
      setFeedback({
        type: 'ok',
        text:
          decision === 'DITERIMA'
            ? 'Pembayaran diterima, status tagihan diperbarui, dan otomatis tercatat ke Kas Masuk.'
            : 'Pembayaran ditolak dengan alasan. Notifikasi penolakan telah dikirim ke Wali Santri.',
      });
      await loadAll();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal memverifikasi.' });
    } finally {
      setVerifying(false);
    }
  }

  async function handleOpenReceipt(paymentId: number) {
    try {
      const res = await apiFetch<{ receipt: Payment & { bill_paid_amount: number; bill_status: string }; pondok: PondokProfile }>(
        `/finance/payments/${paymentId}/receipt`
      );
      setReceiptData(res);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal memuat kuitansi.' });
    }
  }

  async function handleGenerateBills(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiFetch<{ created_count: number }>('/finance/bills/generate', {
        method: 'POST',
        body: JSON.stringify({
          fee_type: genType,
          period_month: genMonth,
          title: genTitle,
          due_date: genDueDate,
        }),
      });
      setFeedback({
        type: 'ok',
        text: `Berhasil menerbitkan ${res.created_count} tagihan baru dan mengirim notifikasi ke Wali Santri.`,
      });
      await loadAll();
      onRefreshNotifications();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menerbitkan tagihan.' });
    }
  }

  async function handleUpdateFee(fee: FeeConfig, newAmount: number, newTitle: string) {
    setFeedback(null);
    try {
      await apiFetch(`/finance/fees/${fee.fee_type}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: newTitle,
          amount: newAmount,
          academic_year: fee.academic_year,
          description: fee.description,
        }),
      });
      setFeedback({ type: 'ok', text: `Tarif ${newTitle} berhasil diperbarui.` });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal memperbarui tarif.' });
    }
  }

  async function handleCreateCash(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('type', cashType);
      fd.append('category', cashCategory);
      fd.append('description', cashDesc);
      fd.append('amount', cashAmount);
      fd.append('transaction_date', cashDate);
      if (cashFile) fd.append('attachment', cashFile);
      await apiFetch('/finance/cash', { method: 'POST', body: fd });
      setShowCashModal(false);
      setCashDesc('');
      setCashAmount('');
      setCashFile(null);
      setFeedback({ type: 'ok', text: 'Transaksi kas pondok berhasil dicatat.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mencatat kas.' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Segmented Navigation */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <SplitTitle
            as="h1"
            text={isAdmin ? 'Keuangan Pondok & Verifikasi SPP' : 'Tagihan SPP, Daftar Ulang & Pembayaran'}
            className="text-2xl font-bold text-slate-900"
          />
          <p className="text-sm text-slate-600 mt-1">
            {isAdmin
              ? 'Verifikasi bukti bayar wali santri, kelola kas masuk/keluar otomatis, dan atur biaya SPP.'
              : 'Pantau saldo tunggakan, biaya daftar ulang, unggah bukti pembayaran, dan unduh kuitansi resmi.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {isAdmin ? (
            <>
              <TabBtn active={tab === 'verify'} onClick={() => setTab('verify')}>
                Verifikasi ({pendingPayments.length})
              </TabBtn>
              <TabBtn active={tab === 'bills'} onClick={() => setTab('bills')}>
                Tagihan Santri
              </TabBtn>
              <TabBtn active={tab === 'cash'} onClick={() => setTab('cash')}>
                Kas Masuk & Keluar
              </TabBtn>
              <TabBtn active={tab === 'config'} onClick={() => setTab('config')}>
                Biaya & Terbit Tagihan
              </TabBtn>
            </>
          ) : (
            <>
              <TabBtn active={tab === 'bills'} onClick={() => setTab('bills')}>
                Tagihan Aktif
              </TabBtn>
              <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>
                Riwayat & Kuitansi
              </TabBtn>
            </>
          )}
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
          <button type="button" onClick={() => setFeedback(null)} className="text-xs font-semibold underline cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* Summary Strip */}
      {isAdmin ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Kas Masuk</div>
            <div className="mt-2 text-xl font-bold text-emerald-800 tabular-nums">{formatRupiah(cashSummary.total_masuk)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Kas Keluar</div>
            <div className="mt-2 text-xl font-bold text-red-700 tabular-nums">{formatRupiah(cashSummary.total_keluar)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Saldo Kas Bersih</div>
            <div className="mt-2 text-xl font-bold text-slate-900 tabular-nums">{formatRupiah(cashSummary.saldo)}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Tagihan</div>
            <div className="mt-2 text-xl font-bold text-slate-900 tabular-nums">{formatRupiah(totalBilled)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Total Terbayar</div>
            <div className="mt-2 text-xl font-bold text-emerald-800 tabular-nums">{formatRupiah(totalPaid)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">Saldo Tunggakan</div>
            <div className="mt-2 text-xl font-bold text-amber-800 tabular-nums">{formatRupiah(totalArrears)}</div>
          </div>
        </div>
      )}

      {/* Wali Santri Info Biaya Daftar Ulang & Rekening */}
      {!isAdmin && pondok && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-slate-900">Informasi Rekening Pembayaran & Biaya Pondok</div>
            <p className="text-xs text-slate-600 mt-1">
              Transfer ke <span className="font-semibold text-slate-900">{pondok.bank_name}</span> No. Rekening{' '}
              <span className="font-mono font-semibold text-slate-900">{pondok.bank_account}</span> a.n. {pondok.bank_holder}
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-xs">
            {fees.map((f) => (
              <div key={f.id}>
                <div className="text-slate-500">{f.title}</div>
                <div className="text-sm font-bold text-emerald-900 tabular-nums">{formatRupiah(f.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: VERIFICATION QUEUE (Admin) */}
      {isAdmin && tab === 'verify' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <SplitTitle as="h2" text="Antrian & Riwayat Verifikasi Pembayaran" className="text-base font-bold text-slate-900" />
              <p className="text-xs text-slate-500 mt-0.5">
                Menerima pembayaran akan otomatis mencatat pemasukan ke Kas Masuk dan menerbitkan kuitansi.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Santri / Wali</th>
                  <th className="px-4 py-3">Tagihan</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3">Bukti</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono whitespace-nowrap">{formatDateID(p.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{p.student_name}</div>
                      <div className="text-xs text-slate-500">{p.wali_name || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.bill_title}</td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-700">{p.method}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatRupiah(p.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {p.proof_file ? (
                        <a
                          href={p.proof_file}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Lihat Bukti</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Tanpa file</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{paymentStatusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.status === 'MENUNGGU_VERIFIKASI' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyTarget(p);
                            setRejectReason('');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                        >
                          Proses Verifikasi
                        </button>
                      ) : p.status === 'DITERIMA' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(p.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Kuitansi</span>
                        </button>
                      ) : (
                        <span className="text-xs text-red-700">{p.rejection_reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: BILLS (Admin & Wali Santri) */}
      {tab === 'bills' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <SplitTitle as="h2" text="Daftar Tagihan SPP & Daftar Ulang" className="text-base font-bold text-slate-900" />
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat data tagihan...</div>
          ) : bills.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Belum ada tagihan terdaftar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Santri</th>
                    <th className="px-4 py-3">Tagihan</th>
                    <th className="px-4 py-3">Jatuh Tempo</th>
                    <th className="px-4 py-3 text-right">Total Tagihan</th>
                    <th className="px-4 py-3 text-right">Terbayar</th>
                    <th className="px-4 py-3 text-right">Sisa</th>
                    <th className="px-4 py-3">Status</th>
                    {!isAdmin && <th className="px-4 py-3 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((b) => {
                    const remaining = Math.max(0, b.total_amount - b.paid_amount);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{b.student_name}</div>
                          <div className="text-xs text-slate-500 font-mono">{b.nis}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{b.title}</div>
                          {b.latest_payment_status === 'DITOLAK' && b.latest_rejection_reason && (
                            <div className="mt-1 text-xs text-red-700">
                              Ditolak: {b.latest_rejection_reason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">{formatDateID(b.due_date)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                          {formatRupiah(b.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-800">
                          {formatRupiah(b.paid_amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatRupiah(remaining)}
                        </td>
                        <td className="px-4 py-3">{billStatusBadge(b.status)}</td>
                        {!isAdmin && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {b.status !== 'LUNAS' && b.status !== 'MENUNGGU_VERIFIKASI' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadBill(b);
                                  setPayAmount(String(remaining));
                                  setPayMethod('transfer');
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>{b.latest_payment_status === 'DITOLAK' ? 'Unggah Ulang' : 'Bayar / Unggah Bukti'}</span>
                              </button>
                            ) : b.status === 'MENUNGGU_VERIFIKASI' ? (
                              <span className="text-xs text-amber-800 font-medium">Sedang diverifikasi</span>
                            ) : (
                              <span className="text-xs text-emerald-800 font-medium">Sudah Lunas</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: WALI SANTRI PAYMENT HISTORY & RECEIPTS */}
      {!isAdmin && tab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <SplitTitle as="h2" text="Riwayat Pembayaran & Unduh Kuitansi" className="text-base font-bold text-slate-900" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Santri</th>
                  <th className="px-4 py-3">Tagihan</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Kuitansi / Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{formatDateID(p.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.student_name}</td>
                    <td className="px-4 py-3 text-slate-700">{p.bill_title}</td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-600">{p.method}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatRupiah(p.amount)}
                    </td>
                    <td className="px-4 py-3">{paymentStatusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.status === 'DITERIMA' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(p.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Unduh Kuitansi</span>
                        </button>
                      ) : p.status === 'DITOLAK' ? (
                        <span className="text-xs text-red-700">{p.rejection_reason}</span>
                      ) : (
                        <span className="text-xs text-slate-500">Menunggu verifikasi Bendahara / Admin</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: CASH LEDGER (Admin) */}
      {isAdmin && tab === 'cash' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <SplitTitle as="h2" text="Buku Kas Masuk & Kas Keluar" className="text-base font-bold text-slate-900" />
              <p className="text-xs text-slate-500 mt-0.5">
                Pembayaran SPP yang diterima otomatis tercatat ke Kas Masuk.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCashModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Kas Manual</span>
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
                  <th className="px-4 py-3">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashEntries.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600">{formatDateID(c.transaction_date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          c.type === 'masuk' ? 'text-emerald-800' : 'text-red-700'
                        }`}
                      >
                        {c.type === 'masuk' ? 'Kas Masuk' : 'Kas Keluar'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{c.category}</td>
                    <td className="px-4 py-3 text-slate-600">{c.description}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                        c.type === 'masuk' ? 'text-emerald-800' : 'text-red-700'
                      }`}
                    >
                      {c.type === 'masuk' ? '+' : '-'} {formatRupiah(c.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.attachment_file ? (
                        <a href={c.attachment_file} target="_blank" rel="noreferrer" className="text-emerald-800 hover:underline">
                          Lihat Nota
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: FEE CONFIG & BILL GENERATOR (Admin) */}
      {isAdmin && tab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <SplitTitle as="h2" text="Atur Biaya SPP & Daftar Ulang" className="text-base font-bold text-slate-900" />
              <p className="text-xs text-slate-500 mt-0.5">Tarif acuan saat menerbitkan tagihan santri aktif.</p>
            </div>
            {fees.map((f) => (
              <FeeEditorCard key={f.id} fee={f} onSave={handleUpdateFee} />
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <SplitTitle as="h2" text="Terbitkan Tagihan Massal (Santri Aktif)" className="text-base font-bold text-slate-900" />
            <p className="text-xs text-slate-500 mt-0.5">
              Membuat tagihan otomatis untuk seluruh santri aktif & mengirim notifikasi ke Wali Santri.
            </p>
            <form onSubmit={handleGenerateBills} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Biaya</label>
                <select
                  value={genType}
                  onChange={(e) => setGenType(e.target.value as 'spp' | 'daftar_ulang')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="spp">SPP Bulanan</option>
                  <option value="daftar_ulang">Daftar Ulang Tahunan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Periode (YYYY-MM / Tahun Ajaran)</label>
                <input
                  type="text"
                  required
                  value={genMonth}
                  onChange={(e) => setGenMonth(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Judul Tagihan</label>
                <input
                  type="text"
                  required
                  value={genTitle}
                  onChange={(e) => setGenTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Jatuh Tempo</label>
                <input
                  type="date"
                  required
                  value={genDueDate}
                  onChange={(e) => setGenDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
              >
                Terbitkan Tagihan & Kirim Notifikasi
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: WALI UPLOAD BUKTI PEMBAYARAN */}
      {uploadBill && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Unggah Bukti Pembayaran</h3>
              <button type="button" onClick={() => setUploadBill(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 mb-4">
              <div className="font-semibold text-slate-900">{uploadBill.title} — {uploadBill.student_name}</div>
              <div className="text-slate-600">
                Sisa Tagihan: <span className="font-mono font-bold text-slate-900">{formatRupiah(uploadBill.total_amount - uploadBill.paid_amount)}</span>
              </div>
            </div>
            <form onSubmit={handleUploadPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Metode Pembayaran</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as 'transfer' | 'tunai')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="transfer">Transfer Bank (Unggah Bukti)</option>
                  <option value="tunai">Tunai (Serahkan ke Bendahara / Admin)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nominal Pembayaran (Rp)</label>
                <input
                  type="number"
                  min={10000}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  File Bukti Pembayaran {payMethod === 'transfer' ? '(Wajib JPG/PNG/PDF)' : '(Opsional)'}
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  required={payMethod === 'transfer'}
                  onChange={(e) => setPayFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Contoh: Transfer BSI a.n. Hendrawan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setUploadBill(null)} className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingPay}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                >
                  {submittingPay ? 'Mengirim...' : 'Kirim Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN VERIFY PAYMENT */}
      {verifyTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Verifikasi Pembayaran</h3>
              <button type="button" onClick={() => setVerifyTarget(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-sm border-b border-slate-200 pb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Santri</span>
                <span className="font-semibold text-slate-900">{verifyTarget.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tagihan</span>
                <span className="text-slate-900">{verifyTarget.bill_title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nominal Dibayar</span>
                <span className="font-mono font-bold text-emerald-900">{formatRupiah(verifyTarget.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Catatan Wali</span>
                <span className="text-slate-700">{verifyTarget.notes || '-'}</span>
              </div>
              {verifyTarget.proof_file && (
                <div className="pt-2">
                  <a
                    href={verifyTarget.proof_file}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:underline"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Buka Lampiran Bukti Pembayaran</span>
                  </a>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Alasan Penolakan (Wajib diisi jika memilih Tolak)
              </label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Nominal transfer tidak sesuai atau foto bukti buram"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                disabled={verifying}
                onClick={() => handleVerify('DITOLAK')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Tolak Pembayaran</span>
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={() => handleVerify('DITERIMA')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Terima & Catat Kas Masuk</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN ADD CASH ENTRY */}
      {showCashModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Catat Transaksi Kas Pondok</h3>
              <button type="button" onClick={() => setShowCashModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCash} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Transaksi</label>
                <select
                  value={cashType}
                  onChange={(e) => setCashType(e.target.value as 'masuk' | 'keluar')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="keluar">Kas Keluar</option>
                  <option value="masuk">Kas Masuk</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Kategori</label>
                <input
                  type="text"
                  required
                  value={cashCategory}
                  onChange={(e) => setCashCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Keterangan</label>
                <input
                  type="text"
                  required
                  value={cashDesc}
                  onChange={(e) => setCashDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nominal (Rp)</label>
                  <input
                    type="number"
                    required
                    min={1000}
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={cashDate}
                    onChange={(e) => setCashDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Lampiran Nota (Opsional)</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => setCashFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCashModal(false)} className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer">
                  Simpan Kas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: KUITANSI RESMI */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-xl w-full p-8">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <TapakSunanLogo className="w-11 h-11" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">{receiptData.pondok.name}</h3>
                  <p className="text-xs text-slate-500">{receiptData.pondok.address}</p>
                </div>
              </div>
              <button type="button" onClick={() => setReceiptData(null)} className="text-slate-400 hover:text-slate-700 no-print cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Kuitansi Pembayaran Resmi</div>
                <div className="text-base font-bold font-mono text-slate-900">{receiptData.receipt.receipt_no}</div>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>Tanggal Verifikasi</div>
                <div className="font-mono font-medium text-slate-900">{formatDateTimeID(receiptData.receipt.verified_at)}</div>
              </div>
            </div>

            <div className="mt-5 border border-slate-200 rounded-lg divide-y divide-slate-100 text-sm">
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Nama Santri / NIS</span>
                <span className="font-semibold text-slate-900">{receiptData.receipt.student_name} ({receiptData.receipt.nis})</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Wali Santri</span>
                <span className="text-slate-900">{receiptData.receipt.wali_name || '-'}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Untuk Pembayaran</span>
                <span className="font-medium text-slate-900">{receiptData.receipt.bill_title}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Metode & Status Tagihan</span>
                <span className="text-slate-900 capitalize">{receiptData.receipt.method} · {receiptData.receipt.bill_status}</span>
              </div>
              <div className="px-4 py-3 flex justify-between bg-emerald-50/60">
                <span className="font-semibold text-emerald-900">Jumlah Diterima</span>
                <span className="font-mono font-bold text-lg text-emerald-900 tabular-nums">
                  {formatRupiah(receiptData.receipt.amount)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
              <span>Diverifikasi oleh: {receiptData.receipt.verifier_name || 'Bendahara Pondok'}</span>
              <div className="flex gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / Simpan PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
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

const FeeEditorCard: React.FC<{
  fee: FeeConfig;
  onSave: (fee: FeeConfig, amount: number, title: string) => Promise<void>;
}> = ({ fee, onSave }) => {
  const [title, setTitle] = useState(fee.title);
  const [amount, setAmount] = useState(String(fee.amount));
  const [saving, setSaving] = useState(false);

  return (
    <div className="p-4 border border-slate-200 rounded-lg space-y-3">
      <div className="text-xs font-semibold text-emerald-800 uppercase">{fee.fee_type.replace('_', ' ')}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{fee.description}</span>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(fee, Number(amount), title);
            setSaving(false);
          }}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shrink-0 cursor-pointer"
        >
          Simpan Tarif
        </button>
      </div>
    </div>
  );
};
