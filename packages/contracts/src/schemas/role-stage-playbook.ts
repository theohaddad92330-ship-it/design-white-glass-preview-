/**
 * Rédigé par Claude le 11/10/2026 sur décision de Louis (« fais tout ») — à relire par Louis.
 *
 * #3386 — LE TABLEAU RÔLE × STADE : 7 rôles × 4 stades × 8 dimensions = 28 combinaisons.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue demande, pour chaque combinaison rôle + stade, ce que l'utilisateur
 * doit produire, ce qu'il ne doit pas porter, ses décisions, ses routines, ses
 * indicateurs, ses erreurs fréquentes, le niveau de détail adapté, et les
 * actions que Laura propose / déconseille (les deux dernières regroupées en UNE
 * dimension, comme le lot F27 les a nommées : huit dimensions).
 *
 * Doctrine c76 (« le rôle change l'ORDRE, jamais le CONTENU ») : chaque cellule
 * dit ce qui passe EN PREMIER, ce qui est mis en avant, ce qui passe APRÈS —
 * jamais ce qui est caché. Le contrat zod refuse une cellule qui masque, retire
 * ou filtre (`findHidingPhrase`), et `briefingLeads` n'est qu'un préfixe d'ordre :
 * toutes les autres rangées gardent leur place (`block-order.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT LES CLÉS (jamais inventées)
 * ─────────────────────────────────────────────────────────────────────────────
 * - Les 7 rôles : la liste minimale de l'issue, mêmes clés que
 *   `apps/ia/app/services/role_playbook.py::ROLES` (une garde Python le vérifie).
 * - Les 4 stades : ceux de l'issue (0-5, 6-20, 21-50, plus de 50) PROJETÉS sur
 *   l'unique échelle du produit (`esn_stage.py`, table p3 : 5 / 15 / 50) — jamais
 *   une seconde échelle. Tranché sans Louis : la borne « 20 » de l'issue suit
 *   la borne « 15 » du produit, et `etablie` couvre établie + grande (> 50).
 * - Les rangées de `briefingLeads` : `BRIEFING_BLOCK_IDS` ci-dessous, la liste
 *   des rangées du bureau de /briefing (déménagée ici depuis `block-order.ts`
 *   pour que la donnée et l'écran lisent la même liste, GA-26).
 *
 * UN SEUL ENDROIT (GA-26) : ce fichier. Le service IA (Laura) lit une copie
 * GÉNÉRÉE (`apps/ia/app/services/role_stage_playbook.json`, `packages/contracts`
 * n'est pas dans l'image IA) ; `role-stage-playbook.test.ts` échoue si elle diverge
 * (`UPDATE_ROLE_STAGE_PLAYBOOK=1` la réécrit).
 */
import { z } from 'zod'

export const PLAYBOOK_ROLES = [
  'fondateur',
  'directeur_agence',
  'manager_commercial',
  'business_manager',
  'business_developer',
  'recruteur',
  'sales_ops',
] as const
type PlaybookRole = (typeof PLAYBOOK_ROLES)[number]

export const PLAYBOOK_STADES = ['freelance', 'petite', 'structuration', 'etablie'] as const
export type PlaybookStade = (typeof PLAYBOOK_STADES)[number]

export const PLAYBOOK_DIMENSIONS = [
  'produire',
  'ne_pas_porter',
  'decisions',
  'routines',
  'indicateurs',
  'erreurs',
  'detail',
  'actions_laura',
] as const
type PlaybookDimension = (typeof PLAYBOOK_DIMENSIONS)[number]

const ROLE_LABELS: Record<PlaybookRole, string> = {
  fondateur: 'Fondateur / dirigeant',
  directeur_agence: "Directeur d'agence ou de BU",
  manager_commercial: 'Manager commercial',
  business_manager: 'Business Manager',
  business_developer: 'Business Developer / chasseur',
  recruteur: 'Recruteur / talent',
  sales_ops: 'Opérations commerciales',
}

const STADE_LABELS: Record<PlaybookStade, string> = {
  freelance: '0 à 5 consultants',
  petite: '6 à 15 consultants',
  structuration: '16 à 50 consultants',
  etablie: 'plus de 50 consultants',
}

/** Libellés lus par Laura : chacun dit une PRIORITÉ, jamais un retrait (c76). */
const DIMENSION_LABELS: Record<PlaybookDimension, string> = {
  produire: "Produit d'abord",
  ne_pas_porter: 'Passe après (délégable, reste visible)',
  decisions: 'Décisions en tête',
  routines: 'Routine qui ouvre la semaine',
  indicateurs: 'Indicateurs en tête',
  erreurs: 'Erreur signalée en premier',
  detail: "Niveau de détail d'abord",
  actions_laura: 'Laura propose d’abord / déconseille en le disant',
}

