import { z } from 'zod'
import { workspaceRoleSchema } from './workspace.js'

/**
 * LA MÉMOIRE COLLECTIVE — « le pont, pas le dossier ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CONTRAT PROMET
 * ─────────────────────────────────────────────────────────────────────────────
 * Un croisement dit à un commercial : *ton espace sait déjà quelque chose sur ce
 * compte, et la personne à qui parler s'appelle David*. Il porte **au plus**
 * quatre choses :
 *
 *   1. un **fait typé et daté** — jamais une phrase, jamais un extrait ;
 *   2. l'**objet concerné** — une mission, un besoin, un consultant, un compte ;
 *   3. le **collègue à contacter** — nommé, ou réduit à son rôle ;
 *   4. l'**action suggérée** — prise dans une liste fermée de quatre.
 *
 * Rien d'autre. Pas de contenu, pas de montant, pas de message.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE TYPE, ET PAS UNE CONVENTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Le corps des e-mails **est** stocké dans le journal d'activité — revirement
 * assumé du 16/08, raison écrite dans `activity.ts:34-40`. STOCKER et EXPOSER
 * sont deux décisions distinctes : la première est faite, la seconde reste
 * refusée. La donnée est donc là, à une jointure du service qui dérive les
 * croisements, et elle est tentante — « juste deux lignes de contexte, pour que
 * le collègue comprenne ».
 *
 * La doctrine du dépôt dit de **retirer le MOYEN, pas seulement la permission**.
 * Ce contrat le fait de trois manières, et les trois sont vérifiables :
 *
 *  · **Il n'existe aucun champ de texte libre.** Toute chaîne de l'arbre est un
 *    enum, un littéral, un uuid, une date — ou une {@link ObjectLabel}, marquée
 *    et bornée à {@link OBJECT_LABEL_MAX_LENGTH} caractères.
 *  · **`ObjectLabel` a une seule porte**, {@link objectLabel}, qui exige en
 *    premier argument le NOM d'une colonne pris dans {@link LABEL_SOURCE_COLUMNS}.
 *    `objectLabel('body', …)` **ne compile pas** : `'body'` n'est pas de ce type.
 *    Et comme `ObjectLabel` est une chaîne MARQUÉE, aucun `string` brut — donc
 *    aucun `activity.body` — ne s'assigne à un champ `label` sans passer par là.
 *  · **Tout objet est `.strict()`.** Une clé de plus n'est pas ignorée en
 *    silence : c'est une erreur d'analyse, des deux côtés du fil.
 *
 * La garde `memory-crossing.c4.test.ts` parcourt l'arbre réel et le prouve ; elle
 * démontre aussi qu'elle sait dire NON, sur trois schémas volontairement fautifs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CONTRAT NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Il ne réattribue rien.** Il n'y a pas de champ « nouveau porteur », pas de
 *   `toUserId`, pas de geste d'écriture dans le portefeuille d'un autre. Un
 *   croisement PROPOSE de parler à quelqu'un. C'est tout ce qu'il sait faire.
 * · **Il ne classe personne.** Les croisements sont triés par NATURE (l'ordre de
 *   {@link MEMORY_CROSSING_KINDS}), jamais par collègue. Aucun score, aucun rang,
 *   aucune comparaison entre pairs — et aucun critère protégé (GA-06) : un
 *   collègue porte son nom d'affichage et son rôle, rien de plus.
 * · **Il ne traverse pas d'espace.** Un croisement naît DANS un espace et y
 *   reste. Le coût d'accès ne s'agrège jamais entre espaces (GA-43) — ce
 *   contrat n'a aucun champ qui pourrait porter la donnée d'un autre.
 *
 * La reprise de portefeuille (G13) est LIVRÉE ailleurs, et ne se refait pas ici :
 * voir `workspace-handover.ts`.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * LES QUATRE CERCLES
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Les quatre cercles de visibilité, C4 compris.
 *
 * C4 est nommé ICI et nulle part ailleurs : **un interdit qui n'a pas de nom ne
 * se garde pas**. Le nommer permet de dire « aucun croisement ne traverse C4 »
 * en code plutôt qu'en commentaire.
 *
 * ⚠️ Un enum ne perd jamais de valeur et n'en insère jamais au milieu (GA-08).
 */
