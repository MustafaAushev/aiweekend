import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fc from 'fast-check'
import { buildServer } from '../../src/app'

describe('POST /api/v1/qr property: error_correction invariant', () => {
  let server: ReturnType<typeof buildServer>

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('error_correction in 201 response equals requested, or 422 otherwise', async () => {
    const ecs: Array<'L' | 'M' | 'Q' | 'H'> = ['L', 'M', 'Q', 'H']

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 2953 }), fc.constantFrom(...ecs), async (data, ec) => {
        const res = await server.inject({
          method: 'POST',
          url: '/api/v1/qr',
          payload: { data, error_correction: ec },
        })

        if (res.statusCode === 201) {
          const body = res.json()
          expect(body.error_correction).toBe(ec)
        } else {
          expect(res.statusCode).toBe(422)
        }
      }),
      { numRuns: 500 },
    )
  })
})
