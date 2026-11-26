import { describe, expect, it } from 'vitest'
import {
  MEMORY_DECLARED_CORRECTIONS,
  MEMORY_DECLARED_OBJECTIVE_KEYS,
  MEMORY_LEDGER_SECTIONS,
  memoryDeclaredCorrectionOf,
  memoryLedgerSectionOf,
} from './memory-ledger-sections.js'
import { PROFILE_QUESTIONS } from './profile-questionnaire.js'
import type { MemoryLedgerEntry } from './memory-ledger.js'

/**
 * #1916.6 / .7 / .9 / .10 / .11 — LES SECTIONS de Réglages › Mémoire de Laura.
 *
 * Une section n'est PAS une seconde classification : elle se lit sur ce que la
 * ligne porte déjà (couche, nature, portée, compte, échéance). Ce fichier tient
 * la dérivation, écrite à UN seul endroit (GA-26) — l'écran et la garde de
 * démonstration l'appellent, ils ne la refont pas.
 */

function fact(over: Partial<MemoryLedgerEntry> = {}): MemoryLedgerEntry {
  return {
    id: 'f-1',
    layer: 'facts',
    text: 'x',
    recordedAt: '2026-09-10T09:00:00.000Z',
    accountId: null,
    detail: null,
    expiresAt: null,
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    ...over,
  }
}

