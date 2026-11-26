import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { CockpitPerspective, PersonalCockpitResponse } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PersonalCockpit } from './PersonalCockpit'

const { mockUse } = vi.hoisted(() => ({ mockUse: vi.fn() }))
vi.mock('../../hooks/usePersonalCockpit', () => ({ usePersonalCockpit: () => mockUse() }))

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

/** Un recul minimal et VALIDE — chaque bloc porte sa provenance. */
const PROVENANCE = {
  sources: ['bellum' as const],
  window_days: 30,
  population: 3,
  computed_at: '2026-09-04T09:00:00.000Z',
}
const PERSPECTIVE: CockpitPerspective = {
  trajectory: {
    pipeline: { amount_euros: 120000, open_count: 30, valued_count: 4 },
    missions_active: 2,
    invoiced_euros: null,
    collected_euros: null,
    finance_readable: false,
    provenance: PROVENANCE,
  },
  coverage: {
    followed: 3,
    without_next_action: 1,
    no_interaction_30d: 7,
    new_signals_7d: 0,
    never_worked: 0,
    anomalies: [
      {
        account_id: '11111111-1111-4111-8111-111111111111',
        company_name: 'ACME',
        kind: 'no_recent_interaction',
        since: '2026-06-01T00:00:00.000Z',
        logo_url: null,
        website: null,
      },
    ],
    provenance: PROVENANCE,
  },
  relationship: {
    active_threads: 2,
    awaiting_reply: 1,
    replies_received: 0,
    accounts_without_interaction: 7,
    provenance: PROVENANCE,
  },
  dormant: [],
  series: { coverage: null, outreach: null, provenance: PROVENANCE },
}

const EMPTY: PersonalCockpitResponse = {
  kpis: { my_accounts: 0, relances_open: 0, relances_overdue: 0, messages_this_week: 0 },
  priorities: [],
  relances: [],
  accounts: [],
  messages: [],
}

const POPULATED: PersonalCockpitResponse = {
  kpis: { my_accounts: 3, relances_open: 2, relances_overdue: 1, messages_this_week: 5 },
  priorities: [
    {
      account_id: 'a1',
      company_name: 'ACME',
      priority_score: 8,
      reason: 'Relance en retard : Rappeler',
      overdue: true,
    },
  ],
  relances: [
    {
      id: 'r1',
      account_id: 'a1',
      company_name: 'ACME',
      label: 'Rappeler la DSI',
      due_date: '2026-07-01',
      overdue: true,
      cadence_step: 'relance',
      contact_id: null,
      assigned_to_me: true,
    },
  ],
  perspective: PERSPECTIVE,
  accounts: [
    {
      id: 'a1',
      company_name: 'ACME',
      sector: 'IT',
      employees: null,
      priority_score: 8,
      priority_justification: null,
      status: 'completed',
      created_at: '2026-07-01T00:00:00.000Z',
      recent_signals_count: 0,
      primary_signal: null,
    },
  ],
  messages: [
    {
      id: 'm1',
      action_type: 'message_sent',
      category: 'message',
      action_label: 'Message envoyé',
      detail: 'Email',
      status: 'Envoyé',
      channel: 'email',
      actor: { id: 'u1', name: 'Léa', initials: 'L' },
      target: { account_id: 'a1', contact_id: null, label: 'ACME', initials: 'A' },
      created_at: '2026-07-15T00:00:00.000Z',
      rollback: null,
      crmTaskClosable: false,
    },
  ],
}

/**
 * #1813 — le recul et les priorités vivent désormais chacun dans un
 * `CollapsedSection` (GA-26), replié par défaut. Cette suite garde la
 * SUBSTANCE (états vides, données, le même chiffre à deux endroits…), pas le
 * repli lui-même — sa propre suite dédiée est `PersonalCockpit.collapsed.test.tsx`
 * (#1813). On ouvre donc chaque en-tête avant de lire quoi que ce soit,
 * exactement comme le ferait quelqu'un qui déplie tout à la main.
 */
async function mount() {
  const result = renderWithRouter(<PersonalCockpit />)
  // `findBy*` waits for the router to resolve the route on its microtask.
  // Match EXACT : la section « Ma trajectoire & mon portefeuille » contient
  // aussi le mot « portefeuille », qu'une regex confondrait avec la tuile KPI.
  await screen.findByText('Mon portefeuille')
  for (const toggle of screen.queryAllByRole('button')) {
    if (toggle.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(toggle)
    }
  }
  return result
}

