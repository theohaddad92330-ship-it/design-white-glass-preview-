import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import partnersEn from '@/i18n/locales/en/partners.json'
import partnersFr from '@/i18n/locales/fr/partners.json'

/**
 * GA-336 — #2151.52 (16/09/2026) : AUCUN LIBELLÉ N'ÉCRIT « PRÉSENTE CHEZ LE
 * CLIENT » (OU SON ÉQUIVALENT) SANS PREUVE ATTACHÉE.
 *
 * Numéro vérifié le 16/09/2026 : GA-335 (`une-relation-naffirme-rien-sans-
 * preuve.test.ts`) était le plus haut existant. Si un lot parallèle du même
 * jour en pose une aussi, c'est à l'intégration de renuméroter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET POURQUOI CETTE GARDE-CI EST DIFFÉRENTE DE GA-335
 * ─────────────────────────────────────────────────────────────────────────────
 * #2151.52 : « Ne jamais écrire "présente chez le client" sans preuve » — tenu
 * jusqu'ici par la PROSE de `observed.caveat` (« c'est une observation
 * structurelle […] elle ne prouve pas une intervention actuelle »), sans
 * aucune garde d'architecture. GA-335 protège déjà un corpus voisin
 * (`accounts.json` → bloc `ecosystemTop`, quatre phrases : « en place »,
 * « travaille chez eux », « est fournisseur », « accepte le rang 2 ») — mais
 * son corpus est `features/accounts/.../tabs/ecosystem/*`, qui n'inclut PAS
 * `partners.json` ni `TabPartners.tsx`. Un prédicat juste qu'aucun libellé ne
 * consulte est le défaut n°1 du dépôt vu depuis l'autre bout (GA-335) ; ici
 * c'est un CORPUS entier qui n'avait encore AUCUN prédicat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QU'ELLE AUTORISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une traduction de `partners.json` qui contient une des tournures ci-dessous
 * doit PORTER SA PREUVE, c'est-à-dire interpoler `{{proof}}` ou `{{date}}`
 * (la preuve d'une présence observée est souvent SA DATE — `detectedOn` la
 * porte déjà). C'est la seule forme sous laquelle la phrase reste vraie hors
 * contexte, et un libellé se lit TOUJOURS hors contexte.
 *
 * ⚠️ « en place » SEUL n'est PAS banni ici : le corpus actuel l'utilise déjà
 * légitimement en négation (« aucune ESN […] en place ») et en impératif
 * (« Déclare qui est en place »), qui n'affirment aucune présence actuelle.
 * Ce que la règle vise est l'affirmation SITUÉE — « en place CHEZ »,
 * « présente CHEZ » — qui nomme le compte comme le lieu d'une présence
 * actuelle. Bannir « en place » seul attraperait ce que la règle autorise déjà
 * ailleurs dans ce même fichier — la garde n'attrape que ce qu'elle vise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PREUVES QU'UNE GARDE DOIT DONNER
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle sait dire NON — on casse VOLONTAIREMENT le vrai corpus, et elle rougit.
 * 2. Elle LIT quelque chose — le corpus est compté, et les fichiers relus sont
 *    non vides.
 * 3. Elle n'attrape PAS ce qu'elle ne vise pas — des témoins de formulations
 *    légitimes voisines déjà présentes dans le VRAI corpus aujourd'hui.
 */

const WEB_SRC = join(__dirname, '..')
const TAB_PARTNERS = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'TabPartners.tsx')

/**
 * Les tournures qui affirment une présence SITUÉE — « chez » nomme le compte
 * comme le lieu — sans preuve attachée. Des racines, bornées par des lookaround
 * plutôt que `\b` : en JavaScript `\w` est ASCII, donc `\bprésente\b` ne matche
 * rien (aucune frontière de mot entre le « e » accentué et l'espace) —
 * `une-relation-naffirme-rien-sans-preuve.test.ts` et
 * `esn-market-memory-says-what-it-observes.test.ts` l'ont déjà payé. Jamais de
 * drapeau `g` sur `RegExp.test()` : il est STATEFUL, trois gardes du dépôt s'y
 * sont trompées.
 */
const FORBIDDEN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'présente chez', pattern: /(?<![\p{L}])(présente?s? chez|present at)(?![\p{L}])/iu },
  { label: 'en place chez', pattern: /(?<![\p{L}])(en place chez|in place at)(?![\p{L}])/iu },
  { label: 'travaille chez', pattern: /(?<![\p{L}])(travaille(nt)? chez|works? at|working at)(?![\p{L}])/iu },
]

/** Ce qui rend la phrase honnête : elle porte sa preuve — un jeton, ou la date
 *  qui la porte déjà pour `detectedOn`. */
