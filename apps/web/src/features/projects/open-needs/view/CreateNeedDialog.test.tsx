import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * LA PORTE MANQUANTE (#1097 bis), DEVENUE UN ASSISTANT — voir `CreateNeedDialog.tsx`
 * et `NeedWizard.tsx`.
 *
 * ⚠️ Ce que ce fichier garde n'est pas « le dialogue s'affiche » : c'est que la
 * saisie ARRIVE au bon endpoint, avec le bon corps, une fois les QUATRE étapes
 * parcourues, et qu'un échec ne se referme pas sur du silence. `apiFetch` est
 * mocké au même niveau que le hook réel (`useAddProjectNeed`, `useProjects`)
 * l'appelle : un mock qui remplacerait ces hooks directement prouverait le
 * câblage du dialogue, pas que l'appel PART.
 *
 * ⚠️ Le brouillon vit dans `localStorage` (« on quitte, on revient, on
 * retrouve ») — CHAQUE test l'efface, sinon un titre saisi dans un test
 * fuirait dans le suivant.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))
// `useProjects` lit la session pour savoir si la requête doit partir.
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
// L'étape 2 peut appeler le studio RFP (dépôt de fiche de poste) ; aucun test
// ici ne dépose de fichier, mais le module doit résoudre.
vi.mock('@/features/rfp/api', () => ({ rfpApi: { create: vi.fn() } }))
// « Sourcing interne » (étape 1) est un lien vers /consultants — un `Link`
// réel exige un contexte de routeur que ce fichier ne fournit pas.
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  // #4424.6 — « Préparer le RDV » proposé après la création mène au brief.
  useNavigate: () => navigate,
}))

const { CreateNeedDialog } = await import('./CreateNeedDialog')

const PROJECTS = [
  { id: 'p-1', label: 'Refonte SI paiement', company_name: 'TF1', account_id: 'a-1' },
  { id: 'p-2', label: 'Migration cloud', company_name: 'Decathlon', account_id: 'a-2' },
]

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  window.localStorage.clear()
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  apiFetch.mockImplementation(async ({ path }: { path: string }) => {
    if (path === '/projects') return PROJECTS
    // #2174.11/.12 — les deux pickers ajoutés à l'étape 1 (interlocuteur,
    // porteur) lisent ces deux listes ; un défaut objet (`{ id: 'n-1' }',
    // pensé pour un POST) casserait leur `.map` au premier rendu.
    if (path === '/workspaces/members' || path.startsWith('/contacts/account/')) return []
    return { id: 'n-1' }
  })
})

const user = () => userEvent.setup()

/** Remplit l'étape 1 (titre + projet) et avance jusqu'à l'étape 5 (#2939 —
 *  l'assistant compte désormais CINQ étapes, une Décision de plus). */
async function fillStep1AndReachConfirmation(u: ReturnType<typeof user>, title: string) {
  await u.type(screen.getByLabelText('Titre du besoin'), title)
  await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
  await u.click(screen.getByText('TF1 — Refonte SI paiement'))
  await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
  await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
  await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
  await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
}

