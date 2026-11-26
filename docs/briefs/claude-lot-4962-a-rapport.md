# Rapport lot 4962-a — branche claude/lot-4962-a (dernier SHA ci-dessous)

- #5023 + #4978 livré 74f94884 — useCompleteRelance.ts (invalide actionOsKeys.actions) ; CallApproachBody.tsx (questions/objections text-lg).
- #4983 + #4984 livré 17402bdd — contact-seller-focus.ts (franceOnly, employeesCount, withAccountSize, 3 paliers) ; contacts.service.ts:2370. Ordre seulement, effectif inconnu = ordre d'avant.
- #4985 livré d7bc0dd8 — RoleHint.tsx (info-bulle au focus clavier) sur 7 badges ; texte unique contacts:roleDescriptions.blocker (fr/en).
- #4992 + #4984.2 livré abd6edf3 — CompactContactRow.tsx (ligne why_contact) ; PriorityPathSection.tsx (« Classé pour une entreprise de N personnes », rien si inconnu).
- #5001 livré 552974d1 — ProjectionResults.tsx (countLinked, accords sing./plur.) ; Discover.tsx passe companyCount.
- #5025 livré a2af98a0 — NeedsKanban.tsx : sous-titre de colonne + tri plus ancienne d'abord (date inconnue en dernier). Libellé fr/en déjà alignés (« À qualifier » / « To qualify »), non modifiés.
- #4979 livré 803d4f4b — « Planifier cet appel » (composer) vs « J'ai passé cet appel — consigner » ; toast + bouton figé avec lien vers /actions/sequences (openCallTasks.ts).
- #4968 + #4970 livré 90d08eae — FramingLayout.tsx plafonné en dvh (cause NON reproduite : mesure impossible sans navigateur, correctif défensif) ; phrase sous le bouton (OnboardingAccueilTemps.tsx).
- Tests : jest contact-seller-focus + contact-call-list (39 verts) ; vitest ciblés par point (verts) ; 5 gardes d'architecture vertes ; tsc -p apps/api et apps/web sans erreur.
- Non faits : semis de démo (why_contact / effectif) non vérifié ; #4979.3 (rejeu) = recette humaine ; liste d'appels Découvrir (call list) non classée par taille.
- Hors périmètre : aucun fichier hors périmètre touché (packages construits localement seulement, non commités).
- Questions : #4968 à mesurer au zoom 150-200 % en vrai navigateur ; #5025 « libellé aligné » : confirmer qu'aucun autre libellé divergent n'est visé.
