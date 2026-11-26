# Relevé du lot PLATEFORME-B (19/10/2026) — #4356.1 et #4366.1

Lecture seule, mesurée dans le code de `origin/main` au 19/10. Rien de ce qui suit n'est codé : le brief borne le
parcours guidé au Tableau de bord et l'onboarding à un relevé.

## #4356.1 — les autres écrans à blocs « voir plus » (non touchés)

Le Tableau de bord est passé en parcours guidé (`CockpitGuidedSteps`). Restent en disclosures muets
(`CollapsedSection` ou repli équivalent), par nombre de blocs décroissant :

1. Fiche compte — `TabOverview`, `TabPlan`, `TabCoverage`, sections, organigramme, opportunités (≈ 8 blocs).
2. Laura (`/chat`) — `Chat`, `CopilotCards`, `PendingActions`, `ShareConversation`, blocs de réponse.
3. Missions — `MissionsPage`, `MissionsToolbar`, `MissionDetailTabs`.
4. Un bloc chacun : territoire, listes cibles, soumissions, raccourcis, réglages.

Priorité proposée : la fiche compte d'abord (l'écran le plus ouvert après le Tableau de bord), avec la même primitive.

## #4366.1 — l'onboarding, compté

Chemin actuel : accueil (`/onboarding`) → offre (`/onboarding/plan`) → « Quelle est votre ESN ? »
(`/onboarding/company`, pré-remplissage public) → **7 sous-étapes, 10 questions** en 3 temps (`TEMPS1_SUBSTEPS` :
entreprise 2, équipe commerciale 1, domaines 1, positionnement 2, secteurs 1, cibles 2, frein 1) → relecture →
génération. Soit 12 écrans. 142 questions sont déjà reportées au Temps 2, et une sous-étape vidée sort déjà du
parcours (`.filter(s => s.questions.length > 0)`) : **aucune étape vide**. Aucune ne double #4364 (qui porte la
reconfiguration APRÈS l'onboarding). Le commentaire de `e2e/tests/web/onboarding/self-service.spec.ts` (« 12
sous-étapes ») est périmé.

Chemin court proposé (décision produit, non codée) : fusionner « équipe commerciale » dans « entreprise » et
« secteurs » dans « cibles » (7 → 5 sous-étapes) ; quand le pré-remplissage a trouvé l'ESN, ouvrir directement la
relecture avec les réponses badgées au lieu de faire traverser les sous-étapes déjà remplies.
