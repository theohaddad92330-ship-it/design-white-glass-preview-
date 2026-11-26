import type { Contact, DecisionRole } from '@bellum/contracts'

/** One explained criterion as the API ships it (mirror of the contracts grid).
 *  Consumed only through {@link contactScoreView}'s return type — not exported. */
type ContactScoreCriterion = NonNullable<Contact['contact_score_breakdown']>[number]
import type { ProvenanceSource } from '@/components/primitives/Provenance'
import { i18n } from '@/i18n'
import { getRoleLabel, getRoleQuestionKey } from '@/lib/contactRoles'
import { contactProvenanceKind } from '@/features/contacts/lib/contactProvenance'

/** Last-resort /100 score by role, for the global list where the account's
 *  cartography isn't loaded so the true Grille-A score (proximité + fit-angle)
 *  can't be computed. Approximates the rôle décisionnel /30 weight into a
 *  sensible band — a decision-maker reads "utile", a blocker "secondaire". The
 *  account dossier + detail page always carry the real `contact_score` /100. */
export const ROLE_SCORE: Record<DecisionRole, number> = {
  sponsor: 78,
  economic: 78,
  technical: 72,
  champion: 62,
  user: 50,
  operational: 46,
  influencer: 46,
  purchasing: 42,
  procurement: 42,
  blocker: 28,
  unknown: 40,
}

// Contact Priority Score /100 decision bands (Théo BELLUM_CONTACT_TAXONOMY §6):
// 80-100 top contact · 60-79 utile · 40-59 à vérifier · <40 secondaire/bruit.
// #3487.2 — un contact dont l'employeur est obsolète (a quitté la cible) ne peut
// pas se présenter « Top contact » : sa bande est plafonnée à « À vérifier ».
export function scoreLabel(value: number, { employerStale = false }: { employerStale?: boolean } = {}): string {
  if (employerStale && value >= 60) return i18n.t('contacts:score.toVerify')
  if (value >= 80) return i18n.t('contacts:score.top')
  if (value >= 60) return i18n.t('contacts:score.useful')
  if (value >= 40) return i18n.t('contacts:score.toVerify')
  return i18n.t('contacts:score.secondary')
}

/** Théo B — la teinte du MOT de priorité (mêmes seuils que `scoreLabel`) : la couleur dit l'état, jamais un nombre. */
export function scoreTone(
  value: number,
  { employerStale = false }: { employerStale?: boolean } = {},
): 'success' | 'primary' | 'warning' | 'default' {
  if (employerStale && value >= 60) return 'warning'
  if (value >= 80) return 'success'
  if (value >= 60) return 'primary'
  if (value >= 40) return 'warning'
  return 'default'
}

/** Fraîcheur effondrée à 1 point = `_freshnessCriterion` (contracts) a vu un
 *  employeur ≠ la cible. Seul ce cas : une source ordinaire à 5/10 n'y entre pas. */
export function hasStaleEmployer(breakdown: Contact['contact_score_breakdown']): boolean {
  return (breakdown ?? []).some(c => c.key === 'freshness' && c.evaluated && c.points <= 1)
}

type ContactScoreInput = Pick<Contact, 'decision_role'> & {
  contact_score?: number | null
}

/** Contact Priority Score /100. Prefers the server-computed deterministic score
 *  (Grille A / 03_BUSINESS_RULES §3); falls back to the role approximation only
 *  when it's absent (the cross-account global list). */
export function contactScore(contact: ContactScoreInput): number {
  return contact.contact_score ?? ROLE_SCORE[contact.decision_role ?? 'unknown']
}

/** The score AND the criteria that explain it, from one server-side computation.
 *
 *  The fiche used to show a header score (`contact_score`, computed by the API
 *  WITH the account cartography) next to a breakdown card the browser recomputed
 *  from the contact row ALONE — no perimeter tier, no angles. Same grid, different
 *  inputs, so the two disagreed on screen (79 vs 69) under two different names.
 *  Here the breakdown is the source of truth: when it's present the displayed
 *  total is derived from it, so the number and its explanation cannot drift.
 *  When it's absent (the cross-account list, which has no account context) there
 *  is no breakdown to show — we never render an explanation we can't stand behind. */
export function contactScoreView(contact: Contact): { total: number; breakdown: ContactScoreCriterion[] | null } {
  const breakdown = contact.contact_score_breakdown
  if (!breakdown?.length) return { total: contactScore(contact), breakdown: null }
  const evaluated = breakdown.filter(c => c.evaluated)
  const denominator = evaluated.reduce((sum, c) => sum + c.max, 0)
  const points = evaluated.reduce((sum, c) => sum + c.points, 0)
  const total = denominator > 0 ? Math.round((points * 100) / denominator) : 0
  return { total, breakdown }
}

