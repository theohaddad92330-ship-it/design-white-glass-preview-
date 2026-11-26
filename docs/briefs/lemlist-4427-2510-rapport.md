# Rapport LEMLIST-4427 (25/10/2026)

**Constat : le lot est DÉJÀ livré sur `origin/main`** (7 commits #4427 : d46fde24, 2b7bc0f0, dd48cffd, 321050eb, 14e38624, 87f9b777, d3ecf1a1). Le brief décrit l'état du 21/10 ; il est périmé. Je n'ai donc recodé rien (registre « ne pas recoder »).

- Branché et prouvé aujourd'hui : API `modules/lemlist` (jest : 3 suites, 21 tests verts) ; web carte `/integrations` + fiche contact (vitest : 2 fichiers, 8 tests verts) ; `demo-coverage.spec.ts` (91 verts).
- #4427.1 connexion par clé par espace (vérifiée par `GET /team`, chiffrée AES-256-GCM). #4427.2 poussée dans une campagne EXISTANTE via la porte d'écriture (`provider lemlist`, `enroll_sequence`, origine utilisateur). #4427.3 statuts relus à la demande (`GET /activities?version=v2`), source nommée Lemlist.
- Clé : AUCUNE variable d'environnement globale (clé par espace) ; documenté dans `agent_docs/env-reference.md:137`.
- Démo : `lemlist_connections` et `lemlist_lead_pushes` classées « vides à dessein » avec raison (connexion refusée en démo, sinon statuts inventés). Arbitrage déjà pris sur main, cohérent avec la doctrine ; je ne l'ai pas rouvert.
- Non codé (doc publique muette ou hors périmètre) : création/lancement de campagne, enrichissement Lemlist (consomme les crédits client), webhooks temps réel Lemlist, types d'activité non rattachés.
- Reste à faire par un humain : la preuve de l'issue (« clé de test réelle, pousser, voir le statut revenir ») n'est pas faisable en cloud sans clé Lemlist ; à jouer en recette. Issue #4427 à clore ou à requalifier.
- Aucun code modifié dans ce lot ; seul ce rapport est ajouté.
