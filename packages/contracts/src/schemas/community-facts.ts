import { z } from 'zod'

/**
 * La donnée communautaire — ce que plusieurs espaces disent du MÊME compte.
 *
 * Le tome 2 §5 l'appelle le seul avantage durable : les sources publiques sont
 * accessibles à quiconque a un budget, ce que les utilisateurs SAVENT ne l'est
 * pas. « Ce compte est référencé », « il impose un porteur », « le panel se
 * rouvre en 2027 » — aucune API ne le dira jamais pour une entreprise privée.
 *
 * Quatre principes, non négociables (§5.3), et ce module en porte trois :
 *
 * - **le seuil** — une information ne devient communautaire qu'à partir de
 *   {@link COMMUNITY_THRESHOLD} espaces DISTINCTS qui la confirment. En dessous,
 *   elle reste locale à qui l'a saisie ;
 * - **la réciprocité** — un espace qui ne partage pas ne consomme pas. Il voit
 *   que l'information existe, jamais sa valeur : c'est ce qui rend le mécanisme
 *   légitime, et c'est le seul levier d'adoption qui tienne à grande échelle ;
 * - **l'anonymat** — l'origine d'une déclaration ne sort JAMAIS d'ici. Deux ESN
 *   concurrentes contribuent sans le savoir, et la sortie de cette fonction ne
 *   porte aucun identifiant d'espace.
 *
 * Le quatrième — l'opt-in explicite — vit au-dessus : c'est un réglage d'espace,
 * décoché par défaut, et il arrive ici sous la forme du booléen `contributes`.
 *
 * Pure et testée à part : c'est la règle qui décide ce qu'un client voit d'un
 * autre client. La mettre dans un service la rendrait invérifiable.
 */

/** Trois espaces distincts. Deux, c'est une coïncidence ; trois, un fait. */
export const COMMUNITY_THRESHOLD = 3

/**
 * Les natures de fait qui peuvent s'agréger entre espaces — et l'interdit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CINQUIÈME PRINCIPE, QUI N'EST PAS PRODUIT MAIS JURIDIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome 8 le pose deux fois, en §26 (D70) et en §54, et dans les deux cas avec
 * le marqueur « à vérifier AVANT de l'ouvrir » :
 *
 *   « La commission d'accès en communautaire — juridiquement sensible :
 *     échange d'informations tarifaires entre concurrents. »
 *
 * Les espaces de Bellum sont des ESN, c'est-à-dire des **concurrents**. Agréger
 * ce que chacune paie de commission pour entrer chez un client, puis le servir
 * aux autres, est le cas d'école de l'échange d'informations tarifaires — la
 * pratique que le droit de la concurrence regarde en premier, et le seul point
 * de tout le mécanisme communautaire qui n'engage pas la qualité du produit mais
 * la responsabilité de l'éditeur.
 *
 * Les trois autres natures ne posent pas ce problème : « ce compte est
 * référencé », « il impose un porteur », « voici par où on entre » sont des
 * faits d'organisation du CLIENT, pas des conditions commerciales du
 * fournisseur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CONSTANTE PLUTÔT QU'UN COMMENTAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'interdit était RESPECTÉ au 25/08/2026 — mais par un `WHERE f.kind = 'lock'`
 * écrit à la main dans un seul service, sans qu'aucun texte ne dise pourquoi.
 * La suite naturelle du mécanisme est d'étendre l'agrégation aux modes d'accès,
 * ce que le tome 2 demande ; le jour où quelqu'un l'écrira, il passera de
 * `'lock'` à `IN ('lock','mode',…)` et rien ne l'arrêtera avant `cost`.
 *
 * Un interdit qui ne tient qu'à la mémoire de celui qui a écrit la requête n'est
 * pas un interdit.
 */
export const COMMUNITY_AGGREGABLE_KINDS = ['lock', 'mode', 'path'] as const
export type CommunityAggregableKind = (typeof COMMUNITY_AGGREGABLE_KINDS)[number]

/**
 * Ce qui ne s'agrège JAMAIS, avec la raison — en clair, pour être relu.
 *
 * Cette liste et {@link COMMUNITY_AGGREGABLE_KINDS} doivent couvrir ensemble
 * TOUTES les natures de fait d'accès, sans recouvrement : une nature ajoutée
 * demain doit être rangée d'un côté ou de l'autre, et la garde le vérifie.
 */
export const COMMUNITY_FORBIDDEN_KINDS: Readonly<Record<string, string>> = {
  cost: "échange d'informations tarifaires entre concurrents — tome 8, D70 et §54 : à valider juridiquement AVANT toute ouverture",
  access_status:
    "#4802 — état d'accès posé à la main sur UN compte (référencé / à bâtir) : une lecture commerciale privée à l'espace, pas un fait de marché",
}

