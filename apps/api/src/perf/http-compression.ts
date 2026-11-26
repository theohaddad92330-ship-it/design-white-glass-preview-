import compression from 'compression'
import type { Request, RequestHandler, Response } from 'express'

/**
 * Perf P1 — compression HTTP des réponses ≥ 1 Ko, SAUF les flux : un
 * `text/event-stream` (SSE, tours de Laura) compressé est mis en tampon et
 * n'arrive plus au fil de l'eau ; Socket.IO gère lui-même son transport.
 */
export const COMPRESSION_THRESHOLD_BYTES = 1024

export function shouldCompress(req: Request, res: Response): boolean {
  if (
    String(res.getHeader('Content-Type') ?? '')
      .toLowerCase()
      .includes('text/event-stream')
  )
    return false
  if (
    String(req.headers['accept'] ?? '')
      .toLowerCase()
      .includes('text/event-stream')
  )
    return false
  if (req.path.startsWith('/socket.io')) return false
  return compression.filter(req, res)
}

export function httpCompression(): RequestHandler {
  return compression({ threshold: COMPRESSION_THRESHOLD_BYTES, filter: shouldCompress })
}