/** Les rangées du bureau de /briefing, dans leur ordre standard (lu par `block-order.ts`). */
export const BRIEFING_BLOCK_IDS = [
  'actions',
  'dailyGestures',
  'agenda',
  'waitingOnOthers',
  'preparations',
  'sinceLastVisit',
  'runningJobs',
  'chainBlockers',
  'criticalRisks',
  'discoverAlerts',
  'slotProposalPriorityAccounts',
  'accountsToWatch',
  'activity',
] as const
export type BriefingBlockId = (typeof BRIEFING_BLOCK_IDS)[number]

// ─── La garde c76 ────────────────────────────────────────────────────────────

const HIDING_PATTERNS: readonly RegExp[] = [
  /\b(masqu|cach|retir|supprim|filtr|exclu)\w*/,
  /\binvisible\b|\bhid(e|den)\b/,
  /\bne (s )?(montre|voit|voie|affiche|apparait)\w* (pas|jamais|plus)\b/,
  /\bn (s )?affiche\w* (pas|jamais|plus)\b/,
]

/**
 * Le morceau de texte qui dit qu'un rôle MASQUE quelque chose, ou `null`.
 * Normalise accents et apostrophes avant de lire : « ne s'affiche pas » est attrapé.
 */
export function findHidingPhrase(text: string): string | null {
  const norm = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
  for (const pattern of HIDING_PATTERNS) {
    const match = norm.match(pattern)
    if (match) return match[0]
  }
  return null
}

const playbookTextSchema = z
  .string()
  .trim()
  .min(10)
  .max(240)
  .superRefine((text, ctx) => {
    const hiding = findHidingPhrase(text)
    if (hiding)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `c76 : une cellule ordonne, elle ne masque pas (« ${hiding} »)`,
      })
  })

const roleStageCellSchema = z.object({
  dims: z.object(
    Object.fromEntries(PLAYBOOK_DIMENSIONS.map(dim => [dim, playbookTextSchema])) as Record<
      PlaybookDimension,
      typeof playbookTextSchema
    >,
  ),
  briefingLeads: z
    .array(z.enum(BRIEFING_BLOCK_IDS))
    .min(1)
    .max(5)
    .refine(leads => new Set(leads).size === leads.length, 'une rangée en double'),
})
type RoleStageCell = z.infer<typeof roleStageCellSchema>

const stadeRowSchema = z.object(
  Object.fromEntries(PLAYBOOK_STADES.map(stade => [stade, roleStageCellSchema])) as Record<
    PlaybookStade,
    typeof roleStageCellSchema
  >,
)

/** Le contrat : les 28 cellules, chacune complète, aucune qui masque. */
export const roleStagePlaybookSchema = z.object(
  Object.fromEntries(PLAYBOOK_ROLES.map(role => [role, stadeRowSchema])) as Record<PlaybookRole, typeof stadeRowSchema>,
)

// ─── La rédaction ────────────────────────────────────────────────────────────

