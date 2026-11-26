/**
 * #2323.38-.45 — LE MOTEUR DE CONTRADICTIONS D'UN BESOIN (LAU-FINAL-064).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIX DÉTECTEURS, UN SEUL MODULE — décidé sans Louis (registre #2323,
 * coordinateur, 25/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Une contradiction est un COUPLE de champs du besoin — parfois du besoin et
 * de l'espace (vivier, historique de positionnement) — qui, ensemble, rendent
 * le besoin tel qu'il est écrit irréalisable. Ni l'un ni l'autre champ n'est
 * fautif seul ; c'est la COMBINAISON qui l'est.
 *
 * ⚠️ CE MODULE NE LIT NI LE VIVIER NI LES POSITIONNEMENTS. Deux détecteurs
 * (#2323.39 la médiane TJM des juniors, #2323.41 l'espace freelance-only,
 * #2323.43 la disponibilité d'une habilitation) ont besoin d'une agrégation
 * CROSS-DOMAINE que seul l'appelant peut calculer (SQL, `apps/api`) — ce
 * fichier reçoit le RÉSULTAT déjà agrégé (`medianJuniorTjmCents`,
 * `workspaceFreelanceOnly`, `clearanceAvailable`), jamais les lignes brutes.
 * Même discipline que {@link needQualitySummary} : un réglage vit à un seul
 * endroit (GA-26), et une agrégation SQL recopiée ici diverge de l'originale
 * au premier changement de seuil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOCTRINE UNKNOWN ≠ ZERO, appliquée à SIX détecteurs indépendants
 * ─────────────────────────────────────────────────────────────────────────────
 * Un champ absent n'est JAMAIS lu comme « pas de contradiction » — il sort
 * NOMMÉ dans `notEvaluable`, sauf pour une LISTE vide (`clearances` vide) : une
 * absence de LISTE ne fait AUCUNE ligne (doctrine « on n'affiche pas ce qu'on
 * n'a pas »), parce qu'une liste vide n'est PAS un champ non renseigné — c'est
 * la réponse « aucune habilitation exigée ».
 *
 * Chaque détecteur suit la MÊME forme à trois branches :
 *  1. le champ qui décide si le détecteur S'APPLIQUE est-il connu ? Sinon
 *     `notEvaluable` (sauf la liste vide, ci-dessus).
 *  2. le détecteur ne s'applique pas (séniorité junior, remote non-full,
 *     freelance non exclu, mission courte) ⇒ RIEN, silencieusement — ce n'est
 *     pas une question sans réponse, c'est une question qui ne se pose pas.
 *  3. le détecteur s'applique : les champs qui restent sont-ils connus ?
 *     Sinon `notEvaluable`, sinon la comparaison tranche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2323.44/.45 — NOMMER, PROPOSER, JAMAIS APPLIQUER
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque contradiction porte un libellé (`label`) qui la NOMME et UN arbitrage
 * proposé (`arbitration`) — jamais deux, jamais un choix par défaut. Aucun
 * champ de statut « appliqué » : ce module ne modifie rien, et rien dans ce
 * dépôt n'écrit un arbitrage à la place d'un humain (doctrine « ce qui
 * n'écrit pas tout seul »).
 */

/** Sous 15 jours, un processus de recrutement compte comme « urgent » —
 *  même seuil que l'exemple de l'issue (#2323.38, « démarrage immédiat »). */
const IMMEDIATE_START_DAYS = 14
/** À partir de 4 entretiens, un processus compte comme « lourd » — l'exemple
 *  même de l'issue. */
const HEAVY_INTERVIEW_ROUNDS = 4
/** À partir de 6 mois, une mission compte comme « longue » (#2323.42). */
const LONG_MISSION_MONTHS = 6
const SENIOR_LIKE_SENIORITIES = new Set(['senior', 'expert'])

export interface NeedContradictionsInput {
  start_on: string | null
  interview_rounds: number | null
  seniority: string | null
  /** Le budget MAX communiqué par le client pour ce besoin —
   *  `project_needs.target_tjm_cents`, en centimes. */
  target_tjm_cents: number | null
  /** #2323.39 — la médiane TJM des consultants `junior` non archivés de
   *  l'espace, en centimes. `null` = moins de 3 juniors avec un TJM connu
   *  (agrégée par l'appelant, jamais recalculée ici). */
  medianJuniorTjmCents: number | null
  remote: string | null
  onsite_days_per_week: number | null
  freelance_excluded: boolean | null
  /** #2323.41 — agrégée par l'appelant : `true` si l'espace compte au moins 5
   *  positionnements sur 12 mois et que 100 % portent sur des consultants
   *  freelance. `null` = seuil non atteint, non déterminable. */
  workspaceFreelanceOnly: boolean | null
  duration_months: number | null
  budget_validated: boolean | null
  clearances: readonly string[]
  /** #2323.43 — agrégée par l'appelant : au moins un consultant actif du
   *  vivier détient au moins une des habilitations exigées. `null` =
   *  non vérifiée. Ignorée si `clearances` est vide. */
  clearanceAvailable: boolean | null
  now?: Date
}

