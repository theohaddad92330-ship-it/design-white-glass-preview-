# Archive `01` — architecture, produit, UX, design — 25 août 2026

Source : `BELLUMAI_ITERATION_3_01_ARCHITECTURE_PRODUCT_UX_DESIGN_2026-08-24.zip`
(29 fichiers déclarés, 29 présents). Mode **implémenter**.

Quatre sources, toutes déjà traitées par un tracker du dépôt : **PDF 1**
(architecture globale), **PDF 9** (backlog consolidé), **Tome 7** (placement,
motion, dataviz, UX systémique) et **Tome 8** (exécution, dépendances).

La question du croisement n'était donc pas « qu'est-ce qui manque » mais **« ces
trackers ont-ils tout pris ? »**. La réponse est non, et le mécanisme est
toujours le même : ils reprennent les LOIS des chapitres et jettent les TABLEAUX
qui les appliquent, puis annoncent des totaux qui ne correspondent ni à la source
ni à leurs propres tableaux.

---

## 0. Ce qui est livré

| Lot | Objet                                                                               | Commit     |
| --- | ----------------------------------------------------------------------------------- | ---------- |
| L1  | `decision-registry.ts` + GA-40 — un numéro de décision est unique DANS SON CHANTIER | `b216ae6d` |
| L2  | `interaction-laws.ts` + GA-41 — les 30 règles des §7, §25 et §28 du Tome 7          | `b216ae6d` |
| L3  | `useLaura` + GA-39 — la seule porte vers l'assistante                               | `b216ae6d` |
| L4  | `EffectPanel` + son contrat pur — les deux règles du §47 qui manquaient             | `b216ae6d` |
| L5  | `CapabilityGate` — griser UNE action et nommer le connecteur                        | `b216ae6d` |
| L6  | Quatre comptes faux corrigés dans le tracker du PDF 1                               | `8e44395e` |
| L7  | Le jeu de recette des 20 requêtes prioritaires (PDF 9 §6.1)                         | `8e44395e` |
| L8  | Statut des 50 tickets (§11 du tracker PDF 9), tracker, `CLAUDE.md`, mémoire         | ce commit  |

---

## 1. Ce que le croisement a trouvé

### 1.1 Quatre totaux faux dans le tracker du PDF 1

Recomptés à la source, un par un. Un chiffre faux ne se contente pas d'être
faux : **il sert d'argument**. Les « 21 routes » justifiaient trois fois une
non-livraison dans ce même document.

| Le tracker annonçait          | La source dit   | Vérification                                                                                          |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| « les **7** interdits en PR » | **9**           | 10 lignes de tableau moins l'en-tête, §2.3                                                            |
| « les **21** contrats »       | **18**          | 19 lignes moins l'en-tête, §11                                                                        |
| « **21** routes nouvelles »   | **16**          | marqueurs `**(nouveau)**` comptés ; les 5 restants sont des clés de palier, déjà comptées à l'item 57 |
| « **Cinq** défauts réels »    | **six** (X1→X6) | contradiction interne au tracker                                                                      |
| « 8 des **13** clés citées »  | **12**          | clés distinctes de la colonne Gating, §4.1                                                            |

Deux routes rangées parmi les nouvelles ne le sont pas dans la source :
`/missions/actives` et `/missions/facturation`.

