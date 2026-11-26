import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lookupTitle, normalizeTitleKey } from '@bellum/contracts'

/**
 * GA-55 — LA FORME D'UNE CLÉ DE TITRE VIT À UN SEUL ENDROIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La taxonomie des titres (`title-taxonomy.ts`) indexe 298 clés sous UNE forme
 * — déaccentuée, en minuscules, espaces compactés — et son commentaire dit
 * depuis le premier jour pourquoi elle est exportée :
 *
 *   « la même normalisation que le classifieur de contacts, pour que deux
 *     modules ne divergent pas sur la forme d'une clé. »
 *
 * Le classifieur en gardait pourtant une COPIE, dans le fichier même qui
 * importe `lookupTitle` — donc les deux normalisations tournaient côte à côte
 * sur la même chaîne. Tant qu'elles sont identiques, rien ne se voit ; le jour
 * où l'une apprend quelque chose (les tirets insécables, les points d'une
 * abréviation, un `’` typographique), le classifieur cherche une clé sous une
 * forme que la table n'a pas, et le titre devient « famille inconnue ». Pas une
 * erreur : un silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'interdit pas au classifieur de normaliser AUTRE CHOSE — une raison
 * sociale, un domaine. Elle interdit de redéfinir la forme d'une clé de titre.
 */

const CLASSIFIER = join(__dirname, 'contact-classifier.ts')

function classifierSource(): string {
  return readFileSync(CLASSIFIER, 'utf8')
}

/**
 * Le fichier déclare-t-il SA PROPRE déaccentuation ?
 *
 * On cherche la signature technique — `normalize('NFD')` suivi d'un retrait des
 * diacritiques — hors commentaires. Chercher le mot « normalise » trouverait la
 * phrase qui explique qu'on ne le fait plus.
 */
export function declaresOwnDeaccent(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  return /normalize\(\s*'NFD'\s*\)/.test(code)
}

describe('GA-55 — la garde LIT vraiment le classifieur, et sait dire NON', () => {
  it('lit le fichier du classifieur, et son corpus n’est pas vide', () => {
    const source = classifierSource()
    expect(source.length).toBeGreaterThan(3_000)
    expect(source).toContain('lookupTitle')
  })

  it('le détecteur sait dire NON : une déaccentuation recopiée est vue', () => {
    const tampered = `function normalize(raw: string) { return raw.normalize('NFD').replace(/x/g, '') }\n${classifierSource()}`
    expect(declaresOwnDeaccent(tampered)).toBe(true)
  })

  it('le détecteur ne prend pas un commentaire pour du code', () => {
    expect(declaresOwnDeaccent(`/* on n'écrit plus normalize('NFD') ici */\nconst x = 1`)).toBe(false)
    expect(declaresOwnDeaccent(`// normalize('NFD') a été retiré\nconst x = 1`)).toBe(false)
  })
})

describe('GA-55 — la forme d’une clé de titre vit à un seul endroit', () => {
  it('le classifieur ne redéclare pas la normalisation des clés', () => {
    if (declaresOwnDeaccent(classifierSource())) {
      throw new Error(
        [
          '`apps/api/src/modules/contacts/contact-classifier.ts` redéclare la',
          'normalisation d’une clé de titre.',
          '',
          'Elle vit dans `packages/contracts/src/schemas/title-taxonomy.ts`',
          '(`normalizeTitleKey`), qui indexe les 298 clés sous CETTE forme — et',
          'dont le commentaire dit depuis le premier jour qu’elle est exportée',
          'pour le classifieur.',
          '',
          'Deux formes qui divergent ne lèvent pas d’erreur : le classifieur',
          'cherche une clé que la table n’a pas, et le titre devient « famille',
          'inconnue ».',
        ].join('\n'),
      )
    }
    expect(declaresOwnDeaccent(classifierSource())).toBe(false)
  })

  it('la clé cherchée par le classifieur est celle que la table indexe', () => {
    // Le titre est écrit comme un humain l'écrit : accents, casse, espaces en trop.
    expect(normalizeTitleKey('  Directeur   des   Systèmes  d’Information  ')).toBe(
      'directeur des systemes d’information',
    )
    // Et cette forme-là est bien celle qui ouvre la table.
    expect(lookupTitle('  CHIEF   Executive Officer ')?.canonical).toBe('Chief Executive Officer')
    // Un titre hors table ne se devine pas — il n'a pas d'entrée, pas une entrée vide.
    expect(lookupTitle('Développeur')).toBeNull()
  })
})
