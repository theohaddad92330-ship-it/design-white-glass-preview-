import { z } from 'zod'
import { actionOwnerPage, actionTargetKindSchema, type ActionTargetKind } from './action-plan-items.js'
import {
  commercialAuditConfidenceSchema,
  commercialTensionRuleIdSchema,
  type AuditContradiction,
  type CommercialTensionRuleId,
} from './commercial-audit-context.js'

/**
 * #2074.10 à #2074.15 / #2090.7 — LES PREMIERS MOUVEMENTS, À LA FIN DE L'AUDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA DEMANDE DIT, ET CE QU'ELLE NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Dix points de deux issues (#2074.10-.16, #2090.7) décrivent le même objet
 * sans jamais le nommer : « à la fin, TROIS mouvements maximum », « une
 * ouverture », « un engagement à faire avancer », « une décision de
 * pilotage », chacun portant « objet, raison, owner, date » puis « résultat
 * attendu, page BellumAI, statut ». Un écrivain a refusé de l'inventer en
 * septembre 2026, et il a eu raison : un objet que rien n'alimente est du
 * code mort, et ce dépôt en a déjà ~30 chantiers de preuve.
 *
 * Ce fichier ne l'invente pas non plus. Il le DÉRIVE de ce qui existe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI L'ALIMENTE — UNE SEULE SOURCE, DÉJÀ MESURÉE
 * ─────────────────────────────────────────────────────────────────────────
 * {@link AuditContradiction} (`commercial-audit-context.ts`) — les ruptures
 * détectées par les 18 règles de tension (`apps/web/src/features/
 * commercial-audit/lib/tension-detectors.ts`, l'APPELANT qui les produit).
 * Chaque rupture porte déjà, depuis #2066.18, les deux champs qui font un
 * geste :
 *   - `recommendation` — « le geste concret à faire ensuite » → l'OBJET du
 *     mouvement (#2074.14). Une rupture sans recommandation est un reproche.
 *   - `tension` — pourquoi cela pose problème → la RAISON (#2074.14).
 *   - `indicator` — « ce qu'il faudrait mesurer pour vérifier que le geste a
 *     été fait ; jamais un nombre » → le RÉSULTAT ATTENDU (#2074.15), dans la
 *     seule forme que l'audit sache produire sans promettre un chiffre.
 *   - `ruleId` — la TRACE. Un mouvement dit toujours de quelle règle il vient.
 *   - `confidence` — reprise telle quelle, `null` = NON MESURÉE, un état à
 *     part entière qui n'est pas « faible » (GA-18 / GA-19).
 *
 * Rien d'autre n'entre. En particulier, AUCUN signal de marché (offres
 * d'emploi, marchés publics, actualités, mémoire de marché) : ces sources
 * existent bien dans le produit (`market_company_signal`,
 * `territory_snapshots`, `apps/ia/app/routers/discover_signals.py`) mais
 * elles décrivent un COMPTE, et l'audit commercial ne porte aucun compte —
 * il lit le `ProfileContext` de l'utilisateur. Les brancher ici produirait
 * un mouvement sur un compte que l'écran n'a pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ON A REFUSÉ DE METTRE, FAUTE DE SOURCE
 * ─────────────────────────────────────────────────────────────────────────
 * - **`owner`** et **`dueDate`** (#2074.14). L'audit ne sait ni qui porte le
 *   geste ni pour quand : aucun champ du `ProfileContext` ne les donne. Les
 *   mettre à `null` sur la proposition serait un second endroit où ils
 *   vivraient, alors que `action_plan_items.owner_name` et
 *   `action_plan_items.due_date` les portent DÉJÀ (GA-26 — un réglage vit à
 *   un seul endroit). Ils se renseignent à la porte de #2074.16, quand
 *   l'humain valide, jamais devinés ici.
 * - **Aucune probabilité** (doctrine, refusée six fois) : pas de « chance que
 *   ce mouvement marche », pas de priorité pondérée, pas de score. L'ordre
 *   des mouvements est celui de {@link AUDIT_MOVE_KINDS}, un ordre de LECTURE
 *   (on ouvre, puis on fait avancer, puis on tranche), pas un classement.
 * - **Aucun taux** : on ne dit jamais « 2 mouvements sur 3 » — ce serait
 *   mesurer la complétude de nos données (GA-259).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI N'ÉCRIT PAS TOUT SEUL
 * ─────────────────────────────────────────────────────────────────────────
 * {@link auditMovesFrom} ne produit que des mouvements `propose`. Le contrat
 * NOMME les quatre statuts pour que la porte de #2074.16 n'invente pas un
 * second vocabulaire le jour où elle écrit — et `ecarte` existe parce qu'on
 * ARCHIVE, on ne supprime pas : un mouvement écarté reste lisible, il ne
 * disparaît pas de la liste.
 */

// ── Les trois mouvements (#2074.11 / .12 / .13) ───────────────────────────

