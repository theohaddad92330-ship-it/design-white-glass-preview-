import type { ReverseProspectMatch, ReverseProspectsResult } from '@bellum/contracts'

/**
 * « Un besoin sans candidat ouvre une piste » — la prospection inversée lue
 * depuis un BESOIN plutôt que depuis un compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `ReverseProspectsSection` existe déjà (`features/accounts/.../plan/`), mais
 * elle répond à une AUTRE question : « qui a TRAVAILLÉ chez ce compte et est
 * ailleurs aujourd'hui » (des PERSONNES, calculées depuis l'historique de poste
 * Apollo d'UN compte précis). La source, ici, en demande une différente :
 * quand aucun candidat ne peut être présenté sur ce besoin, quels AUTRES
 * COMPTES de la même zone cherchent la même compétence — des pistes de vente,
 * pas des profils. Rien à réutiliser : la donnée, le périmètre et la question
 * n'ont que le nom « prospection inversée » en commun.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉTERMINISTE, comme `project-similarity.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas de modèle, pas d'embedding, pas d'invention. Le croisement porte sur
 * exactement DEUX dimensions, NOMMÉES :
 *
 *  - la ZONE (`location`) — comparée en ÉGALITÉ normalisée (casse et espaces
 *    ignorés), jamais en sous-chaîne : « Paris » ne doit pas matcher
 *    « Paris-Saclay » par accident, ce qui rendrait « même zone » un mensonge.
 *  - la COMPÉTENCE (`skills[].term`) — au moins un terme partagé, insensible
 *    à la casse. Le signal qui compte est « quelqu'un d'autre cherche ce
 *    mot-là », pas son caractère éliminatoire chez l'un ou l'autre besoin.
 *
 * Si l'une des deux manque sur le besoin de RÉFÉRENCE, le croisement ne tourne
 * PAS — il le DIT (`unavailableReason`), plutôt que de rendre une liste que rien
 * ne justifie. Une liste vide avec `unavailableReason: null` est une AUTRE
 * réponse : le croisement a tourné, et il n'a trouvé personne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME VIT DANS `@bellum/contracts`
 * ─────────────────────────────────────────────────────────────────────────────
 * `ReverseProspectMatch` / `ReverseProspectsResult` étaient déclarés ici ET
 * dans `apps/web/.../open-needs/api.ts`, deux copies identiques sans schéma
 * commun. Ce fichier garde le CALCUL (déterministe, testé sans base — voir
 * `reverse-need-prospects.spec.ts`) ; la forme, elle, ne vit plus qu'à un seul
 * endroit — `reverse-need-prospects.ts` (`packages/contracts/src/schemas/`),
 * gardé par GA-204.
 */

/** La seule chose que ce fichier lit d'une compétence. Pas exportée : seul ce
 *  fichier la nomme, les appelants passent des `RequiredSkill[]` structurellement
 *  compatibles (`knip --include types`). */
type ReverseProspectSkill = { term: string }

export type { ReverseProspectMatch, ReverseProspectsResult }

function normalizeLocation(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Deux zones sont la MÊME zone quand leur libellé normalisé est identique —
 * jamais quand l'une contient l'autre. `null` (et une chaîne vide, ou faite
 * uniquement d'espaces) ne matche RIEN, pas même une autre absence : deux
 * « je ne sais pas » ne sont pas un « je sais que c'est pareil ».
 */
export function sameZone(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false
  const left = normalizeLocation(a)
  const right = normalizeLocation(b)
  return left.length > 0 && left === right
}

/**
 * Les termes que les deux besoins partagent, dans la CASSE de la RÉFÉRENCE —
 * c'est elle que le commercial a sous les yeux, et c'est elle qui justifie le
 * rapprochement à l'écran. Dédoublonné, insensible à la casse, les termes
 * vides ou blancs n'entrent jamais en jeu.
 */
export function sharedSkillTerms(
  reference: readonly ReverseProspectSkill[],
  candidate: readonly ReverseProspectSkill[],
): string[] {
  const candidateTerms = new Set(candidate.map(skill => normalizeTerm(skill.term)).filter(term => term.length > 0))
  const seen = new Set<string>()
  const shared: string[] = []
  for (const skill of reference) {
    const normalized = normalizeTerm(skill.term)
    if (normalized.length === 0 || seen.has(normalized)) continue
    if (candidateTerms.has(normalized)) {
      seen.add(normalized)
      shared.push(skill.term.trim())
    }
  }
  return shared
}

/** Le nombre de pistes qu'on montre — plus haut, la liste devient une seconde
 *  vue « Besoins ouverts » plutôt que la poignée de comptes qui comptent. */
export const NEED_REVERSE_PROSPECTS_MAX = 10

/**
 * Les pistes les plus fortes d'abord : le nombre de compétences partagées,
 * puis le libellé du besoin (français) pour que la même donnée rende toujours
 * le même ordre. Ne modifie jamais le tableau reçu.
 */
export function rankReverseProspects(matches: readonly ReverseProspectMatch[]): ReverseProspectMatch[] {
  return [...matches].sort((a, b) => {
    const bySharedCount = b.shared_skills.length - a.shared_skills.length
    if (bySharedCount !== 0) return bySharedCount
    return a.need_title.localeCompare(b.need_title, 'fr')
  })
}
