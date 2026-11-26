import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import frImpersonation from '../../i18n/locales/fr/impersonation.json'
import enImpersonation from '../../i18n/locales/en/impersonation.json'

// #4423.3 — le texte de la bannière dit ce que la politique BLOQUE réellement.
const POLICY = resolve(__dirname, '../../../../api/src/modules/auth/impersonation-policy.ts')

function blockedPrefixes(): string[] {
  const src = readFileSync(POLICY, 'utf8')
  const body = /const BLOCKED_PREFIXES[^=]*=\s*\[([\s\S]*?)\]/.exec(src)?.[1] ?? ''
  return [...body.matchAll(/'(\/[a-z-]+)'/g)].map(m => m[1] as string)
}

// Chaque préfixe bloqué appartient à une famille nommée dans le texte.
const FAMILLES: ReadonlyArray<{ prefixes: string[]; fr: string; en: string }> = [
  { prefixes: ['/credits'], fr: 'achats', en: 'purchases' },
  { prefixes: ['/workspaces'], fr: 'membres', en: 'members' },
  { prefixes: ['/api-keys'], fr: 'clés', en: 'keys' },
  { prefixes: ['/emails'], fr: 'envois', en: 'sends' },
  {
    prefixes: [
      '/crm',
      '/salesforce',
      '/hubspot',
      '/google',
      '/microsoft',
      '/notion',
      '/pipedrive',
      '/lemlist',
      '/attio',
      '/zoho',
      '/integrations',
    ],
    fr: 'intégrations',
    en: 'integrations',
  },
]

describe('texte d’incarnation ↔ BLOCKED_PREFIXES (#4423.3)', () => {
  it('lit réellement la politique', () => {
    expect(blockedPrefixes()).toContain('/credits')
  })

  it('chaque préfixe bloqué a sa famille nommée dans la bannière (fr et en)', () => {
    const connus = FAMILLES.flatMap(f => f.prefixes)
    for (const prefix of blockedPrefixes()) expect(connus).toContain(prefix)
    for (const f of FAMILLES) {
      expect(frImpersonation.banner.readOnly).toContain(f.fr)
      expect(enImpersonation.banner.readOnly).toContain(f.en)
    }
  })

  it('ne dit jamais « lecture seule » / « read-only »', () => {
    const tout = JSON.stringify([frImpersonation, enImpersonation]).toLowerCase()
    expect(tout).not.toContain('lecture seule')
    expect(tout).not.toContain('read-only')
  })
})
