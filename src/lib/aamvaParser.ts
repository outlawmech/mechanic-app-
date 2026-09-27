/**
 * Outlaw Shop Systems - AAMVA Driver's License & ID Card PDF417 Parser
 * Complies with AAMVA DL/ID Card Design Standards (Version 1 through 10)
 * Works across all 50 US States, Territories, and Canadian Provinces.
 */

export interface ParsedDriverLicense {
  firstName: string;
  lastName: string;
  middleName?: string;
  fullName: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  fullAddress: string;
  licenseNumber?: string;
  dateOfBirth?: string;
  expirationDate?: string;
  issueDate?: string;
  gender?: string;
  rawText: string;
}

/**
 * Converts ALL CAPS or messy casing to clean Title Case (e.g. "DALE GRIBBLE" -> "Dale Gribble")
 */
function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Formats YYYYMMDD or MMDDYYYY into standard MM/DD/YYYY
 */
function formatBirthDate(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    // If format is YYYYMMDD (starts with 19xx or 20xx)
    if (digits.startsWith('19') || digits.startsWith('20')) {
      const y = digits.slice(0, 4);
      const m = digits.slice(4, 6);
      const d = digits.slice(6, 8);
      return `${m}/${d}/${y}`;
    }
    // Format is MMDDYYYY
    const m = digits.slice(0, 2);
    const d = digits.slice(2, 4);
    const y = digits.slice(4, 8);
    return `${m}/${d}/${y}`;
  }
  return raw;
}

/**
 * Parses raw text read from a Driver's License PDF417 barcode
 */
export function parseAAMVA(raw: string): ParsedDriverLicense | null {
  if (!raw || typeof raw !== 'string') return null;

  const text = raw.trim();
  // Standard AAMVA fields
  let firstName = '';
  let lastName = '';
  let middleName = '';
  let streetAddress = '';
  let streetAddress2 = '';
  let city = '';
  let state = '';
  let postalCode = '';
  let licenseNumber = '';
  let dateOfBirth = '';
  let expirationDate = '';
  let issueDate = '';
  let gender = '';

  // 1. Direct Regex Parsing for AAMVA 3-Letter Field Codes
  const lines = text.split(/[\r\n\x1e\x1c]+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 4) continue;

    // Check 3-letter prefix
    const code = trimmed.slice(0, 3).toUpperCase();
    const val = trimmed.slice(3).trim();

    switch (code) {
      case 'DCS': // Customer Family Name (Last Name)
      case 'DAB':
        if (!lastName) lastName = val;
        break;
      case 'DAC': // Customer First Name
      case 'DCT':
      case 'DDF':
        if (!firstName) firstName = val;
        break;
      case 'DAD': // Customer Middle Name
        if (!middleName) middleName = val;
        break;
      case 'DAG': // Street Address 1
        if (!streetAddress) streetAddress = val;
        break;
      case 'DAH': // Street Address 2
        if (!streetAddress2) streetAddress2 = val;
        break;
      case 'DAI': // City
        if (!city) city = val;
        break;
      case 'DAJ': // State / Jurisdiction (e.g. MT, TX, WA)
        if (!state) state = val.toUpperCase().slice(0, 2);
        break;
      case 'DAK': // Postal / Zip Code
        if (!postalCode) {
          const zipDigits = val.replace(/[^0-9A-Za-z-]/g, '');
          postalCode = zipDigits.length > 5 && /^\d+$/.test(zipDigits) ? zipDigits.slice(0, 5) : zipDigits;
        }
        break;
      case 'DAQ': // Customer ID / DL Number
        if (!licenseNumber) licenseNumber = val;
        break;
      case 'DBB': // Date of Birth
        if (!dateOfBirth) dateOfBirth = formatBirthDate(val);
        break;
      case 'DBA': // Expiration Date
        if (!expirationDate) expirationDate = formatBirthDate(val);
        break;
      case 'DBD': // Issue Date
        if (!issueDate) issueDate = formatBirthDate(val);
        break;
      case 'DBC': // Gender
        if (!gender) gender = val === '1' ? 'Male' : val === '2' ? 'Female' : val;
        break;
    }
  }

  // 2. Secondary Regex Fallback across entire text if structured lines failed
  if (!lastName) {
    const match = text.match(/(?:DCS|DAB)([A-Za-z\s'-]+?)(?:\r|\n|DAC|DAG|DAI|DAJ|DAK|$)/);
    if (match && match[1]) lastName = match[1].trim();
  }
  if (!firstName) {
    const match = text.match(/(?:DAC|DCT|DDF)([A-Za-z\s'-]+?)(?:\r|\n|DAD|DCS|DAG|DAI|DAJ|DAK|$)/);
    if (match && match[1]) firstName = match[1].trim();
  }
  if (!streetAddress) {
    const match = text.match(/DAG([^\r\n\x1e]+)/);
    if (match && match[1]) streetAddress = match[1].trim();
  }
  if (!city) {
    const match = text.match(/DAI([^\r\n\x1e]+)/);
    if (match && match[1]) city = match[1].trim();
  }
  if (!state) {
    const match = text.match(/DAJ([A-Za-z]{2})/);
    if (match && match[1]) state = match[1].toUpperCase();
  }
  if (!postalCode) {
    const match = text.match(/DAK([0-9A-Za-z-]+)/);
    if (match && match[1]) {
      const rawZip = match[1].trim();
      postalCode = rawZip.length > 5 && /^\d+$/.test(rawZip) ? rawZip.slice(0, 5) : rawZip;
    }
  }

  // 3. Name Sanitization & Cleanup
  // In some states (e.g., California, Washington), DCS contains "LAST,FIRST,MIDDLE"
  if (lastName.includes(',') && !firstName) {
    const nameParts = lastName.split(',');
    lastName = nameParts[0].trim();
    firstName = nameParts[1]?.trim() || '';
    if (nameParts[2]) middleName = nameParts[2].trim();
  }

  const cleanFirst = toTitleCase(firstName.replace(/[@#$^&*]/g, ''));
  const cleanLast = toTitleCase(lastName.replace(/[@#$^&*]/g, ''));
  const cleanStreet = toTitleCase(streetAddress.replace(/[@#$^&*]/g, ''));
  const cleanCity = toTitleCase(city.replace(/[@#$^&*]/g, ''));
  const cleanState = state.toUpperCase().trim();

  const fullStreet = streetAddress2 ? `${cleanStreet} ${toTitleCase(streetAddress2)}` : cleanStreet;
  const fullAddress = [
    fullStreet,
    cleanCity,
    cleanState && postalCode ? `${cleanState} ${postalCode}` : cleanState || postalCode,
  ]
    .filter(Boolean)
    .join(', ');

  const fullName = [cleanFirst, cleanLast].filter(Boolean).join(' ');

  if (!cleanFirst && !cleanLast && !cleanStreet) {
    return null;
  }

  return {
    firstName: cleanFirst,
    lastName: cleanLast,
    middleName: toTitleCase(middleName),
    fullName: fullName || 'Driver License Holder',
    streetAddress: fullStreet,
    city: cleanCity,
    state: cleanState,
    postalCode,
    fullAddress,
    licenseNumber,
    dateOfBirth,
    expirationDate,
    issueDate,
    gender,
    rawText: text,
  };
}
