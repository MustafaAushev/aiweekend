// QR code byte-mode capacity table (ISO/IEC 18004).
// Max UTF-8 byte capacity per (version, error_correction_level).
// Version 40 / L == 2953 matches openapi.yaml data.maxLength.

export type EcLevel = "L" | "M" | "Q" | "H";

const BYTE_CAPACITY: Record<EcLevel, number[]> = {
  L: [
    17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520,
    586, 644, 718, 792, 858, 929, 1003, 1091, 1171, 1253, 1321, 1432,
    1503, 1581, 1677, 1782, 1897, 2022, 2157, 2301, 2361, 2524, 2625,
    2735, 2953,
  ],
  M: [
    14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412,
    450, 504, 578, 644, 732, 812, 906, 982, 1029, 1107, 1177, 1274,
    1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431,
    2563, 2699,
  ],
  Q: [
    11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292,
    322, 364, 394, 442, 482, 509, 565, 611, 661, 715, 751, 805, 868,
    908, 982, 1030, 1112, 1168, 1228, 1283, 1351, 1423, 1499, 1579, 1680,
  ],
  H: [
    7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220,
    250, 280, 310, 338, 382, 403, 439, 461, 511, 535, 593, 625, 658,
    698, 742, 790, 842, 892, 942, 982, 1029, 1083, 1137, 1179, 1228,
  ],
};

export const EC_LEVELS: readonly EcLevel[] = ["L", "M", "Q", "H"];
export const MAX_VERSION = 40;
export const MAX_DATA_BYTES = BYTE_CAPACITY.L[BYTE_CAPACITY.L.length - 1]; // 2953

/**
 * Return smallest QR version (1..40) holding dataByteLen bytes for ecLevel.
 * Returns null if no version fits (i.e. payload exceeds version 40 capacity).
 */
export function selectVersion(dataByteLen: number, ecLevel: EcLevel): number | null {
  const capacities = BYTE_CAPACITY[ecLevel];
  for (let i = 0; i < capacities.length; i++) {
    if (dataByteLen <= capacities[i]) {
      return i + 1;
    }
  }
  return null;
}

export function capacity(version: number, ecLevel: EcLevel): number {
  return BYTE_CAPACITY[ecLevel][version - 1];
}
