import { z } from 'zod'
import type { DecisionRole } from './contact.js'
import type { OfferDomain } from './onboarding.js'
import type { RelationshipState } from './sales-context.js'
import { DISCOVERY_QUESTIONS, selectQuestions, type DiscoveryFamily } from './meeting-questions.js'

/**
 * Le BRIEF D'AVANT rendez-vous — huit blocs, et chacun dit d'où il vient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER DÉCIDE, ET POURQUOI IL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La spécification tenait en une phrase : « sept blocs compacts — qui, historique,
 * ce qui bouge, enjeux probables (inférence ÉTIQUETÉE), entourage, ce qu'on peut
 * positionner, et le résultat à obtenir. L'objectif est déterministe à partir du
 * type de rendez-vous et du stade relationnel ; le modèle EXPLIQUE, il n'invente
 * pas le stade. » Un huitième s'y est ajouté depuis (#1934.10) : les objections
 * probables, déjà écrites par la phase 1 et jusque-là jamais raccordées ici.
 *
 * Tout le lot se joue sur la deuxième moitié de chaque bloc : **la ligne
 * dessous**. Un bloc SOURCÉ dit sa source ET sa date ; un bloc DÉDUIT le dit ;
 * un bloc qui ne sait dire ni l'un ni l'autre **ne s'affiche pas**. C'est
 * exactement la doctrine `Provenance` du dépôt (la source ET la date), appliquée
 * à un écran — et c'est ce qui empêche la phrase qui tue un brief : « détecté par
 * Bellum », sans rien derrière, lue en réunion comme un fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  · Il ne RÉDIGE rien. Les questions viennent de la banque du dépôt
 *    (`meeting-questions.ts`, verbatim de `agent_docs/kb/`) ; l'objectif est un
 *    couple de clés fermées que l'écran traduit. Aucune phrase n'est fabriquée
 *    ici, et aucun modèle n'est appelé.
 *  · Il ne DEVINE pas le type de rendez-vous. Quatre des huit types de la
 *    spécification ne sont pas dérivables de ce que le produit sait aujourd'hui
 *    (voir {@link deriveMeetingType}) : dans ces cas l'objectif est ABSENT.
 *    Un objectif inventé envoie quelqu'un en réunion avec la mauvaise intention,
 *    ce qui est strictement pire que pas d'objectif du tout.
 *  · Il ne classe personne sur autre chose que son RÔLE. Aucun critère protégé
 *    n'entre dans ce fichier — ni dans ses types d'entrée, ni dans son calcul
 *    (doctrine `c58_criteres_proteges`).
 *
 * ⚠️ Le brief d'APRÈS (compte rendu, cascade des neuf sorties) est un autre
 * objet, dans un autre fichier : `meeting-notes.ts`. Les deux moments ne
 * partagent aucune structure, volontairement — un brief se lit avant, un compte
 * rendu s'écrit après, et les mélanger produirait un écran qui parle des deux.
 */

/* -------------------------------------------------------------------------- */
/*  L'ORIGINE D'UN BLOC                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Ce qu'une source PEUT être : une CAPACITÉ, jamais un éditeur.
 *
 * « votre CRM », « votre messagerie », « les offres publiées » — jamais le nom
 * du logiciel. C'est la doctrine « jamais de nom d'éditeur côté app », et elle a
 * ici une raison supplémentaire : la même ligne se lit à voix haute en réunion.
 */
export const MEETING_BRIEF_SOURCES = [
  /** Le CRM de l'espace — natif ou branché. */
  'crm',
  /** La messagerie de l'utilisateur. Seules les MÉTADONNÉES la traversent. */
  'mailbox',
  /** L'agenda branché. */
  'agenda',
  /** La fiche contact telle qu'elle est tenue dans Bellum. */
  'contact_record',
  /** Le dossier d'analyse du compte. */
  'account_analysis',
  /** Les offres d'emploi publiées par l'entreprise. */
  'job_postings',
  /** La presse et les annonces publiques. */
  'press',
  /** Un registre public (immatriculation, dirigeants). */
  'registry',
  /** Le vivier : les consultants et leurs disponibilités. */
  'bench',
  /** La téléphonie branchée. */
  'telephony',
  /** Saisi dans Bellum par quelqu'un de l'espace — la source la plus forte. */
  'workspace',
] as const
export const meetingBriefSourceSchema = z.enum(MEETING_BRIEF_SOURCES)
export type MeetingBriefSource = (typeof MEETING_BRIEF_SOURCES)[number]

/**
 * Ce qui, dans un bloc MIXTE, reste PROBABLE.
 *
 * « Hiérarchie sourcée / influence probable » : la moitié gauche est un fait, la
 * moitié droite une lecture. Les nommer séparément est la seule façon d'écrire
 * cette ligne sans mentir sur l'une des deux.
 */
export const MEETING_BRIEF_PROBABLES = [
  'influence',
  'sponsorship',
  'stakes',
  /**
   * #2319.34 — un RISQUE est une lecture posée sur un fait de fiche (« a
   * peut-être quitté l'entreprise », « bloqueur identifié ») : le fait est
   * daté, sa conséquence pour ce rendez-vous reste probable. En fin de liste.
   */
  'risk',
] as const
export type MeetingBriefProbable = (typeof MEETING_BRIEF_PROBABLES)[number]

