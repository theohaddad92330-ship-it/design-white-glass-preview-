import type { ScoredLead } from '@bellum/contracts'

/**
 * Scoring d'engagement des contacts du CRM.
 *
 * Réclamé trois fois par les méta-analyses sous trois noms : « scoring des leads
 * selon engagement » (§5.3 HubSpot n°8), « identifier les leads chauds via
 * scoring comportemental » (n°11), « identifier les leads les plus actifs »
 * (§13.3 n°35). C'est la même question — qui bouge en ce moment ? — et elle
 * mérite une seule réponse, déterministe.
 *
 * Trois partis pris, tous du même côté :
 *
 * 1. **Déterministe, pas un modèle.** Un score produit par un LLM ne se
 *    reproduit pas d'un jour sur l'autre ; un commercial qui voit un lead passer
 *    de 80 à 40 sans que rien n'ait changé cesse de regarder la colonne.
 *
 * 2. **Un signal absent n'est pas un signal à zéro.** HubSpot ne renseigne
 *    `hs_email_open` que si l'e-mail marketing est activé sur le portail. Le
 *    compter comme « zéro ouverture » punirait tous les contacts d'un portail
 *    qui n'utilise pas cette fonction. Chaque composante manquante est retirée
 *    du score ET du maximum, et le résultat dit sur combien de signaux il porte.
 *
 * 3. **Le score s'explique.** Chaque composante rend son libellé et ce qu'elle a
 *    pesé. Un score sans explication est une opinion.
 */

/** Les signaux qu'on sait lire chez un fournisseur de CRM. `null` = non
 *  renseigné par le portail, ce qui est différent de `0`. */
export type EngagementSignals = {
  /** Jours écoulés depuis la dernière activité connue sur la fiche. */
  daysSinceLastActivity: number | null
  /** Nombre de notes/interactions journalisées. */
  notes: number | null
  /** Nombre de fois où le contact a été contacté. */
  contacted: number | null
  /** Ouvertures d'e-mails suivies par le portail. */
  emailOpens: number | null
  /** Clics d'e-mails suivis par le portail. */
  emailClicks: number | null
  /** Deals associés à la fiche. */
  associatedDeals: number | null
}

type ScoreComponent = {
  key: 'recency' | 'notes' | 'contacted' | 'opens' | 'clicks' | 'deals'
  label: string
  /** Points obtenus, sur `max`. */
  points: number
  max: number
}

type LeadScore = {
  /** 0 à 100, rapporté aux seuls signaux disponibles. `null` quand AUCUN signal
   *  n'est lisible : un score de 0 se lit « ce lead est froid », alors que la
   *  vérité est « on ne sait rien de ce lead ». */
  score: number | null
  /** Étiquette dérivée du score. `unknown` quand `score` est `null`. */
  band: 'hot' | 'warm' | 'cold' | 'unknown'
  components: ScoreComponent[]
  /** Combien de signaux sur six ont pu être lus. */
  signalsUsed: number
}

/** Poids par composante — la récence pèse le plus, parce que c'est le seul
 *  signal qui distingue « intéressé » de « l'a été ». */
const WEIGHTS: Record<ScoreComponent['key'], number> = {
  recency: 30,
  contacted: 20,
  deals: 20,
  clicks: 15,
  opens: 10,
  notes: 5,
}

const LABELS: Record<ScoreComponent['key'], string> = {
  recency: 'Activité récente',
  contacted: 'Échanges sortants',
  deals: 'Opportunités liées',
  clicks: 'Clics dans les e-mails',
  opens: 'Ouvertures d’e-mails',
  notes: 'Notes au dossier',
}

/** Ramène un compteur à une fraction de 0 à 1, saturée à `ceiling`. Au-delà, un
 *  contact à 200 notes ne vaut pas dix fois celui qui en a 20 : la saturation
 *  est ce qui empêche un seul signal d'écraser tous les autres. */
function saturate(count: number, ceiling: number): number {
  if (count <= 0) return 0
  return Math.min(count, ceiling) / ceiling
}

/**
 * La récence, convertie en fraction : aujourd'hui vaut 1, trente jours vaut 0.
 * Linéaire et non exponentielle, parce qu'un cycle de vente d'ESN se compte en
 * semaines — une décroissance rapide mettrait tout le monde à zéro.
 */
function recencyFraction(days: number): number {
  if (days <= 0) return 1
  if (days >= 30) return 0
  return 1 - days / 30
}

export function scoreEngagement(signals: EngagementSignals): LeadScore {
  const components: ScoreComponent[] = []

  const push = (key: ScoreComponent['key'], fraction: number): void => {
    const max = WEIGHTS[key]
    components.push({ key, label: LABELS[key], points: Math.round(fraction * max), max })
  }

  if (signals.daysSinceLastActivity != null) push('recency', recencyFraction(signals.daysSinceLastActivity))
  if (signals.contacted != null) push('contacted', saturate(signals.contacted, 5))
  if (signals.associatedDeals != null) push('deals', saturate(signals.associatedDeals, 2))
  if (signals.emailClicks != null) push('clicks', saturate(signals.emailClicks, 3))
  if (signals.emailOpens != null) push('opens', saturate(signals.emailOpens, 5))
  if (signals.notes != null) push('notes', saturate(signals.notes, 5))

  if (components.length === 0) {
    return { score: null, band: 'unknown', components: [], signalsUsed: 0 }
  }

  const points = components.reduce((sum, c) => sum + c.points, 0)
  const max = components.reduce((sum, c) => sum + c.max, 0)
  const score = Math.round((points / max) * 100)

  return {
    score,
    band: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
    components,
    signalsUsed: components.length,
  }
}

/**
 * Classe une liste de contacts, du plus chaud au plus froid.
 *
 * Les contacts sans aucun signal lisible sont rejetés EN FIN de liste plutôt
 * qu'écartés : ils existent, ils ne sont simplement pas mesurables, et les
 * masquer donnerait l'illusion d'un CRM plus renseigné qu'il ne l'est.
 */
export function rankLeads<T extends { id: string; name: string | null; email: string | null; company: string | null }>(
  contacts: readonly (T & { signals: EngagementSignals })[],
  limit: number,
): ScoredLead[] {
  const scored = contacts.map(contact => ({
    id: contact.id,
    name: contact.name,
    email: contact.email,
    company: contact.company,
    ...scoreEngagement(contact.signals),
  }))
  scored.sort((a, b) => {
    if (a.score == null && b.score == null) return a.id.localeCompare(b.id)
    if (a.score == null) return 1
    if (b.score == null) return -1
    return b.score - a.score || a.id.localeCompare(b.id)
  })
  return scored.slice(0, Math.max(1, limit))
}
