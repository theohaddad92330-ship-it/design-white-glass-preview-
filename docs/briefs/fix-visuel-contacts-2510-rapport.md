# Rapport — fix-visuel-contacts-2510

Branche `claude/fix-visuel-contacts-2510` (base `origin/main`). Pas de PR. Pas de navigateur : jsdom ne mesure aucune largeur.
Les tests CALCULENT ou LISENT le mécanisme (les chiffres « AVANT » sont ceux mesurés en prod le 25/10, `6bc31eb5e9`).

| Point                              | Commit   | AVANT                                                                                 | APRÈS (lu par le test)                                                                                                                                                     |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 `/contacts` tableau (#4503.3)    | f13778d6 | plancher `xl` 71 rem = 1136 px dans 998 px → 138 px de débord, Origine hors champ     | plancher 62 rem = 992 px ≤ 998 ; parts xl 24/16/18/20/22 → 238 / 159 / 179 / 198 / 218 px ; e-mail 179 ≥ 176 px ; Origine 218 ≥ 132 px                                     |
| 2 `/contacts` Relation (#4503.3)   | f16f8e5f | badge seul, rien sans responsable                                                     | « Non attribué » (`contact-row-owner-none`) si `assigned_to` nul ; responsable nommé sinon ; `assigned_to` non résolu → rien (pas de faux « non attribué »)                |
| 3 `/contacts/:id` e-mail (#4522.3) | b56dd71b | `break-words` : largeur minimale du mot inchangée → sortie de 21,4 px                 | `[overflow-wrap:anywhere]` + `max-w-full` + ligne `w-full` : repli multi-lignes ; texte entier dans le DOM ; aucune classe de troncature/masquage sur la chaîne d'ancêtres |
| 4 `/signals` recherche (#4503)     | 7198899e | champ `lg:w-64` fixe 255 px dans une boîte `min-w-0` écrasée → 80 px de chevauchement | champ `w-full lg:w-full` dans sa boîte, boîte `min-w-40` + rangée `flex-wrap` → 0 px de débord par construction                                                            |

Le point 4 est sur `PistesBoard` (monté sur `/signals`), dossier `features/projects/view`, pas `signals-library`.

## Tests qui disent NON

- 1 : `contactsTableColumns.layout.test.ts` (nouveau) ; garde GA-349 ajustée (parts xl 17→18 / 25→24). Rougit avec l'ancien plancher 71 rem.
- 2 : 3 cas dans `ContactTableRow.test.tsx`.
- 3 : `ContactKeyInfo.email-overflow.test.tsx` — rouge sur l'ancien code (vérifié).
- 4 : `PistesBoard.search-layout.test.tsx` — 2 rouges sur l'ancien code (vérifié).

## Limites — à confirmer dans Chrome

- Points 3 et 4 : le test lit les classes (le mécanisme), pas des pixels. À reprendre en recette à 1280 et 1512 px (démo comprise pour le 4 : même composant, pas de donnée).
- Point 1 : le seul chiffre non calculé est le conteneur (998 px à 1280, relevé prod). Plancher `xl` seulement ; colonne e-mail 12 → 11 rem (176 px) : l'adresse se coupe après « @ »/« . ».
- **Non traité** : les planchers `md` (48 rem) et `lg` (64 rem) de la même table n'ont pas été mesurés mais dépassent très probablement le conteneur sous 1280 px (à 1024 px, conteneur ≈ 740 px < 1024). Hors brief ; à mesurer.
- Le menu « … » : dans la colonne Origine, désormais dans le champ (218 px) ; non revérifié à l'écran.
- Aucune route, aucun menu, aucune permission, aucune démo touchés. Libellé neuf `table.ownerNone` en fr et en.
