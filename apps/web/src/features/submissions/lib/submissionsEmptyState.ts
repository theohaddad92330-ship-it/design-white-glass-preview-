/**
 * Ce que la page des POSITIONNEMENTS (I-57) propose quand la liste ne rend
 * rien — la porte qui manquait (manque « troisième porte », vague P, 30/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX VIDES QUE LA PAGE CONFONDAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran affichait un seul message générique, qu'aucun positionnement
 * n'existe encore ou qu'une recherche trop précise n'en rende aucun — sans
 * geste dans les deux cas.
 *
 *  - AUCUNE recherche posée : le portefeuille est réellement vide, le geste
 *    est de DÉMARRER — mais créer un positionnement suppose un besoin ET un
 *    talent rapprochés l'un de l'autre (`ConsultantMatchPanel`, sur le
 *    vivier ; `NeedMatchTab`, sur une fiche de besoin). Cette page ne choisit
 *    ni l'un ni l'autre elle-même : elle renvoie vers l'écran qui le fait
 *    déjà, plutôt que de réécrire un second formulaire de création — « un
 *    réglage vit à un seul endroit ».
 *  - une recherche EST posée et ne rend rien : le geste est de la RETIRER,
 *    jamais de créer — le positionnement existe peut-être déjà, seule la
 *    recherche est trop précise. Confondre les deux enverrait chercher un
 *    besoin et un talent à rapprocher alors qu'il suffisait d'élargir la
 *    recherche.
 *
 * Même esprit que `talentEmptyStateAction` (vivier,
 * `apps/web/src/features/consultants/lib/talentEmptyState.ts`) et
 * `emptyListAction` (comptes,
 * `apps/web/src/features/accounts/lib/emptyListAction.ts`), rejoué ici sans
 * sortir du périmètre de ce chantier : cette page ne porte qu'UN seul axe de
 * restriction (la recherche texte), donc pas de variante « plusieurs axes ».
 */

/** Non exporté, comme `EmptyListAction`/`TalentEmptyAction` : un appelant lit
 *  `kind` et TypeScript le vérifie STRUCTURELLEMENT, sans import — exporter ce
 *  nom violerait « un type consommé dans son seul fichier ne s'exporte pas »
 *  (`pnpm lint:exports:types`). */
type SubmissionsEmptyAction = { kind: 'start' } | { kind: 'clearSearch'; query: string }

export function submissionsEmptyStateAction(query: string): SubmissionsEmptyAction {
  const trimmed = query.trim()
  if (!trimmed) return { kind: 'start' }
  return { kind: 'clearSearch', query: trimmed }
}