export interface NeedContradiction {
  key: string
  label: { fr: string; en: string }
  arbitration: { fr: string; en: string }
}

export interface NeedContradictionNotEvaluable {
  key: string
  reason: { fr: string; en: string }
}

export interface NeedContradictionsResult {
  contradictions: readonly NeedContradiction[]
  notEvaluable: readonly NeedContradictionNotEvaluable[]
}

function daysUntil(dateIso: string, now: Date): number {
  const target = new Date(`${dateIso}T00:00:00.000Z`).getTime()
  return Math.floor((target - now.getTime()) / (24 * 60 * 60 * 1000))
}

function detectInterviewProcess(
  input: NeedContradictionsInput,
  now: Date,
): NeedContradiction | NeedContradictionNotEvaluable | null {
  if (input.start_on == null || input.interview_rounds == null) {
    return {
      key: 'interview_process',
      reason: {
        fr: 'Date de démarrage ou nombre d’entretiens non renseigné.',
        en: 'Start date or number of interview rounds not filled in.',
      },
    }
  }
  const immediate = daysUntil(input.start_on, now) <= IMMEDIATE_START_DAYS
  if (!immediate || input.interview_rounds < HEAVY_INTERVIEW_ROUNDS) return null
  return {
    key: 'interview_process',
    label: {
      fr: `Démarrage attendu sous ${IMMEDIATE_START_DAYS} jours, mais un processus à ${input.interview_rounds} entretiens.`,
      en: `Start expected within ${IMMEDIATE_START_DAYS} days, but a ${input.interview_rounds}-round interview process.`,
    },
    arbitration: {
      fr: 'Réduire le processus à deux entretiens, ou décaler la date de démarrage.',
      en: 'Cut the process down to two interviews, or push back the start date.',
    },
  }
}

function detectSeniorityBudget(
  input: NeedContradictionsInput,
): NeedContradiction | NeedContradictionNotEvaluable | null {
  if (input.seniority == null) {
    return { key: 'seniority_budget', reason: { fr: 'Séniorité non renseignée.', en: 'Seniority not filled in.' } }
  }
  if (!SENIOR_LIKE_SENIORITIES.has(input.seniority)) return null
  if (input.target_tjm_cents == null) {
    return {
      key: 'seniority_budget',
      reason: { fr: 'Budget ou TJM cible non communiqué.', en: 'Budget or target daily rate not communicated.' },
    }
  }
  if (input.medianJuniorTjmCents == null) {
    return {
      key: 'seniority_budget',
      reason: {
        fr: 'Moins de trois consultants juniors avec un TJM connu dans l’espace — médiane non calculable.',
        en: 'Fewer than three junior consultants with a known rate in this workspace — median cannot be computed.',
      },
    }
  }
  if (input.target_tjm_cents > input.medianJuniorTjmCents) return null
  return {
    key: 'seniority_budget',
    label: {
      fr: `Séniorité « ${input.seniority} » demandée avec un budget au TJM médian des consultants juniors de l’espace, ou en dessous.`,
      en: `« ${input.seniority} » seniority requested with a budget at or below the median junior consultant rate in this workspace.`,
    },
    arbitration: {
      fr: 'Revoir le budget à la hausse, ou accepter un profil moins senior.',
      en: 'Raise the budget, or accept a less senior profile.',
    },
  }
}

function detectRemoteOnsite(input: NeedContradictionsInput): NeedContradiction | NeedContradictionNotEvaluable | null {
  if (input.remote == null) {
    return {
      key: 'remote_onsite',
      reason: { fr: 'Politique de télétravail non renseignée.', en: 'Remote-work policy not filled in.' },
    }
  }
  if (input.remote !== 'full_remote') return null
  if (input.onsite_days_per_week == null) {
    return {
      key: 'remote_onsite',
      reason: {
        fr: 'Jours de présence sur site par semaine non renseignés.',
        en: 'On-site days per week not filled in.',
      },
    }
  }
  if (input.onsite_days_per_week < 1) return null
  return {
    key: 'remote_onsite',
    label: {
      fr: `Politique full remote déclarée, mais ${input.onsite_days_per_week} jour(s) de présence sur site exigé(s) par semaine.`,
      en: `Full remote policy declared, but ${input.onsite_days_per_week} on-site day(s) required per week.`,
    },
    arbitration: {
      fr: 'Clarifier la politique de télétravail avec le client, ou revoir le nombre de jours sur site.',
      en: 'Clarify the remote-work policy with the client, or revisit the number of on-site days.',
    },
  }
}