/** Ce dont un bloc DÉRIVÉ dérive — la trace du calcul, pas une source de donnée. */
export const MEETING_BRIEF_DERIVED_FROM = [
  'meeting_type',
  'relationship_state',
  /** #2319.31 — les limites du brief se CALCULENT sur ce qui a pu être lu. */
  'brief_coverage',
  /** #4424.4 — le pitch et les références se composent depuis le profil de l'espace. */
  'esn_profile',
  /** #4424.3 — la reprise du R1 se calcule sur les comptes rendus déjà écrits. */
  'prior_meeting',
  /** #4424.2 — les REX sont une SÉLECTION de ce que l'espace sait déjà. */
  'workspace_knowledge',
] as const
export type MeetingBriefDerivedFrom = (typeof MEETING_BRIEF_DERIVED_FROM)[number]

/**
 * Comment ce bloc sait ce qu'il dit. Cinq états, et ils ne disent pas la même
 * chose — c'est tout l'objet du type.
 */
export type MeetingBriefGround =
  /** Un fait : la source ET la date. Sans l'une des deux, ce n'est pas ce cas. */
  | { readonly kind: 'sourced'; readonly sources: readonly MeetingBriefSource[]; readonly observedAt: string }
  /** Une part sourcée, une part probable, chacune nommée. */
  | {
      readonly kind: 'mixed'
      readonly sources: readonly MeetingBriefSource[]
      readonly observedAt: string
      readonly probable: readonly MeetingBriefProbable[]
    }
  /** Déduit — « à confirmer pendant le rendez-vous ». Le bloc le DIT. */
  | { readonly kind: 'inferred' }
  /** Calculé par le produit, sans modèle : on nomme ce dont ça dérive. */
  | { readonly kind: 'derived'; readonly from: readonly MeetingBriefDerivedFrom[] }
  /** On ne sait pas d'où ça vient ⇒ {@link buildMeetingBrief} retire le bloc. */
  | { readonly kind: 'unattributed' }

/** Ce qu'on sait de l'origine d'un bloc, avant de le qualifier. */
export type GroundInput = {
  readonly sources?: readonly MeetingBriefSource[]
  /** La date d'OBSERVATION de la source. Absente ⇒ ce n'est pas une source. */
  readonly observedAt?: string | Date | null
  /** Ce qui reste probable malgré la source. */
  readonly probable?: readonly MeetingBriefProbable[]
  /** Le bloc est une lecture, pas un relevé. */
  readonly inferred?: boolean
  /** Le bloc est calculé — on nomme ce dont il dérive. */
  readonly derivedFrom?: readonly MeetingBriefDerivedFrom[]
}

/**
 * Qualifie l'origine d'un bloc — et REFUSE de la surqualifier.
 *
 * Les deux refus qui font tout le travail :
 *
 *  1. **Une source sans date n'est pas une source.** C'est la moitié la plus
 *     facile à oublier, et la plus coûteuse : « historique CRM » sans date se
 *     lit « à jour », alors que la dernière vérification peut remonter à mars.
 *  2. **Ce qui est déduit reste déduit**, même quand une source traîne à côté.
 *     Emprunter la crédibilité d'une source voisine est exactement le geste que
 *     l'étiquetage d'inférence existe pour empêcher.
 *
 * Ordre d'évaluation : `derivedFrom` d'abord (un calcul n'a pas de source de
 * donnée), puis `inferred`, puis le couple source + date.
 */
export function describeGround(input: GroundInput): MeetingBriefGround {
  const derivedFrom = input.derivedFrom ?? []
  if (derivedFrom.length > 0) return { kind: 'derived', from: [...derivedFrom] }
  if (input.inferred === true) return { kind: 'inferred' }

  const sources = input.sources ?? []
  const probable = input.probable ?? []
  const observedAt = readIso(input.observedAt)

  if (sources.length === 0 || observedAt === null) {
    // Une part probable seule reste une lecture — donc « déduit », qui est une
    // réponse. Rien du tout n'en est pas une : le bloc ne s'affichera pas.
    return probable.length > 0 ? { kind: 'inferred' } : { kind: 'unattributed' }
  }
  return probable.length > 0
    ? { kind: 'mixed', sources: [...sources], observedAt, probable: [...probable] }
    : { kind: 'sourced', sources: [...sources], observedAt }
}

/** Une date lisible, normalisée en ISO — sinon `null`, jamais « aujourd'hui ». */
function readIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/* -------------------------------------------------------------------------- */
/*  LES HUIT BLOCS                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Les huit blocs, dans l'ordre de lecture de la maquette (les sept d'origine,
 * plus les objections probables — #1934.10).
 *
 * L'ordre porte une intention : on sait QUI on voit avant de savoir ce qu'on
 * s'est dit, et on ne parle de ce qu'on veut obtenir qu'à la fin. Un enum
 * n'insère jamais au milieu (GA-08) — un bloc de plus s'ajoute en fin de liste.
 */
