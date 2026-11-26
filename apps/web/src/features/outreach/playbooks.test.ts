import { createOutreachSequenceRequestSchema, OUTREACH_PLAYBOOKS, OUTREACH_PLAYBOOK_KEYS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import enOutreach from '@/i18n/locales/en/outreach.json'
import frOutreach from '@/i18n/locales/fr/outreach.json'
import { buildPlaybookContext, buildPlaybookRequest, personalizationTerms } from './playbooks'

/** Lot L-C (#4166) — les modèles : catalogues complets, requête de création valide, contexte de Laura. */

type Catalogue = {
  playbooks?: {
    trigger?: Record<string, { name?: string; when?: string }>
    intent?: Record<string, string>
    tip?: Record<string, Record<string, string>>
  }
}
const CATALOGUES: [string, Catalogue][] = [
  ['fr', frOutreach as Catalogue],
  ['en', enOutreach as Catalogue],
]

describe('les catalogues des modèles', () => {
  it('lisent un corpus réel : 8 modèles, 34 conseils, dans les DEUX langues', () => {
    const steps = OUTREACH_PLAYBOOK_KEYS.reduce((n, key) => n + OUTREACH_PLAYBOOKS[key].steps.length, 0)
    expect(steps).toBe(34)
    for (const [lang, catalogue] of CATALOGUES) {
      expect(Object.keys(catalogue.playbooks?.trigger ?? {}).length, lang).toBe(8)
    }
  })

  it('chaque modèle a un nom et un « quand », chaque étape une intention et un conseil', () => {
    const missing: string[] = []
    for (const [lang, catalogue] of CATALOGUES) {
      for (const key of OUTREACH_PLAYBOOK_KEYS) {
        const trigger = catalogue.playbooks?.trigger?.[key]
        if (!trigger?.name || !trigger.when) missing.push(`${lang}:${key}`)
        for (const step of OUTREACH_PLAYBOOKS[key].steps) {
          if (!catalogue.playbooks?.intent?.[step.intent]) missing.push(`${lang}:intent:${step.intent}`)
          const [, index] = step.tipKey.split('.')
          if (!catalogue.playbooks?.tip?.[key]?.[index as string]) missing.push(`${lang}:tip:${step.tipKey}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

describe('buildPlaybookRequest', () => {
  const contactId = '11111111-1111-4111-8111-111111111111'
  const base = { contactId, playbook: 'hiring_signal' as const, name: 'Signal de recrutement — Marie', drafts: {} }

  it('produit une requête VALIDE pour le contrat, en jours ouvrés, étapes custom', () => {
    const request = buildPlaybookRequest(base)
    expect(createOutreachSequenceRequestSchema.safeParse(request).success).toBe(true)
    expect(request.delay_unit).toBe('business_days')
    expect(request.template).toBeUndefined()
    expect(request.steps?.map(step => `${step.offset_days}:${step.kind}`)).toEqual([
      '0:email',
      '1:linkedin_invite',
      '4:linkedin_message',
      '8:call',
      '12:email',
    ])
  })

  it('garde le gabarit d’origine en référence quand le déclencheur en a un', () => {
    expect(buildPlaybookRequest(base).template_key).toBe('fresh_signal')
    expect(buildPlaybookRequest({ ...base, playbook: 'tender' }).template_key).toBeUndefined()
  })

  it('chaque étape porte son libellé et son intention (objective)', () => {
    const request = buildPlaybookRequest(base)
    for (const step of request.steps ?? []) {
      expect(step.label?.length).toBeGreaterThan(0)
      expect(step.objective?.length).toBeGreaterThan(0)
    }
  })

  it('les textes édités voyagent comme brouillon : e-mail avec objet, LinkedIn et appel sans', () => {
    const request = buildPlaybookRequest({
      ...base,
      drafts: {
        0: { subject: 'Votre poste', body: 'Bonjour Marie' },
        2: { subject: '', body: 'Salut Marie' },
        3: { subject: '', body: 'Trame' },
      },
    })
    expect(request.steps?.[0]?.draft).toEqual({ subject: 'Votre poste', body: 'Bonjour Marie' })
    expect(request.steps?.[2]?.draft).toEqual({ subject: '', body: 'Salut Marie' })
    expect(request.steps?.[3]?.draft).toEqual({ subject: '', body: 'Trame' })
    expect(request.steps?.[1]?.draft).toBeUndefined()
  })

  it('un texte vide ne devient pas un brouillon', () => {
    const request = buildPlaybookRequest({ ...base, drafts: { 0: { subject: 'x', body: '   ' } } })
    expect(request.steps?.[0]?.draft).toBeUndefined()
  })

  it('un e-mail à variable vide BLOQUE l’étape et la nomme, au lieu de laisser un {{…}} littéral', () => {
    const request = buildPlaybookRequest({ ...base, drafts: { 0: { subject: 'S', body: 'Bonjour {{prenom}}' } } })
    expect(request.steps?.[0]?.draft).toBeUndefined()
    expect(request.steps?.[0]?.blocked_variables).toEqual(['prenom'])
  })

  it('une variable avec repli est acceptée telle quelle', () => {
    const request = buildPlaybookRequest({
      ...base,
      drafts: { 0: { subject: 'S', body: 'Bonjour {{prenom|à vous}}' } },
    })
    expect(request.steps?.[0]?.draft?.body).toBe('Bonjour {{prenom|à vous}}')
  })

  it('passe outre les exclusions SEULEMENT sur geste explicite', () => {
    expect(buildPlaybookRequest(base).override_exclusions).toBeUndefined()
    const forced = buildPlaybookRequest({ ...base, overrideExclusions: { justification: 'Je connais ce contact' } })
    expect(forced.override_exclusions).toBe(true)
    expect(forced.force_justification).toBe('Je connais ce contact')
  })
})

describe('buildPlaybookContext', () => {
  it('assemble le signal, l’offre, l’objectif, l’intention de l’étape — rien d’autre', () => {
    const context = buildPlaybookContext({
      trigger: 'Signal de recrutement',
      stepLabel: 'E-mail sur le poste ouvert',
      intent: 'Obtenir une réponse',
      offer: 'Un profil disponible',
      goal: 'Un échange',
    })
    for (const part of [
      'Signal de recrutement',
      'E-mail sur le poste ouvert',
      'Obtenir une réponse',
      'Un profil disponible',
      'Un échange',
    ]) {
      expect(context).toContain(part)
    }
    expect(context.length).toBeLessThan(600)
  })

  it('omet ce qui n’est pas renseigné, sans « undefined »', () => {
    const context = buildPlaybookContext({
      trigger: null,
      stepLabel: 'Appel',
      intent: 'Fixer un échange',
      offer: 'Un profil',
      goal: 'Un échange',
    })
    expect(context).not.toMatch(/undefined|null/)
  })
})

describe('personalizationTerms', () => {
  it('garde le prénom, le nom et le compte, sans vide ni doublon', () => {
    expect(personalizationTerms({ full_name: 'Marie Dubois', account_name: 'Acme' })).toEqual([
      'Marie',
      'Dubois',
      'Acme',
    ])
    expect(personalizationTerms({ full_name: 'Marie', account_name: null })).toEqual(['Marie'])
  })
})
