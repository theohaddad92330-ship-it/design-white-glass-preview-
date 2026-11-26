import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'
import { chooseOption } from '@/test/select'

/**
 * CE QUE LE POSTE EXIGE — le bloc qui rend l'axe bloquant ATTEIGNABLE.
 *
 * ⚠️ Ce que ce fichier garde n'est pas « la carte s'affiche » : c'est que la
 * saisie ARRIVE au serveur. Le défaut d'origine n'était pas un rendu manquant,
 * c'était une chaîne complète — contrat, base, moteur, axe bloquant — dont
 * personne n'appelait le premier maillon. Un test de rendu seul l'aurait laissé
 * intact.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))

const { NeedRequirementsCard } = await import('./NeedRequirementsCard')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur systèmes',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Refonte',
    project_stage: 'qualified',
    account_id: 'a-1',
    account_name: null,
    entity_id: null,
    entity_name: null,
    languages: [],
    clearances: [],
    ...over,
  }
}

function renderCard(row: OpenNeedRow) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedRequirementsCard need={row} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  apiFetch.mockResolvedValue({ id: 'n-1' })
})

describe('ce que la carte MONTRE', () => {
  it('une exigence absente NOMME sa conséquence — elle ne s’écrit pas « aucune »', () => {
    renderCard(need())
    // ⚠️ La phrase ne dit pas « aucune habilitation » : elle dit que rien
    // n'écarte un profil tant qu'aucune n'est exigée. C'est ce que le recruteur
    // doit comprendre avant de lancer un rapprochement — et c'est exactement ce
    // qui se passait pour TOUS les besoins avant ce lot.
    expect(screen.getByText(/rien n’écarte un profil/i)).toBeInTheDocument()
    expect(screen.getByText(/sort du calcul au lieu de valoir zéro/i)).toBeInTheDocument()
  })

  it('une habilitation exigée s’affiche, et le blocage est DIT', () => {
    renderCard(need({ clearances: ['Confidentiel Défense'] }))
    expect(screen.getByText('Confidentiel Défense')).toBeInTheDocument()
    expect(screen.getByText(/sort des profils recommandés/i)).toBeInTheDocument()
  })

  it('une langue sans niveau le dit, plutôt que d’en inventer un', () => {
    renderCard(need({ languages: [{ code: 'en', level: null }] }))
    expect(screen.getByText(/EN · niveau non précisé/i)).toBeInTheDocument()
  })
})

/** La carte lit AUSSI `GET .../qualification` au montage (#2323.32-.45) : les
 *  assertions sur l'écriture filtrent donc sur la méthode `PATCH`, plutôt que
 *  de compter tous les appels réseau de la carte. */
function patchCalls() {
  return apiFetch.mock.calls.filter(call => (call[0] as { method?: string }).method === 'PATCH')
}

describe('ce que la carte ÉCRIT', () => {
  it('la saisie part vers `PATCH /projects/needs/:id` — le maillon qui manquait', async () => {
    const user = userEvent.setup()
    renderCard(need())

    await user.click(screen.getByRole('button', { name: /modifier/i }))
    await user.type(screen.getByPlaceholderText('Confidentiel Défense'), 'Confidentiel Défense')
    await user.type(screen.getByPlaceholderText('fr:natif, en:b2'), 'en:c1')
    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    // L'ARGUMENT est vérifié, pas seulement l'appel : un mock qui jette ses
    // arguments prouve le rendu, pas la question posée.
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/projects/needs/n-1',
        method: 'PATCH',
        body: {
          languages: [{ code: 'en', level: 'c1' }],
          clearances: ['Confidentiel Défense'],
          interview_rounds: null,
          onsite_days_per_week: null,
          freelance_excluded: null,
          budget_validated: null,
        },
      }),
    )
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('« Enregistrer » sur un formulaire inchangé n’écrit RIEN', async () => {
    // Un `PATCH` inutile touche `updated_at` : la fiche se dirait « modifiée il
    // y a une minute » et ferait chercher un changement qui n'existe pas.
    const user = userEvent.setup()
    renderCard(need({ clearances: ['Secret'] }))

    await user.click(screen.getByRole('button', { name: /modifier/i }))
    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument())
    expect(patchCalls()).toHaveLength(0)
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('VIDER une exigence est un geste, et il part', async () => {
    const user = userEvent.setup()
    renderCard(need({ clearances: ['Secret'] }))

    await user.click(screen.getByRole('button', { name: /modifier/i }))
    await user.clear(screen.getByPlaceholderText('Confidentiel Défense'))
    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ languages: [], clearances: [] }),
      }),
    )
  })

  it('#2323.38-.42 — les quatre nouveaux champs partent avec le reste du formulaire', async () => {
    const user = userEvent.setup()
    renderCard(need())

    await user.click(screen.getByRole('button', { name: /modifier/i }))
    await user.type(screen.getByRole('spinbutton', { name: /entretiens/i }), '4')
    await chooseOption(screen.getByRole('combobox', { name: /freelance exclu/i }), 'yes')
    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ interview_rounds: 4, freelance_excluded: true }),
      }),
    )
  })

  it('un échec le DIT, et ne referme pas la saisie sur du vide', async () => {
    apiFetch.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderCard(need())

    await user.click(screen.getByRole('button', { name: /modifier/i }))
    await user.type(screen.getByPlaceholderText('Confidentiel Défense'), 'Secret')
    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    // Le champ garde ce qui a été tapé : refermer effacerait une saisie que
    // personne n'a demandé à annuler.
    expect(screen.getByPlaceholderText('Confidentiel Défense')).toHaveValue('Secret')
  })
})
