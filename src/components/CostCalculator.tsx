import React, { useState, useEffect, useMemo } from 'react';
import { COST_COURIERS } from '../data/couriers';
import { CostServiceOption } from '../types';
import {
  calculateShippingCost,
  fetchProvinces,
  fetchCities,
  fetchDistricts,
  type Province,
  type City,
  type District
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
  Building2,
  Search
} from 'lucide-react';

type LocationLevel = 'city' | 'district';

export const CostCalculator: React.FC = () => {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [originDistricts, setOriginDistricts] = useState<District[]>([]);
  const [destinationDistricts, setDestinationDistricts] = useState<District[]>([]);

  const [originProvince, setOriginProvince] = useState<string>('');
  const [originCity, setOriginCity] = useState<string>('');
  const [originDistrict, setOriginDistrict] = useState<string>('');
  const [destinationProvince, setDestinationProvince] = useState<string>('');
  const [destinationCity, setDestinationCity] = useState<string>('');
  const [destinationDistrict, setDestinationDistrict] = useState<string>('');

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
  const [loadingLocations, setLoadingLocations] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [citySearch, setCitySearch] = useState<{ origin: string; destination: string }>({
    origin: '',
    destination: ''
  });

  // Load provinces + cities on mount
  useEffect(() => {
    let mounted = true;
    setLoadingLocations(true);
    setLocationError(null);
    Promise.all([fetchProvinces(), fetchCities()])
      .then(([provs, cts]) => {
        if (!mounted) return;
        setProvinces(provs);
        setCities(cts);
      })
      .catch((e) => {
        if (!mounted) return;
        setLocationError(e?.message || 'Gagal memuat data lokasi dari BinderByte');
      })
      .finally(() => mounted && setLoadingLocations(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Filter cities by province
  const filteredOriginCities = useMemo(
    () => cities.filter((c) => !originProvince || c.province_id === originProvince),
    [cities, originProvince]
  );
  const filteredDestinationCities = useMemo(
    () => cities.filter((c) => !destinationProvince || c.province_id === destinationProvince),
    [cities, destinationProvince]
  );

  // Search filter by city name
  const visibleOriginCities = useMemo(() => {
    const q = citySearch.origin.trim().toLowerCase();
    if (!q) return filteredOriginCities.slice(0, 200);
    return filteredOriginCities.filter((c) => c.city_name.toLowerCase().includes(q)).slice(0, 200);
  }, [filteredOriginCities, citySearch.origin]);
  const visibleDestinationCities = useMemo(() => {
    const q = citySearch.destination.trim().toLowerCase();
    if (!q) return filteredDestinationCities.slice(0, 200);
    return filteredDestinationCities.filter((c) => c.city_name.toLowerCase().includes(q)).slice(0, 200);
  }, [filteredDestinationCities, citySearch.destination]);

  // Load districts when city changes
  useEffect(() => {
    if (!originCity) {
      setOriginDistricts([]);
      setOriginDistrict('');
      return;
    }
    let mounted = true;
    fetchDistricts(originCity)
      .then((d) => mounted && setOriginDistricts(d))
      .catch(() => mounted && setOriginDistricts([]));
    return () => {
      mounted = false;
    };
  }, [originCity]);

  useEffect(() => {
    if (!destinationCity) {
      setDestinationDistricts([]);
      setDestinationDistrict('');
      return;
    }
    let mounted = true;
    fetchDistricts(destinationCity)
      .then((d) => mounted && setDestinationDistricts(d))
      .catch(() => mounted && setDestinationDistricts([]));
    return () => {
      mounted = false;
    };
  }, [destinationCity]);

  const calculatedWeight = useVolumetric
    ? Math.max(weight, Math.ceil((length * width * height) / 6000) * 1000)
    : weight;

  const handleSwapLocation = () => {
    setOriginProvince(destinationProvince);
    setOriginCity(destinationCity);
    setOriginDistrict(destinationDistrict);
    setDestinationProvince(originProvince);
    setDestinationCity(originCity);
    setDestinationDistrict(originDistrict);
  };

  const handleToggleCourier = (code: string) => {
    setSelectedCouriers((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleCalculate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setSearched(true);
    setResults([]);

    const originCode = originDistrict || originCity;
    const destinationCode = destinationDistrict || destinationCity;
    const originType: LocationLevel = originDistrict ? 'district' : 'city';
    const destinationType: LocationLevel = destinationDistrict ? 'district' : 'city';

    if (!originCode || !destinationCode) {
      setError('Pilih kota/kecamatan asal dan tujuan terlebih dahulu.');
      setLoading(false);
      return;
    }

    try {
      const data = await calculateShippingCost(
        originCode,
        destinationCode,
        calculatedWeight,
        selectedCouriers,
        originType,
        destinationType
      );
      setResults(data);
      if (data.length === 0) {
        setError(
          'Tidak ada data ongkir yang dikembalikan. Coba pilih level kota saja, atau cek subscription BinderByte kamu.'
        );
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menghitung ongkos kirim');
    } finally {
      setLoading(false);
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'price') return a.cost - b.cost;
    if (sortBy === 'etd') {
      const etdA = parseInt(a.etd.replace(/\D/g, '') || '99', 10);
      const etdB = parseInt(b.etd.replace(/\D/g, '') || '99', 10);
      return etdA - etdB;
    }
    return a.courierName.localeCompare(b.courierName);
  });

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);

  const hasDistrictSelection = Boolean(originDistrict || destinationDistrict);
  const level: LocationLevel = hasDistrictSelection ? 'district' : 'city';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Form Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Cek Estimasi Ongkir</h2>
            <p className="text-xs text-slate-400">
              Data provinsi, kota, dan kecamatan langsung dari BinderByte API
            </p>
          </div>
        </div>

        {locationError && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{locationError}</span>
          </div>
        )}

        <form onSubmit={handleCalculate} className="space-y-5">
          {/* Province / City / District selectors */}
          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-start">
            {/* ORIGIN */}
            <div className="md:col-span-5 space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Asal (Origin)
              </label>
              <select
                value={originProvince}
                onChange={(e) => {
                  setOriginProvince(e.target.value);
                  setOriginCity('');
                  setOriginDistrict('');
                }}
                disabled={loadingLocations}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">— Pilih Provinsi —</option>
                {provinces.map((p) => (
                  <option key={p.province_id} value={p.province_id}>
                    {p.province}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={originCity}
                  onChange={(e) => {
                    setOriginCity(e.target.value);
                    setOriginDistrict('');
                  }}
                  disabled={loadingLocations}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">— Pilih Kota/Kabupaten —</option>
                  {visibleOriginCities.map((c) => (
                    <option key={c.city_id} value={c.city_id}>
                      {c.type} {c.city_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={citySearch.origin}
                  onChange={(e) => setCitySearch({ ...citySearch, origin: e.target.value })}
                  placeholder="Cari kota..."
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-xl pl-9 pr-3 py-1.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              {originDistricts.length > 0 && (
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={originDistrict}
                    onChange={(e) => setOriginDistrict(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— Pilih Kecamatan (opsional) —</option>
                    {originDistricts.map((d) => (
                      <option key={d.district_id} value={d.district_id}>
                        {d.district_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* SWAP */}
            <div className="md:col-span-1 flex justify-center pt-7">
              <button
                type="button"
                onClick={handleSwapLocation}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
                title="Tukar Asal & Tujuan"
              >
                <ArrowRightLeft className="w-4 h-4 text-blue-400" />
              </button>
            </div>

            {/* DESTINATION */}
            <div className="md:col-span-5 space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Tujuan (Destination)
              </label>
              <select
                value={destinationProvince}
                onChange={(e) => {
                  setDestinationProvince(e.target.value);
                  setDestinationCity('');
                  setDestinationDistrict('');
                }}
                disabled={loadingLocations}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">— Pilih Provinsi —</option>
                {provinces.map((p) => (
                  <option key={`d-prov-${p.province_id}`} value={p.province_id}>
                    {p.province}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={destinationCity}
                  onChange={(e) => {
                    setDestinationCity(e.target.value);
                    setDestinationDistrict('');
                  }}
                  disabled={loadingLocations}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">— Pilih Kota/Kabupaten —</option>
                  {visibleDestinationCities.map((c) => (
                    <option key={`d-${c.city_id}`} value={c.city_id}>
                      {c.type} {c.city_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={citySearch.destination}
                  onChange={(e) => setCitySearch({ ...citySearch, destination: e.target.value })}
                  placeholder="Cari kota..."
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-xl pl-9 pr-3 py-1.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              {destinationDistricts.length > 0 && (
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={destinationDistrict}
                    onChange={(e) => setDestinationDistrict(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs sm:text-sm rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— Pilih Kecamatan (opsional) —</option>
                    {destinationDistricts.map((d) => (
                      <option key={`d-d-${d.district_id}`} value={d.district_id}>
                        {d.district_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 -mt-2">
            Level perhitungan:{' '}
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
              {level === 'district' ? 'Kecamatan (district)' : 'Kota/Kabupaten'}
            </span>
            . Mode kecamatan butuh subscription BinderByte minimal Starter.
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
                Pilihan Ekspedisi ({COST_COURIERS.length} kurir support ongkir):
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
            disabled={loading || selectedCouriers.length === 0}
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
