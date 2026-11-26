import { offersCascadeView, readOffersCascade } from '@bellum/contracts'
import {
  accessBarrierSchema,
  accountAnalysisSchema,
  computeCommercialTrajectories,
  computeMissionStartReadiness,
  LINK_KIND_TO_VOIE,
  PERSONAL_ACCESS_VOIES,
  MISSION_DAY_ONE_CONFIRM_WINDOW_DAYS,
  MISSION_PRE_START_STATUSES,
  MISSION_START_ANNOUNCE_WINDOW_DAYS,
  expectsTimesheet,
  intermediationCost,
  INTERVENTION_THRESHOLDS,
  LAURA_INTERVENTIONS,
  marginByChannel,
  NEED_OPEN_STATUSES,
  TIMESHEET_STATUSES,
  trueDailyCostCents,
} from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT,
  DEMO_INTENTIONALLY_EMPTY,
  DEMO_LAURA_BUBBLES_REACHABLE,
  DEMO_LAURA_BUBBLES_SILENT,
  DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY,
  DEMO_COMMERCIAL_TRAJECTORIES_COVERAGE,
  DEMO_CONTEXT_PACK_IMPORT_COVERAGE,
  DEMO_CV_AUTO_READ_PROGRESS_COVERAGE,
  DEMO_ON_ACCOUNTS_EXTERNAL_WORKFORCE_COVERAGE,
  DEMO_PERSONAL_ACCESS_PATHS_COVERAGE,
  DEMO_RV4_E_FIX_COVERAGE,
  DEMO_SEEDED_TABLES,
  DEMO_SEQUENCE_ALREADY_IN_PROGRESS_COVERAGE,
  DEMO_SEQUENCE_DUPLICATE_EMAIL_COVERAGE,
  DEMO_GROUP_ENTITIES_COVERAGE,
  DEMO_TEAM_BOARD_COVERAGE,
  DEMO_TEAM_CROSS_TEAM_SUPPORT_COVERAGE,
  DEMO_TIMESHEET_STATES_INTENTIONALLY_ABSENT,
} from './demo-coverage'
import {
  DEMO_DELIVERY_CLIENT,
  DEMO_PARTNER_RELATIONS,
  DEMO_DOSSIERS,
  DEMO_ANALYSED_ACCOUNTS,
  DEMO_FLAGSHIP_NEED,
  DEMO_SG_ESN_PARTNERS,
  DEMO_SPRINT_PARTNER_ROUTE_PARTNER,
  DEMO_START_READINESS_MISSION,
  demoInvoiceHistory,
  DEMO_CONSULTANTS,
  DEMO_CV_READ_THIS_WEEK,
} from './demo-dataset'
import {
  DEMO_OUTREACH_PLAN,
  DEMO_PERSONAL_ACCESS_EXTRA_SEEDS,
  DEMO_PERSONAL_ACCESS_PATH_SEEDS,
  DEMO_WATCH_WAKE_SEED,
} from './demo-seed.service'
import { DEMO_PURGE_JOIN_TABLES, DEMO_PURGE_TABLES, DEMO_PURGE_USER_TABLES } from './demo-reset.service'
import { seatNameOrNull } from './demo-seat-names'

/** Clés du contrat `raw_analysis`, telles que l'IA les écrit. */
function analysisContractKeys(): string[] {
  return Object.keys((accountAnalysisSchema as unknown as { shape: Record<string, unknown> }).shape ?? {})
}

/** `true` quand au moins un dossier de démo renseigne VRAIMENT la clé — une
 *  valeur nulle ou un tableau vide laisse l'écran aussi vide qu'une absence. */
function filledInSomeDossier(key: string): boolean {
  return filledIn(
    DEMO_DOSSIERS.map(dossier => dossier.account.raw_analysis as Record<string, unknown>),
    key,
  )
}

/** #4116 — idem, mais les quatre comptes ANALYSÉS (Airbus, EDF, Renault, Thales), servis eux aussi par la salle de
 *  démonstration, comptent pour COUVRIR une clé (la garde « absence justifiée » reste, elle, sur les dossiers). */
function filledInSomeSeededAccount(key: string): boolean {
  return filledIn(
    [
      ...DEMO_DOSSIERS.map(dossier => dossier.account.raw_analysis as Record<string, unknown>),
      ...DEMO_ANALYSED_ACCOUNTS.map(account => (account.raw_analysis ?? {}) as Record<string, unknown>),
    ],
    key,
  )
}

function filledIn(rawAnalyses: ReadonlyArray<Record<string, unknown>>, key: string): boolean {
  return rawAnalyses.some(raw_analysis => {
    const value = raw_analysis[key]
    if (value == null) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value).length > 0
    return true
  })
}

/**
 * La garde permanente : « une fonctionnalité livrée doit AUSSI se voir en démo ».
 *
 * Ce test ne vérifie pas un rendu, il verrouille une DÉCISION. Livrer un écran
 * qui lit une nouvelle table sans rien seeder ne casse aucun test — ça se
 * découvre en réunion, devant un prospect, sur un état vide. Ici, la CI le dit
 * avant.
 *
 * Voir `demo-coverage.ts` pour la chaîne complète (leak guard → couverture).
 */
/**
 * #2125.50-.56 — parité démo du compte rendu de rafraîchissement.
 *
 * `RefreshOutcomeCard` lit `raw_analysis.last_refresh`, que le serveur écrit au
 * retour d'un rafraîchissement par axe. L'espace de démonstration ne déclenche
 * aucun geste payant : sans semis, la carte s'ouvrirait vide devant un
 * prospect, et personne ne le saurait avant la réunion.
 *
 * ⚠️ `last_refresh` n'est PAS une clé du contrat `accountAnalysisSchema` : la
 * garde par clé de contrat ci-dessus ne la voit pas. Celle-ci la voit, et elle
 * vérifie les QUATRE cas que la carte sait rendre — un semis qui n'en porterait
 * qu'un laisserait trois sections invisibles en démonstration.
 */
describe('le compte rendu de rafraîchissement est rempli en démo', () => {
  const seeded = DEMO_DOSSIERS.map(dossier => dossier.account.raw_analysis['last_refresh']).filter(
    (value): value is Record<string, unknown> => typeof value === 'object' && value !== null,
  )

  it('au moins un dossier de démo en porte un', () => {
    expect(seeded.length).toBeGreaterThan(0)
  })

  it('exerce le fait neuf, le fait modifié, le fait devenu obsolète et la correction conservée', () => {
    const diffs = seeded
      .map(last => (last as { diff?: Record<string, unknown> }).diff)
      .filter((diff): diff is Record<string, unknown> => !!diff)
    const filled = (key: string): boolean =>
      diffs.some(diff => Array.isArray(diff[key]) && (diff[key] as unknown[]).length > 0)

    // Le tableau rend le défaut LISIBLE : la clé manquante est nommée dans la
    // sortie, plutôt qu'un « false n'est pas true » sur la troisième itération.
    const missing = ['newFacts', 'changedFacts', 'obsoleteFacts', 'preservedCorrections'].filter(key => !filled(key))
    expect(missing).toEqual([])
  })

  // #2318.8 — `overwrittenCorrections` : VIDE À DESSEIN, et voici la raison.
  //
  // Ce n'est pas une capacité qu'on met en vitrine, c'est un CONSTAT de panne :
  // « le rafraîchissement a écrasé ta correction ». En démonstration, aucun
  // writer ne contourne l'arbitre de provenance — il n'y a donc rien à
  // constater. Semer un écrasement mettrait en scène une avarie qui n'a pas eu
  // lieu, c'est-à-dire exactement la donnée fictive que la doctrine interdit.
  //
  // ⚠️ Ce test n'affirme pas la classification, il la VÉRIFIE sur la source
  // réelle : il échoue le jour où un semis en ajoute un (il faudra alors
  // décider ce qu'on montre) ET le jour où le champ cesse d'exister dans le
  // compte rendu (le « à dessein » perdrait son objet).
  it('n’exerce AUCUN écrasement de correction — vide à dessein, la démo n’a pas de writer aveugle', () => {
    const diffs = seeded
      .map(last => (last as { diff?: Record<string, unknown> }).diff)
      .filter((diff): diff is Record<string, unknown> => !!diff)

    expect(diffs.length).toBeGreaterThan(0)
    for (const diff of diffs) {
      const overwritten = diff['overwrittenCorrections']
      // Absent (compte rendu antérieur au champ) ou vide : jamais peuplé.
      expect(Array.isArray(overwritten) ? (overwritten as unknown[]).length : 0).toBe(0)
    }
  })

  it('un fait devenu obsolète garde sa dernière valeur ET sa date — on archive, on ne supprime pas', () => {
    const obsolete = seeded
      .flatMap(last => ((last as { diff?: { obsoleteFacts?: unknown[] } }).diff?.obsoleteFacts ?? []) as unknown[])
      .filter((fact): fact is Record<string, unknown> => typeof fact === 'object' && fact !== null)

    expect(obsolete.length).toBeGreaterThan(0)
    for (const fact of obsolete) {
      expect(fact.lastKnownValue).toBeTruthy()
      expect(fact.lastSeenAt).toBeTruthy()
    }
  })

  // #2591.4 — le TROISIÈME état ajouté par #2591 : un score non recalculé,
  // jamais confondu avec un score vérifié stable. Sans semis, personne ne
  // verrait cette ligne avant la réunion.
  it('un score non recalculé est exercé, et JAMAIS aux côtés d’un score changé', () => {
    const diffs = seeded
      .map(last => (last as { diff?: Record<string, unknown> }).diff)
      .filter((diff): diff is Record<string, unknown> => !!diff)

    const withScoreNotRecalculated = diffs.filter(diff => diff.scoreNotRecalculated != null)
    expect(withScoreNotRecalculated.length).toBeGreaterThan(0)
    for (const diff of withScoreNotRecalculated) {
      // La carte donne toujours la priorité à `scoreChanged` : un compte rendu
      // qui porterait les deux masquerait ce cas en démo.
      expect(diff.scoreChanged).toBeNull()
      expect((diff.scoreNotRecalculated as { lastKnownValue?: unknown }).lastKnownValue).toBeTruthy()
    }
  })

  // #2591.6 — le QUATRIÈME état ajouté par #2591.6 : une confiance non
  // recalculée, jamais confondue avec une confiance vérifiée stable. Sans
  // semis, personne ne verrait cette ligne avant la réunion.
  it('une confiance non recalculée est exercée, et JAMAIS aux côtés d’une confiance changée', () => {
    const diffs = seeded
      .map(last => (last as { diff?: Record<string, unknown> }).diff)
      .filter((diff): diff is Record<string, unknown> => !!diff)

    const withConfidenceNotRecalculated = diffs.filter(diff => diff.confidenceNotRecalculated != null)
    expect(withConfidenceNotRecalculated.length).toBeGreaterThan(0)
    for (const diff of withConfidenceNotRecalculated) {
      // La carte donne toujours la priorité à `confidenceChanged` : un compte
      // rendu qui porterait les deux masquerait ce cas en démo.
      expect(diff.confidenceChanged).toBeNull()
      expect((diff.confidenceNotRecalculated as { lastKnownValue?: unknown }).lastKnownValue).toBeTruthy()
    }
  })
})

