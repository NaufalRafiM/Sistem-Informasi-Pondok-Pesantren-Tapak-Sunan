import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { apiFetch, formatDateTimeID } from '../lib/api';
import { NotificationItem } from '../types';
import { SplitTitle } from '../components/SplitTitle';

export const NotificationsPage: React.FC<{ onRefreshCount: () => void }> = ({ onRefreshCount }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>('/notifications');
      setItems(res.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(id: number) {
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
    await load();
    onRefreshCount();
  }

  async function markAllRead() {
    await apiFetch('/notifications/read-all', { method: 'PATCH' });
    await load();
    onRefreshCount();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <SplitTitle as="h1" className="text-2xl font-bold text-slate-900" text="Pusat Notifikasi" />
          <p className="text-sm text-slate-600 mt-1">
            Pemberitahuan otomatis tagihan SPP, verifikasi/penolakan pembayaran, dan status kesehatan santri.
          </p>
        </div>

        <button
          type="button"
          onClick={markAllRead}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg self-start cursor-pointer"
        >
          <CheckCheck className="w-4 h-4 text-emerald-800" />
          <span>Tandai Semua Sudah Dibaca</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Memuat notifikasi...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Belum ada notifikasi.</div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`p-5 flex items-start justify-between gap-4 ${
                n.is_read === 0 ? 'bg-emerald-50/40' : 'bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <Bell className={`w-4 h-4 mt-1 shrink-0 ${n.is_read === 0 ? 'text-emerald-800' : 'text-slate-400'}`} />
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {n.title}{' '}
                    {n.is_read === 0 && <span className="text-xs font-semibold text-amber-700">· Belum dibaca</span>}
                  </div>
                  <p className="text-sm text-slate-700 mt-1 leading-relaxed">{n.message}</p>
                  <div className="text-xs font-mono text-slate-400 mt-1.5">
                    {n.category.toUpperCase()} · {formatDateTimeID(n.created_at)}
                  </div>
                </div>
              </div>
              {n.is_read === 0 && (
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Tandai Dibaca
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