Deux affirmations corrigées au passage : le PDF **ne demande pas** de créer
`no_feedback` (il l'énonce comme un acquis `[Confirmé — repo]`), et **D6** était
rangé parmi les décisions « dans le sens que le PDF recommande » alors que ce
tracker le tranchait à l'inverse. Le dépôt a depuis convergé vers la
recommandation — messagerie et agenda personnels, CRM d'espace — mais par **D58**
(PDF 7, 21/08), pas par ce chantier.

### 1.2 Trois chapitres du Tome 7 dormaient

Ni livrés, ni refusés, ni cités : **aucun** des trois trackers censés clore le
tome ne les nomme une seule fois.

- **§28 — les douze lois d'interaction.** « Rien ne bouge sous le curseur »,
  « l'état est dans l'URL », « le produit ne félicite pas », « le silence est un
  état valide ».
- **§7 — les neuf conflits de placement, déjà TRANCHÉS.** Le matching en drawer
  et pas en écran, les ESN présentes dans l'onglet Accès et pas Partenaires, les
  sprints en colonne ET en board. Rien à décider : neuf arbitrages gratuits qui,
  non enregistrés, seront redemandés au premier écran concerné.
- **§25 — les neuf règles de rendu graphique.** Dont « les valeurs inconnues sont
  **hachurées**, jamais absentes ni à zéro », qui est notre invariant « non
  mesuré n'est pas zéro » transposé aux graphiques.

Les trois trackers refusent la dataviz avec le même argument, mot pour mot — « les
16 visualisations du §24, chacune est un écran, pas une règle ». L'argument est
juste et **ne couvre pas le §25**, qui est précisément une liste de règles.

Les trente sont désormais dans `interaction-laws.ts`, chacune avec ce qui la
tient. Mesuré : **sept gardées sur trente**.

### 1.3 Trois primitives front sur six n'existaient pas

Le tome les spécifie et écrit d'elles : « CE TICKET PASSE AVANT TOUS LES ÉCRANS
NOUVEAUX. Un écran livré avant les primitives devra être repris. »

| Primitive                                     | État avant | Livré                      |
| --------------------------------------------- | ---------- | -------------------------- |
| `Provenance`, `ScoreWithAxes`, `UnknownValue` | livrées    | —                          |
| `useLaura`                                    | absente    | **oui**, + GA-39           |
| `EffectPanel`                                 | absente    | **oui**, + son contrat pur |
| `CapabilityGate`                              | absente    | **oui**                    |

`useLaura` est la plus importante : le tome appelle « risque technique n°1 du
programme » le cas où chaque surface implémenterait sa propre logique
d'interruption — deux compteurs, deux budgets, et le plafond de trois messages
par jour ne tient pas une semaine.

`EffectPanel` apporte les **deux règles du §47 qu'aucun panneau n'avait** : le
geste NU à un clic (« Déplacer seulement ») et le refus de valider sur `Entrée`.
Le panneau d'étape appliquait déjà les règles 1 et 3, mais dans SON code ; le
refus de pré-cocher un envoi externe devient un second verrou, dans le contrat,
qui ne fait pas confiance au catalogue.

### 1.4 Vingt-cinq numéros de décision désignent deux choses

Pas deux — vingt-cinq, et par plages entières : `D43`→`D50` entre le PDF 6 et le
PDF 10, `D56`/`D57` entre la dette et le tome 1, `D70`→`D72` entre le PDF 9 et le
tome 1, `D80`/`D82` entre les règles de design et le tome 5.

`D82` vaut « le copilote s'appelle Laura » **et** « la charte du deck exporté ».
`D72` vaut « la numérotation des gardes » **et** « le nom de la notion à
l'écran ».

L'ironie est instructive : le §5 du tracker du PDF 9 consacre une page à choisir
ses numéros « pour éviter une collision » avec les gardes — et prend
`D70`/`D71`/`D72`, déjà pris par le tome 1 deux jours plus tôt.

**On ne renumérote pas** (règle posée par D72 lui-même pour les gardes : ces
numéros vivent dans des commits, des commentaires et huit trackers). La règle
devient : **un numéro est unique DANS SON CHANTIER**, une citation nomme son
chantier, et GA-40 recalcule les ambiguïtés depuis `agent_docs/` pour que le
compte ne remonte pas.

### 1.5 Les 20 requêtes prioritaires : de 6 à 16 servies

Le PDF 9 §6.1 exige « un jeu de tests de routage, AVANT tout outil ». Il n'avait
jamais été écrit, et le tracker du PDF 9 refusait les outils au motif du
renommage — argument qui ne couvre pas le test de routage, lequel est
indépendant des noms.

⚠️ Le jeu livré ne teste **pas** le routage. Router demande d'appeler le modèle,
donc une clé de production dans les actions, vingt appels par poussée, et une
garde qui rougit parce qu'un modèle a tourné sa phrase autrement — c'est-à-dire
une garde qu'on désactive. Il teste la moitié DÉTERMINISTE, et c'est celle qui
échouait : au 21/08, quatorze requêtes sur vingt tombaient pour une seule raison,
« aucun outil copilote ne les expose ». Un modèle ne route pas vers un outil
absent.

Remesuré : **seize sur vingt** ont un outil. Les quatre autres sont déclarées
sans outil AVEC leur raison — composer un dossier de compétences envoyé à un
client sans relecture, rendre un identifiant de fichier que l'export ne produit
pas, écrire dans un agenda (le copilote n'a aucun chemin d'écriture, par
construction), et raisonner au trimestre (maille inexistante).

### 1.6 Le guide produit a dérivé du produit

`visible_product_reference/Presentation-plateforme-BELLUMAI.pdf` — 21 pages, le
document qu'un prospect reçoit. Trois écarts, **aucun n'est un défaut de code** :

1. **Toutes ses captures montrent l'ancienne navigation** (Tableau de bord,
   Copilote IA, Découvrir, Veille, Historique…). Le produit a neuf domaines
   depuis, dont le 7ᵉ s'appelle **Laura**.
