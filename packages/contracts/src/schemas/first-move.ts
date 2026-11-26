import { z } from 'zod'

/**
 * Le PREMIER MOUVEMENT en quatre points (tome 5 §14.4).
 *
 * Le format vient d'un document réel, écrit à la main par un praticien pour son
 * équipe : cibler · message · si silence · **ne pas faire**. Les trois premiers
 * points existent dans tous les outils du marché. Le quatrième n'existe nulle
 * part, et c'est celui qui vaut :
 *
 * > Un produit qui ne dit que ce qu'il faut faire laisse l'utilisateur commettre
 * > l'erreur évidente. Dire ce qu'il ne faut PAS faire est plus rare et plus
 * > utile.
 *
 * ⚠️ L'interdit est **SERVI depuis le 23/08/2026** — voir
 * {@link ANTI_ADVICE_ENABLED}, qui porte l'arbitrage et ce qu'il accepte. Un
 * conseil inutile fait perdre trois secondes ; un conseil faux, énoncé avec
 * autorité, fait perdre un compte : c'est le risque assumé, et c'est pourquoi
 * chaque interdit affiche SA RAISON chiffrée juste en dessous.
 *
 * (Cette ligne a dit « désactivé par défaut » pendant deux jours après que la
 * constante soit passée à `true`. Un commentaire qui contredit son code est
 * pire qu'un commentaire absent : on le croit.)
 */

/** Les six familles d'interdit observées sur sept comptes réels (§26.1). */
export const ANTI_ADVICE_KINDS = [
  'entite',
  'vocabulaire',
  'positionnement',
  'circuit',
  'registre',
  'cadre_de_lecture',
] as const
export type AntiAdviceKind = (typeof ANTI_ADVICE_KINDS)[number]

/**
 * L'interdit est-il servi à l'utilisateur ? — **oui, depuis le 23/08/2026.**
 *
 * Le tome pose une barrière : 24 interdits pertinents sur 30 comptes notés par
 * un humain, et aucun jugé faux. **Louis a tranché de l'allumer sans attendre
 * ce jeu**, les six règles ayant chacune leur raison chiffrée et leurs tests.
 *
 * Ce que cet arbitrage accepte, en clair : trois des six règles INTERPRÈTENT
 * (une maturité produit, une culture d'entreprise, un cadre de lecture) là où
 * les trois autres déduisent d'un fait vérifiable. Un interdit faux énoncé avec
 * autorité coûte un compte — c'est le risque assumé, et c'est pourquoi chaque
 * interdit affiche SA RAISON juste en dessous : un utilisateur qui lit
 * « barrière 8,2/10, 47 marchés publics » peut contredire le conseil, ce qu'un
 * impératif nu ne permettrait pas.
 */
export const ANTI_ADVICE_ENABLED = true

/** Au-delà, on garde les deux plus forts : une liste d'interdits ne se lit pas. */
export const MAX_ANTI_ADVICE = 2

export const antiAdviceSchema = z.object({
  kind: z.enum(ANTI_ADVICE_KINDS),
  /** L'interdit, à l'impératif négatif. Jamais générique. */
  label: z.string(),
  /** La raison, CHIFFRÉE. Un interdit sans raison chiffrée n'est pas produit. */
  reason: z.string(),
})
export type AntiAdvice = z.infer<typeof antiAdviceSchema>

export const firstMoveSchema = z.object({
  /** 01 — qui viser, et d'où on le sait. */
  target: z.object({ label: z.string(), source: z.string().nullable() }),
  /** 02 — l'angle, et la preuve mobilisable. */
  message: z.object({ angle: z.string(), proof: z.string().nullable() }),
  /** 03 — la bascule si personne ne répond, avec son délai. */
  ifSilent: z.object({ label: z.string(), afterDays: z.number().int().positive() }),
  /** 04 — ce qu'il ne faut PAS faire. Vide quand aucune règle ne s'applique :
   *  inventer un interdit est pire que ne rien dire. */
  antiAdvice: z.array(antiAdviceSchema),
})
export type FirstMove = z.infer<typeof firstMoveSchema>

