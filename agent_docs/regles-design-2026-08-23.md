# Les règles de design de Bellum

Écrites le 23/08/2026, à partir du tome 7, du chantier mobile et de la journée
de recette UI/UX qui a suivi. Ce ne sont pas des préférences de goût : chacune
a été posée après un défaut MESURÉ, et la plupart sont tenues par une garde qui
fait échouer la CI.

Le principe qui les résume toutes : **une règle de design qui n'est pas gardée
redevient une opinion en trois semaines.** Un document de style se lit une
fois ; une garde se lit à chaque poussée.

---

## 1. Les quatre décisions du 23/08

| #   | Décision                                                                                                                                   | Conséquence                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| D79 | **Les deux thèmes sont une promesse.** Clair et sombre, à parité.                                                                          | Chaque écran se vérifie deux fois. Garde GA-33.          |
| D80 | **Plancher de lisibilité à 12 px.** Rien en dessous, nulle part.                                                                           | 388 occurrences corrigées. Garde GA-31.                  |
| D81 | **La largeur de lecture dépend du type de contenu.** Texte et formulaires bornés ; listes, tableaux et tableaux de bord en pleine largeur. | Les données ont besoin de leurs colonnes ; la prose non. |
| D82 | **Le copilote s'appelle Laura, partout**, y compris dans le commercial.                                                                    | 56 chaînes renommées, FR et EN.                          |

D82 porte une nuance qui a demandé de trier chaîne par chaîne : « Laura » est
un NOM, « copilote » est un nom commun de CATÉGORIE. On écrit « Laura rédige… »
et « Demander à Laura », mais on garde « ton copilote d'intelligence
commerciale » — c'est un positionnement, et « Laura d'intelligence
commerciale » ne veut rien dire.

---

## 2. Ce qui ne s'affiche jamais

C'est la règle la plus ancienne du produit et la plus facile à défaire d'un
caractère.

**Une valeur absente ne s'affiche pas « 0 ».** Le calcul applique « non mesuré
n'est pas mesuré à zéro » depuis des mois — les scores rendent `null`, les axes
non évaluables sortent des dénominateurs, un taux sans dénominateur vaut
`null`. Puis un écran écrit `{value ?? 0}` et tout ce travail devient
invisible. « 0 jour de retard » se lit « elle vient d'échoir » ; « 0 % » se lit
« il y a un problème ».

Trois primitives rendent la règle lisible dans le JSX :

- `UnknownValue` / `MeasuredValue` — « non mesuré » plutôt qu'un zéro ;
- `ScoreWithAxes` — **un score n'est jamais nu** : ses axes, ce qui n'a pas pu
  être évalué NOMMÉ, et un rendu `68/80` qui ne peut pas se lire en pourcentage ;
- `Provenance` — la source ET la date.

Gardes : **GA-18** (écrans affichant une note nue, cliquet ≤ 32) et **GA-19**
(`?? 0` dans les écrans, cliquet ≤ 87). Des cliquets et non des interdits :
tous les `?? 0` ne sont pas des fautes — « 0 message non lu » est vrai. La
garde compte au lieu d'interdire, et la question à se poser est écrite dedans :
_si cette valeur est absente, « 0 » est-il VRAI ?_

**Corollaire : un score n'est jamais une probabilité.** Refusé six fois
(arbitrage n°4 du 16/08). Ni chance de closing, ni prévisionnel pondéré.

---

## 3. La typographie

**Une échelle, celle de Tailwind** : 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36.
C'est déjà celle du dépôt (`text-xs` 559 fois, `text-sm` 136) — l'adopter
formellement a surtout consisté à faire rentrer les seize valeurs arbitraires
qui traînaient à côté.

**Plancher à 12 px** (D80). En dessous, un texte se devine plus qu'il ne se
lit, et au pouce c'est pire.

⚠️ La première version de cette garde ne lisait que les classes Tailwind
`text-[Npx]`. Or **tout le tableau de bord écrit ses tailles en style inline** —
`style={{ fontSize: 10 }}` — et passait à travers : 37 valeurs, dont trois sous
le plancher que la garde affirmait tenir. Le second défaut était pire que le
premier : une taille en PIXELS ignore le réglage « Taille du texte » des
préférences, qui agit sur la police RACINE — un utilisateur qui choisit
« Grand » ne voyait rien changer. **Les tailles inline s'écrivent en `rem`.**