/** Une nature de fait peut-elle entrer dans le pool communautaire ? */
export function isCommunityAggregable(kind: string): kind is CommunityAggregableKind {
  return (COMMUNITY_AGGREGABLE_KINDS as readonly string[]).includes(kind)
}

export type CommunityFactInput = {
  /** L'espace qui a déclaré. Il ne ressort jamais — il ne sert qu'à compter. */
  workspaceId: string
  value: string
  observedAt: string | null
}

export type CommunityAggregate = {
  /**
   * Ce qu'on affiche. `null` = inconnu, et c'est une réponse : ni « ouvert »,
   * ni « verrouillé ». La valeur de l'espace qui demande gagne toujours sur
   * celle de la communauté — il connaît son client mieux qu'une majorité.
   */
  value: string | null
  /**
   * Vrai quand la valeur rendue est CONFIRMÉE au niveau communautaire — trois
   * espaces distincts, sans divergence — et que l'espace qui demande a le droit
   * de la consommer. Que l'espace soit lui-même l'un des trois ne change rien :
   * ce qui compte est la force de l'affirmation, pas qui l'a portée.
   */
  isCommunity: boolean
  /** Combien d'espaces DISTINCTS portent la valeur rendue (ou la majoritaire). */
  sourcesCount: number
  /** Deux valeurs incompatibles circulent : on le dit, on ne tranche pas. */
  conflict: boolean
  /**
   * Une valeur communautaire existe mais n'est pas servie, faute de partage
   * activé. Le dire est le mécanisme de réciprocité ; le taire en ferait une
   * fonctionnalité manquante de plus.
   */
  communityAvailable: boolean
  /** Toutes les valeurs en présence, la plus portée d'abord. Sans identités. */
  values: { value: string; sourcesCount: number }[]
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Agrège les déclarations de plusieurs espaces sur un même fait.
 *
 * L'ordre des règles est la règle : on compte des ESPACES et non des
 * déclarations (un espace qui se répète trois fois reste une voix), la
 * divergence l'emporte sur le seuil (une information contredite n'est pas une
 * information), et la déclaration de l'espace qui demande l'emporte sur tout.
 */
export function aggregateAccessFacts(input: {
  facts: readonly CommunityFactInput[]
  askingWorkspaceId: string
  /** L'espace a-t-il activé le partage ? Décoché par défaut. */
  contributes: boolean
}): CommunityAggregate {
  const byValue = new Map<string, Set<string>>()
  let own: string | null = null

  for (const fact of input.facts) {
    const workspaceId = (fact?.workspaceId ?? '').trim()
    const value = normalize(fact?.value ?? '')
    if (!workspaceId || !value) continue
    const seen = byValue.get(value) ?? new Set<string>()
    seen.add(workspaceId)
    byValue.set(value, seen)
    if (workspaceId === input.askingWorkspaceId) own = value
  }

  const values = [...byValue.entries()]
    .map(([value, spaces]) => ({ value, sourcesCount: spaces.size }))
    .sort((a, b) => b.sourcesCount - a.sourcesCount || a.value.localeCompare(b.value))

  const conflict = values.length > 1
  const top = values[0] ?? null
  // Le seuil ne s'applique qu'à une valeur NON contredite : « deux concordants
  // et un divergent » reste local, et une valeur déjà communautaire repasse en
  // inconnu dès qu'un espace la contredit.
  const communityValue = !conflict && top && top.sourcesCount >= COMMUNITY_THRESHOLD ? top.value : null

  const value = own ?? (input.contributes ? communityValue : null)
  return {
    value,
    isCommunity: input.contributes && value !== null && value === communityValue,
    sourcesCount: value ? (byValue.get(value)?.size ?? 0) : (top?.sourcesCount ?? 0),
    conflict,
    communityAvailable: communityValue !== null && !input.contributes && own === null,
    values,
  }
}

/* ------------------------------------------------------------------ */
/*  Les cinq moments de contribution (tome 2 §24)                      */
/* ------------------------------------------------------------------ */

/**
 * Quand on pose la question, et une seule fois.
 *
 * La contribution doit coûter UN CLIC, jamais un formulaire : c'est la
 * différence entre une base qui se constitue et une base vide. L'ordre de cette
 * liste est l'ordre de PRIORITÉ — un compte peut déclencher trois moments le
 * même jour, on n'en pose qu'un.
 *
 * Deux des cinq moments du tome n'y sont pas, et pour deux raisons opposées :
 *
 * - `data_correction` est DÉJÀ livré — « Ce n'est pas exact » existe sur chaque
 *   valeur affichée, et c'est un geste de l'utilisateur, pas une question ;
 * - `partner_placement` (« ce partenaire travaille-t-il bien ? ») est REFUSÉ
 *   pour l'instant : sa réponse alimenterait une fiabilité de partenaire que
 *   rien ne lit — `partnerScore` combine rang, relation et placements, pas une
 *   appréciation déclarée. L'inscrire ici produirait une question dont la
 *   réponse ne changerait rien, ce qui est la meilleure façon de faire cesser
 *   de répondre. Il revient avec le canal partenaire (tome 4).
 */