export const ROLE_STAGE_PLAYBOOK: Readonly<Record<PlaybookRole, Readonly<Record<PlaybookStade, RoleStageCell>>>> = {
  fondateur: {
    freelance: {
      dims: {
        produire: 'Un fil commercial tenu jusqu’à la signature : réseau, recommandations, une porte à la fois',
        ne_pas_porter: 'Les tableaux de suivi et la stratégie multi-comptes passent après le fil en cours',
        decisions: 'Quel compte du réseau relancer cette semaine ; quel consultant placer en premier',
        routines: 'Lundi : le prochain geste du fil en cours ; vendredi : les relances du réseau',
        indicateurs: 'Rendez-vous obtenus par le réseau, consultants en intercontrat, fins de mission à venir',
        erreurs: 'Ouvrir dix comptes froids au lieu de finir celui qui est chaud',
        detail: 'Un compte, un contact, un prochain geste ; le reste en second niveau',
        actions_laura:
          'Propose d’abord : relancer le réseau et la prospection inversée via les consultants en mission. Déconseille en le disant : une stratégie sur des dizaines de comptes',
      },
      briefingLeads: ['actions', 'agenda', 'accountsToWatch', 'activity'],
    },
    petite: {
      dims: {
        produire:
          'Les arbitrages de la semaine (2-3 comptes, qui les porte) et les rendez-vous qu’il est seul à obtenir',
        ne_pas_porter: 'Le suivi quotidien des comptes déjà confiés passe après les arbitrages',
        decisions: 'Quels 2-3 comptes pousser ; recruter ou non un premier commercial ; le seuil de marge',
        routines: 'Lundi : arbitrages et répartition des comptes ; vendredi : relecture du reporting en 15 min',
        indicateurs: 'Poids du top 3 clients, marge face au seuil fixé, consultants en intercontrat',
        erreurs: 'Garder tout le commerce sur ses épaules quand le volume justifie un relais',
        detail: 'Synthèse en 2-3 arbitrages ; le détail par compte juste dessous',
        actions_laura:
          'Propose d’abord : 2-3 arbitrages à trancher et les comptes à confier. Déconseille en le disant : un plan sur 100 comptes, remplir des tableaux à la place de l’équipe',
      },
      briefingLeads: ['activity', 'actions', 'criticalRisks', 'accountsToWatch'],
    },
    structuration: {
      dims: {
        produire: 'Un système commercial duplicable : qui porte quel compte, quel rituel, quel seuil de marge',
        ne_pas_porter: 'La prospection compte par compte passe après la mise en place de l’équipe',
        decisions: 'Répartition des comptes, recrutement commercial, réduction de la dépendance au premier client',
        routines: 'Rituel d’équipe hebdomadaire ; reporting du vendredi lu le lundi matin',
        indicateurs: 'Part du business portée par les fondateurs, concentration client, marge, renouvellements',
        erreurs: 'Rester le goulot de chaque deal ; lancer des chantiers sans les maintenir',
        detail: 'Agrégé par commercial, puis par compte clé',
        actions_laura:
          'Propose d’abord : les arbitrages d’équipe et les comptes à réaffecter. Déconseille en le disant : reprendre en main un compte délégué sans raison nommée',
      },
      briefingLeads: ['activity', 'criticalRisks', 'chainBlockers', 'accountsToWatch'],
    },
    etablie: {
      dims: {
        produire: 'Le cap et les arbitrages via ses directeurs ; les rendez-vous C-level des comptes clés',
        ne_pas_porter: 'Le détail des comptes passe après la lecture par BU et par directeur',
        decisions: 'Allocation entre BU, comptes stratégiques à protéger, diversification, seuil de marge',
        routines: 'Revue mensuelle par BU ; rendez-vous C-level planifiés',
        indicateurs: 'Chiffre d’affaires et marge par BU, concentration client, encaissements, renouvellements',
        erreurs: 'Descendre dans un compte au lieu de trancher entre BU ; dépendre d’un client majeur sans le protéger',
        detail: 'Synthèse par BU ; un compte seulement s’il touche un arbitrage',
        actions_laura:
          'Propose d’abord : les écarts entre BU et les rendez-vous C-level à obtenir. Déconseille en le disant : un plan de compte détaillé à la place de ses directeurs',
      },
      briefingLeads: ['activity', 'criticalRisks', 'accountsToWatch', 'chainBlockers'],
    },
  },
  directeur_agence: {
    freelance: {
      dims: {
        produire: 'Pas d’agence à diriger à ce stade : un fil commercial tenu jusqu’à la signature, comme le dirigeant',
        ne_pas_porter: 'L’organisation d’agence passe après le fil en cours',
        decisions: 'Quel compte relancer ; quel consultant placer en premier',
        routines: 'Lundi : le prochain geste du fil ; vendredi : les relances du réseau',
        indicateurs: 'Rendez-vous obtenus, consultants en intercontrat, fins de mission à venir',
        erreurs: 'Construire une structure avant d’avoir un flux de missions',
        detail: 'Un compte, un contact, un prochain geste',
        actions_laura:
          'Propose d’abord : la relance du réseau et la prospection inversée. Déconseille en le disant : un plan d’agence sur plusieurs comptes',
      },
      briefingLeads: ['actions', 'agenda', 'accountsToWatch', 'activity'],
    },
    petite: {
      dims: {
        produire:
          'À ce stade l’agence est l’ESN : les arbitrages de la semaine et les rendez-vous qu’il est seul à obtenir',
        ne_pas_porter: 'Le reporting détaillé passe après les 2-3 arbitrages',
        decisions: 'Quels comptes pousser ; qui les porte ; recrutement local',
        routines: 'Lundi : répartition des comptes ; vendredi : point court avec chaque commercial',
        indicateurs: 'Marge de l’agence, consultants en intercontrat, concentration client',
        erreurs: 'Faire le travail de chaque commercial au lieu d’arbitrer',
        detail: '2-3 arbitrages ; le détail par compte en second niveau',
        actions_laura:
          'Propose d’abord : les arbitrages et les comptes à confier. Déconseille en le disant : un tableau de 40 lignes',
      },
      briefingLeads: ['activity', 'actions', 'criticalRisks', 'accountsToWatch'],
    },
    structuration: {
      dims: {
        produire: 'Le résultat du périmètre : arbitrages d’agence et management de ses Business Managers',
        ne_pas_porter: 'Les comptes de ses Business Managers passent après la revue d’équipe',
        decisions: 'Répartition des comptes entre Business Managers, recrutement local, seuil de marge du périmètre',
        routines: 'Rituel d’équipe hebdomadaire ; point individuel avec chaque Business Manager',
        indicateurs: 'Marge du périmètre, intercontrat, comptes sans prochaine action, renouvellements',
        erreurs: 'Reprendre les comptes de ses Business Managers ; séparer commerce et delivery',
        detail: 'Agrégé par Business Manager, puis par compte clé',
        actions_laura:
          'Propose d’abord : les comptes à réaffecter et un point par Business Manager. Déconseille en le disant : un plan de compte à la place du Business Manager',
      },
      briefingLeads: ['criticalRisks', 'chainBlockers', 'accountsToWatch', 'actions'],
    },
    etablie: {
      dims: {
        produire: 'Le résultat de l’agence ou de la BU face à ses objectifs, et le management de ses Business Managers',
        ne_pas_porter: 'Le suivi compte par compte passe après la lecture par Business Manager',
        decisions: 'Comptes clés à protéger, réaffectations, recrutement, deals sous le seuil de marge',
        routines: 'Rituel hebdomadaire ; reporting du vendredi ; rendez-vous C-level des comptes clés',
        indicateurs: 'Marge du périmètre, intercontrat, fins de mission sans plan, renouvellements',
        erreurs: 'Dépendre d’un client majeur sans le protéger ni diversifier',
        detail: 'Agrégé par Business Manager ; 2-3 arbitrages d’agence',
        actions_laura:
          'Propose d’abord : les écarts du périmètre et les rendez-vous C-level. Déconseille en le disant : descendre dans chaque compte',
      },
      briefingLeads: ['criticalRisks', 'accountsToWatch', 'chainBlockers', 'activity'],
    },
  },
  manager_commercial: {
    freelance: {
      dims: {
        produire: 'Pas d’équipe à manager à ce stade : son propre pipe, tenu fil par fil',
        ne_pas_porter: 'Les rituels d’équipe passent après ses propres relances',
        decisions: 'Quel fil relancer ou lâcher ; quel compte ouvrir',
        routines: 'Lundi : les 3 relances clés ; vendredi : traçage de la semaine',
        indicateurs: 'Opportunités qualifiées, rendez-vous tenus, relances en retard',
        erreurs: 'Installer un process d’équipe sans équipe',
        detail: 'Opérationnel : compte, contact, prochain geste',
        actions_laura:
          'Propose d’abord : ses relances et les portes à qualifier. Déconseille en le disant : un tableau de bord d’équipe',
      },
      briefingLeads: ['actions', 'agenda', 'accountsToWatch', 'waitingOnOthers'],
    },
    petite: {
      dims: {
        produire: 'Un pilotage léger d’1 à 3 commerciaux : qui relance quoi, quels besoins restent sans réponse',
        ne_pas_porter: 'L’inventaire des données passe après les 2-3 décisions de la semaine',
        decisions: 'Qui relance quoi ; GO ou NO-GO de qualification ; deals sous le seuil de marge',
        routines: 'Point hebdomadaire de 30 min ; reporting du vendredi',
        indicateurs: 'Opportunités qualifiées par commercial, besoins sans shortlist, relances en retard',
        erreurs: 'Vendre à la place de l’équipe ; ajouter un rituel de plus',
        detail: 'Quelques décisions, chacune avec ses éléments',
        actions_laura:
          'Propose d’abord : les relances en retard de l’équipe et les GO / NO-GO. Déconseille en le disant : lister tous les comptes sans choisir',
      },
      briefingLeads: ['chainBlockers', 'waitingOnOthers', 'actions', 'criticalRisks'],
    },
    structuration: {
      dims: {
        produire: 'Un entonnoir lisible et des résultats comparés sur les mêmes indicateurs pour tous',
        ne_pas_porter: 'La prospection compte par compte passe après les écarts d’équipe',
        decisions: 'Affectation des besoins, GO ou NO-GO de qualification, deals sous le seuil de marge',
        routines: 'Session hebdomadaire ; comparaison des résultats chaque vendredi',
        indicateurs: 'Besoins par mois, délai besoin → shortlist, rendez-vous tenus, opportunités qualifiées',
        erreurs: 'Collecter sans exploiter ; séparer commerce et delivery',
        detail: 'Les écarts d’équipe d’abord, l’entonnoir complet ensuite',
        actions_laura:
          'Propose d’abord : les 2-3 arbitrages de la semaine et les besoins sans shortlist. Déconseille en le disant : un inventaire passif',
      },
      briefingLeads: ['chainBlockers', 'criticalRisks', 'waitingOnOthers', 'actions'],
    },
    etablie: {
      dims: {
        produire:
          'Le pilotage d’une équipe structurée : un propriétaire nommé par fil, les écarts traités chaque semaine',
        ne_pas_porter: 'Le détail des comptes de chaque commercial passe après les écarts',
        decisions: 'Réaffectations, priorité entre appels d’offres, deals sous le seuil de marge',
        routines: 'Revue de pipe hebdomadaire ; comparaison des indicateurs le vendredi',
        indicateurs:
          'Comptes sans prochaine action, conversion besoin → démarrage, délai de shortlist, renouvellements',
        erreurs: 'Multiplier les rituels ; laisser un fil sans propriétaire',
        detail: 'Par commercial puis par écart ; le compte seulement s’il bloque',
        actions_laura:
          'Propose d’abord : les écarts d’équipe et les fils sans propriétaire. Déconseille en le disant : ajouter un indicateur de plus',
      },
      briefingLeads: ['chainBlockers', 'criticalRisks', 'accountsToWatch', 'waitingOnOthers'],
    },
  },
  business_manager: {
    freelance: {
      dims: {
        produire: 'Pas de portefeuille réparti : le compte en cours, suivi de bout en bout',
        ne_pas_porter: 'Le cross-sell passe après la mission à démarrer',
        decisions: 'Quel décideur pousser ; quand proposer un profil',
        routines: 'Lundi : le prochain geste du compte ; une alerte avant chaque fin de mission',
        indicateurs: 'Fins de mission sans plan, rendez-vous tenus, consultants disponibles',
        erreurs: 'Se disperser sur plusieurs comptes avant d’en tenir un',
        detail: 'Profond sur un compte : décideurs, projet, prochain rendez-vous',
        actions_laura:
          'Propose d’abord : le prochain rendez-vous du compte et la fin de mission à anticiper. Déconseille en le disant : prospecter à froid hors périmètre',
      },
      briefingLeads: ['actions', 'agenda', 'preparations', 'accountsToWatch'],
    },
    petite: {
      dims: {
        produire: '2-3 comptes suivis de la prise de contact au démarrage, puis renouvelés',
        ne_pas_porter: 'La prospection à froid hors de ses comptes passe après leur couverture',
        decisions: 'Quel décideur ou projet pousser ; quand proposer un profil additionnel',
        routines: 'Alerte 3 mois avant chaque fin de mission ; présence chez le client',
        indicateurs: 'Renouvellements, comptes sans prochaine action, fins de mission sans plan',
        erreurs: 'Laisser vieillir un organigramme ; découper le suivi',
        detail: 'Profond sur peu de comptes : organigramme, décideurs, prochain rendez-vous',
        actions_laura:
          'Propose d’abord : les fins de mission à anticiper et les décideurs à couvrir. Déconseille en le disant : un plan sur une centaine de comptes',
      },
      briefingLeads: ['actions', 'preparations', 'accountsToWatch', 'agenda'],
    },
    structuration: {
      dims: {
        produire: 'L’expertise de 2-3 comptes stratégiques, du premier contact au renouvellement',
        ne_pas_porter: 'Les comptes hors portefeuille passent après les siens, chacun avec un propriétaire nommé',
        decisions: 'Quoi renouveler ; quel profil additionnel proposer ; quel décideur couvrir',
        routines: 'Point trimestriel client ; organigramme à jour ; alerte 3 mois avant fin de mission',
        indicateurs: 'Renouvellement, profils présentés par besoin, comptes sans prochaine action',
        erreurs: 'Se disperser sur trop de comptes ; laisser flou qui porte un compte',
        detail: 'Compte par compte, avec organigramme et projets',
        actions_laura:
          'Propose d’abord : un plan sur ses 2-3 comptes et les besoins sans shortlist. Déconseille en le disant : prospecter hors de son périmètre',
      },
      briefingLeads: ['chainBlockers', 'actions', 'preparations', 'accountsToWatch'],
    },
    etablie: {
      dims: {
        produire: 'Le plan de ses comptes clés : couverture des décideurs, renouvellements, cross-sell',
        ne_pas_porter: 'L’arbitrage entre BU passe après son plan de compte',
        decisions: 'Couverture des décideurs, référencement, profils additionnels, renouvellements',
        routines: 'Revue trimestrielle client ; organigramme mis à jour ; suivi des appels d’offres',
        indicateurs: 'Renouvellement, couverture des décideurs, fins de mission sans plan',
        erreurs: 'Rester sur un seul décideur ; découvrir un appel d’offres trop tard',
        detail: 'Profond : organigramme, projets, échéances d’appels d’offres',
        actions_laura:
          'Propose d’abord : les décideurs de sa spécialité à couvrir et les échéances proches. Déconseille en le disant : disperser son temps hors de ses comptes clés',
      },
      briefingLeads: ['chainBlockers', 'criticalRisks', 'actions', 'preparations'],
    },
  },
  business_developer: {
    freelance: {
      dims: {
        produire:
          'À ce stade c’est souvent le fondateur qui chasse : une porte ouverte à la fois, tenue jusqu’au rendez-vous',
        ne_pas_porter: 'Le volume de messages passe après la qualité de la porte',
        decisions: 'Quel compte du réseau travailler d’abord ; quand lâcher un fil',
        routines: 'Prospection inversée : appeler les consultants en mission ; tracer chaque jour',
        indicateurs: 'Portes ouvertes et rendez-vous qualifiés, avant le nombre de messages',
        erreurs: 'Compter les messages au lieu des portes',
        detail: 'Compte, contact, angle, prochain geste',
        actions_laura:
          'Propose d’abord : les consultants en mission à appeler et les introductions à demander. Déconseille en le disant : un grand compte à froid sans porte',
      },
      briefingLeads: ['actions', 'agenda', 'accountsToWatch', 'discoverAlerts'],
    },
    petite: {
      dims: {
        produire: 'Des portes ouvertes : besoins identifiés et rendez-vous qualifiés sur peu de comptes',
        ne_pas_porter: 'La relation de fond des comptes signés passe après l’ouverture',
        decisions: 'Quel compte ou persona d’abord ; quel canal ; quand relancer ou lâcher',
        routines: 'Créneau de prospection quotidien ; prospection inversée ; traçage',
        indicateurs: 'Opportunités qualifiées, rendez-vous tenus, délai signal → action',
        erreurs: 'Mesurer sa semaine au nombre de messages ; ne pas tracer',
        detail: 'Opérationnel : compte par compte, prochain geste',
        actions_laura:
          'Propose d’abord : les portes à qualifier et le prochain geste de chaque fil. Déconseille en le disant : mesurer le succès au volume de messages',
      },
      briefingLeads: ['actions', 'accountsToWatch', 'agenda', 'discoverAlerts'],
    },
    structuration: {
      dims: {
        produire: 'Des opportunités qualifiées transmises proprement au Business Manager',
        ne_pas_porter: 'L’arbitrage de cible et de marge passe après la qualification',
        decisions: 'Quel segment travailler ; quand transmettre ; quel fil relancer',
        routines: 'Prospection multicanale tracée ; environ 1h30 de plans de compte par semaine (repère de méthode)',
        indicateurs: 'Détecté → qualifié, rendez-vous tenus, accès rang 1 obtenus',
        erreurs: 'Transmettre une opportunité non qualifiée ; ne pas tracer',
        detail: 'Opérationnel, avec l’angle et le contact de chaque fil',
        actions_laura:
          'Propose d’abord : les signaux à transformer en portes et les fils à relancer. Déconseille en le disant : compter les messages envoyés',
      },
      briefingLeads: ['actions', 'discoverAlerts', 'accountsToWatch', 'agenda'],
    },
    etablie: {
      dims: {
        produire: 'Des portes sur des comptes ciblés : rendez-vous qualifiés, accès rang 1, opportunités transmises',
        ne_pas_porter: 'Le suivi des comptes signés passe après sa liste cible',
        decisions: 'Quels comptes cibles d’abord ; quel persona ; quand transmettre',
        routines: 'Plans de compte hebdomadaires ; prospection multicanale tracée',
        indicateurs: 'Opportunités qualifiées, accès rang 1, délai signal → action — avant le volume',
        erreurs: 'Viser un grand compte à froid sans porte ; doubler un fil déjà porté',
        detail: 'Compte par compte, avec le propriétaire du compte nommé',
        actions_laura:
          'Propose d’abord : les signaux sur sa liste cible et les introductions à demander. Déconseille en le disant : relancer un compte porté par un collègue sans le prévenir',
      },
      briefingLeads: ['actions', 'discoverAlerts', 'accountsToWatch', 'slotProposalPriorityAccounts'],
    },
  },
  recruteur: {
    freelance: {
      dims: {
        produire: 'Le sourcing d’un besoin à la fois, souvent porté par le fondateur',
        ne_pas_porter: 'La CVthèque étendue passe après le besoin ouvert',
        decisions: 'Quel profil sourcer d’abord ; qui présenter',
        routines: 'Sourcing dès qu’un besoin est qualifié ; appels aux consultants en mission',
        indicateurs: 'Délai besoin → shortlist, consultants disponibles',
        erreurs: 'Sourcer sans besoin qualifié',
        detail: 'Par besoin : profil, disponibilité, prochaine étape',
        actions_laura:
          'Propose d’abord : la shortlist du besoin ouvert. Déconseille en le disant : sourcer en masse sans besoin',
      },
      briefingLeads: ['preparations', 'agenda', 'actions', 'waitingOnOthers'],
    },
    petite: {
      dims: {
        produire: '1-2 CV qualifiés par besoin en 48-72 h (repère de méthode)',
        ne_pas_porter: 'La relation commerciale du compte passe après la shortlist',
        decisions: 'Quels profils sourcer ; qui présenter ; quand relancer un candidat',
        routines: 'CVthèque entretenue ; appels aux consultants, capteurs de besoins',
        indicateurs: 'Délai besoin → shortlist, profils présentés par besoin, disponibilités connues',
        erreurs: 'Ignorer les consultants comme source de besoins',
        detail: 'Par besoin : profil, disponibilité, prochaine étape',
        actions_laura:
          'Propose d’abord : les besoins ouverts sans shortlist et les candidats à relancer. Déconseille en le disant : prospecter les comptes à froid',
      },
      briefingLeads: ['preparations', 'agenda', 'waitingOnOthers', 'actions'],
    },
    structuration: {
      dims: {
        produire: 'Une shortlist par besoin dans le délai, et une CVthèque active partagée avec les commerciaux',
        ne_pas_porter: 'La négociation commerciale passe après la présentation du profil',
        decisions: 'Priorité entre besoins ouverts ; qui présenter ; quand relancer',
        routines: 'Point besoins avec les Business Managers ; événements consultants',
        indicateurs: 'Délai besoin → shortlist, conversion en entretien, besoins sans shortlist',
        erreurs: 'Sourcer sur un besoin non qualifié ; perdre un candidat faute de relance',
        detail: 'Par besoin, puis par candidat',
        actions_laura:
          'Propose d’abord : les besoins sans shortlist et les consultants à appeler. Déconseille en le disant : mener la négociation commerciale',
      },
      briefingLeads: ['preparations', 'chainBlockers', 'agenda', 'waitingOnOthers'],
    },
    etablie: {
      dims: {
        produire: 'Le staffing des besoins prioritaires dans le délai, et la visibilité sur les disponibilités',
        ne_pas_porter: 'La prospection des comptes passe après le staffing',
        decisions: 'Priorité entre besoins ; anticipation des intercontrats ; qui présenter',
        routines: 'Revue hebdomadaire des besoins ; reconfirmation des disponibilités',
        indicateurs: 'Délai de staffing, disponibilités connues, besoins non staffables',
        erreurs: 'Découvrir un intercontrat le jour de la fin de mission',
        detail: 'Par besoin et par consultant disponible',
        actions_laura:
          'Propose d’abord : les besoins prioritaires sans shortlist et les fins de mission à reconfirmer. Déconseille en le disant : sourcer sans besoin qualifié',
      },
      briefingLeads: ['preparations', 'chainBlockers', 'criticalRisks', 'agenda'],
    },
  },
  sales_ops: {
    freelance: {
      dims: {
        produire: 'Rôle rarement dédié à ce stade : trois champs de traçabilité tenus (compte, prochaine action, date)',
        ne_pas_porter: 'L’outillage passe après la traçabilité de base',
        decisions: 'Quel champ rendre obligatoire en premier',
        routines: 'Vendredi : contrôle des prochaines actions manquantes',
        indicateurs: 'Comptes sans prochaine action, fraîcheur des données',
        erreurs: 'Outiller avant d’avoir un flux',
        detail: 'Précis : champ manquant, fiche concernée',
        actions_laura:
          'Propose d’abord : les fiches sans prochaine action. Déconseille en le disant : brancher un outil de plus',
      },
      briefingLeads: ['waitingOnOthers', 'runningJobs', 'accountsToWatch', 'actions'],
    },
    petite: {
      dims: {
        produire: 'La traçabilité de base et un reporting simple du vendredi',
        ne_pas_porter: 'L’arbitrage commercial passe au dirigeant',
        decisions: 'Quels champs rendre obligatoires ; quel indicateur suivre en premier',
        routines: 'Mise à jour du fichier chaque vendredi ; hygiène des données',
        indicateurs: 'Complétude des comptes, prochaines actions renseignées, 5 indicateurs au plus',
        erreurs: 'Multiplier les indicateurs',
        detail: 'Précis sur les données : champs, écarts, doublons à signaler',
        actions_laura:
          'Propose d’abord : les fiches incomplètes et le reporting du vendredi. Déconseille en le disant : contacter des prospects',
      },
      briefingLeads: ['waitingOnOthers', 'runningJobs', 'chainBlockers', 'accountsToWatch'],
    },
    structuration: {
      dims: {
        produire: 'Le fichier de pilotage (5 indicateurs au plus, chaque vendredi) qui rend le système duplicable',
        ne_pas_porter: 'La prospection passe aux commerciaux',
        decisions: 'Quels indicateurs suivre ; quel champ rendre obligatoire ; quel outil brancher',
        routines: 'Fichier mis à jour chaque vendredi ; contrôle de la traçabilité',
        indicateurs: 'Complétude, fraîcheur, comptes sans prochaine action, saisies à l’heure',
        erreurs: 'Collecter sans exploiter',
        detail: 'Champs, écarts, doublons à signaler',
        actions_laura:
          'Propose d’abord : les écarts à corriger avant le reporting. Déconseille en le disant : trancher un arbitrage commercial à la place du dirigeant',
      },
      briefingLeads: ['chainBlockers', 'waitingOnOthers', 'runningJobs', 'accountsToWatch'],
    },
    etablie: {
      dims: {
        produire: 'Une donnée commerciale fiable à l’échelle : pilotage par indicateurs, connecteurs tenus',
        ne_pas_porter: 'La relation client passe aux équipes de compte',
        decisions: 'Quel connecteur réparer d’abord ; quel indicateur simplifier dans le reporting',
        routines: 'Contrôle hebdomadaire des connecteurs et de la traçabilité ; reporting du vendredi',
        indicateurs: 'Fraîcheur des données, connecteurs en panne, complétude par équipe',
        erreurs: 'Multiplier les indicateurs ; laisser un connecteur en panne',
        detail: 'Par équipe, puis par champ',
        actions_laura:
          'Propose d’abord : les connecteurs en panne et les doublons à signaler. Déconseille en le disant : fusionner des doublons sans validation',
      },
      briefingLeads: ['chainBlockers', 'runningJobs', 'waitingOnOthers', 'criticalRisks'],
    },
  },
}