export const MEMORY_CIRCLES = [
  /** Faits de référence business, partagés selon la politique de l'espace. */
  'c1',
  /** L'EXISTENCE d'un portage ou d'une activité — le fait minimal seul. */
  'c2',
  /** Agrégeable : gaté par rôle, k-anonyme, bucketé. */
  'c3',
  /** Privé : messages, notes perso, transcripts, économie du deal, commentaires. */
  'c4',
] as const
export const memoryCircleSchema = z.enum(MEMORY_CIRCLES)
export type MemoryCircle = z.infer<typeof memoryCircleSchema>

/** Le cercle qui ne se croise JAMAIS. Nommé une fois, pour pouvoir être exclu. */
export const NEVER_CROSSED_CIRCLE: MemoryCircle = 'c4'

/**
 * Les cercles qu'un croisement peut porter. C4 en est absent, et c'est le
 * schéma — pas une revue de code — qui refuse la charge.
 */
export const CROSSABLE_CIRCLES = ['c1', 'c2', 'c3'] as const
export const crossableCircleSchema = z.enum(CROSSABLE_CIRCLES)
export type CrossableCircle = z.infer<typeof crossableCircleSchema>

/**
 * CE QUI RESTE PRIVÉ — les cinq natures que l'écran nomme, à droite.
 *
 * Les nommer est la moitié du travail, exactement comme
 * {@link PORTFOLIO_PERSONAL_KINDS} pour la reprise de portefeuille : un
 * commercial qui voit « ton espace sait des choses sur ce compte » doit pouvoir
 * lire, sur le même écran, ce que ça ne veut PAS dire.
 *
 * Les libellés vivent dans l'i18n — ce sont des phrases, pas des constantes.
 */
export const MEMORY_PRIVATE_KINDS = [
  'messages',
  'personalNotes',
  'transcripts',
  'marginsAndAmounts',
  'privateComments',
] as const
export type MemoryPrivateKind = (typeof MEMORY_PRIVATE_KINDS)[number]

/* ────────────────────────────────────────────────────────────────────────────
 * L'ÉTIQUETTE D'OBJET — la seule porte par laquelle du texte entre
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * La longueur maximale d'une étiquette. Un nom de compte, un intitulé de poste,
 * un prénom tiennent largement dedans ; un corps d'e-mail, une note ou un
 * transcript, non.
 */
export const OBJECT_LABEL_MAX_LENGTH = 80

/**
 * Les colonnes de NOM dont une étiquette peut provenir. La liste est fermée, et
 * c'est là que se joue l'essentiel : `objectLabel('body', …)` ne compile pas,
 * parce que `'body'` n'appartient pas à ce type.
 *
 * ⚠️ La liste ne contient QUE les colonnes que la dérivation lit réellement —
 * pas une famille de noms plausibles. C'est ce qui en fait une garde et pas une
 * intention : `activities.body`, `notes.content`, `team_comments.body` et
 * `consultants.notes` n'y sont pas, et ne peuvent donc pas être passées.
 *
 * ⚠️ Ajouter une colonne ici est une décision : la question à poser est
 * « cette colonne peut-elle contenir autre chose qu'un NOM ? ». Si oui, non.
 */
export const LABEL_SOURCE_COLUMNS = [
  /** `accounts.company_name` — le nom du compte. */
  'company_name',
  /** `profiles.first_name` — le prénom du collègue affiché sur la carte. */
  'first_name',
  /** `consultants.full_name` — le nom du consultant en intercontrat. */
  'full_name',
  /** `project_needs.title` — l'intitulé du besoin (« Data »). */
  'title',
  /** `missions.label` — le libellé de la mission, quand elle n'a pas d'intitulé. */
  'label',
  /** `missions.role_title` — l'intitulé du poste (« Consultant Java »). */
  'role_title',
] as const
export type LabelSourceColumn = (typeof LABEL_SOURCE_COLUMNS)[number]

/**
 * Une étiquette d'objet : le nom d'une chose, borné et MARQUÉ.
 *
 * La marque (`.brand`) est ce qui rend la fuite impossible à compiler : un
 * `string` brut ne s'assigne pas à un `ObjectLabel`. Pour en fabriquer un, il
 * faut passer par {@link objectLabel}, qui exige de dire de quelle colonne on
 * lit.
 */
export const objectLabelSchema = z.string().trim().min(1).max(OBJECT_LABEL_MAX_LENGTH).brand<'ObjectLabel'>()
export type ObjectLabel = z.infer<typeof objectLabelSchema>

