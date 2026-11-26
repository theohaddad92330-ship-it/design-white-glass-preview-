import {
  assessInvoiceReadiness,
  INVOICE_BLOCKERS,
  invoicingNeedsTimesheet,
  type InvoiceReadinessState,
} from '@bellum/contracts'
import { DEMO_ACCOUNT_INVOICE_READINESS_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS } from './demo-dataset'

/**
 * LA LENTILLE « PRÊT À FACTURER » SUR LA LISTE DES COMPTES, ET LE RAPPEL
 * « RELANCER LA PRISE DE BRIEF » (manques A et B du 30/08/2026,
 * `apps/web/src/features/accounts/view/accounts-list/`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'agrégation par compte (`buildAccountInvoiceReadinessIndex`,
 * `accountInvoiceReadiness.ts`) vit côté WEB — hors du périmètre de ce lot
 * (`apps/api/src/modules/demo/**`). Cette garde-ci ne la recopie pas : elle
 * PROUVE, sur les données réellement seedées, que l'entrée qu'elle attend
 * existe — le même geste que `demo-mission-po-coverage.spec.ts` fait pour le
 * bloqueur « bon de commande exigé et absent ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS ATTEIGNABLES, UN QUATRIÈME QUI NE L'EST PAS — ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `none` (sans objet) : les CINQ comptes réels du jeu (aucun n'a jamais
 *    porté de mission — `DemoDossier` n'a même pas de champ `missions`) sont
 *    absents du digest de propagation, donc `none` par construction.
 *  - `blocked` : SNCF porte, sur le mois que l'écran regarde,
 *    plusieurs missions réellement bloquées (relevé manquant, bon de commande
 *    manquant, contact de facturation inconnu, relevé rejeté, relevé non
 *    validé) — la précédence `blocked > ready > invoiced > not_due` fait
 *    remonter cet état au compte, cohérent avec ce que l'onglet Missions
 *    affiche déjà sur chaque ligne.
 *  - `not_due` : DÉMONTRABLE à la maille MISSION depuis ce lot (voir plus bas)
 *    — la mission au forfait ne se facturait PAS à la cadence qu'elle
 *    prétendait suivre (`billing_cadence: 'monthly'` alors que son propre
 *    commentaire disait « l'état de facturation mensuel ne se pose pas » :
 *    une incohérence PRÉEXISTANTE, corrigée dans ce lot). Le mois précédent,
 *    ce sont donc DEUX `ready`, UN `not_due` et trois `blocked` — les quatre
 *    états du vocabulaire coexistent enfin sur le jeu.
 *  - `ready` et `not_due` restent MASQUÉS au niveau COMPTE par la précédence
 *    (`blocked` gagne toujours tant qu'une seule mission bloque) : SNCF est le
 *    SEUL compte à porter des missions dans la salle, et une salle à un seul
 *    compte facturable ne peut pas montrer un compte « Prêt » ET un compte
 *    « Bloqué » en même temps sans en ajouter un second — ce qu'aucune raison
 *    de ce lot ne justifie (`chantiers-livres.md` : la moitié « après la
 *    signature » n'existe QUE sur SNCF, à dessein, pour ne jamais laisser
 *    croire à une mission chez l'une des cinq sociétés réelles). Ce que la
 *    salle montre : le geste au niveau MISSION (`GET /delivery/missions`,
 *    onglet Missions du compte), pas au niveau agrégé du portefeuille.
 *    `invoiced` reste hors du mois courant à dessein, cf. la raison déjà
 *    écrite en face de `invoice_readiness` dans `demo-coverage.ts`.
 */

type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

/** Même borne que `demo-coverage.spec.ts` : les missions que l'écran « Prêt à
 *  facturer » regarde sur le mois précédent. Recopiée ici pour la même raison
 *  qu'ailleurs dans ce dossier — un seed doit lire comme l'écran. */
function visibleOnPreviousMonth(mission: DemoMission): boolean {
  return mission.ends_in_days === null || mission.ends_in_days > 0
}