export const MEETING_BRIEF_BLOCKS = [
  /** 01 · QUI — la personne, son poste, son périmètre. */
  'who',
  /** 02 · CE QU'ON S'EST DIT — l'historique daté. */
  'history',
  /** 03 · CE QUI BOUGE CHEZ EUX — les signaux datés. */
  'moving',
  /** 04 · SES ENJEUX PROBABLES — déduit, et étiqueté comme tel. */
  'stakes',
  /** 05 · AUTOUR D'ELLE — l'entourage, hiérarchie sourcée / influence probable. */
  'around',
  /** 06 · CE QUE TU PEUX POSITIONNER — les profils disponibles. */
  'positionable',
  /** 07 · CE QUE TU VEUX OBTENIR — l'objectif, dérivé. */
  'outcome',
  /**
   * 08 · OBJECTIONS PROBABLES — #1934.10.
   *
   * La phase 1 (recherche) produit déjà `objections` (l'analyse de stratégie) et
   * le stocke sur `accounts.raw_analysis` — le plan (phase 4) le LIT pour
   * construire son prompt, il ne le produit pas ; rien depuis ne le raccordait
   * au brief. Ajouté en FIN de liste : un enum n'insère jamais au milieu (GA-08).
   */
  'objections',
  /*
   * #2319 — les cinq rubriques de la spécification que le brief n'avait pas.
   * Ajoutées EN FIN (GA-08) : l'ordre de LECTURE vit à part, dans
   * {@link MEETING_BRIEF_READING_ORDER}, pour que l'enum n'ait jamais à
   * s'insérer au milieu.
   */
  /** 5 · TROIS FAITS UTILES — datés, sourcés, trois au plus (#2319.30). */
  'facts',
  /** 6 · CE QUE CE BRIEF NE SAIT PAS — les trous de lecture, nommés (#2319.31). */
  'limits',
  /** 8 · OPPORTUNITÉS, BESOINS, MISSIONS LIÉS — les fiches de l'espace (#2319.33). */
  'linked',
  /** 9 · RISQUES — un fait de fiche, et sa lecture probable (#2319.34). */
  'risks',
  /** 13 · CE QUI RESTE À VÉRIFIER — tout ce que le brief a DÉDUIT (#2319.38). */
  'to_verify',
  /*
   * #4424.1 — le R1, le R2 et le pitch. Ajoutés EN FIN (GA-08) ; leur rang de
   * lecture vit dans {@link MEETING_BRIEF_READING_ORDER}.
   */
  /** REX À CITER — missions passées, preuves client, références du profil (#4424.2). */
  'rex',
  /** PROPOSER L'ATELIER — la sortie attendue d'un R1 (#4424.2). */
  'workshop_proposal',
  /** LE PITCH — 3 à 5 phrases, offre de l'ESN × enjeu du compte, tous types (#4424.4). */
  'pitch',
  /** CE QUE LE R1 A APPRIS — repris dans le R2, ou son absence DITE (#4424.3). */
  'r1_recap',
] as const
export const meetingBriefBlockKeySchema = z.enum(MEETING_BRIEF_BLOCKS)
export type MeetingBriefBlockKey = (typeof MEETING_BRIEF_BLOCKS)[number]

/**
 * #2102.31 — ce qu'un bloc n'a PAS pu établir, en clés fermées (donc traduisibles, FR/EN). Une clé = une
 * inconnue que le bloc sait nommer ; la liste vide est la réponse « rien à signaler », jamais « 0 ».
 */
export const MEETING_BRIEF_UNKNOWNS = [
  /** Qui — le rôle de décision n'est pas établi sur la fiche. */
  'decision_role',
  /** Qui — l'ancienneté dans le poste : aucun champ du dépôt ne la porte. */
  'tenure',
  /** Ce qui bouge — des signaux sans date ont été écartés. */
  'undated_signals',
  /** Autour d'elle — le rôle de décision d'au moins une personne n'est pas établi. */
  'relation_roles',
  /** Ce que tu peux positionner — des profils à disponibilité non vérifiée ont été écartés. */
  'availability_unverified',
] as const
export type MeetingBriefUnknown = (typeof MEETING_BRIEF_UNKNOWNS)[number]

/** Un bloc candidat, tel que l'assembleur le reçoit. */
export type MeetingBriefBlockInput = {
  readonly key: MeetingBriefBlockKey
  /** Le contenu. Un bloc sans ligne n'existe pas. */
  readonly lines: readonly string[]
  /** Le détail secondaire (ancienneté, employeur précédent, une raison). */
  readonly note?: string | null
  readonly ground: MeetingBriefGround
  /** #2102.31 — ce que le bloc n'a pas pu établir. Absent = rien à nommer. */
  readonly unknowns?: readonly MeetingBriefUnknown[]
}

/** Un bloc retenu, prêt à l'écran. */
export type MeetingBriefBlock = {
  /** Le rang de LECTURE (1…n), pas un identifiant : `key` joue ce rôle. */
  readonly index: number
  readonly key: MeetingBriefBlockKey
  readonly lines: readonly string[]
  readonly note: string | null
  readonly ground: MeetingBriefGround
  /**
   * #2319.25 — combien de lignes le bloc a laissées au dossier pour tenir le
   * brief en cinq minutes. `0` est vrai ici : on a compté, rien n'a été coupé.
   */
  readonly moreCount: number
  /** #2102.31 — les inconnues du bloc, sans doublon ; `[]` = rien à nommer. */
  readonly unknowns: readonly MeetingBriefUnknown[]
}

