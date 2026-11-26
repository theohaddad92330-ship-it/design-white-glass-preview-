# Lot final — Parcours, puis les trois écrans « design final »

Colle ce texte après un `/clear`. Repartir de `origin/main` **frais**
(`git fetch origin && git checkout -b <nom> origin/main`).

---

## L'état, au 05/09/2026

`origin/main` = `e302f9eac`. Tout est mergé et vérifié en production.
**20 issues bêta closes aujourd'hui, 9 restent.** Aucune PR en vol.

Les 9 restantes sont **deux chantiers de nature différente**. Ne pas les traiter
en un seul lot : le premier est de l'architecture, le second du rendu, et ils ne
se recettent pas pareil.

---

## PR 1 — PARCOURS : le moteur n'a aucun appelant (#1503, puis #1505, #1506, #1507)

### Le fait mesuré, à ne pas re-mesurer

`ChainsService` **n'a aucun appelant en dehors de son propre module**. Les seuls
fichiers qui le nomment sont son contrôleur, son module et son test. Aucun
service métier ne le touche — ni la création d'un besoin, ni le lancement d'un
matching, ni une soumission, ni le démarrage d'une mission.

Conséquence visible en prod : « Dossiers suivis **0** », « 0 dossier en cours »
sur les sept parcours, « Étape où l'on attend le plus : **Non mesuré** ».

### La décision de Louis, déjà prise — ne pas la re-poser

> « fais que tout soit branché »

et, dans #1503, sa propre formulation :

> « Les objets métier existants doivent rester les sources de vérité. Le moteur
> Parcours doit uniquement projeter leur état transverse. »

**C'est le modèle DÉRIVÉ (B), pas des déclencheurs (A).** J'ai recommandé B dans
l'issue et Louis ne l'a pas contredit. B supprime « Démarrer un parcours » et
`POST chains/runs/:id/advance` : il n'y a plus rien à avancer à la main.

⚠️ A (déclencher des lignes) fabrique deux vérités sur le même dossier — son état
réel, et ce que la ligne croit. Elles divergent au premier événement raté : un
besoin passé en « gagné » par une correction manuelle laisse un parcours bloqué
au matching, pour toujours.

### Ce qui reste à trancher — poser la question à Louis dans #1503

1. **Que deviennent les parcours démarrés à la main ?** Ils existent en base. En
   B ils n'ont plus de sens : archiver, ou supprimer ?
2. **Les sept parcours restent-ils sept ?** En B, une étape doit correspondre à
   un fait LISIBLE sur un objet. Celles qui n'en ont pas disparaissent.

### Le travail

Les étapes du catalogue sont aujourd'hui des **phrases** (« Compte détecté »,
« Analyse lancée », « Signaux relevés »), pas des états machine. Il faut donc,
par parcours, écrire la fonction pure `positionOf(subject) → position` qui lit
l'objet, plus la requête qui trouve les sujets du parcours.

Fichiers : `apps/api/src/modules/chains/chain-catalog.ts` (7 chaînes),
`chains.service.ts` (`start`/`advance`/`board`), `packages/contracts/src/schemas/chain.ts`.

⚠️ **NE PAS livrer une demi-dérivation.** Créer les runs sans dériver la position
remplit le tableau de dossiers tous coincés à l'étape 1 : ça a l'air de marcher
et ça ne dit rien. C'est exactement le motif « compteur juste, filtre faux ».

⚠️ #1505 (bloc contextuel sur les fiches Besoin / Projet / Mission) et #1506
(remontée dans « Aujourd'hui » + outil Laura) **ne se livrent qu'APRÈS** : sans
état, ils poseraient un encart vide sur trois écrans quotidiens, et feraient dire
« aucun blocage » tous les matins — une affirmation fausse qu'on croit.

De #1507, déjà livré et vérifié : les étapes portent leur **nom** (plus de
numéros), leur compteur, et « Non mesuré » plutôt que « 0 jour ». Reste le flow
horizontal avec ses états — et il attend #1503 pour la même raison.

---

## PR 2 — LES TROIS ÉCRANS « DESIGN FINAL » (#1417, #1396, #1440 — et #1472, #1498)

### ⚠️ Les maquettes SONT dans le dépôt

Elles ont été cherchées deux fois et déclarées absentes. Elles sont là,
gitignorées :

