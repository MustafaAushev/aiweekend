import { describe, it, expect } from 'vitest'
import { selectVersion } from './capacity'

describe('selectVersion', () => {
  it.each([
    { data: 'X', ec: 'L' as const, wantVersion: 1, wantSize: 21 },
    { data: 'X'.repeat(17), ec: 'L' as const, wantVersion: 1, wantSize: 21 },
    { data: 'X'.repeat(18), ec: 'L' as const, wantVersion: 2, wantSize: 25 },
    { data: 'X'.repeat(1248), ec: 'L' as const, wantVersion: 40, wantSize: 177 },
    { data: 'X', ec: 'M' as const, wantVersion: 1, wantSize: 21 },
    { data: 'X'.repeat(14), ec: 'M' as const, wantVersion: 1, wantSize: 21 },
    { data: 'X'.repeat(15), ec: 'M' as const, wantVersion: 2, wantSize: 25 },
    { data: 'X', ec: 'H' as const, wantVersion: 1, wantSize: 21 },
    { data: 'X'.repeat(9), ec: 'H' as const, wantVersion: 1, wantSize: 21 },
    { data: 'X'.repeat(10), ec: 'H' as const, wantVersion: 2, wantSize: 25 },
    { data: 'X'.repeat(720), ec: 'H' as const, wantVersion: 40, wantSize: 177 },
    { data: 'X'.repeat(20), ec: 'Q' as const, wantVersion: 2, wantSize: 25 },
  ])('picks version $wantVersion for data length $data.length with EC $ec', ({ data, ec, wantVersion, wantSize }) => {
    const result = selectVersion(data.length, ec)
    expect(result).not.toBeNull()
    expect(result!.version).toBe(wantVersion)
    expect(result!.qr_size).toBe(wantSize)
    expect(result!.error_correction).toBe(ec)
  })

  it.each([
    { data: 'X'.repeat(1249), ec: 'L' as const },
    { data: 'X'.repeat(949), ec: 'M' as const },
    { data: 'X'.repeat(745), ec: 'Q' as const },
    { data: 'X'.repeat(721), ec: 'H' as const },
  ])('returns null for data exceeding capacity ($ec)', ({ data, ec }) => {
    expect(selectVersion(data.length, ec)).toBeNull()
  })

  it('defaults EC to M', () => {
    const result = selectVersion(5)
    expect(result).not.toBeNull()
    expect(result!.error_correction).toBe('M')
  })
})
