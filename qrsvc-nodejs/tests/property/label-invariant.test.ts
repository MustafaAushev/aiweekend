import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fc from 'fast-check'
import { buildServer } from '../../src/app'

describe('POST /api/v1/qr — label property invariants', () => {
  let server: ReturnType<typeof buildServer>

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  // property/нерушимое правило: round-trip — label возвращается байт-в-байт.
  // Ловит инжект-баги: «append suffix», «truncate», «trim», «drop label conditionally»
  it('any label with length in [0..64] is reflected verbatim in 201 response', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 64 }), async (label) => {
        const res = await server.inject({
          method: 'POST',
          url: '/api/v1/qr',
          payload: { data: 'hello', label },
        })
        expect(res.statusCode).toBe(201)
        expect(res.json().label).toBe(label)
      }),
      { numRuns: 200 },
    )
  })

  // ловит инжект-баг №7: «if (hasLabel)» заменить на «if (!hasLabel)» или удалить
  // условие — label должен присутствовать в ответе iff он был в запросе
  it('label present in request ⇒ label present in response (round-trip non-removal)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 64 }), async (label) => {
        const res = await server.inject({
          method: 'POST',
          url: '/api/v1/qr',
          payload: { data: 'hello', label },
        })
        const body = res.json()
        expect(body).toHaveProperty('label')
        expect(body.label).toBe(label)
      }),
      { numRuns: 200 },
    )
  })

  // ловит инжект-баг №8: «always include label» (упало условие hasLabel) —
  // без label в запросе ответ не должен содержать поле label
  it('label absent from request ⇒ label absent from response (non-injection)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 2953 }), async (data) => {
        const res = await server.inject({
          method: 'POST',
          url: '/api/v1/qr',
          payload: { data },
        })
        expect(res.statusCode).toBe(201)
        expect(res.json()).not.toHaveProperty('label')
      }),
      { numRuns: 100 },
    )
  })

  // ловит инжект-баг №9: «maxLength: 64» → «maxLength: 65» (или удалить) —
  // любая строка длиннее 64 обязана давать 400
  it('any label longer than 64 chars is rejected with 400', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 65, max: 500 }), async (len) => {
        const label = 'a'.repeat(len)
        const res = await server.inject({
          method: 'POST',
          url: '/api/v1/qr',
          payload: { data: 'hello', label },
        })
        expect(res.statusCode).toBe(400)
      }),
      { numRuns: 50 },
    )
  })
})
