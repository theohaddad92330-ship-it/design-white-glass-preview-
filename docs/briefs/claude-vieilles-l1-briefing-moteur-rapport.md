# L1 — Briefing : moteur de cartes — rapport (31/10/2026)

Branche `claude/vieilles-l1-briefing-moteur`. Commits : `348ec8d2` (contrat + producteurs + ordre), `b7f28603` (service branché, portefeuille, démo), `84a6d9a6` (lecture plan de journée, GA-405), `7eb5440e` (fragment changelog).

## Par point

- **2095.6** facture bloquée (autres bloqueurs) — livré : genre `invoice_blocked`, `OTHER_INVOICE_BLOCKERS`, producteur dans `buildInvoicingCards` (348ec8d2, b7f28603).
- **2095.10 / 2107.16 / 2095.49** donnée critique générique, famille Qualité — livré : `critical_data_missing` + `BRIEFING_CRITICAL_FIELDS` (`mission_consultant`, `billing_contact_email`). Les 5 bloqueurs « donnée manquante » étaient déjà là (`briefing-actions.ts`, `invoicing_blocked_missing_data`), non recodés.
- **2095.34** permission — livré : dérivée de `routeContractFor(href)` (`cardPermission`) ; contrat `string | string[]`. Mesuré : `null` sur les 30 familles d'aujourd'hui (aucun écran sous permission).
- **2095.35** coût éventuel — non fait : arbitrage c132 (interne), aucun consommateur back-office dans le périmètre. Champ `creditsCost` déjà là sur l'artefact (`daily-briefing.ts`, schéma d'artefact). → question 1.
- **2095.41** famille Contacts — livré : `contact_left` (passé `historique` < 14 j).
- **2095.45** Missions démarrage/avenant — livré : `mission_starting` (≤ 7 j), `mission_amendment_pending` (avenant `sent`/`pending`).
- **2095.59** résumer une carte — livré en déterministe : `verdict` par genre (`BRIEFING_VERDICT_LABEL_KEYS`, FR/EN). Pas d'appel modèle. → question 2.
- **2095.60** proposer un angle — livré : artefact `angle` (nouveau genre en fin de liste) = `attack_angles` déjà calculé sur la carte de compte.
- **2095.70** mission J-30 avant compte — livré : rang 5, et règle gardée dans `orderActionsForRole` pour toutes les lectures.
- **2095.71** problème insoluble descend — livré : `NOT_ACTIONABLE_NOW_PRIORITY` (relevé en attente du client) ; dernier dans toutes les lectures, jamais retiré.
- **2095.74** objet priorité ET tâche — livré : `excludeObjectsAlreadyTasked` (tâche ouverte en retard / du jour sur le même compte, contact ou projet), aux 4 appelants. Un test de #2105.53 a été précisé (tâche à 2099, plus un cas « en retard » en plus).
- **2095.85** contrat des 23 champs — partiel : verdict, conséquence (14 familles qui la connaissent), permission remplis ; `estimatedMinutes` reste `null` (aucune durée n'est mesurée).
- **2107.15** connecteur CRM/déconnecté — livré pour le CRM (`crm_connections.refresh_failed_at` → état `disconnected`). La messagerie et l'agenda en échec de rafraîchissement ne sont pas lus.
- **2391.54 / 2391.55** — livré côté API : `GET /briefing/focus-plan/block-outcomes?event_ids=` + `focusPlanBlockOutcomeReadSchema`. Pas d'écran qui l'appelle (lot L2).
- **Droits** — le rebond de contact ignorait le portefeuille : corrigé. Un test vérifie que chaque lecture neuve est bornée et qu'un contact d'un compte d'un autre commercial n'apparaît pas.

## Tests (rouge → vert)

- `briefing-actions.engine.spec.ts` : 19 rouges → 30 verts.
- Specs du service et du contrôleur (lectures branchées, portefeuille, block-outcomes) rouges puis verts.
- Verts aussi : briefing-actions, role-order, labels, deleted-accounts, demo-card-coverage, demo-engine-coverage, GA-405, module-boundaries, endpoint-guards.
- Contrats : vitest `daily-briefing*` vert.
- Web : vitest urgency-tier / action-cta 42 verts.
- `tsc --noEmit` api et web verts (hors `@bellum/email` non buildé).

## Débordements (hors périmètre, nécessaires)

`briefing-role-order.ts` (5 genres par lecture), web `action-cta.ts`, `urgency-tier.ts`, i18n `briefing.json` FR/EN, `demo-seed.service.ts` (avenant `sent` daté), `changes/vieilles-l1-briefing-moteur.yml`.

## Questions

1. 2095.35 : quel écran back-office lit le coût d'une carte ? Sans lui, on garderait un champ que personne n'appelle.
2. 2095.59 : « le modèle résume » veut-il un appel LLM par carte (coût) ou le verdict déterministe suffit-il ?
3. Démo : démarrage, donnée critique et contact parti passent par les lectures du jeu semé, sans semis dédié vérifié. Faut-il en semer ?

SHA de tête : voir `git log -1` après ce commit.
