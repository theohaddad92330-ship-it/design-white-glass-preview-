import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ecosystemEn from '@/i18n/locales/en/accounts.json'
import ecosystemFr from '@/i18n/locales/fr/accounts.json'

/**
 * GA-335 — AUCUN ÉCRAN NE PEUT DIRE « EN PLACE » SANS PREUVE ATTACHÉE (#2122.37).
 *
 * Numéro vérifié le 15/09/2026 : GA-334 (`sections-du-dossier-portent-ce-quelles-
 * promettent.test.ts`) était le plus haut du dépôt. Si un lot parallèle du même
 * jour l'a pris aussi, c'est à l'intégration de renuméroter — comme les trois
 * lots qui s'étaient partagé GA-332 le 14/09.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE REFUSE, ET POURQUOI IL EST PIRE QU'IL N'EN A L'AIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour nomme quatre phrases : « en place », « travaille chez eux », « est
 * fournisseur », « accepte le rang 2 ». Aucune ne doit pouvoir s'écrire sans
 * preuve attachée. Elles ne sont pas dangereuses parce qu'elles sont fausses :
 * elles le sont parce qu'un commercial les RÉPÈTE en rendez-vous, mot pour mot,
 * et qu'il ne peut plus les retirer. « ALTEN est en place chez vous » face à
 * quelqu'un qui sait que non, c'est le rendez-vous qui s'arrête.
 *
 * `relationMayAssert` (contrats) est le prédicat ; cette garde vérifie que le
 * TEXTE ne le contourne pas. Un prédicat juste qu'aucun libellé ne consulte est
 * le défaut n°1 du dépôt vu depuis l'autre bout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QU'ELLE AUTORISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une traduction de la section Écosystème qui contient l'une des quatre phrases
 * doit PORTER SA PREUVE, c'est-à-dire interpoler `{{proof}}`. C'est la seule
 * forme sous laquelle la phrase reste vraie hors contexte — et un libellé se lit
 * TOUJOURS hors contexte.
 *
 * Et dans le code de la section, aucune de ces phrases n'est écrite en dur :
 * une chaîne hors i18n échapperait à la fois à la règle et à la traduction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES QU'UNE GARDE DOIT DONNER
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle sait dire NON — on casse VOLONTAIREMENT le vrai corpus, et elle rougit.
 * 2. Elle LIT quelque chose — le corpus est compté, et les fichiers relus sont
 *    non vides.
 * 3. Elle n'attrape PAS ce qu'elle ne vise pas — trois témoins de formulations
 *    légitimes voisines, dont une qui PORTE sa preuve.
 */

const WEB_SRC = join(__dirname, '..')
const ECOSYSTEM_DIR = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'ecosystem')

/** Les quatre phrases du retour, dans les deux langues de l'interface. Elles
 *  sont comparées en minuscules, sans expression régulière à drapeau `g` —
 *  `RegExp.test()` avec `g` est STATEFUL, et trois gardes du dépôt s'y sont
 *  déjà trompées. */
const ASSERTIONS = [
  'en place',
  'travaille chez eux',
  'est fournisseur',
  'accepte le rang 2',
  'in place',
  'works there',
  'is a supplier',
  'accepts rank 2',
] as const

/** Ce qui rend la phrase honnête : elle porte sa preuve. */
const PROOF_TOKEN = '{{proof}}'

type Entry = { key: string; value: string }

/** Aplatit un bloc de traduction en couples (clé, valeur) — les valeurs sont ce
 *  qu'un utilisateur LIT, et c'est sur elles que porte la règle. */
function flatten(node: unknown, prefix = ''): Entry[] {
  if (typeof node === 'string') return [{ key: prefix, value: node }]
  if (!node || typeof node !== 'object') return []
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  )
}

