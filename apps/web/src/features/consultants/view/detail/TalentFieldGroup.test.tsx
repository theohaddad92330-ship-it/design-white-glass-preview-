import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Consultant } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api-error'
import { toForm, toUpsert } from '../../lib/consultantForm'
import { TALENT_FIELD_GROUPS } from '../../lib/talentInlineFields'
import { TalentFieldGroup } from './TalentFieldGroup'

const mutateAsync = vi.fn()
// #4577 — corriger exige `records:write` : ici, le droit est donné (le refus se teste dans `TalentDetail.test.tsx`).
vi.mock('@/lib/permissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  useUserPermissions: () => ({ status: 'known', role: 'sales', extraPermissions: [], permissions: ['records:write'] }),
}))
vi.mock('../../hooks', () => ({ useUpdateConsultant: () => ({ mutateAsync, isPending: false }) }))

// #4402.1 — la fiche se modifie champ par champ, avec le MÊME PATCH que la modale.
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

const talent = {
  id: 't1',
  full_name: 'Alice Martin',
  title: 'Architecte',
  seniority: 'senior',
  years_experience: null,
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
  purchase_tjm_cents: 45000,
  finance_visible: true,
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
  consent: { givenAt: '2026-05-04T14:32:00.000Z', expiresAt: null, basis: null, restrictions: null },
} as unknown as Consultant

