# Recette humaine du cockpit missions — protocole (#2408.82, #2408.85)

## Pourquoi ce document existe

Deux points du registre `#2408` (`.claude/notes/registre-2026-09-17-lau-122-2408.md`,
zone « Design ») ne se livrent PAS en code : **#2408.82** (« table dense ») et
la moitié de **#2408.85** (« couleur réservée aux exceptions ») qui porte sur
l'écran ENTIER — au-delà de la cellule Risques, déjà gardée par du code (voir
plus bas). Les deux demandent un œil humain devant le rendu réel — aucun test
`jsdom` ne peut mesurer une densité perçue ou juger qu'une teinte décorative
s'est glissée quelque part sur l'écran (mémoire : « preuve ÉCRAN ne se
remplace pas par un grep »). Même discipline que
`docs/accessibilite-recette-humaine.md` : ce protocole reste `retenu` au
registre jusqu'à ce qu'une session réelle soit consignée ci-dessous.

## Ce qui est DÉJÀ couvert par le code — à ne pas re-vérifier à la main

Avant de recetter, vérifier que ces preuves sont vertes
(`pnpm --filter @bellum/web exec vitest run src/features/missions src/architecture`) :

- **GA-248** (`no-hardcoded-colors.test.ts`) — aucune couleur hexadécimale en
  dur dans le produit, parité claire/sombre garantie par les jetons CSS.
- **`recette-lau-final-122.test.ts`, scénario 6** — la cellule Risques ne
  peint (`variant="warning"`) QUE quand `risks` n'est pas vide ; une mission
  sans risque reçoit un `<Text>` nu (`MissionRisks.tsx`).
- **#1804 et son résiduel** (`MissionsTable.test.tsx`) — chaque colonne
  affichée par défaut porte une borne de largeur RÉELLE, en `rem`, et une
  pastille qui déborderait sa cellule se clippe proprement (`ClippedBadge`)
  plutôt que de peindre par-dessus la colonne voisine. C'est une contrainte
  STRUCTURELLE de densité : une cellule ne peut pas s'étaler.
- La liste est un `<table>` (`MissionsTable.tsx`), jamais des cartes
  espacées — structurel, cf. #2408.83/.86 du même registre (« déjà là »).

Le protocole ci-dessous porte donc sur ce que SEUL un humain peut juger : la
densité PERÇUE d'une vraie page rendue, et l'absence de toute teinte
décorative en dehors des cellules déjà gardées par le code.

## Champ de la recette

`/missions`, les deux lentilles (« En cours » et « Facturation »), sur un
espace avec au moins 40 missions actives couvrant les six risques calculés
(`missionRiskSchema`) et les huit paliers de reconduction
(`RENEWAL_WINDOWS_IN_URGENCY_ORDER`).

## Protocole par axe

### 1. Densité (#2408.82)

1. Ouvrir `/missions` sur un écran desktop standard (1440×900), zoom 100 %.
2. Compter les lignes visibles SANS défiler. Comparer à un tableau de
   référence du produit (ex. `/accounts`) : la ligne missions doit être AUSSI
   compacte, jamais plus aérée « pour faire propre ».
3. Vérifier qu'aucune cellule ne porte de padding vertical généreux qui
   n'existe pas ailleurs dans le produit — un réglage de densité vit à un seul
   endroit (GA-26) : si `/missions` semble plus aérée que `/accounts`, chercher
   la classe qui diverge plutôt que de la dupliquer.
4. Refaire sur mobile (`ResponsiveTable`, cartes) : la densité s'y JUGE
   différemment (une carte par mission), mais aucune carte ne doit être vide
   à moitié — chaque champ affiché doit porter une valeur ou son absence
   nommée (jamais un blanc).

### 2. Couleur réservée aux exceptions (#2408.85)

1. Charger `/missions` avec un mélange de missions SANS aucun risque et de
   missions portant 1 à 6 risques simultanés.
2. Sur une ligne SANS risque : aucune teinte (fond, texte, bordure) ne doit
   se distinguer visuellement d'une ligne voisine — statut, nature de
   contrat, échéance, marge : tout doit rester dans la palette neutre
   (texte primaire/secondaire/muted), jamais un vert/orange/rouge décoratif.
3. Sur une ligne AVEC risque : seule la pastille de risque (et, si elle
   s'applique, la pastille « Personne d'affecté ») doit porter une teinte.
   Le reste de la ligne reste neutre — une mission à risque ne doit pas
   « rougir » en entier.
4. Refaire en thème clair ET en thème sombre (D79) : la règle « couleur =
   exception » doit tenir dans les deux, avec un contraste AA.
5. Noter toute teinte décorative trouvée (dégradé de fond, bordure colorée
   sans risque associé) comme un défaut, avec la capture d'écran et la
   colonne concernée.

## Modèle de compte-rendu

Copier ce bloc, une ligne par session, sous cette section — jamais réécrire
les lignes précédentes :

| date | testeur | résolution + zoom | thème | axe | verdict | détail / issue ouverte |
| ---- | ------- | ----------------- | ----- | --- | ------- | ---------------------- |

## Journal des sessions

_Aucune session consignée à ce jour — #2408.82 et #2408.85 restent `retenu`
tant que cette section est vide._