/**
 * #2319 — l'ordre de LECTURE des treize rubriques, celui de la spécification
 * (objectif mis à part : il vit dans sa colonne). Distinct de l'énumération,
 * qui ne fait que s'allonger (GA-08).
 */
export const MEETING_BRIEF_READING_ORDER: readonly MeetingBriefBlockKey[] = [
  'who',
  // #4424.4 — le pitch se lit tôt : c'est ce qu'on dit dans la première minute.
  'pitch',
  'history',
  // #4424.3 — ce que le R1 a appris prolonge l'historique.
  'r1_recap',
  'moving',
  'facts',
  // #4424.2 — les REX à citer, après les faits du compte.
  'rex',
  'limits',
  'stakes',
  'around',
  'linked',
  'positionable',
  // #4424.2 — la proposition d'atelier, juste avant les risques et l'objectif.
  'workshop_proposal',
  'risks',
  'objections',
  'to_verify',
  'outcome',
]

/**
 * #2319.25 — « le brief doit tenir en cinq minutes ; ne pas produire une
 * encyclopédie ». Trois lignes par rubrique : de quoi reprendre le fil. Le
 * reste n'est pas perdu, il est COMPTÉ ({@link MeetingBriefBlock.moreCount}) —
 * une coupe silencieuse ferait croire que le dossier n'en dit pas plus.
 */
export const MEETING_BRIEF_MAX_LINES_PER_BLOCK = 3

const BLOCK_ORDER: Readonly<Record<MeetingBriefBlockKey, number>> = Object.fromEntries(
  MEETING_BRIEF_READING_ORDER.map((key, position) => [key, position]),
) as Record<MeetingBriefBlockKey, number>

/**
 * Assemble le brief — et RETIRE ce qui ne tient pas debout.
 *
 * Deux retraits, deux raisons distinctes :
 *
 *  · **Un bloc sans contenu** : une carte vide fait croire que l'analyse n'a
 *    rien trouvé, alors qu'elle n'a peut-être pas regardé.
 *  · **Un bloc non attribué** : il ne peut pas se faire passer pour un fait,
 *    donc il se tait. C'est la règle centrale du brief.
 *
 * La numérotation est CONTINUE. Un « 01 · 02 · 04 » se lit comme un bug, et le
 * numéro n'a jamais servi qu'à donner un ordre de lecture à voix haute.
 */
export function buildMeetingBrief(blocks: readonly MeetingBriefBlockInput[]): MeetingBriefBlock[] {
  const seen = new Set<MeetingBriefBlockKey>()
  const printed = new Set<string>()
  return blocks
    .filter(block => {
      if (seen.has(block.key)) return false
      seen.add(block.key)
      return true
    })
    .map(block => ({ ...block, lines: block.lines.map(line => line.trim()).filter(line => line.length > 0) }))
    .filter(block => block.lines.length > 0 && block.ground.kind !== 'unattributed')
    .sort((a, b) => BLOCK_ORDER[a.key] - BLOCK_ORDER[b.key])
    .map(block => {
      // #4424.2 — une phrase déjà lue dans un bloc PRÉCÉDENT (ordre de lecture) ne se répète pas : la même
      // phrase dans trois blocs faisait croire à trois constats, alors que c'en est un.
      const lines = block.lines.filter(line => {
        const fingerprint = line
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim()
        if (printed.has(fingerprint)) return false
        printed.add(fingerprint)
        return true
      })
      return { ...block, lines }
    })
    .filter(block => block.lines.length > 0)
    .map((block, position) => ({
      index: position + 1,
      key: block.key,
      lines: block.lines.slice(0, MEETING_BRIEF_MAX_LINES_PER_BLOCK),
      note: block.note?.trim() ? block.note.trim() : null,
      ground: block.ground,
      moreCount: Math.max(0, block.lines.length - MEETING_BRIEF_MAX_LINES_PER_BLOCK),
      // #2102.31 — les inconnues voyagent avec LEUR bloc, dédoublonnées.
      unknowns: [...new Set(block.unknowns ?? [])],
    }))
}

/* -------------------------------------------------------------------------- */
/*  LE TYPE DE RENDEZ-VOUS                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Les huit types de la spécification, dans son ordre. Quatre d'entre eux ne sont
 * pas dérivables aujourd'hui — voir {@link deriveMeetingType}. Ils sont déclarés
 * quand même : le jour où le produit saura les distinguer, la valeur existera
 * déjà et aucun enum n'aura à s'insérer au milieu (GA-08).
 */