// ─── Lecture du rôle déclaré et du stade ─────────────────────────────────────

/**
 * Les TITRES du catalogue `user_role` → rôle du tableau. Ce n'est pas
 * `personaFromUserRole` (5 lectures de pilotage) : l'issue nomme 7 rôles, dont
 * « manager commercial » et « opérations commerciales » que le pilotage n'a pas,
 * et un directeur d'agence que le pilotage lit comme un fondateur. Les valeurs de
 * PARCOURS (« Pur commercial »…) n'ont pas de rôle : aucune combinaison, jamais
 * une supposition. Même lecture que `classify_seller_role` côté IA (garde Python).
 */
const USER_ROLE_TO_PLAYBOOK_ROLE: Readonly<Record<string, PlaybookRole>> = {
  'Fondateur / CEO': 'fondateur',
  "Directeur d'agence": 'directeur_agence',
  'Directeur de BU': 'directeur_agence',
  'Directeur commercial': 'manager_commercial',
  'Head of Sales': 'manager_commercial',
  'Business Manager': 'business_manager',
  'Account Manager': 'business_manager',
  'Business Developer': 'business_developer',
  'SDR / BDR': 'business_developer',
  'Talent Manager / Recruteur': 'recruteur',
  'Responsable staffing': 'recruteur',
  'Opérations commerciales': 'sales_ops',
}

