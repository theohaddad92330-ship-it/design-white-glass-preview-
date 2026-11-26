import { orgGraphSchema } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { OrgEditView } from './OrgEditView'
import { selectedValue } from '@/test/select'

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

const GRAPH = orgGraphSchema.parse({
  graphVersion: 7,
  entities: [{ id: 'e-it', name: 'Direction des systèmes d’information', type: 'bu', parentId: null, confidence: 80 }],
  people: [
    {
      id: 'p-marie-martin',
      fullName: 'Marie Martin',
      title: 'Directrice des systèmes d’information',
      entityId: 'e-it',
      hierarchyLevel: 'L1',
      decisionRoles: ['economic_buyer'],
      identityStatus: 'actionable',
      confidence: 80,
      sources: [SOURCE],
    },
    {
      id: 'p-paul-durand',
      fullName: 'Paul Durand',
      title: 'Responsable infrastructure',
      entityId: 'e-it',
      hierarchyLevel: 'L3',
      decisionRoles: [],
      identityStatus: 'classified',
      confidence: 55,
      sources: [],
    },
  ],
  hierarchyEdges: [],
  influenceEdges: [],
})

function renderEdit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrgEditView accountId="acc-1" graph={GRAPH} directionId="e-it" onDirectionChange={() => {}} />
    </QueryClientProvider>,
  )
}

const label = (key: string, options?: Record<string, unknown>) => i18n.t(`accountOrg:${key}`, options ?? {}) as string

/**
 * LE MODE ÉDITION — et la seule question qui compte : **par où passe l'écriture ?**
 *
 * Ces tests ne vérifient pas qu'un écran s'affiche. Ils vérifient que le
 * réarrangement, souris comme clavier, aboutit à la MÊME requête que le tiroir
 * de correction — et qu'il n'écrit rien tout seul. Le glisser-déposer avait été
 * refusé le 27/08 parce qu'un déplacement ne porte ni raison ni preuve ; le
 * revirement du 31/08 ne lève ce refus qu'à cette condition-là.
 */
