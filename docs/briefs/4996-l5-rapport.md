# Rapport — claude/4996-l5 (#4996 L5 : pré-assignation, Refs #4731)

**Fait (8 points)**

1. Contrat `contact-distribution.ts` : `planScopeDistribution` (un seul candidat → assigné ; deux, aucun, sans entité, texte libre → inchangé), `orderAssigneeCandidates`, schémas et types de réponse (ajout seul, exporté).
2. Ordre du sélecteur : `GET contacts/:id/assignee-candidates` — membres qui couvrent l'entité d'abord (libellé « couvre … »), alphabétique, personne caché ; rien présélectionné.
3. `POST accounts/:id/team/distribute/preview` : groupes par membre + `unchanged_count` + empreinte sha256 ; n'écrit rien.
4. `…/apply {fingerprint}` : état relu, empreinte différente → 409, rien écrit.
5. Écriture bornée `assigned_to IS NULL` + workspace + compte : jamais de contact retiré à quelqu'un.
6. Seules les zones de membres encore du compte (responsable ou co-équipier actif) comptent.
7. Droit `canEditAccountTeam` (sinon 403) ; autre espace → 404 ; démo refusée.
8. Module/contrôleur câblés (`ContactDistributionController`).

**Fichiers** : `packages/contracts/src/schemas/contact-distribution(.test).ts`, `index.ts` ; `assignment/{contact-assignment.service,assignment.controller,assignment.module}.ts`, `dto/distribute-apply.dto.ts`, specs `contact-assignment.service.distribution.spec.ts` (nouveau), constructeur adapté dans `contact-assignment.service.spec.ts` et `…query-ratchet.spec.ts`.

**Tests** (rouge → vert) : contracts `contact-distribution.test.ts` (8) ; api `src/modules/assignment` (6 suites, 67 verts, dont négatifs : non-responsable 403, aperçu périmé 409, contact étranger 404). `tsc --noEmit -p apps/api` : aucune erreur nouvelle (hors `@bellum/email`, antérieur). Non lancé : ci:local, suite complète, build.

**Écarts / questions** : GET du sélecteur sans `@RequirePermission` (aucune permission de lecture n'existe, comme `team-guardrails`). Nom d'un membre sans profil : `null` côté aperçu (groupe gardé, compté). Le sélecteur web (L6) lira cette route.
