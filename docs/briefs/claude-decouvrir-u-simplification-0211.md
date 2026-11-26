# Lot U — Découvrir simplifié : une barre d'onglets, filtres derrière un bouton, moins de texte, actions en menu

Plafond : 300 tours. Brief autonome. Web seulement (+ démo, i18n).

## Compris (capture prod Louis 02/11/2026, `/discover?city=Lille&cityRadiusKm=25`)

De haut en bas, l'écran empile aujourd'hui :

1. la barre de répartition (secteurs NAF + « Par taille GC 1 TPE 8 »), toujours dépliée ;
2. une rangée de pilules « Comptes (25) | Autres acteurs » (lot P, `OtherActorsTab.tsx`) ;
3. une SECONDE rangée d'onglets « Comptes 25 · Contacts · Besoins et signaux 4 · Partenaires · Liste d'appels 25 ». « Comptes » apparaît deux fois, et « Partenaires » recoupe « Autres acteurs » ;
4. la phrase « Louis, ici tu vois des entreprises à travailler : ouvre une fiche… » ;
5. le titre « Ton marché » et le sous-titre « Une raison de les regarder. Le détail au clic. » ;
6. les actions : Enregistrer, Exporter, Comptes comparables, Expliquer la méthode, et 3 boutons de vue (liste, colonnes, radar) ;
7. le bandeau repliable « Ce qu'il faut savoir sur cette recherche · 6 points » ;
8. la barre : « Filtrer les résultats affichés… », « Trier par [Taille (effectif)] », « 25 entreprises affichées », « Plus de filtres », case « Cette page » ;
9. une ligne de filtres à plat : Famille, Classe d'accès, « Masquer les comptes dont je suis responsable », « Masquer les comptes déjà clients ou déjà analysés dans l'espace », Famille de rôles, Nature du besoin, « Preuve directe uniquement ».

## Décisions Louis (QCM 02/11/2026) — la cible

- **Onglets** : UNE seule barre — `Comptes N · Autres acteurs N · Contacts · Besoins et signaux N · Liste d'appels N`. « Partenaires » est FUSIONNÉ dans « Autres acteurs » : partenaires déclarés de l'espace + ESN + cabinets + intérim, distingués par les pastilles de type déjà livrées. La rangée de pilules (2) disparaît. Une URL ou un lien existant vers l'onglet partenaires (`tab=partners` ou équivalent : `git grep` le nom réel) ouvre « Autres acteurs » avec la pastille Partenaires active, sans lien mort.
- **Filtres** : restent visibles le champ « Filtrer… », « Trier par », le compteur et UN bouton « Filtres · n » (n = nombre de filtres actifs, rien si 0 — jamais « 0 »). Ce bouton ouvre un panneau qui porte TOUT le reste : les filtres de (9), « Plus de filtres » et « Cette page » si elle est encore utile. Il réutilise le panneau « Tous les filtres » s'il existe (un réglage vit à UN endroit, GA-26 : jamais deux panneaux de filtres). Chaque filtre actif apparaît en puce retirable sous la barre.
- **Bandeaux** :
  - (4) la phrase d'intro est retirée ;
  - (5) « Ton marché » et son sous-titre sont retirés ;
  - (1) la répartition est REPLIÉE par défaut sur une ligne « Répartition · N secteurs », dépliable, l'état mémorisé comme les autres préférences d'écran ;
  - (7) « Ce qu'il faut savoir » devient une icône ⓘ nommée (a11y, GA-32) à côté du compteur, qui ouvre les mêmes points.
- **Actions** : Enregistrer et Exporter restent visibles. « Comptes comparables » et « Expliquer la méthode » passent dans un menu ⋯ (nommé, tabulable). Vues : liste et colonnes visibles ; le 3e mode (radar) passe dans ⋯.

## Je fais

1. Les 4 décisions ci-dessus, sur desktop ET mobile (390 px : la barre d'onglets défile horizontalement, le panneau de filtres s'ouvre en feuille basse ; règles GA-28/29/30, `dvh`).
2. Aucune fonctionnalité perdue : chaque filtre, action ou vue reste joignable. Test qui liste les contrôles d'avant et prouve que chacun est atteignable (barre, panneau ou menu ⋯).
3. Gardes : GA-26 (rien deux fois — test qui échoue si « Comptes » est rendu dans deux barres ou s'il existe deux panneaux de filtres), GA-32/35 (icône nommée, tabulable), GA-18/19 (aucun « 0 » sur le bouton Filtres ni sur les onglets sans mesure).
4. Démo : l'écran démo montre la nouvelle forme ; « Autres acteurs » contient au moins un partenaire déclaré ET une ESN (craft rule 9, `demo-coverage.ts`).
5. i18n fr/en, clair/sombre, tests web ciblés (une ligne `tests-node.generated.ts` par nouveau test).

## Je ne fais PAS

Aucune logique de classement, de tri, de recherche ni d'IA (le lot T, en vol, touche le classement ESN, Decathlon et le tri). Aucun changement de contenu des filtres : on DÉPLACE, on ne retire aucun critère. Pas les paliers de zone ni « Ma cible » (lot S, PR #5125).

## Conflits attendus

Les lots R (#5127), S (#5125) et T (en vol) touchent `Discover.tsx`. Avant d'ouvrir la PR : `git fetch origin && git merge origin/main`, résoudre en gardant les deux côtés, relancer les tests ciblés.

Périmètre : `apps/web/src/features/discover/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/architecture/*`, `apps/api/src/modules/demo/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` (contient le lot Q #5121). Push `git push origin HEAD:refs/heads/claude/decouvrir-u-simplification-0211` (push SIMPLE ; pre-push lancé en run_in_background puis attendu ; si check-types exige les dépendances : `pnpm --filter @bellum/contracts build`). Après chaque push, vérifier que `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify` / `--force`, jamais `.github/workflows`.
- PUSH APRÈS CHAQUE POINT VERT. PR PRÊTE vers main dès le premier point poussé. La PR liste honnêtement ce qui n'est PAS livré. Un point n'est livré que si son APPELANT prod est cité fichier:ligne.
- Plafond 300 tours ; à 240 : commit, push, PR, rapport, stop. Tests CIBLÉS (≤ 5 specs, pytest ciblé) ; Prettier 3.9.10 ; tout nouveau test web ⇒ une ligne dans `apps/web/src/test/tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; jamais un SIREN deviné ; aucune source ni fournisseur nommé à l'écran ; une absence n'est jamais « 0 » ; démo seedée (craft rule 9, `demo-coverage.ts`).
- Rapport ≤ 12 lignes.
