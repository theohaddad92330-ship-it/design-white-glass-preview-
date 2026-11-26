import type { DeclareOrgPeopleRequest } from '@bellum/contracts'
import { personKey } from './org-graph-declare'

/**
 * Le second verrou de la porte « décris ton organigramme » (#1103).
 *
 * Le prompt `bellum_org_declare` interdit déjà d'ajouter une personne que le
 * texte ne nomme pas. Cette garde ne lui fait PAS confiance : elle cherche
 * chaque nom rendu DANS le texte source et retire ceux qui n'y sont pas. Même
 * discipline que `cv-rewrite-guard` — et pour la même raison, en pire : un
 * organigramme est ce sur quoi un commercial construit son approche, et une
 * personne inventée envoie quelqu'un préparer un message pour un interlocuteur
 * qui n'existe pas.
 *
 * Ce qu'elle vérifie, et ce qu'elle ne vérifie pas :
 *
 * · le NOM doit se retrouver dans le texte — c'est le seul champ dont
 *   l'invention est irrattrapable ;
 * · la fonction et l'entité ne sont PAS vérifiées ainsi. Un texte écrit
 *   « Marie dirige la DSI » et la fonction juste est « Directrice des systèmes
 *   d'information », qu'aucune recherche littérale ne retrouverait. Exiger la
 *   citation là rendrait la porte inutilisable, et ce n'est pas le champ qui
 *   fait perdre un rendez-vous ;
 * · le MANAGER l'est, en revanche : c'est un nom, et un mauvais N+1 oriente
 *   toute une approche. Un manager introuvable dans le texte est retiré de la
 *   ligne — la personne, elle, reste.
 *
 * Le rapprochement se fait sur les MOTS du nom et non sur la chaîne entière :
 * un texte qui écrit « JAOUEN Caroline » nomme bien « Caroline Jaouen », et
 * refuser cette ligne apprendrait à l'utilisateur que la porte ne marche pas.
 * Deux mots au minimum doivent se retrouver — un prénom seul commun à trois
 * phrases ne prouve rien.
 */

type GuardedDeclaration = {
  /** Ce qui a survécu au contrôle — prêt à être déclaré. */
  people: DeclareOrgPeopleRequest['people']
  /** Les noms retirés parce qu'introuvables dans le texte. NOMMÉS, jamais tus :
   *  un retrait silencieux se lit « le modèle n'a rien trouvé ». */
  dropped: string[]
}

/** Deux mots communs suffisent — un prénom seul ne prouve rien. */
const MIN_MATCHING_WORDS = 2

function words(value: string): string[] {
  return personKey(value)
    .split(' ')
    .filter(word => word.length >= 2)
}

/** Le nom est-il RÉELLEMENT dans le texte ? */
function isCited(name: string, sourceWords: Set<string>): boolean {
  const parts = words(name)
  if (parts.length === 0) return false
  const matching = parts.filter(part => sourceWords.has(part)).length
  // Un nom d'un seul mot doit y être en entier ; au-delà, deux mots suffisent —
  // « JAOUEN Caroline » nomme bien « Caroline Jaouen ».
  return parts.length === 1 ? matching === 1 : matching >= MIN_MATCHING_WORDS
}

export function guardDeclaredPeople(
  people: readonly DeclareOrgPeopleRequest['people'][number][],
  sourceText: string,
): GuardedDeclaration {
  const sourceWords = new Set(words(sourceText))
  const kept: DeclareOrgPeopleRequest['people'] = []
  const dropped: string[] = []

  for (const entry of people) {
    const fullName = entry.fullName.trim()
    if (!fullName) continue
    if (!isCited(fullName, sourceWords)) {
      dropped.push(fullName)
      continue
    }
    // Un manager qui n'est pas dans le texte est retiré de la LIGNE, pas la
    // ligne du résultat : la personne existe, c'est son rattachement qui a été
    // deviné.
    const managerName = entry.managerName?.trim()
    kept.push({
      ...entry,
      fullName,
      ...(managerName && isCited(managerName, sourceWords) ? { managerName } : { managerName: undefined }),
    })
  }

  return { people: kept, dropped }
}
