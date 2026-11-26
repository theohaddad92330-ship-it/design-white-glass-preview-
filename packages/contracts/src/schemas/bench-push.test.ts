import { describe, expect, it } from 'vitest'
import {
  anonymizedBenchProfile,
  benchPushRequestSchema,
  buildBenchPushCreateRequest,
  buildBenchPushDraft,
} from './bench-push.js'
import { outreachContentBlockers } from './outreach-canonical.js'

const CONSULTANT = '11111111-1111-4111-8111-111111111111'
const CONTACT = '22222222-2222-4222-8222-222222222222'

/** #5029 — proposer un consultant en intercontrat à UN compte, profil anonymisé. */
describe('#5029.3 — un compte et un contact par lancement', () => {
  it('accepte un consultant et UN contact', () => {
    expect(benchPushRequestSchema.safeParse({ consultant_id: CONSULTANT, contact_id: CONTACT }).success).toBe(true)
  })

  it('refuse une liste de contacts glissée dans la requête (jamais une audience)', () => {
    const parsed = benchPushRequestSchema.safeParse({
      consultant_id: CONSULTANT,
      contact_id: CONTACT,
      contact_ids: [CONTACT, CONSULTANT],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('#5029.1 — le profil anonymisé', () => {
  const rich = {
    full_name: 'Camille Martin',
    tjm: 650,
    email: 'camille@esn.fr',
    title: 'Data engineer',
    seniority: 'senior',
    years_experience: 8,
    skills: ['Spark', 'spark', 'Kafka', 'inconnu', 'AWS'],
    available_from: '2026-11-15',
  }

  it('ne laisse passer ni le nom, ni le TJM, ni l’e-mail', () => {
    const profile = anonymizedBenchProfile(rich)
    const draft = buildBenchPushDraft({ profile, accountName: 'Thales' })
    const text = JSON.stringify({ profile, draft })
    expect(text).not.toMatch(/Camille|Martin|650|camille@/)
    expect(profile.skills).toEqual(['Spark', 'Kafka', 'AWS'])
  })

  it('une valeur absente ne fait aucune ligne — jamais « 0 » ni « inconnu »', () => {
    const profile = anonymizedBenchProfile({
      title: null,
      seniority: 'inconnu',
      years_experience: 0,
      skills: [],
      available_from: null,
    })
    const { body } = buildBenchPushDraft({ profile, accountName: 'Thales' })
    expect(body).not.toMatch(/inconnu|0 ans|Séniorité|Compétences|Disponible/)
  })

  it('le brouillon nomme le compte, cite son contexte, et ne lève aucun bloquant de contenu', () => {
    const profile = anonymizedBenchProfile(rich)
    const { subject, body } = buildBenchPushDraft({
      profile,
      accountName: 'Thales',
      accountContext: 'trois postes data ouverts',
    })
    expect(subject).toContain('Thales')
    expect(body).toContain('trois postes data ouverts')
    expect(body).toContain('15/11/2026')
    expect(outreachContentBlockers({ body, accountName: 'Thales', contactName: 'Marie Dubois' })).toEqual([])
  })

  it('crée UNE séquence playbook F sur UN contact, brouillon sur la première étape seulement', () => {
    const request = buildBenchPushCreateRequest({
      contactId: CONTACT,
      contactName: 'Marie Dubois',
      profile: anonymizedBenchProfile(rich),
      accountName: 'Thales',
    })
    expect(request.contact_id).toBe(CONTACT)
    expect(request.campaign_label).toBeUndefined()
    expect(request.template_key).toBe('profile_push')
    expect(request.steps?.[0]?.draft?.body).toContain('Thales')
    expect(request.steps?.slice(1).every(step => !step.draft)).toBe(true)
  })
})
