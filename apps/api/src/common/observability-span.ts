import * as Sentry from '@sentry/nestjs'

/**
 * #2442.4 (épopée #2879, lot M10 09/10) — LE POINT DE PASSAGE UNIQUE DES SPANS
 * DE L'API.
 *
 * L'épopée nommait quatre spans manquants : auth, connecteur, artefact,
 * notification. Côté service IA, `db` et `connector` vivent dans la trace du
 * tour (`langfuse_client.span`). Côté API, rien ne mesurait la création d'une
 * notification ni l'écriture d'un artefact : chacun se cherchait « un
 * chokepoint » qui n'existait pas. Celui-ci est le seul — un appelant par
 * famille, tenu par sa spec.
 *
 * Le puits est Sentry (`startSpan`, actif quand `SENTRY_DSN` est posé ; sans
 * clé, no-op strict — le geste s'exécute à l'identique). Ce qui sort : la
 * famille, une opération (un IDENTIFIANT, jamais un contenu) et la durée.
 * Aucun texte, aucun identifiant de personne (#2442.7, `observability-privacy.ts`).
 */
export const OBSERVED_SPAN_KINDS = ['auth', 'connector', 'artifact', 'notification'] as const
type ObservedSpanKind = (typeof OBSERVED_SPAN_KINDS)[number]

/** Un identifiant d'opération ; tout le reste devient `other` — jamais un texte libre dans un nom de span. */
const OPERATION_PATTERN = /^[a-z][a-z0-9_]{0,40}$/

export async function observeSpan<T>(kind: ObservedSpanKind, operation: string, run: () => Promise<T>): Promise<T> {
  const name = `${kind}.${OPERATION_PATTERN.test(operation) ? operation : 'other'}`
  let started = false
  try {
    return await Sentry.startSpan({ name, op: `bellum.${kind}` }, () => {
      started = true
      return run()
    })
  } catch (error) {
    // Le geste a tourné et a échoué : sa panne remonte telle quelle. Seule une
    // panne de l'OUTIL DE MESURE (avant que le geste ne parte) le relance nu —
    // mesurer ne casse jamais ce qu'on mesure.
    if (started) throw error
    return run()
  }
}
