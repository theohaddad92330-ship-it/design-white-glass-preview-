import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REPLY_BLOCK_TYPES } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'
import { ReplyConversation } from '../reply-conversation'

/** Le logo réellement demandé : les indices que l'avatar reçoit, lus sans charger d'image. */
vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: ({ name, logoUrl, website }: { name: string; logoUrl?: string | null; website?: string | null }) => (
    <span data-testid="company-avatar" data-name={name} data-logo={logoUrl ?? ''} data-website={website ?? ''} />
  ),
}))

const getOne = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return { ...actual, accountsApi: { ...actual.accountsApi, getOne: (id: string) => getOne(id) } }
})

/** #2271.20 — le clic ne fait qu'un geste LOCAL : aucune requête réseau à espionner. */
const downloadCSV = vi.hoisted(() => vi.fn())
vi.mock('@/lib/export-csv', () => ({ downloadCSV }))

/**
 * #1914 — UNE RÉPONSE QUI A UNE FORME SE REND EN CARTE.
 *
 * Le jeu est celui du contrat, lu sur le disque (le même que zod et pydantic
 * traversent) : un type déclaré sans carte à l'écran tomberait ICI — c'est
 * l'autre moitié de « une action émise dans un langage, non rendue dans l'autre ».
 */
const fixtures = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../../../packages/contracts/src/schemas/reply-blocks.fixtures.json'),
    'utf8',
  ),
) as { valid: Record<string, Record<string, unknown>> }

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

function renderReply(text: string) {
  return renderWithRouter(<StructuredReply text={text} />)
}

describe('#1914.1 — chaque type déclaré a sa carte', () => {
  it('le jeu lu n’est pas vide', () => {
    expect(Object.keys(fixtures.valid).sort()).toEqual([...REPLY_BLOCK_TYPES].sort())
  })

  it.each([...REPLY_BLOCK_TYPES])('« %s » se rend en carte, jamais en JSON', async type => {
    const { container } = renderReply(`Voici.\n\n${fence(fixtures.valid[type])}\n\nOn avance ?`)
    const card = await screen.findByRole('group', { name: String(fixtures.valid[type]!.title ?? '') || /./ })
    expect(card).toHaveAttribute('data-reply-block', type)
    expect(screen.getByText('Voici.')).toBeInTheDocument()
    expect(screen.getByText('On avance ?')).toBeInTheDocument()
    expect(container.textContent).not.toContain('```')
    expect(container.textContent).not.toContain('"type"')
  })
})

describe('#3229 — le nombre de contacts annoncé est celui de la carte', () => {
  const list = (count: number) => ({
    type: 'contact_list',
    title: 'Contacts DSI',
    items: Array.from({ length: count }, (_, i) => ({ name: `Personne ${i + 1}`, role: 'DSI' })),
  })

  it('une liste repliée sur trois dit son total au-dessus', async () => {
    renderReply(fence(list(5)))
    const card = await screen.findByRole('group', { name: 'Contacts DSI' })
    expect(within(card).getByText('5 contacts')).toBeInTheDocument()
    expect(within(card).queryByText('Personne 4')).not.toBeInTheDocument()
  })

  it('une liste de trois ou moins ne répète pas un nombre évident', async () => {
    renderReply(fence(list(3)))
    const card = await screen.findByRole('group', { name: 'Contacts DSI' })
    expect(within(card).queryByText('3 contacts')).not.toBeInTheDocument()
  })
})

describe('r3a (recette prod 07/10) — la carte contacts écrit e-mail et téléphone en clair', () => {
  it('la coordonnée est lisible sur la ligne, jamais seulement « e-mail vérifié »', async () => {
    renderReply(
      fence({
        type: 'contact_list',
        title: 'DSI de UNEO',
        items: [
          {
            name: 'Caroline Jaouen',
            role: 'Directrice des SI',
            email: 'caroline.jaouen@uneo.example',
            phone: '+33 1 23 45 67 89',
            reason: 'E-mail vérifié',
          },
          { name: 'Sans Coordonnée', role: 'DSI adjoint' },
        ],
      }),
    )
    const card = await screen.findByRole('group', { name: 'DSI de UNEO' })
    expect(within(card).getByText('caroline.jaouen@uneo.example')).toBeInTheDocument()
    expect(within(card).getByText('+33 1 23 45 67 89')).toBeInTheDocument()
    expect(within(card).getAllByText(/@/)).toHaveLength(1)
  })
})