function detectFreelanceOnly(input: NeedContradictionsInput): NeedContradiction | NeedContradictionNotEvaluable | null {
  if (input.freelance_excluded == null) {
    return {
      key: 'freelance_only',
      reason: { fr: 'Exclusion freelance non renseignée.', en: 'Freelance exclusion not filled in.' },
    }
  }
  if (!input.freelance_excluded) return null
  if (input.workspaceFreelanceOnly == null) {
    return {
      key: 'freelance_only',
      reason: {
        fr: 'Moins de cinq positionnements sur douze mois dans l’espace — statut freelance-only non déterminable.',
        en: 'Fewer than five placements over twelve months in this workspace — freelance-only status cannot be determined.',
      },
    }
  }
  if (!input.workspaceFreelanceOnly) return null
  return {
    key: 'freelance_only',
    label: {
      fr: 'Freelance exclu sur ce besoin, alors que l’espace ne place que des freelances depuis douze mois.',
      en: 'Freelancers excluded on this need, while this workspace has only placed freelancers over the last twelve months.',
    },
    arbitration: {
      fr: 'Revoir l’exclusion freelance avec le client, ou orienter ce besoin vers un autre espace ou partenaire.',
      en: 'Revisit the freelance exclusion with the client, or route this need to another workspace or partner.',
    },
  }
}

function detectLongMissionBudget(
  input: NeedContradictionsInput,
): NeedContradiction | NeedContradictionNotEvaluable | null {
  if (input.duration_months == null) {
    return {
      key: 'long_mission_budget',
      reason: { fr: 'Durée de mission non renseignée.', en: 'Assignment duration not filled in.' },
    }
  }
  if (input.duration_months < LONG_MISSION_MONTHS) return null
  if (input.budget_validated == null) {
    return {
      key: 'long_mission_budget',
      reason: { fr: 'Validation du budget non renseignée.', en: 'Budget validation not filled in.' },
    }
  }
  if (input.budget_validated) return null
  return {
    key: 'long_mission_budget',
    label: {
      fr: `Mission longue (${input.duration_months} mois) avec un budget non encore validé.`,
      en: `Long assignment (${input.duration_months} months) with a budget not yet validated.`,
    },
    arbitration: {
      fr: 'Faire valider le budget avant de lancer le matching, ou découper la mission en phases validées.',
      en: 'Get the budget validated before launching matching, or split the assignment into validated phases.',
    },
  }
}

function detectClearanceAvailability(
  input: NeedContradictionsInput,
): NeedContradiction | NeedContradictionNotEvaluable | null {
  // Liste vide = aucune habilitation exigée, une VRAIE réponse — aucune ligne,
  // ni contradiction ni non-évaluable (« on n'affiche pas ce qu'on n'a pas »).
  if (input.clearances.length === 0) return null
  if (input.clearanceAvailable == null) {
    return {
      key: 'clearance_availability',
      reason: {
        fr: 'Disponibilité de l’habilitation dans le vivier non vérifiée.',
        en: 'Clearance availability in the bench not checked.',
      },
    }
  }
  if (input.clearanceAvailable) return null
  return {
    key: 'clearance_availability',
    label: {
      fr: `Habilitation exigée (${input.clearances.join(', ')}) qu’aucun consultant actif du vivier ne détient.`,
      en: `Required clearance (${input.clearances.join(', ')}) held by no active consultant in the bench.`,
    },
    arbitration: {
      fr: 'Lancer un sourcing externe ou partenaire pour cette habilitation, ou revoir l’exigence avec le client.',
      en: 'Start external or partner sourcing for this clearance, or revisit the requirement with the client.',
    },
  }
}

function isContradiction(value: NeedContradiction | NeedContradictionNotEvaluable): value is NeedContradiction {
  return 'label' in value
}

export function needContradictions(input: NeedContradictionsInput): NeedContradictionsResult {
  const now = input.now ?? new Date()
  const results = [
    detectInterviewProcess(input, now),
    detectSeniorityBudget(input),
    detectRemoteOnsite(input),
    detectFreelanceOnly(input),
    detectLongMissionBudget(input),
    detectClearanceAvailability(input),
  ].filter((value): value is NeedContradiction | NeedContradictionNotEvaluable => value !== null)

  return {
    contradictions: results.filter(isContradiction),
    notEvaluable: results.filter(value => !isContradiction(value)) as NeedContradictionNotEvaluable[],
  }
}