2. **Il nomme « Le Copilote »** comme un nom propre (page 17, page 21). D82 dit
   que le copilote s'appelle Laura. ⚠️ Vérifié : le dépôt est conforme — ses
   quatre occurrences de « copilote » sont le nom COMMUN de la catégorie, que
   D82 conserve explicitement.
3. **Il sous-vend les intégrations** : « Salesforce — bientôt disponible »,
   « Pipedrive — bientôt », « CRM — BIENTÔT ». Vérifié en live le 25/08 :
   HubSpot, Salesforce, Google Workspace, Microsoft 365 et Notion sont
   **connectés**, avec leurs états de capacité et leurs preuves datées.

### 1.7 Une capture montre le copilote annonçant ce qu'il ne fait pas

`Screenshot-BellumAI-Copilot.jpg`, rangée dans `visible_product_reference/`, est
une conversation du 18 août où le copilote écrit : « j'ai enrichi les 15 profils
avec emails professionnels vérifiés… 15/15 emails validés », « 6 CV sur-mesure
générés et stockés dans ton CRM ».

**Rien de cela n'est possible** — le copilote n'a aucun chemin d'écriture, ses
outils rendent des propositions. C'est la fausse réussite que l'invariant n°3
interdit, et la règle existait déjà dans le prompt depuis le **2 août** (« tu ne
prétends pas avoir exécuté tant qu'un résultat technique n'a pas été reçu »),
seize jours avant la capture. Un seul verrou, et il a cédé.

⚠️ **Rejoué en live le 25/08, la même demande mot pour mot : NON reproductible.**
Le copilote refuse aujourd'hui, nommément — « je ne vais pas inventer 5 décideurs
supplémentaires », « je ne vais pas fabriquer d'identifiants », « ce n'est pas
une capacité que j'ai […] je ne vais pas prétendre le faire ». Aucune garde n'est
donc écrite : une garde sans violation mesurée est verte pour toujours.

Ce qui reste à traiter est commercial, pas technique — **cette capture circule**,
et un prospect qui la voit achète une capacité que le produit refuse d'exécuter.

---

## 2. Deux alertes d'agent que la vérification a INFIRMÉES

Consignées parce qu'elles auraient changé la décision de clôture.

