import React from 'react';
import { AlertCircle, CheckCircle2, Clock, XCircle, Stethoscope } from 'lucide-react';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_MAP: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const StatusLabel: React.FC<{
  label: string;
  tone: Tone;
  icon?: 'check' | 'clock' | 'alert' | 'x' | 'health';
}> = ({ label, tone, icon }) => {
  const IconComp =
    icon === 'check'
      ? CheckCircle2
      : icon === 'clock'
      ? Clock
      : icon === 'alert'
      ? AlertCircle
      : icon === 'x'
      ? XCircle
      : icon === 'health'
      ? Stethoscope
      : null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${TONE_MAP[tone]}`}
    >
      {IconComp && <IconComp className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </span>
  );
};

export function billStatusBadge(status: string) {
  switch (status) {
    case 'LUNAS':
      return <StatusLabel label="Lunas" tone="success" icon="check" />;
    case 'SEBAGIAN':
      return <StatusLabel label="Dibayar Sebagian" tone="info" icon="clock" />;
    case 'MENUNGGU_VERIFIKASI':
      return <StatusLabel label="Menunggu Verifikasi" tone="warning" icon="clock" />;
    default:
      return <StatusLabel label="Belum Bayar" tone="danger" icon="alert" />;
  }
}

export function paymentStatusBadge(status: string) {
  switch (status) {
    case 'DITERIMA':
      return <StatusLabel label="Diterima" tone="success" icon="check" />;
    case 'DITOLAK':
      return <StatusLabel label="Ditolak" tone="danger" icon="x" />;
    default:
      return <StatusLabel label="Menunggu Verifikasi" tone="warning" icon="clock" />;
  }
}

export function healthStatusBadge(status: string) {
  switch (status) {
    case 'Sembuh':
      return <StatusLabel label="Sembuh (Selesai)" tone="success" icon="check" />;
    case 'Dilaporkan':
      return <StatusLabel label="Perlu Ditindaklanjuti" tone="danger" icon="alert" />;
    case 'Diperiksa':
      return <StatusLabel label="Diperiksa" tone="info" icon="health" />;
    case 'Istirahat/Obat':
      return <StatusLabel label="Istirahat / Obat" tone="warning" icon="health" />;
    case 'Dirujuk':
      return <StatusLabel label="Dirujuk" tone="danger" icon="health" />;
    case 'Dijemput Wali':
      return <StatusLabel label="Dijemput Wali" tone="neutral" icon="clock" />;
    default:
      return <StatusLabel label={status} tone="neutral" />;
  }
}