- `agent_docs/sources/dossier-26-aout/images-produit-cible/` — **17 écrans**
  (`11-comptes-lentille-delivery.png` pour #1417, `17-finance-v7.png` pour le
  langage de tableau de bord de #1440) ;
- `agent_docs/sources/jeudi-27-aout/` — six vues d'organigramme ;
- `agent_docs/ce-qui-nexiste-que-dans-le-drive-2026-09-01.md` — les 5 seuils
  chiffrés qui ne vivent que sur les images, et les **2 écrans annoncés jamais
  reçus** (19 déclarés, 17 livrés).

Aucun connecteur Google Drive n'est branché dans ces sessions. Chercher dans
`agent_docs/sources/` marche ; chercher dans le Drive est impossible.

### Le langage visuel qu'elles fixent (lu le 05/09)

Une ligne est une **carte** blanche, pas une ligne de tableau : coins arrondis,
bordure fine, un espace entre les cartes. Logo **40 px** dans un conteneur
arrondi. Nom **16 px semibold**, secteur/SIREN **13 px gris**. Chaque colonne =
**étiquette 12-13 px grise au-dessus d'une valeur 18-20 px semibold**, avec sa
variation en dessous. États en **pastilles à fond teinté** (vert / ambre /
rouge), le rouge réservé à un vrai problème. **Bandeau de six indicateurs** en
tête, chacun avec son icône dans un carré teinté. Chevron d'ouverture à droite.

### ⚠️ Ce qui ne se livre PAS au littéral, et la raison

- **Aucune couleur en dur** (`#FAFAFC`, `#E8E8EE`, `#6B6B76`, `#5B3EF5`) : elle
  ne suit pas le thème, et l'écran existe en clair ET en sombre. C'est le défaut
  qui a touché 149 endroits en août, et il ne se voit qu'en basculant le thème.
- **13, 15, 26, 28 px n'existent pas** : l'échelle est 12 · 14 · 16 · 18 · 20 ·
  24 · 30 · 36 (D80, 23/08). GA-31 est un INTERDIT, pas un cliquet.
- L'intention passe par les jetons ; c'est l'écriture qui change.

### Le reste de #1498 et #1440

Le point encore ouvert de #1498 est le **déplacement de blocs** que #1440 liste
(Rituels → Équipe, Configuration des automatisations → Automatisations,
« D'où viennent les chiffres » → un tiroir « Sources & méthode »).

⚠️ Déplacer un bloc n'est **pas** un geste de mise en page : l'écran d'accueil
gagne une responsabilité, ses tests changent, et les liens qui pointaient vers
Pilotage cessent de trouver ce qu'ils annonçaient. Fait à la va-vite, ça produit
trois écrans à moitié déménagés — pire que l'écran long d'aujourd'hui.

Un point de #1440 à traiter comme un **bug** s'il se vérifie : « chaque KPI doit
ouvrir source, période, dénominateur, dernière mise à jour ». C'est déjà la règle
du produit ; si un chiffre de Pilotage n'ouvre pas là-dessus, c'est un défaut.

---

## Les décisions déjà tranchées — NE PAS les re-poser

- **Laura peut lancer une analyse** (#1489, livré) : questions d'abord, « go »
  possible sans avoir tout répondu, une entreprise à la fois. L'ordre est tenu
  par un jeton serveur, pas par le prompt.
- **« Modifier » une écriture** (#1498, livré) = une demande NEUVE figée,
  l'ancienne passe en `superseded` — ni approuvée, ni refusée.
- **L'ancienne valeur d'un diff est FIGÉE** avec le reste, jamais relue à
  l'ouverture. Inconnue ⇒ rien d'écrit.
- **Cadence personnalisée** (#1510, livré) : le moteur acceptait déjà les étapes
  libres, plafond 12 au contrat.
- **Filtres contacts nommés, pas repliés en menus** : un menu fermé cacherait les
  compteurs, qui sont la moitié de l'information.
- **Aucun nom d'éditeur côté app**, sauf Réglages › Intégrations.

---

## Les pièges payés le 05/09 — ils se repaient sinon

1. **Suites API et web en parallèle ⇒ SIGABRT (exit 134)**, sans aucun test
   rouge. Les lancer l'une APRÈS l'autre.
2. **Le web lit le `dist/` des contracts** : après toute modif de
   `packages/contracts`, `npm run build` dans le paquet AVANT le typecheck web.
3. **Les tests IA** exigent le venv 3.13 (`/tmp/venv13/bin/python`) — le python
   système ne construit pas `pydantic-core`. Voir la fiche mémoire.
4. **`expect(x, 'message')` n'existe pas en jest** (c'est vitest). Le message
   passe par le libellé du test.
5. **`bellum_api` est importé LOCALEMENT** dans `execute_chat_tool` : le nommer
   dans une nouvelle branche sans l'importer en fait une variable non assignée.
6. **Toucher au prompt de l'advisor** casse deux baselines. Les régénérer
   délibérément : `UPDATE_PROMPT_GOLDEN=1 pytest tests/test_prompt_golden.py
   tests/test_prompt_fingerprint.py`.
7. **Le changelog conflicte à CHAQUE lot.** Recette : `git checkout origin/main --`
   les trois fichiers, réinsérer son entrée en tête, vérifier l'équilibre des
   accolades.
8. **`git stash` est INTERDIT** dans ce dépôt (comme `reset --hard`,
   `checkout -- .`, `push --force`). Committer le WIP et rebaser.
9. **Ne jamais changer de branche pendant une suite en arrière-plan** : elle
   testerait l'autre arbre.
10. **La CI ne tourne que sur une PR.** Le check Railway d'une PR échoue
    toujours — merger sur `CI Status`.

---

## Ce qui reste ouvert et pourquoi

| Issue | État |
| --- | --- |
| #1503 | Diagnostic fait et écrit. Deux questions posées à Louis (historique, les sept parcours). Le modèle B est tranché. |
| #1505, #1506, #1507 | Rattachées à #1503. Ne rien livrer avant. |
| #1417, #1396, #1440 | Plus bloquées : les maquettes sont dans le dépôt. |
| #1472 | Change de nature : n'attend plus une référence, attend le travail. Deux questions restent à Théo (2 écrans manquants, 5 seuils). |
| #1498 | Deux points sur trois livrés. Le troisième est le déplacement de blocs de #1440. |