/**
 * LA porte. Rend `null` — jamais une valeur tronquée, jamais une valeur devinée
 * — quand la source n'est pas une colonne de nom, quand la valeur n'est pas un
 * texte, ou quand elle dépasse la longueur d'un nom.
 *
 * Tronquer aurait été le piège : les 80 premiers caractères d'un e-mail restent
 * un e-mail. On refuse.
 */
export function objectLabel(source: LabelSourceColumn, value: unknown): ObjectLabel | null {
  if (!(LABEL_SOURCE_COLUMNS as readonly string[]).includes(source)) return null
  const parsed = objectLabelSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/* ────────────────────────────────────────────────────────────────────────────
 * L'OBJET CONCERNÉ, ET LE COLLÈGUE
 * ──────────────────────────────────────────────────────────────────────────── */

/** Les natures d'objet qu'un croisement peut désigner. Additif en fin (GA-08). */
export const MEMORY_OBJECT_KINDS = ['account', 'mission', 'need', 'consultant'] as const
export const memoryObjectKindSchema = z.enum(MEMORY_OBJECT_KINDS)
export type MemoryObjectKind = z.infer<typeof memoryObjectKindSchema>

/**
 * Une référence à un objet du dépôt : sa nature, son identifiant, son nom.
 *
 * Trois champs, et pas un de plus — c'est ce qu'il faut pour dire « la mission
 * Consultant Java » et pour y aller en cliquant. Le reste du dossier reste où il
 * est : l'écran du compte, la fiche de la mission.
 */
export const memoryObjectRefSchema = z
  .object({
    kind: memoryObjectKindSchema,
    id: z.string().guid(),
    label: objectLabelSchema,
  })
  .strict()
export type MemoryObjectRef = z.infer<typeof memoryObjectRefSchema>

/**
 * Le collègue à contacter — nommé, ou réduit à son rôle.
 *
 * Le second cas n'est pas un repli technique : c'est l'« anonymized member » de
 * la spec. « Passer par le canal cadre — Sales Ops » désigne une FONCTION, pas
 * quelqu'un, et inventer un nom pour remplir la carte serait une donnée fictive.
 *
 * ⚠️ Ni photo, ni âge, ni genre, ni origine, ni adresse : **aucun critère
 * protégé ne pèse dans le rang d'une personne** (GA-06), et l'interdit porte sur
 * la charge utile autant que sur le calcul. Ici il n'y a de toute façon pas de
 * rang : les croisements sont triés par nature, jamais par collègue.
 */
export const bridgeColleagueSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('member'),
      userId: z.string().guid(),
      /** Ce que l'écran affiche : le nom du profil. Rien d'autre de la personne. */
      displayName: objectLabelSchema,
      role: workspaceRoleSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('role'),
      role: workspaceRoleSchema,
    })
    .strict(),
])
export type BridgeColleague = z.infer<typeof bridgeColleagueSchema>

/* ────────────────────────────────────────────────────────────────────────────
 * L'ACTION SUGGÉRÉE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Les quatre actions, et il n'y en a pas d'autres.
 *
 * Toutes les quatre sont des gestes HUMAINS : parler, se coordonner, se
 * présenter, emprunter un canal. **Aucune n'écrit quoi que ce soit** — ni
 * réattribution, ni fusion, ni message envoyé. Une liste fermée est ce qui rend
 * cette phrase vérifiable : « réassigner le compte » n'est pas une valeur
 * possible, donc aucun écran ne peut la proposer.
 */
export const BRIDGE_ACTIONS = [
  /** G1 — parler au porteur avant d'attaquer en direct. */
  'talkToOwnerFirst',
  /** G4 — se coordonner, ou demander un arbitrage. */
  'coordinateOrArbitrate',
  /** G9 — rapprocher les deux porteurs. */
  'introduceBothOwners',
  /** G11 — passer par le canal cadre. */
  'useFrameworkChannel',
] as const
export const bridgeActionSchema = z.enum(BRIDGE_ACTIONS)
export type BridgeAction = z.infer<typeof bridgeActionSchema>