**« Le markdown du Tome 7 est amputé »** — faux. Le PDF porte exactement les
mêmes sauts de numérotation (§8→§15, §31→§36) : c'est la numérotation continue
de la série des huit tomes, pas une troncature. Même contrôle sur le Tome 8 :
son sommaire est présent dans le markdown, complet.

**En revanche, la PARTIE B annoncée par le Tome 7 n'existe dans AUCUN des
deux.** L'auteur l'annonce en introduction (« qu'est-ce qui dépend de quoi, et
qu'est-ce qui casse si on inverse ? → B ») et ne l'a jamais écrite. On ne peut
pas lire ce qui n'a pas été rédigé — ce n'est pas un défaut de notre lecture.

---

## 3. Ce qu'on ne promet pas

| Sujet                                                                                          | Raison                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Garder « l'état est dans l'URL » par un cliquet                                                | Mesuré : 23 écrans tiennent un onglet, un filtre ou une recherche hors URL. Non gardé quand même — le signal attrape aussi des états qui n'ont rien à faire dans une URL (le mode d'un formulaire de connexion, la recherche interne d'un champ), et une garde qui crie sur du code légitime s'apprend à être ignorée. Se répare écran par écran |
| Les 9 règles dataviz gardées                                                                   | Une seule utilisation de `recharts` dans tout le front. Un cliquet posé sur un sujet qu'on n'a pas fait est vert pour toujours                                                                                                                                                                                                                   |
| Le rejeu LIVE du routage des 20 requêtes                                                       | Une clé de production dans les actions, vingt appels par poussée, et une garde qui rougit sur une reformulation. Même arbitrage que pour le jeu de conversations de Laura Site : opt-in                                                                                                                                                          |
| Renuméroter les 25 décisions ambiguës                                                          | Ces numéros vivent dans des commits, des commentaires de garde et huit trackers. C'est ce que D72 a déjà refusé pour les gardes                                                                                                                                                                                                                  |
| Le protocole de modification sûre en 7 étapes (PDF 1 §2.5) et le format de ticket en 10 champs | Le drapeau de fonctionnalité sur une colonne additive dont le défaut est vide n'éteint rien qu'un `[]` n'éteigne déjà, et le retour arrière d'un ajout de colonne est la migration `down`. Poser un drapeau par lot produirait la case à cocher qui ne fait rien                                                                                 |
| Le rayon d'impact par chantier (PDF 1 §2.4)                                                    | Classement de risque pré-PR. Utile, mais c'est un processus, pas un livrable — et le dépôt a déjà `/impact-check`                                                                                                                                                                                                                                |
| Mettre à jour le guide produit                                                                 | Ce n'est pas un fichier du dépôt. Trois écarts nommés au §1.6, à porter par qui possède le document                                                                                                                                                                                                                                              |

---

## 4. Certificat d'épuisement

**Passe A — dénombrement depuis la matière brute :** 29 fichiers déclarés au
manifeste, 29 présents, 29 classés — 4 sources markdown, 14 miroirs de trackers,
3 fichiers de racine, 4 PDF (même contenu que les markdowns, vérifié par
comparaison des chapitres), 3 pièces visuelles, 1 README. Les **17 miroirs**
comparés au dépôt par empreinte : 17 identiques, 0 absent, 0 divergent.

**Passe B — la consigne inversée**, posée par trois agents qui n'avaient pas
écrit le code, un par source. Elle a mordu : quatre totaux faux, trois chapitres
entiers dormants, trois primitives absentes, vingt-cinq collisions de
numérotation. Deux de ses alertes ont été **infirmées** par vérification (§2) —
ce qui est la raison d'être de la vérification.

**Recette live du 25/08** : les neuf domaines de navigation balayés, la
non-reproductibilité de la fausse réussite du copilote confirmée en rejouant la
demande, l'écran Intégrations relu (il prouve C15 en production — HubSpot
« Opérationnel » en lecture, « Accès non accordé » avec la portée NOMMÉE sur les
sociétés et les affaires ; Salesforce et Notion « Jamais vérifié »).