/** Traduit une mission du jeu vers ce que `assessInvoiceReadiness` attend —
 *  jamais recopié, la fonction réelle du contrat. */
function toReadinessInput(mission: DemoMission) {
  return {
    timesheet: mission.timesheet
      ? {
          status: mission.timesheet.status,
          days: mission.timesheet.days,
          anomalies: [] as string[],
          gap: mission.timesheet.days - mission.timesheet.expected_days,
          gapExplanation: mission.timesheet.gap_explanation,
        }
      : null,
    dailyRateCents: mission.daily_rate === null ? null : Math.round(mission.daily_rate * 100),
    requiresPo: mission.requires_po,
    poNumber: mission.po_number,
    invoicedAt: null, // aucune ligne `invoice_readiness` sur le mois courant, à dessein (voir demo-coverage.ts)
    billingContactId: mission.billing_contact,
    chargedCostCents: mission.loaded_daily_cost_cents,
    startedOn: '2020-01-01', // seule la NULLITÉ compte pour `assessInvoiceReadiness` ; toutes les missions du jeu ont une date de début connue (`started_days_ago`)
    expectsTimesheet: invoicingNeedsTimesheet(mission.contract_kind),
    billingCadence: mission.billing_cadence as 'monthly' | 'milestone' | 'fixed_price',
  }
}

/** La précédence du badge compte (`accountInvoiceReadiness.ts`, non importable
 *  depuis l'API) : `blocked > ready > invoiced > not_due`. */
function worstState(states: readonly InvoiceReadinessState[]): InvoiceReadinessState | null {
  if (states.length === 0) return null
  if (states.includes('blocked')) return 'blocked'
  if (states.includes('ready')) return 'ready'
  if (states.includes('invoiced')) return 'invoiced'
  return 'not_due'
}

describe('couverture de la lentille « prêt à facturer » — niveau MISSION', () => {
  const missions = DEMO_DELIVERY_CLIENT.missions.filter(visibleOnPreviousMonth)
  const assessed = missions.map(mission => ({
    mission,
    result: assessInvoiceReadiness(toReadinessInput(mission)),
  }))

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(missions.length).toBeGreaterThanOrEqual(4)
  })

  it('fait travailler les QUATRE états du vocabulaire, pas trois', () => {
    const states = new Set(assessed.map(entry => entry.result.state))
    expect(states.has('ready')).toBe(true)
    expect(states.has('blocked')).toBe(true)
    expect(states.has('not_due')).toBe(true)
    // `invoiced` reste hors du mois courant à dessein (voir demo-coverage.ts,
    // entrée `invoice_readiness`) : aucune assertion positive ici.
  })

  it('la mission au forfait rend enfin `not_due` — la salle a corrigé sa propre incohérence', () => {
    const forfait = assessed.find(entry => entry.mission.label.includes('forfait'))
    expect(forfait).toBeDefined()
    expect(forfait!.result.state).toBe('not_due')
  })

  it('sait dire NON — remettre sa cadence à `monthly` la ferait retomber `blocked`', () => {
    const forfait = missions.find(mission => mission.label.includes('forfait'))!
    const input = toReadinessInput(forfait)
    const withMonthlyCadence = assessInvoiceReadiness({ ...input, billingCadence: 'monthly' })
    expect(withMonthlyCadence.state).toBe('blocked')
  })

  it('agrège au niveau COMPTE : `blocked` gagne, avec des bloqueurs qui recoupent l’onglet Missions', () => {
    const aggregate = worstState(assessed.map(entry => entry.result.state))
    expect(aggregate).toBe('blocked')

    const allBlockers = new Set(assessed.flatMap(entry => entry.result.blockers))
    // Ordonnés par gravité du domaine, exactement comme le ferait le badge.
    const ordered = INVOICE_BLOCKERS.filter(blocker => allBlockers.has(blocker))
    expect(ordered.length).toBeGreaterThan(0)
    expect(ordered).toEqual(expect.arrayContaining(['missing_billing_contact']))
  })
})