export interface FirstMoveInput {
  accountName: string
  /** La classe de barrière du GROUPE (tome 3). */
  barrierScore: number | null
  barrierClass: 'A' | 'B' | 'C' | 'D' | null
  /** L'entité la mieux classée et son score (tome 3 / tome 5 §14.3). */
  bestEntity: { name: string; score: number; city: string | null } | null
  /** L'entité de repli, pour le point 03. */
  fallbackEntity: { name: string } | null
  /** Le siège, pour l'interdit d'entité. */
  headquartersCity: string | null
  headquartersDepartment: string | null
  /** Marchés publics en cours — l'argument chiffré de l'interdit d'entité. */
  publicContracts: number | null
  /** Offres PRODUIT ouvertes simultanément (interdit de vocabulaire). */
  openProductRoles: number | null
  modernStack: boolean
  /** Un partenariat intégrateur annoncé, et sa date (interdit de positionnement). */
  integratorPartnership: { name: string; announcedAt: string | null } | null
  /** Statut et effectif (interdit de circuit). */
  isScaleup: boolean
  headcount: number | null
  /** Une entité produit autonome et sa taille (interdit de cadre de lecture). */
  autonomousProductTeam: { name: string; size: number } | null
  sector: string | null
  /** L'angle et la preuve viennent d'ailleurs — ce module ne les invente pas. */
  angle: string | null
  proof: string | null
  /** Le délai de relance, qui dépend du cycle attendu. */
  silenceDays?: number
}

/** Au-dessus, la barrière du groupe justifie de ne pas viser le siège. */
export const ANTI_ADVICE_BARRIER_FLOOR = 7
/** En dessous, l'entité de repli n'est pas assez forte pour porter l'interdit. */
export const ANTI_ADVICE_ENTITY_FLOOR = 75
/** Une équipe produit autonome au-delà de cette taille change le cadre. */
export const AUTONOMOUS_TEAM_FLOOR = 40
/** Un partenariat plus ancien n'engage plus personne. */
export const PARTNERSHIP_FRESH_MONTHS = 18
/** Au-delà, une entreprise a un circuit d'achat formel. */
export const SCALEUP_HEADCOUNT_CEILING = 1000

const PARIS_DEPARTMENTS = ['75', '77', '78', '91', '92', '93', '94', '95']

function monthsSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

/**
 * Les interdits qui s'appliquent, chacun avec sa raison chiffrée.
 *
 * Aucune règle ne se déclenche « par défaut » : un compte sur lequel on ne sait
 * rien ne produit aucun interdit. C'est voulu — l'anti-conseil tire sa valeur
 * de sa rareté, et un interdit générique (« ne pas être générique ») détruirait
 * la confiance dans les cinq autres.
 */
export function antiAdvice(input: FirstMoveInput, now: Date = new Date()): AntiAdvice[] {
  const found: AntiAdvice[] = []

  // 1 — ENTITÉ. Le siège est verrouillé et une porte existe ailleurs.
  if (
    input.barrierScore !== null &&
    input.barrierScore > ANTI_ADVICE_BARRIER_FLOOR &&
    input.bestEntity &&
    input.bestEntity.score > ANTI_ADVICE_ENTITY_FLOOR
  ) {
    const where = input.headquartersCity ? ` ${input.headquartersCity}` : ''
    const contracts = input.publicContracts ? `, ${input.publicContracts} marchés publics en cours` : ''
    found.push({
      kind: 'entite',
      label: `Ne pas attaquer le siège${where}.`,
      reason: `Barrière estimée ${input.barrierScore}/10${contracts}, direction achats centralisée. « ${input.bestEntity.name} » est la porte (${input.bestEntity.score}/100).`,
    })
  }

  // 2 — VOCABULAIRE. Une maison mûre en produit n'achète pas une disponibilité.
  if ((input.openProductRoles ?? 0) >= 3 && input.modernStack) {
    found.push({
      kind: 'vocabulaire',
      label: 'Ne pas écrire « profil disponible ». Écrire « profil validé ».',
      reason: `${input.openProductRoles} postes produit ouverts simultanément et une stack moderne : un discours de placement ferme la porte, un discours de validation par un pair l'ouvre.`,
    })
  }

  // 3 — POSITIONNEMENT. On ne demande pas à un décideur de se désavouer.
  const partnershipAge = monthsSince(input.integratorPartnership?.announcedAt ?? null, now)
  if (input.integratorPartnership && (partnershipAge === null || partnershipAge < PARTNERSHIP_FRESH_MONTHS)) {
    found.push({
      kind: 'positionnement',
      label: `Ne pas se positionner contre ${input.integratorPartnership.name} — se positionner en renfort.`,
      reason:
        'Partenariat annoncé publiquement, engagement de direction : une alternative frontale oblige le décideur à désavouer sa propre décision.',
    })
  }

  // 4 — CIRCUIT. Chez une scale-up, le circuit formel n'existe pas.
  if (input.isScaleup && (input.headcount ?? 0) > 0 && (input.headcount as number) < SCALEUP_HEADCOUNT_CEILING) {
    found.push({
      kind: 'circuit',
      label: 'Ne pas passer par les achats ni par les RH.',
      reason: `${input.headcount} salariés, aucune direction achats structurée détectée : un service support ralentit de trois semaines une décision qui se prend en trois jours côté produit.`,
    })
  }

  // 5 — REGISTRE. Un discours parisien à Brest signale qu'on n'a pas regardé.
  const outsideParis =
    input.headquartersDepartment !== null && !PARIS_DEPARTMENTS.includes(input.headquartersDepartment)
  if (outsideParis && input.headquartersCity) {
    found.push({
      kind: 'registre',
      label: 'Ne pas se présenter comme un acteur parisien.',
      reason: `Siège à ${input.headquartersCity} : un positionnement parisien signale une méconnaissance du compte.`,
    })
  }

  // 6 — CADRE DE LECTURE. Une structure produit n'est pas un acheteur d'IT.
  if (input.autonomousProductTeam && input.autonomousProductTeam.size > AUTONOMOUS_TEAM_FLOOR) {
    const sector = input.sector ? `un ${input.sector.toLowerCase()}` : 'un acteur du secteur'
    found.push({
      kind: 'cadre_de_lecture',
      label: `Ne pas l'attaquer comme ${sector} classique.`,
      reason: `« ${input.autonomousProductTeam.name} » est une structure produit autonome de ${input.autonomousProductTeam.size} personnes avec sa propre feuille de route : un discours de prestation la range dans les fournisseurs, pas dans les partenaires.`,
    })
  }

  return found.slice(0, MAX_ANTI_ADVICE)
}

