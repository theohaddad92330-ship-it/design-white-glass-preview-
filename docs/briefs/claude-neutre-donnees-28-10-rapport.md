# Rapport N9 — claude/neutre-donnees-28-10 (SHA : voir `git log` de la branche, poussée sans PR)

Le brief recopiait des lignes du 24-26/10 ; main (719dd9d9) avait livré la plupart. Registre : `.claude/notes/registre-2026-10-28-n9.md`.

- **#4530.3 / .8** déjà là : `discover-my-target.ts` (+test :44,:53), appelant `Discover.tsx:1102` ; démo `demo-discover-my-target-coverage.spec.ts`.
- **#4530.10** livré : `contrast.test.ts` (texte d'accent sur aplat, 2 thèmes) + `MyTargetToggle.test.tsx` (44 px, aucune couleur en dur, mutation vérifiée) ; appelant `Discover.tsx:2578`.
- **#4530.4** NON appliqué (question 1).
- **#4532.2/.3/.5** déjà là. Retrait déjà fait sur main ; liste « atteint seulement par ce chemin » : rien — `VivierExportView` supprimé, la carte vit dans `MyDataTabs.tsx:49`. Restent des mentions de `/settings/vivier-export` (redirection : route-titles, known-routes, catalogue Laura API/IA, chat_tools.py:6860) qui atterrissent toutes sur Mes données.
- **#4546.4 / .11** déjà là. **#4546.5** partiel, livré pour l'ENVOI individuel : `contacts.service.ts` `deliverDraft` → `mailbox.service.ts` `sendIndividual`/`individualSendStatus` (port `module-tokens.ts`, contrat `sender_connection_id`), écran `EngagementSendEmail.tsx` (≥ 2 boîtes : rien choisi d'office, bouton fermé jusqu'au choix, « De » dit l'adresse). Tests : `EngagementSendEmail.sender.test.tsx`, `contacts.service.spec.ts` (REFUS boîte d'un autre / sans portée), `mail-batch-sender.spec.ts`. L'API accepte aussi l'expéditeur du brouillon ; aucun écran ne l'envoie encore.
- **#4546.9** non fait. **#2843** (21 points) : non traités, épopée de plusieurs jours ; #2843.6 déjà livré pour la cascade T-45/30/15 (ac67fd79).
- Jumeaux : `individualSendStatus`, `createDraft`, `createContactDraft` suivent le même motif que `sendBatch`.
- Portes : vitest ciblé (contrast, MyTargetToggle, EngagementSendEmail ×3, VivierExportCard, redirects) vert ; jest `mail-batch-sender` 11/11, `contacts.service` -t 4546.5|#3699|#4412|saveEmailDraft 37/37 ; tsc api 0 erreur, tsc web 0 erreur, `check-types:tests` api 0 erreur (exit 0).

## Questions

1. #4530.4 : relancer la recherche au clic contredit #4490 (26/10, garde `decouvrir-aucun-appel-sans-geste`). Lequel tient ?
2. Signature d'un message envoyé depuis une boîte désignée : celle du profil, sinon celle du fournisseur lue sur la boîte PAR DÉFAUT (comme le lot) — à corriger si la signature doit suivre la boîte.
3. Brouillon « Préparer un e-mail » : où poser le sélecteur (flux par personne en lot) ?