describe('CreateNeedDialog — la porte manquante, devenue un assistant', () => {
  it('ne peut pas avancer tant que le titre ou le projet manquent', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    const next = await screen.findByRole('button', { name: 'Étape suivante' })
    expect(next).toBeDisabled()

    await u.type(screen.getByLabelText('Titre du besoin'), 'Architecte cloud')
    expect(next).toBeDisabled()

    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    expect(next).toBeEnabled()
  })

  /**
   * #2559.1 — retour bêta du 17/09/2026 (François Thomas) : le sélecteur de
   * projet de rattachement restait ouvert après un clic, sans dire si le
   * choix avait été pris.
   */
  it('le sélecteur de projet SE REFERME après un clic, et montre la valeur choisie', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))

    // Le menu se replie : plus de liste ni de champ de recherche.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    // ... et la valeur choisie reste affichée — pas un champ vide.
    const closed = screen.getByRole('button', { name: /TF1 — Refonte SI paiement/ })
    expect(closed).toBeInTheDocument()

    // Le rouvrir redonne accès à la liste, pour changer d'avis.
    await u.click(closed)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Decathlon — Migration cloud')).toBeInTheDocument()
  })

  it('la recherche filtre par compte ET par projet', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.type(screen.getByRole('textbox', { name: 'Projet de rattachement' }), 'decathlon')

    expect(screen.queryByText('TF1 — Refonte SI paiement')).not.toBeInTheDocument()
    expect(screen.getByText('Decathlon — Migration cloud')).toBeInTheDocument()
  })

  it('soumet le titre saisi vers `POST /projects/:id/needs`, une fois les quatre étapes parcourues', async () => {
    const onCreated = vi.fn()
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/projects') return PROJECTS
      if (path === '/workspaces/members' || path.startsWith('/contacts/account/')) return []
      return { id: 'n-42', title: 'Architecte cloud' }
    })
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={onCreated} />)

    await fillStep1AndReachConfirmation(u, 'Architecte cloud')
    expect(screen.getByRole('button', { name: 'Créer le besoin' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'n-42', title: 'Architecte cloud' }))
    // #4424.6 — la création PROPOSE « Préparer le RDV » ; rien ne part seul.
    const [message, options] = toastSuccess.mock.calls.at(-1) as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    expect(message).toBe('Rôle ajouté')
    expect(options.action.label).toBe('Préparer le RDV')
    expect(navigate).not.toHaveBeenCalled()
    options.action.onClick()
    // #4424.4 — il ouvre le panneau R1/R2 de la fiche du compte du besoin.
    expect(navigate).toHaveBeenCalledWith({
      to: '/accounts/$id',
      params: { id: 'a-1' },
      search: { tab: 'plan', prep: 'rdv' },
    })
    // L'ARGUMENT est vérifié, pas seulement l'appel : le corps ne porte QUE le
    // titre et le nombre de postes — rien d'autre n'a été saisi dans les
    // étapes intermédiaires. `headcount: 1` est le défaut du brouillon
    // (« un poste, jamais zéro »), pas une valeur devinée pendant la
    // conversion — voir `need-wizard.test.ts`.
    // #2558.1 — la porte a changé : le besoin se crée au nom du CLIENT, et le
    // projet voyage dans le corps quand il y en a un. C'est ce qui permet au
    // même assistant de servir un besoin qui n'a pas de projet du tout.
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/projects/needs',
        method: 'POST',
        body: { title: 'Architecte cloud', headcount: 1, account_id: 'a-1', project_id: 'p-1' },
      }),
    )
  })

  /**
   * #2942, #2152.17 — la provenance d'un besoin OUVERT DEPUIS LAURA (la carte
   * « besoin compilé », #2322) ne s'écrivait jamais : aucun appelant ne posait
   * `provenance: 'model'` — `NEED_PROVENANCES` porte la valeur depuis
   * toujours, personne ne l'envoyait. `ProjectsPage` passe désormais cette
   * prop quand le dialogue s'ouvre via `?create_need=1` (venu de la carte).
   */
  it('#2942 — la prop `provenance="model"` voyage jusqu’au corps de la création', async () => {
    const onCreated = vi.fn()
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/projects') return PROJECTS
      if (path === '/workspaces/members' || path.startsWith('/contacts/account/')) return []
      return { id: 'n-43', title: 'Architecte cloud' }
    })
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={onCreated} provenance="model" />)

    await fillStep1AndReachConfirmation(u, 'Architecte cloud')
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/projects/needs',
        body: expect.objectContaining({ provenance: 'model' }),
      }),
    )
  })

  /**
   * #2942 (reste du 26/09) — la provenance voyageait seule depuis la carte
   * « besoin compilé » de Laura, le formulaire restait vide. Le titre et le
   * contexte compilés voyagent maintenant avec elle, jusqu'aux champs
   * correspondants du brouillon.
   */
  it('#2942 — le titre et le contexte compilés par Laura pré-remplissent un brouillon NEUF', async () => {
    const u = user()
    wrap(
      <CreateNeedDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        provenance="model"
        initialTitle="Architecte cloud"
        initialContext="Migrer la plateforme de paiement vers le cloud"
      />,
    )

    expect(await screen.findByLabelText('Titre du besoin')).toHaveValue('Architecte cloud')

    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    expect(screen.getByLabelText('Le problème à résoudre')).toHaveValue(
      'Migrer la plateforme de paiement vers le cloud',
    )
  })

  /**
   * #2942 (recette écran 27/09/2026, constat production du 28/09) — LE
   * PRÉ-REMPLISSAGE GAGNE sur un vieux brouillon local sans rapport.
   *
   * Constat en recette : la carte « Besoin compilé » du compte THALES ouvrait
   * `/projects?create_need=1&need_account_id=…`, mais le formulaire affichait
   * un brouillon local sans rapport (« Consultant test recette L2 », sans
   * projet) au lieu du pré-remplissage venu de Laura — `loadNeedWizardDraft()`
   * gagnait TOUJOURS face aux props `initial*`, même quand l'appelant venait
   * d'un lien qui pré-remplit. Tranché (sans re-proposer « brouillon toujours
   * prioritaire », déjà écarté par la recette) : un pré-remplissage EXPLICITE
   * (lien de Laura, paramètres d'URL) gagne désormais sur un brouillon repris.
   *
   * ⚠️ Le brouillon local n'est pour autant ni appliqué NI PERDU — voir le
   * test juste en dessous, qui vérifie qu'il reste intact en stockage.
   */
  it('#2942 — un pré-remplissage EXPLICITE gagne sur un vieux brouillon local sans rapport', async () => {
    window.localStorage.setItem('bellum:need-wizard-draft:v1', JSON.stringify({ title: 'Consultant test recette L2' }))
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} initialTitle="Titre de Laura" />)

    expect(await screen.findByLabelText('Titre du besoin')).toHaveValue('Titre de Laura')
  })

  /**
   * #2942 (constat production du 28/09) — LE BROUILLON LOCAL ÉCARTÉ PAR UN
   * PRÉ-REMPLISSAGE N'EST NI APPLIQUÉ NI PERDU : il reste tel quel en
   * stockage, ni écrasé par l'auto-sauvegarde du brouillon pré-rempli en
   * cours de saisie, ni effacé par une création réussie — les deux gestes
   * appartiennent à un brouillon qui n'est pas celui qu'on vient d'ouvrir.
   */
  it('#2942 — le vieux brouillon écarté par le pré-remplissage reste intact en stockage', async () => {
    const u = user()
    const oldDraft = JSON.stringify({ title: 'Consultant test recette L2' })
    window.localStorage.setItem('bellum:need-wizard-draft:v1', oldDraft)
    apiFetch.mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
      if (path === '/projects') return PROJECTS
      if (path === '/workspaces/members' || path.startsWith('/contacts/account/')) return []
      if (method === 'POST') return { id: 'n-45', title: 'Titre de Laura' }
      return {}
    })
    wrap(
      <CreateNeedDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        provenance="model"
        initialTitle="Titre de Laura"
        initialAccountId="a-9"
      />,
    )

    await screen.findByLabelText('Titre du besoin')
    // La saisie de l'assistant pré-rempli ne touche pas le vieux brouillon.
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    expect(window.localStorage.getItem('bellum:need-wizard-draft:v1')).toBe(oldDraft)

    // Ni la création réussie du besoin pré-rempli.
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' })))
    expect(window.localStorage.getItem('bellum:need-wizard-draft:v1')).toBe(oldDraft)
  })

  // #2942 — recette écran 29/09 : depuis la carte « Besoin compilé », le compte
  // rapproché (id + nom) doit se VOIR présélectionné à l'étape 1, pas un champ vide.
  it('#2942 — le compte rapproché est AFFICHÉ présélectionné (nom lisible, sélecteur replié)', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/projects') return PROJECTS
      return []
    })
    wrap(
      <CreateNeedDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        provenance="model"
        initialTitle="Data Engineer"
        initialAccountId="a-77"
        initialAccountName="QONTO"
      />,
    )
    await screen.findByLabelText('Titre du besoin')
    expect(screen.getByRole('button', { name: /QONTO/ })).toBeInTheDocument()
  })

  /**
   * #2942 (reste du 26/09, 2ᵉ tranche) — compétences et TJM compilés par
   * Laura voyagent à leur tour, jusqu'à l'étape 2 du brouillon. Même liste
   * jointe par virgules que l'aperçu de la carte, jamais une structure
   * inventée ; le TJM est un entier en CENTIMES, affiché en euros.
   */
  it('#2942 — les compétences et le TJM compilés par Laura pré-remplissent un brouillon NEUF', async () => {
    const u = user()
    wrap(
      <CreateNeedDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        provenance="model"
        initialTitle="Architecte cloud"
        initialSkills="Kubernetes, Terraform"
        initialTjmCents={65_000}
      />,
    )

    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))

    expect(screen.getByLabelText('Technologies & compétences clés')).toHaveValue('Kubernetes, Terraform')
    expect(screen.getByLabelText('Budget (TJM max)')).toHaveValue('650')
  })

  /**
   * #2942 (constat production du 28/09) — même renversement que le titre :
   * un pré-remplissage EXPLICITE gagne aussi sur les compétences d'un vieux
   * brouillon local sans rapport.
   */
  it('#2942 — un pré-remplissage EXPLICITE gagne sur les compétences d’un vieux brouillon local', async () => {
    window.localStorage.setItem(
      'bellum:need-wizard-draft:v1',
      JSON.stringify({ title: 'Déjà tapé', skills: [{ term: 'COBOL', required: true, level: null }] }),
    )
    const u = user()
    wrap(
      <CreateNeedDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        initialTitle="Architecte cloud"
        initialSkills="Kubernetes"
      />,
    )

    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))

    expect(screen.getByLabelText('Technologies & compétences clés')).toHaveValue('Kubernetes')
  })

  /**
   * #2942 (recette écran 27/09/2026) — la carte « besoin compilé » ouvrait la
   * bonne porte (`create_need=1`) mais la recherche de compte/projet de
   * l'étape 1 restait vide : ni le compte rapproché ni le nom lu dans la
   * source n'atteignaient le formulaire. `initialAccountId` (compte DÉJÀ
   * résolu) pose directement le compte, sans exiger de projet — l'étape
   * suivante s'ouvre sans qu'il soit besoin de chercher/choisir quoi que ce
   * soit.
   */
  it('#2942 — le compte VISÉ (déjà résolu par Laura) pré-remplit un brouillon NEUF, sans exiger de projet', async () => {
    const onCreated = vi.fn()
    apiFetch.mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
      if (path === '/projects') return PROJECTS
      if (path === '/workspaces/members' || path.startsWith('/contacts/account/')) return []
      if (method === 'POST') return { id: 'n-44', title: 'Architecte cloud' }
      return {}
    })
    const u = user()
    wrap(
      <CreateNeedDialog
        open
        onOpenChange={vi.fn()}
        onCreated={onCreated}
        provenance="model"
        initialTitle="Architecte cloud"
        initialAccountId="a-9"
      />,
    )

    expect(await screen.findByLabelText('Titre du besoin')).toHaveValue('Architecte cloud')
    // Le compte est déjà posé : « Étape suivante » n'attend plus aucun choix.
    expect(screen.getByRole('button', { name: 'Étape suivante' })).toBeEnabled()

    // #2939 — l'assistant compte désormais CINQ étapes (une Décision de
    // plus) : quatre « Étape suivante » pour atteindre la confirmation.
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/projects/needs',
        body: expect.objectContaining({ account_id: 'a-9' }),
      }),
    )
  })

  /**
   * #2942 (recette écran 27/09/2026) — quand Laura n'a PAS pu rapprocher de
   * compte, seul le nom lu dans la source voyage (`company_hint`). Il ne
   * pose jamais `accountId` (un nom seul ne désigne aucun compte réel) : il
   * pré-remplit seulement la recherche, comme si la personne l'avait tapé.
   */
  it('#2942 — le nom de compte (non résolu) pré-remplit la recherche de compte/projet', async () => {
    const u = user()
    wrap(
      <CreateNeedDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        provenance="model"
        initialTitle="Architecte cloud"
        initialAccountName="Decathlon"
      />,
    )

    expect(await screen.findByRole('textbox', { name: 'Projet de rattachement' })).toHaveValue('Decathlon')
    // Aucun compte réel n'est affirmé : « Étape suivante » attend toujours un choix.
    expect(screen.getByRole('button', { name: 'Étape suivante' })).toBeDisabled()
  })

  it('un échec le DIT, et ne referme pas l’assistant sur du silence', async () => {
    const onCreated = vi.fn()
    apiFetch.mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
      if (path === '/projects') return PROJECTS
      if (path === '/workspaces/members' || path.startsWith('/contacts/account/')) return []
      if (method === 'POST') throw new Error('Le serveur a refusé la création')
      return {}
    })
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={onCreated} />)

    await fillStep1AndReachConfirmation(u, 'Architecte cloud')
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Le serveur a refusé la création'))
    expect(onCreated).not.toHaveBeenCalled()
    // Le brouillon reste : le titre est toujours visible dans le résumé de
    // l'étape 4 — un dialogue qui l'aurait vidé ferait retaper ce qu'on vient
    // d'écrire.
    expect(screen.getByText('Architecte cloud')).toBeInTheDocument()
  })

  /**
   * #2558.2 — la phrase qui ment. Ce test affirmait jusqu'ici « un besoin se
   * rattache toujours à un projet déjà ouvert » — FAUX depuis #2174.1 (le
   * projet implicite existe), et mesuré à l'écran le 18/09/2026 : la porte de
   * création (`createProjectFor`) n'apparaissait qu'après DEUX caractères
   * tapés, donc invisible au premier coup d'œil sur un espace sans aucun
   * projet — exactement le cas que ce test construit. Le texte ne promet
   * plus un geste absent, et la porte est atteignable dès UN caractère.
   */
  it('sur un espace SANS AUCUN projet, la porte de création reste atteignable — jamais « rattache toujours »', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) =>
      path === '/projects' || path === '/workspaces/members' || path.startsWith('/contacts/account/') ? [] : {},
    )
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await waitFor(() =>
      expect(
        screen.getByText(
          'Aucun projet dans cet espace pour l’instant — tape le nom du client ci-dessus pour créer le premier projet, et le besoin avec.',
        ),
      ).toBeInTheDocument(),
    )
    // La phrase interdite n'apparaît PLUS : elle contredirait la porte que ce
    // même écran affiche juste au-dessus (`projectHint`, « Crée-en un juste
    // en dessous »).
    expect(screen.queryByText(/se rattache toujours à un projet déjà ouvert/)).not.toBeInTheDocument()

    // Un SEUL caractère suffit à révéler la porte — pas deux.
    await u.type(screen.getByPlaceholderText('Chercher un compte ou un projet…'), 'A')
    await waitFor(() => expect(screen.getByText('Créer un projet pour « A »')).toBeInTheDocument())
  })

  // #2557.1 / #2558.3 — « Créer un projet » est DANS le sélecteur, même quand des projets existent.
  it('#2558.3 — « Créer un projet » est toujours offert dans le sélecteur, projets existants ou non', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) =>
      path === '/projects'
        ? PROJECTS
        : path === '/workspaces/members' || path.startsWith('/contacts/account/')
          ? []
          : {},
    )
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Créer un projet' })).toBeInTheDocument())
  })

  // #2560 — la cinquième porte : un contrat ou une fiche de poste (PDF, DOCX), à prévisualiser avant de remplir.
  it('#2560 — « Depuis un contrat / une fiche de poste » lit le document et prévisualise sans rien remplir', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/delivery/missions/extract') {
        const empty = { value: null, confidence: 0, sourceExcerpt: '' }
        return {
          status: 'ok',
          costUsd: null,
          fields: {
            accountName: { value: 'ACME Industries', confidence: 0.9, sourceExcerpt: 'Client : ACME' },
            roleTitle: { value: 'Architecte cloud', confidence: 0.9, sourceExcerpt: 'Poste' },
            startedOn: empty,
            endsOn: empty,
            dailyRate: { value: 650, confidence: 0.8, sourceExcerpt: 'TJM 650' },
            days: empty,
          },
        }
      }
      return path === '/projects' || path === '/workspaces/members' || path.startsWith('/contacts/account/') ? [] : {}
    })
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await u.click(screen.getByRole('button', { name: 'Depuis un contrat / une fiche de poste (PDF, DOCX)' }))
    const file = new File(['%PDF-1.4'], 'contrat.pdf', { type: 'application/pdf' })
    await u.upload(
      screen.getByLabelText('Depuis un contrat / une fiche de poste (PDF, DOCX)', { selector: 'input' }),
      file,
    )

    const preview = await screen.findByTestId('document-extraction-preview')
    expect(preview).toHaveTextContent('Architecte cloud')
    expect(preview).toHaveTextContent('Compte (indication) : ACME Industries')
    // Un champ non lu ne fait aucune ligne.
    expect(preview).not.toHaveTextContent('Fin :')
    // Rien n'est écrit tant qu'on n'a pas appliqué.
    expect(screen.getByLabelText('Titre du besoin')).toHaveValue('')
    await u.click(screen.getByRole('button', { name: 'Pré-remplir le brouillon' }))
    await waitFor(() => expect(screen.getByLabelText('Titre du besoin')).toHaveValue('Architecte cloud'))
  })

  // Le round-trip complet du brouillon (écrit, relu, fusionné sur une absence,
  // JSON illisible…) est testé à sa source — `model/need-wizard.test.ts` — où
  // il n'est pas exposé à l'incertitude du cycle de montage de Radix `Dialog`
  // en environnement de test.
  it('écrit le titre saisi dans le brouillon PERSISTANT dès la frappe', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await u.type(screen.getByLabelText('Titre du besoin'), 'Ingénieur data')

    await waitFor(() => {
      const raw = window.localStorage.getItem('bellum:need-wizard-draft:v1')
      expect(raw && (JSON.parse(raw) as { title: string }).title).toBe('Ingénieur data')
    })
  })

  /**
   * #2174.25 (lot W20, registre 16/09) — LE DÉMARRAGE. `start_on` existe au
   * contrat de création (`createProjectNeedSchema`) et voyage déjà tel quel
   * dans `needWizardDraftToCreateInput` — mais rien, à l'étape 2, ne
   * permettait de le SAISIR : la valeur ne pouvait s'écrire qu'après coup,
   * sur la fiche du besoin.
   */
  it('#2174.25 — la date de démarrage saisie à l’étape 2 voyage jusqu’à la création', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await u.type(screen.getByLabelText('Titre du besoin'), 'Architecte cloud')
    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))

    fireEvent.change(screen.getByLabelText('Démarrage souhaité'), { target: { value: '2026-11-01' } })

    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ start_on: '2026-11-01' }) }),
      ),
    )
  })

  /** #2174.26 / #2174.30 / #2174.17 — même étape, même raison que #2174.25 :
   *  la durée, le type de contrat et le problème existent au contrat, et
   *  n'étaient saisissables qu'après coup, jamais à la création. */
  it('#2174.26 / #2174.30 / #2174.17 — durée, type de contrat et problème saisis à l’étape 2 voyagent jusqu’à la création', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await u.type(screen.getByLabelText('Titre du besoin'), 'Architecte cloud')
    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))

    fireEvent.change(screen.getByLabelText('Durée (mois)'), { target: { value: '6' } })
    await u.click(screen.getByRole('combobox', { name: 'Type de contrat' }))
    await u.click(screen.getByRole('option', { name: 'Régie' }))
    fireEvent.change(screen.getByLabelText('Le problème à résoudre'), {
      target: { value: 'La supervision repose sur un seul expert, en partance.' },
    })

    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            duration_months: 6,
            contract_kind: 'regie',
            context: 'La supervision repose sur un seul expert, en partance.',
          }),
        }),
      ),
    )
  })

  it('#3547 — un forfait encadré (rôle tenu + équipe client, sans consultants) voyage jusqu’à la création', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await u.type(screen.getByLabelText('Titre du besoin'), 'Cadrage du forfait paiement')
    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))

    // Le bloc n'existe pas tant que la nature n'est pas le forfait.
    expect(screen.queryByRole('switch', { name: 'Forfait encadré, sans consultants' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('combobox', { name: 'Type de contrat' }))
    await u.click(screen.getByRole('option', { name: 'Forfait' }))

    await u.click(screen.getByRole('switch', { name: 'Forfait encadré, sans consultants' }))
    await u.click(screen.getByRole('combobox', { name: 'Rôle tenu' }))
    await u.click(screen.getByRole('option', { name: 'Cadrage et supervision' }))
    await u.type(screen.getByLabelText('Équipe côté client (noms, facultatif)'), 'Marie Dupont, Paul Martin')

    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            contract_kind: 'forfait',
            delivery_mode: 'supervised',
            supervision_role: 'both',
            client_team_names: ['Marie Dupont', 'Paul Martin'],
          }),
        }),
      ),
    )
  })

  /** #2939 (#2174.16 / #2174.31) — même étape, même raison que #2174.17 juste
   *  au-dessus : la capacité recherchée et les contraintes existent au
   *  contrat, et n'étaient saisissables qu'après coup, jamais à la création. */
  it('#2939 (#2174.16 / #2174.31) — capacité recherchée et contraintes saisies à l’étape 2 voyagent jusqu’à la création', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await u.type(screen.getByLabelText('Titre du besoin'), 'Architecte cloud')
    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))

    fireEvent.change(screen.getByLabelText('Expertise attendue'), { target: { value: 'Architecture cloud AWS' } })
    fireEvent.change(screen.getByLabelText('Contraintes'), { target: { value: 'Astreinte un week-end sur trois' } })

    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            expertise: 'Architecture cloud AWS',
            constraints: 'Astreinte un week-end sur trois',
          }),
        }),
      ),
    )
  })

  /**
   * #2939 (#2174.20, #2174.22, #2174.24) — SÉPARER INDISPENSABLE/SOUHAITABLE,
   * ET RÉGLER UN NIVEAU, PAR COMPÉTENCE.
   *
   * `commitSkills` posait `required: true` pour CHAQUE terme saisi — aucune
   * séparation n'était possible avant ce lot.
   */
  it('sépare une compétence en Souhaitable et lui règle un niveau, sans toucher les autres', async () => {
    const u = user()
    wrap(<CreateNeedDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

    await u.type(screen.getByLabelText('Titre du besoin'), 'Architecte cloud')
    await waitFor(() => expect(screen.getByText('TF1 — Refonte SI paiement')).toBeInTheDocument())
    await u.click(screen.getByText('TF1 — Refonte SI paiement'))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))

    await u.type(screen.getByLabelText('Technologies & compétences clés'), 'Kubernetes, Terraform')

    // Les deux compétences arrivent Indispensable (défaut du contrat).
    expect(screen.getAllByRole('combobox', { name: /indispensable ou souhaitable/ })).toHaveLength(2)

    // Terraform bascule en Souhaitable — Kubernetes n'est pas touché.
    await u.click(screen.getByRole('combobox', { name: 'Terraform — indispensable ou souhaitable' }))
    await u.click(await screen.findByRole('option', { name: 'Souhaitable' }))
    fireEvent.change(screen.getByLabelText('Kubernetes — niveau attendu'), { target: { value: 'confirmé' } })

    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Étape suivante' }))
    await u.click(screen.getByRole('button', { name: 'Créer le besoin' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            skills: [
              { term: 'Kubernetes', required: true, level: 'confirmé' },
              { term: 'Terraform', required: false, level: null },
            ],
          }),
        }),
      ),
    )
  })
})