/**
 * #2554.1/#2554.2 — parité démo de la revérification d'organigramme.
 *
 * `RefreshOutcomeCard` lit `raw_analysis.org.peopleRefreshDiff` (#3591 : la carte de l’onglet Organigramme est retirée), que
 * l'API écrit quand une actualisation revérifie un organigramme EXISTANT
 * (`AccountsService.withNotConfirmedPeople`). L'espace de démonstration ne
 * déclenche aucun geste payant : sans semis, la carte ne s'ouvrirait jamais
 * devant un prospect — même refus que `last_refresh` juste au-dessus.
 *
 * ⚠️ `org.peopleRefreshDiff` n'est PAS une clé de `accountAnalysisSchema` (elle
 * vit sous `org`, comme `orgGraph`) : la garde par clé de contrat plus haut ne
 * la voit pas non plus.
 */
describe('le diff de revérification de l’organigramme est rempli en démo', () => {
  const orgBlocks = DEMO_DOSSIERS.map(
    dossier =>
      (dossier.account.raw_analysis['org'] as { peopleRefreshDiff?: Record<string, unknown> } | undefined)
        ?.peopleRefreshDiff,
  ).filter((diff): diff is Record<string, unknown> => !!diff)

  it('au moins un dossier de démo en porte un', () => {
    expect(orgBlocks.length).toBeGreaterThan(0)
  })

  it('exerce la revérifiée, le poste changé et la non confirmée — les trois seaux que la carte sait nommer', () => {
    const filled = (key: string): boolean =>
      orgBlocks.some(diff => Array.isArray(diff[key]) && (diff[key] as unknown[]).length > 0)
    const missing = ['reverified', 'changedPosition', 'notConfirmed'].filter(key => !filled(key))
    expect(missing).toEqual([])
  })

  it('une personne non confirmée est NOMMÉE ainsi, jamais « partie » — et porte sa date', () => {
    const notConfirmed = orgBlocks.flatMap(diff => (diff.notConfirmed ?? []) as Record<string, unknown>[])
    expect(notConfirmed.length).toBeGreaterThan(0)
    for (const entry of notConfirmed) {
      expect(entry.fullName).toBeTruthy()
      expect(entry.kind).toBe('notConfirmed')
    }
    expect(orgBlocks.some(diff => typeof diff.asOf === 'string' && (diff.asOf as string).length > 0)).toBe(true)
  })
})

/**
 * #2966 (#2119.43-51) — parité démo de la carte de périmètre.
 *
 * `EntitiesGraphCard` lit désormais `raw_analysis.priority_perimeters`
 * (`perimeterSignals.ts::readPriorityPerimeters`) pour ses cinq attributs
 * calculés (rôle, confiance, potentiel, accessibilité, signaux) — sans semis,
 * ces cinq colonnes se liraient « non mesuré » sur TOUS les dossiers de
 * démonstration, un écran livré mais vide découvert en réunion.
 *
 * ⚠️ `priority_perimeters` n'est PAS une clé de `accountAnalysisSchema` (même
 * situation que `last_refresh`/`org.peopleRefreshDiff` ci-dessus — lu
 * défensivement, jamais garanti par un schéma strict côté web) : la garde par
 * clé de contrat plus bas ne la voit pas non plus.
 */
describe('la carte de périmètre (rôle/confiance/potentiel/accessibilité/signaux) est remplie en démo', () => {
  const perimeters = DEMO_DOSSIERS.map(dossier => dossier.account.raw_analysis['priority_perimeters']).filter(
    (value): value is Record<string, unknown>[] => Array.isArray(value) && value.length > 0,
  )

  it('au moins un dossier de démo en porte — jamais le groupe, seulement les périmètres actionnables', () => {
    expect(perimeters.length).toBeGreaterThan(0)
  })

  it('exerce les cinq attributs que la carte affiche : tier, confidence, entryRole, accessibilité, signaux', () => {
    const flat = perimeters.flat()
    expect(flat.some(p => typeof p.tier === 'string')).toBe(true)
    expect(flat.some(p => typeof p.confidence === 'string')).toBe(true)
    expect(flat.some(p => typeof p.entryRole === 'string' && p.entryRole)).toBe(true)
    // Au moins DEUX paliers d'accessibilité DIFFÉRENTS dans `scoreBreakdown` —
    // sinon la démo ne montrerait jamais qu'une seule valeur d'accessibilité.
    const accessPoints = flat
      .map(
        p =>
          (p.scoreBreakdown as { axis: string; points: number }[] | undefined)?.find(a => a.axis === 'accessibilite')
            ?.points,
      )
      .filter((points): points is number => typeof points === 'number')
    expect(new Set(accessPoints).size).toBeGreaterThan(1)
    expect(flat.some(p => Array.isArray(p.whatToSell) && p.whatToSell.length > 0)).toBe(true)
  })

  it('un périmètre priorisé correspond à une entité ACTIONNABLE du même dossier — jamais le groupe', () => {
    for (const dossier of DEMO_DOSSIERS) {
      const list = dossier.account.raw_analysis['priority_perimeters']
      if (!Array.isArray(list) || list.length === 0) continue
      const entities = dossier.account.raw_analysis['entities_exhaustive']
      if (!Array.isArray(entities)) continue
      const actionableNames = new Set(
        entities.filter((e): e is Record<string, unknown> => !!e && e.actionable === true).map(e => e.name),
      )
      for (const perimeter of list as Record<string, unknown>[]) {
        expect(actionableNames.has(perimeter.name)).toBe(true)
      }
    }
  })
})