export const MEETING_TYPES = [
  'first_contact',
  'warm_reactivation',
  'open_opportunity',
  'profile_presentation',
  'active_client_review',
  'steering_committee',
  'partner_meeting',
  'internal_meeting',
  /**
   * #2319.48 / .51 — Qualification et Achats. Aucun état de relation ne les
   * distingue : ils ne se DÉRIVENT jamais, ils se CHOISISSENT dans le brief.
   * En fin de liste (GA-08).
   */
  'qualification',
  'procurement',
  /**
   * #4424.1 (décision Louis 21/10) — le R1 (cold call / premier rendez-vous :
   * ouverture → REX → découverte → proposition d'atelier) et le R2 (l'atelier :
   * besoin, cadrage, brief des opportunités, suite). Comme Qualification et
   * Achats, ils ne se DÉRIVENT pas : ils se CHOISISSENT. En fin de liste (GA-08).
   */
  'r1_discovery',
  'r2_workshop',
  /**
   * #2102.35 (Renouvellement) / #2102.36 (Entretien consultant), arbitrage Louis
   * 31/10 — comme Qualification et Achats, aucun état de relation ne les
   * distingue : ils se CHOISISSENT, ne se dérivent jamais. En fin de liste (GA-08).
   */
  'renewal',
  'consultant_interview',
] as const
export const meetingTypeSchema = z.enum(MEETING_TYPES)
export type MeetingType = (typeof MEETING_TYPES)[number]

/**
 * Le type de rendez-vous — ou `null`, et c'est une réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉRIVABLE AUJOURD'HUI, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'état de la relation n'est PAS recalculé ici : c'est `relationshipStateSchema`
 * (`sales-context.ts`), la taxonomie déjà produite par l'analyse avec sa
 * provenance (`derivation`, `confidence`, `lastInteractionAt`, `evidence[]`).
 * En redériver une seconde depuis l'historique aurait donné deux verdicts
 * concurrents sur le même compte — et le brief aurait affiché celui des deux qui
 * se trouvait le plus près de l'écran.
 *
 * Dérivable :
 *  · `internal_meeting` — aucun invité hors de l'organisation. Certain.
 *  · `first_contact` — `froid`, `connu`, `linkedin`, `refere`.
 *  · `warm_reactivation` — `dormant`, `ancien_client`.
 *  · `open_opportunity` — `besoin_ouvert`.
 *  · `partner_meeting` — `partenaire_actif` (#2371.4).
 *
 * PAS dérivable, et c'est assumé :
 *  · `active_client_review`, `steering_committee` — `client_actif` couvre les
 *    deux, plus un simple point de delivery.
 *  · `partner_meeting` — `rang2` peut être l'un ou l'autre.
 *  · `profile_presentation` — aucun état ne le distingue d'un rendez-vous
 *    d'avancement sur la même opportunité.
 *
 * Et quand l'état de la relation est ABSENT (l'analyse ne l'a pas encore
 * établi), le type est `null` : le brief le dit, et n'affiche pas d'objectif.
 *
 * Le repli tentant serait de lire l'INTITULÉ du rendez-vous (« soutenance »,
 * « comité »). Il est refusé : un intitulé est saisi à la main, dans une langue
 * quelconque, souvent recopié d'un rendez-vous précédent — et il vaut mieux pas
 * d'objectif qu'un objectif tiré d'un copier-coller.
 */
export function deriveMeetingType(input: {
  readonly hasExternalAttendee: boolean
  readonly relationship: RelationshipState | null
}): MeetingType | null {
  if (!input.hasExternalAttendee) return 'internal_meeting'
  if (input.relationship === null) return null
  return MEETING_TYPE_BY_RELATIONSHIP[input.relationship]
}

/**
 * La table qui traduit un etat de relation en type de rendez-vous.
 *
 * Deux etats rendent `null`, et c'est le coeur du refus :
 *  - `client_actif` couvre a la fois une revue de compte, un comite de pilotage
 *    et un simple point de delivery : trois rendez-vous, trois intentions ;
 *  - `rang2` (sous-traitance sur ce compte) peut etre un point partenaire comme
 *    un point de mission.
 *
 * `refere` et `linkedin` rendent `first_contact` : la porte est tiede, la
 * CONVERSATION reste la premiere. Les confondre ferait entrer quelqu'un en
 * reactivation chez un interlocuteur qui ne l'a jamais rencontre.
 */
const MEETING_TYPE_BY_RELATIONSHIP: Readonly<Record<RelationshipState, MeetingType | null>> = {
  froid: 'first_contact',
  connu: 'first_contact',
  linkedin: 'first_contact',
  refere: 'first_contact',
  dormant: 'warm_reactivation',
  ancien_client: 'warm_reactivation',
  besoin_ouvert: 'open_opportunity',
  client_actif: null,
  rang2: null,
  // #2371.4 — avec un partenaire actif, le rendez-vous est un point PARTENAIRE :
  // la relation ne porte rien d'autre (aucune vente, aucune mission chez lui).
  partenaire_actif: 'partner_meeting',
}

/* -------------------------------------------------------------------------- */
/*  L'OBJECTIF — DÉTERMINISTE                                                  */
/* -------------------------------------------------------------------------- */

/**
 * La POSTURE du rendez-vous — la phrase en gros du bloc 07.
 *
 * Ce sont des clés, pas des phrases : l'écran les traduit, et les deux langues
 * du produit disent alors exactement la même chose. Une posture rédigée par un
 * modèle varierait d'un rendez-vous à l'autre pour une situation identique.
 */
