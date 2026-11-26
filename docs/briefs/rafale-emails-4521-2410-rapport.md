# Rapport — RAFALE-EMAILS (#4521), branche `claude/rafale-emails-2410`

| #   | Point                                     | Statut | Raison / test                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Compte + contact (nom, fonction) en liens | Fait   | L'API résout le contact (`contact_id`, sinon `owner_name` rapproché des contacts du compte par `findContactByName`, extrait de `planSteps.ts` vers `@bellum/contracts` : une seule règle, #4415/#4416 gardés). `action-plan-items.service.spec.ts` (#4521), `TodayCard.planMail.test.tsx`, `planSteps.test.ts` inchangé et vert.                                       |
| 2   | Ligne « signal », sans ligne sinon        | Fait   | `readPlanSignal` lit « signal factuel du … (A à B) » dans la consigne → « Repli de CA : A → B » ; date = `provenance.at` si connue. `plan-mail-context.test.ts` (dont les cas « rien »), `TodayCard.planMail.test.tsx` (aucune ligne sans signal).                                                                                                                     |
| 3   | « Générer le mail » carte par carte       | Fait   | `POST /ia/message` existant (crédit zéro, comme `prepare-email-draft.ts`), consigne = angle, signal = paramètre `signal`. Aucun nouveau prompt, aucune génération en masse, brouillon dans l'état du panneau (objet + corps modifiables), puis « Copier et ouvrir » / « Fait » existants. `planMail.test.ts`, `PlanMailBlock.test.tsx`, `TodayCard.planMail.test.tsx`. |
| 4   | Récap : destinataires du plan nommés      | Fait   | Les items portent `contactName`/`contactId` ; `recipientOf` (burst.ts) les compte sans changement de logique. `burst.test.ts` (#4521.4, avec cas « sans contact reste sans destinataire »).                                                                                                                                                                            |
| 5   | Aucun envoi auto ; « Fait » déclaratif    | Fait   | Rien envoyé ni enregistré par la génération ; gestes inchangés.                                                                                                                                                                                                                                                                                                        |
| 6   | Démo                                      | Fait   | Relance e-mail SNCF (contact fictif, signal dans la consigne, raison) dans `DEMO_PLAN_TASKS`. `demo-rafale-emails-coverage.spec.ts` ; `demo-seed.service.spec.ts`, `demo-today-queue-coverage` verts. Aucune table ni clé `raw_analysis` neuve : rien à classer dans `demo-coverage.ts`. Le brouillon passe par `/ia/message`, comme le composer en démo.              |

Droits : « Générer le mail » exige `records:write` côté web (`hasPermissions`), fail-closed tant que le rôle n'est pas lu ; test « rôle sans droit : rien ». Remarque : « Préparer » sur l'onglet Plan n'a pas de garde de permission explicite (seulement le contexte d'engagement) ; `/ia/message` n'a pas non plus de `@RequirePermission`. J'ai posé `records:write` (droit existant) plutôt que rien — à confirmer par Louis.

Changelog FR + EN : `2026-10-24-rafale-emails-4521`.

## Tests lancés

- contracts : `vitest` plan-mail-context, action\*, recette-lau-final-109, changelog (239 verts) ; `tsc` 0 erreur.
- api : `jest` action-plan-items.service.spec (152), demo (seed, coverage, today-queue, rafale…) verts ; `tsc` : 0 erreur hors `@bellum/email` (paquet non construit ici, préexistant).
- web : `tsc --noEmit` 0 erreur ; vitest today (burst, todayQueue, planMail, PlanMailBlock, TodayCard.planMail) + planSteps verts.
- `src/architecture` : 238 fichiers verts, 4 en échec par `@bellum/utils` non construit dans la VM (empty-states, org-relation, chaque-route, hors-catalogue) — étrangers au lot, à confirmer par la CI.

## Non fait / limites

- Le signal est lu dans le TEXTE de la consigne (aucun champ structuré n'existe côté plan) : une consigne qui ne cite pas « signal … (…) » n'en affiche pas. Un champ `signal` structuré côté IA (`apps/ia`, hors périmètre) l'améliorerait.
- Recette Chrome sur prod (critère de l'issue) : non faite ici.