describe('couverture de l’espace de démonstration', () => {
  it('classe CHAQUE table de contenu : seedée, ou vide à dessein avec sa raison', () => {
    const seeded = new Set<string>(DEMO_SEEDED_TABLES)
    const empty = new Set<string>(Object.keys(DEMO_INTENTIONALLY_EMPTY))

    // #2151.70 (16/09/2026) — ÉLARGIE aux tables scopées par UTILISATEUR
    // (`DEMO_PURGE_USER_TABLES`). Avant ce lot, cette garde ne lisait que
    // `DEMO_PURGE_TABLES` (`workspace_id`) : une table scopée `user_id` —
    // `notifications` en tête — pouvait rester NI seedée NI classée vide à
    // dessein sans jamais faire rougir la CI. C'était une garde AVEUGLE, pas
    // une exemption (voir la note de tête de ce fichier).
    const purgedContent = [...DEMO_PURGE_TABLES, ...DEMO_PURGE_USER_TABLES]
    const unclassified = purgedContent.filter(table => !seeded.has(table) && !empty.has(table))

    // Si ce test échoue, une table de contenu est apparue sans qu'on ait dit ce
    // que la démo en montre. Deux issues, jamais une troisième :
    //  - la seeder dans `DemoSeedService.seedWorkspace` (+ `DEMO_SEEDED_TABLES`) ;
    //  - l'ajouter à `DEMO_INTENTIONALLY_EMPTY` avec une raison qui tient devant
    //    quelqu'un qui présente le produit.
    expect(unclassified).toEqual([])
  })

  it('une table déclarée SEEDÉE l’est vraiment par le service de seed', () => {
    // La garde d'à côté vérifie qu'une décision a été PRISE. Celle-ci vérifie
    // qu'elle a été TENUE : sans elle, inscrire une table dans
    // `DEMO_SEEDED_TABLES` sans écrire une ligne fait passer la CI au vert et
    // laisse l'écran vide devant un prospect — exactement le défaut que toute
    // cette chaîne existe pour empêcher, mais dans l'autre sens.
    // #4158 — le service de semis ET ses modules de semis voisins (`demo-team-guardrails-seed.ts`,
    // appelé depuis `seedWorkspace`) : une table peut être écrite dans l'un ou l'autre.
    const source =
      readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8') +
      readFileSync(join(__dirname, 'demo-team-guardrails-seed.ts'), 'utf8') +
      // Théo D team-business.N2 — la cible proposée à Léa (`objective_proposals`).
      readFileSync(join(__dirname, 'demo-team-objectives-seed.ts'), 'utf8')

    // Les repositories injectés couvrent leur table sans que son nom apparaisse
    // en SQL : on accepte donc l'un OU l'autre.
    const REPOSITORY_BACKED: Record<string, string> = {
      accounts: 'this.accounts.save',
      contacts: 'this.contacts.save',
      // #3104 — la conversation d'exemple du panneau « Conversations » de /chat.
      chat_messages: 'this.chatMessages.save',
      attack_angles: 'this.attackAngles.save',
      action_plans: 'this.actionPlans.save',
      consultants: 'this.consultants.save',
      // #2569.4 — les documents d'origine du lot N (import ZIP/messagerie).
      consultant_documents: 'this.consultantDocuments.save',
      consultant_skills: 'this.consultantSkills.save',
      consultant_experiences: 'this.consultantExperiences.save',
      // #2185.51 — un brouillon de message, jamais un envoi.
      talent_prepared_messages: 'this.talentPreparedMessages.save',
      user_actions: 'this.userActions.save',
      member_objectives: 'this.memberObjectives.save',
      workflow_runs: 'this.workflowRuns.save',
      // #2946 — la demande d'approbation EN ATTENTE derrière la tâche
      // `source = 'action_os_approval'`.
      approval_requests: 'this.approvalRequests.save',
      rag_documents: 'this.ragDocuments.save',
      notes: 'this.notes.save',
      activities: 'this.activities.save',
      tasks: 'this.tasks.save',
      // Matérialisés par la MÊME projection déterministe qu'en production.
      opportunities: 'this.projects.materialize',
      project_needs: 'INSERT INTO project_needs',
      account_entities: 'this.accountEntities.save',
      // #2151.70 — scopée `user_id`, seedée via le repository de favoris.
      user_favorites: 'this.favorites.save',
      // #2571.5 — l'appel d'offres scripté de la salle (`seedRfp`).
      rfps: 'this.rfps.save',
      // BEL-SC-224 (#3253, P0) — CALCULÉ par le service canonique, jamais une
      // ligne écrite à la main (voir le commentaire au-dessus de la table
      // dans `DEMO_SEEDED_TABLES`).
      weakest_link_diagnoses: 'this.weakestLinkDiagnosis.seedDiagnosisFor',
    }

    const missing = DEMO_SEEDED_TABLES.filter(table => {
      const marker = REPOSITORY_BACKED[table]
      if (marker && source.includes(marker)) return false
      return !source.includes(`INSERT INTO ${table}`)
    })

    expect(missing).toEqual([])
  })

  /**
   * #2582.1 — LA GARDE ÉTAIT BORGNE : elle lisait du TEXTE, jamais un APPEL.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * Le test juste au-dessus vérifie que la chaîne `INSERT INTO business_units`
   * (ou son marqueur de repository) est PRÉSENTE quelque part dans le fichier.
   * Elle l'est TOUJOURS, y compris quand `seedBusinessUnits` n'est jamais
   * appelée depuis `seedWorkspace` : la fonction existe, son SQL est correct,
   * mais personne ne la déclenche — la salle de démonstration ne sème jamais
   * la table, et l'écran s'ouvre vide devant un prospect. Mesuré ici en
   * commentant l'appel `await this.seedBusinessUnits(...)` : les 123 tests de
   * `demo-coverage.spec.ts` + `demo-seed.service.spec.ts` restaient TOUS
   * verts. Une garde qui ne remarque pas qu'une fonction citée n'est plus
   * appelée n'est pas une garde, c'est une liste de mots.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE CORRECTIF
   * ─────────────────────────────────────────────────────────────────────────
   * On construit le graphe d'appel RÉEL de `demo-seed.service.ts` (qui appelle
   * qui, via `this.<méthode>(`) et on vérifie que chaque méthode `seed*` est
   * ATTEIGNABLE depuis `seedWorkspace` — le seul point d'entrée que le pool de
   * démo utilise (`createDemoWorkspace` ne fait que l'appeler). Une méthode
   * écrite mais jamais reliée au graphe ressort, qu'elle soit orpheline
   * directement ou transitivement (appelée par une méthode elle-même morte).
   */
  describe('aucune méthode de semis n’est orpheline — écrite ne veut pas dire appelée', () => {
    /** Une méthode de classe (nom, portée textuelle) — la portée va de sa
     *  déclaration à la déclaration suivante, donc couvre tout son corps quels
     *  que soient les retours à la ligne dans sa signature. */
    function methodSpans(src: string): { name: string; start: number; end: number }[] {
      const matches = [...src.matchAll(/^ {2}(?:private )?async (\w+)\(/gm)]
      return matches.map((m, i) => ({
        name: m[1],
        start: m.index!,
        end: i + 1 < matches.length ? matches[i + 1].index! : src.length,
      }))
    }

    /** Les méthodes atteignables depuis `seedWorkspace`, par BFS sur `this.x(`. */
    function reachableFromSeedWorkspace(src: string): Set<string> {
      const spans = methodSpans(src)
      const byName = new Map(spans.map(span => [span.name, span]))
      const reachable = new Set<string>(['seedWorkspace'])
      const queue = ['seedWorkspace']
      while (queue.length > 0) {
        const current = queue.shift()!
        const span = byName.get(current)
        if (!span) continue
        const body = src.slice(span.start, span.end)
        for (const [, called] of body.matchAll(/this\.(\w+)\(/g)) {
          if (byName.has(called) && !reachable.has(called)) {
            reachable.add(called)
            queue.push(called)
          }
        }
      }
      return reachable
    }

    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const seedMethodNames = methodSpans(source)
      .map(span => span.name)
      .filter(name => name.startsWith('seed'))

    it('lit un corpus non vide — des dizaines de méthodes de semis déclarées', () => {
      // Sans ce witness, un fichier vidé par erreur ferait passer le test
      // suivant en silence : plus aucune méthode à vérifier n'est aussi vert.
      expect(seedMethodNames.length).toBeGreaterThan(20)
    })

    it('chaque méthode de semis est ATTEINTE depuis `seedWorkspace`', () => {
      const reachable = reachableFromSeedWorkspace(source)
      const unreachable = seedMethodNames.filter(name => !reachable.has(name))
      expect(unreachable).toEqual([])
    })

    it('sait dire NON — décrocher un appel existant le fait ressortir INATTEIGNABLE', () => {
      // Témoin, l'état exact de l'expérience mesurée ci-dessus : l'appel à
      // `seedBusinessUnits` retiré, tout le reste inchangé.
      const withoutCall = source.replace(
        'await this.seedBusinessUnits(workspaceId, ownerUserId)',
        '// call removed for this test',
      )
      expect(withoutCall).not.toBe(source) // la substitution a bien eu lieu
      const reachable = reachableFromSeedWorkspace(withoutCall)
      expect(reachable.has('seedBusinessUnits')).toBe(false)
    })

    it('n’attrape pas ce qu’elle ne vise pas — une méthode reliée reste verte', () => {
      // Témoin négatif : `seedBusinessUnits` est reliée dans le fichier réel,
      // et `seedMarginThreshold` (appelée juste après elle) aussi.
      const reachable = reachableFromSeedWorkspace(source)
      expect(reachable.has('seedBusinessUnits')).toBe(true)
      expect(reachable.has('seedMarginThreshold')).toBe(true)
    })
  })

  it('ne classe jamais une table dans les deux à la fois', () => {
    const both = DEMO_SEEDED_TABLES.filter(table => table in DEMO_INTENTIONALLY_EMPTY)
    expect(both).toEqual([])
  })

  it('ne classe que des tables réellement purgées — une entrée périmée ment sur la couverture', () => {
    // Les TROIS façons d'être purgée : par `workspace_id`, par jointure vers
    // son parent, ou par `user_id` (#2151.70). Ne lire que la première ferait
    // passer pour périmée une table purgée par jointure ou par utilisateur —
    // ce qui pousserait à retirer sa raison de couverture, donc à perdre la
    // réponse à « et en démo, ça montre quoi ? ».
    const purged = new Set<string>([
      ...DEMO_PURGE_TABLES,
      ...DEMO_PURGE_JOIN_TABLES.map(entry => entry.table),
      ...DEMO_PURGE_USER_TABLES,
    ])
    const stale = [...DEMO_SEEDED_TABLES, ...Object.keys(DEMO_INTENTIONALLY_EMPTY)].filter(table => !purged.has(table))
    expect(stale).toEqual([])
  })

  it('exige une raison NON VIDE pour chaque écran laissé vide', () => {
    for (const [table, reason] of Object.entries(DEMO_INTENTIONALLY_EMPTY)) {
      // Une raison d'un mot (« inutile ») ne se relit pas six mois plus tard.
      expect(reason.length).toBeGreaterThan(30)
      expect(table).toMatch(/^[a-z_]+$/)
    }
  })

  /**
   * #2151.70 (16/09/2026) — LA GARDE QUI ÉTAIT AVEUGLE AUX TABLES `user_id`.
   *
   * `notifications` n'était NI dans `DEMO_SEEDED_TABLES` NI dans
   * `DEMO_INTENTIONALLY_EMPTY`, et la garde ci-dessus ne pouvait pas le voir :
   * elle ne lisait que `DEMO_PURGE_TABLES` (`workspace_id`), et `notifications`
   * est scopée `user_id` (`DEMO_PURGE_USER_TABLES`). C'était une garde
   * AVEUGLE, pas une exemption. Les trois tests ci-dessous prouvent que
   * l'élargissement tient : la garde sait dire NON (retirer `notifications`
   * de `DEMO_SEEDED_TABLES` la fait ressortir), elle LIT un corpus non vide
   * (`DEMO_PURGE_USER_TABLES` existe et n'est pas vide), et elle n'attrape pas
   * ce qu'elle ne vise pas (un témoin légitimement vide, `user_mfa`, reste
   * classé et ne remonte jamais comme un oubli).
   */
  describe('la garde voit maintenant les tables scopées par UTILISATEUR, pas seulement par espace', () => {
    it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
      expect(DEMO_PURGE_USER_TABLES.length).toBeGreaterThan(0)
    })

    it('classe CHAQUE table scopée `user_id` : seedée, ou vide à dessein avec sa raison', () => {
      const seeded = new Set<string>(DEMO_SEEDED_TABLES)
      const empty = new Set<string>(Object.keys(DEMO_INTENTIONALLY_EMPTY))
      const unclassified = DEMO_PURGE_USER_TABLES.filter(table => !seeded.has(table) && !empty.has(table))
      expect(unclassified).toEqual([])
    })

    it('sait dire NON — retirer `notifications` de la liste seedée la fait ressortir NON CLASSÉE', () => {
      // La preuve que la garde MORD : c'est l'état exact d'AVANT ce lot —
      // `notifications` n'était nulle part dans les deux listes.
      const seededWithoutBell = new Set<string>(DEMO_SEEDED_TABLES.filter(table => table !== 'notifications'))
      const empty = new Set<string>(Object.keys(DEMO_INTENTIONALLY_EMPTY))
      const unclassified = DEMO_PURGE_USER_TABLES.filter(table => !seededWithoutBell.has(table) && !empty.has(table))
      expect(unclassified).toEqual(['notifications'])
    })

    it('n’attrape pas ce qu’elle ne vise pas — une table légitimement vide reste verte', () => {
      // Témoin : `user_mfa` est classée VIDE À DESSEIN (un secret TOTP fictif
      // verrouillerait tous les occupants de la salle). Elle ne doit jamais
      // remonter comme non classée, même après l'élargissement.
      const seeded = new Set<string>(DEMO_SEEDED_TABLES)
      const empty = new Set<string>(Object.keys(DEMO_INTENTIONALLY_EMPTY))
      const unclassified = DEMO_PURGE_USER_TABLES.filter(table => !seeded.has(table) && !empty.has(table))
      expect(unclassified).not.toContain('user_mfa')
      expect(empty.has('user_mfa')).toBe(true)
    })
  })

  describe('contenu du dossier — la garde qui aurait attrapé « Aucun site identifié »', () => {
    it('renseigne CHAQUE clé du contrat dans au moins un dossier, ou dit pourquoi non', () => {
      const uncovered = analysisContractKeys().filter(
        key => !filledInSomeSeededAccount(key) && !(key in DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT),
      )

      // Si ce test échoue, une donnée que l'IA sait produire n'apparaît nulle
      // part en démonstration : l'écran qui la lit s'ouvrira vide devant un
      // prospect. Deux issues, jamais une troisième :
      //  - la renseigner dans au moins un des trois dossiers ;
      //  - l'ajouter à `DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT` avec sa raison.
      expect(uncovered).toEqual([])
    })

    it('ne garde pas de justification périmée — une clé disparue du contrat ment sur la couverture', () => {
      const contract = new Set(analysisContractKeys())
      const stale = Object.keys(DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT).filter(key => !contract.has(key))
      expect(stale).toEqual([])
    })

    it('ne justifie pas une absence qui n’en est plus une', () => {
      const contradictory = Object.keys(DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT).filter(filledInSomeDossier)
      expect(contradictory).toEqual([])
    })

    it('exige une raison NON VIDE pour chaque clé laissée de côté', () => {
      for (const reason of Object.values(DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT)) {
        expect(reason.length).toBeGreaterThan(30)
      }
    })
  })
})

