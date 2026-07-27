import { LocationItem } from '../types';

/**
 * Daftar kota/kabupaten populer Indonesia.
 * Field `code` mengikuti ID BinderByte untuk origin/destination cek ongkir.
 */
export const POPULAR_LOCATIONS: LocationItem[] = [
  { id: '1', code: '501', name: 'Jakarta Selatan', province: 'DKI Jakarta', type: 'Kota' },
  { id: '2', code: '502', name: 'Jakarta Barat', province: 'DKI Jakarta', type: 'Kota' },
  { id: '3', code: '503', name: 'Jakarta Pusat', province: 'DKI Jakarta', type: 'Kota' },
  { id: '4', code: '504', name: 'Jakarta Timur', province: 'DKI Jakarta', type: 'Kota' },
  { id: '5', code: '505', name: 'Jakarta Utara', province: 'DKI Jakarta', type: 'Kota' },
  { id: '6', code: '22', name: 'Bandung', province: 'Jawa Barat', type: 'Kota' },
  { id: '7', code: '23', name: 'Bekasi', province: 'Jawa Barat', type: 'Kota' },
  { id: '8', code: '24', name: 'Bogor', province: 'Jawa Barat', type: 'Kota' },
  { id: '9', code: '25', name: 'Depok', province: 'Jawa Barat', type: 'Kota' },
  { id: '10', code: '26', name: 'Tangerang', province: 'Banten', type: 'Kota' },
  { id: '11', code: '27', name: 'Tangerang Selatan', province: 'Banten', type: 'Kota' },
  { id: '12', code: '444', name: 'Surabaya', province: 'Jawa Timur', type: 'Kota' },
  { id: '13', code: '399', name: 'Semarang', province: 'Jawa Tengah', type: 'Kota' },
  { id: '14', code: '419', name: 'Yogyakarta', province: 'DI Yogyakarta', type: 'Kota' },
  { id: '15', code: '256', name: 'Malang', province: 'Jawa Timur', type: 'Kota' },
  { id: '16', code: '114', name: 'Denpasar', province: 'Bali', type: 'Kota' },
  { id: '17', code: '278', name: 'Medan', province: 'Sumatera Utara', type: 'Kota' },
  { id: '18', code: '327', name: 'Palembang', province: 'Sumatera Selatan', type: 'Kota' },
  { id: '19', code: '54', name: 'Batam', province: 'Kepulauan Riau', type: 'Kota' },
  { id: '20', code: '349', name: 'Pekanbaru', province: 'Riau', type: 'Kota' },
  { id: '21', code: '318', name: 'Padang', province: 'Sumatera Barat', type: 'Kota' },
  { id: '22', code: '21', name: 'Balikpapan', province: 'Kalimantan Timur', type: 'Kota' },
  { id: '23', code: '385', name: 'Samarinda', province: 'Kalimantan Timur', type: 'Kota' },
  { id: '24', code: '270', name: 'Makassar', province: 'Sulawesi Selatan', type: 'Kota' },
  { id: '25', code: '255', name: 'Manado', province: 'Sulawesi Utara', type: 'Kota' },
  { id: '26', code: '212', name: 'Bandar Lampung', province: 'Lampung', type: 'Kota' },
  { id: '27', code: '418', name: 'Surakarta (Solo)', province: 'Jawa Tengah', type: 'Kota' },
  { id: '28', code: '78', name: 'Cirebon', province: 'Jawa Barat', type: 'Kota' },
  { id: '29', code: '421', name: 'Tasikmalaya', province: 'Jawa Barat', type: 'Kota' },
  { id: '30', code: '152', name: 'Gresik', province: 'Jawa Timur', type: 'Kabupaten' },
  { id: '31', code: '409', name: 'Sidoarjo', province: 'Jawa Timur', type: 'Kabupaten' },
  { id: '32', code: '197', name: 'Kudus', province: 'Jawa Tengah', type: 'Kabupaten' },
  { id: '33', code: '364', name: 'Pontianak', province: 'Kalimantan Barat', type: 'Kota' },
  { id: '34', code: '38', name: 'Banjarmasin', province: 'Kalimantan Selatan', type: 'Kota' },
  { id: '35', code: '251', name: 'Mataram', province: 'Nusa Tenggara Barat', type: 'Kota' },
  { id: '36', code: '209', name: 'Kupang', province: 'Nusa Tenggara Timur', type: 'Kota' },
  { id: '37', code: '18', name: 'Ambon', province: 'Maluku', type: 'Kota' },
  { id: '38', code: '189', name: 'Jayapura', province: 'Papua', type: 'Kota' }
];

