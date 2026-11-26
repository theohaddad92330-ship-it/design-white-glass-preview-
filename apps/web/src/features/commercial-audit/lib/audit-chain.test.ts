import { describe, expect, it } from 'vitest'
import type { ProfileContext } from '@bellum/contracts'
import { commercialTensionRuleIdValues } from '@bellum/contracts'
import {
  AUDIT_CHAIN_STAGE_ORDER,
  AUDIT_CHAIN_STAGE_RULES,
  buildAuditChain,
  findAuditChainBreakLocation,
} from './audit-chain'

/**
 * #2066.1-.10, .17 — LA CHAÎNE FINE, SES NEUF ÉTAPES, ET SES RUPTURES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI NEUF ÉTAPES, ET POURQUOI ELLES REGROUPENT LES 18 RÈGLES AINSI
 * ─────────────────────────────────────────────────────────────────────────
 * Ce chantier remplace la chaîne à six macro-étapes posée par
 * `feat/laudit-rend-ses-tensions-et-ses-axes` (elle-même une étape
 * d'attente, documentée comme telle) par les neuf étapes NOMMÉES par le
 * retour : Contact → Échange → Besoin → Profil → Entretien → Accord →
 * Démarrage → Suivi → Capitalisation. Les 18 règles de `tension-detectors.ts`
 * (12 de #2064, 6 nouvelles de #2066.11-.16) y sont classées par IDENTITÉ de
 * règle, jamais par un mot deviné — voir le docblock de `audit-chain.ts`
 * pour le détail du classement et sa raison.
 *
 * Ce test garde le corollaire du lot : une étape ne ment jamais. Elle est
 * `rupture` seulement si une règle a RÉELLEMENT déclenché, `unknown` quand
 * TOUTES ses règles manquent de signal, jamais `measured` par défaut.
 */

const IDEAL: ProfileContext['idealAccountProfile'] = {
  size: 'eti',
  sectorsPriority: ['Banque', 'Assurance'],
  decisionLevel: 'manager',
  entryStrategy: 'multiThread',
}

describe('buildAuditChain — neuf étapes, jamais plus, jamais moins', () => {
  it('rend TOUJOURS les neuf étapes, dans l’ordre Contact → Capitalisation', () => {
    const stages = buildAuditChain(undefined)
    expect(stages.map(stage => stage.key)).toEqual([...AUDIT_CHAIN_STAGE_ORDER])
    expect(AUDIT_CHAIN_STAGE_ORDER).toHaveLength(9)
    expect(AUDIT_CHAIN_STAGE_ORDER[0]).toBe('contact')
    expect(AUDIT_CHAIN_STAGE_ORDER[AUDIT_CHAIN_STAGE_ORDER.length - 1]).toBe('capitalisation')
  })

  it('sans aucun profil (le cas le plus pauvre du corpus #2070), chaque étape est « inconnu » — jamais « rien à signaler », et aucune conclusion n’est inventée', () => {
    const stages = buildAuditChain(undefined)
    for (const stage of stages) {
      expect(stage.state, stage.key).toBe('unknown')
      expect(stage.ruptures).toEqual([])
    }
    expect(findAuditChainBreakLocation(stages)).toBeNull()
  })

  it('une étape passe à « rupture » quand une de SES règles se déclenche, et porte la preuve', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...IDEAL, sectorsPriority: ['Banque', 'Assurance', 'Retail', 'Énergie'] },
    }
    const stages = buildAuditChain(context)
    const contact = stages.find(stage => stage.key === 'contact')
    expect(contact?.state).toBe('rupture')
    expect(contact?.ruptures).toHaveLength(1)
    expect(contact?.ruptures[0]?.ruleId).toBe('tooManySimultaneousMarkets')
    // #2066.18 — la rupture porte AUSSI une recommandation et un indicateur.
    expect(contact?.ruptures[0]?.recommendation.length).toBeGreaterThan(0)
    expect(contact?.ruptures[0]?.indicator.length).toBeGreaterThan(0)
  })

  it('une étape passe à « mesuré » quand une règle a évalué CLAIR, sans invention', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      messagingStyle: {
        tone: 'consultative',
        messageLength: 'concise',
        valuePropositionAngle: 'Un angle formulé',
        differentiationPoints: ['Un point nommé'],
        avoid: [],
      },
    }
    const stages = buildAuditChain(context)
    const exchange = stages.find(stage => stage.key === 'exchange')
    expect(exchange?.state).toBe('measured')
    expect(exchange?.ruptures).toEqual([])
  })

  it('ne place aucune règle dans deux étapes, et couvre les 18 règles exactement une fois', () => {
    const flat = Object.values(AUDIT_CHAIN_STAGE_RULES).flat()
    expect(flat).toHaveLength(commercialTensionRuleIdValues.length)
    expect(new Set(flat).size).toBe(commercialTensionRuleIdValues.length)
    for (const ruleId of commercialTensionRuleIdValues) expect(flat).toContain(ruleId)
  })

  it('chaque étape porte au moins une règle — aucune étape n’est structurellement condamnée à « inconnu »', () => {
    for (const key of AUDIT_CHAIN_STAGE_ORDER) {
      expect(AUDIT_CHAIN_STAGE_RULES[key].length, key).toBeGreaterThan(0)
    }
  })
})

// #2066.10/.17 — localiser OÙ l'information ou l'action se perd, sans deviner
// une conclusion quand rien n'a été mesuré.
describe('findAuditChainBreakLocation — situer un ENDROIT de la chaîne, jamais une faute', () => {
  it('rend `null` quand aucune étape n’est en rupture', () => {
    const stages = buildAuditChain(undefined)
    expect(findAuditChainBreakLocation(stages)).toBeNull()
  })

  it('situe la PREMIÈRE rupture dans l’ordre de la chaîne, avec l’étape juste avant', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      messagingStyle: {
        tone: 'consultative',
        messageLength: 'concise',
        valuePropositionAngle: 'Un angle formulé',
        differentiationPoints: [],
        avoid: [],
      },
    }
    const stages = buildAuditChain(context)
    const location = findAuditChainBreakLocation(stages)
    expect(location?.brokenKey).toBe('exchange')
    expect(location?.beforeKey).toBe('contact')
  })

  it('`beforeKey` est `null` quand la toute première étape (Contact) est déjà en rupture', () => {
    const context: ProfileContext = {
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: { ...IDEAL, sectorsPriority: ['Banque', 'Assurance', 'Retail', 'Énergie'] },
    }
    const stages = buildAuditChain(context)
    const location = findAuditChainBreakLocation(stages)
    expect(location?.brokenKey).toBe('contact')
    expect(location?.beforeKey).toBeNull()
  })
})
