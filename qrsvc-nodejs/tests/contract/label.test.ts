import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildServer } from '../../src/app'

describe('POST /api/v1/qr — label contract', () => {
  let server: ReturnType<typeof buildServer>

  beforeAll(async () => {
    server = buildServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  it('returns label in response when provided', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label: 'my-label' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.label).toBe('my-label')
  })

  it('omits label from response when not provided', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).not.toHaveProperty('label')
  })

  it('accepts label of 64 characters', async () => {
    const label = 'a'.repeat(64)
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().label).toBe(label)
  })

  it('rejects label of 65 characters with 400 validation error', async () => {
    const label = 'a'.repeat(65)
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label },
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts empty label', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/qr',
      payload: { data: 'hello', label: '' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().label).toBe('')
  })
})