export const MEETING_STANCES = [
  'listen_not_pitch',
  'reconnect_not_resell',
  'advance_not_restate',
  'prove_not_promise',
  'serve_not_sell',
  'align_not_report',
  /** #2319.48 — qualifier, c'est vérifier ce qu'on croyait savoir. */
  'qualify_not_assume',
  /** #2319.51 — face aux achats, on sécurise le circuit, on ne cède pas sur le prix. */
  'secure_not_concede',
  /** #4424.1 — un atelier se CADRE avec le client ; on n'y présente pas une offre. */
  'frame_not_present',
  /** #2102.35 — on renouvelle sur ce qui a été livré, pas sur l'habitude. */
  'renew_on_results',
  /** #2102.36 — on prépare le consultant, on ne lui souffle pas ses réponses. */
  'prepare_not_script',
] as const
export type MeetingStance = (typeof MEETING_STANCES)[number]

/** Ce qu'on veut RAPPORTER du rendez-vous. Fermé, donc traduisible et comparable. */
export const MEETING_OUTCOMES = [
  'qualify_need',
  'agree_next_step',
  'map_real_need',
  'date_to_present_profile',
  'confirm_decision_path',
  'collect_profile_feedback',
  'collect_satisfaction',
  'detect_upcoming_need',
  'align_on_delivery',
  'clarify_joint_pipeline',
  // #2319.48 — Qualification : problème, budget et timing, décision.
  'clarify_problem',
  'clarify_budget_timing',
  // #2319.51 — Achats : circuit et conditions.
  'map_purchasing_circuit',
  'clarify_conditions',
  // #4424.1 — R1 : obtenir l'atelier ; R2 : cadrer le besoin et briefer les opportunités.
  'book_workshop',
  'frame_workshop_need',
  'brief_opportunities',
  // #2102.35 — Renouvellement : la décision de reconduire, ses conditions.
  'confirm_renewal_decision',
  // #2102.36 — Entretien consultant : le consultant arrive préparé.
  'prepare_consultant',
] as const
export type MeetingOutcome = (typeof MEETING_OUTCOMES)[number]

export type MeetingObjective = {
  readonly stance: MeetingStance
  readonly outcomes: readonly MeetingOutcome[]
}

/**
 * La table qui fait de l'objectif un CALCUL et non une rédaction.
 *
 * `internal_meeting` n'y figure pas, et c'est délibéré : un point interne n'a
 * pas d'objectif commercial. Lui en fabriquer un ferait entrer quelqu'un en
 * réunion avec l'intention de vendre à son collègue.
 */
const OBJECTIVE_BY_TYPE: Readonly<Record<Exclude<MeetingType, 'internal_meeting'>, MeetingObjective>> = {
  first_contact: { stance: 'listen_not_pitch', outcomes: ['qualify_need', 'agree_next_step'] },
  warm_reactivation: { stance: 'reconnect_not_resell', outcomes: ['map_real_need', 'date_to_present_profile'] },
  open_opportunity: { stance: 'advance_not_restate', outcomes: ['confirm_decision_path', 'agree_next_step'] },
  profile_presentation: { stance: 'prove_not_promise', outcomes: ['collect_profile_feedback', 'agree_next_step'] },
  active_client_review: { stance: 'serve_not_sell', outcomes: ['collect_satisfaction', 'detect_upcoming_need'] },
  steering_committee: { stance: 'align_not_report', outcomes: ['align_on_delivery', 'detect_upcoming_need'] },
  partner_meeting: { stance: 'serve_not_sell', outcomes: ['clarify_joint_pipeline', 'agree_next_step'] },
  qualification: {
    stance: 'qualify_not_assume',
    outcomes: ['clarify_problem', 'clarify_budget_timing', 'confirm_decision_path'],
  },
  procurement: { stance: 'secure_not_concede', outcomes: ['map_purchasing_circuit', 'clarify_conditions'] },
  // #4424.1 — le R1 écoute et repart avec un atelier daté ; le R2 cadre et fixe la suite.
  r1_discovery: { stance: 'listen_not_pitch', outcomes: ['qualify_need', 'book_workshop'] },
  r2_workshop: {
    stance: 'frame_not_present',
    outcomes: ['frame_workshop_need', 'brief_opportunities', 'agree_next_step'],
  },
  // #2102.35 — renouveler : satisfaction d'abord, puis la décision et son circuit.
  renewal: {
    stance: 'renew_on_results',
    outcomes: ['collect_satisfaction', 'confirm_renewal_decision', 'agree_next_step'],
  },
  // #2102.36 — l'entretien d'un consultant chez le client : retours attendus, suite datée.
  consultant_interview: {
    stance: 'prepare_not_script',
    outcomes: ['prepare_consultant', 'collect_profile_feedback', 'agree_next_step'],
  },
}

/**
 * L'objectif du rendez-vous, ou `null`.
 *
 * `null` a deux causes, et elles se disent différemment à l'écran :
 *  · le type est inconnu ⇒ « on ne sait pas encore quel rendez-vous c'est » ;
 *  · le rendez-vous est interne ⇒ il n'y a pas d'objectif commercial à avoir.
 *
 * L'écran distingue les deux en regardant `meetingType` ; la fonction, elle, n'a
 * qu'une seule chose à dire : il n'y a pas d'objectif à afficher.
 */
export function deriveMeetingObjective(input: { readonly meetingType: MeetingType | null }): MeetingObjective | null {
  if (input.meetingType === null || input.meetingType === 'internal_meeting') return null
  return OBJECTIVE_BY_TYPE[input.meetingType]
}

