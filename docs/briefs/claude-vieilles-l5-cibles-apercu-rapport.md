# Rapport — vieilles L5 : Mes cibles, aperçu avant création (#2157)

Branche `claude/vieilles-l5-cibles-apercu`. Dialogue : `CreateTargetListFromSelectionDialog.tsx` (Comptes : `AccountContent.tsx:718`) ;
Contacts passe par le MÊME dialogue (`CreateTargetListDialog.tsx`, ancien hook `useCreateTargetListFromContacts` supprimé).

- 2157.17 écartés → livré (f1b1327c) : prop `excluded`, nommés avec motif ; Contacts y met les désinscrits. Aucune ligne si rien d'écarté.
- 2157.18 données manquantes → livré (f1b1327c) : contacts sans e-mail nommés ; e-mail inconnu (`undefined`) jamais dit « sans e-mail ».
- 2157.19 coût éventuel → non fait : c132 (crédits implicites, aucun chiffre côté client) ; cette création ne lance aucun enrichissement, rien à annoncer.
- 2157.21 retirer → livré (f1b1327c) : bouton « Retirer X » par ligne, rien écrit avant validation ; tout retiré = création désactivée.
- 2157.22 owner → livré (f1b1327c) : sélecteur des membres de l'espace ; refus d'un owner hors espace PROUVÉ côté API (191358b4, garde `assertOwner` déjà là).
- 2157.23 partager → livré (f1b1327c) : visibilité espace/privée (champ déjà au contrat) ; non choisi = rien envoyé, défauts serveur.
- 2157.24 liste existante → livré (f1b1327c) : choix « Nouvelle cible / liste existante » ; aucune liste créée, fiches déjà dedans sautées et dites.
- 2157.37 / .41 doublon → déjà là (`CreateTargetListFromSelectionDialog.tsx`, message `duplicatesNamed`, #2157.42) ; test ajouté : deux listes nommées, création jamais bloquée.
- 2157.57 aperçu masse → livré pour Comptes et Contacts ; recherche enregistrée → NON FAIT (voir questions).

Tests : jest `target-lists.service.spec.ts` 27 verts ; vitest `CreateTargetListFromSelectionDialog.test.tsx` (16, 6 rouges→verts), `contacts-list/CreateTargetListDialog.test.tsx`, `ContactsIntro.test.tsx` verts.
`tsc` web non concluant : contracts non buildé (TS6305 en cascade, y compris sur fichiers non touchés) ; build interdit en VM.
Compagnons : FR+EN `targets.json`/`contacts.json` ; CHANGELOG + classification démo (`DEMO_CIBLES_APERCU_COVERAGE`, seedé : les listes semées partagent leurs premiers comptes) dans le fragment `changes/vieilles-l5-cibles-apercu.yml` (fichiers chauds : à appliquer par `tools/issues/fusion_fragments.py`, validé à blanc). Aucun nouveau semis nécessaire.

Questions : (1) Recherche enregistrée (`Discover.tsx:1120`, `useCreateTargetListFromSavedSearch`) : la recherche part AVANT la création et ses candidats ne sont pas encore des comptes canoniques, donc l'aperçu demande un flux en deux temps (chercher → aperçu → verser) et un dialogue propre. Je le fais en lot dédié ?
(2) `pnpm ci:local` non lancé (contracts non buildé) : à passer par le fil/CI.
SHA de tête : voir `git log` de la branche (commit du rapport ci-après).
