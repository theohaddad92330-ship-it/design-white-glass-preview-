import { z } from 'zod'
import {
  REFRESH_AGED_AFTER_MS,
  REFRESH_MODE_DURATION_MINUTES,
  type RefreshChangeableOutput,
  type RefreshCost,
  type RefreshSourceNature,
  buildRefreshPlan,
} from './refresh-explained.js'
import { PUBLIC_TENDER_SOURCE_IDS } from './public-tenders-gate.js'

/**
 * #2288.2 / #2288.3 / #2288.4 — LA VÉRIFICATION À LA DEMANDE, DEPUIS UN
 * CONSULTANT : PRÉSÉLECTION → VÉRIFICATION → CONSERVATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE RÉINVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La frontière gratuit/payant est DÉJÀ écrite, et elle n'est pas discutée ici :
 * `MARKET_MEMORY_FREE_READS` (« reverse_market_structural », « market_context_read »)
 * et `MARKET_MEMORY_PAID_VERIFICATIONS` (« account_analysis »,
 * `billing/market-memory-credit-policy.ts`). Un crédit paie du TRAVAIL NOUVEAU,
 * jamais une lecture. Ce fichier ne déplace pas cette frontière : il l'APPLIQUE
 * à une liste d'entreprises présélectionnées, ce que personne ne faisait.
 *
 * Le PRIX, la DURÉE, les NATURES DE SOURCE et CE QUI PEUT CHANGER ne sont pas
 * recopiés non plus : ils viennent de `buildRefreshPlan({ mode: 'full' })`, la
 * fonction qui annonce déjà un rafraîchissement complet avant de le lancer
 * (GA-26 — un réglage vit à UN seul endroit). Vérifier aujourd'hui, c'est
 * relancer une analyse complète ; si la durée du pipeline change, elle change
 * ici aussi, sans qu'on y pense.
 *
 * La fenêtre de fraîcheur est `REFRESH_AGED_AFTER_MS` — la MÊME borne que
 * « cet axe est ancien ». Une seconde borne à trente jours se serait périmée
 * seule le jour où l'autre bouge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UN REÇU EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un reçu est un fait sur MON geste : « j'ai fait vérifier ce LIBELLÉ, ce
 * jour-là ». Ce n'est PAS un rapprochement entre la mémoire marché et mes
 * comptes — le dépôt refuse déjà ce rapprochement par le NOM SEUL
 * (`reverseMarket.compatible.followedReason` : « aucun identifiant commun
 * (SIREN) »), et l'inventer ici ferait exactement la donnée devinée que la
 * doctrine interdit. Le libellé rapproché est celui que la mémoire marché a
 * rendu et que l'écran a envoyé — la même chaîne, des deux côtés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUNE PROBABILITÉ, NULLE PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Le plan annonce des FAITS : combien de candidats, quelles natures de source,
 * combien de crédits, combien de minutes, quels objets peuvent bouger. Jamais
 * une « chance de trouver », jamais un « taux de succès » — refusé six fois.
 */

/**
 * LES TROIS ÉTAPES DU FLUX (#2288.2), DANS L'ORDRE, ET RIEN D'AUTRE.
 *
 * Trois étapes distinctes, chacune avec son état : la présélection ne coûte
 * rien, la vérification coûte, la conservation garde ce qui a été vérifié pour
 * ne pas le repayer.
 */
export const MARKET_VERIFICATION_STAGES = ['preselection', 'verification', 'conservation'] as const
export type MarketVerificationStage = (typeof MARKET_VERIFICATION_STAGES)[number]

