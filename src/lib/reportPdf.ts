import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateID, formatDateTimeID, formatRupiah } from './api';
import { AuthUser, ROLE_LABELS } from '../types';

export interface FullReportData {
  pondok: {
    name: string;
    address: string;
    phone: string;
    email: string;
    pengasuh: string;
  };
  generated_at: string;
  finance: {
    summary: {
      total_masuk: number;
      total_keluar: number;
      saldo_kas: number;
      total_tertagih: number;
      total_terbayar: number;
      total_tunggakan: number;
      lunas_count: number;
      belum_lunas_count: number;
    };
    cash_entries: {
      id: number;
      type: 'masuk' | 'keluar';
      category: string;
      description: string;
      amount: number;
      transaction_date: string;
      recorder_name?: string;
    }[];
    bills: {
      id: number;
      nis: string;
      student_name: string;
      title: string;
      total_amount: number;
      paid_amount: number;
      status: string;
      due_date: string;
    }[];
  } | null;
  academic: {
    summary: {
      total_grades: number;
      avg_score: number;
      total_achievements: number;
    };
    grades: {
      id: number;
      nis: string;
      student_name: string;
      class_name: string;
      class_type: string;
      subject: string;
      semester: string;
      score: number;
      predicate: string;
    }[];
    achievements: {
      id: number;
      nis: string;
      student_name: string;
      class_type: string;
      title: string;
      category: string;
      level: string;
      date: string;
    }[];
  } | null;
  attendance: {
    counts: { HADIR: number; IZIN: number; ALPHA: number; SAKIT: number };
    total: number;
    records: {
      id: number;
      date: string;
      nis: string;
      student_name: string;
      class_name: string;
      class_type: string;
      status: string;
      complaint: string;
    }[];
  };
  health: {
    active_count: number;
    recovered_count: number;
    sick_cases: {
      id: number;
      nis: string;
      student_name: string;
      dorm_room_name?: string;
      source: string;
      initial_complaint: string;
      disease_type: string;
      severity: string | null;
      current_status: string;
      latest_action?: string | null;
      latest_medicine?: string | null;
      created_at: string;
      updated_at: string;
    }[];
    recovered_cases: {
      id: number;
      nis: string;
      student_name: string;
      dorm_room_name?: string;
      source: string;
      initial_complaint: string;
      disease_type: string;
      severity: string | null;
      current_status: string;
      latest_action?: string | null;
      created_at: string;
      closed_at: string | null;
    }[];
  };
}

export type ReportPdfScope = 'all' | 'finance' | 'academic' | 'attendance' | 'health';

function getLastY(doc: jsPDF, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

function addSectionTitle(doc: jsPDF, y: number, title: string): number {
  if (y > 255) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 83, 45);
  doc.text(title, 14, y);
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y + 2, 196, y + 2);
  return y + 7;
}