/* ────────────────────────────────────────────────────────────────────────────
 * LA PROVENANCE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * D'où le fait vient — la SOURCE qui le prouve, pas la table où il dort.
 *
 * Invariant n°4 de la spec sécurité : « Every business-event fact stores
 * claim-specific provenance. A source proving identity does not prove
 * relationship, intent, need or outcome. » Un croisement dérivé d'une mission
 * prouve un portage ; il ne prouve pas une intention.
 *
 * Elle sert aussi à nommer une source ILLISIBLE — voir `unreadableSources`.
 */
export const MEMORY_CROSSING_SOURCES = [
  'missions',
  'accountActivity',
  'projectNeeds',
  'consultantAvailability',
  'accessFacts',
] as const
export const memoryCrossingSourceSchema = z.enum(MEMORY_CROSSING_SOURCES)
export type MemoryCrossingSource = z.infer<typeof memoryCrossingSourceSchema>

/* ────────────────────────────────────────────────────────────────────────────
 * LES QUATRE CROISEMENTS
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Les natures de croisement de ce lot, DANS L'ORDRE D'AFFICHAGE.
 *
 * Cet ordre est celui de la maquette, et c'est le seul tri de l'écran : un tri
 * par NATURE, pas par personne. La spec en prévoit six pour la V1 ; G13 (reprise
 * de portefeuille) est déjà livré dans `workspace-handover.ts`, G3 et G14 ne le
 * sont pas — ils s'AJOUTERONT en fin de liste (GA-08).
 */
export const MEMORY_CROSSING_KINDS = [
  /** G1 — porte d'entrée déjà ouverte. */
  'openDoor',
  /** G4 — collision de prospection. */
  'prospectionCollision',
  /** G9 — intercontrat qui matche. */
  'crossStaffing',
  /**
   * G11 — référencement déjà connu.
   *
   * ⚠️ **DIVERGENCE ASSUMÉE DANS LE PAQUET SOURCE.** Deux points, et la maquette
   * fait foi sur les deux :
   *
   *  · `07_COLLECTIVE_MEMORY_SPEC.md:20` et `BEL-SOL6-502` fixent la V1 à
   *    « G1, G3, G4, G9, G13, G14 » — **G11 n'y est pas**. Mais
   *    `business_event_registry_66.csv` tague huit règles en V1, G11 comprise.
   *    Le paquet se contredit ; l'écran, lui, la dessine.
   *  · Le registre l'intitule « Référencement **inconnu** du terrain ». La
   *    maquette l'intitule « Référencement **déjà connu** » — la formulation
   *    inverse. Seule l'action concorde (« passer par le canal cadre »).
   *
   * On livre la maquette : « l'espace est référencé rang 2 depuis 2024 » est un
   * fait vrai, daté, et utile. « Référencement inconnu » serait un AUTRE
   * croisement — l'absence d'information, qui appelle une vérification et non un
   * canal. Il n'est pas livré ici.
   */
  'knownReferencing',
] as const
export const memoryCrossingKindSchema = z.enum(MEMORY_CROSSING_KINDS)
export type MemoryCrossingKind = z.infer<typeof memoryCrossingKindSchema>

/**
 * L'identifiant de graphe affiché sur la puce de chaque carte.
 *
 * Il vit ICI plutôt que dans l'écran : « G4 » est le nom du croisement dans la
 * spec, et deux écrans qui le recalculeraient finiraient par ne pas dire la même
 * chose. Un réglage vit à un seul endroit (GA-26).
 */
export const MEMORY_CROSSING_GRAPH_IDS: Readonly<Record<MemoryCrossingKind, string>> = {
  openDoor: 'G1',
  prospectionCollision: 'G4',
  crossStaffing: 'G9',
  knownReferencing: 'G11',
}

/** Une date civile, sans heure : « en mars », pas « le 4 mars à 09:12 ». */
const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * G1 — un consultant a démarré chez ce client, la mission est encore active.
 *
 * Ce que ça porte : l'INTITULÉ du poste (« Consultant Java »), le mois de
 * démarrage, et si la mission court toujours. Ce que ça ne porte pas, et ne
 * pourrait pas porter : le TJM, la marge, le nom du client final, le contenu du
 * dernier échange.
 */
const openDoorDetailSchema = z
  .object({
    kind: z.literal('openDoor'),
    mission: memoryObjectRefSchema,
    startedOn: civilDateSchema,
    stillActive: z.boolean(),
  })
  .strict()

/**
 * G4 — quelqu'un d'autre travaille ce compte en ce moment.
 *
 * `withinDays` est la FENÊTRE dans laquelle l'activité a été vue, pas un
 * compteur de touches : « cette semaine » se dit avec 7, et l'écran le traduit.
 * Compter les touches d'un collègue serait un début de classement entre pairs.
 */
