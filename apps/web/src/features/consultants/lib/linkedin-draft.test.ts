import { describe, expect, it } from 'vitest'
import type { LinkedinDraft } from '@bellum/contracts'
import { EMPTY_FORM, toUpsert } from './consultantForm'
import { applyLinkedinDraft } from './linkedin-draft'

// H-DECISIONS #4348 — le brouillon pré-remplit, l'humain garde la main.
const DRAFT: LinkedinDraft = {
  full_name: 'Nadia Benali',
  title: 'Lead Data Engineer',
  public_profile_url: 'https://www.linkedin.com/in/nadia-benali',
  email: 'nadia@example.com',
  phone: null,
  cv_text: 'Lead Data Engineer · Nordia · 2021-03 – aujourd’hui',
  stack: [],
  missing: ['phone', 'stack'],
  source: 'linkedin_profile',
}

describe('applyLinkedinDraft', () => {
  it('remplit les champs vides et porte la source dans le formulaire', () => {
    const form = applyLinkedinDraft(EMPTY_FORM, DRAFT)
    expect(form).toMatchObject({ full_name: 'Nadia Benali', title: 'Lead Data Engineer', email: 'nadia@example.com' })
    expect(toUpsert(form)).toMatchObject({ source: 'linkedin_profile', public_profile_url: DRAFT.public_profile_url })
  })

  it('une saisie humaine déjà faite GAGNE sur le brouillon', () => {
    const form = applyLinkedinDraft({ ...EMPTY_FORM, title: 'Architecte data (corrigé)' }, DRAFT)
    expect(form.title).toBe('Architecte data (corrigé)')
  })

  it('un champ absent du brouillon ne vide rien et n’invente rien (compétences incluses)', () => {
    const form = applyLinkedinDraft({ ...EMPTY_FORM, phone: '0600000000', stack: 'dbt' }, DRAFT)
    expect(form.phone).toBe('0600000000')
    expect(form.stack).toBe('dbt')
  })

  it('une fiche sans brouillon n’envoie pas de source', () => {
    expect(toUpsert(EMPTY_FORM).source).toBeUndefined()
  })
})