**Décision : l'archive `01_ARCHITECTURE_PRODUCT_UX_DESIGN` est ÉPUISÉE.**

---

## Ce que la recette live a vérifié

Déployé sur `152f1e9c` (PR #1069) puis `2af984bb` (PR #1070), vérifié dans
Chrome — le bandeau Paramètres › À propos affiche
`26.08.25-ts1787662507+git2af984bb9`, donc le navigateur sert bien ce commit.

**Balayage ZÉRO régression** — les neuf entrées de la barre latérale, cliquées
une par une : Aujourd'hui, Comptes, Projets, Vivier, Missions, Actions, Laura,
Pilotage, Paramètres. Aucune n'est cassée.

- **Pilotage** confirme la correction du chantier du PDF 8 : cinq maillons sur
  huit mesurés, les trois autres **gris et non rouges**, et « non mesuré » écrit
  en toutes lettres là où un `0` aurait menti.
- **La carte Messagerie d'une fiche contact** — le nouveau consommateur de
  `CapabilityGate` — rend le bouton « Écrire à ce contact » sans casser sa barre
  d'actions. C'est le chemin PASSANT (messagerie connectée, la grille rend son
  enfant tel quel). Neuf requêtes réseau, neuf 200.
- **Thème clair** : basculé et reposé, la page reste lisible, aucun couple
  texte/fond dégradé à l'œil.

**Ce que la recette n'a PAS pu vérifier, et pourquoi.**

| Ce qui n'est pas vérifié            | Raison                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Le panneau d'effet en vrai~~      | ✅ **VÉRIFIÉ le 25/08, plus tard le même jour.** Cette ligne était une erreur de MA part, pas une limite : « ça écrirait dans les données réelles de Louis » n'est pas une raison de ne pas tester — son espace est un espace de test, et il l'a confirmé. Le panneau a été exercé en quatre minutes sur un besoin Blablacar, et les trois règles du §47 tiennent, dont deux qu'aucun test unitaire ne prouve. Détail au §9 du tracker de l'archive 03. |
| Le chemin GRISÉ de `CapabilityGate` | Reste non vérifié — mais pour la bonne raison, qui n'est pas celle écrite d'abord : l'exercer suppose de **débrancher un connecteur**, dont le rebranchement exige un consentement OAuth que seul Louis peut donner. Hors périmètre de l'autorisation d'écriture. Couvert par 4 tests, dont celui qui vérifie la FORME des clés — le vrai défaut.                                                                                                       |
| Le mobile                           | **Impossible avec ce navigateur, mesuré et non plus supposé** : à 400 px demandés, `outerWidth: 742` mais `innerWidth: **1800**`, et `matchMedia('(max-width: 767px)').matches === false`. La fenêtre rétrécit, la page non ; les media queries ne se déclenchent jamais et `useIsMobile` reste faux. **Non vérifié**, jamais « vérifié OK ». Inscrit dans le skill pour qu'on cesse de réessayer.                                                      |

**Une observation, laissée telle quelle.** Un `TypeError: Cannot read
properties of undefined (reading 'component')` a été vu UNE fois dans un
`runLoader` de TanStack Router, à 14:56, pendant une navigation interrompue en
plein chargement. Six tentatives de reproduction (route inconnue, transition
Paramètres → Contacts → fiche) n'ont rien redonné, et l'écran s'est affiché
correctement à chaque fois. Ce n'est ni un défaut confirmé, ni un incident clos :
c'est une trace, écrite ici pour qu'elle soit reconnue si elle revient.

Deux avertissements PRÉEXISTANTS relevés au passage, non traités dans ce
chantier : trois `InvalidStateError: Transition was aborted` sur `/projects`
(horodatés avant le déploiement) et un `recharts` qui mesure `width(-1)` sur
`/pilotage`. Le second touche la famille §25 du registre des règles
d'interaction — il est inscrit là où il sera relu.
