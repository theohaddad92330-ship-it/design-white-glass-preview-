import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4472 — le DPA disait « région Railway à confirmer » alors que le code l'écrit : `.railway/railway.ts`
 * fixe `REGION = 'europe-west4-drams3a'` (Pays-Bas). Une région déclarée dans le code ne peut plus rester
 * « à confirmer » dans les pièces juridiques : si elle change, ce test oblige à relire le DPA.
 */
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8')

describe('#4472 — la région Railway du DPA est celle du code', () => {
  const region = /const REGION = '([^']+)'/.exec(read('.railway/railway.ts'))?.[1] ?? ''

  it('le code fixe une région europe-west4 (Pays-Bas)', () => {
    expect(region).toMatch(/^europe-west4/)
  })

  it.each(['agent_docs/legal/dpa.md', 'agent_docs/legal/dpa-a-signer.md'])(
    '%s cite europe-west4 / Pays-Bas pour Railway, jamais « à confirmer »',
    file => {
      const line = read(file)
        .split('\n')
        .find(l => /\bRailway\b/.test(l) && /\|/.test(l))
      expect(line).toBeDefined()
      expect(line).toContain('europe-west4')
      expect(line).toContain('Pays-Bas')
      expect(line).not.toMatch(/à confirmer/i)
    },
  )

  it('le registre ne laisse plus la région Railway à compléter', () => {
    expect(read('agent_docs/legal/registre-des-traitements.md')).not.toMatch(/À COMPLÉTER — région Railway/)
  })

  it('Vercel : le DPA et sa version à signer disent la même chose que le registre (société US, edge)', () => {
    for (const file of ['agent_docs/legal/dpa.md', 'agent_docs/legal/dpa-a-signer.md']) {
      const line = read(file)
        .split('\n')
        .find(l => /\bVercel\b/.test(l) && /\|/.test(l))
      expect(line).toContain('États-Unis')
      expect(line).not.toMatch(/UE \+ Edge|à confirmer/i)
    }
  })

  // #4472 — « avec la date de vérification » : chaque pièce dit QUAND et CONTRE QUOI la localisation
  // d'hébergement a été lue. Une localisation sans source redevient une opinion.
  it.each(['agent_docs/legal/dpa.md', 'agent_docs/legal/dpa-a-signer.md'])(
    '%s date la vérification des localisations et nomme la source du code',
    file => {
      const text = read(file)
      expect(text).toMatch(/Localisations d'hébergement vérifiées le \d{2}\/\d{2}\/\d{4}/)
      expect(text).toContain('.railway/railway.ts')
      expect(text).toContain('vercel.json')
    },
  )

  // Vercel est décrit « États-Unis + edge » PARCE QU'aucun projet ne fixe `regions` (défaut Vercel : iad1,
  // Washington). Le jour où un `vercel.json` en fixe une, ce test oblige à relire les deux pièces.
  it.each(['apps/web/vercel.json', 'apps/website/vercel.json'])('%s ne fixe aucune région de fonctions', file => {
    const config = JSON.parse(read(file)) as Record<string, unknown>
    expect(config['regions']).toBeUndefined()
  })
})
