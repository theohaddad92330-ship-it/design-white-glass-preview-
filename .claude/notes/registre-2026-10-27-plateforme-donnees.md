# Registre — lot PLATEFORME-DONNEES (vague L, 27/10/2026)

| Point | État | Preuve en recette / appelant |
| --- | --- | --- |
| #4629.1 cause : le trigger `handle_new_user_credits` pose `decouverte` + `trial_end = now()` (migration `NoFreeTrial`, décision Louis 02/09) → `trial_expired` vrai dès la seconde zéro | livré | `SubscribePromoBanner.tsx` (monté par le shell) |
| #4629.2 le bandeau ne dit plus « Ton essai est terminé » pour un espace neuf (rien consommé, rien payé) : « Ton espace attend sa licence » | livré | Espace neuf → bandeau `data-never-started`, sans « essai terminé » ; un espace qui a consommé garde l'ancien texte |
| #4605.1–.7 | déjà là | commits b10ed2a1 (`index.css` body/#app-shell sous `--impersonation-banner-height`), 91b36481 (`MyDataTabs.tsx`, `ImportsPanel.tsx`, `VivierExportCard.tsx`, `SettingsTabs.tsx`, `theme-init.js`) ; preuve attendue : incarné, onglets Exports/Imports cliquables, même largeur, ≥ 44 px, thème sombre survit à `/login` |
| #4595 | déjà là | `apps/dashboard-manager/src/app/produit/page.tsx:757` (`derniereValeurConnue`, « mesure arrêtée le 25/10/2026 », jamais 0) + test `page.test.tsx:512` |
| #4573 | déjà là | `ContextPackOriginalPreview.tsx` ← `UniversalImportHistory.tsx`/`ImportsHistoryBlock.tsx` ; REFUS inter-espaces : `context-pack.controller.spec.ts:260`, `context-pack-originals.service.spec.ts:155,165` |
| #4426 | déjà là | zone `ContextPackDropzone.tsx`, pack reconnaissable dans l'historique (41c4b482) ; reste une preuve humaine (dépôt = écriture) |
| #4432 | déjà là / écarté pour .4 | .2 et .3 prouvés en recette le 25/10 ; .4 bloqué par #4556 (démo sans dossier cadré) hors périmètre du lot ; #4642 (même tuyau `rankingBatchItems`) à ne pas mener en parallèle |
| #4548 | déjà là | décision écrite `mission.ts` (neuf statuts, `not_due`/`received` non ajoutés) + `timesheet-statuses-decision.test.ts` ; aucun cinquième statut d'encaissement |

## Droits (lot sensible)
Ce lot ne touche aucune route ni aucun menu : un seul bandeau d'affichage. Voit : tout utilisateur authentifié d'un espace sans licence. Modifie : personne (le bandeau n'écrit rien). REFUSÉ : l'accès serveur reste décidé par `TRIAL_ACTIVE_SQL` / le quota, inchangé. Les routes d'aperçu de pack (#4573) ont leur test de refus (liste ci-dessus).

## Arbitrage
Contradiction nommée : #4629 dit « un espace neuf n'a pas fini son essai » ; la décision du 02/09 le verrouille dès la seconde zéro. J'ai gardé la décision et corrigé le TEXTE.
