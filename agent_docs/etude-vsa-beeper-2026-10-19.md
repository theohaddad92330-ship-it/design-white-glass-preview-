# Étude VSA, Beeper, #4311 — note de lot PLATEFORME (19/10/2026)

Note seule : aucun code, rien d'écrit vers un tiers. Décisions : brief vague 4, n°14 et n°15.

## #4360 — VSA (lecture seule)

- État : `git grep -i vsa` ne rend rien dans le dépôt. Aucun connecteur, aucun contrat.
- Tension à garder visible : « CRM : tout dans Bellum » + #4191 (Missions dans Bellum) contre un client qui veut ses missions côté ERP.
- Cadre retenu (décision 15) : étude en LECTURE SEULE ; rien n'est écrit vers VSA ; « facturé » ne s'écrit que sur preuve du connecteur (c80). Même porte que Zoho (`integration-center/lib/connectors.ts`, famille `erp`).
- Bloquant avant tout code : le contrat d'API de VSA n'est pas vérifiable ici — « un contrat d'API non vérifiable ne se devine pas ». Il faut la doc d'API du client (objets mission/consultant/facture, authentification, limites).

## #4314 — Beeper

- État : `git grep -i beeper` ne rend rien (0 occurrence). #2756 (clos) posait la même demande.
- Décision 14 : Beeper est nommé à l'écran comme Zoho — outil branché par l'utilisateur, donc nommable (la doctrine « nos fournisseurs ne se nomment jamais » ne vise pas les outils de l'utilisateur).
- Non codé : le contrat de l'API Beeper (lecture des conversations, réponse) n'est pas vérifié ; une réponse envoyée passe par une porte sous mandat, et le CORPS des messages ne sort jamais vers un humain ni vers le modèle sauf Laura sur sa boîte (c96). À trancher avec la source : périmètre lecture, mandat d'envoi.
- Quand la source est là : une carte `connectors.ts` (famille messagerie), libellé FR+EN, semis démo + `demo-coverage.ts`, garde.

## #4311 — Chercher une ESN pour voir qui travaille un compte (backlog)

- Aucune source vérifiable → rien affiché (« on n'affiche pas ce qu'on n'a pas »). Rien à coder avant qu'une source existe.

## #4364 / #4366 — questionnaire d'onboarding

- Déjà là : `ReconfigureAnswersSection` (Réglages › Profil), lien dans `ProfileStagePage` et `CommercialAuditScreen`, bandeau `OnboardingRefreshBanner`, tous sur `useReconfigureOnboarding` (démo : visite guidée).