/**
 * L'ordre est celui de la LECTURE, pas d'un classement : on ouvre une porte,
 * on fait avancer ce qui est déjà ouvert, puis on tranche sur la machine
 * elle-même. Une identité fermée (jamais une phrase libre) pour la même
 * raison que `commercialTensionRuleIdValues` : le libellé vit en i18n aux
 * deux langues (`commercialAudit.moves.kind.<id>`), et les gardes doivent
 * pouvoir LIRE cette liste.
 */
export const AUDIT_MOVE_KINDS = ['ouverture', 'engagement', 'pilotage'] as const
export type AuditMoveKind = (typeof AUDIT_MOVE_KINDS)[number]
export const auditMoveKindSchema = z.enum(AUDIT_MOVE_KINDS)

/**
 * #2074.10 — « à la fin, TROIS mouvements maximum ». La borne n'est pas un
 * chiffre choisi : c'est UN mouvement par genre, et il y a trois genres.
 * Écrire `3` à côté de la liste ferait diverger les deux le jour où un
 * quatrième genre arriverait.
 */
export const MAX_AUDIT_MOVES = AUDIT_MOVE_KINDS.length

// ── Le statut (#2074.15) et la porte (#2074.16) ───────────────────────────

/**
 * Quatre états, et pas un de plus.
 *
 * `propose` est le seul que la dérivation produit — un mouvement PROPOSÉ est
 * un fait vrai, pas un remplissage. Les trois autres n'existent qu'après un
 * geste humain (#2074.16 : « l'utilisateur VALIDE ou MODIFIE avant création
 * dans Actions ») : `modifie` est distinct de `valide` parce qu'une
 * correction humaine gagne toujours et doit rester visible comme telle, et
 * `ecarte` parce qu'on archive au lieu de supprimer.
 */
export const AUDIT_MOVE_STATUSES = ['propose', 'valide', 'modifie', 'ecarte'] as const
export type AuditMoveStatus = (typeof AUDIT_MOVE_STATUSES)[number]
export const auditMoveStatusSchema = z.enum(AUDIT_MOVE_STATUSES)

// ── Le classement des 18 règles de tension ────────────────────────────────

/**
 * Quel GENRE de mouvement chaque rupture appelle.
 *
 * Exhaustif par construction (`Record<CommercialTensionRuleId, …>`) : une
 * 19e règle ne compilera pas tant qu'elle n'est pas classée, et le test le
 * vérifie aussi à l'exécution. Le critère est le même partout :
 *   - `ouverture` — le geste CRÉE un accès qui n'existe pas encore ;
 *   - `engagement` — le geste FAIT AVANCER quelque chose de déjà ouvert ;
 *   - `pilotage` — le geste TRANCHE sur la machine commerciale elle-même.
 */
export const AUDIT_MOVE_KIND_BY_RULE: Readonly<Record<CommercialTensionRuleId, AuditMoveKind>> = {
  // On ouvre : il manque une porte, une preuve mobilisable, une routine.
  offerWithoutProof: 'ouverture',
  acquisitionWithoutRoutine: 'ouverture',
  keyAccountsWithoutAccessPath: 'ouverture',
  contentWithoutCommercialUse: 'ouverture',
  partnersWithoutEconomicsOrFeedback: 'ouverture',
  // On fait avancer : le fil, le profil, l'entretien, le besoin existent déjà.
  poolWithoutAvailability: 'engagement',
  needsWithoutQualification: 'engagement',
  profilesWithoutCommitment: 'engagement',
  contactWithoutFollowUpDate: 'engagement',
  needReducedToTitle: 'engagement',
  profileNotSecured: 'engagement',
  interviewWithoutFollowUp: 'engagement',
  missionWithoutRenewal: 'engagement',
  // On pilote : capacité, territoires, go/no-go, capitalisation, retour.
  objectivesAboveCapacity: 'pilotage',
  tooManySimultaneousMarkets: 'pilotage',
  rfpsWithoutGoNoGo: 'pilotage',
  missionsWithoutCapitalisation: 'pilotage',
  feedbackNotRecorded: 'pilotage',
}

/**
 * #2074.15 — « la page BellumAI ». Elle ne se stocke pas et ne se devine pas :
 * elle se DÉRIVE de la nature de l'objet visé, par `actionOwnerPage()`
 * (`action-plan-items.ts`, #2123.33) — le seul endroit du dépôt qui répond à
 * « où vit cette action ? » (GA-26 : deux chemins qui refont la même
 * dérivation divergent).
 *
 * Ce qui se décide ici, c'est donc seulement la NATURE visée, parmi les huit
 * de {@link ActionTargetKind}. Onze des dix-huit règles n'en visent AUCUNE :
 * leur geste porte sur la machine (une capacité, un territoire, un go/no-go,
 * une capitalisation, un retour client) ou sur un référentiel que ces huit
 * natures ne couvrent pas (un vivier, une preuve d'offre). Elles valent
 * `null`, et l'écran n'affiche alors AUCUNE page — jamais une page de repli,
 * qui enverrait l'utilisateur au mauvais endroit avec assurance.
 */
