/**
 * Repérer deux comptes qui sont la MÊME personne (IDENT-01, audit du 17/08).
 *
 * Le cas observé : `theo@bellum-ai.com` et `theobelkacem02300@gmail.com` — même
 * personne, deux comptes, donc deux profils, deux espaces de travail et deux
 * moitiés de portefeuille. Rien ne le signalait, et le support l'a découvert en
 * cherchant pourquoi un utilisateur « ne retrouvait pas ses dossiers ».
 *
 * Le module est PUR : il reçoit des lignes, il rend des paires avec leur raison
 * et leur confiance. Aucune écriture, aucune décision — la fusion est un geste
 * d'opérateur, et un rapprochement automatique se tromperait un jour sur deux
 * homonymes, ce qui coûterait beaucoup plus cher que le doublon qu'il corrige.
 *
 * Trois signaux, du plus sûr au plus faible. La règle qui les gouverne est celle
 * des doublons CRM (`crm-duplicates.ts`), et pour la même raison : **on PROPOSE,
 * on ne fusionne jamais tout seul.**
 */

import { isGenericMailbox } from '../contacts/generic-mailbox'

/** Une adresse portée par autant de comptes est une boîte d'équipe ou une donnée fausse : pas une identité. */
const SHARED_BY_MANY_MIN = 3

/** Ce que le détecteur a besoin de savoir d'un compte. */
export type IdentityCandidate = {
  userId: string
  email: string | null
  fullName: string | null
  /** Espaces dont ce compte est membre. Deux comptes dans le MÊME espace ne
   *  fragmentent rien : ils voient déjà les mêmes dossiers. */
  workspaceIds: string[]
  /** Nombre de dossiers portés — sert à désigner le compte à GARDER. */
  accountCount: number
  /** Date de création, en ISO. Départage deux comptes à égalité de dossiers. */
  createdAt: string | null
}

type DuplicateReason =
  /** Adresses identiques une fois les alias Gmail neutralisés (points, `+`). */
  | 'same_email'
  /** Même partie locale sur deux domaines (`theo@a.com` / `theo@b.com`). */
  | 'same_local_part'
  /** Même nom complet normalisé. */
  | 'same_name'

export type DuplicatePair = {
  /** Le compte à GARDER : celui qui porte le plus de dossiers. */
  keep: IdentityCandidate
  /** Le compte à absorber. */
  absorb: IdentityCandidate
  reasons: DuplicateReason[]
  /** 0 → 1. Ce qu'on est prêt à affirmer, pas ce qu'on décide. */
  confidence: number
  /** Les deux comptes partagent-ils déjà un espace ? Alors rien n'est fragmenté,
   *  et la fusion n'a pas d'urgence. */
  sharesWorkspace: boolean
}

/** Confiance par signal. Le nom SEUL est faible à dessein : « Martin Dupont »
 *  existe en double dans n'importe quelle base d'une certaine taille. */
const CONFIDENCE: Readonly<Record<DuplicateReason, number>> = {
  same_email: 0.95,
  same_local_part: 0.6,
  same_name: 0.35,
}

/** `Théo  HADDAD ` → `theo haddad`. Accents et casse ne distinguent personne. */
function normalizeName(value: string | null): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * L'adresse, débarrassée de ce qui n'en change pas le destinataire.
 *
 * Gmail ignore les points et tout ce qui suit un `+` ; `t.h.eo+bellum@gmail.com`
 * et `theo@gmail.com` arrivent dans la même boîte. Ne PAS le savoir laisserait
 * passer le doublon le plus courant. La règle ne s'applique qu'aux domaines qui
 * la pratiquent — l'appliquer partout rapprocherait à tort deux adresses
 * distinctes chez un hébergeur qui, lui, compte les points.
 */
const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

function normalizeEmail(value: string | null): { full: string; local: string; domain: string } | null {
  const raw = (value ?? '').trim().toLowerCase()
  const at = raw.lastIndexOf('@')
  if (at <= 0 || at === raw.length - 1) return null
  const domain = raw.slice(at + 1)
  let local = raw.slice(0, at)
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, '')
  if (!local) return null
  return { full: `${local}@${domain}`, local, domain }
}

/** Le compte à garder : le plus de dossiers, puis le plus ancien. */
function pickKeeper(a: IdentityCandidate, b: IdentityCandidate): [IdentityCandidate, IdentityCandidate] {
  if (a.accountCount !== b.accountCount) return a.accountCount > b.accountCount ? [a, b] : [b, a]
  const at = Date.parse(a.createdAt ?? '')
  const bt = Date.parse(b.createdAt ?? '')
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at < bt ? [a, b] : [b, a]
  // Départage stable — deux comptes identiques en tout point doivent sortir dans
  // le même ordre d'un appel à l'autre, sinon la liste bouge sous l'opérateur.
  return a.userId < b.userId ? [a, b] : [b, a]
}

/**
 * Les paires suspectes, les plus sûres d'abord.
 *
 * `minConfidence` borne le bruit : au seuil par défaut, deux homonymes sans
 * aucun rapport d'adresse ne remontent PAS — c'est la pire proposition possible
 * pour un opérateur, parce qu'elle a l'air vraie.
 */
export function findIdentityDuplicates(
  candidates: readonly IdentityCandidate[],
  options?: { minConfidence?: number },
): DuplicatePair[] {
  const threshold = options?.minConfidence ?? 0.5
  const pairs: DuplicatePair[] = []

  // #4600 — combien de comptes portent chaque adresse : trois ou plus, ce n'est plus un indice d'identité.
  const holders = new Map<string, number>()
  for (const candidate of candidates) {
    const normalized = normalizeEmail(candidate.email)
    if (normalized) holders.set(normalized.full, (holders.get(normalized.full) ?? 0) + 1)
  }

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!
      const b = candidates[j]!
      const emailA = normalizeEmail(a.email)
      const emailB = normalizeEmail(b.email)
      const nameA = normalizeName(a.fullName)
      const nameB = normalizeName(b.fullName)

      const reasons: DuplicateReason[] = []
      // Une boîte générique (`contact@`, `info@`) ou une adresse partagée par trois comptes ou plus ne prouve rien.
      const emailIsEvidence =
        emailA && emailB && !isGenericMailbox(emailA.full) && !isGenericMailbox(emailB.full)
          ? (holders.get(emailA.full) ?? 0) < SHARED_BY_MANY_MIN
          : false
      if (emailA && emailB && emailIsEvidence && emailA.full === emailB.full) reasons.push('same_email')
      else if (emailA && emailB && emailIsEvidence && emailA.local === emailB.local) reasons.push('same_local_part')
      if (nameA && nameA === nameB) reasons.push('same_name')
      if (reasons.length === 0) continue

      // Les signaux se cumulent sans jamais atteindre la certitude : « même
      // partie locale ET même nom » est très probable, ça reste une proposition.
      const confidence = Math.min(
        0.99,
        reasons.reduce((sum, reason) => sum + CONFIDENCE[reason], 0),
      )
      if (confidence < threshold) continue

      const [keep, absorb] = pickKeeper(a, b)
      pairs.push({
        keep,
        absorb,
        reasons,
        confidence: Number(confidence.toFixed(2)),
        sharesWorkspace: keep.workspaceIds.some(id => absorb.workspaceIds.includes(id)),
      })
    }
  }

  return pairs.sort((x, y) => y.confidence - x.confidence)
}