export function playbookRoleFromUserRole(userRole: string | null | undefined): PlaybookRole | null {
  if (!userRole) return null
  return USER_ROLE_TO_PLAYBOOK_ROLE[userRole] ?? null
}

/** Bornes hautes (incluses) — celles de `esn_stage.py::_STAGE_UPPER_BOUNDS` (garde Python). */
const STADE_UPPER_BOUNDS: readonly (readonly [number, PlaybookStade])[] = [
  [5, 'freelance'],
  [15, 'petite'],
  [50, 'structuration'],
]

/**
 * Tranche déclarée (`consultant_size`, « 10-30 », « 500+ », « 12 ») → stade. Borne
 * HAUTE de la tranche, comme `size_int` côté IA (on ne sous-estime jamais la
 * capacité). Aucun chiffre → `null` : un stade n'est jamais deviné (GA-18).
 */
export function playbookStadeFromSize(size: string | null | undefined): PlaybookStade | null {
  const numbers = (size ?? '').match(/\d+/g)
  if (!numbers) return null
  const upper = Math.max(...numbers.map(Number))
  for (const [bound, stade] of STADE_UPPER_BOUNDS) if (upper <= bound) return stade
  return 'etablie'
}

/** La combinaison active, ou `null` si le rôle OU le stade manque (jamais deviné). */
export function resolveRoleStageCell(
  userRole: string | null | undefined,
  consultantSize: string | null | undefined,
): { role: PlaybookRole; stade: PlaybookStade; cell: RoleStageCell } | null {
  const role = playbookRoleFromUserRole(userRole)
  const stade = playbookStadeFromSize(consultantSize)
  if (!role || !stade) return null
  return { role, stade, cell: ROLE_STAGE_PLAYBOOK[role][stade] }
}

/** La copie lue par le service IA — générée, jamais éditée à la main. */
export function renderRoleStagePlaybookJson(): Record<string, unknown> {
  return {
    _generated:
      'GÉNÉRÉ depuis packages/contracts/src/schemas/role-stage-playbook.ts — ne pas éditer ; UPDATE_ROLE_STAGE_PLAYBOOK=1 vitest le réécrit.',
    _authorship: 'Rédigé par Claude le 11/10/2026 sur décision de Louis (« fais tout ») — à relire par Louis.',
    roles: PLAYBOOK_ROLES,
    roleLabels: ROLE_LABELS,
    stades: PLAYBOOK_STADES,
    stadeLabels: STADE_LABELS,
    stadeUpperBounds: STADE_UPPER_BOUNDS.map(([bound]) => bound),
    dimensions: PLAYBOOK_DIMENSIONS,
    dimensionLabels: DIMENSION_LABELS,
    userRoleToRole: USER_ROLE_TO_PLAYBOOK_ROLE,
    cells: ROLE_STAGE_PLAYBOOK,
  }
}
