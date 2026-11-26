# LOT V — /missions : ne plus ressaisir ce qui est déjà écrit ailleurs

base : 8de5540daf63522b48628dc4f8792f7084ed0e9d — 18/09/2026

Une ligne par point. État NU (`retenu`/`livré`/`déjà là`/`reformulé`/`à trancher`) — la date va dans la preuve.

## Balayage préalable (git grep, avant tout code)

- `missionFromDocument` : aucun résultat sur `origin/main` — confirmé neuf.
- `apps/api/src/modules/crm-sync/` : existe, synchronise UNIQUEMENT les CONTACTS (email/téléphone) vers le CRM, sens entrant/sortant. Rien sur les deals/ventes/missions.
- `apps/api/src/modules/crm/pipeline-report.ts` + `crm-depth.service.ts` + `crm_deal_facts` (table) : cache DÉJÀ les deals lus depuis un CRM CONNECTÉ (HubSpot/Salesforce/Pipedrive/Attio via `CrmService`, contrat vérifié — OAuth documenté). Aucun lien `mission_id` existant.
- `apps/api/src/modules/odoo/` : connecteur Odoo NON vérifié sur une instance réelle (voir tête de `odoo.client.ts` — « personne ici n'a encore branché une instance Odoo »). Seul `res.partner` (contacts) est câblé — AUCUNE lecture de `sale.order` (ventes) ou d'un objet mission/contrat. Deviner ce contrat est exactement le piège n°1 du brief.
- `apps/api/src/database/entities/outbound-write-request.entity.ts` + `apps/api/src/modules/crm/outbound-write*.ts` : la PORTE d'écriture CRM/ERP (auto-approuvé sur geste utilisateur, sinon `pending`/prévisualisation figée/expiration 3 jours) existe déjà — à réutiliser, jamais reconstruite.
- `apps/api/src/modules/ia/ia.client.ts` + `apps/ia/app/services/expense_extraction.py` + `apps/ia/app/routers/expenses.py` + `apps/api/src/modules/expenses/expense-extraction.service.ts` : LE PATRON exact « document → extraction Claude → proposition avec confiance + citation → jamais une écriture » — repris pour #2560, pas réinventé.
- `apps/web/src/features/missions/view/CreateMissionPage.tsx` (`/missions/nouvelle`) : monte `NeedWizard`, écrit un `project_need` (`POST /projects/:id/needs`) — **domaine `projects/needs`, hors périmètre de ce lot** (branche en vol #2571). `POST /delivery/missions` (`createMissionRequestSchema`, la vraie création de `MissionEntity`) **n'a AUJOURD'HUI AUCUN appelant web** — seul l'outil interne `create_mission` (action-router/Laura) l'appelle. C'est le point d'entrée que ce lot câble.
- `apps/web/src/features/accounts/view/account-detail/tabs/TabMissions.tsx` (`QuickActions`, commentaire #2124.30/.31 déjà présent) : documente explicitement que ni `NeedWizard` ni l'import ne préremplissent le COMPTE, « hors périmètre de ce lot ». C'est l'entrée choisie pour #2560 : `accountId` déjà connu par le contexte de la page, jamais deviné depuis le document.

## #2560 — créer une mission depuis un contrat, une fiche de poste ou un e-mail

- 2560.1 — extraction IA (`POST /missions/extract` sur le service IA, patron `expense_extraction.py`) : livré (`4878e5d47`, 12 tests pytest verts)
- 2560.2 — service + contrôleur API (`delivery/mission-extraction.*`, `records:write`) : livré (`778218133`, 10 tests jest verts, `tsc --noEmit` propre)
- 2560.3 — écran : bouton « Créer depuis un document » sur `TabMissions.tsx`, dialogue de revue (compte du contexte, rôle/dates/TJM/jours proposés et modifiables), clic = `POST /delivery/missions` : livré (`e3f7db734`, 29 tests vitest verts sur les 3 fichiers touchés, i18n FR+EN, `tsc --noEmit` propre, `pnpm lint:exports:types` vert, `tools/registres/coherence.py` vert)
- 2560.4 — démo : script déterministe (`demoMissionExtraction`), pas d'appel modèle en lien public, gardé par un test de comportement (`mission-extraction.controller.demo.spec.ts`) qui vérifie que le client IA n'est JAMAIS appelé sur un espace démo : livré (`e3f7db734`)
- 2560.5 — jours (bon de commande, `po_volume_days`) : la PROPOSITION les porte (recette), mais leur ÉCRITURE persistante vit dans `mission_commercial_terms` sous `finance:read`/`finance:write` — distinct de `records:write` qui crée la mission. **à trancher** : ce lot n'écrit PAS `po_volume_days` automatiquement après création (deux droits différents, un utilisateur `records:write` sans `finance:write` ne doit pas déclencher une écriture financière à son insu) — recommandation : garder la proposition affichée avec une note « à confirmer dans les conditions commerciales de la mission », lien vers l'onglet Finances. Raison écrite, pas un contournement du droit.
- Consultant/assignation : mentionné dans la demande client mais absent du critère de recette et absent de `createMissionRequestSchema` (l'affectation est un objet séparé, `mission-assignment`) — **hors périmètre de ce lot**, non recodé.

## #2562 — proposer de reprendre les missions depuis l'outil déjà connecté

- 2562.1 — à trancher : la seule source à contrat VÉRIFIÉ pour des « ventes/missions » côté outil connecté est `crm_deal_facts` (HubSpot/Salesforce/Pipedrive/Attio, lecture déjà câblée par `crm-depth.service.ts`). Odoo — l'exemple cité par le client — n'a AUCUNE lecture de vente vérifiée (`sale.order` jamais branché sur une instance réelle) : deviner ce contrat est refusé par la doctrine. Recommandation : livrer la proposition sur les CRM à deals déjà lus (si le temps du lot le permet), et laisser Odoo `retenu` avec cette raison jusqu'à ce qu'un opérateur fournisse une instance réelle à vérifier.

## #2561 — voir les ventes/contrats venus de l'outil connecté, avec correspondance explicite

- 2561.1 — à trancher : même socle que #2562 (`crm_deal_facts`). Aucun lien `mission_id ↔ deal_id` n'existe encore ; l'établir suppose soit une migration (colonne de correspondance), soit de le construire au moment où #2562 est accepté. Dépend de l'arbitrage 2562.1.

## Ce qui n'est pas fait et pourquoi (si le lot s'arrête après #2560)

#2561 et #2562 dépendent du même socle (`crm_deal_facts`) et d'un arbitrage produit sur le périmètre Odoo (2562.1) que je ne tranche pas moi-même. Si le budget de tours ne permet pas de les livrer dans ce passage, ils restent `à trancher` avec leur raison ci-dessus — pas `retenu` en silence.