describe('TalentFieldGroup — #4402.1', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutateAsync.mockReset().mockResolvedValue(talent)
  })

  it('chaque champ du groupe est un bouton « Modifier <champ> » (identité)', () => {
    render(<TalentFieldGroup talent={talent} groupId="identity" />)
    for (const label of ['Nom complet', 'Intitulé de poste', 'Séniorité', 'Années d’expérience']) {
      expect(screen.getByRole('button', { name: new RegExp(`^Modifier ${label}`, 'i') })).toBeInTheDocument()
    }
  })

  // #4577.3 — une correction humaine est marquée « Saisi à la main » À CÔTÉ du champ, et seulement celui-là.
  it('#4577.3 — le champ de provenance `human` dit « Saisi à la main » ; les autres non', () => {
    const sourced = { ...talent, field_sources: { title: 'human', full_name: 'connector' } } as unknown as Consultant
    render(<TalentFieldGroup talent={sourced} groupId="identity" />)
    expect(screen.getAllByText('Saisi à la main')).toHaveLength(1)
    const field = screen.getByRole('button', { name: /^Modifier Intitulé de poste/ }).closest('div')
    expect(field).toHaveTextContent('Saisi à la main')
  })

  it('#4577.3 — sans provenance (champ jamais corrigé), aucun marqueur inventé', () => {
    render(<TalentFieldGroup talent={talent} groupId="identity" />)
    expect(screen.queryByText('Saisi à la main')).not.toBeInTheDocument()
  })

  it('#4577.3 — le montant stocké en centimes (`min_tjm_cents`) porte le marqueur du champ `min_tjm`', () => {
    const sourced = { ...talent, field_sources: { min_tjm_cents: 'human' } } as unknown as Consultant
    render(<TalentFieldGroup talent={sourced} groupId="rates" />)
    expect(screen.getAllByText('Saisi à la main')).toHaveLength(1)
  })

  // #4577.6 — une valeur venue d'un connecteur ou du CV n'est pas modifiable PAR INADVERTANCE : elle dit d'où elle vient
  // et ne s'ouvre qu'après un geste explicite. Une correction humaine gagne toujours : le geste existe.
  it('#4577.6 — une valeur de connecteur est verrouillée, dit sa source, et se reprend par « Corriger »', async () => {
    const sourced = { ...talent, field_sources: { title: 'connector' } } as unknown as Consultant
    render(<TalentFieldGroup talent={sourced} groupId="identity" />)
    expect(screen.queryByRole('button', { name: /^Modifier Intitulé de poste/ })).not.toBeInTheDocument()
    expect(screen.getByText('Repris d’un connecteur branché')).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: /^Corriger Intitulé de poste/ }))
    expect(screen.getByRole('button', { name: /^Modifier Intitulé de poste/ })).toBeInTheDocument()
  })

  it('#4577.6 — une valeur du CV ou de l’import dit son origine, sans nommer de fournisseur', () => {
    const sourced = { ...talent, field_sources: { title: 'pipeline' } } as unknown as Consultant
    render(<TalentFieldGroup talent={sourced} groupId="identity" />)
    expect(screen.getByText('Repris du CV ou de l’import')).toBeInTheDocument()
  })

  it('#4577.6 — une valeur saisie à la main reste éditable d’un clic, sans verrou', () => {
    const sourced = { ...talent, field_sources: { title: 'human' } } as unknown as Consultant
    render(<TalentFieldGroup talent={sourced} groupId="identity" />)
    expect(screen.getByRole('button', { name: /^Modifier Intitulé de poste/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Corriger/ })).not.toBeInTheDocument()
  })

  it('Entrée enregistre avec le même PATCH que la modale', async () => {
    render(<TalentFieldGroup talent={talent} groupId="identity" />)
    await user().click(screen.getByRole('button', { name: /^Modifier Intitulé de poste/ }))
    const input = screen.getByRole('textbox', { name: /^Intitulé de poste/ })
    await user().clear(input)
    await user().type(input, 'Directeur{Enter}')
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 't1',
      input: toUpsert({ ...toForm(talent), title: 'Directeur' }, { finance: true }),
    })
  })

  it('erreur API : la valeur précédente revient et l’erreur se dit', async () => {
    mutateAsync.mockRejectedValue(new Error('Refusé par le serveur'))
    render(<TalentFieldGroup talent={talent} groupId="identity" />)
    await user().click(screen.getByRole('button', { name: /^Modifier Intitulé de poste/ }))
    const input = screen.getByRole('textbox', { name: /^Intitulé de poste/ })
    await user().clear(input)
    await user().type(input, 'Directeur{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé par le serveur')
    expect(screen.getByRole('button', { name: /^Modifier Intitulé de poste/ })).toHaveTextContent('Architecte')
  })

  // #4833 — fiche SANS nom (issue d'un CV) : le nom saisi s'écrit dans le MÊME PUT que la modale.
  it('#4833 — le nom saisi sur une fiche sans nom est envoyé', async () => {
    const nameless = { ...talent, full_name: null } as unknown as Consultant
    render(<TalentFieldGroup talent={nameless} groupId="identity" />)
    await user().click(screen.getByRole('button', { name: /^Modifier Nom complet/ }))
    await user().type(screen.getByRole('textbox', { name: /^Nom complet/ }), 'Camille Durand{Enter}')
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 't1',
      input: toUpsert({ ...toForm(nameless), full_name: 'Camille Durand' }, { finance: true }),
    })
  })

  it('#4833 — un refus serveur sur UN AUTRE champ le nomme et dit que ce n’est pas celui qu’on modifiait', async () => {
    const nameless = { ...talent, full_name: null } as unknown as Consultant
    mutateAsync.mockRejectedValue(
      new ApiError('Validation failed — email : Invalid email', 400, undefined, {
        errors: [{ path: ['email'], message: 'Invalid email' }],
      }),
    )
    render(<TalentFieldGroup talent={nameless} groupId="identity" />)
    await user().click(screen.getByRole('button', { name: /^Modifier Nom complet/ }))
    await user().type(screen.getByRole('textbox', { name: /^Nom complet/ }), 'Camille Durand{Enter}')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid email')
    expect(alert).toHaveTextContent(/email/i)
    expect(alert).toHaveTextContent(/alors que tu modifiais/)
    expect(alert).not.toHaveTextContent('Validation failed')
  })

  it('#4833 — un refus sur le champ édité le nomme sans l’accuser d’être un autre', async () => {
    mutateAsync.mockRejectedValue(
      new ApiError('Validation failed — title : Too long', 400, undefined, {
        errors: [{ path: ['title'], message: 'Too long' }],
      }),
    )
    render(<TalentFieldGroup talent={talent} groupId="identity" />)
    await user().click(screen.getByRole('button', { name: /^Modifier Intitulé de poste/ }))
    const input = screen.getByRole('textbox', { name: /^Intitulé de poste/ })
    await user().clear(input)
    await user().type(input, 'X{Enter}')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Intitulé de poste')
    expect(alert).toHaveTextContent('Too long')
    expect(alert).not.toHaveTextContent(/alors que tu modifiais/)
  })

  it('un nom vidé est refusé avant tout appel', async () => {
    render(<TalentFieldGroup talent={talent} groupId="identity" />)
    await user().click(screen.getByRole('button', { name: /^Modifier Nom complet/ }))
    await user().clear(screen.getByRole('textbox', { name: /^Nom complet/ }))
    await user().keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/nom/i)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('tarifs : le TJM d’achat s’affiche pour un freelance, pas le coût chargé du salarié', () => {
    render(<TalentFieldGroup talent={talent} groupId="rates" />)
    expect(screen.getByRole('button', { name: /^Modifier TJM d’achat/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Modifier Coût chargé/i })).not.toBeInTheDocument()
  })

  it('hors périmètre financier : les montants sont retirés et l’absence est nommée', () => {
    render(<TalentFieldGroup talent={{ ...talent, finance_visible: false } as Consultant} groupId="rates" />)
    expect(screen.queryByRole('button', { name: /TJM d’achat|Coût|minimum/i })).not.toBeInTheDocument()
    expect(screen.getByText(/ne sont pas dans ton périmètre/)).toBeInTheDocument()
  })

  it('consentement : la date se LIT en langue de l’interface, jamais en ISO brut (D2)', () => {
    render(<TalentFieldGroup talent={talent} groupId="consent" />)
    const field = screen.getByRole('button', { name: /^Modifier Consentement recueilli le/i })
    expect(field).not.toHaveTextContent('2026-05-04')
    expect(field).toHaveTextContent('04/05/2026')
  })

  it('consentement : l’horodatage complet n’est jamais tronqué sans geste', async () => {
    render(<TalentFieldGroup talent={talent} groupId="consent" />)
    await user().click(screen.getByRole('button', { name: /^Modifier Consentement recueilli le/i }))
    await user().keyboard('{Enter}')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('tous les groupes de l’inventaire se rendent', () => {
    for (const group of TALENT_FIELD_GROUPS) {
      const { unmount } = render(<TalentFieldGroup talent={talent} groupId={group.id} />)
      expect(screen.getAllByRole('button', { name: /^Modifier / }).length).toBeGreaterThan(0)
      unmount()
    }
  })

  // #4833 — un refus de validation NOMME son champ ; s'il vient d'un autre champ que celui édité, l'écran le dit.
  it('#4833 — le refus d’un AUTRE champ est nommé et dit ne pas venir du champ édité', async () => {
    mutateAsync.mockRejectedValueOnce(
      new ApiError('years_experience : Number must be less than or equal to 60', 400, undefined, {
        message: 'Validation failed',
        errors: [{ path: ['years_experience'], message: 'Number must be less than or equal to 60' }],
      }),
    )
    render(<TalentFieldGroup talent={talent} groupId="identity" />)
    await userEvent.click(screen.getByRole('button', { name: /Modifier Nom complet/ }))
    const input = await screen.findByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'Ana Lévy{Enter}')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Number must be less than or equal to 60')
    expect(alert).toHaveTextContent(/alors que tu modifiais « Nom complet »/)
  })
})
