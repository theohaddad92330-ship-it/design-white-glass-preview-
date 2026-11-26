# Rapport — L15 Missions (`claude/vieilles-l15-missions`)

Contrat validé par Louis le 31/10/2026. Seuils nommés une fois (`mission.ts`) : `RELATIONSHIP_SILENCE_DAYS = 30`,
`PROLONGED_ABSENCE_DAYS = 10`, `UNSECURED_CONSULTANT_DAYS = 30` — valeurs choisies par l'écrivain, à confirmer.

## Livré

- **.3 relation menacée** : `relationship_threatened` = satisfaction CLIENT basse ET aucun contact (`activities`) depuis 30 j.
- **.16 satisfaction faible** : `mission_feedback.level` (low/medium/high, NULLABLE, migration `1796610003098`), saisi sur la fiche (optionnel), `low_satisfaction` si un rail est au plus bas.
- **.17 absence prolongée** : `consultant_absences` en cours ≥ 10 j sur un affecté.
- **.20 consultant non sécurisé** : fin ≤ 30 j, `renewal_status ≠ renouvele`, un affecté sans affectation vivante au-delà.
- **.21 action sans owner** : tâche OUVERTE du compte sans `owner_id`.
- Les cinq risques : EN FIN de `missionRiskSchema` (GA-08), CHECK de résolution élargi avant le code (GA-11/12), sévérités posées, facette « avec risque » et tri (à fenêtre égale, exception la plus grave d'abord).
- **.33 colonne / .51 filtre satisfaction** : `GET /delivery/missions` porte `satisfaction` (deux rails, jamais fusionnés ; rien = « non mesuré »).
- **.40 filtre société** : `legalEntityName` résolu en lot (`legal_entities`).
- **.54/.56/.57/.58/.59 vues prêtes** (À traiter cette semaine, CRA manquants, Factures bloquées, Paiements en retard, Marge non mesurée) — lisent risques/badge déjà calculés.
- **.68/.69 tuiles** CA facturable non facturé / factures échues (montées sous `finance:read` seulement).
- **Droits** : sans `finance:read`, ni tuile de facturation, ni colonne Marge, ni vue financière (test `MissionsPage.test.tsx` + e2e).
- **.85** : le niveau de satisfaction est ÉCRIT, la couleur n'est qu'un renfort.
- Démo : niveaux semés (client bonne / consultant basse), arrêt long en cours (Marc Ouedraogo). Fragment `changes/claude-vieilles-l15-missions.yml`. E2E `scenario-2408-l15-missions-exceptions.spec.ts` (écrit, joué par la CI).

## Déjà là

- **.11 CRA en retard** : `timesheet_missing` produit par `missionRisks` (`packages/contracts/src/schemas/mission.ts`, bloc #2408.11).
- **.81 Demander à Laura** par ligne : commit `7a21da75` (`MissionsTable.tsx`, `AskLauraMenuItem`).
- **.57/.58** reposent sur `invoice_blocked` (#2411.6) et `billingAlert` (#2408) déjà calculés.

## Non fait / à trancher

- **.82 table dense** et la moitié ÉCRAN de **.85** : jugement visuel, protocole humain (`docs/missions-cockpit-recette-humaine.md`).
- Satisfaction et société ne sont pas (encore) enregistrées dans « Mes vues » (`mission-saved-view-filters.ts`).
- Garde #2411.6 : sa spec de migration fige maintenant sa liste à sa date (même patron que #2411.11).

## Questions

1. Les trois seuils (30/10/30 j) conviennent-ils ?
2. « Relation menacée » lit le rail CLIENT seulement — juste ?

SHA de tête avant ce rapport : f383a553 (poussé, ci:local vert). Tests ciblés : contracts 79, API 186+19, web ~280 (rouge → vert).
