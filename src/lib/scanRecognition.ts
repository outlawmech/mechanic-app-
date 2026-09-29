export type ScannedId = { firstName: string; lastName: string; address: string };

export function extractVin(text: string): string | null {
  for (const line of text.toUpperCase().split(/\r?\n/)) {
    const direct = line.match(/(?:^|[^A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?=$|[^A-Z0-9])/);
    if (direct) return direct[1];
    const labeled = line.replace(/^\s*(?:VIN|VEHICLE IDENTIFICATION NUMBER)\s*[:#-]?\s*/, '').replace(/[\s-]/g, '');
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(labeled)) return labeled;
  }
  return null;
}

export function vinCheckDigitMatches(vin: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  const letters: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = [...vin].reduce((total, char, index) => {
    const value = /\d/.test(char) ? Number(char) : letters[char];
    return total + value * weights[index];
  }, 0);
  const check = sum % 11;
  return vin[8] === (check === 10 ? 'X' : String(check));
}

export function parseIdCard(text: string): ScannedId | null {
  // AAMVA PDF417 data uses three-letter field identifiers on separate lines.
  // No license number, birth date, or image is retained by this app.
  const fields = new Map<string, string>();
  for (const line of text.replace(/\r/g, '\n').split('\n')) {
    const match = line.trim().match(/^(DCS|DAB|DAC|DCT|DAD|DAG|DAI|DAJ|DAK)(.+)$/i);
    if (match) fields.set(match[1].toUpperCase(), match[2].trim());
  }
  const firstName = fields.get('DAC') || fields.get('DCT') || '';
  const lastName = fields.get('DCS') || fields.get('DAB') || '';
  const address = [fields.get('DAG'), fields.get('DAI'), fields.get('DAJ'), fields.get('DAK')?.trim()]
    .filter(Boolean).join(', ');
  if (firstName && lastName) return { firstName, lastName, address };

  // Front-of-card OCR varies widely. Only accept clearly labeled fields.
  const lines = text.split(/\r?\n/).map((s) => s.trim());
  const labeled = (label: RegExp) => lines.find((s) => label.test(s))?.replace(label, '').trim() || '';
  const frontFirst = labeled(/^(?:first\s*name|given\s*name)\s*[:\-]?\s*/i);
  const frontLast = labeled(/^(?:last\s*name|family\s*name|surname)\s*[:\-]?\s*/i);
  return frontFirst && frontLast
    ? { firstName: frontFirst, lastName: frontLast, address: labeled(/^address\s*[:\-]?\s*/i) }
    : null;
}

export function partNumberCandidates(text: string): string[] {
  const candidates = text.toUpperCase().match(/[A-Z0-9][A-Z0-9.-]{3,28}/g) || [];
  return [...new Set(candidates.map((s) => s.replace(/^[.-]+|[.-]+$/g, '')))]
    .filter((s) => s.length >= 4 && /\d/.test(s));
}

export async function readBarcodeImage(image: HTMLImageElement): Promise<string | null> {
  const Detector = (window as any).BarcodeDetector;
  if (Detector) {
    try {
      const results = await new Detector().detect(image);
      if (results[0]?.rawValue) return results[0].rawValue.trim();
    } catch { /* Try ZXing when native detection is unavailable for this format. */ }
  }
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const result = await new BrowserMultiFormatReader().decodeFromImageElement(image);
    return result.getText().trim();
  } catch { return null; }
}

export async function recognizeImage(image: File | HTMLCanvasElement): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const base = `${import.meta.env.BASE_URL}ocr/`;
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
  });
  try {
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

export async function fileAsImage(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return { image, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
