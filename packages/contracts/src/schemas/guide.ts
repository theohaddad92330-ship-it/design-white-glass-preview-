import { z } from 'zod'

/**
 * #2212 / #2213 / #2214 — LE SOCLE DU GUIDE : LE VOCABULAIRE PARTAGÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il pose les mots que TOUS les pas de guide à venir emploieront : les trois
 * niveaux d'aide, les trois modes, ce qu'est une CIBLE, ce qu'est une cible
 * ABSENTE, et le délai au bout duquel on renonce. Rien d'autre.
 *
 * ⚠️ Il ne définit PAS le schéma du registre de guides (les champs d'un guide
 * au-delà de son `id` : version, audience, déclencheur…). Le corps de #2212 est
 * coupé net à cet endroit (« Chaque guide doit pouvoir définir : - id ; - versio »)
 * et la décision du 19/09/2026 sur #2212.45 est « je complète moi-même ». Ce
 * fichier s'arrête donc à la frontière de ce qui est lisible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CONTRAT PARTAGÉ PLUTÔT QUE DES TYPES DANS LE WEB
 * ─────────────────────────────────────────────────────────────────────────────
 * Le guide est mesuré (analytique produit) et servi (catalogue) : la raison
 * pour laquelle un pas n'a pas pu s'afficher doit porter le MÊME nom dans le
 * navigateur, dans le journal et dans l'API. Une raison d'absence qui s'appelle
 * `viewport` d'un côté et `mobile` de l'autre n'est plus agrégeable — et une
 * absence non agrégeable finit affichée comme un zéro.
 */

/**
 * #2214.2/.3/.4 — LES TROIS NIVEAUX D'AIDE, du plus léger au plus engageant.
 *
 *  · `tooltip` (niveau 1) — pour une ICÔNE, un LIBELLÉ, un STATUT. La primitive
 *    existe déjà (`packages/ui`, cf. #2214.2, marqué « déjà là ») : ce niveau ne
 *    réclame aucun moteur, seulement le droit d'être nommé comme un niveau.
 *  · `coachmark` (niveau 2) — pour un CTA ou un état vide : une bulle ancrée,
 *    une seule, qui montre l'unique geste suivant.
 *  · `walkthrough` (niveau 3) — une CHAÎNE d'étapes, éventuellement à travers
 *    plusieurs écrans.
 *
 * ⚠️ #2214.5 — LA RÈGLE DE SÉLECTIVITÉ, qui est la raison d'être de l'échelle :
 * **pas de pop-up automatique sur chaque bouton.** Le niveau 1 est le défaut ;
 * monter d'un niveau se justifie, il ne se décide pas par confort. Le moteur ne
 * peut pas mesurer « justifié », mais il peut refuser la seule chose qui rend
 * la faute possible à grande échelle : plus d'un niveau 2 ou 3 à la fois
 * (`GUIDE_CONCURRENT_ANCHORED_LIMIT`).
 */
export const GUIDE_HELP_LEVELS = ['tooltip', 'coachmark', 'walkthrough'] as const
const guideHelpLevelSchema = z.enum(GUIDE_HELP_LEVELS)
export type GuideHelpLevel = z.infer<typeof guideHelpLevelSchema>

/**
 * #2214.5 — combien d'aides ANCRÉES (niveau 2 ou 3) peuvent vivre en même temps.
 *
 * Un. « Pas de pop-up automatique sur chaque bouton » n'est tenable que si la
 * deuxième est structurellement impossible : deux bulles ancrées simultanées,
 * c'est exactement l'écran que la règle refuse. Le niveau 1 (`tooltip`) n'est
 * pas compté — il ne s'ouvre que sur geste, et il n'interrompt personne.
 */
export const GUIDE_CONCURRENT_ANCHORED_LIMIT = 1

/**
 * #2213.18/.19/.20 — LES TROIS MODES. Ils partagent l'infrastructure (#2213.21) :
 * même avatar, même bulle, même moteur de cible, même sortie. Ce qui change est
 * leur DÉCLENCHEUR et ce qu'ils promettent.
 *
 *  · `tutoriel` — explique une page ou un parcours. Lecture. Demandé par la
 *    personne, jamais imposé.
 *  · `action-guidee` — conduit jusqu'à l'action, pas au-delà : le guide montre,
 *    la personne clique. Il n'agit jamais à sa place.
 *  · `intervention-proactive` — propose une action métier, sur un constat.
 *    Soumis au budget d'interruption existant (Laura) : ce mode est le seul qui
 *    parle sans qu'on lui ait rien demandé, donc le seul qui peut déranger.
 *
 * ⚠️ Aucun des trois n'envoie quoi que ce soit (doctrine : « le copilote
 * n'envoie jamais d'e-mail : il prépare, le commercial envoie »).
 */
