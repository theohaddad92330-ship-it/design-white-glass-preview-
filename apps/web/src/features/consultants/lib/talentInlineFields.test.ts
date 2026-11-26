import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import type { Consultant } from '@bellum/contracts'
import { EMPTY_FORM, toForm, toUpsert } from './consultantForm'
import { TALENT_FIELD_GROUPS, TALENT_INLINE_FIELDS, buildInlineUpsert, type TalentFieldKey } from './talentInlineFields'

// #4402.1 — l'inventaire : CHAQUE champ de la modale « Modifier » a un équivalent en ligne, et le même PATCH.
const talent = {
  id: 't1',
  full_name: 'Alice Martin',
  title: 'Architecte',
  seniority: 'senior',
  years_experience: 8,
  availability: 'immediate',
  available_from: null,
  contract_type: 'freelance',
  kind: 'consultant',
  engagement_kind: 'freelance',
  partner_account_id: null,
  manager_id: null,
  email: 'alice@x.fr',
  phone: null,
  public_profile_url: null,
  tjm: 620,
  min_tjm_cents: null,
  cost_rate_cents: null,
  purchase_tjm_cents: null,
  mobility: {
    zones: [],
    remote: null,
    travel: null,
    relocation: null,
    siteFrequency: null,
    international: null,
    restrictions: null,
  },
  process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
  preferences: {
    refusedSectors: [],
    refusedTechnologies: [],
    preferredClientTypes: [],
    refusedClients: [],
    environmentsToAvoid: [],
    nonNegotiableConditions: null,
  },
  stack: ['Java'],
  sectors: [],
  zones: [],
  references: [],
  languages: [],
  clearances: [],
  wants: null,
  notes: null,
  cv_text: null,
  consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
} as unknown as Consultant

const FORM_KEYS = Object.keys(EMPTY_FORM) as (keyof typeof EMPTY_FORM)[]

describe('talentInlineFields — l’inventaire de la modale « Modifier »', () => {
  it('chaque clé du formulaire (hors source) a un équivalent en ligne', () => {
    const missing = FORM_KEYS.filter(key => key !== 'source' && !(key in TALENT_INLINE_FIELDS))
    expect(missing).toEqual([])
  })

  it('chaque champ SAISI dans la modale (set(…)) a un équivalent en ligne — lu dans le source de la modale', () => {
    const source = readFileSync(resolve(__dirname, '../view/ConsultantFormDialog.tsx'), 'utf8')
    const edited = [...source.matchAll(/set\('([a-z_]+)'\)/g)].map(match => match[1] as string)
    expect(edited.length).toBeGreaterThan(40)
    expect(edited.filter(key => !(key in TALENT_INLINE_FIELDS))).toEqual([])
  })

  it('chaque champ est posé dans un groupe d’onglet, et dans un seul', () => {
    const placed = TALENT_FIELD_GROUPS.flatMap(group => group.fields)
    const keys = Object.keys(TALENT_INLINE_FIELDS)
    expect(keys.filter(key => !placed.includes(key as TalentFieldKey))).toEqual([])
    expect(placed.length).toBe(new Set(placed).size)
  })
})

describe('buildInlineUpsert — le MÊME PATCH que la modale', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un champ changé = le payload que la modale enverrait avec ce seul changement', () => {
    const input = buildInlineUpsert(talent, { tjm: '700' }, { finance: false })
    expect(input).toEqual(toUpsert({ ...toForm(talent), tjm: '700' }, { finance: false }))
  })

  it('un nom vide est refusé avant tout appel', () => {
    expect(() => buildInlineUpsert(talent, { full_name: '  ' }, {})).toThrow(/nom/i)
  })

  it('passer en sous-traitance sans partenaire est refusé et le dit', () => {
    expect(() => buildInlineUpsert(talent, { engagement_kind: 'sous_traitance' }, {})).toThrow(/partenaire/i)
  })

  it('renseigner le partenaire passe l’engagement en sous-traitance (une seule écriture)', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const input = buildInlineUpsert(talent, { partner_account_id: id }, {})
    expect(input.engagement_kind).toBe('sous_traitance')
    expect(input.partner_account_id).toBe(id)
  })

  it('retirer le partenaire d’un sous-traitant est refusé (il porte toujours son partenaire)', () => {
    const sub = {
      ...talent,
      engagement_kind: 'sous_traitance',
      partner_account_id: '11111111-1111-4111-8111-111111111111',
    } as Consultant
    expect(() => buildInlineUpsert(sub, { partner_account_id: '' }, {})).toThrow(/partenaire/i)
  })
})