/**
 * La maille des COLONNES du kanban des besoins.
 *
 * Elle existe parce que la garde par table ne pouvait pas la voir : `project_needs`
 * était classée SEEDÉE — et elle l'était — avec UN rôle dans UN état. Le kanban
 * s'ouvrait donc sur neuf colonnes vides sur dix, et le pied contextuel de chaque
 * colonne ne pouvait se voir changer nulle part. Une table remplie ne dit rien de
 * la RÉPARTITION de ce qu'elle contient.
 */
describe('couverture des colonnes du kanban des besoins', () => {
  /** Les états que le jeu de données occupe réellement — LU, jamais recopié. */
  function seededColumns(): Set<string> {
    return new Set<string>([DEMO_FLAGSHIP_NEED.status, ...DEMO_DELIVERY_CLIENT.openNeeds.map(need => need.status)])
  }

  /** Le prédicat de la garde, isolé pour qu'on puisse le prendre en défaut. */
  function unclassifiedColumns(seeded: Set<string>, empty: Readonly<Record<string, string>>): string[] {
    return NEED_OPEN_STATUSES.filter(status => !seeded.has(status) && !(status in empty))
  }

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    // La contrepartie obligatoire de toute garde du dépôt. Sans elle, un import
    // cassé viderait `NEED_OPEN_STATUSES` et le test suivant comparerait deux
    // listes vides en se déclarant satisfait.
    expect(NEED_OPEN_STATUSES.length).toBeGreaterThanOrEqual(9)
    expect(seededColumns().size).toBeGreaterThanOrEqual(3)
  })

  it('classe CHAQUE colonne ouverte : occupée par un rôle, ou vide avec sa raison', () => {
    // Deux issues, jamais une troisième : seeder un rôle dans cet état, ou
    // inscrire la colonne dans `DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY`
    // avec une raison qui tient devant quelqu'un qui présente le produit.
    expect(unclassifiedColumns(seededColumns(), DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY)).toEqual([])
  })

  it('sait dire NON — une colonne ni occupée ni justifiée est signalée', () => {
    // La seconde contrepartie : prouver que la garde REFUSE. Sans elle, un
    // prédicat toujours vrai passerait pour une couverture complète.
    expect(unclassifiedColumns(new Set(['to_qualify']), {}).length).toBeGreaterThan(0)
  })

  it('ne justifie pas une colonne qui est en fait remplie', () => {
    const contradictory = Object.keys(DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY).filter(status =>
      seededColumns().has(status),
    )
    expect(contradictory).toEqual([])
  })

  it('ne garde pas de justification périmée — un état hors du kanban ment sur la couverture', () => {
    const known = new Set<string>(NEED_OPEN_STATUSES)
    const stale = Object.keys(DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY).filter(status => !known.has(status))
    expect(stale).toEqual([])
  })

  it('exige une raison NON VIDE pour chaque colonne laissée vide', () => {
    for (const [status, reason] of Object.entries(DEMO_NEED_KANBAN_COLUMNS_INTENTIONALLY_EMPTY)) {
      expect(status).toMatch(/^[a-z_]+$/)
      expect(reason.length).toBeGreaterThan(60)
    }
  })

  it('occupe au moins trois colonnes, et fait travailler les DEUX mesures du pied de carte', () => {
    // Le pied d'une carte n'a que deux choses à dire, et elles se lisent sur
    // deux mesures distinctes : l'âge dans l'étape et le nombre de profils
    // positionnés. Une salle où toutes les colonnes reposeraient sur la même
    // mesure montrerait le même pied partout — l'écran serait rempli sans que
    // sa mécanique se voie.
    expect(seededColumns().size).toBeGreaterThanOrEqual(3)

    const needs = DEMO_DELIVERY_CLIENT.openNeeds
    // Des rôles qui n'ont QUE leur âge à raconter : rien n'y est positionné, et
    // c'est un vrai zéro.
    const ageOnly = needs.filter(need => need.shortlist.length === 0)
    expect(ageOnly.length).toBeGreaterThanOrEqual(1)
    for (const need of ageOnly) expect(need.status_changed_days_ago).toBeGreaterThan(0)

    // …et des rôles qui ont des PROFILS à raconter, dans au moins deux colonnes
    // différentes — sinon la seconde mesure ne se voit qu'à un seul endroit.
    const withProfiles = needs.filter(need => need.shortlist.length > 0)
    expect(new Set(withProfiles.map(need => need.status)).size).toBeGreaterThanOrEqual(2)
  })

  it('ne déclare MUETTE aucune bulle que ces besoins suffisent à déclencher', () => {
    // `needs_without_matching` (laura-detector.ts) : au moins TROIS besoins
    // ouverts, et aucune shortlist composée. `shortlists` est vide à dessein —
    // composer la sélection EST le geste de la démonstration — donc la seconde
    // moitié est acquise, et la première l'est dès que la salle porte trois
    // rôles ouverts. La déclarer muette serait faux.
    const NEEDS_BEFORE_MATCHING = 3
    const open = [DEMO_FLAGSHIP_NEED.status, ...DEMO_DELIVERY_CLIENT.openNeeds.map(need => need.status)].filter(
      status => (NEED_OPEN_STATUSES as readonly string[]).includes(status),
    )
    expect(open.length).toBeGreaterThanOrEqual(NEEDS_BEFORE_MATCHING)
    expect(DEMO_INTENTIONALLY_EMPTY['shortlists']).toBeDefined()
    expect(DEMO_LAURA_BUBBLES_SILENT['needs_without_matching']).toBeUndefined()
    expect(DEMO_LAURA_BUBBLES_REACHABLE['needs_without_matching']).toBeDefined()
  })
})

/**
 * Un seed doit avoir la FORME que l'écran lit.
 *
 * Trouvé en recette live le 23/08 : l'analyse ajoutée au client d'exemple
 * écrivait `technology_stack: ['kubernetes', …]` — de simples chaînes — quand
 * les cinq comptes réels et le lecteur du brief attendent
 * `{ name, usage, maturity }`. Le lecteur fait `item['name']`, qui vaut
 * `undefined` sur une chaîne : la pile technique était donc VIDE à l'écran, et
 * l'anti-conseil restait muet sur le seul compte censé le montrer.
 *
 * Rien ne tombait : la table était seedée, la clé présente, le type `unknown[]`
 * satisfait. C'est la version « forme » du défaut « lire et écrire dans deux
 * tables » — la donnée est là, personne ne peut la lire.
 */
describe('la forme du seed est celle que l’écran lit', () => {
  // Décision Louis 04/10/2026 — le client fictif qui portait sa propre analyse a
  // quitté la salle : la forme se vérifie sur les VRAIS dossiers.
  const stacks = DEMO_DOSSIERS.flatMap(dossier => {
    const stack = dossier.account.raw_analysis['technology_stack']
    return Array.isArray(stack) ? (stack as unknown[]) : []
  })
  const jobs = DEMO_DOSSIERS.flatMap(dossier => {
    const list = dossier.account.raw_analysis['it_job_signals']
    return Array.isArray(list) ? (list as { title?: unknown }[]) : []
  })

  it('la pile technique des dossiers est faite d’objets nommés', () => {
    expect(stacks.length).toBeGreaterThan(0)
    for (const entry of stacks) {
      expect(typeof entry).toBe('object')
      const name = (entry as { name?: unknown }).name
      expect(typeof name).toBe('string')
      expect(String(name).trim().length).toBeGreaterThan(0)
    }
  })

  it('les offres semées portent un intitulé — c’est le seul champ que le brief lit', () => {
    for (const job of jobs) expect(String(job.title ?? '').trim().length).toBeGreaterThan(0)
  })

  /**
   * ⚠️ La barrière d'achat doit avoir la forme que L'ONGLET ACCÈS lit : le
   * service la valide contre `accessBarrierSchema` et sert `null` quand elle ne
   * se lit pas — une forme partielle rend l'écran muet devant un prospect.
   */
  it('la barrière de CHAQUE dossier se lit contre le contrat — proxies compris', () => {
    const barriers: unknown[] = DEMO_DOSSIERS.map(dossier => dossier.account.raw_analysis['access_barrier']).filter(
      value => value != null,
    )
    // Le corpus, prouvé NON VIDE : sans cette ligne, un import cassé ferait
    // passer la garde au vert en ne validant rien.
    expect(barriers.length).toBeGreaterThanOrEqual(2)
    for (const barrier of barriers) {
      const parsed = accessBarrierSchema.safeParse(barrier)
      expect(parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join('.'))).toEqual([])
    }
  })
})

/**
 * La quatrième maille : les BULLES de Laura.
 *
 * Elle existe parce que les trois autres ne pouvaient pas la voir. Un lot a fait
 * passer les détecteurs de huit à vingt-cinq sans ajouter une seule table — la
 * garde par table est restée verte, et aucune des dix-sept nouvelles bulles
 * n'aurait pu apparaître devant un prospect. Une intervention ne lit pas une
 * table à elle : elle lit des comptages sur les tables des autres.
 *
 * ⚠️ Ce que cette garde NE dit pas : qu'une bulle s'affichera. Détecter n'est
 * pas parler — le plafond, l'unicité par écran et les vingt minutes d'écart
 * arbitrent ensuite.
 */