/*
 * ⚠️ GA-08 — l'ordre est FIGÉ et les ajouts vont en FIN, ce qui a une
 * conséquence de PRIORITÉ ici : la liste est aussi l'ordre dans lequel
 * `pendingQuestion()` choisit. `sprint3_qualification` arrive donc en dernier,
 * et c'est le bon rang — un refus tout frais, une mission qui s'achève ou un
 * premier contact sont des moments PONCTUELS, qui passent ; la qualification du
 * Sprint 3 dure aussi longtemps que le compte reste dans la colonne. La poser
 * en premier brûlerait le seul tour de parole disponible et ferait perdre les
 * trois autres, qui ne reviendront pas.
 *
 * ⚠️ La contrainte SQL a été élargie AVANT (migration
 * `1791550000001-AccessQuestionSprint3Moment`) — GA-11 / GA-12.
 */
export const ACCESS_QUESTION_MOMENTS = [
  'after_refusal',
  'mission_end',
  'first_contact',
  /**
   * La qualification du Sprint 3 (`T5.md:882-899`).
   *
   * Le « Sprint 3 » de la source est la TROISIÈME colonne du board d'effort —
   * `volume`, la qualification au volume. Aucun niveau de sprint n'est ajouté.
   *
   * ⚠️ Ce qui est livré ici est le MOMENT, pas la grille de huit questions : la
   * source n'en donne le texte nulle part dans le dépôt, et les inventer
   * mettrait huit formulations devinées dans la bouche du produit. Ce moment
   * porte la seule des huit dont on connaît la destination — la troisième,
   * celle qui alimente `access_fact` — et ses réponses sont donc celles du
   * verrou, exactement comme `mission_end` et `first_contact`. Les sept autres
   * attendent leur texte.
   */
  'sprint3_qualification',
] as const
export type AccessQuestionMoment = (typeof ACCESS_QUESTION_MOMENTS)[number]

/** Ce que la réponse alimente. `skip` = « pas abordé », qui est une réponse. */
export const ACCESS_ANSWER_VALUES = [
  'panel_ferme',
  'panel_ouvert',
  'refus_fond',
  'refus_referencement',
  'skip',
] as const
export type AccessAnswerValue = (typeof ACCESS_ANSWER_VALUES)[number]

/** Les réponses proposées pour chaque moment, dans l'ordre d'affichage. */
export const ACCESS_QUESTION_ANSWERS: Readonly<Record<AccessQuestionMoment, readonly AccessAnswerValue[]>> = {
  after_refusal: ['refus_fond', 'refus_referencement', 'skip'],
  mission_end: ['panel_ferme', 'panel_ouvert', 'skip'],
  first_contact: ['panel_ferme', 'panel_ouvert', 'skip'],
  // Même jeu que les deux précédents : la question du Sprint 3 qui alimente
  // `access_fact` porte sur le RÉFÉRENCEMENT, pas sur un motif de refus.
  sprint3_qualification: ['panel_ferme', 'panel_ouvert', 'skip'],
}

/**
 * L'état de verrouillage qu'une réponse établit, ou `null` quand elle n'en
 * établit aucun.
 *
 * « Pas abordé » et « refus de fond » ne disent RIEN du référencement : les
 * traduire en `ouvert` inventerait une porte. C'est la moitié de la valeur du
 * mécanisme — une réponse qui n'apprend rien doit rester sans effet.
 */
export function lockFromAnswer(answer: AccessAnswerValue): 'ouvert' | 'verrouille' | null {
  if (answer === 'panel_ferme' || answer === 'refus_referencement') return 'verrouille'
  if (answer === 'panel_ouvert') return 'ouvert'
  return null
}

export const accessQuestionAnswerSchema = z.object({
  moment: z.enum(ACCESS_QUESTION_MOMENTS),
  answer: z.enum(ACCESS_ANSWER_VALUES),
})
export type AccessQuestionAnswer = z.infer<typeof accessQuestionAnswerSchema>

/**
 * L'opt-in d'espace — principe n°1 des quatre, décoché par défaut.
 *
 * Réservé au PROPRIÉTAIRE côté service, comme le cloisonnement de portefeuille :
 * c'est un réglage qui décide de ce que l'espace donne à voir aux autres, et
 * personne d'autre que celui qui répond du contrat ne doit pouvoir l'activer.
 */
export const setCommunitySharingSchema = z.object({ sharing: z.boolean() })
export type SetCommunitySharing = z.infer<typeof setCommunitySharingSchema>
