# Registre — épopée #4293 (vague L, 27/10/2026) — preuve de CÂBLAGE

Méthode : `git grep -n` de l'appelant, de la route jusqu'à l'écran. Aucun orphelin trouvé : tout est câblé sur `origin/main` (8b6d99fc).

| Point | Origine | Verdict | Appelant (fichier:ligne) | Geste qui le prouve en production |
| --- | --- | --- | --- | --- |
| #4293.1 | #3702.2 | déjà là | `SequencesPage.tsx:792` monte `DelegationBlock`, `:794` monte `MandateScopesBlock` ; `useSignScopedMandate` → `outreach-delegation.service.ts:createScoped` | Séquences › Mandats › « Signer le mandat » → « Mandat signé, actif jusqu'au… » |
| #4293.2 | #3702.3 | déjà là | `MandateScopesBlock.tsx:136` (Pause, mandat actif) · `:140` (Reprendre) · `:146` (Révoquer) · `DelegationBlock.tsx:184/188` ; API `outreach-delegation.controller.ts:115` | Mandat actif › « Mettre en pause » → badge « En pause » + « Reprendre » |
| #4293.3 | #3702.4 | déjà là | `outreach-delegation.service.ts:381/414/487` → `verdictFor:516` (lit `excluded_at`) ; affiché par `DelegationBlock.tsx:128-137` | Nécessite une vraie réponse d'un tiers (non jouable en recette seule) |
| #4293.4 | #3702.5 | déjà là | `DelegationBlock.tsx:101` (`mailbox_unavailable`), `:144-150`, libellé `outreach.json:1090` | Déconnecter la messagerie sous mandat actif → « N en attente — boîte d'envoi non connectée » |
| #4293.5 | #4072.1 | déjà là | `FocalOrgView.tsx:185,765` + `OrgInfluenceMap.tsx:208,954` → `OrgKnownMarker` ; API `account-facts.controller.ts:69` | Démo SG › Organigramme → « Déjà connu : dans ton CRM » (semis `demo-dataset.ts:18727`, garde `demo-org-crm-known-in-graph.spec.ts`) |
| #4293.6 | #4072.3 | déjà là | `AgendaBoard.tsx:512` et `BriefingPage.tsx:45` → `MeetingPrepDialog.tsx:762` → `AccountFactsBriefBlock` ; RDV démo « SNCF — point… » rattaché par nom (`meeting-account-match.ts:120`) | /briefing › vue Agenda › RDV « SNCF — point besoin… » › « Ce que l'espace sait de ce compte » |
| #4293.7 | #2770.2 | déjà là | `chat_tools.py:21896` → `_mailbox_unplaced:12157` ; rendu `WeeklyPlanCard`/`FocusPlanCard` « Non placé » (`chat.json:2393`) | Sans messagerie, « Organise-moi ma journée » → « Non placé » |
| #4293.8 | #2770.13 | déjà là | `chat_tools.py:21842` (jour nommé) ; `PendingActions.tsx:465` → `WeeklyPlanCard` ; clôture : `FocusPlanCard.tsx:306` → `briefing/api.ts:174` → `briefing.controller.ts:552` | /chat « Organise-moi ma journée de lundi », puis « ma semaine », puis clôturer un bloc réalisé/reporté |
| #4293.9 | #2770.36 | reformulé | décision c76 (le rôle change l'ORDRE, jamais le CONTENU) | — |
| #4293.10 | #3295.6 | reformulé | décision doctrinale écrite (A/B remplacé) | — |
| #4293.11 | #3295.7 | déjà là | `RexScreen.tsx:126` (`pb-24`), garde `RexScreen.test.tsx:218` ; route `routes/pilotage/rex.tsx:23` | /pilotage/rex : « Recueillir le retour » n°3 non recouvert par la bulle de Laura |

## Constats de recette 19/10 déjà corrigés depuis
- « Aucun bouton Pause visible » (#4293.2) : la Pause existe pour un mandat `active` (`MandateScopesBlock.tsx:136`). Un mandat `not_started` ne montre que Révoquer — voulu : rien n'envoie avant son début.
- « 0 Déjà connu » (#4293.5) : semis corrigé (`demo-dataset.ts:18727`).

## Limite
Les specs liées n'ont pas pu tourner dans cette VM (`@bellum/contracts` non construit, build interdit au lot) : leur exécution est laissée à la CI.
