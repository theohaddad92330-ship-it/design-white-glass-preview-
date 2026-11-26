import { createPublicKey, type KeyObject } from 'node:crypto'

/**
 * Minimal JWKS resolver for Supabase's asymmetric JWT signing keys — no external
 * dependency (jwks-rsa ships ESM and breaks the CJS/Jest runtime). We fetch the
 * project's JWKS, cache the resolved public keys by `kid`, and convert each JWK
 * to a Node `KeyObject` via the built-in `crypto.createPublicKey({ format: 'jwk' })`.
 *
 * On a cache miss we refetch once (handles key rotation: a new `kid` appears in
 * the JWKS after Supabase rotates). Fetches for the same `kid` are de-duplicated
 * so a burst of requests triggers at most one network call.
 */
type Jwk = { kid?: string; kty?: string; alg?: string; [k: string]: unknown }

export class JwksCache {
  private readonly keys = new Map<string, KeyObject>()
  private inflight: Promise<void> | null = null

  constructor(private readonly jwksUri: string) {}

  async getPublicKey(kid: string): Promise<KeyObject> {
    const cached = this.keys.get(kid)
    if (cached) return cached
    await this.refresh()
    const key = this.keys.get(kid)
    if (!key) throw new Error(`No JWKS signing key for kid=${kid}`)
    return key
  }

  private refresh(): Promise<void> {
    // Coalesce concurrent refreshes into a single fetch.
    if (this.inflight) return this.inflight
    this.inflight = this.doRefresh().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async doRefresh(): Promise<void> {
    const res = await fetch(this.jwksUri)
    if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`)
    const body = (await res.json()) as { keys?: Jwk[] }
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid) continue
      try {
        // Node accepts a JWK directly; works for EC (ES256) and RSA (RS256).
        // Cast via the fn's own param type — the global `JsonWebKey` (DOM lib)
        // and node's crypto `JsonWebKey` differ structurally, but the runtime
        // shape is identical.
        const input = { key: jwk, format: 'jwk' } as unknown as Parameters<typeof createPublicKey>[0]
        this.keys.set(jwk.kid, createPublicKey(input))
      } catch {
        // Skip malformed/unsupported keys rather than failing the whole set.
      }
    }
  }
}
