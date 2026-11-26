import type { MissionCommercialTerms } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'
import { chooseOption } from '@/test/select'

const assignments = vi.fn()
const terms = vi.fn()
const scores = vi.fn()
const setTerms = vi.fn()
const expenses = vi.fn()
const createExpense = vi.fn()
const updateExpense = vi.fn()
const supplierInvoices = vi.fn()
const createSupplierInvoice = vi.fn()
const updateSupplierInvoice = vi.fn()
const setSupplierInvoiceStatus = vi.fn()

// La section d'avis lit le rôle via `useTeam` (session + requête) : sans équipe,
// elle rend l'information sans le bouton — ce que ces tests n'observent pas.
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => ({ team: undefined }) }))

// #2192.35 — « Créer une action » du pied de tiroir passe par la MÊME porte
// que #2195.36 (`planItemsApi.create`) : un double, jamais un second moteur.
const createPlanAction = vi.fn()
vi.mock('@/features/actions/planItems.api', () => ({
  planItemsApi: { create: (...args: unknown[]) => createPlanAction(...args) },
}))
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: (...args: unknown[]) => toastError(...args) },
}))
vi.mock('../api', () => ({
  // #2195 — les fenêtres de renouvellement sont arrivées par un AUTRE lot de la
  // même vague : ce fichier ne les teste pas, mais `OverviewTab` les consomme.
  // Un `vi.mock` remplace TOUT le module : un double incomplet fait échouer le
  // rendu entier avec « No export is defined on the mock », un rouge qui n'a
  // rien à voir avec ce qu'on mesure ici.
  useRenewalWindows: () => ({ data: undefined, isLoading: false, isError: false }),
  // L'avis de fin de mission (MissionFeedback) vit dans l'onglet d'ensemble.
  useMissionFeedback: () => ({ data: undefined, isLoading: false, isError: false }),
  useSubmitMissionFeedback: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMissionAssignments: () => assignments(),
  useMissionTerms: () => terms(),
  useMissionScores: () => scores(),
  useMissionDrift: () => ({ isPending: true, data: undefined }),
  useSetMissionTerms: () => setTerms(),
  useMissionExpenses: () => expenses(),
  useCreateMissionExpense: () => createExpense(),
  useUpdateMissionExpense: () => updateExpense(),
  useSupplierInvoices: () => supplierInvoices(),
  useCreateSupplierInvoice: () => createSupplierInvoice(),
  useUpdateSupplierInvoice: () => updateSupplierInvoice(),
  useSetSupplierInvoiceStatus: () => setSupplierInvoiceStatus(),
}))
// #2953 (#2193.17/.18) — `MissionObjectivePerimeterFields` lit `useUpdateMission`
// (react-query) : même raison que `TimelinePanel`/`NotesPanel` plus bas, sans
// QueryClientProvider ce tiroir planterait.
// #3413 — la ligne « BU propriétaire » a ses propres tests (`MissionBusinessUnitLine.test.tsx`) ;
// ici on ne monte pas ses requêtes.
vi.mock('./MissionBusinessUnitLine', () => ({ MissionBusinessUnitLine: () => <span>bu</span> }))
vi.mock('./mission-panel.api', () => ({
  useUpdateMission: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))
// L'historique du compte a ses propres garanties : ici on vérifie l'ONGLET.
vi.mock('@/features/activities/view/TimelinePanel', () => ({ TimelinePanel: () => <div>timeline</div> }))
// #2953 — le Suivi (`MissionTrackingSection`) monte `NotesPanel`, qui a sa
// PROPRE lecture react-query (`useNotes`) : même raison que `TimelinePanel`
// juste au-dessus, sans QueryClientProvider ce tiroir planterait.
vi.mock('@/features/crm-core/view/NotesPanel', () => ({ NotesPanel: () => <div>notes</div> }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: undefined }) }))
/**
 * ⚠️ Le faux `Link` REND ce que le vrai rendrait — l'adresse INTERPOLÉE et les
 * attributs qu'on lui passe. Un faux qui jette `params`, `className` ou
 * `aria-label` teste le mock et non le composant : c'est le défaut trouvé sur
 * `LinkedAccountsCard`, où la porte était vérifiée verte alors qu'elle ne
 * portait aucun nom accessible.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    // #2192.31/.36 — `search` sert de contenu à `<AskLaura>` (la question
    // PRÉ-REMPLIE, jamais envoyée) : sans le sérialiser dans `href`, aucun
    // test ne peut prouver QUELLE question part vers le composer.
    search,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, unknown>
    children: React.ReactNode
  }) => {
    let href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    if (search) href += `?${new URLSearchParams(search as Record<string, string>).toString()}`
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  },
}))

const { MissionPanelContent } = await import('./MissionDetailSheet')

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'Renfort plateforme',
    status: 'active',
    started_on: '2026-02-01',
    ends_on: null,
    daily_rate: null,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    accountName: 'ACME',
    renewal: 'unknown',
    risks: [],
    // PRÉSENT et `null` : pas le droit OU pas mesuré (D45).
    marginPercent: null,
    assignees: [],
    ...over,
  }
}

function show(over: Partial<MissionView> = {}) {
  render(<MissionPanelContent mission={mission(over)} />)
}

beforeEach(() => {
  cleanup()
  assignments.mockReset().mockReturnValue({ data: [], isError: false })
  terms.mockReset().mockReturnValue({
    data: {
      canReadFinance: true,
      terms: null,
      margin: null,
      expensesTotalCents: 0,
      supplierInvoicesTotalCents: 0,
      marginWithExpenses: null,
    },
    isError: false,
  })
  scores.mockReset().mockReturnValue({ data: undefined, isLoading: false, isError: false })
  setTerms.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  expenses.mockReset().mockReturnValue({ data: [], isError: false })
  createExpense.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  updateExpense.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  supplierInvoices.mockReset().mockReturnValue({ data: [], isError: false })
  createSupplierInvoice.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  updateSupplierInvoice.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  setSupplierInvoiceStatus.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  createPlanAction.mockReset().mockResolvedValue({ id: 'created-1' })
  toastSuccess.mockReset()
  toastError.mockReset()
})

/**
 * La fiche d'une mission — cinq onglets, et pas un de plus que la donnée.
 *
 * Elle EXISTAIT déjà (un tiroir à trois blocs empilés) : ce lot la découpe et
 * lui ajoute le seul onglet dont la donnée existait sans être affichée nulle
 * part — les deux scores.
 */
