import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

/** #2271.20 — le clic ne fait qu'un geste LOCAL : aucune requête réseau à espionner. */
const downloadCSV = vi.hoisted(() => vi.fn())
vi.mock('@/lib/export-csv', () => ({ downloadCSV }))

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

function renderReply(text: string) {
  return renderWithRouter(<StructuredReply text={text} />)
}

const ranking = {
  type: 'account_ranking',
  title: 'Par où commencer',
  axes: ['Signal daté', 'Accès'],
  items: [
    { name: 'BlaBlaCar', why: ['Expansion annoncée.'], verdict: 'À travailler en premier.' },
    { name: 'Alpha Industrie', why: ['Signal cyber.'] },
    { name: 'Société Générale', why: ['Plan stratégique.'] },
  ],
}

/**
 * #2945/#2299.36-.39 — PREMIÈRE TRANCHE : trier, filtrer, sélectionner et
 * enregistrer les résultats d'un classement de comptes AFFICHÉ dans le chat.
 * Portée volontairement étroite (voir commentaire de `AccountRankingCard.tsx`) :
 * un seul type de bloc (`account_ranking`), aucun état partagé entre blocs.
 */
describe('#2945/#2299.37 — filtrer les comptes affichés dans le chat', () => {
  it('un filtre par nom ne montre que les comptes qui correspondent', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    const filter = within(card).getByRole('textbox', { name: 'Filtrer les résultats affichés' })
    await user.type(filter, 'alpha')
    expect(within(card).getByText('Alpha Industrie')).toBeInTheDocument()
    expect(within(card).queryByText('BlaBlaCar')).not.toBeInTheDocument()
    expect(within(card).queryByText('Société Générale')).not.toBeInTheDocument()
  })

  it('NON : un filtre sans correspondance dit « aucun résultat », jamais une carte vide silencieuse', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    const filter = within(card).getByRole('textbox', { name: 'Filtrer les résultats affichés' })
    await user.type(filter, 'zzz-introuvable')
    expect(within(card).getByText('Aucun résultat pour « zzz-introuvable ».')).toBeInTheDocument()
  })
})