export const GUIDE_MODES = ['tutoriel', 'action-guidee', 'intervention-proactive'] as const
const guideModeSchema = z.enum(GUIDE_MODES)
export type GuideMode = z.infer<typeof guideModeSchema>

/**
 * #1787 — LES ESPACES D'ANCRAGE REFUSÉS, ET LA DÉCISION QUI LES REFUSE.
 *
 * `apps/web/src/features/product-tour/ProductTourDialog.tsx:9-19` (#1787,
 * toujours valable au 21/09/2026) écarte nommément une chose :
 *
 *   > « Pas un spotlight qui survole **le rail de navigation** en direct : le
 *   > rail N'EXISTE PAS sur mobile (quatre onglets, coque à part), et un
 *   > spotlight qui localise des nœuds réels du DOM est fragile au moindre
 *   > remaniement de **la barre latérale**. »
 *
 * La décision porte sur un SUJET précis — le rail, la barre latérale — et sur
 * trois raisons. Le socle honore les trois par construction :
 *
 *  1. *le rail n'existe pas sur mobile* → le rail est refusé ici, purement et
 *     simplement, et toute étape déclare la largeur qu'elle exige
 *     (`minViewportWidth`) : hors de cette largeur, sa cible est ABSENTE pour
 *     la raison `viewport`, jamais devinée ailleurs.
 *  2. *localiser des nœuds réels du DOM est fragile* → on ne localise jamais
 *     par sélecteur CSS. Un ancrage est DÉCLARÉ par le composant qui le rend
 *     (`guideAnchorIdSchema`) : un remaniement qui perd l'ancrage se voit,
 *     parce que l'ancrage a un nom et que sa disparition est une absence
 *     nommée — pas un halo posé au hasard.
 *  3. *les bibliothèques du marché volent le focus et cassent la tabulation* →
 *     le socle ne déplace JAMAIS le focus et ne le piège jamais (#2212.38/.40).
 *
 * ⚠️ Ce qui reste à trancher, et qui n'est PAS décidé ici : si un pas de guide
 * devra un jour montrer une entrée du rail, cette liste est l'endroit unique
 * où le retirer — un seul endroit à changer, et la garde
 * `un-guide-ne-cible-jamais-le-rail-de-navigation` dira lequel.
 */
export const GUIDE_REFUSED_ANCHOR_NAMESPACES = ['rail-de-navigation', 'barre-laterale'] as const

/**
 * #2212.16 — UN ANCRAGE DE GUIDE : UN NOM DÉCLARÉ, PAS UN SÉLECTEUR.
 *
 * Forme : des segments en minuscules séparés par des points, chaque segment en
 * kebab-case — `decouvrir.barre-de-recherche`, `compte.bouton-enrichir`. Le
 * premier segment nomme l'ÉCRAN ou la fonction, ce qui rend l'agrégation
 * analytique conforme par construction (par écran/fonction, jamais par
 * personne — GA-240/241).
 *
 * Cette forme refuse mécaniquement tout ce qui ressemble à du CSS : un point en
 * tête (`.sidebar`), un dièse (`#nav`), un crochet (`[data-x]`), un chevron ou
 * une espace (`div > a`). Ce n'est pas de la coquetterie : c'est la seule
 * barrière qui empêche le moteur de se remettre à DEVINER la structure du DOM,
 * ce que #1787 refuse.
 */
export const guideAnchorIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$/,
    'Un ancrage de guide est une suite de segments kebab-case séparés par des points, jamais un sélecteur CSS.',
  )
  .refine(
    value => !GUIDE_REFUSED_ANCHOR_NAMESPACES.some(ns => value === ns || value.startsWith(`${ns}.`)),
    // #1787 — le rail de navigation est écarté par une décision écrite.
    { message: 'Le rail de navigation est écarté par #1787 : il n’existe pas sur mobile.' },
  )
export type GuideAnchorId = z.infer<typeof guideAnchorIdSchema>

/**
 * #2212.32/.33/.34/.35 — LES PORTES D'UNE ÉTAPE : ce qu'il faut pour qu'elle ait
 * un sens. Toutes optionnelles — une étape qui n'exige rien est la norme.
 *
 * Chaque porte fermée produit une ABSENCE NOMMÉE (voir `GUIDE_ABSENCE_REASONS`),
 * jamais un affichage dégradé : un guide qui montre « Enrichir » à quelqu'un qui
 * n'a pas le droit d'enrichir est pire qu'un guide muet.
 */
