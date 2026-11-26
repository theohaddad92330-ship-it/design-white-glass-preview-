import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlatSubStep } from '@/features/onboarding/lib/questions'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useOnboardingStore, type OnboardingAnswers } from '@/stores/onboardingStore'
import { OnboardingStepper } from './OnboardingStepper'

/**
 * #2626.1 revient sur #2023.1/#2018.2, délibérément.
 *
 * Aucune clé du stage `role` (`user_role`, `portfolio_size`, ancienneté,
 * autorité…) ne figure dans `TEMPS1_REQUIRED_KEYS` : depuis l'arbitrage
 * Temps 2 (Louis, 20/09/2026), toutes ses questions sont reposées au Temps 2.
 * `stageStatus` (`onboarding-progress.ts`) traite donc « Ton rôle » comme un
 * stage FRANCHI (`done`) dès le départ — « rien ne le mesure encore » ne
 * tient plus : c'est maintenant « rien n'y reste à faire au Temps 1 », qui se
 * coche pour la même raison que la case #2626.1 documente pour tout stage
 * sans question restante. Ce qui tient encore : l'étape courante reste
 * distincte (`aria-current`), et une étape à `stageCodes: []` (système,
 * audit) reste, elle, `not_started` — seule la case « stage câblé mais
 * entièrement reporté » a changé de sens.
 */

/** Le harnais de router monte de façon ASYNCHRONE : sans cette sentinelle, le
 *  corps du document est encore vide quand la première requête s'exécute. */
