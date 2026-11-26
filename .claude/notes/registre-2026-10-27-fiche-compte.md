# Registre — lot FICHE-COMPTE (vague L, 27/10/2026)

| Point | État | Preuve en recette (le geste) |
| --- | --- | --- |
| #4621.1 | livré | `/accounts?q=Engie` sur un espace dont la coquille d'échec vide porte ce nom : l'écran dit « L'analyse a échoué sur « Engie » … masqué de la liste, pas perdu » avec « Reprendre » et « Voir les échecs » — jamais « Aucun compte ne correspond » seul. Chaîne : `AccountContent.tsx:888` → `NotInPortfolioEmptyState`. |
| #4621.2 | déjà là | un compte ARCHIVÉ nommé se dit archivé (`NotInPortfolioEmptyState`, appelant `AccountContent.tsx:888`) ; l'archivé passe avant l'échec. |
| #4621.3 | écarté | « fusion automatique ≥ 0,99 » : cause écartée par la mesure du 26/10 (ENGIE = `error` vide). Nuance de doctrine à porter dans `CLAUDE.md` (hors périmètre, plafond 15 000 c). |
| #4612.1 | écarté | libellé « N unités » disparu de l'onglet (mesure 27/10 : « 2 Sites affichés · 5 entités » vs « 7 · 6 », compteurs différents). Rien à corriger. |
| #4612.2 | déjà là | débordement du tableau Sites porté par le lot `/contacts` ; non rejoué ici (BLOCKED en recette, pas de preuve nouvelle). |
| #4604.1 | déjà là | étiquette « vient de <CRM> » par champ : `AccountDetailHero.tsx:293` (nom), `AccountScopePanel.tsx:100` (SIREN). Le CRM n'écrit que ces deux champs (`crm-import.service.ts:905-919`) : pas d'étiquette inventée pour les autres. |
| #4604.2 | déjà là | bloc « Ce que dit ton CRM » : `TabOverview.tsx:541` → `AccountCrmSaysCard`. |
| #4604.3 | reformulé | le PARTIAL du 27/10 porte sur 12 comptes IMPORTÉS DE FICHIER (pas CRM) : aucune provenance CRM, donc aucune étiquette — c'est correct. Le vrai défaut est la pastille « Venu de ton CRM » sur un import de fichier : #4526 (hors lot). |
| #4603.1 | déjà là | prévention : `analysis.service.ts:1545` → `findSameCompanyAccount` (SIREN puis `marketMatchKey`). |
| #4603.3 | retenu | SIREN lu chez HubSpot seulement (`crm-sources.ts:75`) ; Pipedrive & autres hors périmètre (`modules/crm`). |
| #4603.4 | livré | rattrapage du stock : `AccountsCrmFusionBanner` (appelant : `AccountsPage.tsx`, sous les puces, si un CRM est branché). Geste : manager ouvre `/accounts` → « N sociétés venues du CRM ET analysées à part » → « Fusionner » → « N comptes fusionnés ». Simulation d'abord (comptée), borne serveur 25/passage, annulable. REFUS : un rôle sans `integrations:manage` ne déclenche aucune requête (test) ; refus serveur d'un id d'un autre espace : `account-crm-fusion.service.spec.ts:128`. |
| #4587 | déjà là | `AccountsCrmChip.tsx` passe par `chipClassName` (appelant `AccountsListHead.tsx:48`), test `AccountsCrmChip.test.tsx:50`. |