const prospectionCollisionDetailSchema = z
  .object({
    kind: z.literal('prospectionCollision'),
    lastTouchOn: civilDateSchema,
    withinDays: z.number().int().positive(),
  })
  .strict()

/**
 * G9 — un consultant disponible d'un côté, un besoin ouvert de l'autre.
 *
 * Deux références, rien de plus. Pas de score de matching : le croisement dit
 * qu'il y a matière à se parler, il ne note ni le consultant ni le besoin — et
 * surtout il ne classe pas des personnes (GA-06).
 */
const crossStaffingDetailSchema = z
  .object({
    kind: z.literal('crossStaffing'),
    consultant: memoryObjectRefSchema,
    need: memoryObjectRefSchema,
  })
  .strict()

/**
 * G11 — l'espace est déjà référencé sur ce périmètre.
 *
 * ⚠️ `rank` commence à 1 et vaut `null` quand le rang n'est pas connu. Zéro n'est
 * pas un rang : l'écrire ferait lire « dernier », qui est faux. « Non mesuré
 * n'est jamais 0 » s'applique mot pour mot, et le schéma le refuse.
 */
const knownReferencingDetailSchema = z
  .object({
    kind: z.literal('knownReferencing'),
    rank: z.number().int().positive().nullable(),
    sinceYear: z.number().int().positive().nullable(),
  })
  .strict()

/** Le détail, par nature. Une nature = une forme, et elles ne se mélangent pas. */
export const memoryCrossingDetailSchema = z.discriminatedUnion('kind', [
  openDoorDetailSchema,
  prospectionCollisionDetailSchema,
  crossStaffingDetailSchema,
  knownReferencingDetailSchema,
])
export type MemoryCrossingDetail = z.infer<typeof memoryCrossingDetailSchema>

/**
 * UN CROISEMENT — le pont.
 *
 * ⚠️ `kind` et `detail.kind` doivent coïncider : un G1 dont le détail serait un
 * G9 décrirait une chose et en afficherait une autre. Le raffinement le refuse.
 */
export const memoryCrossingSchema = z
  .object({
    kind: memoryCrossingKindSchema,
    circle: crossableCircleSchema,
    /** Le compte sur lequel on est. Le croisement ne sort pas de ce compte. */
    subject: memoryObjectRefSchema,
    colleague: bridgeColleagueSchema,
    action: bridgeActionSchema,
    /** QUAND le fait a été constaté. Un fait sans date est une rumeur. */
    observedAt: z.string().datetime({ offset: true }),
    /**
     * Jusqu'à quand il vaut. `null` = sans échéance — comme
     * `memory-item.ts`. Passée l'échéance, le fait **redevient inconnu avec sa
     * date**, il ne disparaît pas : on archive, on ne supprime pas.
     */
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    provenance: memoryCrossingSourceSchema,
    detail: memoryCrossingDetailSchema,
  })
  .strict()
  .refine(crossing => crossing.kind === crossing.detail.kind, {
    message: 'detail.kind must match the crossing kind',
    path: ['detail', 'kind'],
  })
export type MemoryCrossing = z.infer<typeof memoryCrossingSchema>

/* ────────────────────────────────────────────────────────────────────────────
 * LA POLITIQUE DE L'ESPACE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * LES DEUX SEUILS, ET D'OÙ ILS VIENNENT.
 *
 * ⚠️ **Leur seule source est la maquette `05_memoire_collective.png`.** Ce n'est
 * pas une formule de style : `07_COLLECTIVE_MEMORY_SPEC.md` dit « k-anonymous,
 * bucketed » et `09_SECURITY_PRIVACY_RBAC.md` §6 « minimum observations,
 * buckets » — **ni l'un ni l'autre ne donne de valeur**. De même, la spec et le
 * registre disent « Owner first, no automatic reassignment » **sans aucune
 * fenêtre temporelle** : les 7 jours n'existent que sur cet écran.
 *
 * Deux nombres dessinés sur une maquette ne sont donc **pas des mesures**. Ils
 * sont écrits ICI, une seule fois, nommés, avec cette phrase — pour que personne
 * ne les lise comme un chiffre observé, et pour qu'un espace qui voudra les
 * changer un jour trouve un seul endroit à modifier (GA-26).
 *
 * Ils ne sont **pas** des colonnes : aucun espace ne peut les régler aujourd'hui,
 * et une colonne réglable sans écran de réglage est un chemin d'écriture que
 * personne n'emprunte. Le jour où un espace doit pouvoir les changer, ils
 * deviennent une colonne — et ce commentaire dit quoi remplacer.
 */