describe('#2945/#2299.36 — trier les comptes affichés dans le chat', () => {
  it('« Ordre de Laura » est le tri par défaut : identique à l’ordre du bloc', async () => {
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    const names = within(card)
      .getAllByRole('listitem')
      .map(item => item.textContent ?? '')
    expect(names[0]).toContain('BlaBlaCar')
    expect(within(card).getByRole('button', { name: 'Ordre de Laura' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('« Nom (A→Z) » réordonne la liste sans rien inventer', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    await user.click(within(card).getByRole('button', { name: 'Nom (A→Z)' }))
    const names = within(card)
      .getAllByRole('listitem')
      .map(item => item.textContent ?? '')
    expect(names[0]).toContain('Alpha Industrie')
    expect(within(card).getByRole('button', { name: 'Nom (A→Z)' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('#2945/#2299.38-.39 — sélectionner puis enregistrer des comptes depuis le chat', () => {
  beforeEach(() => downloadCSV.mockClear())

  it('cocher des comptes, puis « Enregistrer la sélection » exporte SEULEMENT les cochés', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })

    expect(within(card).queryByRole('button', { name: /^Enregistrer (le compte|les \d+)/ })).not.toBeInTheDocument()

    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner BlaBlaCar' }))
    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner Société Générale' }))
    expect(within(card).getByText('2 sélectionnés')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: /^Enregistrer (le compte|les \d+)/ }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadCSV.mock.calls[0]!
    expect(filename).toMatch(/^comptes-selection-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv).toContain('BlaBlaCar')
    expect(csv).toContain('Société Générale')
    expect(csv).not.toContain('Alpha Industrie')
  })
})

// #4288.6 — la case reste petite, sa CIBLE est un bloc de 44 × 44 px qui coche aussi quand on clique à côté.
describe('#4288.6 — la case de sélection a une cible de 44 px', () => {
  it('la case est portée par un bloc size-11, et un clic sur ce bloc coche (comportement inchangé)', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    const box = within(card).getByRole('checkbox', { name: 'Sélectionner BlaBlaCar' })
    const target = box.closest('label')
    expect(target).not.toBeNull()
    expect(target?.className).toMatch(/\bsize-11\b/)
    // contrôle négatif : la case seule garde sa taille visuelle de 16 px (size-4), pas la cible
    expect(box.className).toMatch(/\bsize-4\b/)
    expect(box.className).not.toMatch(/\bsize-11\b/)

    await user.click(target as HTMLElement)
    expect(within(card).getByText('1 sélectionné')).toBeInTheDocument()
    expect(box).toBeChecked()
  })
})

// #4292.15 (recette 23/10) — une réponse de classement s'exporte en CSV depuis le fil SANS rien cocher :
// le bouton de la carte exporte les comptes affichés (le filtre compris) ; coché, « Enregistrer la sélection » reste.
describe('#4292.15 — exporter tout le classement affiché, sans sélection', () => {
  beforeEach(() => downloadCSV.mockClear())

  it('« Exporter en CSV » exporte tous les comptes affichés, avec leurs faits', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    await user.click(within(card).getByRole('button', { name: /^Exporter (le|les \d+) compte/ }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadCSV.mock.calls[0]!
    expect(filename).toMatch(/^classement-\d{4}-\d{2}-\d{2}\.csv$/)
    for (const name of ['BlaBlaCar', 'Alpha Industrie', 'Société Générale']) expect(csv).toContain(name)
  })

  it('suit le filtre : seuls les comptes affichés partent', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    await user.type(within(card).getByRole('textbox', { name: 'Filtrer les résultats affichés' }), 'alpha')
    await user.click(within(card).getByRole('button', { name: /^Exporter (le|les \d+) compte/ }))
    const [csv] = downloadCSV.mock.calls[0]!
    expect(csv).toContain('Alpha Industrie')
    expect(csv).not.toContain('BlaBlaCar')
  })
})

describe('#4073.5 — l’export porte les FAITS du classement, pas seulement son texte', () => {
  beforeEach(() => downloadCSV.mockClear())

  const withFacts = {
    ...ranking,
    items: [
      {
        name: 'BlaBlaCar',
        why: ['Expansion annoncée.'],
        level: 'priority',
        not_evaluated: ['Budget cyber'],
        limits: ['Un seul signal'],
        source: { label: 'Les Echos', as_of: '2026-10-01', basis: 'proof' },
      },
      { name: 'Alpha Industrie', why: ['Signal cyber.'] },
    ],
  }

  it('le CSV porte rang, niveau, non-évalué, source datée et critères de classement', async () => {
    const user = userEvent.setup()
    renderReply(fence(withFacts))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner BlaBlaCar' }))
    await user.click(within(card).getByRole('button', { name: /^Enregistrer (le compte|les \d+)/ }))
    const [csv] = downloadCSV.mock.calls[0]!
    for (const fact of [
      'Rang',
      'Prioritaire',
      'Budget cyber',
      'Un seul signal',
      '2026-10-01',
      'Preuve',
      'Signal daté · Accès',
    ]) {
      expect(csv).toContain(fact)
    }
  })

  it('NON : un fait absent est une cellule vide, jamais « 0 » ni un mot deviné', async () => {
    const user = userEvent.setup()
    renderReply(fence(withFacts))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner Alpha Industrie' }))
    await user.click(within(card).getByRole('button', { name: /^Enregistrer (le compte|les \d+)/ }))
    const [csv] = downloadCSV.mock.calls[0]!
    expect(csv).toContain('"Alpha Industrie","","","Signal cyber."')
    expect(csv).not.toMatch(/"0"/)
    expect(csv).not.toContain('Prioritaire')
  })
})

describe('#3704.2 — « déjà dans ton espace » vs « nouvelle cible », nommées sur la ligne', () => {
  it('une ligne connue porte « Déjà dans ton espace », une nouvelle porte « Nouvelle cible »', async () => {
    renderReply(
      fence({
        ...ranking,
        items: [
          { name: 'BlaBlaCar', why: ['Expansion annoncée.'], already_in_workspace: true },
          { name: 'Alpha Industrie', why: ['Signal cyber.'], already_in_workspace: false },
        ],
      }),
    )
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).getByText('Déjà dans ton espace')).toBeInTheDocument()
    expect(within(card).getByText('Nouvelle cible')).toBeInTheDocument()
  })

  it('NON : une ligne dont l’appartenance n’a pas été vérifiée ne porte aucun badge deviné', async () => {
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).queryByText('Déjà dans ton espace')).not.toBeInTheDocument()
    expect(within(card).queryByText('Nouvelle cible')).not.toBeInTheDocument()
  })
})

/** #4269.1 (18/10) — cocher N comptes proposés puis « Analyser la sélection » dépose bien N analyses. */
const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async importOriginal => ({ ...(await importOriginal<object>()), apiFetch }))
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('sonner', async importOriginal => ({
  ...(await importOriginal<object>()),
  toast: { success: toastSuccess, error: vi.fn() },
}))

describe('#4269.1 — cocher puis analyser lance les analyses', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockImplementation(async ({ path }: { path: string }) =>
      path.startsWith('/analysis/launch-plan') ? { scenario: 'fresh', credits: 8 } : { id: 'batch-1' },
    )
    toastSuccess.mockClear()
  })

  it('cocher 2 comptes puis « Analyser la sélection » dépose UN lot de 2, avec un retour visible', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner BlaBlaCar' }))
    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner Société Générale' }))
    // GA-86 / #4463 — le nombre d'analyses s'annonce avant le clic (plus le coût) ; le bouton n'existe qu'une fois le lot mesuré.
    expect(await within(card).findByText('2 analyses seront lancées.')).toBeInTheDocument()
    expect(card).not.toHaveTextContent(/crédit/i)
    await user.click(await within(card).findByRole('button', { name: 'Analyser la sélection' }))
    const call = apiFetch.mock.calls.find(([arg]) => arg.path === '/analysis-batches')
    expect(call?.[0].method).toBe('POST')
    expect(call?.[0].body).toEqual({
      source: 'laura',
      items: [{ name: 'BlaBlaCar' }, { name: 'Société Générale' }],
    })
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  // #4432.3 — la zone de la recherche voyage avec le nom : elle devient le périmètre du dossier.
  it('#4432.3 — depuis une carte cherchée en Occitanie, la zone part avec le nom et l’étiquette de palier se lit', async () => {
    const user = userEvent.setup()
    const zoned = {
      ...ranking,
      search_zone: { regions: ['Occitanie'] },
      items: [
        { name: 'SAFRAN', why: ['Aéronautique.'], zone_label: 'Haute-Garonne' },
        { name: 'AIRBUS', why: ['Aéronautique.'] },
      ],
    }
    renderReply(fence(zoned))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).getByText('Haute-Garonne')).toBeInTheDocument()
    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner SAFRAN' }))
    await user.click(await within(card).findByRole('button', { name: 'Analyser la sélection' }))
    const call = apiFetch.mock.calls.find(([arg]) => arg.path === '/analysis-batches')
    expect(call?.[0].body).toEqual({
      source: 'laura',
      items: [
        {
          name: 'SAFRAN',
          suggestion_id: 'laura:SAFRAN',
          suggestion_criteria: { zone: 'Occitanie', zone_regions: ['Occitanie'] },
        },
      ],
    })
  })

  it('NON : coût non mesuré (plan illisible) → il est dit « non mesuré » et rien ne part', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.startsWith('/analysis/launch-plan')) throw new Error('boom')
      return { id: 'batch-1' }
    })
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    await user.click(within(card).getByRole('checkbox', { name: 'Sélectionner BlaBlaCar' }))
    expect(await within(card).findByText(/non mesuré/)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Analyser la sélection' })).not.toBeInTheDocument()
    expect(apiFetch.mock.calls.some(([arg]) => arg.path === '/analysis-batches')).toBe(false)
  })

  it('NON : sans case cochée, aucun bouton « Analyser la sélection »', async () => {
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).queryByRole('button', { name: 'Analyser la sélection' })).not.toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
