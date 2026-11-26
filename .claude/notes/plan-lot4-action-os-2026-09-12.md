# Plan — lot 4 : les cartes d'action du chat migrent vers Action OS (#1930 #1931 #1943 #1952 #1953 #1959)

Source : planificateur Opus lecture seule du 12/09. Décision de Louis : migration COMPLÈTE (contre la reco).
⚠️ Affirmations de planificateur : chaque écrivain RE-VÉRIFIE.

## Chiffres
11 types de carte (`PendingActions.tsx:53-214`) : 1 passe déjà par le routeur (rappel, sans clé) ; 2 intents inadaptés (enrichissement synchrone ; export CRM 2 CRM sur 4) ; 5 intents à créer ; 3 cartes sans effet (navigation). 1 carte payante (enrichissement, 1 crédit) ; analyse depuis la conversation hors carte (8 crédits). 0 carte persistée aujourd'hui (le `context` n'est pas stocké : les cartes DISPARAISSENT au rechargement). 1 migration additive (8 colonnes nullables, 1 index), aucune CHECK à élargir.

## Défauts trouvés en chemin (D1-D9)
- D1 cartes perdues au rechargement (`Chat.tsx:2122-2126`, `agentChatApi.ts:53-58`).
- **D2 une approbation depuis l'Action Center n'exécute RIEN** : `action-os.controller.ts:307-312` passe `intents: {}` → pas sautés → run `blocked` ; la spec passe de vrais intents (`workflow-runner.service.spec.ts:239-244`). Impact prod À VÉRIFIER.
- D3 crédit « dépensé » compté sur l'estimation quand un pas est `done`, même si l'enrichissement n'a rien trouvé (0 débité) (`workflow-runner.service.ts:377`, `contacts.service.ts:1749,1780`).
- D4 routeur : enrichissement synchrone alors que la route web est en 202 + sondage (cascade 30-85 s).
- D5 réservation de crédits sans test démo (`workflow-runner.service.ts:337-352`).
- D6 un pas `queued` seul → run `partial` au lieu de « en cours » (`:509-538`).
- D7 pas écrits seulement en fin d'exécution (pas d'étape actuelle visible).
- D8 la route chat ne propage pas l'annulation au client IA (`ia.client.ts:1078-1081`, `ia-proxy.controller.ts:355-480`).
- D9 seule la porte HubSpot reçoit l'origine d'écriture ; Salesforce / Pipedrive / Attio À VÉRIFIER.

## Invariants crédits (arrêt obligatoire facturation)
I1 prix = grille (`creditCostOf`), jamais un littéral · I2 Action OS ne débite jamais lui-même · I3 jamais réservation + débit pour la même action · I4 « dépensé » = débit observé · I5 reprise avec la même clé = aucun second effet · I6 démo : zéro réservation, zéro débit · I7 message, Arrêter, Réessayer = 0 crédit.

## État persisté
Carte = run `workflow_runs` (`trigger = copilot_proposal`) ; clic = approbation créée `approved` (`decided_by`) ; refus = approbation `rejected` + run `cancelled` (reste visible) ; fonction pure `cardStateOf(run, approval, now)` dans les contrats ; nouveaux statuts en FIN : `snoozed`, `superseded` ; expiration 3 j calculée ; `unknown` sans bouton Réessayer. Clés : run `card:<turnId>:<index>` ; clic `UPDATE … WHERE status='planned'` ; dispatch `<runId>:<stepKey>:<tentative>`.

## Découpage (ordre L1 → L2 → L3 → L4 ; déploiement migration → API → web ; l'API garde `pending_actions` dans `done` pour les onglets anciens)
| Lot | Fichiers | Preuve en production |
| --- | -------- | -------------------- |
| L1 contrats + schéma | `packages/contracts/src/schemas/{action-os,action-router,copilot-card}.ts`, migration `CopilotCardsOnWorkflowRuns`, entités `workflow-run`, `chat-message` | Action Center affiche les runs existants ; un message à Laura se persiste |
| L2 moteur (Action OS + routeur) | `action-os/{copilot-card-catalog,copilot-card.service,workflow-runner.service,action-os.controller,run-trace,module}`, `action-router/{service,module}`, `external-steps-need-a-human.spec.ts` | approuver une demande en attente → run `done`/`partial`, plus `blocked` (corrige D2) |
| L3 pont conversation | `ia-proxy.controller.ts` (route chat), `chat-messages.service.ts`, DTO, module | « rappelle-moi de relancer X demain », recharger → carte toujours « À valider » |
| L4 web | `PendingActions.tsx(+test)`, `Chat.tsx`, `laura-turn.ts` (Arrêter), `agentChatApi.ts`, `action-os/{api,ActionCenter}`, i18n chat/actions, `chat-actions-cross-language.test.ts` | préparer un brouillon → Valider → « créé dans ta messagerie, aucun envoi » + Ouvrir ; recharger identique ; 2e onglet « déjà exécutée à HH:MM » |

Ne se migre pas : cartes de navigation (journal sans dispatch) ; diff CRM avant/après sans lecture côté CRM (« état actuel non lu ») ; annuler un enrichissement parti ; copier / partager / branches / brouillon de saisie (#1953 hors actions) ; autres écrans (fiche contact, messagerie).

## Questions (posées à Louis le 12/09)
Q1 réserver le crédit d'enrichissement au clic ? · Q2 analyse depuis la conversation : suivi seul, facturation inchangée ? · Q3 ce qui apparaît dans Actions · Q4 reporter et expiration.