export const MEMORY_POLICY_DEFAULTS = {
  /**
   * Combien de jours le porteur d'un compte reste prioritaire. Sur cette
   * fenêtre, une collision se signale à celui qui arrive, pas au porteur.
   */
  ownerPriorityDays: 7,
  /**
   * Le k des agrégats C3. **Il n'est pas décoratif** : un agrégat qui descend
   * sous k observations ne s'affiche pas — ni une valeur, ni un « 0 ».
   *
   * ⚠️ Ce lot n'émet AUCUN croisement C3, et une garde le vérifie plutôt que de
   * le promettre. Le seuil est donc affiché comme l'engagement de l'espace, pas
   * appliqué à un calcul qui n'existe pas encore : brancher un `if (n < k)` sur
   * un agrégat inexistant serait du code que personne n'appelle.
   */
  kAnonymityThreshold: 5,
  /**
   * Les croisements consomment le budget d'attention de la matinée plutôt qu'un
   * budget à eux — sinon chaque nouvelle famille de notification ajoute son
   * propre bruit, et l'écran du matin cesse d'être lisible.
   */
  morningBudget: 'shared',
} as const

/**
 * Ce que l'espace a décidé — le panneau de droite de l'écran.
 *
 * ⚠️ Ce qui n'est PAS ici est aussi important que ce qui y est :
 *
 * · **`autoReassign` n'existe pas.** « Aucune réattribution automatique » n'est
 *   pas un réglage à laisser à ON : c'est un INVARIANT du contrat. Il n'y a
 *   aucun champ à mettre à `false`, donc rien à remettre à `true` un jour où
 *   quelqu'un serait pressé. Le schéma étant strict, l'ajouter est une erreur.
 * · **`restrictedAccounts` est en LECTURE.** Le cloisonnement du portefeuille se
 *   règle déjà dans Équipe (`portfolio-visibility.ts`, `PATCH
 *   /workspaces/portfolio-visibility`). Un réglage vit à un seul endroit
 *   (GA-26) : cet écran le MONTRE, il ne le duplique pas.
 */
export const workspaceMemoryPolicySchema = z
  .object({
    /**
     * « Mode de partage : Pont ». Un LITTÉRAL, pas un enum à deux valeurs : il
     * n'existe pas de mode « dossier », et il ne faut pas laisser croire qu'il
     * suffirait de basculer un réglage pour l'obtenir.
     */
    sharingMode: z.literal('bridge'),
    /**
     * Combien de jours le porteur d'un compte reste prioritaire avant qu'une
     * collision se signale à quelqu'un d'autre. La maquette dit 7.
     */
    ownerPriorityDays: z.number().int().positive(),
    /**
     * Le k des agrégats C3. Sous 2, un « agrégat » désigne une seule
     * observation, donc une seule personne : le schéma le refuse.
     *
     * ⚠️ Ce lot n'émet AUCUN croisement C3. Le seuil est affiché parce qu'il
     * gouverne ce qui viendra ; il n'est pas décoratif pour autant, la
     * dérivation le lit avant d'émettre quoi que ce soit de C3.
     */
    kAnonymityThreshold: z.number().int().min(2),
    /**
     * « Croisements dans la matinée : budget partagé ». Les croisements
     * consomment le budget d'attention de la matinée plutôt qu'un budget à eux —
     * sinon chaque nouvelle famille de notification ajoute son propre bruit.
     */
    morningBudget: z.enum(['shared', 'separate']),
    /** Dérivé de `portfolioVisibility === 'restricted'`. Lecture seule ici. */
    restrictedAccounts: z.boolean(),
  })
  .strict()
export type WorkspaceMemoryPolicy = z.infer<typeof workspaceMemoryPolicySchema>