/**
 * L'ÉTAT D'UNE ENTREPRISE PRÉSÉLECTIONNÉE.
 *
 * · `to_verify` — cochée, rien n'est engagé : c'est l'étape de PRÉSÉLECTION,
 *   qui ne coûte rien et n'appelle personne.
 * · `unknown` — on a demandé, on n'a pas su (temps dépassé, source muette). Un
 *   timeout n'est pas un échec : il rend « inconnu » et ARRÊTE la reprise. Il
 *   ne devient jamais « non vérifié », et jamais « 0 ».
 * · `kept` — vérifiée, et la vérification est encore dans la fenêtre : la
 *   relire est gratuite.
 * · `stale` — vérifiée, mais la vérification a vieilli, ou la ligne a été
 *   archivée : le fait périmé REDEVIENT INCONNU, la ligne reste (on archive,
 *   on ne supprime pas).
 * · `corrected` — quelqu'un a corrigé à la main. Une correction humaine gagne
 *   toujours, quelle que soit sa date.
 */
export const MARKET_VERIFICATION_STATES = ['to_verify', 'unknown', 'kept', 'stale', 'corrected'] as const
export type MarketVerificationState = (typeof MARKET_VERIFICATION_STATES)[number]

/**
 * L'ÉTAPE DE CHAQUE ÉTAT — TOTALE, ET À UN SEUL ENDROIT.
 *
 * Écrite en table plutôt qu'en `if` en cascade pour que l'oubli d'un état soit
 * une erreur de compilation, pas un `undefined` qui traverse jusqu'à l'écran.
 */
export const MARKET_VERIFICATION_STAGE_OF: Readonly<Record<MarketVerificationState, MarketVerificationStage>> = {
  to_verify: 'preselection',
  unknown: 'verification',
  kept: 'conservation',
  stale: 'conservation',
  corrected: 'conservation',
}

/**
 * LES DEUX ISSUES D'UNE VÉRIFICATION, ET IL N'Y EN A PAS DE TROISIÈME.
 *
 * Il n'existe PAS d'`failed` : un temps dépassé n'est pas un échec, il rend
 * « inconnu » et arrête la reprise. Le catalogue est tenu en base par
 * `market_verification_receipts_outcome_check` (GA-11 / GA-12) — l'élargir se
 * fait dans une migration AVANT la première ligne de code qui l'écrit.
 */
export const MARKET_VERIFICATION_OUTCOMES = ['verified', 'unknown'] as const
export type MarketVerificationOutcome = (typeof MARKET_VERIFICATION_OUTCOMES)[number]

/**
 * LE REÇU D'UNE VÉRIFICATION — la trace de MON geste, jamais une donnée sur
 * l'entreprise.
 *
 * `.strict()` : un champ non déclaré ne traverse pas. C'est la défense qui a
 * manqué à `marketContextMatchSchema` (une date calculée côté serveur y
 * disparaissait en silence au bord de la route), prise ici dans l'autre sens —
 * rien d'inventé n'entre.
 */
export const marketVerificationReceiptSchema = z
  .object({
    /** Le LIBELLÉ envoyé à la vérification — la même chaîne que la mémoire marché a rendue. */
    companyName: z.string().min(1),
    /** Quand le geste a été fait. ISO. Illisible ⇒ l'état devient « inconnu », jamais une fraîcheur devinée. */
    verifiedAt: z.string().min(1),
    /** Catalogue FERMÉ. « unknown » = non mesuré ; il n'existe pas d'« échec » ici, voir la doc de l'état. */
    outcome: z.enum(MARKET_VERIFICATION_OUTCOMES),
    /** Une correction saisie à la main. Elle gagne toujours. */
    correctedByHuman: z.boolean(),
    /** Archivée (on archive, on ne supprime pas). `null` = vivante. */
    archivedAt: z.string().nullable(),
    /**
     * Le coût ANNONCÉ avant le geste, tel qu'il a été affiché. `null` quand on
     * ne le sait pas — une ligne sans coût connu se COMPTE (GA-66), elle ne
     * s'additionne pas comme un zéro.
     */
    creditsAnnounced: z.number().int().min(0).nullable(),
  })
  .strict()
export type MarketVerificationReceipt = z.infer<typeof marketVerificationReceiptSchema>

