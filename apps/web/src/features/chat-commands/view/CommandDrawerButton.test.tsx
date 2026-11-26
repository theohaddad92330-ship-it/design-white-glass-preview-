import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { CommandDrawerButton } from './CommandDrawerButton'

/**
 * #1913 — « Que puis-je demander ? » organisé par MOMENTS MÉTIER.
 *
 * Le retour : « Le catalogue sert à découvrir les usages, pas à afficher
 * l'inventaire technique des outils. » Et, pour chaque cas : question, résultat
 * attendu, donnée nécessaire, connexion éventuelle, coût éventuel.
 *
 * Les textes des commandes ci-dessous sont des FIXTURES neutres, écrites ici :
 * aucun n'est repris d'un corpus de test du moteur.
 */

vi.mock('sonner', () => ({ toast: vi.fn() }))

const apiFetchMock = vi.mocked(apiFetch)

const brief = {
  key: 'fixture_brief',
  category: 'agenda',
  moment: 'start_day',
  label: { fr: 'Fixture brief', en: 'Fixture brief EN' },
  prompt: { fr: 'Question fixture du matin', en: 'Morning fixture question' },
  outcome: { fr: 'Résultat fixture du matin', en: 'Morning fixture outcome' },
  tools: ['get_daily_briefing'],
  requires: [],
  availability: { state: 'ready', missing: [] },
}

const relance = {
  key: 'fixture_relance',
  category: 'mailbox',
  moment: 'follow_up',
  label: { fr: 'Fixture relance', en: 'Fixture follow-up' },
  prompt: { fr: 'Question fixture de relance', en: 'Follow-up fixture question' },
  outcome: { fr: 'Résultat fixture de relance', en: 'Follow-up fixture outcome' },
  tools: ['search_mailbox', 'prepare_mail_draft'],
  requires: ['email'],
  availability: { state: 'unavailable', missing: ['email'] },
}

/** Ni résultat écrit, ni outil déclaré : ses deux champs sont INCONNUS. */
const mystere = {
  key: 'fixture_mystere',
  category: 'steering',
  moment: 'steer_team',
  label: { fr: 'Fixture mystère', en: 'Fixture mystery' },
  prompt: { fr: 'Question fixture de pilotage', en: 'Steering fixture question' },
  tools: ['outil_non_declare'],
  requires: [],
  availability: { state: 'ready', missing: [] },
}

function renderDrawer(
  commands: unknown[] = [brief, relance, mystere],
  props: Partial<{
    hideTrigger: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
    draft: string
    onRestore: (previous: string) => void
  }> = {},
) {
  apiFetchMock.mockResolvedValue({ commands })
  const onPick = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(
    <QueryClientProvider client={client}>
      <CommandDrawerButton onPick={onPick} {...props} />
    </QueryClientProvider>,
  )
  return { onPick }
}

async function openDrawer() {
  await userEvent.click(screen.getByRole('button', { name: 'Que puis-je demander ?' }))
  await screen.findByRole('button', { name: /Fixture brief/ })
}

/**
 * Recette 07/10 — à 360 px, ce déclencheur affichait son libellé ENTIER dans
 * une rangée `flex-nowrap` déjà pleine (contexte, profondeur, outils) : le
 * texte débordait par-dessus le sélecteur de profondeur voisin (#chat-research-mode),
 * qui devenait inatteignable au doigt. Même traitement que « Outils et sources »
 * (#3709, `ToolsSourcesMenu.tsx`) : l'icône reste seule sous `sm`, le nom
 * accessible survit par `aria-label`.
 */
describe('recette 07/10 — le déclencheur tient à 360 px', () => {
  it('cache son libellé sous `sm`, garde l’icône et un nom accessible', () => {
    renderDrawer()

    const trigger = screen.getByRole('button', { name: 'Que puis-je demander ?' })
    expect(trigger).toHaveAttribute('aria-label', 'Que puis-je demander ?')
    expect(trigger.querySelector('span.hidden.sm\\:inline')).not.toBeNull()
    expect(trigger.className).toContain('shrink-0')
    expect(trigger.className).toContain('min-w-11')
  })
})

// #5043 — « Idées de demandes » : liste à gauche, aperçu à droite.
const rowOf = (label: RegExp) => screen.getByRole('button', { name: label, pressed: undefined })
const preview = () => document.getElementById('request-catalog-preview') as HTMLElement

