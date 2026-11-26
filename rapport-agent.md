# Rapport intégrateur — vague 7 (21/09/2026)

Branche : integration-vague-7-21-09, depuis origin/main (1782d157f)

## État

En cours — démarrage. Branches à absorber dans l'ordre :

1. chore/quinze-preuves-de-code-21-09 (1 commit)
2. feat/quatre-points-qui-ferment-21-09 (5)
3. feat/le-contenu-dune-opportunite-21-09 (6)
4. feat/la-declaration-se-nomme-partout-21-09 (7)
5. fix/un-reglage-vit-a-un-seul-endroit-21-09 (4) — vérifié : integration-vague-3-21-09 est bien ancêtre de main, pas de duplication.

## PR

PR #2685 (brouillon) ouverte : https://github.com/Bellum-AI/belllum-monorepo/pull/2685
Tête : integration-vague-7-21-09 @ 637d2f65f. CI run 35611003904 démarré (pending).

## Branches absorbées

1. chore/quinze-preuves-de-code-21-09 — commit c4ad31b13, poussé.
2. feat/quatre-points-qui-ferment-21-09 — commit 61798b2d7, poussé.
3. feat/le-contenu-dune-opportunite-21-09 — commit 8e4faada4, poussé.
4. feat/la-declaration-se-nomme-partout-21-09 — commit 833206189, poussé.
5. fix/un-reglage-vit-a-un-seul-endroit-21-09 — commit 637d2f65f, poussé.

Les 5 branches du brief initial sont absorbées. PR ouverte comme demandé par le coordinateur
avant de continuer sur les branches ajoutées en cours de route (6-12 ci-dessous).

## Défaut réel trouvé (pas encore corrigé)

Migration `apps/api/src/migrations/1789995163283-AccountPartnerDeclaredBy.ts` (branche 4) porte
un horodatage antérieur à 234 autres migrations déjà présentes — elle n'est PAS la plus grande
de la série alors qu'elle vient d'être livrée aujourd'hui (21/09). `migrations.spec.ts` actuel ne
le détecte pas (il vérifie unicité + non-rond, pas le rang). La garde GA-372 de la branche 9
(`fix/une-migration-neuve-est-la-plus-grande-21-09`) est FAITE pour ça. Plan : merger 9, laisser
la garde rougir dessus (preuve), puis corriger l'horodatage en commit séparé.

## Branches ajoutées par le coordinateur en cours de route (au brief initial il n'y en avait que 5)

6. chore/la-voie-linkedin-21-09 (1) — registre seulement.
7. feat/une-relation-dit-ce-quelle-observe-21-09 (1) — esn-on-accounts-merge.ts + spec.
8. fix/une-capacite-de-plus-sur-le-meme-segment-21-09 (#2655.2) — attention : pas de Object.freeze sur l'époque dérivée (délibéré, 7 tests API le prouvent) ; deux tests homonymes "borne la requête SQL" dans segment-catchup.service.spec.ts à ne pas fusionner en un.
9. fix/une-migration-neuve-est-la-plus-grande-21-09 (ddd1677df) — garde GA-372 (#2684), 2 fichiers (spec + README migrations).
10. chore/preuves-de-chaine-suite-21-09 (2, registres seulement) — 14 points, dont une fausse recette redescendue (#2616.1).

## Refusion de origin/main en cours de route

Confirmé main = 8b3fe6657 (vagues 3+6 atterries) pendant que j'étais en vol sur la branche 3.
Fusionné origin/main dans l'intégration (commit 29715d7af, poussé) — conflits sur 4 registres
(.claude/notes) + les 3 fichiers changelog, réconciliés LIGNE PAR LIGNE (dernière édition réelle
gagne, jamais le fichier entier ; les deux côtés gardés si l'info est complémentaire).
Point notable gardé TEL QUEL sans arbitrage de ma part : #2616.2 (exclusion employeurs publics du
preset Découvrir) — une recette ÉCRAN dit 17/17 privés, une lecture de code dit qu'aucun filtre
n'existe ; les deux affirmations sont conservées avec une note expliquant qu'elles peuvent
coexister (échantillon sans employeur public plutôt que filtre actif réel).

## Conflits

- Branche 2 : fusion auto sur registre-2026-09-20-onboarding-et-divers.md, sans marqueur.
- Branche 3 : conflit réel sur les 3 fichiers changelog (entries.ts, labels.en.ts, labels.fr.ts) — les deux entrées gardées, accolade fermante manquante réinsérée (artefact de recomposition diff3, pas un vrai désaccord de contenu).

## Défauts corrigés

(aucun défaut de code réel trouvé pour l'instant — uniquement des étapes d'environnement : pnpm install absent, packages/contracts et packages/utils non buildés dans ce worktree neuf, corrigés par `pnpm exec turbo run build --filter='./packages/*'`)

## Portes

- pnpm install : fait.
- Build complet des packages (`pnpm exec turbo run build --filter='./packages/*'`) : fait, nécessaire pour que @bellum/contracts et @bellum/utils résolvent sous vitest.
- Tests ciblés vus jusqu'ici : api/projects (267 verts), web/projects (587 verts), contracts/changelog (36 verts).
- Portes globales (architecture, demo-coverage) pas encore lancées — prévues après les fusions restantes.

## Questions

(aucune pour l'instant)
