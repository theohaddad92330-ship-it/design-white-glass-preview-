import { describe, expect, it } from 'vitest'
import {
  approvedMessageTemplateSchema,
  approvedTemplateCandidatesResponseSchema,
  renderApprovedTemplate,
  scenarioForApprovedTemplateRelationship,
  templateReadiness,
} from './approved-message-templates.js'

const BASE_TEMPLATE = {
  id: '11111111-1111-1111-1111-111111111111',
  scenario: 'invitation_acceptee' as const,
  channel: 'linkedin' as const,
  persona: null,
  sequenceStep: 1,
  delayDays: 0,
  version: 1,
  source: 'méthode conquête ESN v3',
  exactText: 'Merci pour la connexion {{prenom}} ! Je vois que {{entreprise}} avance sur ce sujet.',
  variables: ['prenom', 'entreprise'],
  requiredEvidence: ['recent_signal'],
  forbiddenClaims: ['expertise reconnue'],
  status: 'active' as const,
}

describe('approvedMessageTemplateSchema — #3417', () => {
  it('accepte un modèle complet', () => {
    expect(approvedMessageTemplateSchema.safeParse(BASE_TEMPLATE).success).toBe(true)
  })
})

describe('renderApprovedTemplate — #3417.5 jamais une variable inventée', () => {
  it('substitue le texte exact quand toutes les variables sont connues', () => {
    const result = renderApprovedTemplate(BASE_TEMPLATE, { prenom: 'Gerald', entreprise: 'Société Générale' })
    expect(result).toEqual({
      ok: true,
      text: 'Merci pour la connexion Gerald ! Je vois que Société Générale avance sur ce sujet.',
    })
  })

  it('refuse et NOMME la variable manquante plutôt que de la deviner', () => {
    const result = renderApprovedTemplate(BASE_TEMPLATE, { prenom: 'Gerald', entreprise: '' })
    expect(result).toEqual({ ok: false, missingVariables: ['entreprise'] })
  })

  it('refuse quand aucune valeur n’est fournie du tout', () => {
    const result = renderApprovedTemplate(BASE_TEMPLATE, {})
    expect(result).toEqual({ ok: false, missingVariables: ['prenom', 'entreprise'] })
  })
})

describe('templateReadiness — #3417.6 pas prêt à envoyer si preuve manquante', () => {
  it('prêt quand toutes les preuves requises sont présentes', () => {
    expect(templateReadiness(BASE_TEMPLATE, new Set(['recent_signal']))).toEqual({ ready: true })
  })

  it('bloqué et NOMME la preuve manquante', () => {
    expect(templateReadiness(BASE_TEMPLATE, new Set())).toEqual({ ready: false, missingEvidence: ['recent_signal'] })
  })
})

describe('approvedTemplateCandidatesResponseSchema', () => {
  it('accepte une réponse avec un modèle prêt et un modèle bloqué, chacun avec sa raison', () => {
    const result = approvedTemplateCandidatesResponseSchema.safeParse({
      ready: [{ ...BASE_TEMPLATE, renderedText: 'Merci pour la connexion Gerald !' }],
      blocked: [
        {
          ...BASE_TEMPLATE,
          id: '22222222-2222-2222-2222-222222222222',
          reason: 'evidence_missing',
          missing: ['recent_signal'],
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('scenarioForApprovedTemplateRelationship', () => {
  it('dérive les quatre scénarios connus d’un état de relation', () => {
    expect(scenarioForApprovedTemplateRelationship('linkedin')).toBe('invitation_acceptee')
    expect(scenarioForApprovedTemplateRelationship('dormant')).toBe('connexion_dormante')
    expect(scenarioForApprovedTemplateRelationship('ancien_client')).toBe('connexion_dormante')
    expect(scenarioForApprovedTemplateRelationship('refere')).toBe('contact_recommande')
    expect(scenarioForApprovedTemplateRelationship('froid')).toBe('approche_froide')
  })

  it('rend null pour un état sans scénario situationnel (choix explicite requis)', () => {
    expect(scenarioForApprovedTemplateRelationship('client_actif')).toBeNull()
    expect(scenarioForApprovedTemplateRelationship(null)).toBeNull()
    expect(scenarioForApprovedTemplateRelationship(undefined)).toBeNull()
  })
})
