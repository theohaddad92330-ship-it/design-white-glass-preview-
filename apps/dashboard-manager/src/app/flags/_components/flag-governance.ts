/**
 * #2446.8 — chaque flag a un owner et une procédure de rollback.
 *
 * Reflag (SDK tiers) reste la source de vérité du CIBLAGE (qui voit le flag,
 * à quel pourcentage) — voir `flag-coverage.ts`. Ce fichier ne duplique pas ça :
 * il répond à une question DIFFÉRENTE, que Reflag ne sait pas répondre, « qui
 * décide, et comment on revient en arrière ». Un registre statique, pas une
 * table : le nombre de flags réels est petit, et une nouvelle clé de flag
 * s'ajoute ici au moment où elle s'ajoute au code (même règle que GA-26 — un
 * réglage vit à un seul endroit, ici : celui-ci pour owner/rollback, Reflag
 * pour le ciblage).
 *
 * Reflag peut renvoyer une clé absente d'ici (créée directement dans son
 * dashboard, ciblage expérimental) — jamais une découverte du registre elle-
 * même, donc jamais un flag inventé : `flagGovernance` nomme l'absence plutôt
 * que de deviner un owner.
 */
type FlagGovernanceEntry = {
  registered: true
  owner: string
  rollback: string
}

type FlagGovernanceMissing = {
  registered: false
  raison: string
}

const REGISTRY: Record<string, { owner: string; rollback: string }> = {
  market_memory_partners_enabled: {
    owner: 'Louis Schlegel',
    rollback:
      "Désactiver le flag dans le dashboard Reflag (aucun redéploiement) — l'onglet Partenaires redevient " +
      "immédiatement ce qu'il rendait sans mémoire marché (dégradation déjà prévue, PartnersModule).",
  },
}

/** Owner + rollback d'un flag, ou l'absence nommée s'il n'est pas au registre. */
export function flagGovernance(key: string): FlagGovernanceEntry | FlagGovernanceMissing {
  const entry = REGISTRY[key]
  if (!entry) {
    return {
      registered: false,
      raison: `« ${key} » n'est pas au registre owner/rollback — créé directement dans Reflag sans entrée ici.`,
    }
  }
  return { registered: true, ...entry }
}