Garde **GA-31**, et c'est un INTERDIT et non un cliquet — contrairement à
GA-18/19/25. La conversion est mécanique et elle est faite ; il ne reste que
deux exceptions NOMMÉES (les deux chiffres décoratifs de la page de partage
public, `8rem` et `10rem`, qui ne sont pas des textes). Un cliquet à deux se
lirait comme une dette dont personne ne saurait de quoi elle est faite.

---

## 4. Le placement

Les quatre lois du tome 7, et ce qu'on sait en garder.

**Loi 1 — un réglage vit à un seul endroit.** Un champ éditable depuis deux
écrans produit deux vérités et l'utilisateur ne sait jamais laquelle gagne.
C'est la seule des quatre qu'une machine vérifie sans se tromper : garde
**GA-26**, qui refuse deux modules appelant le même point d'écriture de
réglage — et qui vérifie AUSSI que ce qu'elle surveille existe, parce que sa
première version listait trois hooks introuvables et était donc verte sur du
vide.

**Loi 2 — la règle vaut partout.** Tenue par GA-18 et GA-19.

**Loi 3 — sept formes d'affichage** pour un objet métier. Non gardée : la
vérifier demanderait de reconnaître un objet métier dans du JSX, et une garde
approximative sur ce sujet accuserait du code correct.

**Loi 4 — rien n'apparaît deux fois sous la même forme avec le même contenu.**
Non gardée non plus, pour la même raison — mais appliquée : l'entête de page ne
répète plus l'onglet de section actif, ni le nom de la section. Mesuré à
l'écran : la barre d'onglets affichait « Ma journée · Messagerie · Tableau de
bord » avec le premier actif, et la ligne juste en dessous répétait « Ma
journée ». Partout où une section a plusieurs onglets.

⚠️ Une garde de collision de libellés a été écrite puis RETIRÉE : elle comptait
une cinquantaine de répétitions, presque toutes légitimes (« Comptes » est une
section ET son premier onglet). **Une garde qui crie sur du comportement
correct se désactive dans la semaine.**

---

## 5. La largeur de lecture (D81)

Mesuré en production sur `/pilotage` à 1 440 px : les paragraphes de
description faisaient **1 080 à 1 112 px, soit ~180 caractères par ligne** —
deux fois et demie la limite au-delà de laquelle l'œil perd le début de la
ligne suivante.

