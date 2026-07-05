import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fc from 'fast-check'
import { buildServer } from '../../src/app'

describe('POST /api/v1/qr — label negative & malformed', () => {
  let server: ReturnType<typeof buildServer>

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  // ловит инжект-баг №1: schema.label type:string не enforced — Fastify ajv по
  // умолчанию coerceTypes:true превращает number/boolean/array в строку вместо 400
  it.each([
    { name: 'number', value: 42 },
    { name: 'boolean', value: true },
    { name: 'array', value: ['x'] },
  ])('rejects non-string label ($name) with 400', async ({ value }) => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label: value },
    })
    expect(res.statusCode).toBe(400)
  })

  // ловит инжект-баг №2: label:null мутируется в пустую строку "" (useDefaults/coerce)
  // вместо 400 — null≠"пусто", маскирует намерение клиента
  it('rejects null label with 400 (not coerced to "")', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label: null },
    })
    expect(res.statusCode).toBe(400)
  })

  // ловит инжект-баг №3: object-значение проходит схему? (должно 400)
  it('rejects object label with 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label: { k: 'v' } },
    })
    expect(res.statusCode).toBe(400)
  })

  // ловит инжект-баг №4: additionalProperties:false не enforced — removeAdditional
  // молча вырезает extra-поле вместо 400 (спека обещает strict контракт)
  it('rejects unknown extra field alongside label (additionalProperties:false)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label: 'ok', extra: 1 },
    })
    expect(res.statusCode).toBe(400)
  })

  // ловит инжект-баг №5: инжект «trim label» — реализация вернёт обрезанное значение
  it('preserves whitespace-only label as provided (no trimming)', async () => {
    const label = '   '
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().label).toBe(label)
  })

  // ловит инжект-баг №6: инжект «truncate/normalize unicode» — потери multibyte
  it('preserves unicode / multibyte label verbatim', async () => {
    const label = 'этикетка-qr-ラベル'
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().label).toBe(label)
  })
})
