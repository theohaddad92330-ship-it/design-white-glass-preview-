import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { NeedStoredStatus } from '@bellum/contracts'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/**
 * Les sept gestes, PAR L'INTERACTION.
 *
 * ⚠️ Une garde de SOURCE ne suffit pas ici. Ce dépôt a déjà payé le cas où le
 * code contenait le bon appel et où le geste était inerte à l'écran (un
 * `disabled` avait rendu un glisser-déposer mort). On clique donc réellement,
 * et on regarde ce qui PART sur le réseau : la méthode, le chemin, le corps.
 *
 * C'est aussi la seule façon de prouver que le chemin d'écriture est ouvert de
 * bout en bout — `urgency` et `owner_id` étaient refusés en 400 par un schéma
 * `.strict()` jusqu'à ce lot, et l'écran n'en aurait rien laissé voir.
 */
/** Ce qu'on regarde partir : la méthode, le chemin, le corps. */
type ApiCall = { path: string; method?: string; body?: unknown }
const apiFetch = vi.fn(async (_args: ApiCall): Promise<unknown> => ({}))
vi.mock('@/lib/api', () => ({ apiFetch: (args: ApiCall) => apiFetch(args) }))
// Les membres viennent d'une lecture réelle (`GET /workspaces/members`), qui
// exige un contexte de session. Ce test-ci porte sur ce qui PART, pas sur la
// lecture des membres : on lui donne un membre, et on regarde l'écriture.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [{ userId: 'u-7', email: 'lea@esn.fr', fullName: 'Léa Bertin', role: 'member', isSelf: false }],
    isLoading: false,
  }),
}))

// #4016 L11 — le téléchargement lui-même (Blob + lien) n'est pas ce qu'on
// regarde ici : on regarde ce qui PART, et la preuve exigée.
const downloadCSV = vi.fn()
const downloadJSON = vi.fn()
vi.mock('@/lib/export-csv', () => ({
  downloadCSV: (...args: unknown[]) => downloadCSV(...args),
  downloadJSON: (...args: unknown[]) => downloadJSON(...args),
}))

const { NeedsSelectionBar } = await import('./NeedsSelectionBar')
const { useDataExit } = await import('@/lib/data-exit')
type DataExitGrant = NonNullable<ReturnType<typeof useDataExit>['grant']>

/** Une ligne de sélection : l'identifiant, l'état, de quoi savoir si le
 *  moteur de rapprochement aurait quelque chose à chercher, et s'il est
 *  archivé (#2173.49 — un rangement, jamais lu depuis le statut). */
function need(id: string, status: NeedStoredStatus = 'qualified', skills = 1, archivedAt: string | null = null) {
  return {
    id,
    status,
    skills: Array.from({ length: skills }, (_, index) => ({ term: `skill-${index}`, required: true, level: null })),
    archived_at: archivedAt,
  }
}

function draw(needs: ReturnType<typeof need>[], onClear = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NeedsSelectionBar needs={needs} onClear={onClear} />
    </QueryClientProvider>,
  )
}