describe('#1914.3 / #1914.12 — le classement de comptes', () => {
  const ranking = {
    type: 'account_ranking',
    title: 'Par où commencer',
    axes: ['Signal daté', 'Accès'],
    items: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map(name => ({
      name,
      why: [`Raison de ${name}.`],
    })),
    not_evaluated: ['Budget des projets'],
  }

  it('montre le top trois, puis « Afficher les 2 autres résultats » (déjà obtenus, aucun crédit) qui se tabule et déplie', async () => {
    const user = userEvent.setup()
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).getByText('Gamma')).toBeInTheDocument()
    expect(within(card).queryByText('Delta')).not.toBeInTheDocument()

    const more = within(card).getByRole('button', { name: 'Afficher les 2 autres résultats' })
    expect(more).toHaveAttribute('type', 'button')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    more.focus()
    await user.keyboard('{Enter}')
    expect(within(card).getByText('Epsilon')).toBeInTheDocument()
    expect(more).toHaveAttribute('aria-expanded', 'true')
  })

  it('un classement n’est jamais nu : ses axes ET ce qui n’a pas été évalué sont nommés', async () => {
    renderReply(fence(ranking))
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).getByText(/Signal daté · Accès/)).toBeInTheDocument()
    expect(within(card).getByText(/Budget des projets/)).toBeInTheDocument()
  })

  /**
   * #3776.5 (lot K05, 07/10) — « preuve / interprétation / action
   * distinguables […] une observation historique ne devient ni signal
   * actuel ». `basis` (`sourceSchema`) dit le FONDEMENT d'une citation, lu par
   * `SourceBadge` (`ReplyCard.tsx`) — jamais deviné : absent, rien de plus
   * qu'avant ce point.
   */
  it('une source PREUVE le dit dans son badge, une source sans fondement connu reste muette sur ce point', async () => {
    renderReply(
      fence({
        ...ranking,
        items: [
          { name: 'Alpha', why: ['Signal.'], source: { label: 'Registre public', basis: 'proof' } },
          { name: 'Beta', why: ['Signal.'], source: { label: 'Note interne' } },
        ],
      }),
    )
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).getByText(/Registre public/)).toHaveTextContent('Preuve')
    expect(within(card).getByText(/Note interne/)).not.toHaveTextContent(/Preuve|Interprétation|Historique/)
  })

  it('une source INTERPRÉTATION ou HISTORIQUE porte le bon libellé, jamais celui d’une autre', async () => {
    renderReply(
      fence({
        ...ranking,
        items: [
          { name: 'Alpha', why: ['Signal.'], source: { label: 'Lecture du modèle', basis: 'interpretation' } },
          { name: 'Beta', why: ['Signal.'], source: { label: 'Archive 2024', basis: 'history' } },
        ],
      }),
    )
    const card = await screen.findByRole('group', { name: 'Par où commencer' })
    expect(within(card).getByText(/Lecture du modèle/)).toHaveTextContent('Interprétation')
    expect(within(card).getByText(/Archive 2024/)).toHaveTextContent('Historique')
  })

  it('un lien de carte ne mène qu’à un écran qui existe', async () => {
    renderReply(
      fence({
        ...ranking,
        items: [
          {
            name: 'Alpha',
            why: ['Signal.'],
            href: '/accounts/alpha-1',
            action: { label: 'Ouvrir le dossier', href: '/accounts/alpha-1' },
          },
          { name: 'Beta', why: ['Signal.'], href: '/decouvrir' },
        ],
      }),
    )
    expect(await screen.findByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/accounts/alpha-1')
    expect(screen.getByRole('link', { name: 'Ouvrir le dossier' })).toHaveAttribute('href', '/accounts/alpha-1')
    // Une route inventée reste un libellé lisible, jamais un lien mort.
    expect(screen.queryByRole('link', { name: 'Beta' })).not.toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})

describe('#1914.5 — la comparaison', () => {
  it('rend un vrai tableau à en-têtes, et une case inconnue dit « non mesuré », jamais 0', async () => {
    renderReply(fence(fixtures.valid.comparison))
    const table = await screen.findByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(header => header.textContent)
    expect(headers).toEqual(expect.arrayContaining(['Alpha Industrie', 'Beta Services']))
    expect(within(table).getByRole('rowheader', { name: 'ESN en place' })).toBeInTheDocument()
    const unknownRow = within(table).getByRole('rowheader', { name: 'ESN en place' }).closest('tr')!
    expect(within(unknownRow).getByText(/non mesuré/)).toBeInTheDocument()
    expect(unknownRow.textContent).not.toMatch(/\b0\b/)
  })
})

describe('#1914.13 — avatars : seulement la donnée qui existe', () => {
  it('une personne ne reçoit jamais d’image : ses initiales', async () => {
    const { container } = renderReply(fence(fixtures.valid.contact_list))
    const card = await screen.findByRole('group', { name: 'Qui contacter' })
    expect(within(card).getByText('CM')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('une source se lit avec sa date, à la précision que la source donne', async () => {
    renderReply(fence(fixtures.valid.contact_list))
    const card = await screen.findByRole('group', { name: 'Qui contacter' })
    expect(within(card).getByText("Source : Site de l'entreprise · juin 2026")).toBeInTheDocument()
  })
})

// #3894 — relance dans contact_list (Louis 16/10)
describe('#3894 — la relance par contact dans la carte contact_list', () => {
  it('une personne relancée dit son dernier envoi, avec sa date', async () => {
    renderReply(fence(fixtures.valid.contact_list))
    const card = await screen.findByRole('group', { name: 'Qui contacter' })
    expect(within(card).getByText('Dernier envoi : 12 octobre 2026')).toBeInTheDocument()
  })

  it('une relance préparée se nomme préparée, jamais envoyée', async () => {
    const block = structuredClone(fixtures.valid.contact_list) as { items: Array<Record<string, unknown>> }
    block.items[0]!.follow_up = { kind: 'prepared', as_of: '2026-10-14' }
    renderReply(fence(block))
    const card = await screen.findByRole('group', { name: 'Qui contacter' })
    expect(within(card).getByText('Relance préparée : 14 octobre 2026')).toBeInTheDocument()
    expect(within(card).queryByText(/Dernier envoi/)).toBeNull()
  })

  it('sans trace de relance : aucune ligne, jamais « 0 » ni « jamais relancé »', async () => {
    renderReply(fence(fixtures.valid.contact_list))
    const card = await screen.findByRole('group', { name: 'Qui contacter' })
    // le second contact de la fixture n'a pas de follow_up : une seule ligne de relance sur la carte
    expect(within(card).getAllByText(/Dernier envoi|Relance préparée/)).toHaveLength(1)
    expect(card.textContent).not.toMatch(/jamais relancé/i)
  })
})

describe('#1914.9 — erreur ou donnée manquante', () => {
  it('la carte dit ce qui a échoué, ce qui manque et comment l’obtenir', async () => {
    renderReply(fence(fixtures.valid.missing_data))
    const card = await screen.findByRole('group', { name: 'Ce qui me manque' })
    expect(within(card).getByText(/La lecture de ta messagerie n'a pas abouti/)).toBeInTheDocument()
    expect(within(card).getByText('La date de fin de la mission')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /Renseigne-la dans la fiche mission/ })).toHaveAttribute(
      'href',
      '/missions',
    )
  })

  it('un bloc refusé redevient ses propres textes — jamais une carte, jamais du JSON', async () => {
    const { container } = renderReply(fence({ type: 'dashboard', items: ['Un tableau de bord'] }))
    expect(await screen.findByText('Un tableau de bord')).toBeInTheDocument()
    expect(container.querySelector('[data-reply-block]')).toBeNull()
    expect(container.textContent).not.toContain('dashboard')
  })

  it('une carte en cours d’écriture ne montre jamais sa syntaxe', async () => {
    const { container } = renderReply('Je prépare le classement.\n\n```bellum-block\n{"type":"account_ran')
    expect(await screen.findByText('Je prépare le classement.')).toBeInTheDocument()
    expect(screen.getByText('Mise en forme de la réponse…')).toBeInTheDocument()
    expect(container.textContent).not.toContain('```')
    expect(container.textContent).not.toContain('account_ran')
  })
})

/**
 * #3864.6 / #3903.7 — recette prod 09/10 (code aef69661e9) : un `file_export`
 * refusé par le contrat strict (un champ non déclaré, une limite dépassée)
 * tombait sur `replyBlockLeaves` — CHAQUE cellule devenait sa propre puce
 * (0 `<table>`, jusqu'à 156 `<li>`). Un bloc de cette forme rend désormais un
 * vrai tableau — même refusé par le contrat strict.
 */
describe('#3864.7 — aucune cellule ne montre un objet, une clé ou une date brute', () => {
  const block = {
    type: 'file_export',
    title: 'Besoins retrouvés',
    filename: 'besoins.csv',
    columns: ['Besoin', 'Compétences', 'Statut', 'Échéance', 'Prochaine action'],
    rows: [
      {
        cells: [
          'Dev Java',
          "{'term': 'Java', 'level': None, 'required': True}, {'term': 'Spark', 'level': 'confirmé', 'required': False}",
          'to_match',
          '2026-09-11T07:54:14.668Z',
          'decide_expired',
        ],
      },
      { cells: ['Dev Go', '[{"unreadable', 'matching', null, 'run_matching'] },
    ],
  }

  it('objets → libellés, statuts → libellés FR, dates → format local court', async () => {
    renderReply(fence(block))
    const card = await screen.findByRole('group', { name: 'Besoins retrouvés' })
    const text = card.textContent ?? ''
    expect(within(card).getByText('Java, Spark (confirmé)')).toBeInTheDocument()
    expect(within(card).getByText('Matching à lancer')).toBeInTheDocument()
    expect(within(card).getByText('Échéance passée — trancher')).toBeInTheDocument()
    expect(text).not.toMatch(/None|True|to_match|decide_expired|T07:54/)
    expect(text).toContain('11/09/2026')
  })

  it('NON : aucune cellule ne commence par { ou [ (garde au rendu)', async () => {
    renderReply(fence(block))
    const card = await screen.findByRole('group', { name: 'Besoins retrouvés' })
    const cells = within(card).getAllByRole('cell')
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) expect(cell.textContent?.trim()).not.toMatch(/^[{[]/)
    // L'illisible laisse la cellule VIDE (#4075), jamais un morceau de JSON.
    expect(within(card).queryByText('non mesuré')).not.toBeInTheDocument()
  })
})

describe('#3864.6 / #3903.7 — un bloc tableau refusé reste un tableau', () => {
  it('un bloc file_export refusé par le contrat strict rend un <table> avec 3 <th>, jamais des puces', async () => {
    const refused = {
      type: 'file_export',
      title: 'Besoins retrouvés',
      filename: 'besoins-retrouves.csv',
      columns: ['Nom', 'Rôle', 'Date'],
      rows: [{ cells: ['Alpha', 'DSI', '2026-10-01'] }, { cells: ['Beta', null, '2026-10-02'] }],
      // Champ non déclaré par le contrat (mode strict) : le bloc est refusé
      // sans que la forme `columns` / `rows[].cells` que le repli reconnaît disparaisse.
      extra_unvalidated_field: 'x'.repeat(500),
    }
    const { container } = renderReply(fence(refused))
    const card = await screen.findByRole('group', { name: 'Besoins retrouvés' })
    const table = within(card).getByRole('table')
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
    expect(within(card).getByText('Alpha')).toBeInTheDocument()
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })

  it('#4075 — une cellule absente (`null`) est VIDE : ni « non mesuré », ni "0"', async () => {
    const refused = {
      type: 'file_export',
      filename: 'besoins-retrouves.csv',
      columns: ['Nom', 'Sens'],
      rows: [{ cells: ['Beta', null] }],
      extra_unvalidated_field: true,
    }
    renderReply(fence(refused))
    const card = await screen.findByRole('group', { name: 'Fichier exportable' })
    expect(within(card).queryByText('non mesuré')).not.toBeInTheDocument()
    const cells = within(card).getAllByRole('cell')
    expect(cells[1]?.textContent).toBe('')
  })

  it('#4065.1 — une cellule longue se comprime (truncate) et garde son texte complet au survol', async () => {
    const long = "Relance sans réponse depuis trois semaines après l'envoi de la proposition commerciale initiale"
    const refused = {
      type: 'file_export',
      filename: 'sans-reponse.csv',
      columns: ['Contact', 'Objet'],
      rows: [{ cells: ['Anne', long] }],
      extra_unvalidated_field: true,
    }
    renderReply(fence(refused))
    const card = await screen.findByRole('group', { name: 'Fichier exportable' })
    const cell = within(card).getByText(long)
    expect(cell).toHaveClass('truncate')
    expect(cell).toHaveAttribute('title', long)
  })

  it('un bloc refusé SANS forme de tableau reste le repli en puces (non régressé)', async () => {
    const { container } = renderReply(fence({ type: 'dashboard', items: ['Un tableau de bord'] }))
    expect(await screen.findByText('Un tableau de bord')).toBeInTheDocument()
    expect(container.querySelector('table')).toBeNull()
  })
})

/**
 * #1914.13 — UN LOGO SEULEMENT POUR UN COMPTE QUI A UNE VRAIE FICHE.
 *
 * Le domaine d'un logo vient du compte ENREGISTRÉ (`GET /accounts/:id`), jamais
 * d'un site écrit par le modèle : un domaine inventé ou mal recopié afficherait
 * le logo d'une autre société, avec l'autorité d'une image. Sans fiche
 * `/accounts/<uuid>`, l'initiale.
 */
describe('#1914.13 — le logo d’un compte classé', () => {
  const REAL_ID = '3f0b8a4e-5c1d-4b7a-9e2f-1a2b3c4d5e6f'
  const ranking = (item: Record<string, unknown>) =>
    fence({
      type: 'account_ranking',
      axes: ['Signal'],
      items: [{ name: 'Alpha Industrie', why: ['Signal.'], ...item }],
    })

  beforeEach(() => getOne.mockReset())

  it('NON : un site écrit par le modèle, sans fiche, ne donne aucun logo', async () => {
    renderReply(ranking({ website: 'alpha-industrie.example' }))
    const avatar = await screen.findByTestId('company-avatar')
    expect(avatar).toHaveAttribute('data-website', '')
    expect(avatar).toHaveAttribute('data-logo', '')
    expect(getOne).not.toHaveBeenCalled()
  })

  it('NON : une fiche qui ne porte pas un identifiant de compte ne lit rien', async () => {
    renderReply(ranking({ href: '/accounts/alpha-1', website: 'alpha-industrie.example' }))
    expect(await screen.findByTestId('company-avatar')).toHaveAttribute('data-website', '')
    expect(getOne).not.toHaveBeenCalled()
  })

  it('NON : une fiche introuvable garde l’initiale', async () => {
    getOne.mockRejectedValueOnce(new Error('404'))
    renderReply(ranking({ href: `/accounts/${REAL_ID}`, website: 'alpha-industrie.example' }))
    await waitFor(() => expect(getOne).toHaveBeenCalledWith(REAL_ID))
    expect(screen.getByTestId('company-avatar')).toHaveAttribute('data-website', '')
  })

  it('une vraie fiche : le logo du compte ENREGISTRÉ, jamais le site du modèle', async () => {
    getOne.mockResolvedValueOnce({ id: REAL_ID, logo_url: 'https://logos.example/alpha.png', website: 'alpha.fr' })
    renderReply(ranking({ href: `/accounts/${REAL_ID}`, website: 'autre-societe.example' }))
    await waitFor(() => expect(screen.getByTestId('company-avatar')).toHaveAttribute('data-website', 'alpha.fr'))
    expect(screen.getByTestId('company-avatar')).toHaveAttribute('data-logo', 'https://logos.example/alpha.png')
    expect(getOne).toHaveBeenCalledWith(REAL_ID)
  })

  it('le compte d’un brief de rendez-vous suit la même règle', async () => {
    getOne.mockResolvedValueOnce({ id: REAL_ID, logo_url: null, website: 'alpha.fr' })
    renderReply(
      fence({
        type: 'meeting_brief',
        objective: 'Qualifier.',
        talking_points: ['Un point.'],
        account: { name: 'Alpha', href: `/accounts/${REAL_ID}` },
      }),
    )
    await waitFor(() => expect(screen.getByTestId('company-avatar')).toHaveAttribute('data-website', 'alpha.fr'))
  })
})

/**
 * #1903.20 / #1933.8 — DÉFAUT RECETTE PASSAGE 7 (17/09) : le lien d'une carte
 * structurée (`CardLink`, réutilisé par `VerdictCard`/`AccountRankingCard`/
 * `MissingDataCard`) est le JUMEAU du lien de texte qui échappait à
 * `withReturnToConversation` — même `InternalLink` sous-jacent (`markdown.tsx`).
 */
describe('#1903.20 / #1933.8 — le lien d’une carte porte aussi le fil source', () => {
  it('le « next_action » d’un verdict emporte `from=chat:<id>` quand le fil est connu', async () => {
    renderWithRouter(
      <ReplyConversation conversationId="c1">
        <StructuredReply
          text={fence({
            type: 'verdict',
            conclusion: 'Commence par le vivier.',
            reasons: ['Deux consultants disponibles.'],
            next_action: { label: 'Voir le vivier', href: '/consultants' },
          })}
        />
      </ReplyConversation>,
    )
    expect(await screen.findByRole('link', { name: 'Voir le vivier' })).toHaveAttribute(
      'href',
      '/consultants?from=chat:c1',
    )
  })
})

// #2271.16 — la fiche de compte rendue DANS la conversation.
describe('#2271.16 — la fiche compte', () => {
  it('rend le compte, ses points clés et un lien vers la fiche complète', async () => {
    renderReply(fence(fixtures.valid.account_card))
    const card = await screen.findByRole('group', { name: 'Fiche compte' })
    expect(within(card).getByRole('link', { name: 'Alpha Industrie' })).toHaveAttribute('href', '/accounts/alpha-1')
    expect(within(card).getByText('Signal cyber daté de juillet 2026.')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Ouvrir la fiche complète' })).toHaveAttribute(
      'href',
      '/accounts/alpha-1',
    )
  })

  it('NON : une fiche sans lien vers le compte réel redevient du texte, jamais une carte', async () => {
    const { container } = renderReply(
      fence({ type: 'account_card', name: 'Alpha Industrie', highlights: ['Un fait.'] }),
    )
    expect(await screen.findByText('Alpha Industrie')).toBeInTheDocument()
    expect(container.querySelector('[data-reply-block="account_card"]')).toBeNull()
  })
})

// #2271.19 — l'historique d'un compte rendu DANS la conversation.
describe('#2271.19 — la timeline de compte', () => {
  it('rend les événements datés, du plus récent au plus ancien tel qu’écrit', async () => {
    renderReply(fence(fixtures.valid.timeline))
    const card = await screen.findByRole('group', { name: "Ce qui s'est passé" })
    expect(within(card).getByText('Message envoyé à Camille Martin')).toBeInTheDocument()
    expect(within(card).getByText('Relance après le salon.')).toBeInTheDocument()
    expect(within(card).getByText('Besoin détecté : migration cloud')).toBeInTheDocument()
  })

  it('NON : un compte réellement sans historique le DIT, jamais « 0 » ni une carte vide', async () => {
    renderReply(fence({ type: 'timeline', title: 'Historique', events: [] }))
    const card = await screen.findByRole('group', { name: 'Historique' })
    expect(within(card).getByText('Aucun historique enregistré pour ce compte.')).toBeInTheDocument()
    expect(card.textContent).not.toMatch(/\b0\b/)
  })

  // #2271.16/.19 (recette écran PRODUCTION 18/09/2026, compte THALES) : une
  // puce affichait « 2026-09-17T11:01:14Z » telle quelle. La date d'un
  // événement de timeline doit TOUJOURS se lire — et une date qui ne se lit
  // pas (un 13e mois : passe la regex ISO du contrat — `\d{2}` ne borne pas le
  // mois à 12 — jamais `new Date`, qui rend `NaN`) doit se NOMMER (GA-18/19),
  // jamais fuiter brute — dans les DEUX langues.
  it('NON : un horodatage ISO n’atteint jamais l’écran brut — la date se lit, dans les deux langues', async () => {
    renderReply(
      fence({
        type: 'timeline',
        title: 'Historique',
        events: [{ label: 'Relance', at: '2026-07-03T09:00:00Z' }],
      }),
    )
    const card = await screen.findByRole('group', { name: 'Historique' })
    expect(card.textContent).not.toContain('2026-07-03T09:00:00Z')
    expect(within(card).getByText('03/07/2026')).toBeInTheDocument()
  })

  it('NON : une date de calendrier impossible se NOMME « date illisible », jamais l’ISO brut', async () => {
    renderReply(
      fence({
        type: 'timeline',
        title: 'Historique',
        events: [{ label: 'Relance', at: '2026-13-01T09:00:00Z' }],
      }),
    )
    const card = await screen.findByRole('group', { name: 'Historique' })
    expect(card.textContent).not.toContain('2026-13-01T09:00:00Z')
    expect(within(card).getByText('Date illisible')).toBeInTheDocument()
  })

  it('NON, en anglais : la même date impossible se NOMME « Unreadable date », jamais l’ISO brut', async () => {
    await i18n.changeLanguage('en')
    try {
      renderReply(
        fence({
          type: 'timeline',
          title: 'History',
          events: [{ label: 'Follow-up', at: '2026-13-01T09:00:00Z' }],
        }),
      )
      const card = await screen.findByRole('group', { name: 'History' })
      expect(card.textContent).not.toContain('2026-13-01T09:00:00Z')
      expect(within(card).getByText('Unreadable date')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('fr')
    }
  })
})

// #2271.20 — un fichier exportable, préparé DANS la conversation.
describe('#2271.20 — le fichier exportable', () => {
  beforeEach(() => downloadCSV.mockClear())

  it('rend un tableau, et le téléchargement reste un geste LOCAL — aucun envoi', async () => {
    renderReply(fence(fixtures.valid.file_export))
    const card = await screen.findByRole('group', { name: 'Contacts à exporter' })
    const table = within(card).getByRole('table')
    expect(within(table).getByText('Camille Martin')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: /^Télécharger (la|les \d+) lignes?$/ }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    expect(downloadCSV.mock.calls[0]![1]).toBe('contacts-alpha.csv')
  })

  it('NON : une case absente reste vide (#4075), jamais une valeur inventée ni « non mesuré » sur deux lignes', async () => {
    renderReply(fence(fixtures.valid.file_export))
    const card = await screen.findByRole('group', { name: 'Contacts à exporter' })
    expect(within(card).queryByText('non mesuré')).not.toBeInTheDocument()
  })
})

/**
 * #2429.1 / #2429.13 — L'APPROCHE NE DÉPEND PLUS D'UN TITRE EXACT.
 *
 * « Objectif / Angle d'accroche / Cas d'usage » n'avait qu'une forme : trois
 * intitulés gras que `StructuredReply` reconnaissait À LA LETTRE. La carte
 * `approach` porte ces trois sections en CHAMPS validés : aucun intitulé écrit
 * par le modèle n'est lu pour la structurer.
 */
describe('#2429.13 — la carte d’approche', () => {
  it('rend l’objectif, l’angle et le cas d’usage sans qu’aucun intitulé markdown soit écrit', async () => {
    const reply = `Voici comment l’aborder.\n\n${fence(fixtures.valid.approach)}`
    expect(reply).not.toMatch(/\*\*Objectif|## Objectif/)
    renderReply(reply)
    const card = await screen.findByRole('group', { name: 'Aborder Alpha Industrie' })
    expect(card).toHaveAttribute('data-reply-block', 'approach')
    expect(within(card).getByText('Objectif :')).toBeInTheDocument()
    expect(within(card).getByText('Obtenir un premier rendez-vous avec la DSI.')).toBeInTheDocument()
    expect(within(card).getByText('Angle d’accroche :')).toBeInTheDocument()
    expect(within(card).getByText('Migration cloud menée en 2025 chez un industriel comparable.')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Ouvrir le dossier' })).toBeInTheDocument()
  })

  it('NON : sans preuve concrète, la carte NOMME le manque — jamais un cas d’usage inventé', async () => {
    const { use_case: _dropped, ...withoutProof } = fixtures.valid.approach as Record<string, unknown>
    renderReply(fence(withoutProof))
    const card = await screen.findByRole('group', { name: 'Aborder Alpha Industrie' })
    expect(within(card).getByText('aucune preuve concrète dans le dossier')).toBeInTheDocument()
  })

  it('NON : une approche mal formée (sans angle) redevient ses textes — la réponse n’est jamais perdue', async () => {
    const { container } = renderReply(
      `Avant.\n\n${fence({ type: 'approach', objective: 'Obtenir un rendez-vous.' })}\n\nAprès.`,
    )
    expect(await screen.findByText('Obtenir un rendez-vous.')).toBeInTheDocument()
    expect(screen.getByText('Avant.')).toBeInTheDocument()
    expect(screen.getByText('Après.')).toBeInTheDocument()
    expect(container.querySelector('[data-reply-block]')).toBeNull()
    expect(container.textContent).not.toContain('"type"')
  })

  it('#2429.12 — un type qu’un client ancien ne connaît pas retombe en résumé lisible', async () => {
    const { container } = renderReply(
      fence({ type: 'pipeline_view', title: 'Pipeline du trimestre', stages: ['Qualification : 3 comptes'] }),
    )
    expect(await screen.findByText('Pipeline du trimestre')).toBeInTheDocument()
    expect(screen.getByText('Qualification : 3 comptes')).toBeInTheDocument()
    expect(container.textContent).not.toContain('pipeline_view')
  })
})

/**
 * #213.2 (#3207, épopée #3228) — LE CONTRAT DE COMPTAGE, EN CARTE.
 *
 * Avant cette carte, `count_contract` voyageait jusqu'au modèle mais jamais
 * jusqu'à l'écran : le chiffre pouvait être cité en texte libre, sans jamais
 * nommer si une déduplication avait déjà eu lieu.
 */
describe('#213.2 — le contrat de comptage', () => {
  it('nomme la déduplication déjà appliquée et les limites de la mesure', async () => {
    renderReply(`Voici le comptage.\n\n${fence(fixtures.valid.count_contract)}`)
    const card = await screen.findByRole('group', { name: 'Comptage' })
    expect(card).toHaveAttribute('data-reply-block', 'count_contract')
    expect(within(card).getByText('41 contacts')).toBeInTheDocument()
    expect(
      within(card).getByText((_, node) => node?.tagName === 'P' && node.textContent === 'Après déduplication : 41'),
    ).toBeInTheDocument()
    expect(
      within(card).getByText(
        "Déjà dédupliqué par identité résolue (nom, e-mail, profil) à l'écriture — une personne dans trois sources ne devient pas trois consultants.",
      ),
    ).toBeInTheDocument()
  })

  it('#213.6 — sous le seuil de confidentialité, le chiffre exact disparaît derrière une formulation agrégée', async () => {
    const belowThreshold = {
      ...fixtures.valid.count_contract,
      object_type: 'parcours',
      raw_count: 2,
      deduplicated_count: undefined,
      suppression_threshold: 5,
    }
    const { container } = renderReply(fence(belowThreshold))
    const card = await screen.findByRole('group', { name: 'Comptage' })
    expect(within(card).getByText('moins de 5 parcours')).toBeInTheDocument()
    expect(container.textContent).not.toContain('>2<')
    expect(within(card).queryByText('2', { exact: false })).not.toBeInTheDocument()
  })
})

/**
 * #2594 — LA MARCHE SUIVANTE SE CLIQUE : UN CHAMP DE CARTE QUI PEUT PORTER DU
 * MARKDOWN N'EN AFFICHE JAMAIS LA SYNTAXE.
 *
 * Vu en production le 18/09/2026, dans une carte « Ce qui me manque » :
 * `Comment l'obtenir : Ajouter ou importer la fiche depuis [Contacts](/contacts)`
 * — crochets et parenthèses affichés tels quels, aucun lien. `StructuredReply`
 * passe le CORPS d'un message par `renderMarkdown` (`../markdown.tsx`) ; les
 * champs de carte, eux, étaient interpolés bruts.
 *
 * LA LISTE, PAS L'OCCURRENCE. Le contrat (`reply-blocks.ts`) et le prompt qui
 * le remplit (`apps/ia/app/prompts/reply_formats.py`) distinguent deux natures
 * de champ :
 *  - une PROSE que Laura rédige en phrase(s) libre(s) — elle peut contenir
 *    n'importe laquelle des deux formes que le prompt lui enseigne partout
 *    ailleurs, le gras et le lien markdown ;
 *  - un IDENTIFIANT (nom, étiquette de geste déjà pairée à un `href` structuré,
 *    date, énumération, donnée de tableau réutilisée telle quelle) — jamais
 *    rédigé en phrase, jamais visé ici.
 *
 * `timeline.events[].label/.detail` n'entre PAS dans cette liste : le contrat
 * les documente comme venant de trois tables déterministes (actions, mouvements
 * d'opportunité, workflows), jamais du texte d'un message (`reply-blocks.ts`,
 * commentaire de `timelineEventBlock`).
 *
 * Chaque entrée ci-dessous est un champ PROSE réellement rendu en carte,
 * éprouvé avec LA MÊME phrase que la production : un lien markdown au milieu
 * d'une phrase. Un champ qui manque à cette liste reste un texte brut non
 * gardé — c'est le risque nommé par le brief, pas une garantie totale.
 */
type FieldPath = readonly (string | number)[]

const MARKDOWN_PROSE_FIELDS: ReadonlyArray<{ block: string; path: FieldPath; cardName: string }> = [
  { block: 'verdict', path: ['conclusion'], cardName: 'Verdict' },
  { block: 'verdict', path: ['reasons', 0], cardName: 'Verdict' },
  { block: 'verdict', path: ['limits', 0], cardName: 'Verdict' },
  { block: 'account_ranking', path: ['items', 0, 'verdict'], cardName: 'Par où commencer' },
  { block: 'account_ranking', path: ['items', 0, 'why', 0], cardName: 'Par où commencer' },
  { block: 'account_ranking', path: ['items', 0, 'why_now'], cardName: 'Par où commencer' },
  { block: 'account_ranking', path: ['items', 0, 'limits', 0], cardName: 'Par où commencer' },
  { block: 'contact_list', path: ['items', 0, 'reason'], cardName: 'Qui contacter' },
  { block: 'contact_list', path: ['missing', 0], cardName: 'Qui contacter' },
  { block: 'comparison', path: ['note'], cardName: 'Alpha contre Beta' },
  { block: 'action_plan', path: ['objective'], cardName: 'Plan sur deux semaines' },
  { block: 'action_plan', path: ['steps', 0, 'detail'], cardName: 'Plan sur deux semaines' },
  { block: 'consultant_shortlist', path: ['need'], cardName: 'Consultants à proposer' },
  { block: 'consultant_shortlist', path: ['items', 0, 'headline'], cardName: 'Consultants à proposer' },
  { block: 'consultant_shortlist', path: ['items', 0, 'fit', 0], cardName: 'Consultants à proposer' },
  { block: 'consultant_shortlist', path: ['items', 0, 'gaps', 0], cardName: 'Consultants à proposer' },
  { block: 'consultant_shortlist', path: ['items', 0, 'availability'], cardName: 'Consultants à proposer' },
  { block: 'meeting_brief', path: ['objective'], cardName: 'Rendez-vous de jeudi' },
  // #4424.4 — le pitch de réunion, rendu comme les autres champs de texte.
  { block: 'meeting_brief', path: ['pitch'], cardName: 'Rendez-vous de jeudi' },
  { block: 'meeting_brief', path: ['talking_points', 0], cardName: 'Rendez-vous de jeudi' },
  { block: 'meeting_brief', path: ['questions', 0], cardName: 'Rendez-vous de jeudi' },
  { block: 'meeting_brief', path: ['risks', 0], cardName: 'Rendez-vous de jeudi' },
  { block: 'meeting_brief', path: ['unknowns', 0], cardName: 'Rendez-vous de jeudi' },
  { block: 'consultant_brief', path: ['role'], cardName: 'Brief provisoire — consultant sur le bench' },
  {
    block: 'consultant_brief',
    path: ['previous_roles', 0],
    cardName: 'Brief provisoire — consultant sur le bench',
  },
  { block: 'consultant_brief', path: ['seniority'], cardName: 'Brief provisoire — consultant sur le bench' },
  { block: 'consultant_brief', path: ['unknowns', 0], cardName: 'Brief provisoire — consultant sur le bench' },
  { block: 'missing_data', path: ['failed', 0], cardName: 'Ce qui me manque' },
  { block: 'missing_data', path: ['missing', 0, 'why'], cardName: 'Ce qui me manque' },
  // Le champ vu en production, SANS `href` séparé : le lien voyage DANS `how`.
  { block: 'missing_data', path: ['missing', 0, 'how'], cardName: 'Ce qui me manque' },
  { block: 'missing_data', path: ['still_possible', 0], cardName: 'Ce qui me manque' },
  { block: 'account_card', path: ['verdict'], cardName: 'Fiche compte' },
  { block: 'account_card', path: ['highlights', 0], cardName: 'Fiche compte' },
  { block: 'account_card', path: ['limits', 0], cardName: 'Fiche compte' },
  // #3382 (recette prod 26755bbac3, lot C1, 30/09) — `SourceBadge` affichait sa
  // syntaxe markdown brute (mesuré : des astérisques de gras non rendus).
  { block: 'account_card', path: ['source', 'label'], cardName: 'Fiche compte' },
]

/** Clone profond + écrit `value` au bout de `path` — sans muter la fixture partagée. */
function withFieldValue(source: Record<string, unknown>, path: FieldPath, value: string): Record<string, unknown> {
  const clone = structuredClone(source)
  let cursor: Record<string, unknown> | unknown[] = clone
  for (let i = 0; i < path.length - 1; i++) {
    cursor = (cursor as Record<string, unknown>)[path[i]!] as Record<string, unknown> | unknown[]
  }
  ;(cursor as Record<string, unknown>)[path[path.length - 1]!] = value
  // `missing_data.missing[].how` porte parfois un `href` structuré à côté du
  // texte (`missing_data` fixture) : le retirer isole le cas SANS `href`, celui
  // vu en production, où le lien n'existe que dans la phrase.
  if (path[path.length - 1] === 'how') delete (cursor as Record<string, unknown>).href
  return clone
}

const MARKDOWN_PROBE = "Ajoute-la depuis [Contacts](/contacts), ou en **notant l'essentiel**."

describe('#2594 — un champ de carte qui peut porter du markdown ne montre jamais sa syntaxe', () => {
  it.each(MARKDOWN_PROSE_FIELDS.map(field => [`${field.block} → ${field.path.join('.')}`, field] as const))(
    '%s',
    async (_label, { block, path, cardName }) => {
      const fixture = withFieldValue(fixtures.valid[block]!, path, MARKDOWN_PROBE)
      const { container } = renderReply(fence(fixture))
      const card = await screen.findByRole('group', { name: cardName })

      // La syntaxe ne s'affiche JAMAIS : ni les crochets et l'URL d'un lien
      // brut, ni les deux étoiles d'un gras brut (#1861, même règle que le
      // corps d'un message).
      expect(card.textContent).not.toContain('[Contacts](/contacts)')
      expect(card.textContent).not.toContain('**')

      // Le lien devient un VRAI lien, interne, cliquable.
      const link = within(card).getByRole('link', { name: 'Contacts' })
      expect(link).toHaveAttribute('href', '/contacts')

      // Le gras reste lisible, sans ses étoiles.
      expect(within(card).getByText(/notant l.essentiel/)).toBeInTheDocument()
      expect(container.textContent).not.toContain('```')
    },
  )
})

describe('#AM.32 — « Voir dans l’organigramme » sur la carte d’un périmètre', () => {
  it('ouvre l’onglet Organigramme du compte, filtré sur la famille du périmètre', async () => {
    renderReply(
      fence({
        type: 'contact_list',
        title: 'Cyber chez EDF',
        items: [{ name: 'Ana Roy', role: 'RSSI' }],
        org_view: { account_id: 'acc-1', perimeter: 'cyber' },
      }),
    )
    const card = await screen.findByRole('group', { name: 'Cyber chez EDF' })
    const link = within(card).getByRole('link', { name: /Voir dans l.organigramme/ })
    expect(link.getAttribute('href')).toContain('/accounts/acc-1')
    expect(link.getAttribute('href')).toContain('tab=organigramme')
  })

  it('NON : une liste sans périmètre n’offre pas ce lien', async () => {
    renderReply(fence({ type: 'contact_list', title: 'Contacts DSI', items: [{ name: 'Ana Roy' }] }))
    const card = await screen.findByRole('group', { name: 'Contacts DSI' })
    expect(within(card).queryByRole('link', { name: /organigramme/i })).toBeNull()
  })
})

describe('#AM.46 — les suites possibles d’un compte, sans ordre imposé', () => {
  it('la carte du compte offre ses suites ; elles sont du texte sans fil actif (jamais un bouton qui ne fait rien)', async () => {
    renderReply(
      fence({
        type: 'account_card',
        name: 'Free',
        href: '/accounts/11111111-1111-4111-8111-111111111111',
        highlights: ['Opérateur télécom'],
        follow_ups: [
          { label: 'Voir les contacts', ask: 'Quels sont les contacts de Free ?' },
          { label: 'Voir l’organigramme', ask: 'Montre-moi l’organigramme de Free.' },
        ],
      }),
    )
    const group = await screen.findByRole('group', { name: /suites/i })
    expect(within(group).getByText('Voir les contacts')).toBeInTheDocument()
    expect(within(group).getByText('Voir l’organigramme')).toBeInTheDocument()
  })
})
