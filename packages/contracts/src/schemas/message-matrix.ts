import { OUTREACH_PERSONAS } from './outreach-scenarios.js'
import type { relationshipStateSchema } from './sales-context.js'
import type { z } from 'zod'

/**
 * #2371 — LA MATRICE DU MESSAGE : persona × stade relationnel × objectif.
 *
 * ## Pourquoi une matrice, et pourquoi ICI
 *
 * Les trois axes existaient, éparpillés : le persona dans `OUTREACH_PERSONAS`
 * (angle, ton, ce qui le fait décrocher), le stade relationnel en dur dans le
 * prompt Python (`relationship_playbook.MESSAGE_PLAYBOOK`), l'objectif dans
 * `message_brief.MESSAGE_OBJECTIVES`. Aucun endroit ne disait quelles
 * combinaisons tiennent debout — et le stade relationnel avait un trou : tout
 * état absent du dict Python était écrit EN SILENCE comme un compte froid
 * (#2371.4). Un 10e stade ajouté au contrat sans son playbook serait parti en
 * ouverture à froid chez un partenaire actif.
 *
 * Cette matrice est la DONNÉE unique (GA-26). Le moteur Python n'a pas le paquet
 * contracts à l'exécution : il en porte le miroir JSON
 * (`apps/ia/app/knowledge/message_matrix.py`), et `message-matrix.test.ts` LIT
 * ce miroir et le compare à l'octet près — même discipline que
 * `cadence-parity.test.ts`.
 *
 * ## Ce que le typage garantit
 *
 * `stages` est un `Record` sur TOUS les états de `relationshipStateSchema` :
 * ajouter un stade au contrat sans écrire sa ligne ici ne compile pas. `froid`
 * vaut `null` EXPLICITEMENT — le prompt de base décrit déjà l'ouverture à froid ;
 * ce n'est plus un défaut implicite qui avale aussi l'inconnu. L'inconnu a sa
 * propre ligne, `unmeasuredStage` : non mesuré n'est pas froid.
 *
 * ## Ce qu'elle ne contient PAS
 *
 * Aucun critère protégé (âge, genre, origine, photo, adresse…) — doctrine : le
 * persona est dérivé du POSTE, le stade de la relation du COMPTE, l'objectif de
 * la demande du commercial. Aucun gabarit de message non plus : la matrice dit
 * COMMENT écrire, jamais QUOI écrire.
 */

type RelationshipStage = z.infer<typeof relationshipStateSchema>

type StagePlaybook = {
  readonly label: string
  readonly must: string
  readonly opening: string
  readonly forbidden: string
  /** La règle d'or n°3 (« zéro mention de l'ESN en M1 ») est écrite pour un
   *  inconnu ; sur une relation ÉTABLIE, on la lève — explicitement. */
  readonly liftsRule3: boolean
}

/** Les douze objectifs (#1926.9-.17, #2374.6, #2947/#2204.22/.27) — codes du
 *  moteur `message_brief`. */
const MESSAGE_MATRIX_OBJECTIVES = [
  'ouverture_compte',
  'relance',
  'reprise_relation',
  'demande_information',
  'recommandation',
  'positionnement_expertise',
  'nurturing',
  'suivi_rendez_vous',
  'renouvellement',
  // #2374.6 (vague 33) — faire suite à un document déjà envoyé (dossier,
  // étude de cas, proposition). Ajouté après la taxonomie initiale, EN FIN
  // pour la même raison que côté Python (`message_brief.MESSAGE_OBJECTIVES`).
  'suivi_document',
  // #2947/#2204.22 — demander une introduction vers un tiers déjà identifié
  // (distinct de `recommandation`, qui ne nomme personne).
  'introduction',
  // #2947/#2204.27 — explorer un partenariat entre organisations
  // (co-traitance, apport d'affaires, sous-traitance), jamais une vente à
  // la personne elle-même.
  'partenariat',
  // #2371.3 (reste) — pousser un consultant identifié pour un besoin ou une
  // opportunité (scénario D de #2386, « push profil »), distinct de
  // `positionnement_expertise` (qui ne nomme jamais une personne). EN FIN,
  // même raison que `suivi_document` ci-dessus.
  'proposer_profil',
  // #2204.21 (épopée #2947) — valider un contexte déjà entrevu : distinct de
  // `demande_information` (qui découvre) — ici on fait CONFIRMER une hypothèse.
  'valider_contexte',
  // #4060 — approche directe choisie : aucun signal imposé, rôle et périmètre.
  'approche_directe',
] as const

