import Fastify from 'fastify'
import { randomUUID } from 'crypto'
import { selectVersion, type ErrorCorrection } from './capacity'

function buildServer() {
  const server = Fastify({ logger: false })

  server.get('/api/v1/health', async () => ({ ok: true }))

  server.post(
    '/api/v1/qr',
    {
      schema: {
        body: {
          type: 'object',
          required: ['data'],
          additionalProperties: false,
          properties: {
            data: { type: 'string', minLength: 1, maxLength: 2953 },
            error_correction: { type: 'string', enum: ['L', 'M', 'Q', 'H'], default: 'M' },
            border: { type: 'integer', minimum: 0, maximum: 40, default: 4 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { data: string; error_correction?: string; border?: number }
      const ec = (body.error_correction ?? 'M') as ErrorCorrection
      const border = body.border ?? 4
      const result = selectVersion(body.data.length, ec)
      if (!result) {
        return reply.status(422).send({ error: 'Data does not fit at the selected error correction level' })
      }
      return reply.status(201).send({
        qr_id: randomUUID(),
        error_correction: ec,
        qr_size: result.qr_size,
        image_url: `https://placeholder.qr/static/${result.version}`,
        border,
      })
    },
  )

  return server
}

export { buildServer }
