import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContactPreflight as ContactPreflightResult } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactPreflight } from './ContactPreflight'

/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — le contrôle avant
 * action, sur la fiche, au-dessus des gestes de travail. Il NOMME les écarts,
 * ne tranche rien, et ne fait AUCUNE ligne quand il n'y a rien à dire.
 */

const state: { data: ContactPreflightResult | undefined } = { data: undefined }
vi.mock('@/features/contacts/hooks/useContactPreflight', () => ({
  useContactPreflight: () => ({ data: state.data }),
}))

function preflight(patch: Partial<ContactPreflightResult>): ContactPreflightResult {
  return { contactId: 'c-1', action: null, status: 'differences', items: [], unknowns: [], ...patch }
}

/** Le routeur rend de façon asynchrone : une sentinelle prouve que l'arbre est monté. */
async function renderedBeside() {
  renderWithRouter(
    <>
      <span>sentinelle</span>
      <ContactPreflight contactId="c-1" />
    </>,
  )
  await screen.findByText('sentinelle')
}

afterEach(() => {
  cleanup()
  state.data = undefined
})

describe('ContactPreflight', () => {
  it('nomme les deux vérités de portée, avec leur source, leur date et leur périmètre — sans valeur choisie', async () => {
    state.data = preflight({
      items: [
        {
          kind: 'scope_difference',
          field: 'title',
          claims: [
            {
              value: 'Directeur technique',
              source: 'pipeline',
              at: '2026-09-21T10:00:00.000Z',
              scope: 'Groupe entier',
            },
            {
              value: 'Directeur technique — filiale',
              source: 'pipeline',
              at: '2026-10-05T10:00:00.000Z',
              scope: 'Filiales',
            },
          ],
        },
      ],
    })
    renderWithRouter(<ContactPreflight contactId="c-1" />)
    const region = await screen.findByRole('region', { name: /avant d’agir sur ce contact/i })
    expect(within(region).getByText(/Fonction : deux valeurs vraies, chacune dans sa portée/)).toBeInTheDocument()
    expect(
      within(region).getByText(/Directeur technique — analyse du dossier, .*portée Groupe entier/),
    ).toBeInTheDocument()
    expect(within(region).getByText(/portée Filiales/)).toBeInTheDocument()
    expect(within(region).getByText(/Rien n’est tranché à ta place/)).toBeInTheDocument()
  })

  // #3400 — jamais une clé brute (`careerLevers`) ni un tableau JSON (`["…"]`) à l'écran.
  it('un champ tableau s’affiche sous son libellé, en liste lisible, sans clé brute ni JSON', async () => {
    state.data = preflight({
      items: [
        {
          kind: 'open_conflict',
          field: 'careerLevers',
          claims: [
            { value: '["Promotion visée","Reconnaissance"]', source: 'pipeline', at: '2026-09-11T10:00:00.000Z' },
            { value: '[]', source: 'pipeline', at: '2026-09-18T10:00:00.000Z' },
          ],
          nextCheck: '2026-10-19T10:00:00.000Z',
        },
      ],
    })
    renderWithRouter(<ContactPreflight contactId="c-1" />)
    const region = await screen.findByRole('region', { name: /avant d’agir sur ce contact/i })
    expect(within(region).getByText(/Leviers de carrière : deux sources/)).toBeInTheDocument()
    expect(within(region).getByText(/Promotion visée, Reconnaissance — /)).toBeInTheDocument()
    expect(region.textContent).not.toContain('careerLevers')
    expect(region.textContent).not.toMatch(/[[\]{}]"|\["|"\]/)
    expect(within(region).getAllByText(/\(vide\)/)).toHaveLength(1)
  })

  it('une contradiction ouverte, un écart d’entreprise gardé à la main, un contact hors périmètre', async () => {
    state.data = preflight({
      items: [
        {
          kind: 'open_conflict',
          field: 'entity',
          claims: [
            { value: 'SNCF', source: 'pipeline', at: '2026-09-21T10:00:00.000Z' },
            { value: 'SNCF Voyageurs', source: 'pipeline', at: '2026-10-05T10:00:00.000Z' },
          ],
          nextCheck: '2026-10-19T10:00:00.000Z',
        },
        { kind: 'employer_differs', recordValue: 'SNCF', sourceValue: 'Capgemini', recordKeptByHuman: true },
        { kind: 'out_of_account_scope', entity: 'Filiale hors secteur' },
        { kind: 'identity_doubt' },
      ],
    })
    renderWithRouter(<ContactPreflight contactId="c-1" />)
    const list = await screen.findByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText(/Entité : deux sources ne disent pas la même chose/)).toBeInTheDocument()
    expect(screen.getByText(/À revérifier le/)).toBeInTheDocument()
    expect(screen.getByText(/la fiche dit « SNCF », une source externe dit « Capgemini »/)).toBeInTheDocument()
    expect(screen.getByText(/saisie à la main : elle reste telle quelle/)).toBeInTheDocument()
    expect(screen.getByText(/« Filiale hors secteur »/)).toBeInTheDocument()
    expect(screen.getByText(/homonyme/)).toBeInTheDocument()
  })

  it('les vérifications manquantes se nomment sous les écarts', async () => {
    state.data = preflight({
      items: [{ kind: 'identity_doubt' }],
      unknowns: [{ section: 'account_scope', reason: 'no_account_scope_mapped' }],
    })
    renderWithRouter(<ContactPreflight contactId="c-1" />)
    expect(await screen.findByText(/Non vérifié/)).toBeInTheDocument()
    expect(screen.getByText(/périmètre du compte n’est pas encore cartographié/)).toBeInTheDocument()
  })

  it('un journal ILLISIBLE se dit, même sans écart — jamais confondu avec « rien »', async () => {
    state.data = preflight({ status: 'incomplete', unknowns: [{ section: 'field_conflicts', reason: 'unreadable' }] })
    renderWithRouter(<ContactPreflight contactId="c-1" />)
    expect(await screen.findByText(/journal des champs n’a pas pu être lu/)).toBeInTheDocument()
  })

  it('sait dire NON — aucun écart : aucune carte (une absence ne fait aucune ligne)', async () => {
    state.data = preflight({ status: 'no_difference' })
    await renderedBeside()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('un périmètre seulement NON CARTOGRAPHIÉ, sans écart : aucune carte (pas de bruit sur chaque fiche)', async () => {
    state.data = preflight({ status: 'incomplete', unknowns: [{ section: 'account_scope', reason: 'no_account' }] })
    await renderedBeside()
    expect(screen.queryByRole('region')).toBeNull()
  })
})
