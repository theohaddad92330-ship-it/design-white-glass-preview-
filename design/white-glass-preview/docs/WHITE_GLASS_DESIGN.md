# BellumAI — contrat visuel du cockpit White Glass

Ce cockpit est une prévisualisation. Les chiffres de « Groupe Sillage » sont des exemples datés du 25 novembre 2026 ; les écritures restent sur cet appareil. Le rendu ne doit jamais laisser croire qu'un CRM, un ATS ou une messagerie sont synchronisés.

## Source du produit

- `apps/web/src/styles/tokens.css` du monorepo BellumAI : fond `#f5f5f8`, cartes `#fff`, creux `#f1f2f6`, bord `#e5e6ee`, texte `#1c1c28` et `#5d5e70`. Violet `#5b3ee8` pour les actions et les états actifs.
- `packages/ui/src/components/sidebar.tsx` : rail déployé de 232 px. La démo doit conserver un menu parent « Ma journée » et ses sous-entrées, sans inventer un second rail.
- `packages/ui/src/glass-shell.ts` : flou sur la coque et les surfaces flottantes, pas sur chaque carte de données. Rayon 22 px pour la coque, 16 px pour la barre haute, 12 px pour les cartes, 8 px pour les contrôles.
- `apps/web/src/index.css` : pas de halo global, de dégradé systématique ni de titre coloré en violet.

## Lecture des références fournies

| Capture | Application pertinente dans BellumAI |
| --- | --- |
| `082310` | Pastilles de statut seulement quand l'état d'une action change sa lecture. |
| `082323` | Accent lumineux local sur une surface phare, jamais répété sur toutes les cartes. |
| `082329` | Une même grammaire de boutons, champs, icônes et espacements. |
| `082347` | Courbe principale en couches translucides, comparaison et filtres explicites. |
| `082358` | État actif compact dans le rail ; les sous-onglets Bellum restent en place. |
| `082415` | Liseré et reflet ponctuels sur les contrôles, avec fond suffisamment opaque pour lire le texte. |

## Vérifications avant chaque publication

1. À 1360 px, le rail n'écrase pas le contenu ; titres, données et carte sont lisibles sans dézoomer.
2. Une carte France → ville → BU → affaire conserve le contexte sélectionné. Les rôles n'ouvrent pas des vues auxquelles ils n'ont pas accès.
3. Les graphiques distinguent leurs séries, unités, dates et sources ; les volumes indépendants ne deviennent pas un taux de conversion implicite.
4. Les contrôles ouvrent une action vérifiable et la navigation replace l'utilisateur en haut de la nouvelle vue.
5. Un élément non alimenté montre sa provenance ou une saisie possible. Aucun nombre d'exemple n'est présenté comme une donnée synchronisée.
6. Tester Ma journée, agenda, les six sous-onglets Équipe, les quatre sections Pilotage et Laura, sur desktop et largeur réduite. Le thème sombre est un chantier distinct.
