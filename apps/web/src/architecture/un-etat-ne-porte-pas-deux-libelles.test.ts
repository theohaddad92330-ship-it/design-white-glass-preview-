import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TALENT_POOL_SEGMENTS, TALENT_VIEWS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * GA-384 — UN ÉTAT NE PORTE PAS DEUX LIBELLÉS (GA-26, appliqué structurellement).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT DE FAMILLE (#2697 — « trois défauts nommés »)
 * ─────────────────────────────────────────────────────────────────────────────
 * `derived: 'unknown'` (disponibilité déclarée, aucune affectation ne la
 * confirme) portait DEUX libellés FR : « À revalider » sur le filtre du vivier
 * (`views.to_revalidate`) et le pool de réactivation
 * (`pool.segments.to_revalidate`), « À confirmer » sur le badge de fiche
 * (`staffing.unknown`, déjà lu aussi par l'export CSV). Un commercial qui
 * filtrait sur « À revalider » puis ouvrait une fiche ne retrouvait pas le mot
 * qu'il venait de cliquer — visibles EN MÊME TEMPS de surcroît (choisir la vue
 * rapide POSE `derived: 'unknown'`, qui fait apparaître le rappel de filtre
 * juste en dessous).
 *
 * Corrigé sur `fix/trois-defauts-nommes-22-09` (commit `1606645d6`) :
 * `TalentFilters.tsx` et `TalentPoolView.tsx` (supprimé depuis, #3962) lisent maintenant `staffing.unknown`
 * pour cette valeur, et `views.to_revalidate` / `pool.segments.to_revalidate`
 * SONT RETIRÉES des catalogues — plus d'appelant, plus de second mot possible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VERROUILLE, ET CE QU'ELLE NE PEUT PAS INVENTER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le choix du MOT (« À confirmer » plutôt que « À revalider ») est un
 * arbitrage produit (Louis, #2697) — aucune garde ne peut le déduire du code :
 * `TALENT_VIEWS` porte AUSSI `on_bench` (`derived: 'available'`), dont le mot
 * (« En intercontrat ») DIFFÈRE délibérément de `staffing.available`
 * (« Disponible ») — c'est une reformulation commerciale voulue, pas une
 * dérive. Une garde qui imposerait « même filtre dérivé ⇒ même mot » serait
 * fausse sur `on_bench` en la nommant à tort.
 *
 * Ce que le code SAIT en revanche, sans arbitrage : `TALENT_VIEWS` et
 * `TALENT_POOL_SEGMENTS` sont deux catalogues d'états DISTINCTS qui PARTAGENT
 * des noms (`dormant`, `to_revalidate`, `never_submitted`) — le même segment,
 * vu depuis deux écrans. Le nom partagé n'est pas un hasard de vocabulaire
 * (contrairement à un « unknown » ou un « title » générique, réutilisé des
 * centaines de fois dans le catalogue avec un sens différent à chaque fois) :
 * c'est le MÊME segment. Cette garde verrouille CE point-là — chaque nom
 * partagé entre les deux tableaux dit le MÊME mot, FR et EN — et empêche que
 * `to_revalidate` (ou un futur `dormant`/`never_submitted`) ne re-divergent
 * entre le vivier et le pool par une modification qui n'y penserait pas.
 *
 * ⚠️ Elle ne verrouille PAS l'alias vers `staffing.*` (le badge) : c'est
 * l'arbitrage produit ci-dessus, pas une forme structurelle. Une limite
 * assumée, pas un trou.
 */

const LOCALES = join(__dirname, '..', 'i18n', 'locales')
const LANGUAGES = ['fr', 'en']

type Json = Record<string, unknown>

function loadNamespace(lang: string, namespace: string): Json {
  return JSON.parse(readFileSync(join(LOCALES, lang, `${namespace}.json`), 'utf8')) as Json
}

function label(dict: Json, prefix: string, key: string): string | undefined {
  let cursor: unknown = dict
  for (const part of `${prefix}.${key}`.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(part in (cursor as Json))) return undefined
    cursor = (cursor as Json)[part]
  }
  return typeof cursor === 'string' ? cursor : undefined
}

/** Les noms qui apparaissent dans DEUX tableaux d'énumération — le signal
 *  qu'ils décrivent le même segment, vu depuis deux écrans. Exportée pour la
 *  preuve. */
export function sharedNames(a: readonly string[], b: readonly string[]): string[] {
  const bSet = new Set(b)
  return a.filter(name => bSet.has(name))
}

/** Les divergences trouvées entre deux préfixes i18n pour les noms partagés.
 *  Exportée pour la preuve — c'est elle que le test « sait dire NON » pilote. */
export function labelMismatches(
  namesPartages: readonly string[],
  namespace: string,
  prefixA: string,
  prefixB: string,
  catalogs: Record<string, Json>,
): string[] {
  const offenders: string[] = []
  for (const name of namesPartages) {
    for (const lang of LANGUAGES) {
      const dict = catalogs[`${lang}:${namespace}`]
      if (!dict) continue
      const valeurA = label(dict, prefixA, name)
      const valeurB = label(dict, prefixB, name)
      if (valeurA !== undefined && valeurB !== undefined && valeurA !== valeurB) {
        offenders.push(`${lang}:${namespace}:${prefixA}.${name} ("${valeurA}") ≠ ${prefixB}.${name} ("${valeurB}")`)
      }
    }
  }
  return offenders
}

describe('un état ne porte pas deux libellés (GA-384)', () => {
  const catalogs: Record<string, Json> = {}
  for (const lang of LANGUAGES) catalogs[`${lang}:consultants`] = loadNamespace(lang, 'consultants')

  it('lit un corpus non vide — TALENT_VIEWS et TALENT_POOL_SEGMENTS partagent bien des noms', () => {
    expect(TALENT_VIEWS.length).toBeGreaterThan(3)
    expect(TALENT_POOL_SEGMENTS.length).toBeGreaterThan(3)
    const partages = sharedNames(TALENT_VIEWS, TALENT_POOL_SEGMENTS)
    // Le plancher qui prouve que la garde regarde vraiment quelque chose :
    // `dormant`, `to_revalidate`, `never_submitted` aujourd'hui.
    expect(partages.length).toBeGreaterThanOrEqual(3)
  })

  it('sait dire NON — un nom partagé dont le mot diverge est refusé, nommé', () => {
    const catalogueFautif: Record<string, Json> = {
      'fr:test': { vues: { fantome: 'À revalider' }, segments: { fantome: 'À confirmer' } },
      'en:test': { vues: { fantome: 'To revalidate' }, segments: { fantome: 'To confirm' } },
    }
    expect(labelMismatches(['fantome'], 'test', 'vues', 'segments', catalogueFautif)).toEqual([
      'fr:test:vues.fantome ("À revalider") ≠ segments.fantome ("À confirmer")',
      'en:test:vues.fantome ("To revalidate") ≠ segments.fantome ("To confirm")',
    ])
  })

  it('ne signale rien quand les deux mots concordent', () => {
    const catalogueSain: Record<string, Json> = {
      'fr:test': { vues: { fantome: 'Dormants' }, segments: { fantome: 'Dormants' } },
    }
    expect(labelMismatches(['fantome'], 'test', 'vues', 'segments', catalogueSain)).toEqual([])
  })

  it('les vues du vivier et les segments du pool disent le MÊME mot pour chaque nom partagé, FR et EN', () => {
    const partages = sharedNames(TALENT_VIEWS, TALENT_POOL_SEGMENTS)
    const offenders = labelMismatches(partages, 'consultants', 'views', 'pool.segments', catalogs)
    expect(offenders).toEqual([])
  })
})