/* ────────────────────────────────────────────────────────────────────────────
 * LA MESURE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * « Ce mois-ci, Bellum a connecté 14 fois deux personnes de ton équipe. »
 *
 * ⚠️ `connectionsThisMonth` est NULLABLE, et c'est tout l'objet de ce schéma.
 * Trois états, pas deux :
 *
 *  · un nombre > 0 — mesuré, et il y en a eu ;
 *  · `0` avec un `measuredSince` — mesuré, et il n'y en a pas eu ce mois-ci.
 *    C'est une mesure VRAIE, et l'écran l'affiche comme telle ;
 *  · `null` avec `measuredSince: null` — **pas assez d'historique pour
 *    mesurer**. Le journal n'a jamais rien enregistré pour cet espace. Écrire
 *    « 0 fois » ici serait faux, et se lirait « le produit ne sert à rien ».
 *
 * ⚠️ **Ce compteur compte des RAPPROCHEMENTS, jamais des personnes.** Le §24
 * « Red Team » de la doctrine l'exige : « surveillance des salariés → aucun
 * classement entre pairs ». Il n'existe donc ici NI ventilation par membre, NI
 * champ d'identité, NI classement — et le schéma étant strict, on ne peut pas en
 * ajouter par distraction. On ne doit pouvoir déduire de ce chiffre ni qui est
 * actif, ni qui ne l'est pas.
 */
export const bridgeConnectionsSchema = z
  .object({
    connectionsThisMonth: z.number().int().nonnegative().nullable(),
    /** Depuis quand le journal existe pour cet espace. `null` = il n'existe pas. */
    measuredSince: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
export type BridgeConnections = z.infer<typeof bridgeConnectionsSchema>

/* ────────────────────────────────────────────────────────────────────────────
 * LA VUE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Réponse de `GET /workspaces/memory/accounts/:accountId`.
 *
 * ⚠️ `unreadableSources` n'est pas un détail d'implémentation, et c'est la même
 * leçon que `unreadableLayers` dans `memory-ledger.ts` : une source dont la
 * lecture ÉCHOUE et une source qui n'a rien à dire se ressemblent à l'écran, et
 * la seconde se lit « ton espace ne sait rien de ce compte ». Une phrase fausse
 * et rassurante. La source tombée est NOMMÉE, et l'écran le dit.
 */
export const memoryBridgeViewSchema = z
  .object({
    account: memoryObjectRefSchema,
    crossings: z.array(memoryCrossingSchema),
    policy: workspaceMemoryPolicySchema,
    connections: bridgeConnectionsSchema,
    unreadableSources: z.array(memoryCrossingSourceSchema),
  })
  .strict()
export type MemoryBridgeView = z.infer<typeof memoryBridgeViewSchema>

/**
 * Une ligne de `GET /workspaces/memory/accounts` — la porte d'entrée de l'écran.
 *
 * Elle ne porte PAS les croisements eux-mêmes : juste de quoi dire « ce compte a
 * de la matière » et y aller. Le détail se lit sur l'écran du compte, une fois
 * qu'on a cliqué — c'est le même principe que le pont, appliqué à la liste.
 */
export const memoryBridgeAccountSchema = z
  .object({
    account: memoryObjectRefSchema,
    /** Les natures présentes, dans l'ordre d'affichage. Jamais un total nu. */
    kinds: z.array(memoryCrossingKindSchema),
  })
  .strict()
export type MemoryBridgeAccount = z.infer<typeof memoryBridgeAccountSchema>

export const memoryBridgeAccountListSchema = z
  .object({
    accounts: z.array(memoryBridgeAccountSchema),
    unreadableSources: z.array(memoryCrossingSourceSchema),
  })
  .strict()
export type MemoryBridgeAccountList = z.infer<typeof memoryBridgeAccountListSchema>

/**
 * Corps de `POST /workspaces/memory/bridges/contact` — « j'ai contacté ce
 * collègue à propos de ce croisement ».
 *
 * C'est le journal de contribution de la spec, et le SEUL chemin d'écriture de
 * tout ce contrat. Ce qu'il écrit : que deux personnes ont été mises en
 * relation, sur quel compte, pour quelle nature de croisement. Ce qu'il n'écrit
 * pas : ce qu'elles se sont dit.
 */
export const recordBridgeContactSchema = z
  .object({
    accountId: z.string().guid(),
    kind: memoryCrossingKindSchema,
    /** Le collègue contacté. `null` quand le croisement ne désignait qu'un rôle. */
    colleagueUserId: z.string().guid().nullable(),
  })
  .strict()
export type RecordBridgeContact = z.infer<typeof recordBridgeContactSchema>
