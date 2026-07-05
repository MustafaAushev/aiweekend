export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H'

export interface VersionResult {
  version: number
  error_correction: ErrorCorrection
  qr_size: number
}

const CAPACITY: Record<ErrorCorrection, number[]> = {
  L: [
    17, 32, 53, 78, 106, 134, 154, 192, 230, 274, 306, 346, 376, 406, 442, 464, 494, 528, 568, 592, 624, 660, 700, 740,
    782, 808, 844, 876, 908, 940, 974, 1000, 1034, 1064, 1100, 1120, 1152, 1192, 1224, 1248,
  ],
  M: [
    14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 236, 262, 293, 317, 341, 367, 387, 408, 439, 458, 483, 507, 535, 564,
    596, 616, 642, 666, 691, 714, 740, 762, 786, 810, 836, 850, 872, 900, 930, 948,
  ],
  Q: [
    11, 20, 32, 48, 65, 82, 95, 118, 141, 167, 186, 202, 226, 244, 261, 283, 300, 316, 341, 357, 377, 398, 418, 439,
    463, 477, 499, 520, 540, 560, 580, 596, 616, 636, 656, 668, 688, 708, 728, 744,
  ],
  H: [
    9, 16, 26, 40, 52, 68, 78, 96, 116, 136, 152, 168, 184, 200, 216, 232, 252, 264, 288, 312, 328, 352, 368, 388, 408,
    432, 452, 480, 504, 528, 544, 564, 580, 596, 628, 640, 660, 676, 696, 720,
  ],
}

export function selectVersion(dataLength: number, ec: ErrorCorrection = 'M'): VersionResult | null {
  const caps = CAPACITY[ec]
  for (let v = 0; v < caps.length; v++) {
    if (dataLength <= caps[v]) {
      return { version: v + 1, error_correction: ec, qr_size: (v + 1) * 4 + 17 }
    }
  }
  return null
}