/**
 * LA PRÉSÉLECTION ENVOYÉE AU PLAN (#2288.4).
 *
 * Bornée à cinquante libellés : au-delà, le coût annoncé cesse d'être une
 * décision qu'on prend en regardant un nombre, et le geste devient une facture
 * qu'on découvre. La borne est un refus net (400), jamais une troncature
 * silencieuse — couper la liste ferait annoncer un prix pour un périmètre que
 * l'utilisateur n'a pas demandé.
 */
export const marketVerificationPlanRequestSchema = z
  .object({ companies: z.array(z.string().trim().min(1).max(200)).max(50) })
  .strict()
export type MarketVerificationPlanRequest = z.infer<typeof marketVerificationPlanRequestSchema>

/**
 * L'INSCRIPTION D'UN REÇU (#2288.2).
 *
 * ⚠️ Le CORPS ne porte AUCUN coût : ce que la vérification a coûté est décidé
 * par la grille, côté serveur. Un client qui déclarerait ce qu'il a payé
 * écrirait sa propre facture.
 */
export const marketVerificationRecordRequestSchema = z
  .object({
    companyName: z.string().trim().min(1).max(200),
    /** Le catalogue FERMÉ. Il n'y a pas d'« échec » : un temps dépassé rend `unknown`. */
    outcome: z.enum(MARKET_VERIFICATION_OUTCOMES),
  })
  .strict()
export type MarketVerificationRecordRequest = z.infer<typeof marketVerificationRecordRequestSchema>

/** Le libellé rapproché : casse et espaces de bord ignorés, rien de plus. */
export function marketVerificationKey(companyName: string): string {
  return companyName.trim().toLowerCase()
}

/**
 * L'ÉTAT D'UNE ENTREPRISE, DÉCIDÉ À UN SEUL ENDROIT (GA-26).
 *
 * L'ordre des refus est le message :
 *  1. une correction humaine gagne AVANT tout le reste — sa date ne compte pas,
 *     ni son archivage, ni l'issue de la vérification qui l'a précédée ;
 *  2. un « non mesuré » reste « non mesuré » — le faire vieillir puis le
 *     reproposer en boucle serait exactement la reprise que le timeout arrête ;
 *  3. une ligne archivée est périmée, jamais absente ;
 *  4. une date illisible ne se devine pas : « inconnu ».
 */
export function decideMarketVerificationState(input: {
  receipt: MarketVerificationReceipt | null
  now: Date
  agedAfterMs?: number
}): MarketVerificationState {
  const { receipt, now } = input
  if (receipt === null) return 'to_verify'
  if (receipt.correctedByHuman) return 'corrected'
  if (receipt.outcome === 'unknown') return 'unknown'
  if (receipt.archivedAt !== null) return 'stale'
  const at = Date.parse(receipt.verifiedAt)
  if (!Number.isFinite(at)) return 'unknown'
  const agedAfterMs = input.agedAfterMs ?? REFRESH_AGED_AFTER_MS
  return now.getTime() - at >= agedAfterMs ? 'stale' : 'kept'
}

/**
 * L'état d'une entreprise, avec le libellé exact qui a été présélectionné.
 *
 * #2288.4 (18/09, suite) — `siren` est le SIREN DÉJÀ CONNU de cette entreprise
 * dans NOTRE workspace (un compte `completed` au nom exact, jamais deviné) —
 * `null` quand rien n'est connu (comportement inchangé). Il voyage jusqu'au
 * lancement (`POST /analysis/start`) ET au devis (`GET /analysis/launch-plan`)
 * pour que les DEUX résolvent la même entité, plutôt que deux lectures
 * indépendantes par nom seul.
 */
export type MarketVerificationCompanyState = {
  readonly companyName: string
  readonly state: MarketVerificationState
  readonly siren: string | null
}

