import React, { useState, useEffect, useMemo, useRef } from 'react';
import { COST_COURIERS } from '../data/couriers';
import { CostServiceOption } from '../types';
import {
  calculateShippingCost,
  fetchLocations,
  type LocationResult
} from '../services/api';
import {
  Calculator,
  ArrowRightLeft,
  RefreshCw,
  Clock,
  Scale,
  Box,
  Check,
  AlertCircle,
  MapPin,
  Search,
  X
} from 'lucide-react';

/**
 * ✅ Cek Ongkir — overhaul sesuai dokumentasi BinderByte (perbaikan.txt).
 *
 * Perubahan utama:
 *   - Tidak ada lagi dropdown Provinsi → Kota → Kecamatan (endpoint
 *     /v1/provinces, /v1/cities, /v1/districts sudah dihapus BinderByte).
 *   - Pakai SATU search box yang panggil /v1/locations?search=<keyword>.
 *     User ketik mis. "Cilegon" atau "Cibiru Bandung", dapat list hasil
 *     (village/district/city/province), klik → jadi origin/destination.
 *   - ID yang dipilih diteruskan mentah (mis. "33.74.01.1001" /
 *     "village_33.74.01.1001") ke /api/cost. Server proxy di api/index.ts
 *     otomatis mem-prefi-kan sesuai tipenya.
 *   - Weight tetap input dalam GRAM dari sisi UX, server yang konversi
 *     ke kilogram.
 */

type LocationPickerTarget = 'origin' | 'destination';

interface PickedLocation {
  id: string;       // id mentah dari BinderByte (mis. "33.74.01.1001")
  label: string;    // label lengkap dari BinderByte
  type: string;     // village | district | city | province
}