export const guideStepRequirementsSchema = z.object({
  /** #2212.32 — la route sur laquelle cette étape a un sens. */
  route: z.string().min(1).optional(),
  /** #2212.33 — la permission sans laquelle l'étape ne se montre pas. */
  permission: z.string().min(1).optional(),
  /**
   * #2212.34 — la largeur minimale, en pixels CSS. La borne du produit est
   * 768 px (GA-28) ; une étape qui vise une surface absente du mobile le DIT
   * ici plutôt que de se faire découvrir en réunion.
   */
  minViewportWidth: z.number().int().positive().optional(),
  /** #2212.35 — la donnée sans laquelle l'étape parlerait dans le vide. */
  requiresData: z.string().min(1).optional(),
  /** #2212.35 — le drapeau de fonctionnalité qui autorise l'étape. */
  featureFlag: z.string().min(1).optional(),
})
export type GuideStepRequirements = z.infer<typeof guideStepRequirementsSchema>

/**
 * #2212.37 — POURQUOI UNE CIBLE EST ABSENTE. Le catalogue est FERMÉ.
 *
 * C'est la doctrine « jamais de donnée fictive » appliquée à un guide : une
 * cible qu'on ne trouve pas se NOMME. Sept raisons, dont cinq sont les portes
 * de l'étape :
 *
 *  · `route` / `permission` / `viewport` / `data` / `flag` — une porte fermée ;
 *  · `timeout` — la cible n'est pas apparue dans le délai (#2212.31/.41) ;
 *  · `anchor-undeclared` — aucun composant n'a jamais déclaré cet ancrage. C'est
 *    la seule raison qui accuse le DÉPÔT et pas la situation : elle signale un
 *    pas de guide qui vise un ancrage supprimé par un remaniement.
 *
 * ⚠️ Fermé volontairement : une huitième raison ajoutée à la légère
 * (« unknown », « other ») rendrait l'agrégat inexploitable, et un agrégat
 * inexploitable finit affiché comme un zéro.
 */
export const GUIDE_ABSENCE_REASONS = [
  'route',
  'permission',
  'viewport',
  'data',
  'flag',
  'timeout',
  'anchor-undeclared',
] as const
const guideAbsenceReasonSchema = z.enum(GUIDE_ABSENCE_REASONS)
export type GuideAbsenceReason = z.infer<typeof guideAbsenceReasonSchema>

/**
 * #2212.31/.36/.37 — LE VERDICT DU MOTEUR SUR UNE CIBLE. Deux états, pas trois.
 *
 * Il n'existe pas d'état « en attente » ici : tant que le moteur cherche, il n'a
 * pas de verdict et n'affiche RIEN. Un troisième état inviterait un écran à
 * montrer une bulle « chargement » ancrée nulle part — c'est-à-dire un halo sur
 * du vide.
 *
 * `viaFallback` dit que c'est la cible de SECOURS qui a répondu (#2212.36). Le
 * guide ne fait pas semblant que c'était la cible demandée : la mesure sait
 * distinguer « ça a marché » de « ça a marché de justesse ».
 */
export const guideTargetResolutionSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('resolved'),
    anchor: guideAnchorIdSchema,
    viaFallback: z.boolean(),
  }),
  z.object({
    state: z.literal('absent'),
    anchor: guideAnchorIdSchema,
    reason: guideAbsenceReasonSchema,
  }),
])
export type GuideTargetResolution = z.infer<typeof guideTargetResolutionSchema>

/**
 * #2212.41 — LE DÉLAI AU BOUT DUQUEL ON RENONCE, à UN seul endroit (GA-26).
 *
 * 1 200 ms. En dessous, une cible rendue après un aller-retour réseau normal
 * serait déclarée absente à tort (#2212.24, « une cible qui apparaît en
 * retard »). Au-dessus, la personne a déjà commencé à faire autre chose et la
 * bulle qui arrive n'aide plus personne — elle dérange.
 *
 * ⚠️ Ce n'est pas un réglage d'attente « confortable » : c'est la garantie
 * #2212.41 que **rien n'attend indéfiniment**. Une valeur infinie ou nulle n'a
 * pas de sens ici, et le test du contrat le dit.
 */
export const GUIDE_TARGET_TIMEOUT_MS = 1200