/** LE DÉTECTEUR. Une phrase qui affirme doit porter sa preuve — sinon, violation. */
function assertionsSansPreuve(entries: readonly Entry[]): Entry[] {
  return entries.filter(entry => {
    const text = entry.value.toLowerCase()
    const asserts = ASSERTIONS.some(phrase => text.includes(phrase))
    return asserts && !entry.value.includes(PROOF_TOKEN)
  })
}

/** Retire commentaires de bloc et de ligne : un docblock qui CITE la règle n'est
 *  pas un écran qui l'enfreint. Sans ça, la garde rougirait sur sa propre
 *  documentation — le faux positif le plus sûr qui soit. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function ecosystemSource(file: string): string {
  return readFileSync(join(ECOSYSTEM_DIR, file), 'utf8')
}

const FR = flatten(ecosystemFr.ecosystemTop, 'ecosystemTop')
const EN = flatten(ecosystemEn.ecosystemTop, 'ecosystemTop')
const CORPUS = [...FR, ...EN]

describe('GA-335 — la garde LIT quelque chose', () => {
  it('trouve les deux blocs de traduction, appariés, et non vides', () => {
    expect(FR.length).toBeGreaterThan(20)
    expect(EN.map(entry => entry.key).sort()).toEqual(FR.map(entry => entry.key).sort())
    expect(CORPUS.every(entry => entry.value.length > 0)).toBe(true)
  })

  it('trouve les fichiers de la section, et ils portent du code', () => {
    expect(ecosystemSource('AccountEcosystemTop.tsx').length).toBeGreaterThan(1000)
    expect(ecosystemSource('ecosystemRelations.ts').length).toBeGreaterThan(1000)
  })
})

describe('GA-335 — aucune phrase n’affirme sans sa preuve', () => {
  it('le corpus de la section est propre', () => {
    expect(assertionsSansPreuve(CORPUS)).toEqual([])
  })

  it('aucune des quatre phrases n’est écrite en dur dans le code de la section', () => {
    for (const file of ['AccountEcosystemTop.tsx', 'ecosystemRelations.ts']) {
      const code = stripComments(ecosystemSource(file)).toLowerCase()
      for (const phrase of ASSERTIONS) {
        expect(`${file} · ${phrase} · ${code.includes(phrase)}`).toBe(`${file} · ${phrase} · false`)
      }
    }
  })
})

describe('GA-335 — elle sait dire NON', () => {
  it('rougit sur une phrase qui affirme sans preuve', () => {
    expect(
      assertionsSansPreuve([{ key: 'ecosystemTop.x', value: 'Cette société est en place chez ce compte.' }]),
    ).toHaveLength(1)
  })

  it('rougit quand on casse VOLONTAIREMENT le vrai corpus', () => {
    const casse = CORPUS.map((entry, index) =>
      index === 0 ? { ...entry, value: `${entry.value} Elle travaille chez eux.` } : entry,
    )
    expect(assertionsSansPreuve(casse).map(entry => entry.key)).toEqual([CORPUS[0]?.key])
  })

  it('rougit sur chacune des quatre phrases, pas seulement la première', () => {
    for (const phrase of ASSERTIONS) {
      expect(assertionsSansPreuve([{ key: 'ecosystemTop.x', value: `Quelque chose ${phrase} ici.` }])).toHaveLength(1)
    }
  })
})

describe('GA-335 — elle n’attrape PAS ce qu’elle ne vise pas', () => {
  it('laisse passer une phrase qui PORTE sa preuve', () => {
    expect(
      assertionsSansPreuve([{ key: 'ecosystemTop.asserted', value: 'En place chez ce compte — {{proof}}' }]),
    ).toEqual([])
  })

  it('laisse passer les formulations voisines qui n’affirment rien', () => {
    const temoins: Entry[] = [
      { key: 'a', value: 'La place de cette société reste à qualifier.' },
      { key: 'b', value: 'Sans preuve attachée' },
      { key: 'c', value: 'Rang 2 confirmé' },
      { key: 'd', value: 'Deux sources ne disent pas la même chose.' },
    ]
    expect(assertionsSansPreuve(temoins)).toEqual([])
  })
})