describe('PersonalCockpit', () => {
  it('rend un état vide pour chaque section restante quand je n’ai pas de données', async () => {
    mockUse.mockReturnValue({ loading: false, data: EMPTY })
    await mount()
    expect(screen.getByText(/Aucune priorité pour le moment/i)).toBeInTheDocument()
    // #1409 rouvert (16/09/2026) — « Mes relances » a DÉMÉNAGÉ vers le Centre
    // d'actions ; son état vide s'y affiche désormais, pas ici. Le cockpit
    // garde le RECUL, il ne porte plus le geste daté.
    expect(screen.queryByText(/Aucune relance programmée/i)).not.toBeInTheDocument()
  })

  it('rend mes priorités quand j’ai des données — et plus la liste des relances', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    await mount()
    expect(screen.getByText('Mes priorités')).toBeInTheDocument()
    // La PRIORITÉ reste : elle nomme la prochaine étape datée, ce qu'aucun bloc
    // de couverture ne dit. Le refus de #1409 la concernant n'a pas bougé.
    expect(screen.getByText('Relance en retard : Rappeler')).toBeInTheDocument()
    // La LIGNE de relance, elle, est partie avec le geste : elle se marque
    // faite dans le Centre d'actions (`features/actions/components/
    // MyRelancesList.tsx`), et la carte a été retirée dans le MÊME commit.
    expect(screen.queryByText('Rappeler la DSI')).not.toBeInTheDocument()
  })

  it('MASQUE le recul quand l’API ne le sert pas — jamais des blocs à zéro', async () => {
    // Une API plus ancienne que le web ne connaît pas `perspective`. Afficher
    // « 0 compte sans échange » annoncerait une bonne nouvelle qu'aucune mesure
    // ne justifie — c'est la forme de mensonge que ce dépôt corrige partout.
    mockUse.mockReturnValue({ loading: false, data: { ...POPULATED, perspective: undefined } })
    await mount()
    expect(screen.getByText('Mes priorités')).toBeInTheDocument()
    expect(screen.queryByText('Ma trajectoire')).not.toBeInTheDocument()
    expect(screen.queryByText('Ma dynamique relationnelle')).not.toBeInTheDocument()
  })

  it('affiche le recul, et le MÊME chiffre dans les deux blocs qui le nomment', async () => {
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    await mount()
    expect(screen.getByText('Ma trajectoire')).toBeInTheDocument()

    // « Sans échange 30 j » s'écrit dans la couverture ET dans la dynamique.
    // Les deux valeurs viennent du même calcul serveur : deux tuiles voisines
    // qui affichent deux nombres sous la même phrase, c'est le défaut le plus
    // cher du lot 6.
    const labels = screen.getAllByText('Sans échange 30 j')
    expect(labels).toHaveLength(2)
    for (const label of labels) {
      expect(label.parentElement?.textContent).toContain('7')
    }
  })

  it('la tuile de comptes dit ce qu’elle COMPTE — le portefeuille, pas « suivis »', async () => {
    // Recette live du 29/08/2026 : « 27 Comptes suivis » ici, « 23 suivis » sur
    // `/accounts`. Les deux chiffres sont JUSTES — ils comptent deux
    // populations différentes. Le mot « suivis » a une définition dans ce
    // produit (`ACCOUNT_HYGIENE_PREDICATES.followedAccounts` :
    // `commercial_status IN ('watching','opportunity','customer')`) et cette
    // tuile ne l'applique pas : elle compte les comptes que J'AI CRÉÉS. C'est
    // donc le LIBELLÉ qui était faux, pas le nombre.
    mockUse.mockReturnValue({ loading: false, data: POPULATED })
    await mount()

    // ⚠️ #1408 a déplacé la correction d'un cran plus bas. Le libellé disait
    // « Comptes créés », ce qui était HONNÊTE pour une population fausse : le
    // cockpit comptait les comptes créés pendant que `/comptes` comptait ceux
    // dont on est responsable. Les deux écrans lisent maintenant la même
    // population, donc la tuile peut enfin dire « mon portefeuille ».
    expect(screen.getByText('Mon portefeuille')).toBeInTheDocument()
    // « Suivi » reste une TROISIÈME chose, et elle a son propre compteur.
    expect(screen.queryByText('Comptes suivis')).not.toBeInTheDocument()
    expect(screen.getByText('Les comptes dont tu es responsable dans cet espace')).toBeInTheDocument()
  })

  // Défaut mesuré : un cockpit qui échoue à se CALCULER rendait « 0 compte,
  // 0 relance, 0 en retard » — un zéro qui ment, pire qu'une erreur parce qu'il
  // rassure à tort. L'écran doit maintenant dire l'échec, jamais l'habiller en
  // zéros.
  it('affiche l’échec de lecture, JAMAIS une tuile à zéro qui dirait « rien à faire »', async () => {
    mockUse.mockReturnValue({ loading: false, error: true, data: EMPTY })
    renderWithRouter(<PersonalCockpit />)
    expect(await screen.findByText(/n'a pas pu être calculé/i)).toBeInTheDocument()
    expect(screen.queryByText('Mon portefeuille')).not.toBeInTheDocument()
  })
})
