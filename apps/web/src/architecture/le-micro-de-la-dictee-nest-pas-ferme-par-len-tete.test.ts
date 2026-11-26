import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Louis 21/10 — « Micro refusé » sur Chrome alors que le micro était autorisé. Cause : `vercel.json`
 * servait `Permissions-Policy: microphone=()`, qui interdit le micro au site lui-même, AVANT toute
 * question à l'utilisateur — `getUserMedia` échoue en `NotAllowedError` quoi qu'il ait accepté.
 * La dictée de Laura (`features/chat/voice/VoiceInput.tsx`) a besoin du micro sur NOTRE origine.
 */
const vercel = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const policies = vercel.headers.flatMap(rule =>
  rule.headers.filter(header => header.key.toLowerCase() === 'permissions-policy').map(header => header.value),
)

describe('le micro de la dictée n’est pas fermé par l’en-tête de sécurité', () => {
  it('lit bien un Permissions-Policy dans vercel.json', () => {
    expect(policies.length).toBeGreaterThan(0)
  })

  it.each(policies)('« %s » autorise le micro à notre origine', policy => {
    const microphone = policy.match(/microphone=\(([^)]*)\)/)
    expect(microphone, 'microphone absent : autorisé par défaut, mais à dire explicitement').not.toBeNull()
    expect(microphone?.[1]).toContain('self')
  })
})
