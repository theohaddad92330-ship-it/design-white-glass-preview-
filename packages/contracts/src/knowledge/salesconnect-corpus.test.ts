import { describe, expect, it } from 'vitest'
import {
  SALESCONNECT_AUDIT_RULES,
  SALESCONNECT_CORPUS_GOVERNANCE,
  SALESCONNECT_CORPUS_RULES,
  SALESCONNECT_CYCLE_STAGES,
  SALESCONNECT_HACKS_RULES,
  SALESCONNECT_PITCH_RULES,
} from './salesconnect-corpus.js'

/**
 * BEL-SC-CORPUS (#3250) — le contenu, pas seulement le schéma.
 *
 * Ces tests protègent trois exigences explicites de la tâche : le compte
 * d'entrées (viser l'intégralité des 100 hacks et des étapes de l'audit /
 * stratégie), une source sur CHAQUE entrée, et — la plus critique — l'absence
 * de tout nom de client ou de personne du document original
 * (`session2-audit-strategie.md`) n'importe où dans le corpus.
 */

// Les identités du document source qui ne doivent JAMAIS apparaître ici — le
// client nommé, ses dirigeants et salariés, ses comptes bancaires cibles, et
// les outils tiers qu'il nomme (doctrine : « nos fournisseurs ne se nomment
// jamais », et le refus produit `nom_de_fournisseur_technique_dans_l_app`).
const FORBIDDEN_PROPER_NOUNS = [
  'Skaizen',
  'Théo Haddad',
  'Haddad',
  'Nicolas Cabioch',
  'Cabioch',
  'Olivier Sauvage',
  'Sauvage',
  'Gurvan',
  'Guigui',
  'Hugo',
  'BNP Paribas',
  'Transactis',
  'Dexia',
  'Crédit Agricole',
  'BPCE',
  'Banque de France',
  'Bred',
  'Société Générale',
  'BPI France',
  'Auratem',
  'Boon Manager',
  'Hitek Pro',
  'Kaspr',
  'Hubspot',
  'Lemlist',
  'DoYouBuzz',
  'TurboCV',
  'Jean-Michel.io',
] as const

function corpusText(): string {
  return SALESCONNECT_CORPUS_RULES.flatMap(rule => [
    rule.title,
    rule.recommendation,
    rule.trigger,
    rule.source_document,
    rule.counter_example ?? '',
    rule.stop_condition ?? '',
    ...rule.exceptions,
    ...rule.prerequisites,
  ]).join('\n')
}

describe('BEL-SC-CORPUS — compte d’entrées', () => {
  it('couvre l’intégralité des 100 hacks (101 lignes numérotées dans le document)', () => {
    expect(SALESCONNECT_HACKS_RULES.length).toBe(101)
  })

  it('couvre les étapes de la fiche pitch (structure du call, objections, bonnes pratiques, checklist)', () => {
    expect(SALESCONNECT_PITCH_RULES.length).toBeGreaterThanOrEqual(39)
  })

  it('couvre le cadre méthodologique généralisé de l’audit/stratégie, jamais le dossier client', () => {
    expect(SALESCONNECT_AUDIT_RULES.length).toBeGreaterThanOrEqual(15)
  })

  it('a autant de lignes de gouvernance que de règles', () => {
    expect(SALESCONNECT_CORPUS_GOVERNANCE.length).toBe(SALESCONNECT_CORPUS_RULES.length)
  })

  it('a des rule_id tous uniques', () => {
    const ids = SALESCONNECT_CORPUS_RULES.map(rule => rule.rule_id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('BEL-SC-CORPUS — source sur chaque entrée', () => {
  it('chaque règle porte un source_document non vide, citant le document ET la section', () => {
    for (const rule of SALESCONNECT_CORPUS_RULES) {
      expect(rule.source_document.length).toBeGreaterThan(0)
      expect(rule.source_document).toMatch(/corpus-salesconnect\/.+\.md/)
      expect(rule.source_document).toContain(' — ')
    }
  })

  it('les trois documents sources sont bien représentés, chacun sous son propre fichier', () => {
    const files = new Set(
      SALESCONNECT_CORPUS_RULES.map(rule => rule.source_document.match(/corpus-salesconnect\/([\w.-]+)/)?.[1]),
    )
    expect(files).toEqual(new Set(['bible-salesconnect.md', 'bible-sales-100-hacks.md', 'session2-audit-strategie.md']))
  })
})

describe('BEL-SC-CORPUS — la méthode, pas le dossier', () => {
  it('ne porte aucun nom de client ni de personne du document original', () => {
    const text = corpusText()
    for (const forbidden of FORBIDDEN_PROPER_NOUNS) {
      expect(text).not.toContain(forbidden)
    }
  })

  it('le hack contredisant « jamais de donnée fictive » est SUPERSEDED et désactivé', () => {
    const fakeCv = SALESCONNECT_CORPUS_RULES.find(rule => rule.rule_id === 'sc_hack_14_5')
    expect(fakeCv?.category).toBe('superseded')
    const governance = SALESCONNECT_CORPUS_GOVERNANCE.find(entry => entry.rule_id === 'sc_hack_14_5')
    expect(governance?.enabled).toBe(false)
  })

  it('aucune règle n’affiche une probabilité — la confidence reste qualitative', () => {
    for (const rule of SALESCONNECT_CORPUS_RULES) {
      expect(['low', 'medium', 'high']).toContain(rule.confidence)
    }
  })
})

describe('BEL-SC-CORPUS — classement par étape du cycle commercial', () => {
  it('chaque règle porte une étape reconnue du cycle commercial', () => {
    for (const rule of SALESCONNECT_CORPUS_RULES) {
      expect(rule.applicable_stages.length).toBe(1)
      expect(SALESCONNECT_CYCLE_STAGES).toContain(rule.applicable_stages[0])
    }
  })

  it('les dix étapes du cycle sont toutes représentées par au moins une règle', () => {
    const stagesUsed = new Set(SALESCONNECT_CORPUS_RULES.flatMap(rule => rule.applicable_stages))
    for (const stage of SALESCONNECT_CYCLE_STAGES) {
      expect(stagesUsed.has(stage)).toBe(true)
    }
  })
})

describe('BEL-SC-CORPUS — peuple les catégories laissées vides par BEL-SC-221', () => {
  it('ADAPTIVE_POLICY, PLAYBOOK, CASE_STUDY et COMMERCIAL_CLAIM ont désormais du contenu', () => {
    const byCategory = new Map<string, number>()
    for (const rule of SALESCONNECT_CORPUS_RULES) {
      byCategory.set(rule.category, (byCategory.get(rule.category) ?? 0) + 1)
    }
    expect(byCategory.get('adaptive_policy')).toBeGreaterThan(0)
    expect(byCategory.get('playbook')).toBeGreaterThan(0)
    expect(byCategory.get('case_study')).toBeGreaterThan(0)
    expect(byCategory.get('commercial_claim')).toBeGreaterThan(0)
  })

  it('ne touche jamais la catégorie INVARIANT — réservée à method-delta.ts (BEL-SC-221)', () => {
    expect(SALESCONNECT_CORPUS_RULES.some(rule => rule.category === 'invariant')).toBe(false)
  })
})
