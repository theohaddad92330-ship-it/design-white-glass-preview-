/**
 * Ce que la bibliothèque d'objections ne couvre PAS — §9 (« top 20 des
 * objections/questions non couvertes ») et §11 P1 (« bibliothèque enrichie
 * chaque semaine à partir des vraies conversations »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SORT DE LA CONVERSATION, ET CE QUI N'EN SORT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * **La phrase du visiteur reste dans le tour de conversation.** Ce qui remonte
 * est un THÈME : un mot d'un vocabulaire fermé de treize entrées, calculé ici,
 * sur un message qu'on avait déjà sous la main pour répondre. Il ne désigne
 * personne, ne se recompose pas, et ne sert qu'à compter.
 *
 * Et il ne remonte QUE s'il n'est couvert par aucune entrée de la bibliothèque.
 * Une objection déjà traitée n'apprend rien : la mesure ne se déclenche que sur
 * l'angle mort. C'est ce qui fait qu'on peut lire le compteur comme une liste de
 * choses à écrire, et pas comme un trafic à filtrer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CLASSEUR N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est pas un modèle : c'est une table de motifs. Elle se trompe, et on sait
 * de quel côté : un faux positif sur un thème COUVERT ne déclenche rien du tout
 * (la mesure ne regarde que les angles morts), un faux positif sur un thème non
 * couvert gonfle un compteur qu'un humain relit avant d'écrire quoi que ce soit.
 * Aucun des deux ne modifie le produit — c'est le point n°3 du chantier : une
 * objection se PROPOSE, elle ne s'ajoute pas toute seule.
 *
 * ⚠️ Aucun motif ne porte le nom d'un éditeur. Ce n'est pas seulement la
 * doctrine du dépôt : un nom de produit dans une table de motifs vieillit plus
 * vite que la table, et « CRM » attrape de toute façon la phrase entière.
 */

/**
 * Le vocabulaire fermé des thèmes.
 *
 * Recopié de `@bellum/contracts` (`CHATBOT_OBJECTION_THEMES`), qui est une
 * dépendance de développement du site — la garde `contracts-parity.test.ts`
 * confronte les deux listes.
 */
export const OBJECTION_THEMES = [
  'price',
  'competitor',
  'trust_ai',
  'data_privacy',
  'fit_size',
  'integration',
  'adoption',
  'timing',
  'proof',
  'legal',
  'sovereignty',
  'support',
  'other',
] as const

export type ObjectionTheme = (typeof OBJECTION_THEMES)[number]

/** Minuscules, sans accents : « données » et « donnees » sont la même chose, et
 *  un visiteur sur trois écrit sans accents. */
function normalize(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Les motifs, dans l'ORDRE où ils sont essayés — le premier gagne.
 *
 * L'ordre porte du sens : « RGPD » est une question juridique avant d'être une
 * question sur les données, et « où sont hébergées vos données » est une
 * question de souveraineté avant d'être une question de confidentialité. Les
 * ranger dans l'autre sens rangerait toute la souveraineté sous un thème déjà
 * couvert, et l'angle mort resterait invisible.
 *
 * ⚠️ Aucun drapeau `g` : `RegExp.test()` avec `g` est STATEFUL et rend un
 * résultat sur deux — le dépôt s'est déjà fait avoir.
 */
const PATTERNS: ReadonlyArray<{ theme: ObjectionTheme; pattern: RegExp }> = [
  {
    theme: 'legal',
    pattern: /\b(rgpd|gdpr|dpa|conformite|conforme|juridique|clause|sous-traitant|compliance|legal|contrat)\b/,
  },
  {
    theme: 'sovereignty',
    pattern:
      /(souverain|heberg|data residency|hosted (in|where)|cloud act|vos serveurs|les serveurs sont|donnees (restent|sortent|en europe|en france))/,
  },
  {
    theme: 'data_privacy',
    pattern: /(mes donnees|nos donnees|donnees vont|qui (voit|a acces)|confidentialite|privacy|donnees personnelles)/,
  },
  {
    theme: 'trust_ai',
    pattern: /(hallucin|ca invente|vous inventez|fiabl|se trompe|make (things|stuff) up|accurate|pas fiable)/,
  },
  {
    theme: 'price',
    pattern: /\b(trop cher|cher|prix|tarif|budget|coute|couteux|devis|expensive|pricing|quote)\b/,
  },
  {
    theme: 'fit_size',
    pattern: /(trop petit|trop gros|trop grand|petite structure|too small|too big|pas (assez|la) taille)/,
  },
  {
    theme: 'proof',
    pattern: /(combien de clients|reference|temoignage|preuve|roi|case stud|track record|qui vous utilise|resultats)/,
  },
  {
    theme: 'adoption',
    pattern:
      /(un outil de plus|encore un outil|yet another tool|adoption|ils ne (vont|voudront) pas|remplace mes|remplacer mes|ne rempliront)/,
  },
  {
    theme: 'integration',
    pattern: /(se connecte|connecter|integration|integrat|synchronis|import|export|\bapi\b)/,
  },
  {
    theme: 'competitor',
    pattern: /(on a deja|nous avons deja|already (have|use)|concurrent|competitor|alternative|\b(crm|ats|erp)\b)/,
  },
  {
    theme: 'support',
    pattern:
      /(parler a (quelqu|un humain|une personne)|un humain|support|accompagnement|onboarding|formation|talk to (someone|a human))/,
  },
  {
    theme: 'timing',
    pattern: /(pas le temps|plus tard|y reflechir|reflechir|pas maintenant|recontact|envoie.{0,12}doc|no time|later)/,
  },
]

/**
 * Les marques d'un doute qui ne se range dans aucun thème.
 *
 * Elles rendent `other` plutôt que `null` : un doute qu'on ne sait pas nommer
 * est exactement ce qu'on veut compter — c'est là que se cache l'objection qu'on
 * n'a pas prévue. Le ranger de force sous un thème connu le rendrait invisible.
 */
const GENERIC_DOUBT =
  /(pas convaincu|je doute|pas sur que|ca sert a quoi|a quoi ca sert|ca marche vraiment|pourquoi (je|on|vous)|not convinced|why would|what.s the point)/

/**
 * Le thème de cette phrase, ou `null` si elle ne ressemble pas à une objection.
 *
 * `null` est le cas le plus fréquent et c'est voulu : « c'est quoi BellumAI »
 * n'est pas une objection, et compter les questions ordinaires noierait les
 * angles morts sous le trafic normal.
 */
export function detectObjectionTheme(message: string): ObjectionTheme | null {
  const text = normalize(message)
  if (!text.trim()) return null

  for (const { theme, pattern } of PATTERNS) {
    if (pattern.test(text)) return theme
  }
  return GENERIC_DOUBT.test(text) ? 'other' : null
}

/**
 * Cette phrase soulève-t-elle un angle mort de la bibliothèque ?
 *
 * Rend le thème à compter, ou `null`. `covered` vient de la bibliothèque
 * elle-même (`coveredObjectionThemes()`), jamais d'une seconde liste.
 */
export function uncoveredObjectionTheme(message: string, covered: ReadonlySet<ObjectionTheme>): ObjectionTheme | null {
  const theme = detectObjectionTheme(message)
  if (!theme || covered.has(theme)) return null
  return theme
}