/**
 * Daftar kecamatan (district) yang dikurasi manual — popular shipping hubs di Indonesia.
 * `code` adalah ID kecamatan BinderByte (RajaOngkir-compatible).
 * `parentCity` adalah ID kota/kabupaten induk (lihat POPULAR_LOCATIONS di atas).
 *
 * Mode cek ongkir kecamatan butuh subscription BinderByte Starter/Pro ke atas.
 */
export const POPULAR_DISTRICTS: LocationItem[] = [
  // Jakarta Selatan (501)
  { id: 'd1', code: '50101', name: 'Kebayoran Baru', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd2', code: '50102', name: 'Kebayoran Lama', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd3', code: '50103', name: 'Pesanggrahan', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd4', code: '50104', name: 'Cilandak', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd5', code: '50105', name: 'Pasar Minggu', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd6', code: '50106', name: 'Jagakarsa', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd7', code: '50107', name: 'Mampang Prapatan', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd8', code: '50108', name: 'Pancoran', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd9', code: '50109', name: 'Tebet', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },
  { id: 'd10', code: '50110', name: 'Setiabudi', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '501' },

  // Jakarta Barat (502)
  { id: 'd11', code: '50201', name: 'Kembangan', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '502' },
  { id: 'd12', code: '50202', name: 'Kebon Jeruk', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '502' },
  { id: 'd13', code: '50203', name: 'Palmerah', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '502' },
  { id: 'd14', code: '50204', name: 'Grogol Petamburan', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '502' },
  { id: 'd15', code: '50205', name: 'Tambora', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '502' },
  { id: 'd16', code: '50206', name: 'Cengkareng', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '502' },
  { id: 'd17', code: '50207', name: 'Kalideres', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '502' },

  // Jakarta Pusat (503)
  { id: 'd18', code: '50301', name: 'Tanah Abang', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '503' },
  { id: 'd19', code: '50302', name: 'Menteng', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '503' },
  { id: 'd20', code: '50303', name: 'Gambir', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '503' },
  { id: 'd21', code: '50304', name: 'Sawah Besar', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '503' },
  { id: 'd22', code: '50305', name: 'Kemayoran', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '503' },
  { id: 'd23', code: '50306', name: 'Senen', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '503' },
  { id: 'd24', code: '50307', name: 'Cempaka Putih', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '503' },

  // Jakarta Timur (504)
  { id: 'd25', code: '50401', name: 'Matraman', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '504' },
  { id: 'd26', code: '50402', name: 'Pulo Gadung', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '504' },
  { id: 'd27', code: '50403', name: 'Jatinegara', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '504' },
  { id: 'd28', code: '50404', name: 'Duren Sawit', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '504' },
  { id: 'd29', code: '50405', name: 'Cakung', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '504' },
  { id: 'd30', code: '50406', name: 'Cipayung', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '504' },

  // Jakarta Utara (505)
  { id: 'd31', code: '50501', name: 'Kelapa Gading', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '505' },
  { id: 'd32', code: '50502', name: 'Pademangan', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '505' },
  { id: 'd33', code: '50503', name: 'Tanjung Priok', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '505' },
  { id: 'd34', code: '50504', name: 'Penjaringan', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '505' },
  { id: 'd35', code: '50505', name: 'Pantai Indah Kapuk', province: 'DKI Jakarta', type: 'Kecamatan', parentCity: '505' },

  // Bandung (22)
  { id: 'd36', code: '22001', name: 'Coblong', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '22' },
  { id: 'd37', code: '22002', name: 'Sukajadi', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '22' },
  { id: 'd38', code: '22003', name: 'Cicendo', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '22' },
  { id: 'd39', code: '22004', name: 'Andir', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '22' },
  { id: 'd40', code: '22005', name: 'Buah Batu', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '22' },
  { id: 'd41', code: '22006', name: 'Rancasari', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '22' },
  { id: 'd42', code: '22007', name: 'Mandalajati', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '22' },

  // Bekasi (23)
  { id: 'd43', code: '23001', name: 'Bekasi Selatan', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '23' },
  { id: 'd44', code: '23002', name: 'Bekasi Utara', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '23' },
  { id: 'd45', code: '23003', name: 'Bekasi Barat', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '23' },
  { id: 'd46', code: '23004', name: 'Bekasi Timur', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '23' },

  // Bogor (24)
  { id: 'd47', code: '24001', name: 'Bogor Selatan', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '24' },
  { id: 'd48', code: '24002', name: 'Bogor Utara', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '24' },
  { id: 'd49', code: '24003', name: 'Bogor Tengah', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '24' },
  { id: 'd50', code: '24004', name: 'Tanah Sareal', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '24' },

  // Depok (25)
  { id: 'd51', code: '25001', name: 'Pancoran Mas', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '25' },
  { id: 'd52', code: '25002', name: 'Beji', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '25' },
  { id: 'd53', code: '25003', name: 'Cimanggis', province: 'Jawa Barat', type: 'Kecamatan', parentCity: '25' },

  // Tangerang (26)
  { id: 'd54', code: '26001', name: 'Cipondoh', province: 'Banten', type: 'Kecamatan', parentCity: '26' },
  { id: 'd55', code: '26002', name: 'Karawaci', province: 'Banten', type: 'Kecamatan', parentCity: '26' },
  { id: 'd56', code: '26003', name: 'Ciledug', province: 'Banten', type: 'Kecamatan', parentCity: '26' },

  // Tangerang Selatan (27)
  { id: 'd57', code: '27001', name: 'Serpong', province: 'Banten', type: 'Kecamatan', parentCity: '27' },
  { id: 'd58', code: '27002', name: 'Serpong Utara', province: 'Banten', type: 'Kecamatan', parentCity: '27' },
  { id: 'd59', code: '27003', name: 'Ciputat', province: 'Banten', type: 'Kecamatan', parentCity: '27' },
  { id: 'd60', code: '27004', name: 'Pamulang', province: 'Banten', type: 'Kecamatan', parentCity: '27' },

  // Surabaya (444)
  { id: 'd61', code: '44401', name: 'Genteng', province: 'Jawa Timur', type: 'Kecamatan', parentCity: '444' },
  { id: 'd62', code: '44402', name: 'Wonokromo', province: 'Jawa Timur', type: 'Kecamatan', parentCity: '444' },
  { id: 'd63', code: '44403', name: 'Rungkut', province: 'Jawa Timur', type: 'Kecamatan', parentCity: '444' },
  { id: 'd64', code: '44404', name: 'Sukomanunggal', province: 'Jawa Timur', type: 'Kecamatan', parentCity: '444' },
  { id: 'd65', code: '44405', name: 'Tambaksari', province: 'Jawa Timur', type: 'Kecamatan', parentCity: '444' },

  // Semarang (399)
  { id: 'd66', code: '39901', name: 'Semarang Tengah', province: 'Jawa Tengah', type: 'Kecamatan', parentCity: '399' },
  { id: 'd67', code: '39902', name: 'Semarang Selatan', province: 'Jawa Tengah', type: 'Kecamatan', parentCity: '399' },
  { id: 'd68', code: '39903', name: 'Candisari', province: 'Jawa Tengah', type: 'Kecamatan', parentCity: '399' },

  // Yogyakarta (419)
  { id: 'd69', code: '41901', name: 'Gondokusuman', province: 'DI Yogyakarta', type: 'Kecamatan', parentCity: '419' },
  { id: 'd70', code: '41902', name: 'Umbulharjo', province: 'DI Yogyakarta', type: 'Kecamatan', parentCity: '419' },
  { id: 'd71', code: '41903', name: 'Depok', province: 'DI Yogyakarta', type: 'Kecamatan', parentCity: '419' },

  // Medan (278)
  { id: 'd72', code: '27801', name: 'Medan Polonia', province: 'Sumatera Utara', type: 'Kecamatan', parentCity: '278' },
  { id: 'd73', code: '27802', name: 'Medan Helvetia', province: 'Sumatera Utara', type: 'Kecamatan', parentCity: '278' },
  { id: 'd74', code: '27803', name: 'Medan Tuntungan', province: 'Sumatera Utara', type: 'Kecamatan', parentCity: '278' },

  // Makassar (270)
  { id: 'd75', code: '27001', name: 'Makassar', province: 'Sulawesi Selatan', type: 'Kecamatan', parentCity: '270' },
  { id: 'd76', code: '27002', name: 'Panakkukang', province: 'Sulawesi Selatan', type: 'Kecamatan', parentCity: '270' },
  { id: 'd77', code: '27003', name: 'Biringkanaya', province: 'Sulawesi Selatan', type: 'Kecamatan', parentCity: '270' }
];