describe('couverture des bulles de Laura en démonstration', () => {
  const catalogue = LAURA_INTERVENTIONS.map(intervention => intervention.key)

  it('lit un catalogue NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    // La contrepartie obligatoire de toute garde du dépôt : prouver qu'elle a
    // un corpus. Sans elle, un import cassé rendrait `catalogue` vide et les
    // trois tests suivants passeraient en ne comparant rien à rien.
    expect(catalogue.length).toBeGreaterThanOrEqual(30)
    expect(new Set(catalogue).size).toBe(catalogue.length)
  })

  it('classe CHAQUE bulle du catalogue : atteignable en démo, ou muette avec sa raison', () => {
    const reachable = new Set(Object.keys(DEMO_LAURA_BUBBLES_REACHABLE))
    const silent = new Set(Object.keys(DEMO_LAURA_BUBBLES_SILENT))

    const unclassified = catalogue.filter(key => !reachable.has(key) && !silent.has(key))

    // Si ce test échoue, une bulle a été ajoutée au catalogue sans qu'on ait dit
    // ce qu'un visiteur de la démonstration en voit. Deux issues, jamais une
    // troisième :
    //  - seeder de quoi la déclencher (+ `DEMO_LAURA_BUBBLES_REACHABLE`) ;
    //  - l'inscrire dans `DEMO_LAURA_BUBBLES_SILENT` avec une raison qui tient
    //    devant quelqu'un qui présente le produit.
    expect(unclassified).toEqual([])
  })

  it('ne garde pas de justification périmée — une clé disparue du catalogue ment sur la couverture', () => {
    const known = new Set(catalogue)
    const stale = [...Object.keys(DEMO_LAURA_BUBBLES_REACHABLE), ...Object.keys(DEMO_LAURA_BUBBLES_SILENT)].filter(
      key => !known.has(key),
    )
    expect(stale).toEqual([])
  })

  it('ne classe jamais une bulle dans les deux à la fois', () => {
    const both = Object.keys(DEMO_LAURA_BUBBLES_REACHABLE).filter(key => key in DEMO_LAURA_BUBBLES_SILENT)
    expect(both).toEqual([])
  })

  it('exige une raison NON VIDE des deux côtés — « atteignable » sans son alimentation ne se relit pas', () => {
    for (const [key, reason] of Object.entries({
      ...DEMO_LAURA_BUBBLES_REACHABLE,
      ...DEMO_LAURA_BUBBLES_SILENT,
    })) {
      expect(key).toMatch(/^[a-z0-9_]+$/)
      // Une raison d'un mot (« sans objet ») ne se relit pas six mois plus tard.
      expect(reason.length).toBeGreaterThan(60)
    }
  })

  it('MESURE que la salle alimente mission_start_not_ready et tait mission_day_one_unconfirmed (#2409.8 / #2409.9)', () => {
    const PRE_START = new Set<string>(MISSION_PRE_START_STATUSES)
    const m = DEMO_START_READINESS_MISSION
    // #2409.8 — dans la fenêtre, avant démarrage, et PAS prête : la bulle se pose.
    expect(PRE_START.has(m.status)).toBe(true)
    expect(m.starts_in_days).toBeGreaterThanOrEqual(0)
    expect(m.starts_in_days).toBeLessThanOrEqual(MISSION_START_ANNOUNCE_WINDOW_DAYS)
    const readiness = computeMissionStartReadiness({
      declared: m.checks.map(c => ({
        key: c.item,
        proof: c.proof,
        confirmedBy: 'owner',
        confirmedAt: new Date(Date.now() - c.confirmed_days_ago * 86_400_000).toISOString(),
      })),
      data: { consultantAssigned: true, startDate: '2099-01-01', dailyRate: m.daily_rate },
      now: new Date(),
    })
    expect(readiness.verdict).not.toBe('ready')
    // #2409.9 — aucune mission non démarrée dont la date de début est arrivée
    // (J0 à J+N) : la bulle d'arrivée se tait, et le prédicat sait dire NON.
    const startedUnconfirmed = (days: number) => days <= 0 && days >= -MISSION_DAY_ONE_CONFIRM_WINDOW_DAYS
    expect(startedUnconfirmed(m.starts_in_days)).toBe(false)
    expect(startedUnconfirmed(0)).toBe(true)
  })

  it('MESURE le silence de mission_active_past_end_date au lieu de le supposer (#1937.4)', () => {
    // La raison écrite au registre dit « la salle n'en porte AUCUNE ». Sans ce
    // test, ce serait une affirmation : une mission repoussée dans le passé par
    // un lot futur laisserait la justification en place et la salle
    // annoncerait à un prospect que ses propres données se contredisent.
    //
    // Le prédicat est LE MÊME que celui de la sonde (`activeMissionsPastEndDate`) :
    // état en cours ET échéance connue ET passée. Une mission sans échéance
    // (`ends_in_days: null`) n'est pas contradictoire, et la salle en porte
    // trois — c'est le témoin voisin légitime que cette garde ne doit PAS
    // attraper.
    const RUNNING = new Set(['active', 'onboarding'])
    const contradictory = DEMO_DELIVERY_CLIENT.missions.filter(
      mission => RUNNING.has(mission.status) && mission.ends_in_days !== null && mission.ends_in_days < 0,
    )
    expect(contradictory.map(mission => mission.label)).toEqual([])

    // Elle LIT quelque chose : des missions en cours existent, et au moins une
    // porte une échéance connue. Sans ces deux faits, « zéro contradiction »
    // serait le vert d'un corpus vide.
    const running = DEMO_DELIVERY_CLIENT.missions.filter(mission => RUNNING.has(mission.status))
    expect(running.length).toBeGreaterThanOrEqual(3)
    expect(running.some(mission => mission.ends_in_days !== null)).toBe(true)
    expect(running.some(mission => mission.ends_in_days === null)).toBe(true)

    // Elle sait dire NON : la même mission, l'échéance repoussée dans le passé,
    // et le prédicat la nomme.
    const [first] = running
    const broken = [...running.slice(1), { ...first, ends_in_days: -3 }]
    expect(
      broken.filter(mission => RUNNING.has(mission.status) && mission.ends_in_days !== null && mission.ends_in_days < 0)
        .length,
    ).toBe(1)
  })

  it('MESURE que payment_overdue_30_days est ACTIVE dans la salle, jamais supposée muette (#3192.2)', () => {
    // La raison écrite au registre disait « les treize mois facturés portent
    // TOUS leur `paid_at` » — devenu faux depuis les deux impayées ajoutées à
    // `demo-dataset.ts` pour le seau « En retard » de l'écran Encaissements.
    // Ce test rejoue le prédicat EXACT de la sonde (`invoicesOverdueBeyondGrace`,
    // `laura-probe.service.ts`) sur `demoInvoiceHistory`, pour que ce registre ne
    // puisse plus mentir en silence si le seed change à nouveau.
    const now = Date.now()
    const overdueDays = INTERVENTION_THRESHOLDS.paymentOverdueDays
    const graceCutoff = now - overdueDays * 24 * 60 * 60 * 1000
    const overdue = demoInvoiceHistory(now).filter(invoice => {
      const settled =
        invoice.paidAt !== null &&
        !(
          invoice.paidAmountCents !== null &&
          invoice.invoicedAmountCents !== null &&
          invoice.paidAmountCents < invoice.invoicedAmountCents
        )
      if (settled) return false
      if (new Date(invoice.dueOn).getTime() >= graceCutoff) return false
      return invoice.disputedAt === null || invoice.disputeResolvedAt !== null
    })
    expect(overdue.length).toBeGreaterThanOrEqual(1)
    expect(DEMO_LAURA_BUBBLES_REACHABLE['payment_overdue_30_days']).toBeDefined()
    expect(DEMO_LAURA_BUBBLES_SILENT['payment_overdue_30_days']).toBeUndefined()

    // Témoin : une facture réglée (comme les treize autres de la salle, sur
    // quatorze au total) ne compte pas — la garde sait dire NON.
    const all = demoInvoiceHistory(now)
    expect(all.length).toBeGreaterThan(overdue.length)
    expect(all.filter(invoice => invoice.paidAt !== null).some(invoice => overdue.includes(invoice))).toBe(false)
  })

  it('nomme dans la salle les trois bulles que le jeu de données alimente vraiment', () => {
    // Elles sont ici et pas ailleurs parce qu'elles reposent sur des LIGNES
    // seedées (une affectation qui finit, une affectation finie, une mission
    // terminée) — pas sur une absence. Les retirer du seed sans retirer cette
    // ligne ferait échouer la garde de forme d'à côté, dans `demo-seed.service.spec.ts`.
    for (const key of ['consultant_free_soon', 'long_bench', 'mission_ended_without_feedback']) {
      expect(DEMO_LAURA_BUBBLES_REACHABLE[key]).toBeDefined()
    }
  })
})

/**
 * La cinquième maille : les ÉTATS d'un relevé d'activité.
 *
 * Elle existe pour la même raison que la maille des colonnes du kanban, et le
 * défaut qu'elle attrape est exactement le même défaut : `mission_timesheets`
 * est remplie par le seed depuis toujours, la garde par table est donc verte —
 * pendant qu'aucune ligne de la salle ne porte l'état REJETÉ. Une table remplie
 * ne dit rien de la RÉPARTITION de ce qu'elle contient, et sur cet écran-là
 * c'est la répartition qui est le sujet.
 *
 * Le rejet a DEUX moitiés, et l'écran les distingue par le statut :
 *  - « rejeté, en attente de correction » — le statut le dit ;
 *  - « rejeté puis redéposé » — le statut est repassé à `submitted`, la TRACE
 *    reste. C'est la moitié qu'on oublie, et sans elle la seule chose qu'un
 *    prospect verrait du motif, c'est qu'il disparaît quand on corrige.
 */
