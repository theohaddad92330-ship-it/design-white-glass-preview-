# Recette back-office — les gestes, et ce que tu dois voir

**Pourquoi c'est toi qui la fais** : `apps/dashboard-manager` est derrière
`DM_BASIC_AUTH` + TOTP, et saisir des identifiants m'est interdit. Cinq issues y
sont **livrées, CI verte, comportement jamais vu**. Tranché avec toi le
07/09/2026 : je livre, j'écris les gestes, tu rends un PASS / FAIL.

**Adresse** : `https://belllum-monorepo-dashboard-manager.vercel.app`
**Commits concernés** : `d766f2d9b` (#1667.2, #1662.1, #1664.2) et `9e51b9e2c`
(#1642, #1643 — le socle, **sans écran consommateur**, voir la note en bas).

⚠️ **Vérifie d'abord que le build servi est le bon.** Le back-office est déployé
par Vercel, et ces deux commits sont partis à 15h52 et 16h02. Le pied de page
affiche `back-office+<sha>`. S'il ne commence pas par `71eef8e0` ou plus récent,
la recette ne prouve rien : le déploiement n'est pas passé.

---

## 1. #1667.2 — une bannière ne part plus sans date de fin

| Geste                                                             | Ce que tu dois voir                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Ouvrir `/banners` → « Nouvelle bannière »                        | Le champ de fin s'appelle **« Fin \* »**, plus « Fin (optionnel) »                                       |
| Remplir les deux titres, **laisser la fin VIDE**                  | Le bouton d'envoi est **désactivé**. Pas un message d'erreur après coup : il ne part pas.                 |
| Remplir la fin                                                    | Le bouton s'active, la bannière se crée                                                                   |
| Rouvrir une bannière **ancienne** (créée avant aujourd'hui)       | Elle s'affiche normalement, même si sa fin est vide — les anciennes se LISENT toujours, seul l'ÉCRIT change |

**FAIL si** : le bouton est actif avec une fin vide, ou une bannière ancienne
sans fin ne s'affiche plus.

## 2. #1662.1 — l'âge du job le plus ancien, par file

| Geste                                          | Ce que tu dois voir                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Ouvrir `/queues`                               | Sur le sélecteur de file, une durée écoulée à côté des files qui ont des jobs **en attente** |
| Regarder une file **sans job en attente**      | **Rien** — surtout pas « 0 s ». Une file vide n'a pas un job de zéro seconde.                |

**FAIL si** : une file vide affiche « 0 » ou « 0 s ». C'est le défaut exact que
la règle « non mesuré n'est pas zéro » interdit, et il serait invisible en CI.

## 3. #1664.2 — supprimer un utilisateur dit ce que ça détruit

⚠️ **NE VALIDE PAS la suppression.** Va jusqu'à l'écran de confirmation, lis, et
**annule**. Le geste est irréversible et cascade sur les espaces.

| Geste                                                        | Ce que tu dois voir                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/users/<un utilisateur PROPRIÉTAIRE d'un espace>` → Supprimer | La conséquence **nommée** : son espace disparaît **en entier** avec lui                                                                     |
| `/users/<un utilisateur simple MEMBRE>` → Supprimer          | Une phrase **différente** : l'espace continue d'exister sans lui                                                                            |
| Taper autre chose que `SUPPRIMER` dans la confirmation       | Refusé                                                                                                                                      |
| **Puis annuler**                                             | —                                                                                                                                           |

**FAIL si** : les deux cas affichent la même phrase générique (c'était le défaut
signalé), ou si le mot de confirmation n'est pas exigé.

---

## Ce qui NE se recette pas, et qu'il faut savoir

**#1642 / #1643 — le socle UI (12 primitives + 4 graphiques) n'a AUCUN écran
consommateur.** C'est délibéré et daté : il se referme au premier écran livré,
alors que l'ordre inverse bloquerait six lots. **Il n'y a donc rien à regarder à
l'écran** — et c'est exactement pour ça que son exception `knip` doit **sauter au
premier écran qui consomme le baril**. Si elle lui survit, elle masque du code
mort.

⚠️ Et une chose que ce socle a coûtée sans qu'on la voie : deux `?? 0` ajoutés
dans `charts.tsx` ont rendu la garde GA-19 **rouge sur `main`** pendant deux
heures, parce qu'elle lit `apps/dashboard-manager/src` depuis la suite `web`,
qui ne tournait pas sur une PR back-office. Corrigé dans `ci.yml` le 07/09
(PR #1724) — la portée du job couvre désormais le corpus de ses gardes.

---

# Deuxième lot — PR #1744, mergée le 07/09/2026

**Tranché avec toi le 08/09/2026** : tu recettes toi-même. C'est la seule voie
qui recette la PRODUCTION — un relais local aurait recetté le même CODE, sans
rien prouver du déploiement, des variables d'environnement ni des données
réelles.

**Commits** : `5dacf7344` · `7cf4a2e08` · `9d7a43eee` · `95d33c9d2` · `6149063e7`
**Issues** : #1642, #1646, #1671.3, #1671.4, #1672, #1674.5, #1686

⚠️ **Même porte qu'au-dessus : vérifie le build servi AVANT de regarder quoi que
ce soit.** Le pied de page affiche `back-office+<sha>`. S'il est antérieur à
`6149063e7`, ce que tu vois n'est pas ce lot et la recette ne prouve rien.

## 5. #1646 — la page d'accueil est le cockpit BUSINESS

C'est le changement le plus visible du lot : `/` ne redirige plus vers le
cockpit de télémétrie IA.

| Geste | Ce que tu dois voir |
| --- | --- |
| Ouvrir `/` (la racine, sans rien après) | Le cockpit **business** : MRR, marge, burn, runway, décisions, usage — plus la télémétrie IA |
| Regarder sous les tuiles | Le **waterfall** et la **courbe 12 mois**, côte à côte |
| En tête d'écran | La **file de décisions** — ce qui exige un arbitrage se lit avant ce qui décrit la semaine |
| Ouvrir `/monitoring?view=cockpit` | Toujours atteignable, par le lien permanent du rail latéral. Il ne doit PLUS y avoir la file de décisions ni la grille des lancements : elles ont déménagé sur `/`, et les rendre aux deux endroits était le doublon |
| **Se connecter avec un compte SANS le rôle propriétaire** | Les tuiles **financières** sont fermées, exactement comme sur `/revenus` et `/revenus/tresorerie`. Le reste de l'écran se rend |

**FAIL si** : `/` redirige encore · les deux écrans montrent tous les deux la
file de décisions · un `operator` voit le MRR.

⚠️ **Refus assumé à ne pas signaler comme un manque** : le tableau des
mouvements **par client** (#1646.4) n'est pas là. L'API n'expose pas le détail
par abonné et `apps/api` était hors du périmètre du lot — refus honnête plutôt
que donnée fabriquée.

## 6. #1671.3 / #1671.4 — l'écran `/securite`

| Geste | Ce que tu dois voir |
| --- | --- |
| Le rail latéral | Une entrée **« Sécurité »**. ⚠️ Si elle manque, tout le reste est inatteignable au clic — c'est le défaut le plus cher du dépôt, et il ne se voit ni en CI ni en revue |
| Ouvrir `/securite` | Connexions récentes · échecs · pays observés · anomalies détectées |
| Le panneau de rétention | « Ce qui a été purgé et quand », **mesuré sur la plus ancienne entrée réelle** — pas une fenêtre de rétention devinée |
| Choisir une fenêtre **sans aucun événement** | Une phrase qui le DIT. Surtout pas « 0 anomalie » : une fenêtre sans événement n'a pas zéro anomalie, elle n'a pas de mesure |

**FAIL si** : une fenêtre vide affiche des compteurs à zéro · l'entrée de nav
manque · le panneau de rétention affiche une durée qui ne vient d'aucune entrée.

⚠️ **Arrêt volontaire** : aucun envoi (e-mail, séquence) sur détection
d'anomalie. Détection et affichage seulement — **le déclencheur reste à
trancher par toi.** Ne le compte pas comme un manque.

## 7. #1686 — `/produit/onboarding`

| Geste | Ce que tu dois voir |
| --- | --- |
| Le rail latéral | Une entrée vers **`/produit/onboarding`** |
| L'ouvrir | L'écran des cohortes se rend |

**FAIL si** : l'entrée de nav manque (même défaut que `/securite` : l'écran
existait, testé, atteignable par aucun clic avant `95d33c9d2`).

## 8. #1672 / #1674.5 / #1642 — les cinq états d'un tableau

Le plus facile à rater, parce qu'il faut **provoquer** chaque état. `/users` est
le tableau le plus commode pour ça.

| Geste | Ce que tu dois voir |
| --- | --- |
| Charger `/users` (regarder pendant le chargement) | Un **squelette**, pas un écran blanc. C'était `Skeleton.tsx`, écrit puis jamais appelé — le socle du back-office reproduisait le défaut n°1 du dépôt dans son propre socle |
| Taper dans la recherche une chaîne qui ne rend **rien** | **« Aucun résultat pour ce filtre »** + un geste pour **effacer la recherche**. Cette phrase n'existait nulle part dans l'application avant ce lot |
| Comparer avec un tableau **réellement vide** (aucune donnée créée) | Une phrase **différente**. Les deux disaient la même chose avant |
| Regarder le **compteur** de résultats pendant que tu filtres | Il compte **ce que le tableau rend**, pas un second calcul. Un compteur juste peut promettre un filtre faux |
| Redimensionner une colonne, masquer une colonne, **recharger la page** | Les deux réglages se souviennent |
| Ouvrir le back-office en **navigation privée** | Le tableau se rend **quand même**. En navigation privée l'accès à `localStorage` jette de lui-même — chaque lecture a son `try/catch`, et c'est ce que ce geste vérifie |

**FAIL si** : « aucune donnée » et « aucun résultat pour ce filtre » disent la
même chose · le compteur et le tableau divergent · la navigation privée casse
l'écran · un réglage de colonne ne survit pas au rechargement.

## Ce qui reste OUVERT après ta recette, quoi qu'elle dise

**#1643, #1655, #1656, #1669** sont **entièrement livrées**, chacune commentée
avec sa preuve `fichier:ligne`. Elles ne se closent pas sur du code lu : elles
se closent quand tu auras rendu un PASS. C'est le seul motif qui les tient
ouvertes.
