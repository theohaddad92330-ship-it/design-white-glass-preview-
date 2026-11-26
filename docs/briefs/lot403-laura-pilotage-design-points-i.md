# Lot 403 — Laura, Pilotage, Design — points isolés (#4876, #4868, #4291, #4480)

Périmètre : apps/web/src/features/chat/view/ShareConversation.tsx, apps/web/src/features/chat/view/ExportConversation.tsx, apps/web/src/features/chat/view/chat-mise-en-page.test.ts

## Fait

- #4876 : sous 768 px, « Partager dans l'espace » et « Exporter » passent en icône nommée (libellé `sr-only`), cibles tactiles ≥ 44 px. Garde ajoutée dans `chat-mise-en-page.test.ts` (avec son cas NON). Garde #3769 (rangée `shrink-0`) : conservée, #3769 non modifié.

## Prouvé « déjà là », rien recodé

- #4291.4 : entrée de changelog `entries.ts:589`, libellés `labels.fr.ts:2766` / `labels.en.ts:2742`.
- #4291.8 / #4291.9 : `docs/registres/chantier-4291.md:15-16` (déjà là). #4291.1-3, .5-.7, .10-.11 : « livré », restent à voir en recette — l'issue ne se ferme pas.

## Ce que je ne fais pas

- #4868 : chantier (montée TanStack 1.170, ~15 appelants, dependabot) — hors lot, question.
- #4480 : aucun code à écrire, jeton Railway refusé (action de Louis).
- Aucune issue fermée.

## Décisions touchées

Garde #4686, #4700, #4702 : la ligne du bouton Exporter n’est touchée que dans sa mise en forme (libellé en span sr-only), le comportement de l’export est inchangé.