describe('#5043 — Idées de demandes : liste + aperçu', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    vi.mocked(toast).mockReset()
  })

  it('s’ouvre sur « Idées de demandes », une seule demande sélectionnée (aria-pressed + aria-controls)', async () => {
    renderDrawer()
    await openDrawer()

    expect(screen.getByRole('heading', { name: 'Idées de demandes' })).toBeInTheDocument()
    const rows = screen.getAllByRole('button', { pressed: true }).filter(button => button.hasAttribute('aria-controls'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('aria-controls', 'request-catalog-preview')

    await userEvent.click(rowOf(/Fixture mystère/))
    expect(rowOf(/Fixture mystère/)).toHaveAttribute('aria-pressed', 'true')
    expect(rowOf(/Fixture brief/)).toHaveAttribute('aria-pressed', 'false')
  })

  it('puces de moment avec compteur et « N demandes sur 31 » en role=status ; un moment vide n’a pas de puce', async () => {
    renderDrawer()
    await openDrawer()

    expect(screen.getByRole('status')).toHaveTextContent('3 demandes sur 3')
    expect(screen.getByRole('button', { name: /Tout/ })).toHaveTextContent('3')
    const chip = screen.getByRole('button', { name: /Relances/ })
    expect(chip).toHaveTextContent('1')
    expect(screen.queryByRole('button', { name: /Interlocuteur/ })).toBeNull()

    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('1 demande sur 3')
    expect(screen.queryByRole('button', { name: /Fixture brief/ })).toBeNull()
  })

  it('plus de vue « Par domaine » ni de bascule', async () => {
    renderDrawer()
    await openDrawer()

    expect(screen.queryByRole('button', { name: 'Par domaine' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Par moment' })).toBeNull()
  })

  it('l’aperçu porte la demande en citation, « Ce que tu obtiens », « À partir de » et la connexion', async () => {
    renderDrawer()
    await openDrawer()
    const view = within(preview())

    expect(view.getByText('Question fixture du matin')).toBeInTheDocument()
    expect(view.getByText('Ce que tu obtiens')).toBeInTheDocument()
    expect(view.getByText('Résultat fixture du matin')).toBeInTheDocument()
    expect(view.getByText('À partir de')).toBeInTheDocument()
    expect(view.getByText('tes rendez-vous, tes fils de messagerie, tes comptes')).toBeInTheDocument()
    expect(view.getByText('aucune nécessaire')).toBeInTheDocument()
    expect(view.getByText('Prête')).toBeInTheDocument()
    expect(view.getByText('Tu pourras la modifier avant l’envoi.')).toBeInTheDocument()
    expect(preview()).not.toHaveTextContent(/crédit/i)
  })

  it('une donnée inconnue est ABSENTE, jamais un tiret', async () => {
    renderDrawer()
    await openDrawer()
    await userEvent.click(rowOf(/Fixture mystère/))
    const view = within(preview())

    expect(view.queryByText('Ce que tu obtiens')).toBeNull()
    expect(view.queryByText('À partir de')).toBeNull()
    expect(view.queryByText('—')).toBeNull()
  })

  it('une demande indisponible reste visible, non préparable, et dit ce qui manque', async () => {
    renderDrawer()
    await openDrawer()
    await userEvent.click(rowOf(/Fixture relance/))

    const view = within(preview())
    expect(view.getByText('Il manque : ta messagerie')).toBeInTheDocument()
    expect(view.getByText('Indisponible ici')).toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Préparer cette demande' })).toBeDisabled()
  })

  it('une demande dégradée dit ce qui manque mais reste préparable', async () => {
    renderDrawer([{ ...brief, availability: { state: 'degraded', missing: ['calendar'] } }])
    await openDrawer()

    const view = within(preview())
    expect(view.getByText('Partiellement disponible')).toBeInTheDocument()
    expect(view.getByText('Il manque : ton agenda')).toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Préparer cette demande' })).toBeEnabled()
  })

  it('la recherche plein texte est conservée ; le vide propose une réinitialisation', async () => {
    renderDrawer()
    await openDrawer()
    const search = screen.getByRole('textbox', { name: 'Rechercher une demande…' })

    await userEvent.type(search, 'matin')
    expect(screen.getByRole('button', { name: /Fixture brief/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fixture relance/ })).toBeNull()

    await userEvent.clear(search)
    await userEvent.type(search, 'zzzz')
    expect(screen.getByText('Aucune demande ne correspond')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 demande sur 3')

    await userEvent.click(screen.getByRole('button', { name: 'Tout réinitialiser' }))
    expect(search).toHaveValue('')
    expect(screen.getByRole('button', { name: /Fixture brief/ })).toBeInTheDocument()
  })

  it('« Préparer cette demande » insère sans envoyer et ferme ; saisie vide = pas d’annulation', async () => {
    const { onPick } = renderDrawer()
    await openDrawer()

    await userEvent.click(within(preview()).getByRole('button', { name: 'Préparer cette demande' }))

    expect(onPick).toHaveBeenCalledWith('Question fixture du matin')
    expect(toast).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('si la saisie contenait du texte, un toast « Annuler » le rend', async () => {
    const onRestore = vi.fn()
    const { onPick } = renderDrawer(undefined, { draft: 'Mon brouillon', onRestore })
    await openDrawer()

    await userEvent.click(within(preview()).getByRole('button', { name: 'Préparer cette demande' }))

    expect(onPick).toHaveBeenCalledWith('Question fixture du matin')
    expect(toast).toHaveBeenCalledTimes(1)
    const options = vi.mocked(toast).mock.calls[0][1] as { action: { label: string; onClick: () => void } }
    expect(options.action.label).toBe('Annuler')
    options.action.onClick()
    expect(onRestore).toHaveBeenCalledWith('Mon brouillon')
  })

  it('en anglais : libellés et demande lus dans la langue', async () => {
    await i18n.changeLanguage('en')
    try {
      renderDrawer()
      await userEvent.click(screen.getByRole('button', { name: 'What can I ask?' }))
      await screen.findByRole('button', { name: /Fixture brief EN/ })
      expect(screen.getByRole('heading', { name: 'Request ideas' })).toBeInTheDocument()
      expect(within(preview()).getByText('Morning fixture question')).toBeInTheDocument()
      expect(within(preview()).getByRole('button', { name: 'Prepare this request' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('fr')
    }
  })

  it('chargement et erreur réseau restent distincts du vide', async () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <CommandDrawerButton onPick={vi.fn()} open />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Je charge les commandes…')).toBeInTheDocument()
    expect(screen.queryByText('Aucune demande ne correspond')).toBeNull()
  })

  it('erreur : message d’erreur, pas « aucun résultat »', async () => {
    apiFetchMock.mockRejectedValue(new Error('réseau'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <CommandDrawerButton onPick={vi.fn()} open />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Les commandes n’ont pas pu être chargées')).toBeInTheDocument()
    expect(screen.queryByText('Aucune demande ne correspond')).toBeNull()
  })

  it('une API d’avant le déploiement (sans moment) : liste plate sous « Tout », aucune puce de moment', async () => {
    const { moment: _brief, ...briefSansMoment } = brief
    const { moment: _relance, ...relanceSansMoment } = relance
    renderDrawer([briefSansMoment, relanceSansMoment])
    await openDrawer()

    expect(screen.getByRole('button', { name: /Fixture relance/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Relances/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Tout/ })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('2 demandes sur 2')
  })
})

describe('#5043 — mobile (≤ 768 px, GA-28) : deux vues', () => {
  const original = window.matchMedia
  beforeEach(() => {
    apiFetchMock.mockReset()
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })

  it('la liste d’abord ; choisir ouvre l’aperçu ; « Retour aux demandes » rend filtre, recherche et sélection', async () => {
    renderDrawer()
    await userEvent.click(screen.getByRole('button', { name: 'Que puis-je demander ?' }))
    await screen.findByRole('button', { name: /Fixture brief/ })
    expect(preview()).toHaveAttribute('hidden')

    await userEvent.click(screen.getByRole('button', { name: /Relances/ }))
    await userEvent.click(rowOf(/Fixture relance/))
    expect(preview()).not.toHaveAttribute('hidden')

    await userEvent.click(screen.getByRole('button', { name: 'Retour aux demandes' }))
    expect(preview()).toHaveAttribute('hidden')
    expect(screen.getByRole('button', { name: /Relances/ })).toHaveAttribute('aria-pressed', 'true')
    expect(rowOf(/Fixture relance/)).toHaveAttribute('aria-pressed', 'true')
  })
})

/**
 * #3774.2.1 — « Voir tout » (`Chat.tsx`, ligne d'amorces) et « Que puis-je
 * demander ? » (le déclencheur propre à ce composant) ouvraient tous les deux
 * CE MÊME tiroir, visibles EN MÊME TEMPS dès qu'une conversation avait des
 * amorces (bureau, fil entamé) — deux entrées pour un seul geste (GA-26, loi 4
 * du tome 7). `hideTrigger` tait le déclencheur propre sans démonter le
 * `Dialog` : son état reste piloté de l'extérieur (`open`/`onOpenChange`),
 * exactement comme le fait déjà « Voir tout » — un panneau qui réapparaîtrait
 * par un AUTRE chemin resterait atteignable.
 */
describe('#3774.2.1 — `hideTrigger` tait le déclencheur propre sans retirer le tiroir', () => {
  it('par défaut, le déclencheur « Que puis-je demander ? » est visible', () => {
    renderDrawer()
    expect(screen.getByRole('button', { name: 'Que puis-je demander ?' })).toBeInTheDocument()
  })

  it('`hideTrigger` retire le bouton, mais le dialogue reste piloté par `open`', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    apiFetchMock.mockResolvedValue({ commands: [brief, relance, mystere] })
    const onOpenChange = vi.fn()

    const { rerender: rerenderDrawer } = render(
      <QueryClientProvider client={client}>
        <CommandDrawerButton onPick={vi.fn()} hideTrigger open={false} onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    )

    expect(screen.queryByRole('button', { name: 'Que puis-je demander ?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerenderDrawer(
      <QueryClientProvider client={client}>
        <CommandDrawerButton onPick={vi.fn()} hideTrigger open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Que puis-je demander ?' })).not.toBeInTheDocument()
  })

  it('sait dire NON : sans `hideTrigger`, le déclencheur propre reste — la garde doit pouvoir le voir', () => {
    renderDrawer(undefined, { open: false })
    expect(screen.getByRole('button', { name: 'Que puis-je demander ?' })).toBeInTheDocument()
  })
})
