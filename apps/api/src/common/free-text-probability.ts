/**
 * #2231 — détecteur de PROBABILITÉ dans du TEXTE LIBRE déjà généré.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le prompt du Profiler a été corrigé le 13/09/2026 (`039ea2e8c`,
 * `apps/ia/app/models/profile_context.py`) pour interdire toute probabilité
 * dans le texte qu'il produit. Mais les `profiles.profile_context` écrits
 * AVANT ce commit portent encore le texte interdit — corriger un PRODUCTEUR
 * ne corrige pas ce qui est déjà écrit. GA-64
 * (`apps/api/src/architecture/no-persisted-probability.spec.ts`) refuse
 * qu'une probabilité entre par un NOM — colonne, entité, clé de contrat.
 * Ce module refuse qu'elle entre par la PROSE : ce que le modèle a
 * effectivement ÉCRIT à un utilisateur, pas comment le champ qui le porte
 * s'appelle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CO-OCCURRENCE, PAS UN MOT SEUL
 * ─────────────────────────────────────────────────────────────────────────
 * Interdire le mot « probabilité » lui-même casserait un témoin légitime déjà
 * reconnu par GA-64 : `planRiskSchema.probability`, la vraisemblance
 * QUALITATIVE d'un risque (haute / moyenne / basse) — GA-64 laisse déjà
 * passer le NOM (`probabilityOffence('probability') === null`), et la PROSE
 * équivalente doit passer pareil ici. Même chose pour un taux MESURÉ sur des
 * affaires closes (`win_rate`) — un fait historique n'est pas une prédiction
 * — et pour « probable » employé comme valeur de CONFIANCE.
 *
 * On découpe donc le texte en SEGMENTS (`.`, `;`, retour à la ligne — jamais
 * la virgule : « ni probabilité, ni chance de signer » reste UN seul
 * interdit) et on refuse une CO-OCCURRENCE dans le même segment :
 *
 *  1. un mot de {@link PROBABILITY_ROOT} croisé avec un mot de conclusion
 *     d'affaire ({@link DEAL_CLOSE_WORD}) — « probabilité de closing »,
 *     « probability of closing » ;
 *  2. un mot de {@link CHANCE_WORD} croisé pareil — « chance de signer »,
 *     « chance of winning » ;
 *  3. un pourcentage ({@link PERCENT}) croisé avec un mot de réussite
 *     ({@link SUCCESS_WORD}) — « 72 % de réussite », « 60% success rate » ;
 *  4. « propension à signer » / « propensity to sign », toujours interdit —
 *     c'est une probabilité déguisée qui ne contient ni « probabilité » ni
 *     « chance ».
 *
 * FR et EN : les contextes de profil sont produits dans la langue de l'espace.
 *
 * ⚠️ Contrairement à `test_profile_context_prompt_doctrine.py` (qui vérifie
 * qu'un SCHÉMA envoyé au modèle REFUSE la probabilité, et laisse donc passer
 * une phrase qui la cite pour l'interdire, du type « aucune probabilité »),
 * ce détecteur-ci scanne du texte déjà GÉNÉRÉ, montré à un utilisateur. Une
 * phrase qui cite l'interdit reste ici détectée : le risque qu'une phrase de
 * refus apparaisse dans une PROSE utilisateur est nul en pratique (le modèle
 * n'écrit pas de méta-commentaire sur sa propre méthode de scoring dans un
 * message d'accueil), alors que manquer une VRAIE probabilité pendant un
 * balayage de conformité coûte plus cher qu'un faux positif improbable.
 */

const PROBABILITY_ROOT = /\bprobabilit\w*/i

const CHANCE_WORD = /\bchances?\b/i

const DEAL_CLOSE_WORD =
  /\b(?:signer|signature|sign[ée]e?|signing|closing|cl[oô]tur\w*|conclure|conclusion|remporter|remport[ée]\w*|gagner|gagn[ée]\w*|deals?|wins?|winning|won|close[ds]?)\b/i

const PERCENT = /\d+(?:[.,]\d+)?\s?%/

const SUCCESS_WORD = /\b(?:r[ée]ussite|succ[èe]s|success)\b/i

const PROPENSION = /\bpropension\s+(?:à|a)\s+signer\b|\bpropensity\s+to\s+sign\b/i

/** Coupe sur la ponctuation FORTE uniquement, en gardant l'offset d'origine de
 *  chaque segment pour reconstruire un extrait sur le texte COMPLET. */
function segmentsWithOffsets(text: string): { segment: string; start: number }[] {
  const found: { segment: string; start: number }[] = []
  let cursor = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '.' || char === ';' || char === '\n') {
      found.push({ segment: text.slice(cursor, i), start: cursor })
      cursor = i + 1
    }
  }
  found.push({ segment: text.slice(cursor), start: cursor })
  return found
}

export type ProbabilityMentionKind =
  | 'probabilite_affaire'
  | 'chance_affaire'
  | 'pourcentage_reussite'
  | 'propension_signer'

export type ProbabilityMention = {
  /** Ce que le détecteur a reconnu — une garde qui dit seulement NON se
   *  contourne par une reformulation ; celle-ci dit CE QU'ELLE a vu. */
  readonly kind: ProbabilityMentionKind
  /** Position du motif dans le texte D'ORIGINE (pas dans le segment). */
  readonly index: number
  /** Le passage reconnu — pour construire un extrait à l'audit. */
  readonly match: string
}

/** Croise deux motifs dans le MÊME segment ; `null` si l'un des deux manque. */
function crossing(
  segment: string,
  segmentStart: number,
  first: RegExp,
  second: RegExp,
  kind: ProbabilityMentionKind,
): ProbabilityMention | null {
  const a = first.exec(segment)
  const b = second.exec(segment)
  if (!a || !b) return null
  const spanStart = Math.min(a.index, b.index)
  const spanEnd = Math.max(a.index + a[0].length, b.index + b[0].length)
  return { kind, index: segmentStart + spanStart, match: segment.slice(spanStart, spanEnd) }
}

/**
 * `null` si le texte ne porte, au sens du produit, aucune probabilité.
 *
 * Les regex du module sont des constantes SANS le drapeau `g` : `.exec()` y
 * est sans état (contrairement à un usage répété avec `g`, où `lastIndex`
 * s'accumule d'un appel à l'autre) — sûr à rappeler en boucle sur des
 * segments différents.
 */
export function detectProbabilityMention(text: string): ProbabilityMention | null {
  if (!text) return null

  for (const { segment, start } of segmentsWithOffsets(text)) {
    const propension = PROPENSION.exec(segment)
    if (propension) {
      return { kind: 'propension_signer', index: start + propension.index, match: propension[0] }
    }

    const probabilite = crossing(segment, start, PROBABILITY_ROOT, DEAL_CLOSE_WORD, 'probabilite_affaire')
    if (probabilite) return probabilite

    const chance = crossing(segment, start, CHANCE_WORD, DEAL_CLOSE_WORD, 'chance_affaire')
    if (chance) return chance

    const pourcentage = crossing(segment, start, PERCENT, SUCCESS_WORD, 'pourcentage_reussite')
    if (pourcentage) return pourcentage
  }

  return null
}