describe('memoryLedgerSectionOf — une section se LIT sur la ligne', () => {
  it('suit l’ordre du retour #1916 : préférences, objectifs, règles, compte, corrections, documents, temporaires, équipe', () => {
    expect(MEMORY_LEDGER_SECTIONS).toEqual([
      'personalPreferences',
      'personalObjectives',
      'esnRules',
      'accountContext',
      'corrections',
      'referenceDocuments',
      'temporary',
      'teamContext',
    ])
  })

  /**
   * #1918.2 / #1918.5 — LES DEUX PORTÉES NEUVES ONT CHACUNE LEUR PRÉCÉDENCE.
   *
   * Une conversation temporaire meurt avec son fil — exactement ce que dit déjà
   * « Éléments temporaires » ; une BU / équipe n'est ni toute l'ESN ni un
   * compte, elle a sa propre section.
   */
  it('une conversation temporaire rejoint « Éléments temporaires »', () => {
    expect(memoryLedgerSectionOf(fact({ scope: 'conversation' }))).toBe('temporary')
  })

  it('un fait « ma BU » rejoint « Contexte de ma BU », pas les règles de l’ESN', () => {
    expect(memoryLedgerSectionOf(fact({ scope: 'business_unit' }))).toBe('teamContext')
  })

  it('un compte l’emporte sur la BU et sur la conversation, comme sur toute autre portée', () => {
    expect(memoryLedgerSectionOf(fact({ scope: 'business_unit', accountId: 'account:x' }))).toBe('accountContext')
    expect(memoryLedgerSectionOf(fact({ scope: 'conversation', accountId: 'account:x' }))).toBe('accountContext')
  })

  it('une échéance l’emporte sur la conversation, comme sur toute autre portée', () => {
    expect(memoryLedgerSectionOf(fact({ scope: 'conversation', expiresAt: '2026-12-31T00:00:00.000Z' }))).toBe(
      'temporary',
    )
  })

  it('la couche des préférences libres est la section « Préférences personnelles »', () => {
    expect(memoryLedgerSectionOf({ ...fact(), layer: 'preferences', kind: undefined, scope: undefined })).toBe(
      'personalPreferences',
    )
  })

  it('une préférence épinglée pour soi rejoint la même section', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'preference', scope: 'user' }))).toBe('personalPreferences')
  })

  it('un fait « toi uniquement », sans compte ni échéance, est un objectif personnel', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'fact', scope: 'user' }))).toBe('personalObjectives')
  })

  it('ce qui vaut pour toute l’ESN, sans compte ni échéance, est une règle de l’ESN — fait ou préférence', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'fact', scope: 'workspace' }))).toBe('esnRules')
    expect(memoryLedgerSectionOf(fact({ kind: 'preference', scope: 'workspace' }))).toBe('esnRules')
  })

  it('un élément attaché à un compte est du contexte de compte, quelle que soit sa portée', () => {
    expect(memoryLedgerSectionOf(fact({ accountId: 'a-1', scope: 'user' }))).toBe('accountContext')
    expect(memoryLedgerSectionOf(fact({ accountId: 'a-1', scope: 'workspace', kind: 'preference' }))).toBe(
      'accountContext',
    )
  })

  it('une correction est une correction terrain, avec ou sans compte, pour soi ou pour l’ESN', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'correction', scope: 'workspace' }))).toBe('corrections')
    expect(memoryLedgerSectionOf(fact({ kind: 'correction', scope: 'user', accountId: 'a-1' }))).toBe('corrections')
  })

  it('tout ce qui porte une échéance est temporaire — y compris une correction, et y compris échue', () => {
    expect(memoryLedgerSectionOf(fact({ expiresAt: '2026-12-31T23:59:59.999Z' }))).toBe('temporary')
    expect(memoryLedgerSectionOf(fact({ kind: 'correction', expiresAt: '2026-12-31T23:59:59.999Z' }))).toBe('temporary')
    expect(memoryLedgerSectionOf(fact({ expiresAt: '2020-01-01T00:00:00.000Z' }))).toBe('temporary')
  })

  it('les autres couches n’entrent dans aucune section — elles gardent leur propre groupe', () => {
    for (const layer of ['conversations', 'refusals', 'identity', 'workspace'] as const) {
      expect(memoryLedgerSectionOf({ ...fact(), layer })).toBeNull()
    }
  })

  /**
   * Décision du 13/09 (orchestrateur, Q2) : l'objectif et la cible mensuelle
   * DÉCLARÉS dans le questionnaire de profil quittent « Ce que Laura sait de
   * toi » pour « Objectifs personnels ». Une seule section, jamais deux — la
   * clé déclarée porte la décision, écrite ici une fois.
   */
  it('l’objectif et la cible mensuelle déclarés sont des objectifs personnels — le reste de l’identité non', () => {
    expect(MEMORY_DECLARED_OBJECTIVE_KEYS).toEqual(['sellerGoal', 'monthlyTarget'])
    for (const key of MEMORY_DECLARED_OBJECTIVE_KEYS) {
      expect(memoryLedgerSectionOf({ ...fact(), layer: 'identity', id: key, detail: key })).toBe('personalObjectives')
    }
    // Le témoin : le rôle et le prénom restent dans leur groupe.
    for (const key of ['sellerRole', 'firstName', 'proactivity']) {
      expect(memoryLedgerSectionOf({ ...fact(), layer: 'identity', id: key, detail: key })).toBeNull()
    }
    // Une clé d'objectif sur une AUTRE couche ne change pas de section.
    expect(memoryLedgerSectionOf({ ...fact(), layer: 'workspace', id: 'sellerGoal', detail: 'sellerGoal' })).toBeNull()
  })

  /**
   * Défaut trouvé le 13/09 : le groupe identité renvoyait TOUT vers « Mon
   * compte » (`/settings/profile/identity`), qui n'édite que prénom, nom et
   * e-mail. Chaque ligne déclarée dit désormais où elle se corrige VRAIMENT.
   */
  it('chaque ligne d’identité déclarée dit où elle se corrige — Mon compte, le questionnaire, ou une étape du profil', () => {
    const identity = (detail: string) => ({ layer: 'identity' as const, detail })
    expect(memoryDeclaredCorrectionOf(identity('firstName'))).toEqual({ editedIn: 'account' })
    for (const [key, answer] of [
      ['sellerRole', 'user_role'],
      ['proactivity', 'proactivity_level'],
      ['sellerGoal', 'individual_goal'],
      ['monthlyTarget', 'monthly_target'],
      ['portfolioSize', 'portfolio_size'],
      ['accountsRelationshipStatus', 'accounts_relationship_status'],
      ['salesBlockers', 'sales_blockers'],
    ] as const) {
      expect(memoryDeclaredCorrectionOf(identity(key))).toEqual({ editedIn: 'profileQuestionnaire', answerKey: answer })
    }
    expect(memoryDeclaredCorrectionOf(identity('mainChallenge'))).toEqual({
      editedIn: 'onboardingStage',
      answerKey: 'main_sales_pain',
    })
  })

  it('une destination de questionnaire désigne une question qui EXISTE — jamais une destination devinée', () => {
    const asked = new Set(PROFILE_QUESTIONS.map(question => question.key as string))
    const questionnaireKeys = Object.values(MEMORY_DECLARED_CORRECTIONS).flatMap(correction =>
      correction.editedIn === 'profileQuestionnaire' ? [correction.answerKey] : [],
    )
    expect(questionnaireKeys.length).toBeGreaterThan(0)
    for (const answerKey of questionnaireKeys)
      expect({ answerKey, asked: asked.has(answerKey) }).toEqual({ answerKey, asked: true })
  })

  it('une clé inconnue, ou une autre couche, n’a PAS de destination : on ne renvoie pas au hasard', () => {
    expect(memoryDeclaredCorrectionOf({ layer: 'identity', detail: 'uneCléFuture' })).toBeNull()
    expect(memoryDeclaredCorrectionOf({ layer: 'identity', detail: null })).toBeNull()
    expect(memoryDeclaredCorrectionOf({ layer: 'workspace', detail: 'firstName' })).toBeNull()
    expect(memoryDeclaredCorrectionOf({ layer: 'facts', detail: 'sellerRole' })).toBeNull()
  })

  /**
   * #1962.7/.9/.10 — LES NATURES AJOUTÉES NE SONT PAS DES « OBJECTIFS PERSONNELS ».
   *
   * Le dernier rang de la dérivation renvoyait tout ce qui n'était pas une
   * préférence dans « Objectifs personnels ». Une hypothèse à vérifier, une
   * observation sourcée ou un contexte temporaire y auraient pris le titre
   * d'une section qui dit « ce que tu vises » — un libellé se lit hors
   * contexte. Elles restent hors section, avec leur étiquette de nature sur la
   * ligne, plutôt que rangées sous un nom faux.
   */
  it('une observation sourcée, une hypothèse ou un contexte temporaire ne deviennent pas des « objectifs »', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'sourced_observation' }))).toBeNull()
    expect(memoryLedgerSectionOf(fact({ kind: 'hypothesis' }))).toBeNull()
    expect(memoryLedgerSectionOf(fact({ kind: 'temporary_context' }))).toBeNull()
  })

  it('le témoin : un fait personnel reste un objectif, une préférence reste une préférence', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'fact' }))).toBe('personalObjectives')
    expect(memoryLedgerSectionOf(fact({ kind: 'preference' }))).toBe('personalPreferences')
  })

  /**
   * #1962.5 — une « règle d'ESN » est une règle de l'ESN parce qu'elle est
   * PARTAGÉE : c'est la portée qui la range, pas son nom. Gardée pour soi, elle
   * ne s'affiche pas sous « Règles de l'ESN », qui promet « chaque membre le voit ».
   */
  it('une règle d’ESN partagée va aux règles de l’ESN ; gardée pour soi, elle n’y va pas', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'workspace_rule', scope: 'workspace' }))).toBe('esnRules')
    expect(memoryLedgerSectionOf(fact({ kind: 'workspace_rule', scope: 'user' }))).toBeNull()
  })

  it('un contexte temporaire DATÉ rejoint les éléments temporaires — la date le range, comme avant', () => {
    expect(memoryLedgerSectionOf(fact({ kind: 'temporary_context', expiresAt: '2026-12-31T23:59:59.999Z' }))).toBe(
      'temporary',
    )
  })

  it('un fait servi SANS portée ni nature (API plus ancienne) n’est rangé nulle part plutôt que deviné', () => {
    expect(memoryLedgerSectionOf(fact({ scope: undefined }))).toBeNull()
    expect(memoryLedgerSectionOf(fact({ kind: undefined }))).toBeNull()
  })

  it('« Documents de référence » ne se dérive d’AUCUNE ligne : aucun document n’est gardé dans la mémoire', () => {
    const produced = new Set<string>()
    for (const kind of ['fact', 'preference', 'correction'] as const) {
      for (const origin of ['manual', 'copilot', 'analysis'] as const) {
        for (const scope of ['user', 'workspace', 'business_unit', 'conversation'] as const) {
          for (const accountId of [null, 'a-1']) {
            for (const expiresAt of [null, '2026-12-31T23:59:59.999Z']) {
              const section = memoryLedgerSectionOf(fact({ kind, origin, scope, accountId, expiresAt }))
              if (section) produced.add(section)
            }
          }
        }
      }
    }
    produced.add(memoryLedgerSectionOf({ ...fact(), layer: 'preferences' }) ?? 'none')
    // Le témoin : les SIX autres sections sont bien atteintes par la dérivation.
    expect([...produced].sort()).toEqual(MEMORY_LEDGER_SECTIONS.filter(s => s !== 'referenceDocuments').sort())
  })
})