describe('OrgEditView', () => {
  beforeEach(async () => {
    vi.mocked(apiFetch).mockReset()
    await i18n.changeLanguage('fr')
  })

  it('le corpus n’est pas vide — deux personnes, deux niveaux', () => {
    expect(GRAPH.people).toHaveLength(2)
    expect(GRAPH.graphVersion).toBe(7)
  })

  it('le déplacement est OPÉRABLE AU CLAVIER — saisir, puis rattacher', async () => {
    const user = userEvent.setup()
    renderEdit()

    // Rien n'est proposé tant que rien n'est saisi : « rattacher ici » sans
    // sujet serait un bouton qui ne veut rien dire.
    expect(screen.queryByRole('button', { name: label('edit.dropHere', { name: 'Paul Durand' }) })).toBeNull()

    const pick = screen.getByRole('button', { name: label('edit.pick', { name: 'Paul Durand' }) })
    expect(pick).toHaveAttribute('aria-pressed', 'false')
    await user.click(pick)
    expect(screen.getByRole('button', { name: label('edit.pickCancel', { name: 'Paul Durand' }) })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // La cible du dépôt est un BOUTON : elle se tabule et répond à Entrée.
    const drop = screen.getByRole('button', { name: label('edit.dropHere', { name: 'Paul Durand' }) })
    drop.focus()
    await user.keyboard('{Enter}')

    // Le tiroir s'ouvre SUR le champ du rattachement, avec la cible désignée.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await selectedValue(screen.getByLabelText(label('correction.fieldLabel')))).toBe('reportsTo')
    expect(await selectedValue(screen.getByLabelText(label('correction.newLabel')))).toBe('p-marie-martin')
  })

  it('un dépôt N’ÉCRIT RIEN : sans raison, le contrat refuse et le bouton reste mort', async () => {
    const user = userEvent.setup()
    renderEdit()
    await user.click(screen.getByRole('button', { name: label('edit.pick', { name: 'Paul Durand' }) }))
    await user.click(screen.getByRole('button', { name: label('edit.dropHere', { name: 'Paul Durand' }) }))

    expect(screen.getByRole('button', { name: label('correction.submit') })).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('l’écriture passe par LA porte — PATCH du ledger, avec le verrou de version', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 8, corrections: [], applied: true })
    renderEdit()
    await user.click(screen.getByRole('button', { name: label('edit.pick', { name: 'Paul Durand' }) }))
    await user.click(screen.getByRole('button', { name: label('edit.dropHere', { name: 'Paul Durand' }) }))
    await user.type(screen.getByLabelText(label('correction.reasonLabel')), 'Annoncé en comité de direction.')
    await user.click(screen.getByRole('button', { name: label('correction.submit') }))

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const call = vi.mocked(apiFetch).mock.calls[0]?.[0] as {
      path: string
      method: string
      body: {
        expectedGraphVersion: number
        objectId: string
        claims: { field: string; value: unknown; reason: string; evidence: { kind: string; claim: string } }[]
      }
    }
    expect(call.path).toBe('/accounts/acc-1/org-graph/corrections')
    expect(call.method).toBe('PATCH')
    expect(call.body.expectedGraphVersion).toBe(7)
    // La personne DÉPLACÉE est le sujet ; la cible du dépôt est la valeur.
    expect(call.body.objectId).toBe('p-paul-durand')
    expect(call.body.claims).toHaveLength(1)
    expect(call.body.claims[0]?.field).toBe('reportsTo')
    expect(call.body.claims[0]?.value).toBe('p-marie-martin')
    // La preuve est celle d'une affirmation HUMAINE de l'espace — c'est elle
    // qui fait gagner la correction sur toute réanalyse ultérieure.
    expect(call.body.claims[0]?.evidence.kind).toBe('workspace_user')
  })

  it('Échap repose la carte — un geste qu’on ne peut pas annuler ne se tente pas', async () => {
    const user = userEvent.setup()
    renderEdit()
    await user.click(screen.getByRole('button', { name: label('edit.pick', { name: 'Paul Durand' }) }))
    expect(screen.getByRole('button', { name: label('edit.dropHere', { name: 'Paul Durand' }) })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: label('edit.dropHere', { name: 'Paul Durand' }) })).toBeNull()
  })

  it('le panneau corrige UNE affirmation à la fois — un champ, sa preuve', async () => {
    const user = userEvent.setup()
    renderEdit()
    await user.click(screen.getByRole('button', { name: label('edit.openPanel', { name: 'Marie Martin' }) }))
    const panel = screen.getByRole('group', { name: label('edit.panelTitle') })
    // La valeur COURANTE est lisible : corriger à l'aveugle, c'est écraser.
    expect(panel).toHaveTextContent('Directrice des systèmes d’information')

    await user.click(
      screen.getByRole('button', { name: label('edit.correctField', { field: label('correction.fields.title') }) }),
    )
    expect(await selectedValue(screen.getByLabelText(label('correction.fieldLabel')))).toBe('title')
    // ⚠️ La nouvelle valeur reste VIDE : rien n'a été proposé par un geste ici.
    expect(screen.getByLabelText(label('correction.newLabel'))).toHaveValue('')
  })

  it('la carte saisie s’ANNONCE — sinon un lecteur d’écran ne sait pas qu’il la tient', async () => {
    const user = userEvent.setup()
    renderEdit()
    await user.click(screen.getByRole('button', { name: label('edit.pick', { name: 'Paul Durand' }) }))
    expect(screen.getByRole('status')).toHaveTextContent(label('edit.picked', { name: 'Paul Durand' }))
  })
})

describe('#4805 — OrgEditView ne disparaît pas en silence', () => {
  it('un graphe sans personne rattachée NOMME l’absence', () => {
    const client = new QueryClient()
    const empty = orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'X', type: 'groupe', confidence: 50, sources: [] }],
      people: [],
    })
    render(
      <QueryClientProvider client={client}>
        <OrgEditView accountId="acc-1" graph={empty} directionId={null} onDirectionChange={() => {}} />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('org-view-absence')).toBeInTheDocument()
  })
})
