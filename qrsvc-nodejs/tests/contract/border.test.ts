import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildServer } from '../../src/app'

describe('POST /api/v1/qr — border contract', () => {
  let server: ReturnType<typeof buildServer>

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('defaults border to 4 when not provided', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().border).toBe(4)
  })

  it('reflects explicit border value in response', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', border: 8 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().border).toBe(8)
  })

  it('accepts border = 0', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', border: 0 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().border).toBe(0)
  })

  it('accepts border = 40', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', border: 40 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().border).toBe(40)
  })

  it('rejects border < 0', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', border: -1 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects border > 40', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', border: 41 },
    })
    expect(res.statusCode).toBe(400)
  })
})