/**
 * #2288.2 (décision Louis, 18/09/2026) — LA LECTURE DES ÉTATS, OUVERTE À TOUT
 * MEMBRE DE L'ESPACE.
 *
 * L'état, et la DATE : une vérification d'hier n'est pas une vérification
 * d'aujourd'hui, et « à revérifier » sans dire depuis quand serait muet.
 * `verifiedAt` est `null` quand rien n'a été vérifié — jamais une date de zéro.
 *
 * ⚠️ AUCUN MONTANT dans cette forme, et c'est ce qui la rend lisible par un
 * `viewer` : le coût annoncé d'un reçu reste côté plan (route gardée par
 * `analysis:run`). Un champ de coût ajouté ici changerait la nature de la
 * route — elle deviendrait une lecture financière. `siren` (hérité de
 * {@link MarketVerificationCompanyState}) n'est PAS un montant — un SIREN est
 * déjà visible sur la fiche compte par tout membre.
 */
export type MarketVerificationStateRow = MarketVerificationCompanyState & {
  readonly verifiedAt: string | null
}

/** La requête de lecture : un libellé seul (paramètre non répété) vaut une liste d'un. */
export const marketVerificationStatesQuerySchema = z
  .object({
    companies: z.preprocess(
      value => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
      z.array(z.string().trim().min(1).max(200)).max(50),
    ),
  })
  .strict()

/**
 * Les états de ces libellés, décidés par `decideMarketVerificationState` — la
 * MÊME fonction que le plan (GA-26) : la colonne et le devis ne peuvent pas
 * dire deux choses différentes de la même ligne.
 *
 * `knownSirens` est une lecture DÉJÀ FAITE par l'appelant (clé =
 * `marketVerificationKey(companyName)`) — cette fonction reste PURE, elle ne
 * lit rien elle-même. Absent ou libellé non trouvé ⇒ `siren: null`
 * (comportement inchangé, #2288.4).
 */
export function readMarketVerificationStates(input: {
  readonly companies: readonly string[]
  readonly receipts: readonly MarketVerificationReceipt[]
  readonly now: Date
  readonly agedAfterMs?: number
  readonly knownSirens?: ReadonlyMap<string, string>
}): MarketVerificationStateRow[] {
  const byKey = new Map<string, MarketVerificationReceipt>()
  for (const receipt of input.receipts) byKey.set(marketVerificationKey(receipt.companyName), receipt)
  return input.companies.map(companyName => {
    const receipt = byKey.get(marketVerificationKey(companyName)) ?? null
    return {
      companyName,
      state: decideMarketVerificationState({ receipt, now: input.now, agedAfterMs: input.agedAfterMs }),
      verifiedAt: receipt?.verifiedAt ?? null,
      siren: input.knownSirens?.get(marketVerificationKey(companyName)) ?? null,
    }
  })
}

