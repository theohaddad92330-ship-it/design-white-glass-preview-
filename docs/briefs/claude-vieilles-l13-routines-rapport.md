# Rapport — claude/vieilles-l13-routines (L13 Routines, #2843 / #2102.45)

Branche `claude/vieilles-l13-routines` · SHA de tête : voir `git log -1` (commit du rapport) · commits 615de363, de07c2ee, 6c554b23.

## Livré

- **2843.1-.4, .6, 2102.45** — 9 routines neuves (enum EN FIN, `routines.ts`) : `interview_upcoming`, `interview_feedback_missing` (recruteur), `team_mission_risks`, `blocked_needs` (manager), `mission_documents_pending`, `mission_start_deadlines` (ADV), `mission_renewal_to_engage`, `consultant_repositioning`, `meeting_reminder_t1` (rappel T-1, heure réglable). Lectures SQL réelles `talent-routines.service.ts` (missions/besoins privés exclus, `measured:false` ⇒ « non mesuré »), exécuteur unique `routine-executors.ts` (`l13Read`), familles API + web. Test : `routine-executors.l13.spec.ts` (rouge 53 → vert).
- **2843.25** — les 9 neuves sont N1, éteintes, in-app ; daily_briefing/meeting_prep/meeting_checklist/connector_health inchangées (testé).
- **2843.20** — reprise retry/backoff : 3 tentatives max, 15 puis 30 min, même ligne, réservation conditionnelle (`routine-retry.ts`, `RoutinesService.reserveOccurrence`).
- **2843.9** — `error` PRODUIT après 3 échecs : abonnement `error`/désactivé + message in-app ; affiché sur la fiche, réactivable (« Active »).
- **2843.10** — `POST /routines/:key/run-now` (clé à la minute, refus nommés demo/blocked/already_running) + bouton « Lancer maintenant ».
- **2843.21/.24 (latence)** — `duration_ms`, `attempt`, `attempted_at` sur `routine_runs` (migration additive `1796610003100-RoutineRunAttempts`, CHECK avant le code). Back-office seul : `GET internal/admin/routines/runs?userId=` (`InternalSecretGuard`, par utilisateur, jamais agrégé). Test : `listRuns` client n'expose aucune de ces clés.
- **2843.18** — `GET /routines/:key/observation` : 30 jours d'exécutions RÉELLES (runs/notifications/échecs) ; 0 exécution ⇒ « rien n'a été mesuré ».
- **2843.26 / .15** — `RoutineDetailPage.tsx` : parcours en 7 étapes (comprendre, exemple, simuler, configurer, valider, activer, observer), le même pour toutes. Test `RoutineDetailPage.test.tsx` (rouge 5 → vert).
- **Défait (c132)** — `editor.switch.field.credit_cap` retiré FR/EN ; `AutomationSwitchPreview` n'affiche plus un changement de plafond (test ajouté).
- Fragment `changes/vieilles-l13-routines.yml` (changelog FR/EN + chantiers-livres), validé par `fusion_fragments.py --garder` sur copie.

## Déjà là (pas recodé)

- 2843.15 simulation générique pour toutes : `RoutineDetailPage.tsx` `GenericRoutineSimulation` (#2399.5) — réutilisée à l'étape 3.
- 2843.9 statuts nommés + CHECK SQL : `1796322045000-RoutineSubscriptionStatus.ts` (aucune migration de statut nécessaire).
- Rôle = ordre seulement : `routine-role-order.ts` (c76) — les 9 neuves y sont classées, rien n'est filtré.

## Non fait (et pourquoi)

- **2843.21 coût par exécution** : le seul exécuteur qui appelle le modèle (`no_reply_follow_up`) écrit déjà son coût dans `provider_costs` via `ProviderCostRecorder.recordHeader`, qui ne RENVOIE rien ; relier le coût à la ligne demande de modifier `modules/analytics` (hors périmètre).
- **2843.19 plafond par routine** (back-office) : aucun modèle de plafond par routine n'existe ; à cadrer (valeur, effet au plafond).
- **2843.18 simulation par rejeu** des 30 jours pour une routine jamais exécutée : les exécuteurs mêlent lecture et écriture (cf. `noReplyFollowUpDryRun`) — livré : l'observation réelle, pas un rejeu.
- 2843.7 (étapes, validations dans le schéma), 2843.13 (scope/autonomie réglables), 2843.29 (par type d'espace), 2843.30 (contenu configurable) : non faits, faute de tours ; 2843.17 écarté (Louis).
- TDD : `routines-retry.spec.ts` écrit avant le code mais non exécuté rouge avant l'implémentation.

## Questions

1. `editor.settings.cap` (« Plafond d'usage sur 30 jours », `routines.json:403`) reste visible dans `AutomationRuleSettingsDialog` (règles d'automatisation) : le retirer aussi ? (fichier hors périmètre `features/automations`).
2. Débordement d'une ligne dans `features/automations/view/AutomationSwitchPreview.tsx` (filtre `credit_cap`) pour ne pas afficher une clé brute : à valider.
3. Coût par exécution : autoriser `ProviderCostRecorder.recordHeader` à renvoyer le coût (`modules/analytics`) ?
