/**
 * Outlaw Shop Systems - Multi-Vehicle VIN & Marine HIN Decoder
 * Supports: Cars, Light/Heavy Trucks, Diesels, Motorcycles, ATVs/UTVs, and Marine HINs.
 */

export interface DecodedVehicleInfo {
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  engine_info?: string;
  vehicle_type?: 'auto' | 'marine' | 'atv' | 'snowmobile' | 'motorcycle' | 'equipment';
  notes?: string;
}

// 10th VIN Character Model Year Mapping (Standard ISO 3779 / NHTSA)
const VIN_YEAR_MAP: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025,
  T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
  '6': 2006, '7': 2007, '8': 2008, '9': 2009,
};

// Top US Coast Guard Manufacturer Identification Codes (MIC) for Boats
const USCG_BOAT_MICS: Record<string, string> = {
  LUN: 'Lund Boat Company',
  BWC: 'Boston Whaler',
  SER: 'Sea Ray Boats',
  TRK: 'Tracker Marine',
  TKP: 'Tracker Marine',
  BRP: 'BRP / Sea-Doo',
  YDV: 'Sea-Doo / BRP',
  YAM: 'Yamaha WaveRunner / Boats',
  ALU: 'Alumacraft',
  SKF: 'Carolina Skiff',
  BAY: 'Bayliner',
  GRM: 'Grady-White',
  RNG: 'Ranger Boats',
  MAL: 'Malibu Boats',
  MAU: 'MasterCraft',
  CHA: 'Chaparral Boats',
  SKE: 'Skeeter Boats',
  NTC: 'Nautique / Correct Craft',
  CRN: 'Crownline',
  WST: 'Westcraft / Crestliner',
  DUK: 'Duckworth Boats',
  HEW: 'Hewescraft',
  SMK: 'Smoker Craft',
  STR: 'Stratos Boats',
  GLA: 'Glastron',
  FOUR: 'Four Winns',
  TIG: 'Tige Boats',
  MOO: 'Moomba / Supra',
};

// Common Powersports WMI 3-Char Prefixes (Offline Fallback)
const POWERSPORTS_WMIS: Record<string, { make: string; type: 'atv' | 'motorcycle' | 'snowmobile' }> = {
  '4XA': { make: 'Polaris', type: 'atv' },
  '3NS': { make: 'Polaris', type: 'atv' },
  '4UF': { make: 'Arctic Cat', type: 'atv' },
  '2BV': { make: 'Can-Am / BRP', type: 'atv' },
  '3JB': { make: 'Can-Am / BRP', type: 'atv' },
  '1HF': { make: 'Honda', type: 'motorcycle' },
  'JH2': { make: 'Honda', type: 'motorcycle' },
  'JY4': { make: 'Yamaha', type: 'atv' },
  'JYA': { make: 'Yamaha', type: 'motorcycle' },
  'JK1': { make: 'Kawasaki', type: 'motorcycle' },
  'JK4': { make: 'Kawasaki', type: 'atv' },
  'LC6': { make: 'CFMOTO', type: 'atv' },
};

/**
 * Decodes a 12-Character USCG Marine Hull Identification Number (HIN)
 */
export function decodeMarineHIN(hin: string): DecodedVehicleInfo | null {
  const clean = hin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 12) return null;

  const mic = clean.slice(0, 3);
  const make = USCG_BOAT_MICS[mic] || `Marine (MIC: ${mic})`;

  // Current Standard Format (Post-1984): Last 2 characters are Model Year (e.g., '21' = 2021)
  const yearSuffix = clean.slice(10, 12);
  let year = '';
  const numYear = parseInt(yearSuffix, 10);
  if (!isNaN(numYear)) {
    year = numYear >= 70 ? `19${yearSuffix}` : `20${yearSuffix}`;
  }

  return {
    year,
    make,
    vehicle_type: 'marine',
    notes: `Decoded USCG HIN (Manufacturer Code: ${mic})`,
  };
}

/**
 * Decodes a standard 17-Character VIN using the US NHTSA VPIC Public API
 * with instant offline fallbacks.
 */
export async function decodeVehicleVIN(vin: string): Promise<DecodedVehicleInfo> {
  const clean = vin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Check if it's a 12-char Boat HIN
  if (clean.length === 12 && !/^\d+$/.test(clean)) {
    const marineResult = decodeMarineHIN(clean);
    if (marineResult) return marineResult;
  }

  // 2. Offline Fallback Baseline Extraction
  let offlineYear = '';
  let offlineMake = '';
  let detectedType: 'auto' | 'marine' | 'atv' | 'snowmobile' | 'motorcycle' | 'equipment' = 'auto';

  if (clean.length === 17) {
    const yearChar = clean.charAt(9);
    if (VIN_YEAR_MAP[yearChar]) {
      offlineYear = String(VIN_YEAR_MAP[yearChar]);
    }
    const wmi = clean.slice(0, 3);
    if (POWERSPORTS_WMIS[wmi]) {
      offlineMake = POWERSPORTS_WMIS[wmi].make;
      detectedType = POWERSPORTS_WMIS[wmi].type;
    }
  }

  // If offline or invalid length, return local best-effort decode
  if (clean.length !== 17 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return {
      year: offlineYear,
      make: offlineMake,
      vehicle_type: detectedType,
    };
  }

  // 3. Online: Fetch full US DOT / NHTSA VPIC Database
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(clean)}?format=json`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`NHTSA response error: ${res.status}`);

    const json = await res.json();
    const result = json.Results?.[0];
    if (!result) throw new Error('No NHTSA results');

    const year = result.ModelYear?.trim() || offlineYear;
    const make = result.Make?.trim() || offlineMake;
    const model = result.Model?.trim() || '';
    const series = result.Series?.trim() || '';
    const trim = result.Trim?.trim() || series;
    const driveType = result.DriveType?.trim() || '';
    const bodyClass = result.BodyClass?.trim() || '';

    // Engine Specs
    const dispL = result.DisplacementL ? `${parseFloat(result.DisplacementL).toFixed(1)}L` : '';
    const cyl = result.EngineCylinders ? `V${result.EngineCylinders}` : '';
    const fuel = result.FuelTypePrimary ? result.FuelTypePrimary.trim() : '';
    const engineConfig = result.EngineConfiguration?.trim() || '';

    let engine_info = [dispL, cyl, engineConfig, fuel].filter(Boolean).join(' ');
    if (result.EngineModel) {
      engine_info = `${result.EngineModel} (${engine_info})`.trim();
    }

    // Vehicle Type Detection
    const vehicleTypeNhtsa = (result.VehicleType || '').toLowerCase();
    if (vehicleTypeNhtsa.includes('motorcycle')) detectedType = 'motorcycle';
    else if (vehicleTypeNhtsa.includes('truck') || vehicleTypeNhtsa.includes('car') || vehicleTypeNhtsa.includes('multipurpose')) detectedType = 'auto';

    let fullTrim = [trim, driveType].filter(Boolean).join(' ');

    return {
      year,
      make,
      model,
      trim: fullTrim || bodyClass,
      engine_info: engine_info || undefined,
      vehicle_type: detectedType,
    };
  } catch (err) {
    console.warn('NHTSA VIN decode request failed, falling back to local decoder:', err);
    return {
      year: offlineYear,
      make: offlineMake,
      vehicle_type: detectedType,
    };
  }
}
