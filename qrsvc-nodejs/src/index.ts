import { buildServer } from './app'

const server = buildServer()
const port = parseInt(process.env.PORT ?? '0', 10) || 3000

await server.listen({ port, host: '127.0.0.1' })
console.error(`server listening on http://127.0.0.1:${port}`)