export const AUDIT_MOVE_TARGET_BY_RULE: Readonly<Record<CommercialTensionRuleId, ActionTargetKind | null>> = {
  // Les sept règles dont l'objet est explicite — le module voisin le nomme.
  acquisitionWithoutRoutine: 'sequence',
  keyAccountsWithoutAccessPath: 'contact',
  partnersWithoutEconomicsOrFeedback: 'partner',
  needsWithoutQualification: 'need',
  needReducedToTitle: 'need',
  contactWithoutFollowUpDate: 'contact',
  interviewWithoutFollowUp: 'meeting',
  missionWithoutRenewal: 'project',
  // Les autres : aucune des huit natures ne porte ce geste. Nommé, pas deviné.
  offerWithoutProof: null,
  contentWithoutCommercialUse: null,
  poolWithoutAvailability: null,
  profilesWithoutCommitment: null,
  profileNotSecured: null,
  objectivesAboveCapacity: null,
  tooManySimultaneousMarkets: null,
  rfpsWithoutGoNoGo: null,
  missionsWithoutCapitalisation: null,
  feedbackNotRecorded: null,
}

// ── Le mouvement ──────────────────────────────────────────────────────────

export const auditMoveSchema = z.object({
  kind: auditMoveKindSchema,
  /** La règle de tension dont ce mouvement vient — un mouvement dit toujours
   *  d'où il sort, et c'est elle qui porte son libellé i18n. */
  ruleId: commercialTensionRuleIdSchema,
  /** #2074.14 — L'OBJET : le geste, tel que la rupture le recommande déjà. */
  subject: z.string().min(1),
  /** #2074.14 — LA RAISON : la tension mesurée. Un geste sans raison est un
   *  ordre, et l'utilisateur ne peut pas le contredire. */
  reason: z.string().min(1),
  /** #2074.15 — LE RÉSULTAT ATTENDU : le NOM de ce qu'on regardera pour savoir
   *  que le geste a été fait. Jamais un nombre, jamais une promesse.
   *  `null` = la rupture n'en nomme pas — non mesuré, pas « aucun ». */
  expectedResult: z.string().min(1).nullable(),
  /** #2074.15 — la nature de l'objet visé ; la PAGE en découle par
   *  {@link auditMovePage}. `null` = ce geste ne vise aucun objet canonique. */
  targetKind: actionTargetKindSchema.nullable(),
  /** #2074.15 — l'état du mouvement. `propose` tant que personne n'a tranché. */
  status: auditMoveStatusSchema,
  /** `null` = confiance NON MESURÉE — distinct de la plus faible des trois. */
  confidence: commercialAuditConfidenceSchema.nullable(),
})
export type AuditMove = z.infer<typeof auditMoveSchema>

/**
 * La page BellumAI où ce mouvement se fait — `null` quand il ne vise aucun
 * objet canonique. Un seul chemin de dérivation, celui des actions (GA-26).
 */
export function auditMovePage(move: Pick<AuditMove, 'targetKind'>): string | null {
  return move.targetKind === null ? null : actionOwnerPage(move.targetKind)
}

/**
 * Les premiers mouvements, dérivés des ruptures détectées.
 *
 * AU PLUS UN par genre, dans l'ordre de {@link AUDIT_MOVE_KINDS} — donc au
 * plus {@link MAX_AUDIT_MOVES}. La rupture retenue pour un genre est la
 * PREMIÈRE de ce genre : l'ordre des détecteurs fait foi, et il est déjà
 * l'ordre de la chaîne commerciale.
 *
 * Sans rupture, la fonction rend `[]` — l'écran le NOMME (« aucun mouvement
 * ne peut être nommé »), il ne fabrique pas trois cartes pour remplir le bas
 * de page. C'est la même discipline que `buildWeeklyPriority`.
 */
export function auditMovesFrom(
  contradictions:
    | readonly Pick<AuditContradiction, 'ruleId' | 'recommendation' | 'tension' | 'indicator' | 'confidence'>[]
    | null
    | undefined,
): AuditMove[] {
  if (!contradictions || contradictions.length === 0) return []

  const moves: AuditMove[] = []
  for (const kind of AUDIT_MOVE_KINDS) {
    const source = contradictions.find(item => AUDIT_MOVE_KIND_BY_RULE[item.ruleId] === kind)
    if (!source) continue
    moves.push({
      kind,
      ruleId: source.ruleId,
      subject: source.recommendation,
      reason: source.tension,
      expectedResult: source.indicator.length > 0 ? source.indicator : null,
      targetKind: AUDIT_MOVE_TARGET_BY_RULE[source.ruleId],
      status: 'propose',
      confidence: source.confidence,
    })
  }
  return moves
}
