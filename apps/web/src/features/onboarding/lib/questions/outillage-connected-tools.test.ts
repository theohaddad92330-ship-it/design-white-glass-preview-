import { describe, expect, it } from 'vitest'
import { TOOLING_INTERNAL_NAMES_MAX, TOOLING_PRESENCE_ABSENT, toolingMapKeysForConnectedTools } from '@bellum/contracts'
import { DEFAULT_QUESTION_CONTEXT } from './types'
import { outillageStep } from './outillage'
import { outillageAnnexeStep } from './outillage-annexe'

/**
 * #2054.19 — une connexion RÉELLE de l'espace retire « Nous n'avons pas cet
 * outil » de SON maillon, jamais des dix autres. `toolingMapKeysForConnectedTools`
 * (contracts) existait déjà, testée, mais SANS appelant dans le wizard — le
 * défaut n°1 du dépôt (du code juste que personne n'appelle). Cette garde
 * échoue tant que `resolveChoices` n'existe pas ou ne retire rien.
 *
 * ⚠️ Le contre-exemple LU au registre (`profile-questionnaire.ts:412` avant
 * #2031.10) masquait la question ENTIÈRE dès qu'UN outil était branché. Ici
 * les onze maillons sont onze questions séparées : la garde vérifie donc
 * aussi qu'un maillon SANS connexion garde son choix « pas cet outil » intact,
 * et qu'un maillon voisin non concerné (`tooling_erp`) ne bouge JAMAIS —
 * aucune source de préremplissage n'existe pour lui (doc `answers-outillage.ts`).
 */
function questionByKey(key: string) {
  const all = [...outillageStep.questions, ...outillageAnnexeStep.questions]
  const question = all.find(q => q.key === key)
  if (!question || question.kind !== 'single') throw new Error(`question ${key} introuvable ou pas 'single'`)
  return question
}

describe('outillage — le préremplissage par connexion (#2054.19)', () => {
  it('CRM connecté : retire « pas cet outil » de tooling_crm, et de lui seul', () => {
    const context = { connectedToolingMapKeys: toolingMapKeysForConnectedTools([{ family: 'crm' }]) }
    const crm = questionByKey('tooling_crm')
    const resolved = crm.resolveChoices ? crm.resolveChoices(context) : crm.choices
    expect(resolved.map(c => c.value)).not.toContain(TOOLING_PRESENCE_ABSENT)

    const ats = questionByKey('tooling_ats')
    const resolvedAts = ats.resolveChoices ? ats.resolveChoices(context) : ats.choices
    expect(resolvedAts.map(c => c.value)).toContain(TOOLING_PRESENCE_ABSENT)
  })

  it('sans connexion, chaque maillon garde son échelle complète (« pas cet outil » inclus)', () => {
    const crm = questionByKey('tooling_crm')
    const resolved = crm.resolveChoices ? crm.resolveChoices(DEFAULT_QUESTION_CONTEXT) : crm.choices
    expect(resolved.map(c => c.value)).toContain(TOOLING_PRESENCE_ABSENT)
  })

  it('les maillons sans source de préremplissage (#2054.19, doc answers-outillage.ts) ignorent le contexte', () => {
    const context = {
      connectedToolingMapKeys: toolingMapKeysForConnectedTools([
        { family: 'crm' },
        { family: 'ats' },
        { family: 'email' },
        { family: 'calendar' },
        { family: 'documents' },
        { family: 'jobs' },
      ]),
    }
    for (const key of [
      'tooling_erp',
      'tooling_spreadsheet',
      'tooling_enrichment',
      'tooling_bi',
      'tooling_personal_notes',
    ]) {
      const question = questionByKey(key)
      expect(question.resolveChoices).toBeUndefined()
    }
  })

  it('sait dire NON : une connexion documents retire « pas cet outil » du Drive, mais pas des plateformes', () => {
    const context = { connectedToolingMapKeys: toolingMapKeysForConnectedTools([{ family: 'documents' }]) }
    const drive = questionByKey('tooling_drive')
    const resolvedDrive = drive.resolveChoices ? drive.resolveChoices(context) : drive.choices
    expect(resolvedDrive.map(c => c.value)).not.toContain(TOOLING_PRESENCE_ABSENT)

    const sourcing = questionByKey('tooling_sourcing_platform')
    const resolvedSourcing = sourcing.resolveChoices ? sourcing.resolveChoices(context) : sourcing.choices
    expect(resolvedSourcing.map(c => c.value)).toContain(TOOLING_PRESENCE_ABSENT)
  })
})

/**
 * #4971 — un client dont le CRM / l'ATS / l'ERP est fait MAISON le nomme : un
 * champ de noms libres à l'étape outillage, facultatif, borné par le contrat.
 */
describe('outillage — #4971 nommer ses outils maison', () => {
  const internal = outillageStep.questions.find(q => q.key === 'tooling_internal_names')

  it('pose un champ de noms libres, facultatif, borné par le contrat (#4971.1)', () => {
    // Témoin : la borne vient bien du contrat (un export manquant rendrait
    // `undefined` des deux côtés, et l'égalité ci-dessous serait verte et borgne).
    expect(TOOLING_INTERNAL_NAMES_MAX).toBeGreaterThan(0)
    expect(internal?.kind).toBe('tags')
    expect(internal?.optional).toBe(true)
    expect(internal && 'max' in internal ? internal.max : undefined).toBe(TOOLING_INTERNAL_NAMES_MAX)
  })

  it('un outil maison NOMMÉ ne passe jamais pour « branché » (#4971.2)', () => {
    // Le contexte ne vient QUE des connexions réelles de l'espace
    // (`OnboardingWizard` → `toolingMapKeysForConnectedTools(tools)`) : un nom
    // saisi n'en est pas une. Sans connexion, chaque maillon garde « pas cet
    // outil » — rien n'est confirmé à la place de la personne.
    const context = { connectedToolingMapKeys: toolingMapKeysForConnectedTools([]) }
    for (const question of outillageStep.questions) {
      if (question.kind !== 'single' || !question.resolveChoices) continue
      expect(
        question.resolveChoices(context).map(c => c.value),
        question.key,
      ).toContain(TOOLING_PRESENCE_ABSENT)
    }
    // Et le champ lui-même n'a aucun lien avec une connexion.
    expect(internal && 'resolveChoices' in internal).toBe(false)
  })
})
