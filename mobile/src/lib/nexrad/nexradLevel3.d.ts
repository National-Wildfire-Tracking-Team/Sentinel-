export interface Level3Radial {
  start: number;
  width: number;
  data: Uint8Array;
}

export interface Level3Scan {
  productCode: number;
  lat: number;
  lon: number;
  heightFt: number;
  vcp: number;
  elevation: number;
  time: number;
  gateKm: number;
  firstGate: number;
  gates: number;
  radials: Level3Radial[];
  valueMin: number;
  valueInc: number;
}

export function parseLevel3(input: ArrayBuffer | Uint8Array): Level3Scan;
export function levelToValue(level: number, scan: Pick<Level3Scan, 'valueMin' | 'valueInc'>): number | null;