/**
 * #2212.44/.45 — LE SCHÉMA D'UN GUIDE, AU-DELÀ DU PAS. Décision Louis
 * (19/09/2026, QCM sur #2212.45) : « je complète moi-même ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ ÇA S'ARRÊTAIT, ET CE QUE CETTE COMPLÉTION AJOUTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le corps de #2212 est coupé net à « Chaque guide doit pouvoir définir :
 * - id ; - versio[n] ». `id` et `version` sont donc les deux champs LUS dans la
 * demande ; les autres (`mode`, `level`, `trigger`, `audience`) sont ceux qui
 * manquaient pour qu'un pas isolé (`GuideSessionRequest`, plus haut) devienne un
 * guide CATALOGUÉ — nommé, retrouvable, et distinct d'un autre guide.
 *
 *  · `id` — un nom stable, jamais réutilisé. Pas la forme d'un ancrage (pas de
 *    points) : un guide n'est pas un écran, c'est un parcours.
 *  · `version` — un entier à partir de 1. Change quand le CONTENU change de
 *    fond en comble, pas à chaque correction de coquille — ce socle ne définit
 *    pas cette frontière plus finement, faute d'un premier guide versionné deux
 *    fois pour l'observer.
 *  · `mode` / `level` — réutilisent `GUIDE_MODES` et `GUIDE_HELP_LEVELS` : un
 *    guide catalogué n'invente pas un second vocabulaire. `level` exclut
 *    `tooltip` pour la même raison que `GuideSessionRequest.level` (plus haut) :
 *    le niveau 1 est une primitive d'interface, jamais une entrée de registre.
 *  · `trigger` — comment il démarre. `manual` (un bouton l'appelle, comme
 *    `FEEDBACK_COACHMARK`) ou `automatic`. Un déclenchement automatique n'a de
 *    sens que pour le mode qui parle sans qu'on le lui demande
 *    (`intervention-proactive`, #2213.20) : les deux autres modes sont
 *    « demandés par la personne, jamais imposés » par leur propre définition
 *    (plus haut) — un tutoriel ou une action guidée qui se déclencherait seul
 *    romprait la promesse écrite trois lignes au-dessus de son propre nom.
 *  · `audience` — une LISTE de personas ciblés, vide par défaut (= tout le
 *    monde). Fermée à une liste, jamais une règle arbitraire : cibler un guide
 *    ne doit jamais pouvoir glisser vers un critère protégé (doctrine).
 *
 * ⚠️ Ce que ce schéma ne fait PAS : il ne porte pas les `steps` d'un guide. Un
 * pas peut désigner un ancrage déclaré côté web (`guide-anchors.ts`), et ce
 * contrat ne connaît pas le web — le coupler forcerait `packages/contracts` à
 * dépendre de l'application qui en dépend déjà. Le registre du web (#2212.44)
 * combine cette définition avec ses pas ; ce fichier reste le vocabulaire.
 */
export const GUIDE_DEFINITION_TRIGGERS = ['manual', 'automatic'] as const
const guideDefinitionTriggerSchema = z.enum(GUIDE_DEFINITION_TRIGGERS)
export type GuideDefinitionTrigger = z.infer<typeof guideDefinitionTriggerSchema>

/**
 * #2214.17-.21 (épopée #2788) — LES CINQ PERSONAS DU CATALOGUE DE GUIDES,
 * telles que #2214 les nomme : Commercial, Recruteur, Manager, ADV/Finance,
 * Administrateur.
 *
 * Liste FERMÉE (GA-26, un seul endroit), et c'est le point du docblock de
 * `audience` ci-dessous : « fermée à une liste, jamais une règle arbitraire —
 * cibler un guide ne doit jamais pouvoir glisser vers un critère protégé ».
 * `audience` acceptait n'importe quelle chaîne (`z.array(z.string())`) depuis
 * #2212.45 sans que rien ne l'ait jamais rempli ni lu (mesuré le 25/09/2026,
 * `git grep` sur `audience` : zéro occurrence hors `[]`) — cet enum ferme le
 * trou en même temps qu'il sert enfin à quelque chose.
 *
 * GA-08 : une sixième persona s'ajoute EN FIN.
 */
export const GUIDE_PERSONAS = ['commercial', 'recruteur', 'manager', 'adv_finance', 'administrateur'] as const
export const guidePersonaSchema = z.enum(GUIDE_PERSONAS)
export type GuidePersona = z.infer<typeof guidePersonaSchema>

export const guideDefinitionSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Un id de guide est un nom kebab-case, sans point (pas un ancrage).'),
    version: z.number().int().min(1),
    mode: guideModeSchema,
    level: guideHelpLevelSchema.exclude(['tooltip']),
    trigger: guideDefinitionTriggerSchema,
    audience: z.array(guidePersonaSchema).default([]),
  })
  .refine(data => data.trigger !== 'automatic' || data.mode === 'intervention-proactive', {
    // #2213.20 — seul le mode qui parle sans qu'on le lui demande peut se
    // déclencher seul ; les deux autres modes sont demandés, jamais imposés.
    message: 'Seul le mode intervention-proactive peut se déclencher automatiquement.',
    path: ['trigger'],
  })
export type GuideDefinition = z.infer<typeof guideDefinitionSchema>
