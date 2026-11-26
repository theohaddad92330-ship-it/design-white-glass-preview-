/**
 * Un compte qui porte un contact connu ne rend jamais, au même instant, un écran qui affirme « aucun CRM branché »
 * (#4680, décision Louis 28/10/2026).
 *
 * Trois écrans testaient un CONNECTEUR LIVE alors que la donnée était déjà en base : « Confronter avec mon CRM »
 * (« Aucun CRM branché »), l'axe relation de l'onglet Accès (« ton CRM n'est pas connecté »), le badge de présence.
 * À dix centimètres du bandeau « 1 dans ton CRM », ils affirmaient le contraire.
 *
 * CE QUE CETTE GARDE LIT : tout composant qui rend l'une de ces affirmations doit aussi LIRE la présence en base
 * (`knownContacts` de la provenance, ou `imported` de la confrontation). Elle prouve qu’elle lit en trouvant les
 * écrans par leurs clés de traduction. Elle SAIT DIRE NON : le détecteur est essayé sur un composant qui ne lit
 * rien. Le rendu (compte importé → pas de « Aucun CRM branché » ; ni connecteur ni import → le message reste) est
 * tenu par `CrmConfrontationDialog.test.tsx` et `CrmPresenceBadge.test.tsx`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')

/** Les clés de traduction qui AFFIRMENT l'absence de CRM. */
const NO_CRM_CLAIMS = ['confrontation.notConnected', 'addressability.unmeasuredReason']
/** Ce qui prouve que le composant lit aussi la présence en base. */
const READS_KNOWN_PRESENCE = /knownContacts|\.imported\b|isKnownContact/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') sourceFiles(full, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

function claimsNoCrmWithoutReadingKnown(source: string): boolean {
  return NO_CRM_CLAIMS.some(key => source.includes(key)) && !READS_KNOWN_PRESENCE.test(source)
}

describe('un compte qui porte un contact connu ne dit jamais « aucun CRM branché »', () => {
  const files = sourceFiles(join(WEB_SRC, 'features'))
  const claimants = files.filter(file => NO_CRM_CLAIMS.some(key => readFileSync(file, 'utf8').includes(key)))

  it('la garde LIT quelque chose : elle retrouve les écrans qui affirment l’absence de CRM', () => {
    const names = claimants.map(file => file.slice(file.lastIndexOf('/') + 1))
    expect(names).toEqual(expect.arrayContaining(['CrmConfrontationDialog.tsx', 'TabAccess.tsx']))
  })

  it('chacun de ces écrans lit aussi la présence en base', () => {
    const offenders = claimants.filter(file => claimsNoCrmWithoutReadingKnown(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('SAIT DIRE NON — un écran qui affirmerait l’absence sans rien lire est refusé', () => {
    const blind = "t('confrontation.notConnected.title')"
    expect(claimsNoCrmWithoutReadingKnown(blind)).toBe(true)
    expect(claimsNoCrmWithoutReadingKnown(`${blind}; data.imported`)).toBe(false)
  })
})
