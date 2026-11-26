import { PARTNER_STAGES, type PartnerStage } from '@bellum/contracts'

/**
 * #1431 — « passer d'une page informative à un cockpit de décision » : un bloc
 * de synthèse en tête, qui dit où en est le portefeuille de partenaires.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUR QUOI IL REGROUPE, ET POURQUOI PAS SUR LA RECOMMANDATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour proposait cinq intitulés — « À maintenir · À activer · À
 * surveiller · À relancer · À analyser ». Le moteur porte un vocabulaire
 * voisin, la RECOMMANDATION du score (`renforcer` · `maintenir` · `reduire` ·
 * `viser_rang_1`), et c'était le candidat évident.
 *
 * Il a été écarté, arbitrage de Louis du 04/09/2026 : **la recommandation
 * n'existe que si le score existe**, et le score demande de l'historique que la
 * plupart des espaces n'ont pas — les cartes portent aujourd'hui « pas encore
 * assez d'historique ». Un bandeau de synthèse vide pour presque tout le monde
 * n'est pas un cockpit, c'est une promesse.
 *
 * L'ÉTAPE, elle, existe sur chaque relation dès sa création (`identifie` par
 * défaut) : le bandeau est donc toujours rempli, et il dit une chose vraie —
 * comment le portefeuille se répartit entre huit états connus.
 *
 * ⚠️ Inventer une SIXIÈME dérivation qui traduirait les huit étapes vers les
 * cinq verbes du retour aurait créé un second vocabulaire pour le même objet :
 * la carte aurait dit « Étape : Dormant » et le bandeau « À relancer », pour la
 * même relation. Un réglage vit à un seul endroit (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE COMPTE DIT SON DÉNOMINATEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /partners` n'est pas paginé : il rend la liste entière de l'espace. Le
 * total est donc un VRAI total, et l'écran peut l'écrire. Le jour où cette
 * route se pagine, ce compte devient celui d'une page et doit le dire — c'est
 * le défaut déjà payé sur les pastilles de `/contacts`.
 */

type PartnerStageCount = {
  stage: PartnerStage
  count: number
}

type PartnerStageSummary = {
  /** Les huit étapes, dans l'ordre du parcours, avec leur compte. */
  counts: PartnerStageCount[]
  /** Combien de relations la synthèse a lues — le dénominateur. */
  total: number
}

/**
 * Compte les relations par étape.
 *
 * Les huit étapes sont TOUJOURS rendues, y compris à zéro. Ici « 0 » est vrai
 * et il est utile : « aucun cadre signé » est précisément l'information qu'un
 * dirigeant vient chercher. C'est l'inverse du zéro d'un compteur que personne
 * n'écrit (voir `partnerFlow.ts`) — celui-là mentait, celui-ci mesure.
 *
 * Une étape inconnue du catalogue (ligne plus ancienne que l'énumération) n'est
 * rangée nulle part plutôt que dans la première : elle serait comptée comme un
 * « identifié » qu'elle n'est pas. Elle reste dans le total, qui compte les
 * relations LUES.
 */
export function partnerStageSummary(relations: readonly { stage: string }[]): PartnerStageSummary {
  const byStage = new Map<string, number>()
  for (const relation of relations) {
    byStage.set(relation.stage, (byStage.get(relation.stage) ?? 0) + 1)
  }
  return {
    counts: PARTNER_STAGES.map(stage => ({ stage, count: byStage.get(stage) ?? 0 })),
    total: relations.length,
  }
}