async function render(
  currentStageIndex: number,
  onReview = false,
  navigation: {
    currentSlug?: string
    onNavigate?: (target: FlatSubStep) => void
    onOpenProofs?: () => void
  } = {},
): Promise<void> {
  renderWithRouter(
    <>
      <OnboardingStepper currentStageIndex={currentStageIndex} onReview={onReview} {...navigation} />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

beforeEach(() => {
  useOnboardingStore.getState().reset()
})

/**
 * #2023.1/.7 — « sept étapes nommées par résultat », vocabulaire qui remplace
 * celui des trois stages internes (Louis 15/09 : « prends-les tous »).
 */
describe('#2023.1/.7 — les sept étapes nommées', () => {
  it('nomme les sept étapes, dans l’ordre exact du message (Ton organisation … Ton audit)', async () => {
    await render(0)
    expect(screen.getByText('Ton organisation')).toBeInTheDocument()
    expect(screen.getByText('Ton rôle')).toBeInTheDocument()
    expect(screen.getByText('Ton offre')).toBeInTheDocument()
    expect(screen.getByText('Ton marché')).toBeInTheDocument()
    expect(screen.getByText('Ton système commercial')).toBeInTheDocument()
    expect(screen.getByText('Tes objectifs')).toBeInTheDocument()
    expect(screen.getByText('Ton audit')).toBeInTheDocument()
  })

  it('ne se masque plus par un point de rupture (#2021.7)', async () => {
    await render(0)
    const nav = screen.getByRole('navigation')
    expect(nav.className).not.toMatch(/(?<![a-z:])hidden/)
  })

  it("annonce l'étape courante aux technologies d'assistance, sur la BONNE étape nommée", async () => {
    // #2018.2 a inséré le stage `role` en position 1 : `offer_expertise` est
    // désormais l'index 2, pas 1 — TEMPS1_STAGES = [company_info, role,
    // offer_expertise, target_market, goals].
    await render(2) // currentStageIndex 2 → stage 'offer_expertise' → étape « Ton offre »
    const current = screen.getAllByRole('listitem').filter(li => li.getAttribute('aria-current') === 'step')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Ton offre')
  })

  it("#2018.2 — annonce « Ton rôle » quand l'étape courante est le stage role (index 1)", async () => {
    await render(1) // currentStageIndex 1 → stage 'role' → étape « Ton rôle »
    const current = screen.getAllByRole('listitem').filter(li => li.getAttribute('aria-current') === 'step')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Ton rôle')
  })
})

describe('#2021.3 — le contraste de l’étape courante', () => {
  it("n'écrit aucune nuance fixe de la gamme primaire en couleur de TEXTE", async () => {
    await render(1)
    const container = document.body
    const classes = [...container.querySelectorAll('*')].map(el => el.getAttribute('class') ?? '')
    expect(classes.filter(cls => /text-\[var\(--bellum-primary-\d+\)\]/.test(cls))).toEqual([])
  })
})

/**
 * #2023.1/#2012 — l'état des étapes se lit sur les RÉPONSES, pas sur l'index :
 * une étape sans question câblée (rôle, système, objectifs) reste NOMMÉE
 * « non commencée » plutôt que cochée par accident de position.
 */
describe('#2023.1 — le statut des étapes vient des réponses, pas de l’index', () => {
  it('coche l’organisation une fois ses réponses enregistrées', async () => {
    // Les sous-étapes de `company_info` : entreprise, équipe commerciale,
    // maturité (#2034), santé de l'activité (#2034), effectif réel (#2035),
    // temps réel (#2050), charge concurrente (#2050), routines (#2051) et les
    // trois écrans d'outillage (#2054). Il en manque UNE seule et l'étape n'est
    // plus « faite » — c'est ce que ce test garde, donc la liste est un
    // INVENTAIRE que chaque lot ajoutant une question complète.
    const completeCompanyAnswers: OnboardingAnswers = {
      esn_name: 'Kicklox',
      consultant_size: '10-30',
      sales_team_size: '2-3 personnes',
      esn_maturity_situation: 'Croissance',
      company_growth_goal: 'Ouvrir un nouveau territoire',
      active_clients_band: '6 à 15 clients actifs',
      revenue_recurrence: 'Un mix de récurrent et de one-shot',
      client_concentration_risk: "Le chiffre d'affaires est réparti, aucun client dominant",
      consultants_managed_by_user_band: '6 à 15 consultants',
      available_consultants_band: 'Quelques consultants disponibles en intercontrat',
      // #2035.1 / #2035.2 — deux clés de plus (`optional: true`, comptées ici
      // comme tout le reste de cette fiche « complète »).
      consultant_size_group_band: '200-500',
      consultant_size_business_unit_band: '10-30',
      // #2088.12 (DÉCISION Louis 18/09, point 16) — le nombre RÉEL de
      // consultants, ADDITIF à `consultant_size` (`optional: true`, comptée
      // ici comme tout le reste de cette fiche « complète »).
      consultant_count: '45',
      // Lot #2046/#2047 — six sous-étapes de plus dans `company_info` : sans
      // ces vingt-cinq clés, la fiche « complète » ne l'est plus.
      talent_pool_identified_band: '6-15',
      talent_pool_qualified_band: '1-5',
      talent_pool_available_band: '1-5',
      talent_pool_availability_recency_band: 'Ce mois-ci',
      talent_pool_avg_tjm_band: '550-700',
      talent_pool_mobility_band: 'Mobiles en France',
      talent_pool_consent_status: 'partiel',
      talent_pool_other_processes_band: 'Quelques-uns',
      talent_pool_engagement_reality_band: 'Une partie seulement',
      talent_pool_revalidation_frequency: 'mensuelle',
      talent_pool_state_interested_band: '6-15',
      talent_pool_state_available_band: '1-5',
      talent_pool_state_secured_band: '1-5',
      talent_pool_state_presentable_band: '0',
      client_base_missions_ongoing_band: '1-5',
      client_base_missions_completed_band: '6-15',
      client_base_renewals_band: 'quelques_uns',
      client_base_satisfaction_band: 'mesuree_bonne',
      client_base_referrals_band: 'quelques_unes',
      client_base_rex_band: 'parfois',
      client_base_case_studies_band: '1-5',
      client_base_cross_sell_band: 'tente_occasionnellement',
      client_base_deadlines_band: 'quelques_unes',
      client_base_followup_regularity: 'regulier',
      client_base_followup_owner: 'Le commercial du compte',
      // Lot L19 (#2050, #2051) — le temps réel, la charge concurrente et la
      // continuité des dossiers : trois sous-étapes de plus dans `company_info`.
      weekly_sales_time_declared: '5 à 10 heures par semaine',
      weekly_sales_time_protected: '2 à 5 heures par semaine',
      weekly_sales_time_residual: 'Moins de 2 heures par semaine',
      competing_workloads: ['Le delivery et le suivi des consultants en poste'],
      workload_variability: 'Elle varie selon les semaines, mais de façon prévisible',
      weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
      protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
      dossier_continuity_practices: ['Une revue hebdomadaire du portefeuille'],
      dossier_continuity_breaks: ['Un compte reste sans prochaine action'],
      // Lot G4 (#2054) — la chaîne d'outillage : trois sous-étapes de plus dans
      // `company_info`. Les valeurs sont celles du catalogue
      // (`TOOLING_PRESENCE_SCALE` et ses voisines) : un test qui invente sa donnée
      // d'entrée ne garde rien.
      tooling_crm: 'Mon équipe commerciale',
      tooling_ats: "Nous n'avons pas cet outil",
      tooling_erp: "Toute l'ESN",
      tooling_mailbox: 'Moi seul',
      tooling_calendar: 'Moi seul',
      tooling_drive: "Toute l'ESN",
      tooling_spreadsheet: 'Mon équipe commerciale',
      tooling_enrichment: "Nous n'avons pas cet outil",
      tooling_sourcing_platform: 'Je ne sais pas',
      tooling_bi: "Nous n'avons pas cet outil",
      tooling_personal_notes: 'Moi seul',
      tooling_reference: 'Le CRM',
      tooling_reference_data: ['Les comptes et leurs interlocuteurs'],
      tooling_reference_freshness: 'Mise à jour il y a moins d’une semaine',
      tooling_reference_confidence: 'Je vérifie les points importants',
      tooling_reference_export: 'Oui, je peux exporter moi-même',
      tooling_duplicates: 'Oui, entre deux outils',
      tooling_pain: 'Je ressaisis les mêmes contacts à trois endroits',
      // #2005.4 (DÉCISION Louis 17/09, lot CP2) — la sous-étape `implantation`,
      // ajoutée en fin de `company_info`.
      company_locations: ['Paris (siège)'],
      // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — la sous-étape
      // `chiffre-affaires`, ajoutée EN FIN à son tour. `annual_revenue_period`
      // n'est posée que si `annual_revenue_amount` est déjà répondue (`when`) :
      // sans la période ici, l'étape resterait « in_progress », jamais « done ».
      annual_revenue_amount: '2500000',
      annual_revenue_period: 'Dernier exercice clos',
    }
    for (const [key, value] of Object.entries(completeCompanyAnswers)) {
      useOnboardingStore.getState().setAnswer(key as keyof OnboardingAnswers, value)
    }
    await render(1)
    const items = screen.getAllByRole('listitem')
    const organisation = items.find(li => li.textContent?.includes('Ton organisation'))
    expect(organisation?.querySelector('svg')).toBeTruthy() // le check, pas un numéro
  })

  it('#2626.1 — « Ton rôle » se coche dès le départ : toutes ses questions sont reportées au Temps 2, rien n’y reste dû', async () => {
    await render(2) // au-delà de « Ton rôle » dans l'ordre d'affichage
    const items = screen.getAllByRole('listitem')
    const role = items.find(li => li.textContent?.includes('Ton rôle'))
    expect(role?.querySelector('svg')).toBeTruthy() // FRANCHI, pas « pas commencé » (#2626.1)
  })
})

/**
 * #2023.3 — chaque étape ouvre par « Cette partie permet à … de… ».
 *
 * La marque n'est PAS écrite ici : la traduction porte `{{brand}}` (GA-252) et
 * i18next l'injecte. Un test qui épelle le nom du produit redevient rouge le
 * jour où il change, et c'est exactement ce qui vient d'arriver.
 */
describe('#2023.3 — la phrase d’ouverture de l’étape courante', () => {
  it('affiche la phrase de l’étape active', async () => {
    await render(0)
    expect(screen.getByText(/Cette partie permet à .+ de mieux connaître ton ESN\./)).toBeInTheDocument()
  })

  it('ne l’affiche plus sur l’écran de relecture (#2030.16)', async () => {
    await render(0, true)
    expect(screen.queryByText(/Cette partie permet à /)).not.toBeInTheDocument()
  })
})

/** #2087.27 — « Afficher l'étape (3/7) », un texte compact en plus de la
 *  liste des sept étapes déjà rendue. */
describe('#2087.27 — « Étape N/7 »', () => {
  it('affiche « Étape 1/7 » sur la première étape', async () => {
    await render(0)
    expect(screen.getByText('Étape 1/7')).toBeInTheDocument()
  })

  it('affiche « Étape 3/7 » sur l’étape « Ton offre »', async () => {
    // ⚠️ `currentStageIndex` indexe TEMPS1_STAGES, pas les sept étapes de
    // résultat. #2018.2 a inséré le stage `role` en position 1, donc
    // TEMPS1_STAGES = [company_info, role, offer_expertise, target_market,
    // goals] : « Ton offre » est l'index 2, pas 1. Le voisin « annonce
    // l'étape courante … sur la BONNE étape nommée » porte déjà la même
    // mesure — ce test-ci avait été écrit avant que le stage `role` existe,
    // et il est arrivé rouge à l'intégration de la vague 11.
    await render(2)
    expect(screen.getByText('Étape 3/7')).toBeInTheDocument()
  })

  it('ne s’affiche plus sur l’écran de relecture', async () => {
    await render(0, true)
    expect(screen.queryByText(/^Étape \d\/7$/)).toBeNull()
  })
})

/**
 * #2087.33 — « branchement adaptatif expliqué » : la moitié qui manquait
 * (« la barre ne recule jamais » est déjà tenu par `clampProgressRegression`,
 * #2023.6).
 */
describe('#2087.33 — le branchement adaptatif est expliqué', () => {
  it('explique que certaines réponses réduisent le nombre de questions restantes', async () => {
    await render(0)
    expect(screen.getByText(/Certaines réponses réduisent le nombre de questions restantes/)).toBeInTheDocument()
  })

  it('ne s’affiche plus sur l’écran de relecture', async () => {
    await render(0, true)
    expect(screen.queryByText(/questions restantes/)).not.toBeInTheDocument()
  })
})

/** #2023.4 — estimation dynamique de la durée restante, par résultat. */
describe('#2023.4 — « Environ N minutes restantes »', () => {
  it('affiche une estimation tant qu’il reste des questions', async () => {
    await render(0)
    expect(screen.getByText(/Environ \d+ minutes? restantes?/)).toBeInTheDocument()
  })

  it('n’affiche plus aucune estimation sur l’écran de relecture', async () => {
    await render(0, true)
    expect(screen.queryByText(/minutes? restantes?/)).not.toBeInTheDocument()
  })
})

/**
 * #2021.9 — UNE icône métier par BLOC (les sept étapes nommées), jamais une
 * par question : `TEMPS1_STAGES` compte ~114 questions, en assigner une par
 * question aurait deviné 114 choix visuels. `ONBOARDING_RESULT_STEPS` (le
 * même vocabulaire de sept étapes que #2023.1/.7) est le grain « bloc ».
 *
 * Décorative, jamais la SEULE porteuse de sens : le libellé texte reste la
 * source du nom accessible (GA-32 ne vise que les boutons icône-seule, ce
 * qui n'est pas le cas ici), donc chaque icône est `aria-hidden`.
 */
describe('#2021.9 — une icône métier par bloc', () => {
  it('porte sept icônes décoratives, une par étape, toutes distinctes', async () => {
    await render(0)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(7)
    const iconNames = items.map(item => {
      // `.step-icon` distingue l'icône métier du `Check` (état « fait »,
      // rendu dans la pastille numérotée) : les deux sont `aria-hidden`.
      const icon = item.querySelector('svg.step-icon')
      expect(icon).not.toBeNull()
      expect(icon?.getAttribute('aria-hidden')).toBe('true')
      return icon?.outerHTML
    })
    expect(new Set(iconNames).size).toBe(7)
  })
})

/**
 * #3553 — « il faudrait pouvoir se déplacer à travers les différentes sections
 * en rendant cliquables ces étapes, et quand on est dans une étape on voit
 * toutes les sous-étapes qui la composent et on peut aussi naviguer dedans ».
 */
describe('#3553 — le rail est une navigation', () => {
  it('sans `onNavigate`, le rail reste un simple repère : aucun bouton', async () => {
    await render(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('une étape qui a des sous-étapes est cliquable et mène à sa PREMIÈRE sous-étape', async () => {
    const onNavigate = vi.fn()
    await render(0, false, { currentSlug: 'entreprise', onNavigate })
    await userEvent.setup().click(screen.getByRole('button', { name: /Ton offre/ }))
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ stageCode: 'offer_expertise', slug: 'domaines' }))
  })

  it('une étape sans question (« Ton rôle ») n’est PAS un bouton mort', async () => {
    await render(0, false, { currentSlug: 'entreprise', onNavigate: vi.fn() })
    expect(screen.queryByRole('button', { name: /Ton rôle/ })).not.toBeInTheDocument()
    expect(screen.getByText('Ton rôle')).toBeInTheDocument()
  })

  it('l’étape courante déplie ses sous-étapes, la courante marquée, et elles se cliquent', async () => {
    const onNavigate = vi.fn()
    await render(0, false, { currentSlug: 'entreprise', onNavigate })
    const sub = screen.getByRole('list', { name: 'Ton organisation' })
    const items = within(sub).getAllByRole('button')
    expect(items.map(b => b.textContent)).toEqual(['Ton entreprise', 'Ton équipe commerciale'])
    expect(items[0]).toHaveAttribute('aria-current', 'page')
    await userEvent.setup().click(items[1])
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ stageCode: 'company_info', slug: 'equipe-commerciale' }),
    )
  })

  it('les sous-étapes des AUTRES étapes restent repliées', async () => {
    await render(0, false, { currentSlug: 'entreprise', onNavigate: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Ton positionnement' })).not.toBeInTheDocument()
  })
})

/**
 * #3709 (recette Ludovic 07/10) — « Ton système commercial » n'a aucune
 * question au Temps 1 : il se lisait « verrouillé » et les résultats /
 * témoignages restaient introuvables. Avec `onOpenProofs`, l'étape est un
 * bouton nommé qui y mène ; sans, elle reste un texte (pas de bouton mort).
 */
describe('#3709 — preuves atteignables depuis le rail, compteur nommé', () => {
  it('« Ton système commercial » est un bouton qui ouvre les preuves', async () => {
    const onOpenProofs = vi.fn()
    await render(0, false, { currentSlug: 'entreprise', onNavigate: vi.fn(), onOpenProofs })
    await userEvent.setup().click(screen.getByRole('button', { name: /Ton système commercial/ }))
    expect(onOpenProofs).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Résultats, témoignages, références')).toBeInTheDocument()
  })

  it('sans rappel, aucun bouton mort sur cette étape', async () => {
    await render(0, false, { currentSlug: 'entreprise', onNavigate: vi.fn() })
    expect(screen.queryByRole('button', { name: /Ton système commercial/ })).not.toBeInTheDocument()
  })

  it('le pourcentage dit ce qu’il compte : « Questionnaire de base »', async () => {
    await render(0)
    expect(screen.getByText(/Questionnaire de base : \d+ %/)).toBeInTheDocument()
  })
})
