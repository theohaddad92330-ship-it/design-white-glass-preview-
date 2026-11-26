# Rapport — fusion compte-CRM ↔ compte-analyse (#4603) et provenance CRM dans la fiche (#4604)

Branche : `claude/crm-fusion-4603-2610` (depuis `origin/main` 27859b66). Aucune PR.

## ⚠️ Renversement de doctrine — Louis, 26/10/2026

« On PROPOSE une fusion de doublons, on ne fusionne JAMAIS » (`c37_fusion_doublons`) est renversé **pour un seul
cas** : la paire _compte venu du CRM (sans run) ↔ compte créé par l'analyse_, même société, se fusionne sans
demander. Écrit à l'endroit du comportement (`account-crm-fusion.ts`, `account-crm-fusion.service.ts`, la
migration, l'appel dans `analysis.service.ts`), dans les commits, et au registre :
`c142_fusion_auto_compte_crm_compte_analyse` (c37 y renvoie). Deux comptes de même nom d'origines quelconques
restent **proposés** (garde : `account-crm-fusion.spec.ts`).

Antériorité nommée : « 7× Decathlon » (`1786000000000-PurgeEmptyDuplicateAccounts.ts`) — le correctif d'alors
traitait la relance après échec, jamais l'arrivée par le CRM. Voisine : #3490 (proposition après coup).

## Ce qui est livré

| #   | Quoi                                                                                                                                                                                                                                                                                                                                          | Où                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Prévention : avant `create()`, l'analyse reprend le compte de la même société, quel que soit son statut ; le run s'appende (`reuseForRelaunch`)                                                                                                                                                                                               | `same-company-account.ts`, `AccountsService.findSameCompanyAccount`, `analysis.service.ts`                                  |
| 2   | Clé : SIREN d'abord, puis `marketMatchKey` (aucun second normaliseur). SIREN contradictoire → jamais repris ; homonymes de SIREN différents → ambigu                                                                                                                                                                                          | `pickSameCompanyAccount`                                                                                                    |
| 3   | L'import CRM pose `origin = 'crm'`, `status = 'imported'`, le SIREN quand HubSpot le porte (propriété `siren`), et commet la provenance `connector`                                                                                                                                                                                           | `crm-import.service.ts`, `hubspot.client.ts`, `crm-sources.ts`                                                              |
| 4   | Rattrapage ciblé : espace actif, borne ≤ 100/passage, simulation par défaut et comptée, archive sans DELETE, journal `account_crm_fusions` (2 ids + clé), réversible ; paire tranchée par un humain ou fiche CRM triée à la main → laissée et comptée                                                                                         | `account-crm-fusion*.ts`, `POST /accounts/crm-fusions/sweep`, `POST /accounts/crm-fusions/:id/undo` (`integrations:manage`) |
| 5   | Union déplacée : contacts, affaires (`opportunities`, `crm_deals`, `crm_deal_facts`), activités (`activities`, `crm_activities`), runs, notes, liens CRM (`sync_links`)                                                                                                                                                                       | `CRM_FUSION_FAMILIES`                                                                                                       |
| 6   | #4604 : provenance par champ (nom dans le hero, SIREN dans le panneau registre) + bloc « Ce que dit ton CRM · <outil> » — **réutilise** `field_provenance` (le modèle existant) et `loadAccountCrmProvenance` (#4459) ; #4069 a été lu : ses faits « ne disent jamais d'où ils viennent », il n'y avait rien à y reprendre pour la provenance | `crm-account-provenance.ts` (contrat), `account-crm-provenance.ts` (API), `AccountCrmSays.tsx` (web)                        |
| 7   | Démo (craft n°9) : bloc et étiquette visibles sur Société Générale via le miroir CRM fictif ; `account_crm_fusions` purgée et classée vide à dessein avec sa raison                                                                                                                                                                           | `demo-seed.service.ts`, `demo-coverage.ts`, `demo-reset.service.ts`                                                         |

Migration : `1796584123457-AccountCrmFusions.ts` — additive (table neuve, RLS fermée), contraintes posées avant le code.

## Ce qui n'est PAS fait (et pourquoi)

- **SIREN des autres CRM** (Pipedrive, Salesforce, Attio, Odoo, Zoho) : non lu à l'import — leurs lectures ne sont pas vérifiées sur instance réelle ; ces fiches se rapprochent par le nom seul.
- **Sens inverse** (compte analysé d'abord, PUIS importé du CRM) : l'import crée encore une seconde fiche ; c'est le rattrapage qui la fusionne. Une prévention à l'import toucherait `buildAccountIndex`, dont le docblock refuse le rapprochement par nom — décision à prendre.
- **Contacts homonymes** : un contact de la fiche CRM homonyme d'un contact de la fiche gardée reste sur la fiche archivée (index unique) — lisible, non fusionné.
- **Aucun écran** pour lancer le rattrapage ou annuler une fusion : routes API seulement. Le rattrapage du stock (les deux « Veepee ») n'a **pas été lancé** : c'est un geste à faire, simulation d'abord.
- **Champs personnalisés du CRM** dans le bloc : non affichés (le miroir les porte sur les affaires, pas sur la société).
- **Provenance du nom** : `field_provenance` est la provenance _courante_ ; si un autre écrivain change `company_name` sans commettre sa provenance, l'étiquette « vient de <CRM> » peut devenir fausse. Non mesuré.
- Hors périmètre touché, nécessaire : `apps/web/src/features/crm/hooks/useAccountCrmProvenance.tsx` (une condition), `apps/api/src/modules/demo/**` (exigé par craft n°9), `docs/briefs/` (ce rapport).

## Tests (ciblés, rouge → vert)

API : `same-company-account.spec`, `account-crm-fusion.spec`, `account-crm-fusion.service.spec`, `account-crm-fusion.controller.spec`, `accounts.service.spec` (#4603), `analysis.service.spec` (#4603), `crm-import.service.spec`, `crm-sources.spec`, `account-crm-provenance.spec`, `crm-push.service.spec`, migration `1796584123457`, `demo-crm-mirror-coverage.spec`, `demo-coverage.spec`, `demo-reset.service.spec`, gardes `endpoint-guards`/`current-user-needs-auth-guard`/`controller-services-exported`.
Contrats : `crm-account-provenance.test`, `doctrine-registry.test`. Web : `AccountCrmSays.test`, `CrmProvenance.test`, `CompleteCrmAccountButton.test`, i18n, gardes couleurs/fournisseurs/absence.

Échec **préexistant sur main**, hors lot : `src/database/migrations.spec.ts` refuse `20261025100000-MultiMailboxConnections.ts` (14 chiffres, non inscrit en legacy).

Typecheck : `apps/api` (`tsc` à 8 Go) → 3 lignes `error TS`, toutes `Cannot find module '@bellum/email'` (paquet non construit dans la VM, hors lot) ; `apps/web` (`tsc -p .`) → 0.
