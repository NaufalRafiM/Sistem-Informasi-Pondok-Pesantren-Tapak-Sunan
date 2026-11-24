import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  Landmark,
  Mail,
  MapPin,
  Pencil,
  Phone,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AuthUser, PondokProfile } from '../types';
import { TapakSunanLogo } from '../components/TapakSunanLogo';
import { PondokLocationMap } from '../components/PondokLocationMap';
import { SplitTitle } from '../components/SplitTitle';

export const PondokProfilePage: React.FC<{ user: AuthUser }> = ({ user }) => {
  const isAdmin = user.role === 'admin';
  const [profile, setProfile] = useState<PondokProfile | null>(null);
  const [form, setForm] = useState<PondokProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    apiFetch<{ profile: PondokProfile }>('/pondok').then((res) => {
      setProfile(res.profile);
      setForm(res.profile);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await apiFetch<{ profile: PondokProfile }>('/pondok', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setProfile(res.profile);
      setForm(res.profile);
      setEditing(false);
      setSavedMsg('Profil Pondok Pesantren Tapak Sunan berhasil diperbarui.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile || !form) {
    return (
      <div className="p-10 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">
        Memuat profil pondok...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <SplitTitle
            as="h1"
            text={isAdmin ? 'Profil Pondok Pesantren' : 'Informasi Pondok Pesantren Tapak Sunan'}
            className="text-2xl font-bold text-slate-900"
          />
          <p className="text-sm text-slate-600 mt-1">
            Profil resmi, sejarah pendirian, jenjang pendidikan, lokasi, serta informasi pendaftaran dan rekening pondok.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setForm(profile);
              setEditing((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg self-start whitespace-nowrap shrink-0 cursor-pointer"
          >
            {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            <span>{editing ? 'Tutup Editor' : 'Ubah Profil Pondok'}</span>
          </button>
        )}
      </div>

      {savedMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedMsg}</span>
          </span>
          <button type="button" onClick={() => setSavedMsg('')} className="text-xs font-semibold underline cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* Admin Edit Mode */}
      {isAdmin && editing && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <SplitTitle as="h2" text="Perbarui Informasi Resmi Pondok" className="text-base font-bold text-slate-900" />
            <p className="text-xs text-slate-500 mt-0.5">Perubahan akan langsung tampil bagi seluruh pengurus dan wali santri.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pondok</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pendiri / Pengasuh</label>
              <input
                type="text"
                value={form.pengasuh}
                onChange={(e) => setForm({ ...form, pengasuh: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Tagline Singkat</label>
              <input
                type="text"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Tentang Pondok Pesantren</label>
              <textarea
                rows={3}
                value={form.about}
                onChange={(e) => setForm({ ...form, about: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-emerald-900 mb-3">Sejarah dan Asal-Usul Nama</div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cikal Bakal</label>
                  <textarea
                    rows={2}
                    value={form.history_cikal_bakal}
                    onChange={(e) => setForm({ ...form, history_cikal_bakal: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pendirian</label>
                  <textarea
                    rows={2}
                    value={form.history_pendirian}
                    onChange={(e) => setForm({ ...form, history_pendirian: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Arti Nama</label>
                  <textarea
                    rows={2}
                    value={form.history_arti_nama}
                    onChange={(e) => setForm({ ...form, history_arti_nama: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-emerald-900 mb-3">Pendidikan dan Ciri Khas</div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenjang Pendidikan</label>
                  <textarea
                    rows={2}
                    value={form.edu_jenjang}
                    onChange={(e) => setForm({ ...form, edu_jenjang: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kurikulum & Nilai</label>
                  <textarea
                    rows={2}
                    value={form.edu_kurikulum}
                    onChange={(e) => setForm({ ...form, edu_kurikulum: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kegiatan Santri</label>
                  <textarea
                    rows={2}
                    value={form.edu_kegiatan}
                    onChange={(e) => setForm({ ...form, edu_kegiatan: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-emerald-900 mb-3">Lokasi, Pendaftaran (SPMB) & Kontak</div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Lengkap</label>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Informasi Pendaftaran (SPMB)</label>
              <input
                type="text"
                value={form.spmb_info}
                onChange={(e) => setForm({ ...form, spmb_info: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Telepon</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bank</label>
              <input
                type="text"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">No. Rekening</label>
              <input
                type="text"
                value={form.bank_account}
                onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Atas Nama Rekening</label>
              <input
                type="text"
                value={form.bank_holder}
                onChange={(e) => setForm({ ...form, bank_holder: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
            >
              {saving ? 'Menyimpan...' : 'Simpan Perubahan Profil'}
            </button>
          </div>
        </form>
      )}

      {/* Primary Profile Header & Overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5 pb-6 border-b border-slate-200">
          <div className="w-20 h-20 rounded-xl border border-slate-200 p-2 bg-white shrink-0">
            <TapakSunanLogo className="w-full h-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-emerald-800">
              Pesantren Salafiyah · Berdiri Tahun 1990 · Condet, Jakarta Timur
            </div>
            <SplitTitle as="h2" text={profile.name} className="text-xl lg:text-2xl font-bold text-slate-900 mt-1" />
            <p className="text-sm text-slate-700 mt-2 leading-relaxed max-w-3xl">{profile.about}</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
              <span>
                Pendiri: <strong className="text-slate-900">{profile.pengasuh}</strong>
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {profile.phone}
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-slate-300">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {profile.email}
              </span>
            </div>
          </div>
        </div>

        {/* Two-Column Editorial Split: Sejarah & Pendidikan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
          {/* Sejarah dan Asal-Usul Nama */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Landmark className="w-4 h-4 text-emerald-800 shrink-0" />
              <SplitTitle as="h3" text="Sejarah dan Asal-Usul Nama" className="text-base font-bold" />
            </div>
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="py-3 first:pt-0">
                <dt className="text-xs font-semibold text-emerald-900">Cikal Bakal</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed">{profile.history_cikal_bakal}</dd>
              </div>
              <div className="py-3">
                <dt className="text-xs font-semibold text-emerald-900">Pendirian</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed">{profile.history_pendirian}</dd>
              </div>
              <div className="py-3 last:pb-0">
                <dt className="text-xs font-semibold text-emerald-900">Arti Nama</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed">{profile.history_arti_nama}</dd>
              </div>
            </dl>
          </section>

          {/* Pendidikan dan Ciri Khas */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <BookOpen className="w-4 h-4 text-emerald-800 shrink-0" />
              <SplitTitle as="h3" text="Pendidikan dan Ciri Khas" className="text-base font-bold" />
            </div>
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="py-3 first:pt-0">
                <dt className="text-xs font-semibold text-emerald-900">Jenjang Pendidikan</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed">{profile.edu_jenjang}</dd>
              </div>
              <div className="py-3">
                <dt className="text-xs font-semibold text-emerald-900">Kurikulum & Nilai</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed">{profile.edu_kurikulum}</dd>
              </div>
              <div className="py-3 last:pb-0">
                <dt className="text-xs font-semibold text-emerald-900">Kegiatan Santri</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed">{profile.edu_kegiatan}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {/* Bottom Row: Lokasi & SPMB + Rekening Pembayaran */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <MapPin className="w-4 h-4 text-emerald-800 shrink-0" />
            <SplitTitle as="h3" text="Lokasi dan Informasi Umum" className="text-base font-bold" />
          </div>
          <div className="divide-y divide-slate-100 text-sm">
            <div className="py-3 first:pt-0">
              <div className="text-xs font-semibold text-slate-500">Alamat Lengkap</div>
              <div className="mt-1 text-slate-900 font-medium leading-relaxed">{profile.address}</div>
            </div>
            <div className="py-3 flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-slate-500">Informasi Pendaftaran Santri Baru</div>
                <div className="mt-1 font-semibold text-emerald-900">{profile.spmb_info}</div>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 mb-2">Peta Lokasi Pondok Pesantren</div>
            <PondokLocationMap name={profile.name} address={profile.address} />
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900">
            <Building2 className="w-4 h-4 text-emerald-800 shrink-0" />
            <SplitTitle as="h3" text="Rekening Resmi Pembayaran SPP & Daftar Ulang" className="text-base font-bold" />
          </div>
          <div className="divide-y divide-slate-100 text-sm">
            <div className="py-2.5 flex justify-between gap-3">
              <span className="text-slate-500">Nama Bank</span>
              <span className="font-semibold text-slate-900 text-right">{profile.bank_name}</span>
            </div>
            <div className="py-2.5 flex justify-between gap-3">
              <span className="text-slate-500">Nomor Rekening</span>
              <span className="font-mono font-bold text-emerald-900 tabular-nums">{profile.bank_account}</span>
            </div>
            <div className="py-2.5 flex justify-between gap-3">
              <span className="text-slate-500">Atas Nama</span>
              <span className="font-medium text-slate-900 text-right">{profile.bank_holder}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