export function downloadReportPdf(
  report: FullReportData,
  user: AuthUser,
  scope: ReportPdfScope = 'all'
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStamp = new Date().toISOString().slice(0, 10);

  // Header Lembaga
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(report.pondok.name.toUpperCase(), 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`${report.pondok.address} | Telp: ${report.pondok.phone}`, 14, 21);

  doc.setDrawColor(20, 83, 45);
  doc.setLineWidth(0.7);
  doc.line(14, 24, 196, 24);
  doc.setLineWidth(0.2);

  const scopeLabels: Record<ReportPdfScope, string> = {
    all: 'Laporan Terpadu Pondok (Keuangan, Akademik, Absensi, Kesehatan)',
    finance: 'Laporan Rangkuman Keuangan & Tagihan SPP',
    academic: 'Laporan Rangkuman Akademik & Prestasi Santri',
    attendance: 'Laporan Rekapitulasi Absensi Santri',
    health: 'Laporan Santri Sakit & Riwayat Sembuh',
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(scopeLabels[scope], 14, 31);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Dicetak oleh: ${user.full_name} (${ROLE_LABELS[user.role]})  |  Tanggal Cetak: ${formatDateTimeID(report.generated_at)}`,
    14,
    36
  );

  let y = 44;

  // 1. KEUANGAN
  if ((scope === 'all' || scope === 'finance') && report.finance) {
    y = addSectionTitle(doc, y, '1. Rangkuman Keuangan & Kas Pondok');

    const fs = report.finance.summary;
    autoTable(doc, {
      startY: y,
      head: [['Indikator Keuangan', 'Nilai']],
      body: [
        ['Total Kas Masuk', formatRupiah(fs.total_masuk)],
        ['Total Kas Keluar', formatRupiah(fs.total_keluar)],
        ['Saldo Kas Bersih', formatRupiah(fs.saldo_kas)],
        ['Total Tagihan Terbit', formatRupiah(fs.total_tertagih)],
        ['Total Tagihan Terbayar', formatRupiah(fs.total_terbayar)],
        ['Total Tunggakan Aktif', `${formatRupiah(fs.total_tunggakan)} (${fs.belum_lunas_count} tagihan belum lunas)`],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [20, 83, 45], textColor: 255 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = getLastY(doc, y) + 6;

    if (report.finance.cash_entries.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal']],
        body: report.finance.cash_entries.map((c) => [
          formatDateID(c.transaction_date),
          c.type === 'masuk' ? 'Kas Masuk' : 'Kas Keluar',
          c.category,
          c.description,
          `${c.type === 'masuk' ? '+' : '-'} ${formatRupiah(c.amount)}`,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: { 4: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
      y = getLastY(doc, y) + 8;
    }
  }

  // 2. AKADEMIK
  if ((scope === 'all' || scope === 'academic') && report.academic) {
    y = addSectionTitle(doc, y, '2. Rangkuman Akademik (Nilai & Prestasi Santri)');

    autoTable(doc, {
      startY: y,
      head: [['NIS', 'Nama Santri', 'Program / Kelas', 'Mata Pelajaran', 'Nilai', 'Predikat']],
      body:
        report.academic.grades.length > 0
          ? report.academic.grades.map((g) => [
              g.nis,
              g.student_name,
              `${g.class_type.toUpperCase()} - ${g.class_name}`,
              g.subject,
              String(g.score),
              g.predicate,
            ])
          : [['-', 'Belum ada data nilai tercatat', '-', '-', '-', '-']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [20, 83, 45], textColor: 255 },
      columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = getLastY(doc, y) + 6;

    if (report.academic.achievements.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Tanggal', 'Santri', 'Judul Prestasi', 'Kategori', 'Tingkat']],
        body: report.academic.achievements.map((a) => [
          formatDateID(a.date),
          a.student_name,
          a.title,
          a.category,
          a.level,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        margin: { left: 14, right: 14 },
      });
      y = getLastY(doc, y) + 8;
    }
  }

  // 3. ABSENSI
  if (scope === 'all' || scope === 'attendance') {
    y = addSectionTitle(doc, y, '3. Laporan Absensi Santri');

    const c = report.attendance.counts;
    autoTable(doc, {
      startY: y,
      head: [['Total Catatan', 'Hadir', 'Izin', 'Alpha', 'Sakit']],
      body: [[String(report.attendance.total), String(c.HADIR), String(c.IZIN), String(c.ALPHA), String(c.SAKIT)]],
      styles: { fontSize: 8.5, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: [20, 83, 45], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = getLastY(doc, y) + 5;

    autoTable(doc, {
      startY: y,
      head: [['Tanggal', 'NIS', 'Nama Santri', 'Kelas', 'Status', 'Keterangan / Keluhan']],
      body:
        report.attendance.records.length > 0
          ? report.attendance.records.map((r) => [
              formatDateID(r.date),
              r.nis,
              r.student_name,
              `${r.class_type.toUpperCase()} - ${r.class_name}`,
              r.status,
              r.complaint || '-',
            ])
          : [['-', '-', 'Belum ada data absensi', '-', '-', '-']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = getLastY(doc, y) + 8;
  }

  // 4. SAKIT & SEMBUH
  if (scope === 'all' || scope === 'health') {
    y = addSectionTitle(doc, y, '4. Laporan Santri Sakit (Aktif) & Riwayat Sembuh');

    autoTable(doc, {
      startY: y,
      head: [['Santri Sakit Aktif', 'Telah Sembuh', 'Total Kasus Tercatat']],
      body: [
        [
          String(report.health.active_count),
          String(report.health.recovered_count),
          String(report.health.active_count + report.health.recovered_count),
        ],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.5, halign: 'center' },
      headStyles: { fillColor: [20, 83, 45], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = getLastY(doc, y) + 5;

    autoTable(doc, {
      startY: y,
      head: [['Status', 'NIS / Nama Santri', 'Asrama', 'Jenis Sakit / Keparahan', 'Keluhan & Tindakan Terakhir', 'Tgl Lapor']],
      body:
        report.health.sick_cases.length > 0
          ? report.health.sick_cases.map((hc) => [
              hc.current_status,
              `${hc.student_name} (${hc.nis})`,
              hc.dorm_room_name || '-',
              hc.disease_type ? `${hc.disease_type} (${hc.severity || '-'})` : 'Menunggu pemeriksaan',
              `${hc.initial_complaint}${hc.latest_action ? ` | Tindakan: ${hc.latest_action}` : ''}`,
              formatDateID(hc.created_at),
            ])
          : [['-', 'Tidak ada santri sakit aktif saat ini', '-', '-', '-', '-']],
      styles: { fontSize: 7.8, cellPadding: 2 },
      headStyles: { fillColor: [185, 28, 28], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = getLastY(doc, y) + 6;

    autoTable(doc, {
      startY: y,
      head: [['Status', 'NIS / Nama Santri', 'Jenis Sakit', 'Keluhan Awal', 'Tgl Lapor', 'Tgl Sembuh']],
      body:
        report.health.recovered_cases.length > 0
          ? report.health.recovered_cases.map((hc) => [
              'Sembuh',
              `${hc.student_name} (${hc.nis})`,
              hc.disease_type ? `${hc.disease_type} (${hc.severity || '-'})` : '-',
              hc.initial_complaint,
              formatDateID(hc.created_at),
              formatDateID(hc.closed_at),
            ])
          : [['-', 'Belum ada riwayat kasus sembuh', '-', '-', '-', '-']],
      styles: { fontSize: 7.8, cellPadding: 2 },
      headStyles: { fillColor: [21, 128, 61], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Sistem Informasi Pondok Pesantren Tapak Sunan — Halaman ${i} dari ${pageCount}`,
      14,
      290
    );
  }

  const filenameMap: Record<ReportPdfScope, string> = {
    all: `Laporan-Lengkap-Tapak-Sunan-${dateStamp}.pdf`,
    finance: `Laporan-Keuangan-Tapak-Sunan-${dateStamp}.pdf`,
    academic: `Laporan-Akademik-Tapak-Sunan-${dateStamp}.pdf`,
    attendance: `Laporan-Absensi-Tapak-Sunan-${dateStamp}.pdf`,
    health: `Laporan-Kesehatan-Sakit-Sembuh-Tapak-Sunan-${dateStamp}.pdf`,
  };

  doc.save(filenameMap[scope]);
}
