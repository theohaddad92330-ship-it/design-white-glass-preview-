# Registre des points — Lot J, reliquats (vague du 22/09 au soir)

base : 8009cf678 — 22/09/2026

Antériorité consultée : `origin/fix/discover-dashboard-soir-22-09` (registre
`…-C-discover-dashboard.md`, #2717/#2728/#2726) et `origin/fix/accounts-soir-22-09`
(registre `…-B-accounts.md`, #2724/#2730/#2718.1/#2716/#2711).

| point | demande en huit mots | écran/sujet | ce que tu as mesuré au code | état | preuve en recette |
|---|---|---|---|---|---|
| #2718.2 | le fil vit dans Plan, pas dans Historique | onglet Historique, `AccountDetailTabContent.tsx` case `'history'` | `AccountTimelineCard` (user_actions plan+hors-plan, mouvements de projet, exécutions de workflow — `/accounts/:id/timeline`) n'était montée que dans `TabPlan.tsx` (section « Préparer »), jamais dans l'onglet NOMMÉ « Historique » — qui lit `ExecutedActionsList`/`TimelinePanel` (table `activities`, une source DIFFÉRENTE : appels/notes/sync CRM). Précédent identique dans le même fichier (#2124.39 : `RecordHistory` déplacée de Synthèse à Historique). | recetté | ÉCRAN — /accounts/{id}?tab=history : la carte « Ce qui s'est passé sur ce compte » (user_actions/projets/workflows) apparaît sous « Historique des relations ». /accounts/{id}?tab=plan : elle n'y est plus (déplacée, pas dupliquée — GA-26). Tests rouge→vert : AccountDetailTabContent.test.tsx (#2718.2), TabPlan.collapsed.test.tsx mis à jour (retrait CHRONOLOGIE, libellé « Préparer le rendez-vous » sans « et relire l'historique », FR+EN). ‖ L 23/09 : reconfirmé au code après merge — AccountDetailTabContent.tsx:318, case 'plan' (l.262) sans référence à AccountTimelineCard. Ligne jumelle registre-2026-09-22-soir-B-accounts.md (retenu, périmée) mise en accord. ‖ RECETTÉ 23/09 (ÉCRAN, prod) — /accounts/<id>?tab=history : carte « Ce qui s'est passé sur ce compte » présente sous Historique, absente de Plan (API 5cfb1e786) |