describe('couverture des états du relevé d’activité', () => {
  type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]

  /**
   * Les missions que l'écran REGARDE sur le mois précédent.
   *
   * La requête borne à `m.status <> 'draft'` et `m.ends_on >= <1er du mois
   * précédent>`. Le jeu ne porte qu'une mission finie, à −76 jours, et cette
   * valeur est choisie pour tomber hors fenêtre QUEL QUE SOIT le jour du mois
   * (voir son commentaire dans `demo-dataset.ts`) : la seule borne qui joue
   * ici est donc la DATE.
   *
   * ⚠️ La borne `m.status <> 'draft'` n'est pas recopiée : aucune mission du
   * jeu n'est en brouillon, et `tsc` refuse la comparaison — le type des
   * statuts seedés vaut `'active' | 'ended'`. L'écrire quand même donnerait
   * une condition toujours vraie, c'est-à-dire une garde qui a l'air de
   * vérifier quelque chose.
   */
  function visibleOnPreviousMonth(mission: DemoMission): boolean {
    return mission.ends_in_days === null || mission.ends_in_days > 0
  }

  /** Les états réellement atteignables dans la salle — LUS, jamais recopiés. */
  function seededStates(): Set<string> {
    const states = new Set<string>()
    for (const mission of DEMO_DELIVERY_CLIENT.missions) {
      if (!visibleOnPreviousMonth(mission)) continue
      if (mission.timesheet) {
        states.add(mission.timesheet.status)
        continue
      }
      // Sans relevé, c'est `statusWithoutRow` qui décide — et le mois précédent
      // est TOUJOURS clos, donc « manquant » et jamais « attendu ».
      states.add(expectsTimesheet(mission.contract_kind) ? 'missing' : 'not_required')
    }
    return states
  }

  /** Le prédicat de la garde, isolé pour qu'on puisse le prendre en défaut. */
  function unclassifiedStates(seeded: Set<string>, absent: Readonly<Record<string, string>>): string[] {
    return TIMESHEET_STATUSES.filter(status => !seeded.has(status) && !(status in absent))
  }

  /** Les relevés du jeu, sans les missions qui n'en portent pas. */
  function timesheets(): NonNullable<DemoMission['timesheet']>[] {
    return DEMO_DELIVERY_CLIENT.missions
      .filter(visibleOnPreviousMonth)
      .map(mission => mission.timesheet)
      .filter((sheet): sheet is NonNullable<DemoMission['timesheet']> => sheet !== null)
  }

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    // La contrepartie obligatoire. Sans elle, un import cassé viderait
    // `TIMESHEET_STATUSES` et le test suivant comparerait deux listes vides en
    // se déclarant satisfait.
    expect(TIMESHEET_STATUSES.length).toBeGreaterThanOrEqual(8)
    expect(seededStates().size).toBeGreaterThanOrEqual(4)
    expect(timesheets().length).toBeGreaterThanOrEqual(4)
  })

  it('classe CHAQUE état du relevé : atteignable dans la salle, ou absent avec sa raison', () => {
    expect(unclassifiedStates(seededStates(), DEMO_TIMESHEET_STATES_INTENTIONALLY_ABSENT)).toEqual([])
  })

  it('sait dire NON — un état ni atteignable ni justifié est signalé', () => {
    // La seconde contrepartie : prouver que la garde REFUSE. Sans elle, un
    // prédicat toujours vrai passerait pour une couverture complète.
    expect(unclassifiedStates(new Set(['validated']), {}).length).toBeGreaterThan(0)
  })

  it('ne justifie pas un état qui est en fait atteignable', () => {
    const contradictory = Object.keys(DEMO_TIMESHEET_STATES_INTENTIONALLY_ABSENT).filter(status =>
      seededStates().has(status),
    )
    expect(contradictory).toEqual([])
  })

  it('ne garde pas de justification périmée — un état hors du contrat ment sur la couverture', () => {
    const known = new Set<string>(TIMESHEET_STATUSES)
    const stale = Object.keys(DEMO_TIMESHEET_STATES_INTENTIONALLY_ABSENT).filter(status => !known.has(status))
    expect(stale).toEqual([])
  })

  it('exige une raison NON VIDE pour chaque état laissé de côté', () => {
    for (const [status, reason] of Object.entries(DEMO_TIMESHEET_STATES_INTENTIONALLY_ABSENT)) {
      expect(status).toMatch(/^[a-z_]+$/)
      expect(reason.length).toBeGreaterThan(60)
    }
  })

  /**
   * LES DEUX MOITIÉS DU REJET.
   *
   * Le statut seul ne les distingue pas : « rejeté puis redéposé » EST un
   * `submitted`, et ne se reconnaît qu'à la trace qui lui survit. La maille
   * par état ne peut donc pas tenir cette moitié-là — celle-ci s'en charge.
   */
  it('montre un relevé REJETÉ, motif à l’appui', () => {
    const rejected = timesheets().filter(sheet => sheet.status === 'rejected')
    expect(rejected.length).toBeGreaterThanOrEqual(1)
    for (const sheet of rejected) {
      expect(typeof sheet.rejected_days_ago).toBe('number')
      expect(typeof sheet.rejection_reason).toBe('string')
    }
  })

  it('montre un relevé rejeté PUIS REDÉPOSÉ — la trace survit au redépôt', () => {
    // ⚠️ Le prédicat teste la PRÉSENCE d'un nombre, jamais `!== null` : sur un
    // jeu de données qui ne porte pas encore le champ, `undefined !== null` est
    // VRAI et la garde se déclare satisfaite par les relevés validés. Elle est
    // passée au vert exactement comme ça, sur ce fichier, avant d'être écrite
    // correctement.
    const resubmitted = timesheets().filter(
      sheet => sheet.status !== 'rejected' && typeof sheet.rejected_days_ago === 'number',
    )
    expect(resubmitted.length).toBeGreaterThanOrEqual(1)
    // C'est le STATUT qui fait basculer le libellé de `TimesheetsPage` entre
    // « rejeté le … » et « rejeté le …, puis redéposé ». Un statut de
    // `AWAITING_TIMESHEET_STATUSES` ne raconterait pas un redépôt.
    for (const sheet of resubmitted) expect(sheet.status).toBe('submitted')
  })

  it('fait voyager la date de rejet et son MOTIF ensemble — la base refuse le couple dépareillé', () => {
    // `mission_timesheets_rejection_reason_check` : une date sans motif est
    // rejetée en BASE. Un jeu de données qui l'oublierait ferait tomber
    // `POST /demo/session`, pas un test.
    for (const sheet of timesheets()) {
      expect(sheet.rejected_days_ago === null).toBe(sheet.rejection_reason === null)
      if (sheet.rejected_days_ago === null) continue
      expect(sheet.rejected_days_ago).toBeGreaterThan(0)
      expect((sheet.rejection_reason ?? '').trim().length).toBeGreaterThan(20)
    }
  })

  it('écrit des motifs VRAISEMBLABLES, et qui ne nomment aucun mois', () => {
    // Le mois du relevé est calculé au seed (le mois PRÉCÉDENT) : il change à
    // chaque visite. Un motif qui nomme « juin » serait faux onze mois sur
    // douze devant un prospect.
    const MONTHS = /janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i
    for (const sheet of timesheets()) {
      const reason = sheet.rejection_reason
      if (reason === null) continue
      expect(reason).not.toMatch(MONTHS)
      expect(reason).not.toMatch(/lorem|test|todo|xxx/i)
      // Une phrase, pas une étiquette.
      expect(reason.split(/\s+/).length).toBeGreaterThan(6)
    }
  })

  it('rejette un relevé qui tombe PILE — sinon on ne saurait pas ce qui bloque', () => {
    // `blocksInvoicing: status === 'rejected' || gapBlocksInvoicing(…)`. Avec un
    // écart, la ligne bloquerait des DEUX côtés et la démonstration ne
    // montrerait pas que le rejet bloque à lui seul.
    const rejected = timesheets().filter(sheet => sheet.status === 'rejected')
    for (const sheet of rejected) {
      expect(sheet.days).toBe(sheet.expected_days)
      expect(sheet.gap_explanation).toBeNull()
    }
  })
})

/**
 * Les deux colonnes qui étaient LUES et écrites NULLE PART.
 *
 * `requires_po` et `partner_commission_daily_cents` existaient en base, étaient
 * lues par le produit — le bloqueur « bon de commande exigé et absent » d'un
 * côté, `trueDailyCostCents` de l'autre — et aucun chemin ne les écrivait. Le
 * bloqueur ne se déclenchait donc sur aucun espace, et la marge des canaux
 * `partner` et `subcontracting` était structurellement muette.
 *
 * ⚠️ Cette garde-ci ne vérifie pas que les colonnes sont REMPLIES : la garde par
 * table le fait déjà, et elle serait restée verte pendant que les deux valeurs
 * ne produisaient rien à l'écran. Elle vérifie que le jeu fait TRAVAILLER les
 * deux calculs qui les lisent — un bloqueur qui se lève, un écart de marge qui
 * se chiffre. C'est la leçon « un semis doit lire comme l'écran » : une colonne
 * seedée dont aucun calcul ne change de réponse est une capture d'écran vide
 * avec des données derrière.
 */
describe('couverture des conditions commerciales — bon de commande et commission', () => {
  type DemoMission = (typeof DEMO_DELIVERY_CLIENT.missions)[number]
  const missions = DEMO_DELIVERY_CLIENT.missions

  /**
   * Les jours que la marge par canal RETIENT.
   *
   * La requête joint les relevés du mois précédent en écartant `expected`,
   * `missing` et `not_required` : un mois que personne n'a déclaré ne pèse pas
   * dans une moyenne pondérée par les jours. Recopier ce filtre ici est le prix
   * à payer pour que la garde lise comme l'écran — un seed qui filtre autrement
   * que son lecteur est un défaut connu de ce dépôt.
   */
  function countedDays(mission: DemoMission): number | null {
    if (!mission.timesheet) return null
    return (['expected', 'missing', 'not_required'] as string[]).includes(mission.timesheet.status)
      ? null
      : mission.timesheet.days
  }

  it('lit un corpus NON VIDE — et les deux champs ont la FORME que le semis écrit', () => {
    // Une garde qui ne lit rien passe au vert sur du vide ; et une valeur de la
    // mauvaise forme (une chaîne pour un booléen) traverse le semis sans que
    // rien ne tombe, puis vide l'écran.
    expect(missions.length).toBeGreaterThanOrEqual(6)
    for (const mission of missions) {
      expect(typeof mission.requires_po).toBe('boolean')
      const commission = mission.partner_commission_daily_cents
      expect(commission === null || Number.isInteger(commission)).toBe(true)
      if (commission !== null) expect(commission).toBeGreaterThanOrEqual(0)
    }
  })

  it('fait travailler les DEUX réponses du bon de commande', () => {
    // Un jeu où toutes les missions exigent un bon de commande ne montrerait
    // pas que le drapeau se règle par MISSION.
    expect(missions.some(mission => mission.requires_po)).toBe(true)
    expect(missions.some(mission => !mission.requires_po)).toBe(true)
  })

  it('DÉCLENCHE le bloqueur « bon de commande exigé et absent », et le montre satisfait', () => {
    // Exigé et manquant : sans cette ligne, la colonne serait remplie et le
    // bloqueur jamais visible — le défaut d'origine, avec des données par-dessus.
    expect(missions.some(mission => mission.requires_po && mission.po_number === null)).toBe(true)
    // Exigé et fourni : sans celle-là, un prospect conclurait que cocher la case
    // bloque la facturation.
    expect(missions.some(mission => mission.requires_po && mission.po_number !== null)).toBe(true)
  })

  it('ne pose le bloqueur QUE sur une mission déjà bloquée — les deux « prêtes » le restent', () => {
    // Le poser sur une mission prête viderait l'écran « Prêt à facturer » de la
    // salle : la démonstration perdrait un état pour en gagner un autre.
    for (const mission of missions) {
      if (!mission.requires_po) continue
      if (mission.po_number !== null) continue
      // ⚠️ Les deux membres sont lus dans des `const` SÉPARÉES : écrits dans un
      // seul `||`, le second est évalué avec une mission déjà rétrécie par le
      // premier, et `tsc` conclut `never` sur cette union de littéraux — la
      // garde ne compilerait plus alors qu'elle a raison.
      const withoutTimesheet = mission.timesheet === null
      const withoutBillingContact = mission.billing_contact === null
      expect(withoutTimesheet || withoutBillingContact).toBe(true)
    }
  })

  it('rend le « coût de l’intermédiation » MESURABLE — c’est ce que la commission sert à calculer', () => {
    // La salle ne portait qu'une mission `partner`, sans coût chargé et sans
    // relevé : la ligne `partner` valait « non mesurée » et la tuile disait
    // pour toujours qu'elle ne savait pas. Un écran livré, juste, et vide.
    const byChannel = marginByChannel(
      missions.map(mission => ({
        channel: mission.channel,
        dailyRateCents: mission.daily_rate === null ? null : Math.round(mission.daily_rate * 100),
        // Le coût RÉEL, commission comprise — exactement ce que fait
        // `RevenueService.marginByChannel`.
        loadedDailyCostCents: trueDailyCostCents(
          mission.channel,
          mission.loaded_daily_cost_cents,
          mission.partner_commission_daily_cents,
        ),
        days: countedDays(mission),
      })),
    )
    const direct = byChannel.find(entry => entry.channel === 'direct')
    const partner = byChannel.find(entry => entry.channel === 'partner')
    expect(direct?.marginPercent).not.toBeNull()
    expect(partner?.marginPercent).not.toBeNull()
    expect(intermediationCost(byChannel)).not.toBeNull()

    // Et la ligne `partner` garde sa mission NON mesurable, comptée à part :
    // c'est le second état que l'écran doit savoir montrer.
    expect(partner?.missions).toBeGreaterThanOrEqual(1)
    expect(partner?.unmeasured).toBeGreaterThanOrEqual(1)
  })

  it('montre le PORTAGE, et le montre CHIFFRÉ — sinon le canal neuf s’ouvre muet en démonstration', () => {
    // Un canal ajouté au contrat sans une mission qui le porte est le défaut
    // que ce dépôt connaît par cœur : du code juste, calculé, testé, que rien
    // n'alimente. L'écran « Marge par canal » afficherait une cinquième ligne
    // vide devant un prospect, ce qui est PIRE que quatre lignes — on aurait
    // ajouté une colonne pour montrer un trou.
    //
    // Il lui faut des frais de gestion SAISIS : sur un canal intermédié, une
    // commission inconnue rend le coût inconnu (`trueDailyCostCents`), et la
    // ligne serait « non mesurée » — juste, mais toujours muette.
    const byChannel = marginByChannel(
      missions.map(mission => ({
        channel: mission.channel,
        dailyRateCents: mission.daily_rate === null ? null : Math.round(mission.daily_rate * 100),
        loadedDailyCostCents: trueDailyCostCents(
          mission.channel,
          mission.loaded_daily_cost_cents,
          mission.partner_commission_daily_cents,
        ),
        days: countedDays(mission),
      })),
    )
    const portage = byChannel.find(entry => entry.channel === 'portage')
    expect(portage?.missions).toBeGreaterThanOrEqual(1)
    expect(portage?.marginPercent).not.toBeNull()

    // Et il ne s'est pas fabriqué en VIDANT une autre ligne : les trois canaux
    // que la salle montrait déjà sont toujours portés. Un canal neuf qui
    // déshabille un canal existant échange un trou contre un autre.
    //
    // ⚠️ La comparaison porte sur missions + non mesurées, pas sur la marge :
    // la ligne `unknown` de la salle est le FORFAIT, qui n'a pas de TJM et
    // reste donc non chiffrable à dessein. Exiger sa marge inventerait un
    // besoin que le produit refuse.
    const borne = (['direct', 'partner', 'unknown'] as const).map(channel => {
      const line = byChannel.find(entry => entry.channel === channel)
      return { channel, lines: (line?.missions ?? 0) + (line?.unmeasured ?? 0) }
    })
    expect(borne.filter(entry => entry.lines === 0)).toEqual([])
    expect(byChannel.find(entry => entry.channel === 'direct')?.marginPercent).not.toBeNull()
  })

  it('SAIT DIRE NON — sans commission saisie, l’écart n’est plus chiffrable', () => {
    // La preuve que la garde mord : on retire la seule commission du jeu et
    // l'indicateur redevient muet. C'est l'état exact de la salle avant ce lot.
    const byChannel = marginByChannel(
      missions.map(mission => ({
        channel: mission.channel,
        dailyRateCents: mission.daily_rate === null ? null : Math.round(mission.daily_rate * 100),
        loadedDailyCostCents: trueDailyCostCents(mission.channel, mission.loaded_daily_cost_cents, null),
        days: countedDays(mission),
      })),
    )
    expect(intermediationCost(byChannel)).toBeNull()
  })
})

