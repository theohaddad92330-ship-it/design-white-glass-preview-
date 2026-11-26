import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Symmetric encryption for third-party OAuth tokens at rest.
 *
 * HubSpot access/refresh tokens are long-lived bearer credentials — a leaked DB
 * dump must not hand them out in clear. We store them AES-256-GCM encrypted.
 *
 * The 32-byte key is derived (scrypt) from a secret, in priority order:
 *   CRM_TOKEN_ENC_KEY  → dedicated key (recommended in prod)
 *   INTERNAL_API_SECRET → already a shared high-entropy secret
 *   HUBSPOT_CLIENT_SECRET → last resort (present whenever HubSpot is configured)
 * When none is set the CRM integration is not configured at all, so decryption
 * is never exercised — `deriveKey` only throws if asked to work without material.
 *
 * Serialized form: `v1:<iv b64>:<authTag b64>:<ciphertext b64>` — versioned so
 * the scheme can evolve without ambiguity.
 */

const ALGO = 'aes-256-gcm'
const SCRYPT_SALT = 'bellum.crm.token.v1'
const PREFIX = 'v1'

function secretMaterial(): string {
  const secret =
    process.env['CRM_TOKEN_ENC_KEY']?.trim() ||
    process.env['INTERNAL_API_SECRET']?.trim() ||
    process.env['HUBSPOT_CLIENT_SECRET']?.trim()
  if (!secret) {
    throw new Error('CRM token encryption requires CRM_TOKEN_ENC_KEY, INTERNAL_API_SECRET or HUBSPOT_CLIENT_SECRET')
  }
  return secret
}

function deriveKey(): Buffer {
  return scryptSync(secretMaterial(), SCRYPT_SALT, 32)
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [PREFIX, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptToken(serialized: string): string {
  const parts = serialized.split(':')
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Malformed encrypted token')
  }
  const [, ivB64, tagB64, dataB64] = parts
  const key = deriveKey()
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