describe('la barre de sélection des besoins', () => {
  it('n’apparaît pas sur une sélection vide — des gestes qui ne font rien', () => {
    const { container } = draw([])
    expect(container).toBeEmptyDOMElement()
  })

  it('dit combien de besoins sont cochés', () => {
    draw([need('n-1'), need('n-2')])
    expect(screen.getByText('2 besoins sélectionnés')).toBeInTheDocument()
  })

  it('ouvre les DIX gestes, et AUCUN export ni suppression', async () => {
    const user = userEvent.setup()
    draw([need('n-1')])
    await user.click(screen.getByRole('button', { name: 'Actions' }))

    expect(await screen.findByRole('menuitem', { name: 'Attribuer à…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Changer l’urgence' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Créer des actions…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Lancer les rapprochements' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mettre en veille…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Réactiver' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Marquer perdu…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Marquer annulé…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archiver' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Désarchiver' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(10)

    // #4016 L11 — l'export n'est PAS un geste du menu (il n'écrit rien besoin
    // par besoin) : c'est une SORTIE, posée à côté et tenue par la règle
    // d'espace. On archive plutôt que de supprimer — « Marquer annulé » EST le
    // chemin d'archivage.
    expect(screen.queryByRole('menuitem', { name: /export/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /supprim/i })).toBeNull()
  })

  it('change l’urgence de TOUTE la sélection, un appel unitaire par besoin', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1'), need('n-2')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Changer l’urgence' }))
    await user.click(await screen.findByRole('button', { name: 'Critique' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1',
      method: 'PATCH',
      body: { urgency: 'critique' },
    })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-2',
      method: 'PATCH',
      body: { urgency: 'critique' },
    })
  })

  it('efface l’urgence en ENVOYANT `null` — jamais en omettant la clé', async () => {
    // « Je n'en parle pas » et « retire-le » ne sont pas la même demande : le
    // service ne distingue les deux que parce que la clé est présente.
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Changer l’urgence' }))
    await user.click(await screen.findByRole('button', { name: 'Effacer l’urgence' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1',
      method: 'PATCH',
      body: { urgency: null },
    })
  })

  it('attribue le besoin à un membre réel de l’espace', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Attribuer à…' }))
    await user.click(await screen.findByRole('button', { name: 'Léa Bertin' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1',
      method: 'PATCH',
      body: { owner_id: 'u-7' },
    })
  })

  it('libère le propriétaire en ENVOYANT `null`', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Attribuer à…' }))
    await user.click(await screen.findByRole('button', { name: 'Retirer le propriétaire' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1',
      method: 'PATCH',
      body: { owner_id: null },
    })
  })

  /**
   * #2173.48 — « Créer des actions » ne PRÉPARE rien tout seul : le libellé
   * part tel quel, sur la MÊME route que « Prochaines étapes » sur la fiche
   * d'un besoin (`POST /projects/needs/:id/steps`) — aucune route de masse.
   */
  it('crée la même action sur chaque besoin de la sélection', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1'), need('n-2')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Créer des actions…' }))

    const confirm = await screen.findByRole('button', { name: 'Créer l’action' })
    expect(confirm).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox', { name: 'Libellé de l’action' }), 'Relancer le client')
    await user.click(screen.getByRole('button', { name: 'Créer l’action' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1/steps',
      method: 'POST',
      body: { label: 'Relancer le client' },
    })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-2/steps',
      method: 'POST',
      body: { label: 'Relancer le client' },
    })
  })

  it('ne met PAS en veille tant que le motif est vide, et l’envoie une fois rempli', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mettre en veille…' }))

    const confirm = await screen.findByRole('button', { name: 'Mettre en veille' })
    // Le serveur rendrait 400 : un bouton qui part pour revenir en erreur fait
    // recliquer.
    expect(confirm).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox', { name: 'Motif de la mise en veille' }), 'Budget gelé')
    await user.click(screen.getByRole('button', { name: 'Mettre en veille' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1/status',
      method: 'PATCH',
      body: { status: 'on_hold', reason: 'Budget gelé' },
    })
  })

  /**
   * LE MOTIF EST DEMANDÉ AVANT D'AGIR, Y COMPRIS SUR UNE SÉLECTION.
   *
   * Le serveur rend 400 sans motif sur `lost` comme sur `cancelled`. Le
   * demander après coup, besoin par besoin, ne serait pas une action de masse —
   * ce serait douze dialogues.
   */
  it('exige le motif avant de marquer perdu, puis l’envoie sur TOUTE la sélection', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1'), need('n-2')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer perdu…' }))

    expect(await screen.findByRole('button', { name: 'Marquer perdu' })).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox', { name: 'Motif de la perte' }), 'TJM au-dessus du budget')
    await user.click(screen.getByRole('button', { name: 'Marquer perdu' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1/status',
      method: 'PATCH',
      body: { status: 'lost', reason: 'TJM au-dessus du budget' },
    })
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-2/status',
      method: 'PATCH',
      body: { status: 'lost', reason: 'TJM au-dessus du budget' },
    })
  })

  /**
   * PERDU ET ANNULÉ NE FUSIONNENT PAS.
   *
   * Deux entrées de menu, deux états. Un besoin annulé chez nous n'est pas un
   * besoin perdu chez le client, et les confondre fausserait le taux de perte.
   */
  it('marque annulé vers `cancelled`, jamais vers `lost`', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer annulé…' }))
    await user.type(screen.getByRole('textbox', { name: 'Motif de l’annulation' }), 'Projet reporté')
    await user.click(screen.getByRole('button', { name: 'Marquer annulé' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1/status',
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'Projet reporté' },
    })
  })

  /**
   * RÉACTIVER EFFACE LE MOTIF — et l'écran ne dit pas le contraire.
   *
   * Le serveur remet `status_reason` à `null` dès qu'un besoin repart. Si
   * l'écran demandait un motif ici, il ferait taper une phrase qu'il jetterait.
   */
  it('réactive sans demander de motif, et envoie `null` en le disant', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1', 'on_hold')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Réactiver' }))

    // Aucun champ de motif : la raison de l'arrêt meurt avec l'arrêt.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/motif d’arrêt est effacé/)).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Réactiver' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/projects/needs/n-1/status',
      method: 'PATCH',
      body: { status: 'to_reactivate', reason: null },
    })
  })

  it('lance le rapprochement sur sa propre route, une fois par besoin', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1'), need('n-2')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Lancer les rapprochements' }))
    await user.click(await screen.findByRole('button', { name: 'Lancer 2 rapprochements' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    expect(apiFetch).toHaveBeenCalledWith({ path: '/needs/n-1/match', method: 'POST' })
    expect(apiFetch).toHaveBeenCalledWith({ path: '/needs/n-2/match', method: 'POST' })
  })

  /**
   * UNE ENTRÉE QUE LE SERVEUR REFUSERAIT EST GRISE, PAS ABSENTE.
   *
   * Un menu dont les entrées vont et viennent ne s'apprend jamais. Et un besoin
   * refusé dans la colonne « Matching » mais accepté dans le menu à trente
   * pixels de là, c'est la divergence que l'éligibilité partagée évite.
   */
  it('grise le rapprochement sans compétence typée et la clôture d’un besoin déjà clos', async () => {
    const user = userEvent.setup()
    draw([need('n-1', 'lost', 0)])
    await user.click(screen.getByRole('button', { name: 'Actions' }))

    expect(await screen.findByRole('menuitem', { name: 'Lancer les rapprochements' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Marquer perdu…' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Marquer annulé…' })).toHaveAttribute('aria-disabled', 'true')
    // Rouvrir reste possible, et attribuer un besoin perdu à qui doit le
    // raconter aussi : ce sont des champs, pas des étapes.
    expect(screen.getByRole('menuitem', { name: 'Réactiver' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: 'Attribuer à…' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  /** « 7 sur 12 » se lit ; douze appels dont cinq reviennent en 400 se lisent
   *  comme une panne. */
  it('dit combien de la sélection le geste peut toucher, et n’appelle QUE celles-là', async () => {
    apiFetch.mockClear()
    const user = userEvent.setup()
    draw([need('n-1'), need('n-2', 'lost'), need('n-3')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Marquer perdu…' }))
    expect(await screen.findByText(/2 des 3 besoins cochés/)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Motif de la perte' }), 'Budget')
    await user.click(screen.getByRole('button', { name: 'Marquer perdu' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/projects/needs/n-2/status' }))
  })

  it('n’emporte pas le lot quand un besoin est refusé', async () => {
    // `Promise.all` s'effondrerait au premier rejet : deux besoins sur trois
    // ne seraient jamais tentés.
    apiFetch.mockClear()
    apiFetch.mockRejectedValueOnce(new Error('Ce besoin est déjà dans cet état.'))
    const user = userEvent.setup()
    draw([need('n-1'), need('n-2'), need('n-3')])

    await user.click(screen.getByRole('button', { name: 'Actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Changer l’urgence' }))
    await user.click(await screen.findByRole('button', { name: 'Haute' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3))
  })

  /**
   * #2173.49 — ARCHIVER : un rangement NEUTRE (décision Louis, 17/09/2026).
   * Deux portes DÉDIÉES, sans corps — ni l'une ni l'autre ne peut jamais
   * transporter `status`.
   */
  describe('#2173.49 — archiver range, sans toucher au statut', () => {
    it('archive TOUTE la sélection sur la porte dédiée, sans corps', async () => {
      apiFetch.mockClear()
      const user = userEvent.setup()
      draw([need('n-1', 'won'), need('n-2', 'to_qualify')])

      await user.click(screen.getByRole('button', { name: 'Actions' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Archiver' }))
      await user.click(await screen.findByRole('button', { name: 'Archiver' }))

      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
      expect(apiFetch).toHaveBeenCalledWith({ path: '/projects/needs/n-1/archive', method: 'POST' })
      expect(apiFetch).toHaveBeenCalledWith({ path: '/projects/needs/n-2/archive', method: 'POST' })
    })

    it('désarchive sur une AUTRE porte que `reactivate` — les deux gestes ne se confondent jamais', async () => {
      apiFetch.mockClear()
      const user = userEvent.setup()
      draw([need('n-1', 'lost', 1, '2026-09-17T09:00:00.000Z')])

      await user.click(screen.getByRole('button', { name: 'Actions' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Désarchiver' }))
      await user.click(await screen.findByRole('button', { name: 'Désarchiver' }))

      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
      expect(apiFetch).toHaveBeenCalledWith({ path: '/projects/needs/n-1/unarchive', method: 'POST' })
      expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/projects/needs/n-1/status' }))
    })

    it('grise « Archiver » sur un besoin déjà archivé, et « Désarchiver » sur un besoin actif', async () => {
      const user = userEvent.setup()
      draw([need('n-1', 'qualified', 1, '2026-09-17T09:00:00.000Z')])
      await user.click(screen.getByRole('button', { name: 'Actions' }))

      expect(await screen.findByRole('menuitem', { name: 'Archiver' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('menuitem', { name: 'Désarchiver' })).not.toHaveAttribute('aria-disabled', 'true')
    })
  })
  /**
   * #4016 L11 — DÉCISION LOUIS 11/10/2026 (renversement daté de c43) :
   * l'export de masse existe, et il ne s'ouvre QUE si la règle d'espace laisse
   * sortir les données.
   */
  describe('#4016 L11 — l’export de masse, tenu par la règle d’espace', () => {
    it('ne montre AUCUN bouton d’export tant que la règle ne l’autorise pas', () => {
      // La règle d'espace REFUSE : le setup global l'ouvre par défaut, on la ferme ici.
      vi.mocked(useDataExit).mockReturnValue({ allowed: false, grant: null })
      draw([need('n-1')])
      expect(screen.queryByRole('button', { name: /Exporter/ })).toBeNull()
      vi.mocked(useDataExit).mockReturnValue({ allowed: true, grant: {} as DataExitGrant })
    })

    it('exporte la sélection en CSV sur la route gouvernée, puis télécharge avec la preuve', async () => {
      apiFetch.mockClear()
      apiFetch.mockImplementation(async (args: ApiCall) =>
        args.path === '/projects/needs/export' ? '"Besoin"\r\n' : {},
      )
      const user = userEvent.setup()
      draw([need('n-1'), need('n-2')])

      await user.click(await screen.findByRole('button', { name: 'Exporter en CSV' }))
      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith({
          path: '/projects/needs/export',
          method: 'POST',
          body: { needIds: ['n-1', 'n-2'], format: 'csv', lang: 'fr' },
          responseType: 'text',
        }),
      )
      await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
      expect(downloadCSV.mock.calls[0]?.[1]).toMatch(/^besoins-\d{4}-\d{2}-\d{2}\.csv$/)
      expect(downloadCSV.mock.calls[0]?.[2]).toBeTruthy()
      apiFetch.mockImplementation(async () => ({}))
    })

    it('exporte en JSON par la même route', async () => {
      apiFetch.mockClear()
      apiFetch.mockImplementation(async (args: ApiCall) =>
        args.path === '/projects/needs/export' ? '{"needs":[]}' : {},
      )
      const user = userEvent.setup()
      draw([need('n-1')])

      await user.click(await screen.findByRole('button', { name: 'Exporter en JSON' }))
      await waitFor(() => expect(downloadJSON).toHaveBeenCalledTimes(1))
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/projects/needs/export',
          body: { needIds: ['n-1'], format: 'json', lang: 'fr' },
        }),
      )
      apiFetch.mockImplementation(async () => ({}))
    })
  })
})