/**
 * #2298.8 (21/09/2026) — rank2Potential SEEDÉ, externalWorkforceObserved VIDE
 * À DESSEIN : un commentaire n'est pas une preuve, cette suite en est une.
 */
describe('#2298.8 — trois notions, trois sources : la démonstration en distingue deux sur trois', () => {
  it('le jeu de démonstration porte une observation de rang 2 RÉELLEMENT datée (mc2i)', () => {
    // Décision Louis 04/10/2026 — mc2i est OBSERVÉE chez Société Générale
    // (relevé du compte, daté) ; le semis promeut CETTE ligne en rang 2, il
    // n'invente ni présence ni date.
    const mc2i = DEMO_SG_ESN_PARTNERS.find(partner => partner.name === 'mc2i')
    expect(mc2i?.detectedAt).toBeTruthy()
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain("rank = 'rank2', relationship = 'partner'")
  })

  it('la mémoire marché reste VIDE À DESSEIN pour la même modale (GA-258) — la raison est écrite, pas seulement le commentaire', () => {
    expect(DEMO_ON_ACCOUNTS_EXTERNAL_WORKFORCE_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_ON_ACCOUNTS_EXTERNAL_WORKFORCE_COVERAGE.reason).toMatch(/GA-258/)
  })
})

describe('#2202.19 / #2202.22 — avertissements « avant validation » de CreateSequenceDialog', () => {
  it('« déjà en séquence » (#2202.22) est SEEDÉ — un contact du plan porte réellement une séquence active/en pause', () => {
    expect(DEMO_SEQUENCE_ALREADY_IN_PROGRESS_COVERAGE.state).toBe('seede')
    const hasActiveOrPaused = DEMO_OUTREACH_PLAN.some(entry => entry.status === 'active' || entry.status === 'paused')
    expect(hasActiveOrPaused).toBe(true)
  })

  it("« doublons d'e-mail » (#2202.19) reste VIDE À DESSEIN — la raison est écrite, pas seulement le commentaire", () => {
    expect(DEMO_SEQUENCE_DUPLICATE_EMAIL_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_SEQUENCE_DUPLICATE_EMAIL_COVERAGE.reason).toMatch(/adresse/)
  })

  it('#3387.10 — le renfort transversal est vide à dessein, avec sa raison (aucun collègue fictif n’est en renfort — #4158.13)', () => {
    expect(DEMO_TEAM_CROSS_TEAM_SUPPORT_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_TEAM_CROSS_TEAM_SUPPORT_COVERAGE.reason).toMatch(/DEMO_COLLEAGUES/)
  })

  it('#4158.60-.62 — la carte des autres entités du groupe est vide à dessein, avec sa raison (aucun compte frère semé)', () => {
    expect(DEMO_GROUP_ENTITIES_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_GROUP_ENTITIES_COVERAGE.reason).toMatch(/compte/)
    expect(DEMO_GROUP_ENTITIES_COVERAGE.reason).toMatch(/12\/10\/2026/)
  })

  // #4158.37-46 (lot L7) — chaque bloc du tableau `/team` refondu a sa réponse
  // ÉCRITE pour la démo. Une clé manquante ici = un bloc dont personne n'a
  // décidé ce qu'il montre devant un prospect.
  it('#4158 — chaque bloc du tableau d’équipe est classé, avec une raison', () => {
    expect(Object.keys(DEMO_TEAM_BOARD_COVERAGE).sort()).toEqual(
      [
        'activity',
        'details',
        'header',
        'pipeline_review',
        'pulse',
        'reps',
        'staffing',
        'to_handle',
        'to_handle_awaiting_esn_profile',
        'to_handle_pending_invitations',
      ].sort(),
    )
    for (const entry of Object.values(DEMO_TEAM_BOARD_COVERAGE)) {
      expect(['seede', 'seede_par_l2', 'vide_a_dessein']).toContain(entry.state)
      expect(entry.reason.length).toBeGreaterThan(40)
    }
    // Les invitations sont vides pour la MÊME raison que leur table.
    expect(DEMO_INTENTIONALLY_EMPTY.workspace_invitations).toBeDefined()
    expect(DEMO_TEAM_BOARD_COVERAGE.to_handle_pending_invitations?.state).toBe('vide_a_dessein')
  })
})

describe('#3403 — les voies d’accès personnelles de l’onglet Accès', () => {
  it('les voies sont SEEDÉES, avec DEUX certitudes distinctes (#3403.14)', () => {
    expect(DEMO_PERSONAL_ACCESS_PATHS_COVERAGE.state).toBe('seede')
    // 8 : les 7 voies d'origine + le relais d'introduction du sponsor SIMULÉ (lot D01, 06/10/2026, #3690/#3712).
    expect(DEMO_PERSONAL_ACCESS_PATH_SEEDS).toHaveLength(8)
    const verified = DEMO_PERSONAL_ACCESS_PATH_SEEDS.filter(seed => seed.verified)
    const unverified = DEMO_PERSONAL_ACCESS_PATH_SEEDS.filter(seed => !seed.verified)
    expect(verified.length).toBeGreaterThan(0)
    expect(unverified.length).toBeGreaterThan(0)
    // Chaque type de lien semé doit appartenir aux onze voies nommées —
    // sinon le semis n'exercerait rien de ce que #3403 demande.
    for (const seed of DEMO_PERSONAL_ACCESS_PATH_SEEDS) {
      expect(LINK_KIND_TO_VOIE[seed.linkKind as keyof typeof LINK_KIND_TO_VOIE]).toBeDefined()
    }
  })

  it('les ONZE voies sont démontrables — sait dire NON sur celle qui manquerait', () => {
    const fromLinks = DEMO_PERSONAL_ACCESS_PATH_SEEDS.map(
      seed => LINK_KIND_TO_VOIE[seed.linkKind as keyof typeof LINK_KIND_TO_VOIE],
    )
    const extra = DEMO_PERSONAL_ACCESS_EXTRA_SEEDS
    const fromSources = [
      DEMO_SPRINT_PARTNER_ROUTE_PARTNER.rank === 'rank2' ? 'partenaire_rang2' : null,
      extra.referencedEsn.name ? 'esn_referencee' : null,
      extra.clientAccount ? 'client_existant' : null,
      extra.jobChange.label ? 'personne_changement_poste' : null,
    ]
    const covered = new Set([...fromLinks, ...fromSources])
    expect([...PERSONAL_ACCESS_VOIES].filter(voie => !covered.has(voie))).toEqual([])
  })

  // import-contexte Je.7 — la zone « Dépose tes documents » est un GESTE : elle n'affiche aucun historique à semer.
  // Ce qu'elle remplit doit, lui, être déjà semé : sinon le lien « Voir… » de chaque ligne mènerait à un écran vide.
  it('Je.7 — le pack de contexte est vide à dessein, et ses CINQ destinations sont semées', () => {
    expect(DEMO_CONTEXT_PACK_IMPORT_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_CONTEXT_PACK_IMPORT_COVERAGE.reason.length).toBeGreaterThan(40)
    const seeded = DEMO_SEEDED_TABLES as readonly string[]
    for (const table of DEMO_CONTEXT_PACK_IMPORT_COVERAGE.destinationTables) expect(seeded).toContain(table)
    expect(DEMO_CONTEXT_PACK_IMPORT_COVERAGE.destinationTables).toHaveLength(5)
  })

  it('RV4-E-FIX — la démo déclare ce qu’elle montre des correctifs du lot, avec sa raison', () => {
    expect(DEMO_RV4_E_FIX_COVERAGE.state).toBe('seede')
    expect(DEMO_RV4_E_FIX_COVERAGE.reason.length).toBeGreaterThan(40)
  })

  // RV4-E-FIX 4292.2 (#3777.8) — le badge « Décideur » de la carte des voies d'accès doit se VOIR en démo :
  // au moins une voie semée mène à un contact au rôle `economic` (le prédicat unique `isDecisionMaker`).
  it('RV4-E-FIX 4292.2 — une voie semée mène à un décideur (badge « Décideur » visible en démo)', () => {
    const roleByName = new Map<string, string | null>([
      ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts.map(c => [c.full_name, c.decision_role ?? null] as const)),
      ...DEMO_DELIVERY_CLIENT.contacts.map(c => [c.full_name, c.decision_role ?? null] as const),
    ])
    const deciders = DEMO_PERSONAL_ACCESS_PATH_SEEDS.filter(seed => roleByName.get(seed.contact) === 'economic')
    expect(deciders.length).toBeGreaterThan(0)
  })

  it('les comptes et contacts visés existent dans le jeu de démonstration', () => {
    const companies = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    const contacts = new Set([
      ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts.map(contact => contact.full_name)),
      // Le client d'exemple (SNCF) est semé à part (`seedDeliveryClient`).
      ...DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name),
    ])
    expect(companies.has(DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.clientAccount)).toBe(true)
    expect(companies.has(DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.dormantAccount)).toBe(true)
    expect(companies.has(DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.referencedEsn.accountName)).toBe(true)
    expect(companies.has(DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.jobChange.accountName)).toBe(true)
    for (const seed of DEMO_PERSONAL_ACCESS_PATH_SEEDS) {
      expect([seed.contact, contacts.has(seed.contact)]).toEqual([seed.contact, true])
    }
  })
})