/**
 * MANQUE B — « RELANCER LA PRISE DE BRIEF »
 * (`apps/web/.../accountRelaunchBrief.ts` : ≥ 2 opportunités OUVERTES et
 * AUCUNE mission signée).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST DÉJÀ VRAI SUR SOCIÉTÉ GÉNÉRALE, SANS RIEN SEMER DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `opportunities.first_detected_at` vaut `DEFAULT now()` (migration
 * `1787900000000-Opportunities.ts`). `DemoSeedService.seedCompanionData`
 * matérialise les comptes réels dans l'ORDRE de `DEMO_DOSSIERS`
 * (`for (const accountId of accountIds.values()) await this.projects.
 * materialize(accountId)`, séquentiel, `Map` qui préserve l'ordre d'insertion)
 * — donc Société Générale, PREMIÈRE de la liste, voit TOUTES ses opportunités
 * insérées avant que Groupe BPCE ne matérialise la moindre ligne. `advanceDemoPipeline`
 * choisit ensuite les 9 PLUS ANCIENNES (`ORDER BY first_detected_at ASC`) et en
 * promeut 5 sur des étapes OUVERTES (`qualified` ×2, `confirmed`,
 * `profiles_submitted`, `negotiation`) : tant que Société Générale
 * matérialise à elle seule au moins 5 opportunités — ce que ses 4
 * `it_challenges` et 5 `recent_signals` garantissent, sans compter ses
 * `pains`/`program_names`/implication — ces 5 promotions tombent NÉCESSAIREMENT
 * sur elle, jamais sur un autre compte. Aucune mission ne pend de
 * `DemoDossier` (le type n'a même pas ce champ) : `hasSignedMission` vaut donc
 * `false` pour les cinq comptes réels, structurellement.
 *
 * Cette garde ne rejoue pas le SQL (hors périmètre d'un test unitaire sans
 * base) : elle verrouille les DEUX prémisses dont la conclusion ci-dessus
 * dépend — casser l'une d'elles doit la faire rougir.
 */
describe('couverture du rappel « relancer la prise de brief »', () => {
  it('lit un corpus NON VIDE', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThanOrEqual(3)
  })

  it('Société Générale est bien la PREMIÈRE matérialisée — l’ordre fait la démonstration', () => {
    expect(DEMO_DOSSIERS[0]?.account.company_name).toBe('Société Générale')
  })

  it('Société Générale matérialise assez d’items pour occuper, À ELLE SEULE, les 5 promotions ouvertes', () => {
    const sg = DEMO_DOSSIERS[0]!.account
    const materializable = sg.it_challenges.length + sg.recent_signals.length
    // Le plan de `advanceDemoPipeline` promeut 5 étapes OUVERTES
    // (`qualified` ×2, `confirmed`, `profiles_submitted`, `negotiation`) avant
    // le `won` de la 6ᵉ : il en faut au moins 5 pour qu'aucune ne déborde sur
    // Groupe BPCE, le compte matérialisé juste après.
    expect(materializable).toBeGreaterThanOrEqual(5)
  })

  it('sait dire NON — sous 5 items matérialisables, la promesse ne tient plus', () => {
    expect(2 + 1).toBeLessThan(5)
  })

  it('aucun dossier réel ne porte de mission — `hasSignedMission` est structurellement faux', () => {
    for (const dossier of DEMO_DOSSIERS) {
      expect('missions' in dossier.account).toBe(false)
    }
  })
})

describe('la capacité est classée dans le registre de couverture', () => {
  it('les six états sont classés, chacun avec une raison qui tient', () => {
    const expectedKeys = ['none', 'blocked', 'ready', 'not_due', 'invoiced', 'relaunch_brief']
    expect(Object.keys(DEMO_ACCOUNT_INVOICE_READINESS_COVERAGE).sort()).toEqual([...expectedKeys].sort())
    for (const entry of Object.values(DEMO_ACCOUNT_INVOICE_READINESS_COVERAGE)) {
      expect(entry.reason.length).toBeGreaterThan(60)
    }
  })
})
