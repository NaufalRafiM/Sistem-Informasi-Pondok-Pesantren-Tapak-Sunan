import React, { useCallback, useEffect, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, ExternalLink, Loader2, MapPin } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ResolvedLocation {
  lat: number;
  lng: number;
  title: string;
  formattedAddress: string;
  attributions?: Array<{ provider?: string | null; providerURI?: string | null }>;
}

interface PondokLocationMapProps {
  name: string;
  address: string;
}

const LIBRARIES: ('places' | 'marker')[] = ['places', 'marker'];

function isQuotaError(err: unknown): boolean {
  const text = String(err ?? '');
  return (
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('429') ||
    text.includes('QuotaExceededError') ||
    text.includes('OverQuotaMapError')
  );
}

const MapContent: React.FC<PondokLocationMapProps> = ({ name, address }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const apiStatus = useApiLoadingStatus();
  const [markerRef, marker] = useAdvancedMarkerRef();

  const [resolved, setResolved] = useState<ResolvedLocation | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);

  useEffect(() => {
    if (apiStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      setErrorMsg('Layanan peta belum dapat dimuat karena batas kuota atau otorisasi API.');
      setLoadingLocation(false);
    } else if (apiStatus === APILoadingStatus.FAILED) {
      setErrorMsg('Gagal memuat Google Maps JavaScript API.');
      setLoadingLocation(false);
    }
  }, [apiStatus]);

  useEffect(() => {
    let cancelled = false;

    async function resolveLocation() {
      if (!placesLib || !address.trim()) return;
      setLoadingLocation(true);
      setErrorMsg(null);

      try {
        // 1. Cari via Places API (New) Place.searchByText menggunakan nama + alamat pondok
        const queries = [`${name}, ${address}`, address];
        type SearchPlace = Awaited<ReturnType<typeof placesLib.Place.searchByText>>['places'][number];
        let matchedPlace: SearchPlace | undefined;

        for (const q of queries) {
          const response = await placesLib.Place.searchByText({
            textQuery: q,
            fields: ['id', 'displayName', 'formattedAddress', 'location', 'viewport'],
            language: 'id',
            region: 'id',
            maxResultCount: 1,
          });
          if (response.places && response.places.length > 0 && response.places[0].location) {
            matchedPlace = response.places[0];
            break;
          }
        }

        if (cancelled) return;

        if (matchedPlace && matchedPlace.location) {
          const lat = matchedPlace.location.lat();
          const lng = matchedPlace.location.lng();
          const attributions = (
            matchedPlace as unknown as {
              attributions?: Array<{ provider?: string | null; providerURI?: string | null }>;
            }
          ).attributions;

          setResolved({
            lat,
            lng,
            title: matchedPlace.displayName || name,
            formattedAddress: matchedPlace.formattedAddress || address,
            attributions,
          });
          setInfoOpen(true);
          setLoadingLocation(false);
          return;
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          if (!cancelled) {
            setErrorMsg('Kuota pencarian lokasi Google Maps sedang tercapai.');
            setLoadingLocation(false);
          }
          return;
        }
        // Lanjutkan ke server-side Geocoding API v4 proxy sebagai fallback
      }

      try {
        const geocodeRes = await apiFetch<{
          location?: { lat: number; lng: number };
          formattedAddress?: string;
        }>(`/pondok/geocode?address=${encodeURIComponent(address)}`);

        if (cancelled) return;

        if (geocodeRes.location) {
          setResolved({
            lat: geocodeRes.location.lat,
            lng: geocodeRes.location.lng,
            title: name,
            formattedAddress: geocodeRes.formattedAddress || address,
          });
          setInfoOpen(true);
        } else {
          setErrorMsg('Titik koordinat tidak ditemukan untuk alamat yang tercantum.');
        }
      } catch (geoErr) {
        if (cancelled) return;
        if (isQuotaError(geoErr)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          setErrorMsg('Kuota layanan Geocoding Google Maps sedang tercapai.');
        } else {
          setErrorMsg('Lokasi belum dapat dipetakan secara otomatis.');
        }
      } finally {
        if (!cancelled) {
          setLoadingLocation(false);
        }
      }
    }

    void resolveLocation();
    return () => {
      cancelled = true;
    };
  }, [placesLib, name, address]);

  const handleRecenter = useCallback(() => {
    if (!map || !resolved) return;
    map.panTo({ lat: resolved.lat, lng: resolved.lng });
    map.setZoom(16);
    setInfoOpen(true);
  }, [map, resolved]);

  const externalMapsUrl = resolved
    ? `https://www.google.com/maps/search/?api=1&query=${resolved.lat},${resolved.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;

  if (loadingLocation) {
    return (
      <div className="h-[340px] w-full rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
        <span>Memuat peta lokasi pondok pesantren...</span>
      </div>
    );
  }

  if (errorMsg || !resolved) {
    return (
      <div className="h-[220px] w-full rounded-lg border border-slate-200 bg-slate-50 p-5 flex flex-col items-center justify-center text-center gap-3">
        <MapPin className="w-6 h-6 text-emerald-700" />
        <div className="space-y-1 max-w-md">
          <div className="text-sm font-semibold text-slate-800">{name}</div>
          <p className="text-xs text-slate-600 leading-relaxed">{address}</p>
          {errorMsg && <p className="text-xs text-amber-700 pt-1">{errorMsg}</p>}
        </div>
        <a
          href={externalMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg"
        >
          <span>Buka di Google Maps</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="h-[340px] w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          defaultCenter={{ lat: resolved.lat, lng: resolved.lng }}
          defaultZoom={16}
          gestureHandling="cooperative"
          mapTypeControl={false}
          streetViewControl={true}
          fullscreenControl={true}
          className="w-full h-full"
        >
          <AdvancedMarker
            ref={markerRef}
            position={{ lat: resolved.lat, lng: resolved.lng }}
            title={resolved.title}
            onClick={() => setInfoOpen((prev) => !prev)}
          >
            <Pin background="#065f46" borderColor="#022c22" glyphColor="#fef3c7" />
          </AdvancedMarker>

          {infoOpen && marker && (
            <InfoWindow
              anchor={marker}
              maxWidth={270}
              onCloseClick={() => setInfoOpen(false)}
            >
              <div className="text-slate-900 space-y-1.5 py-0.5 pr-1">
                <div className="text-xs font-bold text-emerald-900">{resolved.title}</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {resolved.formattedAddress}
                </p>
                <a
                  href={externalMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline pt-0.5"
                >
                  <span>Petunjuk Arah (Google Maps)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="font-mono text-[11px] text-slate-500 tabular-nums">
          Koordinat: {resolved.lat.toFixed(6)}, {resolved.lng.toFixed(6)}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecenter}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5 text-emerald-700" />
            <span>Pusatkan Peta</span>
          </button>
          <a
            href={externalMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md"
          >
            <span>Buka di Google Maps</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {resolved.attributions && resolved.attributions.length > 0 && (
        <div className="text-[11px] text-slate-400">
          Sumber data peta:{' '}
          {resolved.attributions.map((attr, idx) => (
            <span key={`${attr.provider || 'provider'}-${idx}`}>
              {idx > 0 ? ', ' : ''}
              {attr.providerURI ? (
                <a
                  href={attr.providerURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-600"
                >
                  {attr.provider || 'Google Maps'}
                </a>
              ) : (
                attr.provider || 'Google Maps'
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const PondokLocationMap: React.FC<PondokLocationMapProps> = ({ name, address }) => {
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [apiKey, setApiKey] = useState<string | null>(envKey || null);
  const [checkingKey, setCheckingKey] = useState(!envKey);

  useEffect(() => {
    if (envKey) {
      setApiKey(envKey);
      setCheckingKey(false);
      return;
    }

    let cancelled = false;
    apiFetch<{ apiKey: string | null }>('/pondok/maps-config')
      .then((res) => {
        if (!cancelled) {
          setApiKey(res.apiKey || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiKey(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingKey(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [envKey]);

  const fallbackMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;

  if (checkingKey) {
    return (
      <div className="h-[340px] w-full rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
        <span>Menyiapkan peta lokasi...</span>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="h-[220px] w-full rounded-lg border border-slate-200 bg-slate-50 p-5 flex flex-col items-center justify-center text-center gap-3">
        <MapPin className="w-6 h-6 text-emerald-700" />
        <div className="space-y-1 max-w-md">
          <div className="text-sm font-semibold text-slate-800">{name}</div>
          <p className="text-xs text-slate-600 leading-relaxed">{address}</p>
        </div>
        <a
          href={fallbackMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg"
        >
          <span>Lihat Lokasi di Google Maps</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={LIBRARIES}
      language="id"
      region="ID"
    >
      <MapContent name={name} address={address} />
    </APIProvider>
  );
};