const PROOF_TOKENS = ['{{proof}}', '{{date}}'] as const

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

/** LE DÉTECTEUR. Une phrase qui affirme une présence SITUÉE doit porter sa
 *  preuve — sinon, violation. */
function presenceSansPreuve(entries: readonly Entry[]): Entry[] {
  return entries.filter(entry => {
    const asserts = FORBIDDEN.some(({ pattern }) => pattern.test(entry.value))
    const hasProof = PROOF_TOKENS.some(token => entry.value.includes(token))
    return asserts && !hasProof
  })
}

/** Retire commentaires de bloc et de ligne : un docblock qui CITE la règle
 *  n'est pas un écran qui l'enfreint. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

const FR = flatten(partnersFr, 'partners')
const EN = flatten(partnersEn, 'partners')
const CORPUS = [...FR, ...EN]

describe('GA-336 — la garde LIT quelque chose', () => {
  it('trouve les deux catalogues de traduction, appariés, et non vides', () => {
    expect(FR.length).toBeGreaterThan(20)
    expect(EN.map(entry => entry.key).sort()).toEqual(FR.map(entry => entry.key).sort())
    expect(CORPUS.every(entry => entry.value.length > 0)).toBe(true)
  })

  it('trouve TabPartners.tsx, et il porte du code', () => {
    expect(readFileSync(TAB_PARTNERS, 'utf8').length).toBeGreaterThan(1000)
  })
})

describe('GA-336 — aucune présence SITUÉE n’affirme sans sa preuve', () => {
  it('le catalogue partners.json est propre, dans les deux langues', () => {
    expect(presenceSansPreuve(CORPUS)).toEqual([])
  })

  it('aucune des tournures interdites n’est écrite en dur dans TabPartners.tsx', () => {
    const code = stripComments(readFileSync(TAB_PARTNERS, 'utf8')).toLowerCase()
    for (const { label, pattern } of FORBIDDEN) {
      expect(`TabPartners.tsx · ${label} · ${pattern.test(code)}`).toBe(`TabPartners.tsx · ${label} · false`)
    }
  })
})

describe('GA-336 — elle sait dire NON', () => {
  it('rougit sur une phrase qui affirme une présence chez le client, sans preuve', () => {
    expect(presenceSansPreuve([{ key: 'partners.x', value: 'Cette ESN est présente chez ce compte.' }])).toHaveLength(1)
  })

  it('rougit quand on casse VOLONTAIREMENT le vrai corpus', () => {
    const casse = CORPUS.map((entry, index) =>
      index === 0 ? { ...entry, value: `${entry.value} Elle est en place chez ce client.` } : entry,
    )
    expect(presenceSansPreuve(casse).map(entry => entry.key)).toEqual([CORPUS[0]?.key])
  })

  it('rougit sur chacune des tournures interdites, pas seulement la première', () => {
    for (const { label, pattern } of FORBIDDEN) {
      const value = pattern.source.includes('présente')
        ? 'Cette ESN est présente chez ce compte.'
        : pattern.source.includes('en place chez')
          ? 'Cette ESN est en place chez ce compte.'
          : 'Cette ESN travaille chez ce compte.'
      expect(presenceSansPreuve([{ key: `partners.${label}`, value }]), label).toHaveLength(1)
    }
  })
})

describe('GA-336 — elle n’attrape PAS ce qu’elle ne vise pas', () => {
  it('laisse passer une phrase qui PORTE sa preuve', () => {
    expect(presenceSansPreuve([{ key: 'partners.asserted', value: 'Présente chez ce compte — {{proof}}' }])).toEqual([])
    expect(presenceSansPreuve([{ key: 'partners.dated', value: 'détecté le {{date}}' }])).toEqual([])
  })

  it('laisse passer les formulations légitimes déjà dans le VRAI corpus', () => {
    const temoins: Entry[] = [
      // Négation — `list.empty.title` aujourd'hui.
      { key: 'a', value: 'Je n’ai identifié aucune ESN en place sur ce compte.' },
      // Impératif, sans « chez » adjacent — `list.empty.description` aujourd'hui.
      { key: 'b', value: 'Déclare qui est en place : c’est ce qui décide si on attaque en direct.' },
      // Observation qualifiée — `observed.caveat` aujourd'hui.
      { key: 'c', value: 'C’est une observation structurelle, elle ne prouve pas une intervention actuelle.' },
      // Titre nominal, sans verbe de présence — `list.title` aujourd'hui.
      { key: 'd', value: 'Les ESN présentes' },
    ]
    expect(presenceSansPreuve(temoins)).toEqual([])
  })
})