/* -------------------------------------------------------------------------- */
/*  LES CINQ QUESTIONS                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Combien de questions le brief porte. #2319.35 — la spécification en demande
 * CINQ (elles étaient trois). Toujours tirées de la banque, jamais rédigées.
 */
export const MEETING_BRIEF_QUESTION_COUNT = 5

/**
 * Quelles familles de la banque interroger, selon le type de rendez-vous.
 *
 * Les familles viennent de `meeting-questions.ts` et les questions AUSSI : rien
 * n'est rédigé ici. Un premier contact cherche le contexte ; une réactivation
 * cherche ce qui a changé — périmètre, budget, circuit de décision — parce que
 * c'est précisément ce qui a bougé pendant le silence.
 */
const QUESTION_FAMILIES_BY_TYPE: Readonly<Record<MeetingType, readonly DiscoveryFamily[]>> = {
  first_contact: ['context', 'role_scope', 'pain_consequence'],
  warm_reactivation: ['role_scope', 'budget_timing_urgency', 'decision_procurement'],
  open_opportunity: ['decision_procurement', 'budget_timing_urgency', 'objections_risks', 'close'],
  profile_presentation: ['submission_feedback', 'success', 'close'],
  active_client_review: ['success', 'pain_consequence', 'project_mission'],
  steering_committee: ['success', 'organization', 'close'],
  partner_meeting: ['context', 'organization', 'decision_procurement'],
  // Un collègue ne se découvre pas.
  internal_meeting: [],
  // #2319.48 — préciser problème, budget, timing et décision.
  qualification: ['pain_consequence', 'budget_timing_urgency', 'decision_procurement'],
  // #2319.51 — le circuit, les conditions, et ce qui peut tout arrêter.
  procurement: ['decision_procurement', 'objections_risks', 'close'],
  // #4424.2 — le R1 découvre : contexte, douleur, priorités. La proposition
  // d'atelier n'est pas une question de la banque : elle a son propre bloc.
  r1_discovery: ['context', 'pain_consequence', 'stakes_priorities'],
  // #4424.3 — le R2 cadre : le projet, ce qui fera un succès, budget et décision.
  r2_workshop: ['project_mission', 'success', 'budget_timing_urgency', 'decision_procurement'],
  // #2102.35 — renouveler : ce qui a marché, le budget de reconduction, qui signe.
  renewal: ['success', 'budget_timing_urgency', 'decision_procurement'],
  // #2102.36 — l'entretien : le besoin du projet, le retour sur le profil, la clôture.
  consultant_interview: ['project_mission', 'submission_feedback', 'close'],
}

/**
 * #2319.42 — la famille que le RÔLE de la personne en face appelle en premier.
 * La taxonomie est celle de `decisionRoleSchema` (GA-26) ; `unknown` n'appelle
 * rien — un rôle non établi ne personnalise pas.
 */
const QUESTION_FAMILY_BY_ROLE: Readonly<Record<DecisionRole, DiscoveryFamily | null>> = {
  economic: 'budget_timing_urgency',
  sponsor: 'budget_timing_urgency',
  technical: 'project_mission',
  champion: 'organization',
  procurement: 'decision_procurement',
  purchasing: 'decision_procurement',
  influencer: 'stakes_priorities',
  user: 'pain_consequence',
  operational: 'pain_consequence',
  blocker: 'objections_risks',
  unknown: null,
}

/**
 * #2319.44 — une offre CONNUE ajoute la question qui la relie au projet du
 * client. `generic` ne dit pas quoi relier : il n'ajoute rien.
 */
const QUESTION_FAMILY_BY_OFFER: Readonly<Record<OfferDomain, DiscoveryFamily | null>> = {
  esn_it: 'project_mission',
  finance: 'project_mission',
  supply_chain: 'project_mission',
  product_design: 'project_mission',
  pmo: 'project_mission',
  rh: 'project_mission',
  generic: null,
  industrial_engineering: 'project_mission',
  // #2633.1 — même famille que les autres domaines spécifiques : un domaine
  // d'offre connu relie toujours la découverte au projet du client.
  ia: 'project_mission',
  // #3186.3 / #3186.5 — même raison.
  cyber: 'project_mission',
  hse: 'project_mission',
}

/**
 * Les cinq questions à poser — sélectionnées, jamais récitées.
 *
 * #2319.42-.45 — personnalisées, dans cet ordre : la famille du RÔLE de la
 * personne en face, puis celles du TYPE (donc de l'objectif, que l'utilisateur
 * peut choisir), puis celle de l'OFFRE ; ce que l'utilisateur tient déjà
 * (`answeredFamilies`, voir `deriveAnsweredFamilies`) n'est pas redemandé.
 *
 * Délègue à `selectQuestions`, qui porte déjà la règle du dépôt (couverture
 * avant profondeur, et une famille déjà renseignée ne se repose pas). Aucune
 * question n'est écrite dans ce fichier : la banque est la seule source, et elle
 * est elle-même verbatim de `agent_docs/kb/`.
 */