/**
 * #3692 — le bloc « Pourquoi ce contact compte » : FAITS d'un côté (poste réel,
 * points-clés déjà factuels, premier lien documenté), HYPOTHÈSES de l'autre
 * (rôle probable, motif produit par le modèle). Une hypothèse n'est jamais
 * enregistrée ni affichée comme un fait. Ne lit JAMAIS `career_levers` /
 * `implicit_fears` : aucune ambition, peur ou trait psychologique.
 *
 * Fusionne ce que « Pourquoi c'est un contact clé » (#3155) et le motif de
 * « Utilité commerciale » (#3401) disaient chacun de leur côté — une seule
 * lecture (GA-26). Une valeur absente ne pose aucune ligne.
 */
type LauraBrief = {
  facts: string[]
  hypotheses: string[]
  roleLabel: string | null
  /** Clé i18n de la question à poser, tirée du rôle (taxonomie MEDDIC existante). */
  askKey: string | null
  employerStale: boolean
  /** Narratif long (profil), replié derrière « Voir le détail ». */
  detail: string[]
  /** Aucun fait ni hypothèse : on montre le connu + la vérification utile. */
  isThin: boolean
}

export function deriveLauraBrief(contact: Contact): LauraBrief {
  const post = [contact.title, contact.entity].filter((part): part is string => !!part).join(' — ')
  const facts: string[] = []
  if (post) facts.push(post)
  facts.push(...(contact.key_points ?? []).slice(0, 2))
  const relation = contact.relations?.[0]
  if (relation?.name) facts.push(relation.title ? `${relation.name} — ${relation.title}` : relation.name)
  const role = contact.decision_role
  const roleLabel = role && role !== 'unknown' ? getRoleLabel(role) : null
  // #3692.7 — un motif identique sur tout le parc ne dit rien de CETTE personne.
  const hypotheses = [contact.why_contact_shared ? null : contact.why_contact].filter((s): s is string => !!s)
  return {
    facts: facts.slice(0, 4),
    hypotheses,
    roleLabel,
    askKey: getRoleQuestionKey(role),
    employerStale: hasStaleEmployer(contact.contact_score_breakdown),
    detail: [contact.profile_summary].filter((s): s is string => !!s),
    // Ni poste ni rôle connus : on ne dresse ni « Faits » ni « Hypothèses » sur
    // une personne dont on ne sait pas ce qu'elle fait — « Peu documenté ».
    isThin: !contact.title && roleLabel === null,
  }
}

/**
 * Texte à coller dans un brief ou un message : faits et hypothèses RESTENT
 * séparés. `hypothesisLines` = EXACTEMENT les lignes affichées sous
 * « Hypothèses à vérifier » (rôle probable, motif, question) — recette 06/10 :
 * la copie n'en reprenait qu'une sur trois.
 */
export function formatLauraBriefForCopy(
  brief: LauraBrief,
  labels: { facts: string; hypotheses: string },
  hypothesisLines: string[] = brief.hypotheses,
): string {
  const sections: string[] = []
  if (brief.facts.length > 0) sections.push([labels.facts, ...brief.facts.map(f => `- ${f}`)].join('\n'))
  if (hypothesisLines.length > 0) {
    sections.push([labels.hypotheses, ...hypothesisLines.map(h => `- ${h}`)].join('\n'))
  }
  return sections.join('\n\n')
}

/**
 * #3400.5 (retour bêta #3400) — la provenance du RÔLE DE DÉCISION affiché
 * (`RoleBadge`) : d'où vient l'attribution, et de quand. C'est la réponse
 * honnête à « afficher la confiance et la raison de l'attribution » —
 * `field_provenance` (`ProvenanceService`, GA-26 : une seule mécanique de
 * provenance, déjà réemployée par `ContactKeyInfo` pour email/téléphone)
 * plutôt qu'un score numérique inventé, qu'AUCUNE probabilité ne doit
 * afficher (doctrine, `agent_docs/doctrine.md`). `null` = rôle absent, rien
 * à dater (GA-18/19).
 */
export function decisionRoleProvenance(
  contact: Pick<Contact, 'decision_role' | 'field_provenance' | 'source' | 'created_at'>,
): { source: ProvenanceSource | null; observedAt?: string } | null {
  if (!contact.decision_role) return null
  const detailed = contact.field_provenance?.decisionRole
  if (detailed) return { source: detailed.source as ProvenanceSource, observedAt: detailed.observedAt }
  return {
    source: contact.source ? contactProvenanceKind(contact.source) : null,
    observedAt: contact.created_at,
  }
}