describe('#3510 — le bloc « Voies d’accès personnelles » existe sur les dossiers de la recette démo', () => {
  it('le client de livraison (SNCF) ne porte AUCUNE voie personnelle — vide à dessein', () => {
    // Décision Louis 04/10/2026 — « aucune déclaration inventée sur une personne réelle ».
    const carrier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name)
    // Les interlocuteurs de livraison sont les SIÈGES du dossier (`roleSeat`). Depuis la décision Louis du
    // 01/11/2026 ils portent un NOM FICTIF (`demo-seat-names.ts`) : on les reconnaît à l'intitulé, et la
    // preuve est qu'ils ont un nom ≠ leur titre.
    const seats = new Set(
      (carrier?.contacts ?? [])
        .filter(contact => seatNameOrNull(contact.title) !== null)
        .map(contact => {
          expect(contact.full_name).not.toBe(contact.title)
          return contact.full_name
        }),
    )
    expect(seats.size).toBeGreaterThan(0)
    expect(DEMO_PERSONAL_ACCESS_PATH_SEEDS.filter(seed => seats.has(seed.contact))).toEqual([])
  })

  // Décision Louis 04/10/2026 — le partenaire rang 2 est une vraie ESN observée, sur BNP Paribas.
  it('BNP Paribas (partenaire rang 2) et Société Générale (changement de poste) portent la leur', () => {
    expect(DEMO_SPRINT_PARTNER_ROUTE_PARTNER.accountName).toBe('BNP Paribas')
    expect(DEMO_SPRINT_PARTNER_ROUTE_PARTNER.rank).toBe('rank2')
    expect(DEMO_PERSONAL_ACCESS_EXTRA_SEEDS.jobChange.accountName).toBe('Société Générale')
  })
})

describe('#3404 — la modale du rang 2 (Halden) montre sa preuve de référencement et sa fin', () => {
  const halden = DEMO_PARTNER_RELATIONS.find(partner => partner.name === 'mc2i')

  it('la preuve du référencement est posée (sinon la modale la range dans « Manque encore »)', () => {
    expect(halden?.governance?.referencingProof).toBeTruthy()
  })

  it('la date de fin est lisible dans la durée', () => {
    expect(halden?.governance?.durationTerms).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})

describe('#3402 — les trajectoires commerciales de l’onglet Organigramme', () => {
  it('les QUATRE trajectoires apparaissent déjà sur SNCF, sans aucun contact ajouté pour ce chantier', () => {
    expect(DEMO_COMMERCIAL_TRAJECTORIES_COVERAGE.state).toBe('seede')
    const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
    expect(sncf).toBeDefined()
    const trajectories = computeCommercialTrajectories(
      (sncf?.contacts ?? []).map((contact, index) => ({
        id: `${index}`,
        full_name: contact.full_name,
        title: contact.title ?? null,
        decision_role: (contact.decision_role ?? null) as never,
        priority: contact.priority ?? 3,
      })),
    )
    expect(trajectories.map(t => t.kind).sort()).toEqual(['field', 'middle_manager', 'parallel', 'top'])
  })
})

describe('#3407.5 — la veille à réveiller est démontrable en démo', () => {
  it('le compte semé est BIEN en veille, et son signal arrive APRÈS son entrée en veille', () => {
    const watching = DEMO_DOSSIERS.filter(d => d.account.sprint === 'watch')
    // Retrait du 01/10/2026 : le seul dossier en veille avait quitté la salle ; TotalEnergies
    // (brief commercial : fenêtre 2027, aucune offre IT) l'a rejoint le même jour en
    // `watch`. Sans dossier en veille, `accountName` vaudrait `null` — jamais un compte
    // qui ne serait pas en veille ; avec un, la garde exige que le semis le désigne.
    if (watching.length === 0) {
      expect(DEMO_WATCH_WAKE_SEED.accountName).toBeNull()
    } else {
      expect(DEMO_WATCH_WAKE_SEED.accountName).toBe(watching[0]?.account.company_name)
    }
    // Plus le signal est récent, plus il est postérieur à l'entrée en veille.
    expect(DEMO_WATCH_WAKE_SEED.signal.detectedDaysAgo).toBeLessThan(DEMO_WATCH_WAKE_SEED.enteredWatchDaysAgo)
  })
})

/**
 * #4116 — des appels d'offres européens RÉELS sont semés sur un compte analysé, à leur vraie date de publication
 * (jamais inventée), source non nommée. Ils doivent rester dans la fenêtre de 24 mois de la collecte : quand ce test
 * rougit (fin nov. 2026), remplacer les avis de `demoPublicTendersOf` par des avis plus récents.
 */
describe('appels d’offres européens en démonstration (#4116)', () => {
  it('EDF porte des appels d’offres publiés dans la fenêtre de 24 mois, sans nom de source', () => {
    const edf = DEMO_ANALYSED_ACCOUNTS.find(a => a.company_name === 'EDF')
    const tenders = (edf?.raw_analysis?.public_tenders ?? []) as Array<Record<string, string | null>>
    expect(tenders.length).toBeGreaterThan(0)
    const now = Date.now()
    const today = new Date(now).toISOString().slice(0, 10)
    const oldest = new Date(now - 730 * 86_400_000).toISOString().slice(0, 10)
    for (const t of tenders) {
      expect((t.published_date ?? '') <= today).toBe(true)
      expect((t.published_date ?? '') >= oldest).toBe(true)
      expect(JSON.stringify(t)).not.toMatch(/\bTED\b|BOAMP/)
    }
  })
})

/**
 * #3915.decp (décision Louis 16/10/2026) — un marché public ATTRIBUÉ réel, daté, sur un compte analysé de la
 * démonstration (Thales). Le compte est le TITULAIRE : aucune entreprise tierce n'y est désignée comme concurrent
 * installé — la raison de l'ancienne entrée « vide à dessein » ne tient donc pas pour ce marché-là.
 */
describe('marchés publics attribués en démonstration (#3915.decp)', () => {
  it('Thales porte un marché attribué daté, dans la fenêtre de 24 mois, sans nom de source', () => {
    const thales = DEMO_ANALYSED_ACCOUNTS.find(a => a.company_name === 'Thales')
    const awarded = (thales?.raw_analysis?.awarded_contracts ?? []) as Array<Record<string, unknown>>
    expect(awarded.length).toBeGreaterThan(0)
    const now = Date.now()
    const today = new Date(now).toISOString().slice(0, 10)
    const oldest = new Date(now - 730 * 86_400_000).toISOString().slice(0, 10)
    for (const a of awarded) {
      expect(String(a.notified_date ?? '') <= today).toBe(true)
      expect(String(a.notified_date ?? '') >= oldest).toBe(true)
      expect(String(a.winner ?? '')).toMatch(/THALES/)
      expect(JSON.stringify(a)).not.toMatch(/DECP|BOAMP|data\.economie/)
    }
    expect(DEMO_ANALYSIS_KEYS_INTENTIONALLY_ABSENT).not.toHaveProperty('awarded_contracts')
  })

  it('NON : aucun autre compte de démonstration ne porte de marché attribué (aucun concurrent réel désigné)', () => {
    const others = DEMO_ANALYSED_ACCOUNTS.filter(a => a.company_name !== 'Thales')
    for (const a of others) expect(a.raw_analysis?.awarded_contracts ?? []).toEqual([])
  })
})

describe('Lot BATCH-CV (12/10/2026) — le bandeau de lecture d’un gros import, vide à dessein en démo', () => {
  it('aucun consultant semé n’est « non lu » : tous portent un nom — le bandeau reste silencieux, raison écrite', () => {
    expect(DEMO_CONSULTANTS.length).toBeGreaterThan(0)
    expect(DEMO_CONSULTANTS.every(consultant => consultant.full_name.trim().length > 0)).toBe(true)
    expect(DEMO_CV_AUTO_READ_PROGRESS_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_CV_AUTO_READ_PROGRESS_COVERAGE.reason).toMatch(/cv-auto-parse/)
  })

  it('Théo 23/10 — les CV lus de la semaine sont SEMÉS : chaque nom est un consultant de la salle', () => {
    const names = new Set(DEMO_CONSULTANTS.map(consultant => consultant.full_name))
    expect(DEMO_CV_READ_THIS_WEEK.length).toBeGreaterThan(0)
    for (const name of DEMO_CV_READ_THIS_WEEK) expect(names.has(name)).toBe(true)
  })
})

/**
 * CASCADE-ECRAN — `raw_analysis.offersCascade` (le texte « Peu d'offres du métier : recherche élargie… » de l'onglet
 * Signaux & besoins) est SEEDÉE : SNCF, deux paliers tentés, plancher atteint. Ce n'est pas une clé de
 * `accountAnalysisSchema` : la garde des clés ne la voit pas, celle-ci en tient lieu.
 */
describe('la cascade d’offres du métier est remplie en démo', () => {
  it('un dossier porte une cascade déclenchée que l’écran sait lire', () => {
    const views = DEMO_DOSSIERS.map(d => offersCascadeView(readOffersCascade(d.account.raw_analysis))).filter(Boolean)
    expect(views.length).toBeGreaterThan(0)
    expect(views.some(view => view?.widenedTo === 'terms' && !view.belowFloor)).toBe(true)
  })
})