/**
 * c66 (décision Louis, 18/09/2026) — LES SOURCES PUBLIQUES PRÉVUES SE
 * NOMMENT, LES FOURNISSEURS PAYANTS RESTENT GÉNÉRIQUES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE LISTE EST, ET N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `sources` (ci-dessous) nomme des NATURES — « registre officiel », « offres
 * d'emploi publiées » — jamais un nom propre (GA-44). La décision du 18/09
 * ajoute une exception nommée : un registre ou une autorité PUBLIQUE (BOAMP,
 * DECP, France Travail) N'EST PAS un fournisseur qu'on tait — c'est une
 * provenance, et la nommer est une garantie (même principe que le site public,
 * D354 / `c19_vocabulaire`). `supplierNamesIn` (`tool-naming.ts`) le confirme
 * déjà : un registre public n'y déclenche jamais un refus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL MOMENT DÉSORMAIS — LE LANCEUR, POUR LES TROIS SOURCES (#2288.4, 18/09)
 * ─────────────────────────────────────────────────────────────────────────────
 * France Travail tourne SANS gate de NAF/pays (`phase1_research.py`,
 * `jobs_task`) — mais elle ne collecte RIEN pour un dossier rouvert (dossier
 * < 30 jours, `scenario: 'cache_hit'`) : ce plan ne reçoit QUE des noms
 * d'entreprise (`MarketContextMatch` ne porte ni NAF ni pays), donc il ne peut
 * pas savoir lesquels des candidats seront réellement relancés. BOAMP et DECP,
 * eux, sont EN PLUS gatés par `plan_collection` (`collection_focus.py`) sur le
 * pays cible et l'archétype préliminaire.
 *
 * C'est donc le LANCEUR qui nomme les TROIS, entreprise par entreprise :
 * `GET /analysis/launch-plan` (`AnalysisService.planLaunch`, que le devis lit
 * déjà pour le coût exact) dit si CE lancement est `fresh` (le seul cas où
 * France Travail tourne), et rend `publicTenderSources` d'après
 * `forecastPublicTenderSources` (`public-tenders-gate.ts`) pour BOAMP/DECP — le
 * pays que `start()` enverrait, et le NAF déjà persisté de l'entité. Ni appel
 * réseau, ni cycle de modules : `AnalysisService` injecte déjà
 * `AccountsService` et `WorkspaceMarketService`. Ce plan-ci (`planMarketVerification`)
 * n'annonce donc plus AUCUNE source publique de façon inconditionnelle —
 * `publicSources` reste vide, gardé par les tests ci-dessous ; la décision vit
 * entièrement dans `announcedPublicSources` (web), au même endroit pour les
 * trois (GA-26).
 */
export const PUBLIC_SOURCE_IDS = ['france-travail', ...PUBLIC_TENDER_SOURCE_IDS] as const
export type PublicSourceId = (typeof PUBLIC_SOURCE_IDS)[number]

/**
 * LES CINQ INFORMATIONS ANNONCÉES AVANT LE GESTE PAYANT (#2288.4) — et les
 * deux que la conservation ajoute.
 */
export type MarketVerificationPlan = {
  /** 1. Combien de candidats seront réellement vérifiés (les conservés en sortent). */
  readonly candidates: number
  /** 2. Les NATURES de source mobilisées — jamais un nom de fournisseur (GA-44). */
  readonly sources: readonly RefreshSourceNature[]
  /** c66 — TOUJOURS VIDE ICI depuis #2288.4 (18/09) : les trois sources
   *  publiques (France Travail, BOAMP, DECP) sont désormais gatées par
   *  entreprise, d'après les réponses du LANCEUR — jamais une source devinée
   *  sur une liste de noms. Voir {@link PUBLIC_SOURCE_IDS} et
   *  `announcedPublicSources` (web), qui les annonce toutes les trois. */
  readonly publicSources: readonly PublicSourceId[]
  /**
   * 3. Le coût au PRIX DE GRILLE (candidats × analyse complète), mesuré ou
   * nommé non mesuré — jamais un `0` de repli.
   *
   * ⚠️ C'est un PLAFOND, pas le devis affiché : un dossier déjà analysé est
   * rouvert sans débit, une démonstration ne débite rien. L'écran annonce donc
   * la SOMME des réponses du lanceur (`GET /analysis/launch-plan`, la fonction
   * même du débit) — voir `marketVerificationCost.ts`. Ce champ reste pour les
   * appelants qui n'ont pas de lanceur sous la main ; il ne doit jamais être
   * affiché comme « ce que ça va coûter ».
   */
  readonly credits: RefreshCost
  /** 4. La durée annoncée, deux bornes, celles du pipeline complet. */
  readonly durationMinutes: { readonly min: number; readonly max: number }
  /** 5. Ce que ça apporte : les objets que la vérification peut faire bouger. Des CHAMPS, pas une probabilité. */
  readonly adds: readonly RefreshChangeableOutput[]
  /** Ce qui n'est PAS refacturé, parce qu'il est déjà conservé. */
  readonly kept: number
  /**
   * GA-66 — ce qu'ont coûté les conservés est un PLANCHER : la somme des coûts
   * connus, ET le compte des lignes dont le coût n'est pas connu. Un coût
   * qu'on ne sait pas calculer se dit « non mesuré », jamais « 0 ».
   */
  readonly keptCreditsSpent: RefreshCost
  readonly keptWithoutKnownCost: number
  /** L'état de chaque entreprise présélectionnée, dans l'ordre reçu. */
  readonly states: readonly MarketVerificationCompanyState[]
}

