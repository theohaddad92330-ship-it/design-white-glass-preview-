import { OUR_SUPPLIERS, supplierNamesIn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { resources } from '@/i18n/resources'
import { DATA_SOURCE_LABEL_KEYS, dataSourceLabel, dataSourceLabels, signalSourceLabel } from './data-source-label'

/**
 * #1912 — un identifiant de source affiché tel quel nommait NOTRE fournisseur :
 * « Non appliqué par pappers » sur Découvrir. La table ci-dessous est le seul
 * endroit où un identifiant de source devient un texte. Elle rend la CAPACITÉ
 * pour un fournisseur, le nom pour un registre PUBLIC (D354 : le nom est la
 * garantie), et un libellé générique pour tout le reste — jamais l'identifiant.
 */

type Lang = 'fr' | 'en'

/** Un traducteur qui lit le VRAI catalogue, sans monter i18next. */
function translator(lang: Lang) {
  return (key: string): string => {
    const [namespace = '', path = ''] = key.split(':')
    let node: unknown = (resources as unknown as Record<string, Record<string, unknown>>)[lang]?.[namespace]
    for (const part of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
    return typeof node === 'string' ? node : `MISSING:${key}`
  }
}

/** Ce que l'IA émet vraiment comme `source`, en plus des identifiants du registre d'outils. */
const EMITTED_ALIASES = ['claude', 'apollo_enrich', 'brave_search', 'recherche_entreprises', 'data_gateway']

const supplierIds = [
  ...OUR_SUPPLIERS.flatMap(supplier => (supplier.provider ? [supplier.provider] : [])),
  ...OUR_SUPPLIERS.map(supplier => supplier.brand.toLowerCase()),
  ...OUR_SUPPLIERS.map(supplier => supplier.brand.toUpperCase()),
  'claude',
  'apollo_enrich',
  'brave_search',
]

describe('dataSourceLabel — un identifiant de source ne s’affiche jamais tel quel', () => {
  it('LIT — la table couvre les sources émises, et chaque libellé existe en FR et en EN', () => {
    const keys = [...new Set(Object.values(DATA_SOURCE_LABEL_KEYS))]
    expect(Object.keys(DATA_SOURCE_LABEL_KEYS).length).toBeGreaterThanOrEqual(25)
    for (const lang of ['fr', 'en'] as const) {
      for (const key of [...keys, 'unknown']) {
        expect(translator(lang)(`common:dataSources.${key}`), `${lang} ${key}`).not.toMatch(/^MISSING:/)
      }
    }
  })

  it('chaque fournisseur du registre d’outils et chaque alias émis a une entrée EXPLICITE', () => {
    const explicit = [
      ...OUR_SUPPLIERS.flatMap(supplier => (supplier.provider ? [supplier.provider] : [])),
      ...EMITTED_ALIASES,
    ]
    const unmapped = explicit.filter(id => !(id.toLowerCase().replace(/[\s_]+/g, '-') in DATA_SOURCE_LABEL_KEYS))
    expect(unmapped).toEqual([])
  })

  it.each(['fr', 'en'] as const)('sait dire NON (%s) — aucun fournisseur, en aucune casse, ne ressort', lang => {
    const t = translator(lang)
    for (const id of supplierIds) {
      const label = dataSourceLabel(t, id)
      expect(supplierNamesIn(label), `${id} → « ${label} »`).toEqual([])
      expect(label.toLowerCase(), `${id} → « ${label} »`).not.toContain(id.toLowerCase())
    }
    // …et le détecteur voit bien la phrase que l'écran écrivait avant ce lot.
    expect(supplierNamesIn('Non appliqué par pappers — les résultats sont plus larges que demandé.')).toEqual([
      'Pappers',
    ])
  })

  it('une source inconnue, vide ou absente rend un libellé générique — jamais l’identifiant', () => {
    const t = translator('fr')
    expect(dataSourceLabel(t, 'une-source-de-demain')).toBe('une source de données')
    expect(dataSourceLabel(t, '')).toBe('une source de données')
    expect(dataSourceLabel(t, null)).toBe('une source de données')
    expect(dataSourceLabel(translator('en'), 'une-source-de-demain')).toBe('a data source')
  })

  it('normalise la casse, les espaces et les tirets bas', () => {
    const t = translator('fr')
    expect(dataSourceLabel(t, ' PAPPERS ')).toBe(dataSourceLabel(t, 'pappers'))
    expect(dataSourceLabel(t, 'Brave_Search')).toBe(dataSourceLabel(t, 'brave'))
    expect(dataSourceLabel(t, 'recherche_entreprises')).toBe(dataSourceLabel(t, 'recherche-entreprises'))
  })

  it('un registre PUBLIC se dit par sa NATURE, plus par son nom (#4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10)', () => {
    const t = translator('fr')
    expect(dataSourceLabel(t, 'France Travail')).toBe('les offres d’emploi publiques')
    expect(dataSourceLabel(t, 'BOAMP')).toBe('les avis de marchés publics')
    expect(dataSourceLabel(t, 'DECP')).toBe('les données de la commande publique')
    expect(dataSourceLabel(t, 'recherche-entreprises')).toBe('le registre public des entreprises')
    // #2616.1 — mesuré en production le 22/09/2026 : `candidate.sources` de
    // Découvrir porte déjà `sourceLabel: "APEC"` (branché le 21/09) et
    // `"Welcome to the Jungle"` (ce lot), mais ni l'un ni l'autre n'étaient
    // dans cette table — la ligne « Sources : » de la carte les rendait
    // « une source de données », effaçant le registre public qui a
    // réellement produit le signal (même défaut que #1912, sur un voisin).
    expect(dataSourceLabel(t, 'APEC')).toBe('les offres d’emploi publiques')
    expect(dataSourceLabel(t, 'Welcome to the Jungle')).toBe('les offres d’emploi publiques')
    // #4067 (DECOUVRIR-COLLECTE, 13/10) — les actualités rattachées, désormais lues
    // pour chaque carte : une dégradation `press` dit la NATURE, jamais le média.
    expect(dataSourceLabel(t, 'press')).toBe('la presse (actualités récentes)')
    expect(dataSourceLabel(translator('en'), 'press')).toBe('the press (recent news)')
  })

  it('dédoublonne deux sources qui rendent la même capacité', () => {
    const t = translator('fr')
    expect(dataSourceLabels(t, ['hunter', 'lusha', 'pappers', 'hunter'])).toEqual([
      'la source d’enrichissement',
      'la source de données d’entreprises',
    ])
  })
})

/**
 * #1912.11 — la source d'un SIGNAL n'est pas un identifiant : c'est du texte
 * LIBRE écrit par le modèle. « Les Échos » est une preuve et doit s'afficher
 * telle quelle ; « pappers » est NOTRE fournisseur et ne se nomme jamais.
 * `dataSourceLabel` seul ne peut pas trancher : il rendrait « une source de
 * données » pour un titre de presse, ce qui EFFACERAIT une information vraie.
 */
describe('signalSourceLabel — le texte libre d’une source de signal', () => {
  it('LIT quelque chose — le détecteur de fournisseurs voit bien les marques qu’on lui donne', () => {
    expect(OUR_SUPPLIERS.length).toBeGreaterThan(10)
    expect(supplierNamesIn('Pappers')).toEqual(['Pappers'])
  })

  it.each(['fr', 'en'] as const)('sait dire NON (%s) — aucun de nos fournisseurs ne ressort', lang => {
    const t = translator(lang)
    // ⚠️ Limite CONNUE, portée par le contrat et non par ce module : la marque
    // d'un fournisseur qui est AUSSI un mot ordinaire (`ordinaryWord`) n'est vue
    // qu'avec sa majuscule ou sous sa forme longue — sinon « the railway
    // station » serait rédigé. Sa forme minuscule est donc écartée ici, et le
    // témoin ci-dessous épingle la forme qui, elle, DOIT être vue.
    const ordinary = new Set(OUR_SUPPLIERS.filter(s => s.ordinaryWord).map(s => s.brand.toLowerCase()))
    for (const id of supplierIds.filter(candidate => !ordinary.has(candidate.toLowerCase()))) {
      const label = signalSourceLabel(t, id) ?? ''
      expect(supplierNamesIn(label), `${id} → « ${label} »`).toEqual([])
      expect(label.toLowerCase(), `${id} → « ${label} »`).not.toContain(id.toLowerCase())
    }
    for (const supplier of OUR_SUPPLIERS.filter(s => s.ordinaryWord)) {
      const label = signalSourceLabel(t, supplier.brand) ?? ''
      expect(supplierNamesIn(label), `${supplier.brand} → « ${label} »`).toEqual([])
    }
  })

  it('sait dire NON — le nom cité dans une phrase, ou collé au nom de section du prompt', () => {
    const t = translator('fr')
    expect(signalSourceLabel(t, 'legal_pappers')).toBe('la source de données d’entreprises')
    expect(signalSourceLabel(t, 'Pappers.fr')).toBe('la source de données d’entreprises')
    expect(signalSourceLabel(t, 'Recherche via Brave Search')).toBe('la recherche web')
  })

  it('n’attrape pas ce qu’elle ne vise pas — un titre de presse reste une preuve', () => {
    const t = translator('fr')
    expect(signalSourceLabel(t, 'Les Échos')).toBe('Les Échos')
    expect(signalSourceLabel(t, 'L’Agefi')).toBe('L’Agefi')
    expect(signalSourceLabel(t, 'Site officiel de l’entreprise')).toBe('Site officiel de l’entreprise')
  })

  it('un registre PUBLIC se dit par sa NATURE, plus par son nom (#4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10)', () => {
    const t = translator('fr')
    expect(signalSourceLabel(t, 'BODACC')).toBe('les annonces légales')
    expect(signalSourceLabel(t, 'France Travail')).toBe('les offres d’emploi publiques')
    expect(signalSourceLabel(t, 'BOAMP')).toBe('les avis de marchés publics')
  })

  it('rien à lire vaut `null` — l’écran dit « source inconnue », il n’invente pas', () => {
    const t = translator('fr')
    expect(signalSourceLabel(t, '')).toBeNull()
    expect(signalSourceLabel(t, '   ')).toBeNull()
    expect(signalSourceLabel(t, null)).toBeNull()
    expect(signalSourceLabel(t, undefined)).toBeNull()
  })
})