/**
 * Le premier mouvement complet.
 *
 * Les points 01 à 03 se déduisent de ce que le dossier sait déjà ; le point 04
 * n'est RENDU que si {@link ANTI_ADVICE_ENABLED} est vrai — mais il est toujours
 * calculé, pour qu'on puisse l'évaluer sur des comptes réels avant de le
 * montrer à qui que ce soit.
 */
export function firstMove(input: FirstMoveInput, now: Date = new Date()): FirstMove {
  const entity = input.bestEntity
  const target = entity
    ? {
        label: `Le responsable digital ou produit de « ${entity.name} »`,
        source: `entité la mieux classée (${entity.score}/100)`,
      }
    : { label: `Le responsable digital ou produit de ${input.accountName}`, source: null }

  const fallback = input.fallbackEntity
    ? `Basculer sur « ${input.fallbackEntity.name} » — même groupe, autre porte.`
    : 'Relancer une fois, puis passer au compte suivant : sans seconde porte, insister coûte plus que ça ne rapporte.'

  return {
    target,
    message: {
      // L'angle vient du plan, jamais d'ici : ce module ne rédige pas.
      angle: input.angle ?? 'Angle à écrire — aucun angle validé sur ce dossier.',
      proof: input.proof,
    },
    ifSilent: { label: fallback, afterDays: input.silenceDays ?? 7 },
    antiAdvice: ANTI_ADVICE_ENABLED ? antiAdvice(input, now) : [],
  }
}

/* ------------------------------------------------------------------ */
/*  La FRAÎCHEUR d'un plan (tome 5 §37).                               */
/* ------------------------------------------------------------------ */

/**
 * Un plan est un objet VIVANT.
 *
 * C'est la première faiblesse que le tome relève du document humain qui lui
 * sert de modèle : « il vaut au jour de sa production, il ment trois mois plus
 * tard ». Un badge permanent est la réponse la moins coûteuse — et un plan
 * périmé reste AFFICHÉ (D78) : le masquer ferait croire qu'il n'y a pas de plan,
 * et l'utilisateur en redemanderait un sans savoir qu'il en avait déjà un.
 */
export const PLAN_FRESHNESS = ['frais', 'vieillissant', 'perime', 'inconnu'] as const
export type PlanFreshness = (typeof PLAN_FRESHNESS)[number]

/** Au-delà, le plan vieillit ; au-delà du second seuil, il est périmé. */
export const PLAN_FRESH_DAYS = 30
export const PLAN_STALE_DAYS = 90

export function planFreshness(generatedAt: string | null | undefined, now: Date): PlanFreshness {
  if (!generatedAt) return 'inconnu'
  const at = new Date(generatedAt)
  if (Number.isNaN(at.getTime())) return 'inconnu'
  const days = (now.getTime() - at.getTime()) / (1000 * 60 * 60 * 24)
  // Une date FUTURE est une donnée cassée, pas un plan très frais : on le dit
  // plutôt que d'afficher « frais » sur une horloge déréglée.
  if (days < -1) return 'inconnu'
  if (days <= PLAN_FRESH_DAYS) return 'frais'
  if (days <= PLAN_STALE_DAYS) return 'vieillissant'
  return 'perime'
}