La borne vit dans le composant `Text` de `packages/ui`, et non dans les écrans :
soixante-huit paragraphes de description existent, les borner un par un
garantit d'en oublier — et surtout que le soixante-neuvième ne le soit pas.
Elle est sans effet là où elle ne sert pas (un texte dans une carte de 300 px
n'atteint jamais 70 caractères) et s'exprime en `ch`, l'unité qui suit la
taille de police de l'élément, si bien que le réglage « Grand » ne la casse
pas. Un doublon en CSS (`:where()`, spécificité nulle) rattrape les `<p>`
écrits à la main hors du composant.

Quatre cas y échappent, chacun pour une raison : les titres, un appelant qui
passe déjà un `max-w-`, une troncature (`truncate` mesure son CONTENEUR —
borner d'abord couperait le texte plus tôt qu'il ne faut), et l'échappatoire
`full`, comptée par **GA-34** parce qu'une échappatoire non comptée devient le
défaut.

Trois régimes, un par type de contenu :

- **Texte suivi et formulaires** — bornés autour de 75 caractères par ligne.
  Sur un 27 pouces, un paragraphe non borné fait 1 800 px de long et l'œil perd
  le début de la ligne suivante.
- **Listes, tableaux, tableaux de bord** — pleine largeur. Ils ont besoin de
  leurs colonnes, et les borner reviendrait à perdre sur les grands écrans ce
  qu'on vient d'y gagner.
- **Ce qui défile horizontalement** le fait dans SON conteneur. Le corps de la
  page ne défile jamais latéralement.

⚠️ **Exception, décision Louis 08/10/2026, #3847 — renverse #2001 et D81 pour
/chat.** La colonne qui accueille le fil, le composeur et les cartes
(`CHAT_SURFACE.column`) n'est plus bornée : `/chat` seul passe en pleine
largeur. Ce que l'exception NE couvre PAS : le TEXTE d'une bulle
(`CHAT_SURFACE.reading`) reste à 70 caractères, tenu par GA-34 comme partout
ailleurs — seul le BLOC qui accueille cartes et composeur s'élargit.
`c90_chat_pleine_largeur` au registre de doctrine.

---

## 6. Le mouvement

Grammaire unique dans `packages/ui/src/motion.ts` : douze mouvements, quatre
courbes, quatre paliers de durée.

Mesuré avant : 121 fichiers animés, `EASE_OUT_EXPO` redéfini dans **six**
fichiers, dix durées distinctes pour la même intention. Le mouvement existait,
il était plutôt de bon goût, et il n'avait pas de grammaire — le produit
paraissait légèrement différent d'un écran à l'autre sans qu'on sache dire
pourquoi.

La question à se poser en écrivant une transition : **répond-elle à l'une des
cinq questions du §16 du tome** (d'où ça vient, où c'est allé, est-ce que ça
travaille, est-ce que ça a marché, qu'est-ce qui a changé) ? Si non, elle
n'existe pas — `MOTION.reveal` suffit.

`reduced()` raccourcit sans supprimer : faire apparaître d'un coup est plus
brutal que ce dont se plaint quelqu'un qui demande moins de mouvement. Et il
laisse `focusRing` intact, parce que c'est une aide à la navigation clavier et
non une décoration.

Aucun mouvement de site vitrine — rebond, élastique, parallaxe. Sur un outil
qu'on ouvre huit heures par jour, ils fatiguent en trois jours.

Garde **GA-25** (cliquet : 26 courbes / 94 durées écrites à la main).

---

## 7. Les couleurs et l'empilement

**Tout passe par les tokens** (`apps/web/src/styles/tokens.css`). Une valeur
hexadécimale dans du JSX ne suit pas le thème, par construction — et le seul
endroit du dépôt qui en avait une était l'écran de back-office, qui servait un
rectangle noir aux utilisateurs en thème clair.

**Le contraste AA (4,5:1)** est vérifié sur les couples texte/fond des deux
thèmes — y compris le **texte d'accent**, qui est le token le plus important de
cette section parce que son absence coûtait 149 endroits.

Mesuré nuance par nuance : **aucune valeur fixe de la gamme primaire ne passe
AA des deux côtés.**

    primary-500  →  5,78:1 en clair   ·   2,68:1 en sombre
    primary-300  →  2,59:1 en clair   ·   6,73:1 en sombre

C'est arithmétique, pas une question de goût. D'où `--bellum-text-accent`
(primary-500 en clair, primary-300 en sombre). Un lien, une valeur mise en
avant, une action secondaire passent par lui. La seule exception est un texte
posé sur une **pastille teintée en primaire** : la gamme primaire est
indépendante du mode, la pastille garde donc sa couleur dans les deux thèmes,
et son texte aussi.

**Les couleurs sémantiques ne portent pas de texte.** `--bellum-warning` donne
9,47:1 en sombre et **1,84:1 en clair** ; `--bellum-success` 9,58 contre 1,82.
Ce sont des couleurs de PASTILLE et d'ICÔNE. Le texte passe par les variantes
`*-soft-text`, qui tiennent sur le fond de page comme sur la pastille.
196 usages étaient dans ce cas, plus 123 classes de la palette Tailwind brute
(`text-amber-400`, `text-violet-400`) qui court-circuitaient tout le système.

⚠️ **Un fond OPAQUE et un fond à OPACITÉ ne se traitent pas pareil.** Sur
`bg-red-500`, la couleur est la même dans les deux thèmes, donc son texte n'a
pas à changer. Sur `bg-red-500/15`, le fond se compose sur celui du THÈME —
pâle en clair, sombre en sombre — donc son texte DOIT suivre. La première
version de la règle avait classé les seconds comme exceptions.

⚠️ Ces défauts n'ont PAS été trouvés en relisant du code : ils ont été trouvés
en mesurant le contraste sur les écrans **en ligne**. Un token qui échoue AA se
lit parfaitement bien pour qui l'a choisi — et le thème sombre, lui, était
propre partout, ce qui suffit à ne jamais rien remarquer.

**L'échelle d'empilement est nommée** : `nav` · `overlay` · `toast` · `widget`
· `picker` · `devtools`. Avant, trois composants écrivaient `z-[9997]`,
`z-[9998]` et `z-[9999]` — trois nombres choisis pour « passer au-dessus de
tout », qui se comparaient entre eux par hasard. Un quatrième aurait écrit
10000, et le premier qui aurait voulu passer devant le suivant n'aurait eu
aucun moyen de savoir contre quoi il se bat.

Garde **GA-33**.

### 7.1 Une couleur porte un ÉTAT, jamais une CATÉGORIE (tome 7 §26)

GA-33 dit COMMENT une couleur doit être écrite pour survivre au thème. Elle ne
dit rien de ce qu'une couleur a le droit de SIGNIFIER — et c'est là que le
produit dérivait, sans qu'aucune garde n'ait à mentir pour rester verte.

Le tome 7 §26.1 :

> **Une couleur porte un état, jamais une catégorie.**
>
> Un graphique de CA par client ne colore pas chaque client différemment : il
> utilise une seule teinte, avec l'intensité pour la valeur. Les couleurs
> sémantiques restent disponibles pour dire _ce qui va bien et ce qui ne va
> pas_. Sans cette règle, un écran finit avec neuf couleurs dont aucune ne veut
> rien dire, et le rouge du danger se perd dans le décor.

Et §26 donne l'usage EXCLUSIF de chaque jeton : succès = « ce qui est fait,
validé » · attention = « ce qui demande une décision » · danger = « ce qui
bloque, ce qui expire, ce qui a échoué » · information = « ce qui est déduit »
· neutre = **l'inconnu**. Un « type de site » peint en `--bellum-warning`
n'emprunte pas seulement une couleur : il dépense le mot.

**Le partage à faire, et il n'est pas symétrique.** Un ÉTAT dit _ce qu'il faut
faire_ et se lit sans légende ; une CATÉGORIE dit _de quelle sorte c'est_ et
oblige à mémoriser une légende qui, la plupart du temps, n'est écrite nulle
part. Mesuré le 29/08 sur 1 331 fichiers : 152 blocs porteurs de couleur, dont
**7 indexés par une catégorie** — les 145 autres sont des états, et ils restent
colorés. Une garde qui interdirait la couleur serait fausse.

**Exception nommée par la source elle-même : les 5 couleurs de RÔLE de
décision** (§26.2, « reprise directe, elle est excellente ») — économique,
technique, utilisateur, champion, et **inconnu = gris**. Avec sa condition :

> **Le gris est le plus important.** Un organigramme où tout est coloré est un
> organigramme inventé.

Le rôle `unknown` partageait la MÊME entrée de palette que `user` : une
personne dont on ignore le poids de décision s'affichait en VERT, exactement
comme une personne dont on sait qu'elle subira le résultat.

⚠️ **Retirer une couleur peut retirer une information.** Ce qu'elle portait
doit alors être porté par un MOT. Six des sept cas avaient déjà le mot à côté
(le badge écrit son type, la tuile écrit son libellé, la légende écrit sa
catégorie) ; le septième — la famille d'un signal dans « Pourquoi maintenant »
— ne l'avait pas, et l'a maintenant, en FR et en EN.

⚠️ La garde compte des **TEINTES**, pas des valeurs : une rampe
`primary-500 → primary-200` n'en fait qu'une, et c'est la réponse que la source
prescrit. Les neutres ne comptent pour aucune teinte.

Garde **GA-64** (`apps/web/src/architecture/colour-carries-a-state.test.ts`),
qui lit les `.ts` **et** les `.tsx` — GA-33 ne regarde que les `.tsx`, et c'est
dans un `.ts` que dormait la plus grosse palette catégorielle du produit.

---

## 8. Le mobile

Le produit doit être **le produit** sur téléphone, pas un web responsive qui
abandonne (décision de Louis du 23/08).

- **Une seule borne : 768 px**, la borne `md` de Tailwind. En inventer une
  seconde ferait exister des tailles où le CSS dit « mobile » et le JavaScript
  dit « bureau ».
- **Les mêmes routes, une autre coque.** Un second arbre de routes aurait
  produit deux produits à maintenir, et l'un des deux aurait pris du retard —
  toujours celui qu'on regarde le moins.
- **Quatre onglets, pas six** : au-delà, les cibles tactiles passent sous
  44 px. Ce ne sont pas quatre écrans mais quatre PORTES.
- **Laura est le premier onglet ET l'écran d'arrivée**, quelle que soit la
  préférence de démarrage — elle a été choisie devant un écran de bureau, et en
  mobilité on ne parcourt pas un portefeuille, on demande quelque chose.
- **`dvh`, jamais `vh`.** `100vh` compte la barre d'adresse comme si elle
  n'existait pas : le bas de l'écran passe sous le pli.
- **Jamais deux conteneurs défilants imbriqués.** On atteint le bout de
  l'intérieur, le geste part sur l'extérieur, et la zone de saisie disparaît.
- **Une colonne masquée sous 768 px l'est en CSS**, dans le même rendu — une
  seconde liste divergerait.

Gardes **GA-28** (`100vh` interdit, grilles à 3+ colonnes sans variante
responsive figées à trois — toutes légitimes), **GA-29** (un tableau masque
autant d'entêtes que de cellules : un décalage de colonne ne casse rien, ne
lève rien, se lit parfaitement bien, et affiche un score sous « Date ») et
**GA-30** (cibles tactiles).

Une cause racine mérite d'être retenue : **`min-width: auto` sur un enfant de
flex ou de grid** est le premier responsable des débordements horizontaux. Il a
été trouvé trois fois dans la même journée, puis corrigé une fois pour toutes
par une règle globale à spécificité nulle dans `index.css`.

---

## 9. L'accessibilité

- **Un bouton qui ne montre qu'une icône porte un nom** (`aria-label`,
  `aria-labelledby`, ou un `tooltip` que `TooltipButton` reporte). Garde
  **GA-32**.
- **Ce qui se clique se tabule.** Un `<div onClick>` n'a ni tabulation, ni
  touche Entrée, ni annonce au lecteur d'écran. Deux lignes du produit étaient
  dans ce cas — celle des meilleurs comptes du tableau de bord et celle d'une
  action de plan : elles s'ouvraient à la souris et par aucun autre moyen. La
  réponse par défaut est un `<button type="button">` ; `role` + `tabIndex` +
  `onKeyDown` ne se recopient à la main que quand la ligne contient déjà une
  commande (imbriquer deux boutons est invalide). Garde **GA-35**, cliquet à
  cinq — quatre enveloppes de `stopPropagation` et une zone de dépôt.
- **Cibles tactiles ≥ 44 px** sous `(pointer: coarse)`. Garde GA-30.
- **Le clavier** : `G` puis une lettre pour naviguer, `⌘/` pour la liste. Une
  SÉQUENCE et non une combinaison — `⌘G` est « chercher le suivant » dans tous
  les navigateurs. Trois protections contre la frappe volée : on ne détourne
  jamais une touche pendant qu'on écrit, aucun modificateur, et la séquence
  expire au bout d'1,5 s. **La liste ne montre que ce qui est branché** — un
  raccourci listé qui ne fait rien apprend à l'utilisateur que la liste ment.
- **Une redirection part une seule fois.** `<Navigate>` de TanStack Router
  compare l'identité de son objet props, que JSX recrée à chaque rendu : la
  seule transition `/` → `/dashboard` produisait 106 erreurs React #185, et
  l'écran arrivait quand même — c'est ce qui l'a rendu invisible pendant des
  mois. Garde **GA-27**.

---

## 10. Ce qu'on ne promet pas

Chacun avec sa raison, parce qu'un refus sans raison se redemande tous les
trois mois.

- **Les gardes dataviz** — une seule utilisation de `recharts` dans tout le
  front, zéro camembert. Un cliquet posé sur un sujet qu'on n'a pas fait est
  vert pour toujours.
- **Les 16 visualisations du §24 du tome 7** — chacune est un écran, pas une
  règle.
- **La densité par persona** — le produit n'a pas de notion de persona.
- **La matrice objet × forme** (loi 3) — la vérifier demanderait de reconnaître
  un objet métier dans du JSX.
- **Un service worker hors-ligne** — le produit lit des données vivantes ; un
  cache montrerait un portefeuille d'hier sans le dire.
- **Les notifications poussées** — clé VAPID et consentement, à demander quand
  quelqu'un les réclame.
- **Les 22 tableaux restants** — `ResponsiveTable` existe et est testé ;
  l'appliquer écran par écran demande de vérifier chacun à l'œil.

---

## 11. La leçon transversale, et elle a servi cinq fois en deux jours

**Une garde borgne passe au vert.**

- GA-25 cherchait la chaîne `bounce` et a accusé quatre fichiers
  **exemplaires** — `bounce: 0` DÉSACTIVE le rebond.
- GA-26 listait trois hooks qui n'existaient nulle part : verte sur du vide.
- GA-29 utilisait `RegExp.test()` avec le drapeau `g`, qui est STATEFUL : un
  appel sur deux rendait `false`.
- GA-32 a compté 43 fautifs sur 48 alors qu'il y en avait ZÉRO — son extracteur
  de balise s'arrêtait au premier `>`, c'est-à-dire à la flèche de
  `onClick={() => …}`.
- GA-20 et GA-08 découpaient des listes sans retirer les commentaires, où une
  virgule française cassait le découpage.
- GA-31 ne lisait que les classes Tailwind et déclarait l'échelle fermée
  pendant qu'une feature entière écrivait ses tailles en style inline.

Et une variante qu'aucune garde n'attrape : **GA-33 était verte pendant que 149
endroits échouaient AA en thème sombre.** Elle vérifiait les couples
texte/fond des tokens, ce qui était juste — mais le token fautif n'existait
pas, et personne ne peut garder ce qui n'a pas de nom. Le défaut a été trouvé
en mesurant le contraste sur les écrans **en ligne**, jamais en relisant du
code. Une garde protège une règle ; elle ne l'invente pas.

D'où deux exigences pour toute nouvelle garde :

1. **Prouver qu'elle sait dire NON** — casser volontairement le code qu'elle
   protège et vérifier qu'elle le nomme.
2. **Prouver qu'elle LIT quelque chose** — un test qui vérifie que le corpus
   n'est pas vide. Sans lui, une garde reste verte le jour où son chemin change.

---

## 12. Addendum — texte verbatim retiré de CLAUDE.md le 17/09/2026 (issue #6)

> `CLAUDE.md` faisait 55 k caractères, relu à chaque tour de chaque agent (~490 $/semaine rien que pour sa
> table de variables). Le § « Design rules » y garde désormais un titre d'une ligne par règle et pointe ici.
> **Rien n'a été réécrit ni supprimé** : les bullets ci-dessous sont le texte exact retiré de `CLAUDE.md`,
> qui peut recouper ce que les sections 1-11 ci-dessus disent déjà — c'est voulu, rien n'est perdu.

Détail et raison de chacune : [agent_docs/regles-design-2026-08-23.md](agent_docs/regles-design-2026-08-23.md). Le principe qui les résume : **une règle de design qui n'est pas gardée redevient une opinion en trois semaines** — c'est pourquoi chacune est tenue par une garde d'architecture (`apps/web/src/architecture/`) qui fait échouer la CI.

- **Une valeur absente ne s'affiche JAMAIS « 0 ».** Le calcul applique « non mesuré n'est pas mesuré à zéro » depuis des mois ; un écran qui écrit `{value ?? 0}` annule tout ce travail. Primitives : `UnknownValue`/`MeasuredValue`, `ScoreWithAxes` (un score n'est jamais nu — ses axes, et ce qui n'a pas pu être évalué est NOMMÉ), `Provenance` (la source ET la date). Question à se poser : _si cette valeur est absente, « 0 » est-il VRAI ?_ Gardes GA-18 / GA-19 (cliquets).
- **Typographie — une échelle, celle de Tailwind** (12 · 14 · 16 · 18 · 20 · 24 · 30 · 36) et **un plancher à 12 px** (D80). Seize valeurs arbitraires disaient trois choses ; c'est ce qui faisait qu'un écran ne ressemblait pas tout à fait au précédent. GA-31 est un INTERDIT, pas un cliquet : deux exceptions nommées (les chiffres décoratifs de la page de partage). ⚠️ Une taille écrite en **style inline** s'écrit en `rem` et jamais en pixels — un pixel ignore le réglage « Taille du texte » des préférences, qui agit sur la police RACINE, si bien qu'un utilisateur qui choisit « Grand » ne voit rien changer.
- **Les deux thèmes sont une promesse** (D79). Clair et sombre à parité, contraste AA sur tous les couples texte/fond, aucune couleur hexadécimale dans du JSX — elle ne suivrait pas le thème. ⚠️ **Aucune nuance FIXE de la gamme primaire ne passe AA des deux côtés** : `primary-500` donne 5,78:1 en clair et 2,68:1 en sombre, `primary-300` l'inverse. Un lien ou une valeur mise en avant passe par `--bellum-text-accent` ; 149 endroits écrivaient `text-[var(--bellum-primary-500)]` et échouaient dès qu'on basculait en sombre. **Les couleurs SÉMANTIQUES ne portent pas de texte non plus** — `--bellum-warning` fait 9,47:1 en sombre et 1,84:1 en clair : le texte passe par `*-soft-text`. Et **aucune classe de la palette Tailwind en couleur de texte** (`text-amber-400`…), qui court-circuite le système entier. ⚠️ Un fond OPAQUE (`bg-red-500`) garde son texte, un fond à OPACITÉ (`bg-red-500/15`) se compose sur le fond du THÈME et son texte doit suivre — c'est la distinction que la première version de la règle avait ratée. Échelle d'empilement NOMMÉE (`nav`/`overlay`/`toast`/`widget`/`picker`/`devtools`), jamais un `z-[9999]`. Garde GA-33.
- **La largeur de lecture dépend du type de contenu** (D81) : texte et formulaires bornés à 70 caractères ; listes, tableaux et tableaux de bord en pleine largeur — ils ont besoin de leurs colonnes. Mesuré avant : 180 caractères par ligne sur `/pilotage` à 1 440 px. La borne vit dans le composant `Text` (+ un doublon CSS à spécificité nulle pour les `<p>` écrits à la main), pas dans les écrans : soixante-huit paragraphes existent, les borner un par un garantit d'oublier le soixante-neuvième. Elle s'exprime en `ch`, donc elle survit au réglage « Grand ». Échappent : les titres, un `max-w-` déjà posé, une troncature (elle mesure son conteneur), et `full` — compté par GA-34. Ce qui déborde défile dans SON conteneur, jamais le corps de la page.
- **Un réglage vit à un seul endroit** (loi 1 du tome 7, garde GA-26) et **rien n'apparaît deux fois sous la même forme avec le même contenu** (loi 4 — non gardée, la vérifier demanderait de reconnaître un objet métier dans du JSX, mais appliquée : l'entête ne répète plus l'onglet actif ni le nom de section).
- **Le mouvement a une grammaire** — `packages/ui/src/motion.ts`, douze mouvements, quatre courbes, quatre durées. Une transition qui ne répond à aucune des cinq questions du §16 du tome n'existe pas : `MOTION.reveal` suffit. Aucun rebond, aucune parallaxe — sur un outil ouvert huit heures par jour, ils fatiguent en trois jours. Garde GA-25 (cliquet).
- **Le mobile est le produit, pas un repli.** Une seule borne (768 px), les mêmes routes dans une autre coque, quatre onglets (au-delà les cibles passent sous 44 px), Laura en premier onglet ET en écran d'arrivée, `dvh` jamais `vh`, jamais deux conteneurs défilants imbriqués, une colonne masquée l'est en CSS dans le MÊME rendu. Gardes GA-28 / GA-29 / GA-30. Cause racine à connaître : `min-width: auto` sur un enfant de flex/grid est le premier responsable des débordements horizontaux (corrigé globalement dans `index.css`).
- **Accessibilité** : un bouton qui ne montre qu'une icône porte un nom (GA-32) ; **ce qui se clique se tabule** — un `<div onClick>` n'a ni tabulation ni Entrée ni annonce, la réponse par défaut est un `<button type="button">` (GA-35) ; cibles tactiles ≥ 44 px en pointeur grossier (GA-30) ; `<Navigate>` de TanStack Router est interdit — il compare l'identité de son objet props et rejoue en boucle (GA-27, 106 erreurs React #185 sur la seule transition `/` → `/dashboard`).
- **Le copilote s'appelle Laura, partout** (D82), y compris dans la grille tarifaire. Nuance à tenir : « Laura » est un NOM, « copilote » est le nom commun de la CATÉGORIE — on garde « ton copilote d'intelligence commerciale », qui est un positionnement.
- **Une garde protège une règle, elle ne l'invente pas.** GA-33 était verte pendant que 149 endroits échouaient AA en sombre : elle vérifiait les tokens, ce qui était juste, mais le token fautif n'existait pas — et personne ne peut garder ce qui n'a pas de nom. Ce défaut-là s'est trouvé en mesurant le contraste sur les écrans EN LIGNE. **Toute nouvelle garde doit par ailleurs prouver deux choses** : qu'elle sait dire NON (casser volontairement le code qu'elle protège) et qu'elle LIT quelque chose (un test qui vérifie que son corpus n'est pas vide). Six gardes borgnes en deux jours — `bounce: 0` pris pour un rebond, trois hooks inexistants surveillés, `RegExp.test()` avec le drapeau `g` qui est STATEFUL, un extracteur de balise coupé à la flèche de `onClick={() => …}`, des listes découpées sans retirer les commentaires.