/**
 * LE PLAN, AVANT LE GESTE. Zéro appel réseau, zéro écriture, zéro débit.
 *
 * `fullAnalysisCredits` est le prix qu'annonce déjà le serveur pour une analyse
 * complète : il traverse jusqu'ici plutôt que d'être relu d'une grille une
 * seconde fois. Absent ou illisible ⇒ `{ measured: false }` — « on n'a pas su
 * lire le prix » n'est pas « c'est gratuit ».
 */
export function planMarketVerification(input: {
  readonly companies: readonly string[]
  readonly receipts: readonly MarketVerificationReceipt[]
  readonly now: Date
  readonly fullAnalysisCredits: number | null
  readonly agedAfterMs?: number
  /** #2288.4 — voir {@link readMarketVerificationStates} : lecture déjà faite par l'appelant. */
  readonly knownSirens?: ReadonlyMap<string, string>
}): MarketVerificationPlan {
  const byKey = new Map<string, MarketVerificationReceipt>()
  for (const receipt of input.receipts) byKey.set(marketVerificationKey(receipt.companyName), receipt)

  // Les états viennent du MÊME lecteur que la route ouverte aux membres : le
  // devis et la colonne ne peuvent pas diverger sur une même ligne (GA-26).
  const states: MarketVerificationCompanyState[] = readMarketVerificationStates(input).map(
    ({ companyName, state, siren }) => ({ companyName, state, siren }),
  )

  // Conservé = déjà payé (`kept`) ou tranché par un humain (`corrected`). Tout
  // le reste est un candidat : `stale` et `unknown` compris, parce que c'est
  // l'utilisateur qui vient de les recocher — le produit ne les relance jamais
  // de lui-même.
  const conserved = states.filter(entry => entry.state === 'kept' || entry.state === 'corrected')
  const candidates = states.length - conserved.length

  // Le prix, la durée, les natures et ce qui peut changer : une seule source
  // (GA-26). `freshness: {}` parce que ce plan n'annonce pas l'âge des axes
  // d'un compte — il annonce ce qu'un rafraîchissement complet CONSULTE et
  // CHANGE, qui ne dépend d'aucune fraîcheur.
  const full = buildRefreshPlan({
    mode: 'full',
    fullAnalysisCredits: input.fullAnalysisCredits,
    now: input.now,
    freshness: {},
  })

  const credits: RefreshCost = full.cost.measured
    ? { measured: true, credits: full.cost.credits * candidates }
    : { measured: false }

  let keptCreditsKnown = 0
  let keptWithoutKnownCost = 0
  for (const entry of conserved) {
    const receipt = byKey.get(marketVerificationKey(entry.companyName))
    if (receipt && receipt.creditsAnnounced !== null) keptCreditsKnown += receipt.creditsAnnounced
    else keptWithoutKnownCost += 1
  }

  return {
    candidates,
    sources: full.sources,
    // c66 / #2288.4 — les TROIS sources publiques se décident par lancement
    // (`planLaunch`), jamais ici : voir le docblock de PUBLIC_SOURCE_IDS.
    publicSources: [],
    credits,
    durationMinutes: REFRESH_MODE_DURATION_MINUTES.full,
    adds: full.mayChange,
    kept: conserved.length,
    keptCreditsSpent: { measured: true, credits: keptCreditsKnown },
    keptWithoutKnownCost,
    states,
  }
}