describe('MissionPanelContent — les onglets que la donnée permet', () => {
  it('nomme le compte porteur au lieu de « compte inconnu »', () => {
    // ⚠️ Le service n'envoyait PAS `accountName` : TOUTE mission ouverte
    // affichait « Compte inconnu », alors que `account_id` est non nul en base.
    show({ accountName: 'Groupe Aurore' })
    expect(screen.getByText('Groupe Aurore')).toBeInTheDocument()
  })

  /**
   * #4194 — LA PORTE VERS LE DOSSIER et l'UNIQUE bouton Laura vivent dans
   * `RecordPanel` (`RecordPanel.test.tsx`) : le contenu de la mission n'en
   * porte plus aucun.
   */
  it('ne porte ni porte vers le dossier ni bouton Laura — le panneau les porte, une seule fois', () => {
    show()
    expect(screen.queryByRole('link', { name: /ouvrir le dossier/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /demander à laura/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /planifier un point/i })).not.toBeInTheDocument()
  })

  it('ouvre sur la synthèse — la question posée en ouvrant une fiche', () => {
    show({ role_title: 'Architecte de plateforme' })
    expect(screen.getByText('Architecte de plateforme')).toBeInTheDocument()
  })

  it('porte un onglet par sujet, tabulable', () => {
    show()
    for (const label of [
      'Synthèse',
      'Équipe & suite',
      'Conditions & finance',
      'Points d’attention',
      'Documents & suivi',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('bascule vers le staffing sans quitter la fiche', async () => {
    assignments.mockReturnValue({
      data: [{ id: 'a1', consultantName: 'Salomé Dufour', loadPercent: 100 }],
      isError: false,
    })
    show()
    await userEvent.click(screen.getByRole('button', { name: /équipe & suite/i }))
    expect(screen.getByText(/Salomé Dufour/)).toBeInTheDocument()
  })

  /**
   * L'onglet qui BRANCHE `/delivery/finance/missions/:id/scores` — une route
   * qui servait depuis des mois sans aucun appelant.
   */
  describe('l’onglet « Risque & opportunité »', () => {
    it('n’affiche JAMAIS un score nu — ses axes et ce qui n’a pas pu être évalué', async () => {
      scores.mockReturnValue({
        data: {
          risk: { score: 60, evaluated: [{ axis: 'renewal', value: 60 }], notEvaluable: ['payment'] },
          opportunity: null,
        },
        isLoading: false,
        isError: false,
      })
      show()
      await userEvent.click(screen.getByRole('button', { name: /points d’attention/i }))
      // MISSIONS-A (23/10, « aucun score en points ») : la note se lit en MOTS — un niveau, puis ses axes —
      // jamais « 60/100 ». Un score n'est jamais nu : le niveau ET l'axe qui l'explique sont à l'écran.
      expect(screen.getByText('Moyen')).toBeInTheDocument()
      expect(screen.getByText('Renouvellement : moyen')).toBeInTheDocument()
      expect(screen.queryByText(/\/100/)).not.toBeInTheDocument()
      // Ce qui n'a pas pu être évalué est NOMMÉ — pas compté.
      expect(screen.getByText(/paiement/i)).toBeInTheDocument()
    })

    it('dit pourquoi il n’y a pas de note plutôt que d’afficher 0', async () => {
      scores.mockReturnValue({
        data: { risk: { score: null, evaluated: [], notEvaluable: ['renewal', 'margin'] }, opportunity: null },
        isLoading: false,
        isError: false,
      })
      show()
      await userEvent.click(screen.getByRole('button', { name: /points d’attention/i }))
      expect(screen.queryByText(/0\/100/)).not.toBeInTheDocument()
    })

    it('dit « pas ton périmètre » quand la lecture est refusée — pas « aucun score »', async () => {
      scores.mockReturnValue({ data: undefined, isLoading: false, isError: true })
      show()
      await userEvent.click(screen.getByRole('button', { name: /points d’attention/i }))
      expect(screen.getByText(/périmètre/i)).toBeInTheDocument()
    })
  })

  /**
   * ⚠️ Un forfait n'a NI TJM NI relevé : c'est un état LÉGITIME, pas une fiche
   * mal remplie. Lui réclamer un relevé produit une alerte qui ne se résoudra
   * jamais — et une alerte qui ne se résout pas fait ignorer toutes les autres.
   */
  it('ne réclame RIEN à un forfait sur sa synthèse', () => {
    show({ contract_kind: 'forfait' })
    expect(screen.getByText(/forfait/i)).toBeInTheDocument()
    expect(screen.queryByText(/relevé/i)).not.toBeInTheDocument()
  })

  it('nomme l’absence de date de fin plutôt que de la taire', () => {
    show({ ends_on: null })
    expect(screen.getByText(/sans date de fin/i)).toBeInTheDocument()
  })

  /**
   * L'onglet « Conditions » — le seul écran qui affiche un champ financier
   * rédigé, et donc le seul qui doit DIRE pourquoi il est vide.
   *
   * Depuis D45 (28/08/2026), `margin` et `terms` valent `null` dans DEUX cas :
   * pas le droit, et pas de coût chargé saisi. La forme de la réponse ne les
   * distingue plus — c'est `canReadFinance` qui le fait. Sans ces deux tests,
   * rien n'empêcherait l'écran de replier les deux sur le même « — », qui se
   * lirait « rien de renseigné » et enverrait quelqu'un chercher une saisie
   * qu'il n'a de toute façon pas le droit de voir.
   */
  describe('l’onglet « Conditions » sans le droit financier', () => {
    it('DIT que la donnée existe mais n’est pas montrée — jamais un vide', async () => {
      terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
      show()
      await userEvent.click(screen.getByRole('button', { name: /conditions/i }))
      expect(screen.getByText(/ne sont pas dans ton périmètre/i)).toBeInTheDocument()
      expect(screen.getByText(/un droit que ton rôle n’a pas/i)).toBeInTheDocument()
      // Et surtout : pas la phrase de l'AUTRE absence.
      expect(screen.queryByText(/non mesurée/i)).not.toBeInTheDocument()
    })

    it('ne propose pas de SAISIR le coût — il n’y a rien à corriger', async () => {
      // Un formulaire affiché à qui n'a pas le droit ferait croire à une donnée
      // manquante, et l'écriture serait refusée à l'envoi.
      terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
      show()
      await userEvent.click(screen.getByRole('button', { name: /conditions/i }))
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    })

    it('dit « non mesurée » — une phrase AUTRE — quand le droit est là mais le coût absent', async () => {
      terms.mockReturnValue({ data: { canReadFinance: true, terms: null, margin: null }, isError: false })
      show()
      await userEvent.click(screen.getByRole('button', { name: /conditions/i }))
      expect(screen.getByText(/non mesurée/i)).toBeInTheDocument()
      expect(screen.queryByText(/ne sont pas dans ton périmètre/i)).not.toBeInTheDocument()
    })
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LES DEUX CHAMPS QUE L'API ACCEPTAIT ET QUE PERSONNE NE POUVAIT SAISIR
   * ─────────────────────────────────────────────────────────────────────────
   * `requires_po` et `partner_commission_daily_cents` étaient branchés de bout
   * en bout côté serveur — schéma, DTO, route, service, SQL, semis de
   * démonstration — et la fiche mission n'exposait AUCUNE saisie. Le bloqueur
   * « bon de commande exigé et absent » ne pouvait donc se déclencher qu'en
   * démonstration, et la commission d'intermédiation, seconde moitié du coût
   * réel d'une mission `partner`, restait à `null` pour toujours : la marge de
   * ces missions était surévaluée du montant même qu'on cherche à mesurer.
   *
   * ⚠️ Le régime des deux champs est la FUSION : `undefined` veut dire « je ne
   * parle pas de ce champ », `null` efface. Les tests ci-dessous tiennent les
   * deux moitiés — envoyer explicitement celui qu'on modifie, et se TAIRE sur
   * l'autre.
   */
  describe('l’onglet « Conditions » — le bon de commande et la commission', () => {
    const FULL_TERMS: MissionCommercialTerms = {
      missionId: '11111111-1111-4111-8111-111111111111',
      channel: 'partner',
      loadedDailyCostCents: 42_000,
      requiresPo: false,
      poNumber: 'BC-2026-118',
      poOtherMissions: [],
      billingCadence: 'monthly',
      partnerCommissionDailyCents: null,
      noticeDays: 30,
      notes: 'Renouvellement à négocier en mars.',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }

    function withTerms(over: Partial<MissionCommercialTerms> = {}) {
      terms.mockReturnValue({
        data: { canReadFinance: true, terms: { ...FULL_TERMS, ...over }, margin: null },
        isError: false,
      })
    }

    async function openTerms() {
      await userEvent.click(screen.getByRole('button', { name: /conditions/i }))
    }

    it('propose de déclarer qu’un bon de commande est exigé, non coché par défaut', async () => {
      withTerms({ requiresPo: false })
      show()
      await openTerms()
      expect(screen.getByRole('checkbox', { name: /bon de commande exigé/i })).not.toBeChecked()
    })

    it('envoie `requiresPo` EXPLICITEMENT et se TAIT sur la commission', async () => {
      const mutate = vi.fn()
      setTerms.mockReturnValue({ mutate, isPending: false })
      withTerms({ requiresPo: false, partnerCommissionDailyCents: 65_00 })
      show()
      await openTerms()
      await userEvent.click(screen.getByRole('checkbox', { name: /bon de commande exigé/i }))

      expect(mutate).toHaveBeenCalledTimes(1)
      const payload = mutate.mock.calls[0]?.[0]
      expect(payload.requiresPo).toBe(true)
      // ⚠️ Le cœur du régime de fusion : cocher une case ne parle pas de la
      // commission. Envoyer `null` ici l'effacerait ; envoyer sa valeur
      // recopiée rouvrirait la course que la fusion existe pour fermer.
      expect(payload).not.toHaveProperty('partnerCommissionDailyCents')
      // Et les six champs de REMPLACEMENT sont recopiés, sinon cocher la case
      // remettrait le coût chargé et le canal à « non renseigné ».
      expect(payload.loadedDailyCostCents).toBe(42_000)
      expect(payload.channel).toBe('partner')
      expect(payload.poNumber).toBe('BC-2026-118')
      expect(payload.billingCadence).toBe('monthly')
      expect(payload.noticeDays).toBe(30)
      expect(payload.notes).toBe('Renouvellement à négocier en mars.')
    })

    it('ne montre PAS la commission sur une mission en direct', async () => {
      withTerms({ channel: 'direct', partnerCommissionDailyCents: null })
      show()
      await openTerms()
      expect(screen.queryByLabelText(/commission d’intermédiation/i)).not.toBeInTheDocument()
    })

    it('la montre sur les deux canaux d’intermédiation', async () => {
      for (const channel of ['partner', 'subcontracting'] as const) {
        cleanup()
        withTerms({ channel })
        show()
        await openTerms()
        expect(screen.getByLabelText(/commission d’intermédiation/i)).toBeInTheDocument()
      }
    })

    it('enregistre une commission en CENTIMES, et se tait sur le bon de commande', async () => {
      const mutate = vi.fn()
      setTerms.mockReturnValue({ mutate, isPending: false })
      withTerms({ channel: 'partner', partnerCommissionDailyCents: null })
      show()
      await openTerms()
      await userEvent.type(screen.getByLabelText(/commission d’intermédiation/i), '65')
      await userEvent.click(screen.getByRole('button', { name: /enregistrer la commission/i }))

      const payload = mutate.mock.calls[0]?.[0]
      expect(payload.partnerCommissionDailyCents).toBe(6500)
      expect(payload).not.toHaveProperty('requiresPo')
    })

    /**
     * ⚠️ LE TEST QUI TIENT LE LOT. Un champ vidé doit partir en `null` — la
     * valeur qui EFFACE. `undefined` voudrait dire « je ne parle pas de ce
     * champ » : le bouton semblerait fonctionner et la commission resterait en
     * base pour toujours, sans qu'aucun écran ne puisse plus la retirer.
     */
    it('efface une commission avec `null`, JAMAIS `undefined`', async () => {
      const mutate = vi.fn()
      setTerms.mockReturnValue({ mutate, isPending: false })
      withTerms({ channel: 'partner', partnerCommissionDailyCents: 65_00 })
      show()
      await openTerms()
      await userEvent.clear(screen.getByLabelText(/commission d’intermédiation/i))
      await userEvent.click(screen.getByRole('button', { name: /enregistrer la commission/i }))

      const payload = mutate.mock.calls[0]?.[0]
      expect(payload).toHaveProperty('partnerCommissionDailyCents')
      expect(payload.partnerCommissionDailyCents).toBeNull()
    })

    it('accepte ZÉRO — « le partenaire ne prend rien » est une réponse', async () => {
      const mutate = vi.fn()
      setTerms.mockReturnValue({ mutate, isPending: false })
      withTerms({ channel: 'subcontracting', partnerCommissionDailyCents: null })
      show()
      await openTerms()
      await userEvent.type(screen.getByLabelText(/commission d’intermédiation/i), '0')
      await userEvent.click(screen.getByRole('button', { name: /enregistrer la commission/i }))

      expect(mutate.mock.calls[0]?.[0].partnerCommissionDailyCents).toBe(0)
    })

    /**
     * Une commission enregistrée sur un canal SANS intermédiaire n'est pas
     * décorative : `trueDailyCostCents` l'AJOUTE au coût chargé quel que soit
     * le canal. La cacher laisserait un chiffre agir sans que personne ne
     * puisse le voir ni le retirer.
     */
    it('NOMME une commission restée sur une mission repassée en direct, et propose de l’effacer', async () => {
      const mutate = vi.fn()
      setTerms.mockReturnValue({ mutate, isPending: false })
      withTerms({ channel: 'direct', partnerCommissionDailyCents: 65_00 })
      show()
      await openTerms()
      expect(screen.getByText(/n’est pas passée par un intermédiaire/i)).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /effacer la commission/i }))
      expect(mutate.mock.calls[0]?.[0].partnerCommissionDailyCents).toBeNull()
    })

    it('ne propose NI la case NI la commission sans le droit financier', async () => {
      terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
      show()
      await openTerms()
      expect(screen.queryByRole('checkbox', { name: /bon de commande/i })).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/commission d’intermédiation/i)).not.toBeInTheDocument()
    })
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LES FRAIS (30/08/2026) — la ligne que la marge ignorait
   * ─────────────────────────────────────────────────────────────────────────
   * Une mission n'avait aucune ligne de frais alors que sa marge est calculée
   * et affichée partout. `margin` reste la marge JOURNALIÈRE, hors frais — et
   * le dit maintenant, à côté d'elle — pendant que `marginWithExpenses` montre
   * la vue qui les compte, quand elle est calculable.
   */
  describe('l’onglet « Conditions » — les frais', () => {
    async function openTerms() {
      await userEvent.click(screen.getByRole('button', { name: /conditions/i }))
    }

    it('nomme la marge « hors frais » — elle ne les a jamais comptés', async () => {
      terms.mockReturnValue({
        data: {
          canReadFinance: true,
          terms: null,
          margin: { amountCents: 19_500, percent: 30 },
          expensesTotalCents: 0,
          marginWithExpenses: null,
        },
        isError: false,
      })
      show()
      await openTerms()
      expect(screen.getByText(/hors frais/i)).toBeInTheDocument()
    })

    it('montre la marge NETTE quand elle est calculable — un chiffre DISTINCT de la marge de base', async () => {
      terms.mockReturnValue({
        data: {
          canReadFinance: true,
          terms: null,
          margin: { amountCents: 19_500, percent: 30 },
          expensesTotalCents: 50_000,
          marginWithExpenses: { amountCents: 18_500, percent: 28.5 },
        },
        isError: false,
      })
      show()
      await openTerms()
      expect(screen.getByText(/30 % de marge/)).toBeInTheDocument()
      expect(screen.getByText(/28[.,]5 % de marge nette/)).toBeInTheDocument()
    })

    it('dit qu’une mission sans frais n’en a AUCUN — jamais un vide muet', async () => {
      show()
      await openTerms()
      expect(screen.getByText(/aucun frais/i)).toBeInTheDocument()
    })

    it('liste les lignes de frais, libellé et montant', async () => {
      expenses.mockReturnValue({
        data: [
          {
            id: 'e1',
            missionId: 'm1',
            label: 'Billets de train',
            amountCents: 18_000,
            expenseDate: '2026-08-10',
            enteredByUserId: 'u1',
            source: 'human',
            createdAt: '2026-08-10T09:00:00.000Z',
            updatedAt: '2026-08-10T09:00:00.000Z',
          },
        ],
        isError: false,
      })
      show()
      await openTerms()
      expect(screen.getByText('Billets de train')).toBeInTheDocument()
      expect(screen.getByText(/180/)).toBeInTheDocument()
    })

    it('ajoute une ligne — mission, libellé, montant et date voyagent ensemble', async () => {
      const mutate = vi.fn()
      createExpense.mockReturnValue({ mutate, isPending: false })
      show()
      await openTerms()
      await userEvent.type(screen.getByLabelText(/libellé du frais/i), 'Hôtel')
      await userEvent.type(screen.getByLabelText(/^montant$/i), '320')
      const dateInput = screen.getByLabelText(/date du frais/i)
      await userEvent.clear(dateInput)
      await userEvent.type(dateInput, '2026-08-20')
      await userEvent.click(screen.getByRole('button', { name: /^ajouter$/i }))

      expect(mutate).toHaveBeenCalledTimes(1)
      const payload = mutate.mock.calls[0]?.[0]
      expect(payload).toEqual({ label: 'Hôtel', amountCents: 32_000, expenseDate: '2026-08-20' })
    })

    it('ne propose ni la liste ni la saisie des frais sans le droit financier', async () => {
      terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
      show()
      await openTerms()
      expect(screen.queryByLabelText(/libellé du frais/i)).not.toBeInTheDocument()
    })
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LES FACTURES FOURNISSEUR (30/08/2026) — la facture ENTRANTE d'un
   * sous-traitant, distincte de la facturation CLIENT.
   * ─────────────────────────────────────────────────────────────────────────
   */
  describe('l’onglet « Conditions » — les factures fournisseur', () => {
    async function openTerms() {
      await userEvent.click(screen.getByRole('button', { name: /conditions/i }))
    }

    it('dit qu’une mission sans facture fournisseur n’en a AUCUNE', async () => {
      show()
      await openTerms()
      expect(screen.getByText(/aucune facture fournisseur/i)).toBeInTheDocument()
    })

    it('liste les factures, référence, montant et statut', async () => {
      supplierInvoices.mockReturnValue({
        data: [
          {
            id: 'i1',
            missionId: 'm1',
            reference: 'FA-2026-0512',
            amountCents: 90_000,
            invoiceDate: '2026-08-18',
            status: 'pending',
            enteredByUserId: 'u1',
            source: 'human',
            createdAt: '2026-08-18T09:00:00.000Z',
            updatedAt: '2026-08-18T09:00:00.000Z',
          },
        ],
        isError: false,
      })
      show()
      await openTerms()
      expect(screen.getByText('FA-2026-0512')).toBeInTheDocument()
      expect(screen.getByText(/900/)).toBeInTheDocument()
    })

    it('ajoute une facture — mission, référence, montant et date voyagent ensemble', async () => {
      const mutate = vi.fn()
      createSupplierInvoice.mockReturnValue({ mutate, isPending: false })
      show()
      await openTerms()
      await userEvent.type(screen.getByLabelText(/référence de la facture/i), 'FA-2026-0513')
      await userEvent.type(screen.getByLabelText(/montant de la facture/i), '900')
      const dateInput = screen.getByLabelText(/date de la facture/i)
      await userEvent.clear(dateInput)
      await userEvent.type(dateInput, '2026-08-22')
      await userEvent.click(screen.getByRole('button', { name: /ajouter la facture/i }))

      expect(mutate).toHaveBeenCalledTimes(1)
      const payload = mutate.mock.calls[0]?.[0]
      expect(payload).toEqual({ reference: 'FA-2026-0513', amountCents: 90_000, invoiceDate: '2026-08-22' })
    })

    it('fait avancer le statut d’une facture', async () => {
      const mutate = vi.fn()
      setSupplierInvoiceStatus.mockReturnValue({ mutate, isPending: false })
      supplierInvoices.mockReturnValue({
        data: [
          {
            id: 'i1',
            missionId: 'm1',
            reference: 'FA-2026-0512',
            amountCents: 90_000,
            invoiceDate: '2026-08-18',
            status: 'pending',
            enteredByUserId: 'u1',
            source: 'human',
            createdAt: '2026-08-18T09:00:00.000Z',
            updatedAt: '2026-08-18T09:00:00.000Z',
          },
        ],
        isError: false,
      })
      show()
      await openTerms()
      await chooseOption(screen.getByLabelText(/statut de la facture/i), 'paid')
      expect(mutate).toHaveBeenCalledWith({ invoiceId: 'i1', status: 'paid' })
    })

    it('ne propose ni la liste ni la saisie des factures sans le droit financier', async () => {
      terms.mockReturnValue({ data: { canReadFinance: false, terms: null, margin: null }, isError: false })
      show()
      await openTerms()
      expect(screen.queryByLabelText(/référence de la facture/i)).not.toBeInTheDocument()
    })
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LE PIED DE TIROIR — #2192.31, #2192.35, #2192.36
   * ─────────────────────────────────────────────────────────────────────────
   * L'issue #2192 demande trois gestes par mission qu'aucun écran n'offrait
   * encore hors du panneau de décision de renouvellement : « Planifier un
   * point », « Créer une action », « Demander à Laura ». Les trois portes
   * existent déjà ailleurs dans ce dépôt (`AskLaura`, `planItemsApi.create`
   * via #2195.36) — ce lot les pose ici, sur LA porte que « Ouvrir » ouvre
   * déjà depuis le tableau des missions, plutôt que d'en inventer une
   * quatrième.
   *
   * ⚠️ `LauraIntroScope` est OBLIGATOIRE ici : le tiroir est une modale Radix
   * (`pointer-events: none` + `aria-hidden` posés sur le reste du document),
   * donc la bulle qui vit hors du tiroir y est INERTE. Sans la portée, un
   * `<AskLaura>` qui « gagne » la course du magasin rendrait `null` et le
   * geste disparaîtrait purement et simplement — bouton qui sonne, ne lit pas
   * (voir le docblock d'`AskLaura`, #1847).
   */
  describe('le pied du panneau — créer une action', () => {
    it('crée une action AU COMPTE de la mission, target `null` — #2192.35', async () => {
      show({
        id: '77777777-7777-4777-8777-777777777777',
        account_id: '99999999-9999-4999-8999-999999999999',
        label: 'Renfort plateforme',
      })
      await userEvent.click(screen.getByRole('button', { name: /créer une action/i }))

      expect(createPlanAction).toHaveBeenCalledTimes(1)
      const payload = createPlanAction.mock.calls[0]?.[0]
      expect(payload.account_id).toBe('99999999-9999-4999-8999-999999999999')
      expect(payload.label).toContain('Renfort plateforme')
      // #2195.36 — `ACTION_TARGET_KINDS` n'a pas de nature « mission » : cibler
      // la mission demanderait une migration hors du périmètre de ce lot.
      expect(payload.target).toBeNull()
      expect(screen.getByText(/action créée/i)).toBeInTheDocument()
    })

    it('sait dire NON : dit l’échec plutôt que de laisser croire que c’est fait', async () => {
      createPlanAction.mockRejectedValueOnce(new Error('boom'))
      show()
      await userEvent.click(screen.getByRole('button', { name: /créer une action/i }))
      await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
      expect(toastError.mock.calls[0]?.[0]).toMatch(/n’a pas pu être créée/i)
      // Le bouton ne bascule jamais sur « Action créée » — l'échec n'est pas
      // habillé en réussite.
      expect(screen.queryByText(/action créée/i)).not.toBeInTheDocument()
      expect(toastSuccess).not.toHaveBeenCalled()
    })
  })
})