export function deriveMeetingQuestions(input: {
  readonly meetingType: MeetingType | null
  /** Les familles dont on a DÉJÀ la réponse. Les reposer dirait qu'on n'écoute pas. */
  readonly answeredFamilies?: readonly DiscoveryFamily[]
  /** #2319.42 — le rôle de décision de la personne du rendez-vous. */
  readonly attendeeRole?: DecisionRole | null
  /** #2319.44 — le domaine d'offre de l'espace, quand il est connu. */
  readonly offerDomain?: OfferDomain | null
}): string[] {
  if (input.meetingType === null) return []
  const byType = QUESTION_FAMILIES_BY_TYPE[input.meetingType]
  if (byType.length === 0) return []
  const byRole = input.attendeeRole ? QUESTION_FAMILY_BY_ROLE[input.attendeeRole] : null
  const byOffer = input.offerDomain ? QUESTION_FAMILY_BY_OFFER[input.offerDomain] : null
  const families = [
    ...new Set<DiscoveryFamily>([...(byRole ? [byRole] : []), ...byType, ...(byOffer ? [byOffer] : [])]),
  ]
  return selectQuestions({
    families,
    bank: DISCOVERY_QUESTIONS,
    answered: input.answeredFamilies,
    limit: MEETING_BRIEF_QUESTION_COUNT,
  })
}

/* -------------------------------------------------------------------------- */
/*  LE CHEMIN D'ACCÈS                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Le poids d'un rôle DANS LA DÉCISION — la seule chose qui ordonne le chemin.
 *
 * ⚠️ Le vocabulaire n'est pas inventé ici : c'est `decisionRoleSchema`
 * (`contact.ts`), la taxonomie MEDDIC déjà émise par la phase 3 et par
 * l'écrasement déterministe par intitulé. Un second vocabulaire de rôles aurait
 * produit deux organigrammes qui ne se parlent pas ; un réglage vit à un seul
 * endroit (GA-26). Les valeurs héritées (`sponsor`, `operational`,
 * `purchasing`) sont rangées à côté de leur équivalent courant plutôt que
 * jetées : des lignes anciennes les portent encore.
 *
 * ⚠️ C'est aussi la SEULE dimension sur laquelle ce fichier ordonne des gens.
 * Aucun critère protégé — âge, genre, origine, nationalité, photo, situation
 * familiale, adresse — n'entre dans ce module, ni dans ses types d'entrée, ni
 * dans son calcul. L'interdit porte sur l'usage CLASSANT, et un chemin d'accès
 * EST un classement.
 */
const DECISION_ROLE_WEIGHT: Readonly<Record<DecisionRole, number>> = {
  /** Qui tient le budget ouvre la porte la plus haute. */
  economic: 8,
  sponsor: 8,
  /** Le patron technique arbitre le besoin lui-même. */
  technical: 7,
  /** Un relais interne vaut mieux qu'un titre — il PARLE pour vous en réunion. */
  champion: 6,
  /** Les achats ne décident pas du besoin, mais ils peuvent tout arrêter. */
  procurement: 5,
  purchasing: 5,
  influencer: 4,
  user: 3,
  operational: 3,
  /** Un bloqueur est sur le chemin ; il n'est pas le chemin. */
  blocker: 2,
  /** Rôle non établi : dernier, jamais retiré — c'est peut-être le bon. */
  unknown: 1,
}

/** Une personne, réduite à ce qui a le DROIT de peser sur son rang. */
export type AccessPathContact = {
  readonly id: string
  readonly name: string
  readonly role: DecisionRole
  /** Le rôle est-il une LECTURE plutôt qu'un fait ? « Sponsor probable ». */
  readonly roleIsProbable: boolean
}

export type AccessPathStep = {
  readonly rank: number
  readonly contactId: string
  readonly name: string
  readonly role: DecisionRole
  readonly roleIsProbable: boolean
}

/** Un chemin d'accès s'annonce en trois noms. Au-delà, c'est un annuaire. */
export const ACCESS_PATH_MAX_STEPS = 3

/**
 * Le chemin d'accès — qui on voit, puis par qui on passe.
 *
 * La personne du rendez-vous vient toujours en premier, même quand son rôle est
 * le plus faible des trois : c'est elle qu'on a en face, et le chemin part de là.
 * Ensuite, le rôle et rien d'autre. À rôle égal, l'ordre d'entrée est conservé —
 * un départage inventé (alphabétique, par exemple) ferait croire à un classement
 * qui n'existe pas.
 */
export function deriveAccessPath(input: {
  readonly contacts: readonly AccessPathContact[]
  /** Les personnes présentes au rendez-vous. */
  readonly metWithIds: readonly string[]
}): AccessPathStep[] {
  const met = new Set(input.metWithIds)
  return input.contacts
    .map((contact, position) => ({ contact, position }))
    .filter(({ contact }) => contact.name.trim().length > 0)
    .sort((a, b) => {
      const attendee = Number(met.has(b.contact.id)) - Number(met.has(a.contact.id))
      if (attendee !== 0) return attendee
      const byRole = DECISION_ROLE_WEIGHT[b.contact.role] - DECISION_ROLE_WEIGHT[a.contact.role]
      return byRole !== 0 ? byRole : a.position - b.position
    })
    .slice(0, ACCESS_PATH_MAX_STEPS)
    .map(({ contact }, position) => ({
      rank: position + 1,
      contactId: contact.id,
      name: contact.name.trim(),
      role: contact.role,
      roleIsProbable: contact.roleIsProbable,
    }))
}