export const CostCalculator: React.FC = () => {
  const [origin, setOrigin] = useState<PickedLocation | null>(null);
  const [destination, setDestination] = useState<PickedLocation | null>(null);

  const [search, setSearch] = useState<{ origin: string; destination: string }>({
    origin: '',
    destination: ''
  });
  const [activePicker, setActivePicker] = useState<LocationPickerTarget | null>(null);
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const [weight, setWeight] = useState<number>(1000);
  const [useVolumetric, setUseVolumetric] = useState<boolean>(false);
  const [length, setLength] = useState<number>(10);
  const [width, setWidth] = useState<number>(10);
  const [height, setHeight] = useState<number>(10);

  const [selectedCouriers, setSelectedCouriers] = useState<string[]>(
    COST_COURIERS.map((c) => c.code)
  );
  const [sortBy, setSortBy] = useState<'price' | 'etd' | 'courier'>('price');

  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<CostServiceOption[]>([]);
  const [searched, setSearched] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search ke /v1/locations
  useEffect(() => {
    if (!activePicker) return;
    const term = search[activePicker].trim();

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    // Cancel request sebelumnya
    if (searchAbortRef.current) searchAbortRef.current.abort();

    if (term.length < 3) {
      setSearchResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const list = await fetchLocations(term);
        if (!controller.signal.aborted) {
          setSearchResults(list);
        }
      } catch (e: any) {
        if (!controller.signal.aborted) {
          setSearchError(e?.message || 'Gagal mencari lokasi');
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search, activePicker]);

  const handleSwapLocation = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handlePickLocation = (loc: LocationResult, target: LocationPickerTarget) => {
    const picked: PickedLocation = {
      id: loc.id,
      label: loc.label,
      type: loc.type
    };
    if (target === 'origin') setOrigin(picked);
    else setDestination(picked);
    setActivePicker(null);
    setSearchResults([]);
    setSearch((s) => ({ ...s, [target]: '' }));
  };

  const handleClearLocation = (target: LocationPickerTarget) => {
    if (target === 'origin') setOrigin(null);
    else setDestination(null);
  };

  const handleToggleCourier = (code: string) => {
    setSelectedCouriers((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const calculatedWeight = useVolumetric
    ? Math.max(weight, Math.ceil((length * width * height) / 6000) * 1000)
    : weight;

  const handleCalculate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setSearched(true);
    setResults([]);

    if (!origin || !destination) {
      setError('Pilih lokasi asal dan tujuan terlebih dahulu.');
      setLoading(false);
      return;
    }

    try {
      const data = await calculateShippingCost(
        origin.id,
        destination.id,
        calculatedWeight,
        selectedCouriers
      );
      setResults(data);
      if (data.length === 0) {
        setError(
          'Tidak ada data ongkir yang dikembalikan. Coba pilih lokasi lain atau cek subscription BinderByte Anda.'
        );
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menghitung ongkos kirim');
    } finally {
      setLoading(false);
    }
  };

  const extractEtdDays = (etdStr: string): number => {
    const match = etdStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 99;
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'price') return a.cost - b.cost;
    if (sortBy === 'etd') {
      return extractEtdDays(a.etd) - extractEtdDays(b.etd);
    }
    return a.courierName.localeCompare(b.courierName);
  });

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);

  // === Render helper untuk picker asal/tujuan ===
  const renderLocationField = (target: LocationPickerTarget) => {
    const picked = target === 'origin' ? origin : destination;
    const isActive = activePicker === target;

    if (isActive) {
      return (
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {target === 'origin' ? 'Asal (Origin)' : 'Tujuan (Destination)'}
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={search[target]}
              onChange={(e) =>
                setSearch((s) => ({ ...s, [target]: e.target.value }))
              }
              placeholder="Ketik min. 3 huruf: nama kota, kecamatan, atau desa…"
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl pl-9 pr-9 py-2.5 focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => setActivePicker(null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-slate-200"
              title="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {searching && (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Mencari di BinderByte…</span>
            </div>
          )}

          {searchError && (
            <div className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              <span>{searchError}</span>
            </div>
          )}

          {!searching &&
            !searchError &&
            search[target].trim().length >= 3 &&
            searchResults.length === 0 && (
              <div className="text-xs text-slate-500">
                Tidak ada hasil untuk "{search[target]}".
              </div>
            )}

          {searchResults.length > 0 && (
            <ul className="bg-slate-950 border border-slate-800 rounded-xl max-h-72 overflow-y-auto divide-y divide-slate-800">
              {searchResults.map((loc, idx) => (
                <li key={`${loc.id}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => handlePickLocation(loc, target)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800/70 transition-colors flex items-start gap-2"
                  >
                    <span className="mt-0.5 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                      {loc.type}
                    </span>
                    <span className="text-xs text-slate-200">{loc.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          {target === 'origin' ? 'Asal (Origin)' : 'Tujuan (Destination)'}
        </label>
        {picked ? (
          <div className="flex items-start gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                  {picked.type}
                </span>
                <span className="text-[10px] font-mono text-slate-500 truncate">
                  {picked.id}
                </span>
              </div>
              <div className="text-xs text-slate-200 font-medium leading-snug">
                {picked.label}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  setActivePicker(target);
                  setSearch((s) => ({ ...s, [target]: '' }));
                }}
                className="px-2 py-1 text-[10px] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Ganti
              </button>
              <button
                type="button"
                onClick={() => handleClearLocation(target)}
                className="px-2 py-1 text-[10px] rounded-md bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300"
              >
                Hapus
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setActivePicker(target)}
            className="w-full bg-slate-950 border border-slate-800 border-dashed text-slate-400 hover:text-slate-200 hover:border-slate-600 rounded-xl py-3 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <MapPin className="w-4 h-4" />
            <span>Klik untuk pilih {target === 'origin' ? 'asal' : 'tujuan'}…</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Cek Estimasi Ongkir</h2>
            <p className="text-xs text-slate-400">
              Cari nama kota/kecamatan/desa, lalu pilih dari hasil pencarian BinderByte.
            </p>
          </div>
        </div>

        <form onSubmit={handleCalculate} className="space-y-5">
          {/* Origin / Destination picker (grid 11-col seperti layout sebelumnya) */}
          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-start">
            <div className="md:col-span-5">{renderLocationField('origin')}</div>

            <div className="md:col-span-1 flex justify-center pt-7">
              <button
                type="button"
                onClick={handleSwapLocation}
                disabled={!origin || !destination}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Tukar Asal & Tujuan"
              >
                <ArrowRightLeft className="w-4 h-4 text-blue-400" />
              </button>
            </div>

            <div className="md:col-span-5">{renderLocationField('destination')}</div>
          </div>

          <div className="text-[11px] text-slate-400 -mt-2">
            ID lokasi mengikuti format BinderByte (
            <span className="font-mono text-slate-300">
              village_33.22.11.2003
            </span>{' '}
            atau{' '}
            <span className="font-mono text-slate-300">dist_36.72.08</span>).
            Pilih dari hasil pencarian untuk akurasi maksimal.
          </div>

          {/* Weight & Volumetric section */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-blue-400" />
                <span>Berat Paket (Gram)</span>
              </label>

              <button
                type="button"
                onClick={() => setUseVolumetric(!useVolumetric)}
                className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium"
              >
                <Box className="w-3.5 h-3.5" />
                <span>
                  {useVolumetric
                    ? 'Sembunyikan Dimensi Volume'
                    : '+ Hitung Dimensi Volume (PxLxT)'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  {(weight / 1000).toFixed(1)} kg ({weight} gram)
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {[500, 1000, 2000, 3000, 5000].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWeight(w)}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                      weight === w
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {w < 1000 ? `${w}g` : `${w / 1000}kg`}
                  </button>
                ))}
              </div>
            </div>

            {useVolumetric && (
              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400">Panjang (cm)</label>
                  <input
                    type="number"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Lebar (cm)</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400">Tinggi (cm)</label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Courier Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                Pilihan Ekspedisi ({COST_COURIERS.length} kurir support ongkir sesuai
                dokumentasi BinderByte):
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCouriers(COST_COURIERS.map((c) => c.code))}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  Pilih Semua
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={() => setSelectedCouriers([])}
                  className="text-[11px] text-slate-400 hover:underline"
                >
                  Hapus Semua
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {COST_COURIERS.map((c) => {
                const isSelected = selectedCouriers.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleToggleCourier(c.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-3 h-3 text-blue-400" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                    <span>{c.shortName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || selectedCouriers.length === 0 || !origin || !destination}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Menghitung Ongkos Kirim...</span>
              </>
            ) : (
              <>
                <Calculator className="w-4 h-4" />
                <span>Hitung & Bandingkan Ongkir</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results List */}
      {searched && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">Hasil Perbandingan Ongkir</h3>
              <p className="text-xs text-slate-400">
                Ditemukan {sortedResults.length} pilihan layanan pengiriman
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
              <span className="text-xs text-slate-400 pl-2">Urutkan:</span>
              <button
                onClick={() => setSortBy('price')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  sortBy === 'price' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Termurah
              </button>
              <button
                onClick={() => setSortBy('etd')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  sortBy === 'etd' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tercepat
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedResults.map((item, index) => {
              const isCheapest = index === 0 && sortBy === 'price';
              return (
                <div
                  key={`${item.courierCode}-${item.service}-${index}`}
                  className={`p-5 rounded-2xl border transition-all relative overflow-hidden bg-slate-900 ${
                    isCheapest
                      ? 'border-emerald-500/50 ring-2 ring-emerald-500/20 shadow-lg'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {isCheapest && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-bl-xl tracking-wider">
                      Termurah
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">
                      {item.courierName}
                    </span>
                    <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {item.etd}
                    </span>
                  </div>

                  <h4 className="text-base font-bold text-white mb-1">
                    {item.service} ({item.description})
                  </h4>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-baseline justify-between">
                    <span className="text-xs text-slate-400">Total Tarif:</span>
                    <div className="text-xl font-extrabold text-emerald-400">
                      {formatRupiah(item.cost)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
