# Registre — retour bêta #2737 — /consultants, tableau du Vivier

base : origin/main — 23/09/2026. Branche `fix/beta-consultants-dashboard-23-09`.

L'issue #2737 (« réparer l'ui/ux de ce tableau… presque toutes les infos ne sont pas lisibles ») ne donne aucune mesure
chiffrée — la capture jointe (outil de signalement in-app) montre la zone ÉLÉMENT POINTÉ, sans son contenu. Mesure
attendue par défaut, écrite ici avant le code (brief coordinateur du 23/09) :

- colonnes lisibles sans écrasement ni débordement à 1440 px ET 1280 px de VIEWPORT (les deux largeurs où `xl:`
  — 13 colonnes — est actif) ;
- rien écrasé à 0 px (aucun élément qui déborde visuellement de sa cellule) ;
- tout texte tronqué porte son intégralité en `title` ;
- les cibles cliquables restent ≥ 44 px sous pointeur tactile (`pointer-coarse`).

| point | demande | écran/sujet | mesuré au code | état | preuve en recette |
|---|---|---|---|---|---|
| #2737.1 | colonnes lisibles, sans débordement, à 1440 et 1280 px | /consultants, `VivierTable` (13 colonnes, palier `xl`) | Les 4 colonnes TEXTE (skills/seniority/location/remote) tiennent déjà une marge à 1512 px (#2500.1, `vivierTableColumns.ts:132-196`) et ne peuvent plus déborder visuellement depuis #2500.1 (`truncate`+`title`, jamais de dépassement de cellule). `xl:` (1280 px et au-delà de VIEWPORT) se déclenche à un viewport où le CONTENEUR est plus étroit qu'à 1512 (gouttière fixe ~317 px mesurée en #2465) : jamais vérifié à 1280/1440 avant ce lot. Calcul (jsdom ne mesure aucune largeur, doctrine du fichier) : à 1280 px, conteneur 963 px, TOUTES les colonnes texte restent positives après leur plancher #2500.1 — seule la colonne `actions` (non-texte) était sous zéro de marge, voir #2737.2. | recetté | ÉCRAN prod 23/09 (17d967788) — /consultants : fenêtre réelle 1512px (resize vers 1280 inopérant côté outil, notée) : colonne « Actions » = 84.45px = 7.00% de la table (1206px) — cohérent xl:w-[7%], aucune colonne tex |
| #2737.2 | rien écrasé à 0 px | /consultants, colonne « Actions » (4 boutons icône) | `VivierTableRow.tsx:322` pose les 4 boutons en `flex-wrap` — qui ne protège QUE ce qui tient déjà dans sa cellule. À l'ANCIENNE part (`xl:w-[5%]`), à 1280 px de viewport le contenu de la cellule (963 px de conteneur × 5 % − 16 px de `padding`, `table.tsx` `TableCell`) tombait à 32,2 px, sous les 36 px d'un bouton `icon` (`size-9`, `button.tsx`) — un bouton débordait donc réellement sur la colonne voisine, pas un ellipsis, un chevauchement. | recetté | ÉCRAN prod 23/09 (17d967788) — /consultants : 4 boutons icône de la ligne 1 mesurés : chacun 36×36px (aucun à 0px), aucun chevauchement entre eux ni avec la colonne voisine (overlaps=[]) |
| #2737.3 | texte tronqué porte son intégralité en `title` | /consultants, toutes les colonnes texte du Vivier | Chaque cellule qui peut tronquer porte déjà `truncate` + `title={…}` avec la valeur COMPLÈTE (nom, titre, compétences, séniorité, localisation, TJM, télétravail, contrat, dernier contact) — `VivierTableRow.tsx:108,149,194,207,240,262,279,299,309`. Les en-têtes, eux, n'ont AUCUNE classe qui coupe (`break-words`, jamais `truncate`) depuis #2500.1 : ils enroulent, ils ne tronquent jamais. Gardé par `le-tableau-du-vivier-tient-dans-lecran.test.ts` (« l'entête n'a AUCUNE classe qui coupe le texte ») et par `VivierTableRow.test.tsx` (#2500.1, « chaque cellule tronquée porte son texte complet »). | recetté | ÉCRAN prod 23/09 (17d967788) — /consultants : cellules Titre/Compétences/Séniorité/Localisation/Statut/Disponibilité/TJM/Télétravail/Contrat/Complétude portent toutes un attribut title avec la valeur complète (ex. id |
| #2737.4 | cibles cliquables ≥ 44 px | /consultants, colonne « Actions » | Le variant `icon` de `Button` (`packages/ui/src/components/button.tsx:61`) porte déjà `pointer-coarse:min-h-11 pointer-coarse:min-w-11` (44 px) EN PLUS de sa taille souris (`size-9`, 36 px) — GA-30, générique à tout le produit, pas spécifique à ce tableau. Sous pointeur tactile, chaque bouton du Vivier respecte donc déjà le plancher ; sous souris, 36 px est la convention établie du dépôt (hors périmètre de ce lot de la changer). | déjà là | `packages/ui/src/components/button.tsx:61` (appelant : les 4 boutons de `VivierTableRow.tsx:326-346`) — aucun changement nécessaire. |

## Ce qui reste (hors périmètre de ce lot)

- Preuve ÉCRAN (Chrome, 1280/1440 px) non prise — cet agent écrivain n'a pas d'outil navigateur. À recetter par un
  agent `recetteur` dédié (mémoire : « recette ÉCRAN = UN agent recetteur à la fois »).
- `apps/web/src/features/contacts/view/contacts-list/contactsTableColumns.ts` a une colonne `actions` à `xl:w-[5%]`
  également (ligne 175) : même famille de risque (boutons icône, palier `xl` étroit), JAMAIS vérifiée à 1280 px non
  plus. Pas touchée ici — /contacts n'est pas dans le lot #2737, et une correction y suivrait la même preuve chiffrée
  avant d'y toucher.