type MessageObjective = (typeof MESSAGE_MATRIX_OBJECTIVES)[number]

export const MESSAGE_MATRIX: {
  readonly personas: typeof OUTREACH_PERSONAS
  readonly objectives: typeof MESSAGE_MATRIX_OBJECTIVES
  readonly stages: Readonly<Record<RelationshipStage, StagePlaybook | null>>
  readonly unmeasuredStage: { readonly label: string; readonly directive: string }
  /** stade × objectif — les stades où la PRÉMISSE écrite de l'objectif tient
   *  (« premier contact sur ce compte », « une relation a existé »…). `null` =
   *  l'objectif n'affirme rien de la relation : il vaut pour tout stade. Chaque
   *  objectif a sa ligne — aucune absence ne vaut un défaut. */
  readonly objectivePremises: Readonly<Record<MessageObjective, readonly RelationshipStage[] | null>>
} = {
  personas: OUTREACH_PERSONAS,
  objectives: MESSAGE_MATRIX_OBJECTIVES,
  stages: {
    froid: null,
    connu: {
      label: "compte connu (présence dans l'historique / le CRM de l'ESN)",
      must: "repartir de ce que l'ESN sait déjà du compte — un besoin passé, un interlocuteur, une trace — au lieu d'ouvrir comme sur un inconnu",
      opening:
        "ancre le message sur cet élément d'historique s'il est fourni dans le contexte compte ; s'il ne l'est pas, écris comme à froid plutôt que de supposer une relation",
      forbidden: "prétendre une relation personnelle avec CE contact — l'historique est au compte, pas forcément à lui",
      liftsRule3: false,
    },
    linkedin: {
      label: 'connexion LinkedIn acceptée',
      must: "écrire court et rattacher le message à l'interaction qui vient d'avoir lieu (la connexion, un post, un commentaire), sans aucune présentation générique",
      opening: "une phrase liée à l'interaction, puis une seule question facile ; le message tient en quelques lignes",
      forbidden: "la présentation générique de l'ESN, le pitch catalogue, le message long",
      liftsRule3: false,
    },
    dormant: {
      label: 'compte dormant (relation existante, sans activité récente)',
      must: "réactiver par un signal précis ou une valeur concrète, en rappelant l'historique EXACT (ce qui a été fait, avec qui, quand) — jamais un historique approximatif",
      opening:
        "rappelle le fait d'historique fourni dans le contexte compte, puis apporte l'élément neuf qui justifie de reprendre contact",
      forbidden: '« je reviens vers vous » sans rien de neuf ; un historique flou ou reconstitué',
      liftsRule3: true,
    },
    refere: {
      label: 'compte référé (une recommandation ouvre la porte)',
      must: 'nommer le référent dès la première ligne et demander un aiguillage PRÉCIS (la bonne personne sur un sujet nommé)',
      opening:
        "cite le référent tel qu'il est écrit dans le contexte compte, dis pourquoi il t'oriente vers ce contact, demande l'aiguillage",
      forbidden: "inventer ou déduire un référent ; si aucun nom n'est fourni, ne pas prétendre en avoir un",
      liftsRule3: true,
    },
    ancien_client: {
      label: 'ancien client / ancien besoin',
      must: 'capitaliser sur la preuve et sur la relation déjà construite, puis vérifier ce qui a CHANGÉ depuis (équipe, périmètre, priorités)',
      opening:
        'rappelle la mission ou le besoin passé fourni dans le contexte, puis pose la question de ce qui a bougé',
      forbidden: "se représenter comme un nouveau fournisseur ; supposer que le contexte d'alors tient encore",
      liftsRule3: true,
    },
    rang2: {
      label: 'position rang 2 (sous-traitance derrière un partenaire déjà en place)',
      must: 'respecter le partenaire titulaire, identifier le client final et son manager, et construire une présence directe sans brûler la relation existante',
      opening: 'parle du travail réellement livré sur le périmètre, jamais du partenaire en creux',
      forbidden: "toute formulation qui court-circuite ou dénigre le titulaire — c'est le contrat en cours qu'on perd",
      liftsRule3: true,
    },
    client_actif: {
      label: "client actif (l'ESN livre déjà sur ce compte)",
      must: "jouer le foisonnement : BU et entités adjacentes, remontées des consultants en mission, renouvellement, retour d'expérience à réutiliser",
      opening:
        "repars d'un fait de la collaboration en cours ; ce contact n'est pas un prospect à convertir mais un client à étendre",
      forbidden:
        "écrire comme à un inconnu — une prise de contact, une présentation de l'ESN, un « je me permets de vous contacter »",
      liftsRule3: true,
    },
    besoin_ouvert: {
      label: 'besoin ouvert (une demande qualifiée est sur la table)',
      must: "faire avancer CE besoin : qualification (budget, timing, décideur, processus), sourcing, push d'un profil concret, soutenance, next step daté",
      opening: "nomme le besoin tel qu'il est décrit dans le contexte compte et propose l'étape suivante, datée",
      forbidden:
        'repartir en découverte générique alors que le besoin est déjà nommé ; promettre une disponibilité de profil non fournie',
      liftsRule3: true,
    },
    // #2371.4 (#2887) — le 10e stade : une ESN partenaire avec des placements
    // EN COURS. La relation est une collaboration entre pairs, pas une vente.
    partenaire_actif: {
      label: 'partenaire actif (des placements sont en cours avec cette ESN partenaire)',
      must: 'parler en PAIR : repartir de la collaboration en cours et proposer un échange concret de besoins ou de profils — jamais vendre une prestation à un partenaire',
      opening:
        "repars d'un fait de la collaboration fourni dans le contexte (un placement, un besoin échangé) ; s'il n'y en a aucun, n'en invente pas et parle du prochain échange possible",
      forbidden:
        "écrire comme à un prospect — présentation de l'ESN, pitch d'offre, « je me permets de vous contacter » ; toute approche directe d'un consultant placé via ce partenaire",
      liftsRule3: true,
    },
  },
  unmeasuredStage: {
    label: 'relation non mesurée',
    directive:
      "L'état de relation de ce compte n'est pas connu de Bellum — ce n'est PAS la preuve d'un compte froid. Écris avec prudence, mais n'affirme ni un premier contact (« nous ne nous connaissons pas »), ni une relation existante (« suite à notre collaboration »).",
  },
  // Tranché sans toi (decisions-louis-22-09-soir.md §12) : la prémisse est LUE
  // dans la règle écrite de l'objectif (`message_brief.MESSAGE_OBJECTIVES`),
  // jamais inventée — un objectif dont la règle n'affirme rien de la relation
  // vaut `null`.
  objectivePremises: {
    // « premier contact sur ce compte »
    ouverture_compte: ['froid', 'connu', 'linkedin', 'refere'],
    relance: null,
    // « une relation a existé avec ce compte »
    reprise_relation: ['connu', 'dormant', 'ancien_client'],
    demande_information: null,
    recommandation: null,
    positionnement_expertise: null,
    nurturing: null,
    // « un échange a déjà eu lieu » — tout stade sauf l'absence de tout contact
    suivi_rendez_vous: [
      'connu',
      'linkedin',
      'dormant',
      'refere',
      'ancien_client',
      'rang2',
      'client_actif',
      'besoin_ouvert',
      'partenaire_actif',
    ],
    // « un engagement en cours arrive à son terme »
    renouvellement: ['rang2', 'client_actif', 'partenaire_actif'],
    // #2374.6 — même prémisse que `suivi_rendez_vous` (« un échange a déjà eu
    // lieu ») : on ne peut pas suivre l'envoi d'un document à un compte avec
    // qui aucun contact n'a jamais eu lieu.
    suivi_document: [
      'connu',
      'linkedin',
      'dormant',
      'refere',
      'ancien_client',
      'rang2',
      'client_actif',
      'besoin_ouvert',
      'partenaire_actif',
    ],
    // Ni l'un ni l'autre n'affirme rien de la relation (comme
    // `demande_information`/`recommandation` ci-dessus) : une introduction ou
    // un partenariat peuvent se demander à tout stade.
    introduction: null,
    partenariat: null,
    // #2371.3 (reste) — n'affirme aucune relation préalable : le scénario D de
    // #2386 part souvent d'un compte NEUF trouvé par Reverse Market.
    proposer_profil: null,
    // #2204.21 — n'affirme aucune relation : une hypothèse se valide à tout stade.
    valider_contexte: null,
    // #4060 — n'affirme aucune relation : une approche directe vaut à tout stade.
    approche_directe: null,
  },
}
