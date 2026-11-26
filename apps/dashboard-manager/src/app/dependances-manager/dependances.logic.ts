import type { ManagerDependencyStatus } from '@/lib/manager-dependencies'

/**
 * #1676.2 — L'ÉCRAN `/dependances-manager` — ce qu'il NOMME, séparé de ce
 * qu'il affiche. « Sain n'est jamais déclaré, il est dérivé d'un test réel » :
 * ce module ne décide JAMAIS si une dépendance est saine — il traduit une
 * PRÉSENCE (`configured: boolean | null`) en un libellé, jamais « en erreur »
 * pour ce qui n'est que « non configuré ».
 */

type LibellePresence = 'Configuré' | 'Non configuré' | 'Non mesuré'

/**
 * ⚠️ `null` (non mesuré) N'EST JAMAIS confondu avec `false` (mesuré, absent).
 * Question qui tranche : si cette valeur est absente, « non configuré »
 * est-il VRAI ? Sans réponse de l'API, on ne le SAIT pas.
 */
export function libellePresence(configured: boolean | null): LibellePresence {
  if (configured === null) return 'Non mesuré'
  return configured ? 'Configuré' : 'Non configuré'
}

export function couleurPresence(configured: boolean | null): string {
  if (configured === null) return 'var(--muted)'
  return configured ? 'var(--green)' : 'var(--muted)'
}

/** Le compte par statut — un statut absent est un VRAI zéro. */
export function resumeParPresence(deps: readonly ManagerDependencyStatus[]): {
  configurees: number
  nonConfigurees: number
  nonMesurees: number
} {
  let configurees = 0
  let nonConfigurees = 0
  let nonMesurees = 0
  for (const dep of deps) {
    if (dep.configured === null) nonMesurees += 1
    else if (dep.configured) configurees += 1
    else nonConfigurees += 1
  }
  return { configurees, nonConfigurees, nonMesurees }
}

/**
 * La PRÉSENCE relue à la lumière d'un test réel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'INCIDENT
 * ─────────────────────────────────────────────────────────────────────────
 * Recette du 09/09/2026 : deux lignes se contredisaient elles-mêmes, à
 * quarante pixels d'écart. Colonne PRÉSENCE : « Configuré ». Résultat du test,
 * juste à côté : « non configuré pour un test réel — VERCEL_API_TOKEN
 * absente ». Idem pour GitHub. La cause est corrigée en amont (la présence
 * répond désormais à la même question que le test), mais une DÉCLARATION reste
 * une déclaration : elle peut redevenir fausse sans prévenir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * « Sain n'est jamais déclaré, il est dérivé d'un test réel » — appliqué à la
 * lettre : la présence est un PRIOR, le test est une PREUVE, et la preuve
 * l'emporte. Quand un test rapporte que la configuration manque, la ligne le
 * dit, quelle que soit ce que la variable d'environnement laissait croire.
 *
 * ⚠️ L'inverse n'est PAS vrai : un test qui ÉCHOUE (réseau, 500) n'apprend
 * rien sur la configuration — il reste `configured` tel quel. Confondre les
 * deux ferait dire « non configuré » à une panne, ce qui est le défaut que
 * cette page existe pour éviter.
 */
export function presenceApresTest(
  declaree: boolean | null,
  test: { ok: boolean; detail: string } | null,
): boolean | null {
  if (!test) return declaree
  if (test.ok) return true
  return /non configur/i.test(test.detail) ? false : declaree
}
