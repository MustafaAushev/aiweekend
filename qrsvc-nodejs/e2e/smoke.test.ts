import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildServer } from '../src/app'

describe('POST /api/v1/qr e2e smoke', () => {
  let server: ReturnType<typeof buildServer>

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('happy path: returns 201 with all required fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello world', error_correction: 'M' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toHaveProperty('qr_id')
    expect(body).toHaveProperty('error_correction', 'M')
    expect(body).toHaveProperty('qr_size')
    expect(body).toHaveProperty('image_url')
    expect(typeof body.qr_id).toBe('string')
    expect(typeof body.qr_size).toBe('number')
    expect(typeof body.image_url).toBe('string')
  })

  it('happy path: defaults error_correction to M', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'test' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().error_correction).toBe('M')
  })

  it('422 when data exceeds capacity for given EC', async () => {
    const data = 'X'.repeat(950)
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data, error_correction: 'M' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('422 when data exceeds even max capacity (L)', async () => {
    const data = 'X'.repeat(1249)
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data, error_correction: 'L' },
    })
    expect(res.statusCode).toBe(422)
  })
})
