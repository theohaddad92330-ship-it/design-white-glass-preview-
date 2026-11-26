import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2130.77 — L'ANALYTIQUE PRODUIT N'OPTIMISE JAMAIS LE NOMBRE D'ONGLETS
 * OUVERTS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2130 (corps de l'épopée, section ANALYTICS) : « Ne pas optimiser le nombre
 * d'onglets ouverts. Optimiser la décision et l'action. » Rien n'empêchait
 * aujourd'hui un futur rapport d'ajouter un champ genre `totalTabsOpened` ou
 * `tabsOpenedGoal` présenté comme un KPI en tête de tableau de bord — la même
 * dérive que la doctrine interdit explicitement.
 *
 * ⚠️ Elle ne flague PAS `tab_opened`, le nom d'ÉVÉNEMENT brut (nécessaire :
 * c'est le signal d'entrée que `trackTabOpened` émet et que `screens()` /
 * une future ventilation par section doivent pouvoir LIRE). Elle flague un
 * champ de RAPPORT qui présenterait un COMPTE d'onglets comme une mesure de
 * tête, jamais la présence du nom de l'événement source.
 */

const SERVICE_FILE = join(__dirname, '..', 'modules', 'analytics', 'product-analytics-read.service.ts')

/** Vocabulaire d'un CHAMP DE RAPPORT qui ferait du compte d'onglets un objectif. */
const FORBIDDEN_HEADLINE_METRIC_NAMES: readonly RegExp[] = [
  /\btabsOpenedGoal\b/,
  /\btotalTabsOpened\b/,
  /\bnombreOngletsOuverts\b/,
  /\btabsOpenedCount\b/,
  /\bmaximizeTabsOpened\b/,
]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function source(): string {
  return readFileSync(SERVICE_FILE, 'utf8')
}

describe('#2130.77 — aucun indicateur analytics ne présente le nombre d’onglets ouverts comme un objectif', () => {
  it('LIT quelque chose — le service de lecture analytics existe et n’est pas vide', () => {
    expect(source().length).toBeGreaterThan(500)
  })

  it('aucun champ de rapport ne porte le vocabulaire « compte d’onglets = objectif » aujourd’hui', () => {
    const code = stripComments(source())
    const found = FORBIDDEN_HEADLINE_METRIC_NAMES.filter(pattern => pattern.test(code))
    expect(found.map(String)).toEqual([])
  })

  it('sait dire NON — un futur champ nommé ainsi serait vu', () => {
    const fautif = 'const screens = { totalTabsOpened: bucket.views }'
    expect(FORBIDDEN_HEADLINE_METRIC_NAMES.some(pattern => pattern.test(fautif))).toBe(true)
  })

  it('n’attrape pas le voisin légitime — le nom d’ÉVÉNEMENT source `tab_opened` reste lisible', () => {
    // `tab_opened` est le SIGNAL, pas la mesure de tête — le service en garde
    // la trace (catalogue des événements connus) sans que cette garde s'y
    // oppose : c'est un nom d'événement, pas un champ « objectif ».
    const evenementSource = "'tab_opened',"
    expect(FORBIDDEN_HEADLINE_METRIC_NAMES.some(pattern => pattern.test(evenementSource))).toBe(false)
    expect(source()).toContain("'tab_opened'")
  })
})
