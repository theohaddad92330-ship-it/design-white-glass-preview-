import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Les pages publiques NOMMENT les traceurs — dans les QUATRE langues.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une page de conformité à moitié traduite est une page FAUSSE dans deux
 * langues. Les quatre locales vivent dans le même fichier, l'une sous l'autre :
 * il suffit d'oublier un `if (locale === …)` pour qu'un visiteur néerlandais
 * lise une politique qui ne dit pas ce qui se charge chez lui.
 *
 * Mesuré le 28/08/2026 : les deux pages ne nommaient AUCUN traceur, dans aucune
 * langue, pendant que `/cookies` promettait que les cookies analytiques sont
 * soumis au consentement préalable.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const COOKIES = `${HERE}../../app/[locale]/cookies/page.tsx`
const PRIVACY = `${HERE}../../app/[locale]/privacy/page.tsx`

/**
 * Les traceurs qui doivent être nommés. Un traceur ajouté s'ajoute ici.
 *
 * ⚠️ « Vercel Speed Insights » (28/08/2026) mesure les performances de
 * chargement des pages, pas l'audience — mais il se charge dans le navigateur du
 * visiteur, derrière la même porte de consentement, donc il se DÉCLARE comme les
 * autres. Ce qui déclenche l'obligation, c'est le chargement chez le visiteur,
 * pas la nature de la mesure.
 */
const TRACKERS = ['Plausible Analytics', 'Vercel Web Analytics', 'Vercel Speed Insights']

/** Les quatre langues du site. */
const LOCALES = 4

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('les pages publiques nomment les traceurs, dans les quatre langues', () => {
  it('LIT quelque chose — les deux pages existent et sont substantielles', () => {
    expect(read(COOKIES).length).toBeGreaterThan(5_000)
    expect(read(PRIVACY).length).toBeGreaterThan(5_000)
  })

  it('les deux pages ont bien QUATRE versions linguistiques', () => {
    // Le dénominateur des tests suivants. S'il tombe à trois, une langue a
    // disparu et « quatre mentions » ne voudrait plus rien dire.
    expect(occurrences(read(COOKIES), '<LegalPage')).toBe(LOCALES)
    expect(occurrences(read(PRIVACY), '<LegalPage')).toBe(LOCALES)
  })

  it('la politique cookies porte une section « traceurs » dans les quatre langues', () => {
    expect(occurrences(read(COOKIES), "id: 'traceurs'")).toBe(LOCALES)
  })

  it.each(TRACKERS)('la politique cookies nomme %s quatre fois', tracker => {
    expect(occurrences(read(COOKIES), tracker)).toBe(LOCALES)
  })

  it.each(TRACKERS)('la politique de confidentialité nomme %s quatre fois', tracker => {
    expect(occurrences(read(PRIVACY), tracker)).toBe(LOCALES)
  })

  it('chaque version dit qu’il faut le consentement — le mot dans SA langue', () => {
    const source = read(COOKIES)
    // Un contrôle par langue, pas un total : quatre occurrences du mot français
    // passeraient un compte global tout en laissant trois langues muettes.
    expect(source).toContain('base légale de ces trois traitements est votre consentement')
    expect(source).toContain('legal basis for all three is your consent')
    expect(source).toContain('Rechtsgrundlage aller drei Verarbeitungen ist Ihre Einwilligung')
    expect(source).toContain('rechtsgrond voor alle drie de verwerkingen is uw toestemming')
  })

  it('ELLE SAIT DIRE NON — un traceur inconnu des pages est signalé', () => {
    // Le canari : si le compteur rendait toujours quatre, les tests ci-dessus
    // seraient verts quoi qu'il arrive.
    expect(occurrences(read(COOKIES), 'Matomo')).toBe(0)
    expect(occurrences(read(PRIVACY), 'Google Analytics')).toBe(0)
  })
})
