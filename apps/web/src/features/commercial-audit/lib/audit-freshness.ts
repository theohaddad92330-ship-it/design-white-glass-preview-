/**
 * #2084.14 — l'audit se dit ANCIEN à partir de quand.
 *
 * Doctrine « tant qu'un compte n'est pas rejoué, son écran DIT que sa collecte
 * est antérieure » (décision Louis 18/09/2026, née de #2543), appliquée ici à
 * l'audit commercial (`CommercialAudit`, `build-audit.ts`) plutôt qu'à un
 * segment de compte : `AuditHero` nomme la DATE de l'audit, jamais un
 * jugement (« dépassé », « mauvais ») — juste le fait, pour que le lecteur
 * décide lui-même s'il doit le rejouer.
 *
 * `updatedAt` n'est pas une source neuve : c'est déjà `CommercialAudit.
 * updatedAt`, lu sur l'instantané le PLUS RÉCENT de `profile_context_
 * revisions` (`build-audit.ts`, `latest.created_at`). Cette fonction n'y
 * ajoute qu'un SEUIL de lecture, comme `readOrgFreshness`
 * (`org-freshness.ts`) et `readEffectifFreshness`
 * (`onboarding-effectif-freshness.ts`) le font déjà pour leurs propres faits.
 *
 * ⚠️ Le seuil vit ICI et nulle part ailleurs (GA-26). 180 jours — le même
 * ordre de grandeur que `ORG_FRESHNESS_STALE_AFTER_DAYS` : le contexte
 * commercial d'une ESN (posture, ICP, cadence) ne se retourne pas plus vite
 * que son organigramme. Choix de ce lot, pas une décision Louis nommée — à
 * rouvrir si un rythme différent se mesure.
 */
export const AUDIT_STALE_AFTER_DAYS = 180

/**
 * Trois états, comme les autres fraîcheurs du dépôt : `unknown` est un état À
 * PART ENTIÈRE, pas l'absence des deux autres — ce qui l'empêche de se rendre
 * à l'écran sous la forme d'un tiret muet ou d'une fausse fraîcheur.
 */
export const AUDIT_FRESHNESS_STATES = ['unknown', 'fresh', 'stale'] as const
// Non exporté : consommé uniquement dans ce fichier (`pnpm lint:exports:types`,
// knip) — `AuditHero.tsx` ne lit que la VALEUR rendue par `auditFreshness`,
// jamais ce type.
type AuditFreshnessState = (typeof AUDIT_FRESHNESS_STATES)[number]

/**
 * `updatedAt` et `ageDays` sont `null` ENSEMBLE, et uniquement sur `unknown` :
 * un âge sans date serait un chiffre sans provenance, une date sans âge
 * obligerait l'écran à refaire la soustraction.
 */
type AuditFreshness = {
  state: AuditFreshnessState
  /** La date TELLE QU'ELLE A ÉTÉ ÉCRITE — jamais reformatée, jamais devinée. */
  updatedAt: string | null
  /** Jours entiers écoulés. `null` = rien à compter, jamais `0`. */
  ageDays: number | null
}

const UNKNOWN: AuditFreshness = { state: 'unknown', updatedAt: null, ageDays: null }

/**
 * L'état de fraîcheur de L'audit. La seule lecture — `AuditHero` passe par
 * elle plutôt que de recalculer sa propre soustraction.
 *
 * Une date illisible rend `unknown`, pas une erreur : on ne sait pas quand
 * l'audit a été généré, et c'est exactement ce que `unknown` dit. Une date
 * FUTURE (horloge décalée, migration) rend un âge de 0 jour — jamais un
 * nombre négatif.
 */
export function auditFreshness(updatedAt: string | null | undefined, now: Date): AuditFreshness {
  if (!updatedAt) return UNKNOWN
  const updatedMs = Date.parse(updatedAt)
  if (Number.isNaN(updatedMs)) return UNKNOWN

  const ageDays = Math.max(0, Math.floor((now.getTime() - updatedMs) / 86_400_000))
  return {
    state: ageDays >= AUDIT_STALE_AFTER_DAYS ? 'stale' : 'fresh',
    updatedAt,
    ageDays,
  }
}
