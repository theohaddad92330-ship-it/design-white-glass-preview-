# Registre épopée #4290 — preuve de câblage (27/10/2026, vague L)

Verdicts mesurés par `git grep` sur origin/main (a0400ff1). Aucun orphelin trouvé : aucun code produit, ce registre est le livrable.
« Geste » = ce qu'une recette écran doit jouer en production.

| Point | Verdict | Appelant (fichier:ligne) | Geste de preuve |
| --- | --- | --- | --- |
| #4290.1 envoi compte+contacts | câblé | AccountDetailHero.tsx:344, ContactsSelectionBar.tsx:315, ContactContent.tsx:1613, AccountContent.tsx:1058 → api.ts:459-462 `/crm/push` | fiche compte → Envoyer vers CRM : champs listés (envoi réel = geste écriture, non joué) |
| #4290.2 dernière synchro | câblé | connector-cards.tsx:218 → ConnectorSyncStatus.tsx:128 + CrmLastSync (via CrmReadScopeNote) | /settings/integrations carte Salesforce : « Dernière synchronisation : date (il y a N min) » |
| #4290.3 upsert 5 CRM (6 avec Zoho) | câblé | même dialogue ; contrat crm-adapter.ts:85-92 ; crm-push.service.ts:95 | envoyer un compte déjà présent → « retrouvée, jamais dupliquée » |
| #4290.4 synchro incrémentale | câblé | crm-frequent-sync.service.ts:41 (CRM_INCREMENTAL_PROVIDERS, cron :154) ; crm-read-sync.service.ts:275 | Reprise Salesforce simulation puis réelle → date de dernière synchro |
| #4290.5 CrmReadScopeNote | reformulé (décision 17/10) | CrmReadScope.tsx:38 | HubSpot « Non lu : affaires » |
| #4290.6 bilan doublons/rejets/à rapprocher | câblé | ImportFamilyReport : ResultStep.tsx:101, ImportWizard.tsx:1524, ImportsHistoryBlock.tsx:238 (monté ImportsSourcesContent.tsx:145 ; /settings/import redirige vers Mes données › Imports, MyDataTabs.tsx:60), CvZipImportDialog.tsx:471 | Mes données › Imports : bilan par famille, historique multi-lots |
| #4290.7 personnes distinctes / comptes résolus | câblé | universal-import.service.ts:1145-1151 (planner :118-131) → ImportFamilyReport.tsx:44 | importer un lot restreint → « N personnes distinctes », « N comptes résolus » |
| #4290.8 « complète ce compte » | câblé | chat_tools.py:16792 → account_completion_tools.py:208 ; web AccountDetailHero.tsx:349 | fiche compte → Compléter ; chat Laura « complète ce compte » |
| #4290.9 alias | câblé | universal-import-planner.ts:295-302 (alias de cellule, rapprochement) | import avec colonne alias → compte rapproché |
| #4290.10 secteurs | câblé | account_completion.py:150-168 via execute_complete_account | portefeuille → niveau « secteurs » |
| #4290.11 personnes hors base | câblé | account_completion.py (contacts proposés) via chat_tools.py:16792 | « complète ce compte » → personnes détectées |
| #4290.12 « a quitté » | câblé | ContactTableRow.tsx:333 ; demo-dataset.ts:2236 | /contacts démo → badge daté |
| #4290.13 critères Exteam | câblé | demo-dataset.ts:3017, :4236 ; contacts.service.ts:3454 | contact au titre périmé → badge |
| #4290.14 proposition non reproposée | câblé | chat_tools.py:16794 (dismiss) ; account_completion_tools.py:119/274 lit les écartés ; contact ajouté sort par `contacts` | ajouter/écarter la personne proposée, rejouer → plus proposée |
| #4290.15 reprise Pipedrive | câblé | crm-first-import.runner.ts:161,220 ; pipedrive.client.ts:116,429 | reprise compte Pipedrive test → contacts et affaires comptés |
| #4290.16 une seule date | câblé | crm-read-sync.service.ts:58,256,455 ; ConnectorSyncStatus.tsx:136 | carte Pipedrive/Odoo : une seule date |
| #4290.17 mode de mise à jour | câblé | crm-sync-schedule.ts:66 → crm-read-sync.service.ts:458 → CrmReadScopeNote.tsx:61 | carte Pipedrive : « relecture toutes les 15 min » ; HubSpot/Salesforce « temps réel » (si secret posé) |

Droits : aucune route/menu/action neuve livrée, donc aucun test de refus ajouté.
Reste hors portée de ce lot : envoi réel vers un CRM (geste d'écriture) et reprise réelle Pipedrive, à jouer en recette avec un compte de test.
