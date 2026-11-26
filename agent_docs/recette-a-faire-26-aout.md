# Carnet de recette — ce qui reste à vérifier EN LIGNE

> Ouvert le 29/08/2026, parce que l'extension Chrome s'est déconnectée au milieu
> du chantier et que la recette a été mise en attente. **Rien de ce qui suit
> n'est vérifié dans un navigateur.** Tout y est écrit au moment où le code est
> livré, pas au moment où on se souvient — c'est la seule façon dont une liste
> de recette reste vraie.
>
> Règle du dépôt qui commande ce fichier : **ZÉRO régression — balayer TOUTE la
> nav en live après chaque déploiement.** Une suite verte ne dit rien de ce
> qu'un utilisateur voit ; cinq défauts de production ont déjà été trouvés
> derrière 9 000 tests verts.

## Comment s'en servir

1. Reconnecter l'extension Chrome (même compte que Claude Code).
2. Vérifier d'abord **quel commit est déployé** — `GET /api/version`, champ
   `commit`, et ⚠️ `ia.commit` est IMBRIQUÉ : parser le JSON, un grep ment.
   Un front neuf sur une API ancienne rend « non mesuré » là où la feature
   existe : Vercel déploie en 1 min, Railway en plusieurs.
3. ⚠️ **REVÉRIFIER la version à chaque merge.** Vérifier au début ne suffit pas :
   Vercel redéploie en une minute. Une recette qui chevauche un déploiement ne
   rend aucune erreur — elle rend des verdicts sur un état qui n'existe plus.
   Le contrôle après coup : `git diff --name-only <ancien>..<neuf> -- <chemin>`.
4. Cocher au fur et à mesure. Une ligne non cochée n'est PAS un succès.

---

## A. Ce qui attend un déploiement — les quatre lots de la vague B

Aucun n'est en production au 29/08 (prod = `da54e1741`).

### A1 · PR #1230 — la permission qui n'était pas lue

| #    | À vérifier                                                                  | Comment                                                                                                    | Fait |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | :--: |
| A1.1 | Un siège `viewer` ne peut PLUS archiver ni supprimer un fil de conversation | Se connecter avec un compte `viewer`, ouvrir un fil, tenter l'archivage → 403 attendu                      |  ☐   |
| A1.2 | Un membre non-`team:manage` ne peut plus écrire le portefeuille d'offre     | Réglages › profil ESN, tenter d'enregistrer → 403 attendu                                                  |  ☐   |
| A1.3 | Les mêmes gestes marchent toujours pour un `owner`                          | Non-régression : c'est la moitié qu'on casse en corrigeant une permission                                  |  ☐   |
| A1.4 | Aucune autre route du contrôleur `ia` n'est fermée par erreur               | Le guard est fail-open sans `@RequirePermission`, mais ça se vérifie : icebreaker, battlecard, comparaison |  ☐   |

### A2 · PR #1232 / B1 — le prix du site

⚠️ **Nuance mesurée le 29/08** : la production publie déjà `"price":"199"`.
Le repli `'119'` n'est PAS atteint aujourd'hui — le correctif prévient une
occurrence future, il ne répare pas une page actuellement fausse.

| #    | À vérifier                                             | Comment                                                                                                      | Fait |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | :--: |
| A2.1 | Le prix affiché reste 199 € dans les 4 langues         | `/fr`, `/en`, `/de`, `/nl`                                                                                   |  ☐   |
| A2.2 | La donnée structurée porte 199 €                       | `curl … \| grep '"price"'` sur les 4 langues                                                                 |  ☐   |
| A2.3 | **Catalogue injoignable → le nœud `offers` DISPARAÎT** | Le seul vrai test du correctif. Difficile en prod ; à faire en préproduction ou en local avec `API_URL` mort |  ☐   |

### A3 · PR #1232 / B2 — les deux colonnes rebranchées

⚠️ **Aucune saisie n'existe encore** (D142) : tant que le lot UI n'est pas
livré, seule la démo peut montrer le bloqueur.

| #    | À vérifier                                                                                  | Comment                                    | Fait |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | :--: |
| A3.1 | En démo, une mission exige un bon de commande et ne l'a pas → bloqueur `missing_po` visible | Salle de démo › Missions › facturation     |  ☐   |
| A3.2 | Les deux missions « prêtes à facturer » le restent                                          | Non-régression du semis                    |  ☐   |
| A3.3 | Le coût d'intermédiation n'est plus muet sur le canal `partner`                             | Pilotage › marge par canal                 |  ☐   |
| A3.4 | Sur un compte RÉEL, les deux champs restent vides et ne cassent rien                        | Le chemin d'écriture existe, la saisie non |  ☐   |

### A4 · PR #1232 / B3 — le score de débordement

| #    | À vérifier                                                                                 | Comment                                              | Fait |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | :--: |
| A4.1 | Le bloc « Qui déborde » affiche `UnknownValue` et sa raison, JAMAIS un `0` ni une note nue | Découvrir › Territoire                               |  ☐   |
| A4.2 | Le bouton des 4 axes se tabule, s'ouvre à Entrée, annonce `aria-expanded`                  | Au clavier seul, sans souris                         |  ☐   |
| A4.3 | Les 3 signaux non modélisés (S07, S08, S10) sont nommés UNE fois par bloc, pas par ESN     | Loi 4 : rien n'apparaît deux fois sous la même forme |  ☐   |
| A4.4 | Les deux thèmes tiennent, contraste AA                                                     | Basculer clair/sombre sur ce bloc                    |  ☐   |
| A4.5 | ⚠️ En production le score est TOUJOURS `null` (8 signaux sur 11 non collectés)             | Donc A4.1 est le cas NOMINAL, pas le cas dégradé     |  ☐   |

### A5 · PR #1232 / B4 — le faux zéro du pilotage

| #    | À vérifier                                                                                           | Comment                                                                           | Fait |
| ---- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | :--: |
| A5.1 | « Ce que Bellum a contribué » : une lecture qui échoue affiche « non mesuré » + la population nommée | Difficile à provoquer ; au minimum vérifier qu'un vrai `0` s'affiche toujours `0` |  ☐   |
| A5.2 | Le contrôle « Doublons non tranchés » mène à `/pilotage/qualite`, PAS à `/team`                      | Pilotage › Qualité de donnée                                                      |  ☐   |
| A5.3 | Le geste « Arbitrer » fonctionne SANS CRM connecté                                                   | Sur un espace sans connecteur                                                     |  ☐   |
| A5.4 | Le panneau des doublons n'apparaît plus dans Connaissances                                           | Il en est SORTI, il n'y est pas en double                                         |  ☐   |
| A5.5 | Le libellé dit bien « Doublons non tranchés » et non « de contacts »                                 | La requête compte aussi les comptes                                               |  ☐   |
| A5.6 | ⚠️ En démo, les 4 lignes de contribution valent `0` — c'est VRAI (D145)                              | Ne pas le prendre pour le défaut corrigé                                          |  ☐   |

---

## B. Les défauts que les recomptages ont vus, jamais recettés

Trouvés en lisant le code, **non reproduits dans un navigateur**. Chacun peut
se révéler faux : un repli honnête ressemble à une panne, et une panne à un
repli honnête.

| #    | Défaut supposé                                                                                              | Où                                                         | Fait |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | :--: |
| B.1  | `/missions/suivi` et `/missions/planification` : **zéro occurrence** dans le dépôt                          | Vérifier ce que l'app fait quand on tape l'URL             |  ✅  |
| B.2  | La sélection de `/accounts` n'a **aucun producteur** — `SelectionBar` et `CompareDialog` inatteignables     | Comptes : y a-t-il une case à cocher ?                     |  ❌  |
| B.3  | Les 6 actions de ligne d'un compte vivent au **clic droit** — « un commercial ne fait pas de clic droit »   | Comptes › une ligne                                        |  ✅  |
| B.4  | `AccountsGrid` / `AccountCard` / `ViewModeToggle` sans appelant, `viewMode` codé en dur                     | Y a-t-il un bascule liste/grille ?                         |  ✅  |
| B.5  | `raw_analysis.access_barrier` est calculé, semé, lu — **rendu par aucun écran**                             | Compte › onglet Accès                                      |  ☐   |
| B.6  | Les 7 bascules du board de sprints ont un appelant et **aucun producteur**                                  | Board de sprints : une carte bouge-t-elle seule ?          |  ☐   |
| B.7  | Le board de sprints est **vide en démo** (`grep -c sprint` = 0 sur le semis)                                | Salle de démo                                              |  ☐   |
| B.8  | `siteFit` calculé et servi, l'onglet Sites lit `raw_analysis.sitesFrance`                                   | Compte › onglet Sites                                      |  ☐   |
| B.9  | Sur les 4 surfaces de Laura du palier 1, **une** existe (la bulle)                                          | Laura : panneau ? barre de commande ? bloc d'écran ?       |  ☐   |
| B.10 | `useLaura.ts:71` guette `[data-analysis-running="true"]`, **posé par aucun composant**                      | Laura se tait-elle pendant une analyse ?                   |  ☐   |
| B.11 | Le montant du pipe est visible de **tous**, sans `canReadFinance`                                           | Se connecter en `sales` : voit-il les montants du kanban ? |  ☐   |
| B.12 | La porte d'écriture CRM est complète et **sans écran** (`GET /crm/write-requests` sans appelant)            | Y a-t-il un écran de demandes en attente ?                 |  ☐   |
| B.13 | 4 fournisseurs administratifs interrogés, **jamais rendus** (Yousign, DocuSign, Qonto, Tiime)               | Intégrations : signatures et factures s'affichent-elles ?  |  ☐   |
| B.14 | `proposeMapping` calculé, renvoyé, **jeté** par `ImportWizard.tsx:82-83`                                    | Import : les étapes 2 et 3 existent-elles ?                |  ☐   |
| B.15 | 7 libellés de geste sur 10 manquent → l'écran affiche la CLÉ BRUTE                                          | Facturation : « `readiness.actions.ask_po` » à l'écran ?   |  ⚠️  |
| B.16 | `/integrations` déclaré onglet d'Actions mais rend `SettingsPage` — la barre d'Actions disparaît            | Actions › Intégrations                                     |  ✅  |
| B.17 | `analysesAffordable` sans appelant — « combien de dossiers puis-je encore ouvrir »                          | Facturation / bandeau de crédits bas                       |  ☐   |
| B.18 | La contradiction du board Missions : le contrat dit « on ne déplace pas », `POST /missions/:id/move` tourne | Peut-on glisser une carte ?                                |  ☐   |

### Ce que la recette du 29/08 a établi

Six points vérifiés en production (`da54e1741`), sur le compte réel de Louis.

| #    | Verdict                        | Ce qu'on sait maintenant                                                                                                                                                                                                                                                                                 |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B.1  | ✅ **CONFIRMÉ** 29/08          | Les deux URL rendent « Page introuvable » en production. Le recomptage avait vu juste.                                                                                                                                                                                                                   |
| B.2  | ❌ **RÉFUTÉ** 29/08            | Les cases à cocher EXISTENT (colonne de gauche + entête), et sélectionner deux comptes fait bien apparaître « 2 comptes sélectionnés · Comparer ». Le §12.7 bâtissait tout un récit sur des composants « définis, testés et inatteignables » — c'est faux contre la production. **Corriger le tracker.** |
| B.3  | ✅ **CONFIRMÉ** 29/08          | Sept actions au clic droit — Partager, Relancer, Demander à Laura, Déplacer, Rattacher, Archiver, Supprimer — et AUCUN bouton visible sur la ligne n'y mène. Le dépôt admet déjà le défaut en commentaire, mais pour une SEULE action.                                                                   |
| B.4  | ✅ **CONFIRMÉ** 29/08          | Aucune bascule liste/grille sur `/accounts`. Le bouton en haut à droite ouvre un panneau « Comptes proches de ta cible », pas une vue.                                                                                                                                                                   |
| B.15 | ⚠️ **NON REPRODUCTIBLE** 29/08 | Le mois affiché n'a qu'une ligne, en « Facturé ailleurs », et elle rend une vraie phrase française. Les libellés manquants concernent d'AUTRES bloqueurs. Ni confirmé ni réfuté — à refaire sur un mois portant un `ask_po` ou un `missing_rate`.                                                        |
| B.16 | ✅ **CONFIRMÉ** 29/08          | `/integrations` s'affiche dans la coque des RÉGLAGES (« Retour à l'app », colonne Personnel / Espace de travail). La barre d'onglets d'Actions disparaît entièrement.                                                                                                                                    |

⚠️ **Le motif qui se dégage, et il compte plus que les six verdicts** : un
recomptage sur trois se révèle PÉRIMÉ dans le bon sens. B.2 était une
affirmation détaillée, chiffrée (« 0 occurrence de `Checkbox` »), et fausse.
C'est la quatrième fois dans ce chantier — après PDF-01 (+16 pts), PDF-03
(+12 pts) et le §4.9. **Un audit de code vieillit en jours, et il vieillit
toujours dans le sens du pessimisme.**

### ⚠️ Une erreur de protocole, et comment elle a failli fausser six verdicts

**Le 29/08, j'ai vérifié la version déployée AU DÉBUT de la recette (`da54e1741`),
puis j'ai mergé trois PR AU MILIEU, et j'ai continué à tester sans revérifier.**
La production s'est redéployée pendant ce temps — Vercel en une minute — et les
derniers écrans testés tournaient sur `bd1c7ab4c`, pas sur ce que je croyais.

Ce qui a sauvé les verdicts est une vérification APRÈS COUP, pas de la chance :

    git diff --name-only da54e1741..bd1c7ab4c -- <le chemin de l'écran testé>

- `/accounts` : **aucun fichier touché** → B.2, B.3, B.4 tiennent.
- `/integrations`, `/missions`, les routes : **aucun fichier touché** → B.1, B.15, B.16 tiennent.
- `pilotage/` et `governance/` : **touchés** → ce que j'ai vu sur Qualité des
  données n'était PAS l'ancien état, c'était le correctif fraîchement déployé.

**La règle qui manquait, et qui est maintenant au §1 de ce carnet** : vérifier la
version au début NE SUFFIT PAS. Il faut la revérifier **à chaque fois qu'on merge**,
et ne jamais recetter pendant qu'on déploie. Une recette qui chevauche un
déploiement ne rend aucune erreur : elle rend des verdicts sur un état qui n'existe
plus.

### A5.2 et A5.4 — vérifiés sans l'avoir prévu

Le redéploiement a mis le correctif du pilotage en ligne pendant la recette. Vu de
mes yeux sur `/pilotage/qualite` :

- **A5.2 ✅** — « Doublons non tranchés » porte « Arbitrer **↓** », flèche vers le
  BAS : le geste descend au panneau de la même page, il ne part plus vers `/team`.
- **A5.4 ✅** — le panneau « Doublons repérés » est bien sur CET écran, avec sa
  phrase « Bellum PROPOSE, il ne fusionne jamais ».
- **A5.6 ✅** — l'écran distingue proprement « 0 » d'un « rien à mesurer » :
  « aucun consultant dans ton espace — rien à mesurer » n'est PAS écrit « 0 ».

### Un défaut TROUVÉ par la recette, absent de tous les recomptages

**La colonne des libellés s'écrase, un mot par ligne**, sur les trois contrôles aux
libellés les plus longs (« Consultants à disponibilité inconnue », « Missions
actives sans date de fin », « Missions sans coût chargé ») — pendant que la moitié
droite de l'écran est vide. Les libellés courts passent, donc le défaut est
invisible tant qu'on ne regarde pas les longs.

Aucun recomptage ne l'avait vu : **il ne se lit pas dans le code, seulement à
l'écran.** C'est précisément ce que la recette live sert à trouver. Un lot est
parti le corriger.

---

## C. Ce qui n'a JAMAIS pu être vérifié — nommé, jamais compté comme fait

Repris du §9.3 du tracker. **Ne pas cocher sans preuve.**

| #   | Ce qui manque                                                    | Ce qu'il faudrait                                                                 | Fait |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | :--: |
| C.1 | Le cron des interventions de **06h10** (#1195)                   | Jamais observé — la session d'origine commençait à 23h04                          |  ☐   |
| C.2 | Ce qui **sectionne le flux SSE** de #1187                        | Prouvé : un EOF propre sans évènement terminal. Il faut les logs Railway du 28/08 |  ☐   |
| C.3 | Les **affectations des 7 missions** de la salle de démonstration | —                                                                                 |  ☐   |
| C.4 | La campagne `--effort none` du banc                              | Elle appelle des modèles payants ; l'outillage l'a refusée                        |  ☐   |

---

## E. Les blocages d'outillage rencontrés — et ce qu'ils coûtent

| #   | Blocage                                                                               | Ce qu'on en sait                                                                                                                                                                                                                                                                                     | Fait |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| E.1 | **L'extension Chrome ne voit aucun navigateur** (`list_connected_browsers` rend `[]`) | Cause établie : un `/login` en cours de session a changé de compte. L'extension est restée appairée à l'ANCIEN. Même cause racine que l'artefact d'avancement disparu au même moment. **Un redémarrage de Chrome ne suffit pas** — il faut réappairer l'extension au compte que Claude Code utilise. |  ☐   |
| E.2 | ⚠️ **Vérifier le compte AVANT de commencer la recette**                               | Une recette lancée sur le mauvais compte ne rend pas d'erreur : elle rend les écrans d'un AUTRE espace. C'est le défaut « premier cookie = mauvaise identité », déjà payé ici (démo et vrai compte mélangés).                                                                                        |  ☐   |
| E.3 | `resize_window` exige un **onglet NEUF**                                              | `innerWidth` reste à 1800 sur un onglet déjà rendu. Sans ça on conclut que le mobile n'est pas recettable, ce qui est faux.                                                                                                                                                                          |  ☐   |

---

## D. Le protocole, à chaque passage

- **Balayer TOUTE la nav**, pas seulement l'écran touché (règle ZÉRO régression).
- **Les deux thèmes** — clair et sombre sont une promesse (D79), contraste AA.
- **Le mobile** — une seule borne à 768 px. ⚠️ `resize_window` exige un **onglet
  NEUF** : `innerWidth` reste à 1800 sur un onglet déjà rendu, et on croit alors
  que le mobile n'est pas recettable.
- **La salle de démo AUSSI** — c'est ce qu'un prospect voit. Un écran livré mais
  vide en démo se découvre en réunion, pas en CI.
- **Le clavier seul** sur tout ce qui se clique.
- **Un onglet par agent** si la recette est parallélisée ; `computer` seul ne se
  partage pas.
- Fermer les onglets créés en fin de session, jamais ceux qui préexistaient.

---

## F. La seconde vague B — quatre lots, 55 points

Écrits par les agents qui ont livré, au moment où ils livraient. Aucun n'est
vérifié. ⚠️ **Rien de tout ça n'est en production** tant que la PR n'est pas
mergée ET déployée : vérifier `GET /api/version` AVANT de cocher quoi que ce soit.

### F1 · B5 — la fiche mission et l'écran Encaissements

**Les deux saisies** (elles n'existaient pas ; c'est ce lot qui rend utilisable le chemin d'écriture livré par B2)

| #    | Geste                                                                                                        | Attendu                                                                                               | Fait |
| ---- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | :--: |
| F1.1 | `/missions` › « Convergence des systèmes d'entrepôt — lots interfaces et reprise » › Conditions commerciales | Case « Bon de commande exigé » **cochée**, commission à **65**                                        |  ☐   |
| F1.2 | Décocher le bon de commande, rouvrir                                                                         | La commission vaut **toujours 65** ; coût, canal, n° BDC, cadence, préavis inchangés                  |  ☐   |
| F1.3 | Vider la commission, enregistrer, rouvrir                                                                    | Champ **vide** — pas revenu à 65                                                                      |  ☐   |
| F1.4 | Saisir **0**, enregistrer, rouvrir                                                                           | Affiche **0**, pas vide. _(Zéro est une réponse, pas une absence.)_                                   |  ☐   |
| F1.5 | Passer le canal en **Direct**                                                                                | Le champ disparaît, une phrase nomme la commission restante **avec son montant** + bouton « Effacer » |  ☐   |
| F1.6 | Mission déjà en Direct sans commission                                                                       | Ni champ, ni avertissement                                                                            |  ☐   |
| F1.7 | Rôle **sans `finance:read`**                                                                                 | Ni case, ni commission, ni coût — seulement « ne sont pas dans ton périmètre »                        |  ☐   |
| F1.8 | Cocher « BDC exigé » sur une mission au n° vide, puis `/missions/facturation` sur son mois                   | Le bloqueur « bon de commande exigé et absent » apparaît                                              |  ☐   |

**L'écran Encaissements**

| #     | Geste                               | Attendu                                                                                                        | Fait |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | :--: |
| F1.9  | `/missions`                         | Onglet « Encaissements » après « Facturation », mène à `/missions/encaissements`                               |  ☐   |
| F1.10 | L'écran                             | Phrase « Les 12 derniers mois » + bandeau « Bellum n'émet aucune facture »                                     |  ☐   |
| F1.11 | Les quatre compteurs                | Montant **ET** nombre ; « En retard » **pas** à zéro                                                           |  ☐   |
| F1.12 | Le seau « En attente »              | « 0 facture » **sans aucun montant** — pas « 0 € »                                                             |  ☐   |
| F1.13 | Une ligne en retard                 | Badge coloré « N jours de retard », prochaine action « Relance n°1 due »                                       |  ☐   |
| F1.14 | Thème clair ↔ sombre                | Badges de statut et de gravité lisibles des deux côtés                                                         |  ☐   |
| F1.15 | Menu de ligne **au clavier seul**   | Tab jusqu'au bouton, Entrée ouvre, flèches parcourent                                                          |  ☐   |
| F1.16 | « Marquer réglée »                  | Toast, la ligne passe « Réglée » et bascule dans « Encaissé »                                                  |  ☐   |
| F1.17 | Rouvrir le menu d'une ligne réglée  | « Marquer réglée » **absent**                                                                                  |  ☐   |
| F1.18 | Ligne en litige (M-6)               | « Lever le litige » proposé, **pas** « Déclarer » ; la colonne action dit « Lever le litige », pas une relance |  ☐   |
| F1.19 | Déclarer un litige sans motif       | Le bouton de confirmation reste **inerte**                                                                     |  ☐   |
| F1.20 | Sous le tableau                     | « Rien ne part tout seul » ; aucun bouton d'envoi ni de brouillon                                              |  ☐   |
| F1.21 | **Sans `finance:read`**             | Colonne Montant vide, compteurs en nombres seuls, « Montants réservés » **une seule fois**, **aucun « 0 € »**  |  ☐   |
| F1.22 | **< 768 px**                        | Tableau en cartes, aucun défilement horizontal du corps, menu atteignable au doigt                             |  ☐   |
| F1.23 | Recharger et observer le chargement | **Aucun chiffre fugace** avant que les compteurs soient définitifs                                             |  ☐   |
| F1.24 | **Lien de démonstration public**    | Refaire 10, 11, 13, 18 : la salle montre du retard et un litige                                                |  ☐   |
| F1.25 | Interface en **anglais**            | « Collections », colonnes et statuts traduits, aucune clé brute                                                |  ☐   |

⚠️ **Deux manques CÔTÉ API, assumés et non inventés** : la colonne « Validation du relevé » (`validated_by_client_at` n'est jamais joint à la ligne de facturation) et l'échéance dérivée des conditions de règlement (aucun champ `payment_terms` au modèle). L'agent s'est arrêté plutôt que d'afficher « on ne sait pas » sur toutes les lignes.

### F2 · B6 — la barrière d'achat sur l'onglet Accès

| #     | Geste                                   | Attendu                                                                                                                | Fait |
| ----- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | :--: |
| F2.1  | **Thales** › onglet Accès               | Carte « Comment ce compte achète » **sous** « Ce qui verrouille », badge « Semi-ouvert · barrière 5,7/10 »             |  ☐   |
| F2.2  | Compter les proxies                     | **Six** lignes ; « Cotation en bourse » porte **« non mesuré » et aucun chiffre**                                      |  ☐   |
| F2.3  | Additionner les contributions           | Thales +3,15 +1,05 +1,5 → **5,7** ; leboncoin → 2,3 ; NOVA LOGISTIQUE → 6,1                                            |  ☐   |
| F2.4  | **leboncoin** › Accès                   | « Ouvert probable · 2,3/10 », **deux** proxies non mesurés                                                             |  ☐   |
| F2.5  | Ligne « Ancienneté »                    | **« 0 »** sans signe, en gris — **pas** « non mesuré ». _C'est toute la distinction._                                  |  ☐   |
| F2.6  | Ligne de provenance                     | « Registre public · estimée le \<date\> », date = celle de la dernière analyse                                         |  ☐   |
| F2.7  | **Société Générale / SNCF / BlaBlaCar** | « Barrière non estimée sur ce compte » + pourquoi, **aucun « /10 »**. ⚠️ Trancher si c'est acceptable en démonstration |  ☐   |
| F2.8  | **NOVA LOGISTIQUE**                     | La phrase « ne vise pas le siège » est toujours là (sa classe passe de D à C)                                          |  ☐   |
| F2.9  | Interface en **anglais**                | « Semi-open · barrier 5.7/10 » — libellé traduit **et** point décimal                                                  |  ☐   |
| F2.10 | Retour en français                      | Virgule décimale partout (**5,7**, **+4,05**)                                                                          |  ☐   |
| F2.11 | Thème clair ↔ sombre                    | Contributions rouges et vertes lisibles des deux côtés                                                                 |  ☐   |
| F2.12 | **< 768 px**                            | Les preuves longues passent à la ligne **dans** la carte, aucun défilement horizontal                                  |  ☐   |
| F2.13 | Compte en procédure collective          | L'avertissement apparaît **une seule fois**, pas répété dans la carte barrière                                         |  ☐   |
| F2.14 | Compte au marché arrivant à échéance    | La ligne de correction s'affiche sous les proxies                                                                      |  ☐   |
| F2.15 | Toute la carte                          | **Aucun `%`, aucun « chance » ou « probabilité »** ; « ouvert **probable** », jamais « ouvert » ni « facile »          |  ☐   |

⚠️ **Les 5 axes du plan de compte ne sont PAS livrés, et c'est mesuré** : `_addressability` n'a qu'un appelant, dans le scoring de Découvrir, et sa sortie ne va jamais dans `raw_analysis`. Les recoder côté API serait une seconde implémentation d'une dérivation. **C'est un lot à part, et il faut un producteur côté IA d'abord.**

### F3 · B7 — langues, habilitations, et l'axe qui ne bloquait rien

| #     | Geste                                                                            | Attendu                                                                                                                                                                                                                                | Fait |
| ----- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| F3.1  | `/projects/needs` › cliquer un intitulé                                          | Carte **« Ce que le poste exige »** sur la fiche                                                                                                                                                                                       |  ☐   |
| F3.2  | Un rôle qui n'exige rien                                                         | Les lignes ne disent **pas** « aucune » : elles nomment la conséquence (« sort du calcul au lieu de valoir zéro »)                                                                                                                     |  ☐   |
| F3.3  | Modifier › taper `en:c1` et `Confidentiel Défense` › Enregistrer › **recharger** | Les deux valeurs sont **toujours là**. _(C'est le round-trip qui n'existait pas.)_                                                                                                                                                     |  ☐   |
| F3.4  | Modifier puis Enregistrer sans rien changer                                      | Aucun toast, aucune écriture                                                                                                                                                                                                           |  ☐   |
| F3.5  | Vider les habilitations, enregistrer, recharger                                  | La phrase d'absence revient                                                                                                                                                                                                            |  ☐   |
| F3.6  | **LE POINT CENTRAL** — rapprochement sur ce rôle                                 | Un consultant sans l'habilitation **n'est plus dans « Correspondances »** ; il est en « Limites »/« Exclus » avec « habilitation requise non détenue ». L'ajouter sur sa fiche → il remonte. _(Avant : recommandé dans les deux cas.)_ |  ☐   |
| F3.7  | Langues                                                                          | Besoin `en:c1` + consultant `en:a2` → sort des recommandés. Consultant `en:b2` → **reste** recommandé                                                                                                                                  |  ☐   |
| F3.8  | Tiroir de rapprochement, profil déjà refusé chez ce client                       | Ligne **rouge** avec **la date** ; même couleur et même date que le panneau du vivier                                                                                                                                                  |  ☐   |
| F3.9  | Fiche : plancher, budget, expertise, environnement, contexte, contraintes        | Un champ absent porte sa phrase, **jamais « 0 € »**                                                                                                                                                                                    |  ☐   |
| F3.10 | « Plus de filtres » › pied « Ce qui ne se filtre pas ici »                       | Langues/habilitations ne sont plus dites « portées par le consultant » ; le tarif cible ne mentionne plus le droit financier                                                                                                           |  ☐   |
| F3.11 | **Démo** › « Ingénieur systèmes industriels — supervision d'entrepôt »           | `Confidentiel Défense`, `FR · natif`, `EN · b2`, contexte, contraintes, plancher 480 €                                                                                                                                                 |  ☐   |
| F3.12 | **Démo** › rapprochement sur « Consultant sécurité applicative »                 | Inès Kaczmarek passe l'habilitation, les autres sont écartés dessus                                                                                                                                                                    |  ☐   |
| F3.13 | Thème clair ↔ sombre sur la fiche et le tiroir                                   | Badge rouge d'habilitation et ligne rouge du drapeau lisibles des deux côtés                                                                                                                                                           |  ☐   |
| F3.14 | **< 768 px**                                                                     | La carte ne déborde pas, champs et boutons ≥ 44 px                                                                                                                                                                                     |  ☐   |
| F3.15 | Interface en **anglais**                                                         | Revérifier F3.1, F3.2 et F3.9 — aucune clé brute                                                                                                                                                                                       |  ☐   |

### F4 · B8 — le contrat et le registre

| #    | Geste                                                  | Attendu                                                                                                                            | Fait |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | :--: |
| F4.1 | `/territory` sur un département, **après déploiement** | Le bloc « Qui déborde » affiche toujours ses ESN, sa raison de non-mesure, et la ligne des angles morts — dans les **deux thèmes** |  ☐   |

⚠️ **Un seul point, et il a une raison précise** : l'écran a changé de **chemin de lecture** (le score est typé au lieu d'être reconnu). En régime normal c'est identique — mais le dépôt connaît « front neuf sur API ancienne » (Vercel déploie en 1 min, Railway en plusieurs). Pendant cette fenêtre, un score mal formé ne serait plus neutralisé à l'arrivée. Le reste du lot (registre de doctrine, contrat) n'a **aucune surface utilisateur**.

---

## H000. RECETTE LIVE du 30/08 — cinq constats d'hier VÉRIFIÉS corrigés

⚠️ **Pour la première fois, les trois services sont sur le MÊME commit** :
`ea2bf31ff` (vague H). API, moteur IA et front alignés — donc ce qui suit
porte sur du code réellement déployé. Les deux passes précédentes avaient été
faites sur des services décalés d'une vague.

Compte observé : **ROCHE**, analyse du 29/08 à 08:51 — **non ré-analysée**.
C'est important : les correctifs qui vivent dans le GÉNÉRATEUR ne valent que
pour les analyses futures, ceux qui vivent en LECTURE valent tout de suite.

### Corrigé et vu à l'écran

| Constat du 29/08                                                   | État au 30/08                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Entités couvertes **26/27** », une PERSONNE comptée comme entité | **26/26**, avec « Écarté du décompte : Wafaa Mamilli — Chief Digital Technology Officer — **une personne, pas une entité** ». Corrigé en LECTURE, donc visible sans ré-analyse. |
| Le composant **Identité** écrivait « un profil LinkedIn »          | « un email ou **un profil sur un réseau professionnel** ». Les deux formulations du même écran (Identité et Sources) **coïncident enfin**.                                      |
| Les **25 cartes** de l'organigramme portaient « LinkedIn »         | « **Réseau professionnel · date inconnue** », et c'est un **lien**.                                                                                                             |
| **Aucune carte ne portait de date de source**                      | La date est là — et elle dit « **inconnue** » plutôt que d'inventer celle du jour.                                                                                              |
| Rien ne bornait l'affichage des directions                         | Rangée de **4 directions** + « **+ 1 autre direction cartographiée, au sélecteur ci-dessus** ». Le compte est exact, et le chemin vers les autres existe.                       |

### Mesuré en passant — un chiffre qui bouge, et ce qu'il dit

« **341** dans une famille cible » contre **333** le 29/08 : la correction du
registre des familles (un libellé sur dix résolvait) se voit en chiffres.

⚠️ **Mais « Cohérence » n'est passée que de 13 à 14 sur 100.** Or ce composant
compte les contacts qu'on sait situer « une famille **ET** un niveau ». Si
corriger la famille ne déplace l'aiguille que d'un point, **le goulot est le
NIVEAU**. Le prochain lot sur ce sujet doit viser la résolution du niveau
hiérarchique, pas les familles — c'est mesuré, pas supposé.

### Attendu, à ne PAS remonter comme une régression

Le bandeau « seules **0 %** ne portent aucun rôle de décision, alors que le
plancher est de 60 % » **est toujours là**, et c'est normal : le correctif
(l'absence de valeur « inconnu » dans le schéma du prompt) vit dans le
**générateur**. Il ne vaudra que sur une analyse **relancée**.

**À faire pour le vérifier** : « Actualiser l'analyse » sur ROCHE — 8 crédits —
puis rouvrir l'organigramme. Attendu : **beaucoup plus de cartes SANS badge de
rôle**, et le bandeau qui disparaît ou dont le pourcentage remonte au-dessus
de 60 %. ⚠️ Un recetteur non prévenu remonterait ce gris comme une perte de
données : c'est le résultat voulu.

### Toujours ouvert — mon constat n°2 du 29/08

« **Rôles couverts 4/8 — Manquants : Utilisateur, Influenceur, Bloqueur,
Sponsor** » pendant que l'organigramme du même compte badge **20 personnes
« Influenceur »** et 3 « Sponsor ». Inchangé. Deux onglets, deux réponses
opposées à la même question — le motif GA-26. À traiter.

## H00. RECETTE LIVE, seconde passe — la vague E côté API

⚠️ **Le décalage entre services s'est reproduit, dans le même sens.** API sur
`b6b5ba104` (vague E), moteur IA déjà sur `1c037825b` (vague F). **Le backend
retarde d'une vague, systématiquement** — deux mesures, deux fois le même
sens. Le front, lui, est sur Vercel et suit `main` : les raccourcis clavier de
la vague F étaient visibles alors que l'API n'y était pas encore.

**Conséquence de méthode** : « c'est mergé » ne veut pas dire « c'est
recettable ». Trois versions coexistent — front, API, moteur IA — et il faut
les trois pour savoir ce qu'on regarde. `GET /version` les rend toutes ; le
champ `ia.commit` est IMBRIQUÉ, parser le JSON.

### Lot E3 — l'écran de mémoire de Laura : CONFIRMÉ

`/settings/memory`, atteignable **en cliquant** depuis la barre latérale
(Réglages › Personnel › « Mémoire de Laura »).

Quatre couches, chacune expliquée, une croix par ligne. L'entête tient la
promesse du tome 6 : « Tout ce qui est retenu, **en clair**. Chaque ligne
s'oublie d'un clic — et une ligne oubliée disparaît aussi du contexte que
Laura relit. »

**La preuve que ça marche** : la question posée à Laura une heure plus tôt
(« Qui je n'ai pas relancé depuis 6 mois ? ») et sa réponse étaient là, en
clair, sous « Le fil de tes échanges ». C'est exactement ce que l'auteur du
lot voulait faire vérifier — et c'est la question à poser à Louis :
**« est-ce que tu acceptes que ce soit là ? »**

Les cinq interdits sont écrits, et le premier est exactement juste :

> « Le contenu de tes messages. Il est **conservé dans ton journal
> d'activité**, qui est à toi — il n'est **jamais donné à lire** ni à Laura,
> ni à un collègue. »

STOCKER et EXPOSER y sont bien deux décisions distinctes (D65).

**Trois défauts sur cet écran :**

1. **« Ce que tu as refusé » affiche cinq lignes dont trois disent
   « Voir la liste. »** C'est le libellé de l'ACTION de l'intervention, pas ce
   qui a été proposé. Trois lignes identiques datées du 29/08, 28/08 et 28/08 :
   impossible de savoir ce qu'on a refusé. La ligne doit nommer l'INTERVENTION.
2. **Seule la première ligne porte le badge « Tu as refusé »** ; les quatre
   autres n'en ont aucun, donc leur état n'est pas dit. Ou toutes, ou aucune.
3. **« Ta façon de travailler » est vide, et le restera pour tout le monde** —
   l'auteur du lot l'avait annoncé : `PATCH /memory/preferences` n'a aucun
   appelant, rien n'écrit `user_preferences`. La section ne ment pas, mais
   c'est une capacité à moitié branchée, désormais visible en production.

### Lot E11 — les cibles de KPI : CONFIRMÉ, et l'écran est un modèle

`/pilotage/finance`. À garder comme référence de ce que « non mesuré n'est
jamais zéro » veut dire à l'écran :

> « Signé · **Aucune source pour ce chiffre — rien n'a encore été
> enregistré. Ce n'est pas « zéro euro ».** »
> « Facturé · **Des lignes existent, aucune ne porte de montant. Le chiffre
> reste inconnu.** »
> « Espéré · **614 lignes existent**, aucune ne porte de montant. »

Il distingue **trois** états, pas deux : aucune source · des sources sans
montant · un vrai zéro (« Acquis · 0 ligne · 0 € », qui est vrai).

Les cibles sont là et portent leur sens : `Cible < 5 %`, `Cible 25 – 40 %`,
`Cible < 10 % · complétude`, `Cible < 65 j`. Le minimum d'échantillon est
nommé (« non mesurable — 0 consultant sur les 5 nécessaires »). Et le refus
de la probabilité est écrit **pour l'utilisateur**, pas seulement dans le
code : « Trois lignes, aucune pondération : **un montant multiplié par une
probabilité n'existera jamais.** »

Deux phrases à reprendre ailleurs dans le produit :

- « Quatre chiffres qui disent quatre choses. **Les additionner n'aurait aucun sens.** »
- « Ces montants **ne s'additionnent pas** : c'est le même argent vu sous plusieurs empêchements. »

### Confirmé au passage — la vague F côté FRONT est déjà en ligne

Les raccourcis clavier apparaissent dans la barre latérale : `⌘ K` sur le
bouton Laura, `G C` / `G P` / `G T` / `G M` / `G A` / `G L` / `G J` sur les
entrées de navigation. Le défaut circulaire est levé — on ne les devine plus.

## H0. RECETTE LIVE du 29/08 au soir — ce qui a été VU, sur `69cb5705d`

⚠️ **Les deux services n'étaient pas sur le même commit** au moment de cette passe :
API sur `69cb5705d` (vague D), service IA déjà sur `b6b5ba104` (vague E). La
vague E côté API n'est donc **pas** recettée ici. Vérifié par
`GET /version` — le champ `ia.commit` est IMBRIQUÉ, il faut parser le JSON.

Compte observé : **ROCHE** (`6c8f4edc`), analysé le 29/08 à 08:51.

### Ce qui est CONFIRMÉ en ligne

| Lot          | Ce qui a été vu                                                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D3**       | La vue par défaut de l'organigramme est bien **« Direction focale »**, la vue Groupe est secondaire (« Voir la vue système »). L'écran écrit lui-même la règle : « La position verticale vient de la hiérarchie réelle. Les badges disent le rôle commercial ; ils ne déterminent jamais un niveau. » |
| **A3**       | La colonne **« Achats et contrôle »** existe, hors de l'arbre : « Canal parallèle : ces personnes participent au circuit d'achat sans dépendre de la ligne hiérarchique ci-dessus. »                                                                                                                  |
| **doctrine** | `Effectif` affiche « Non identifié dans les sources », jamais `0`. Une source sans date affiche « date inconnue ». L'ajout manuel dit : « Une entité ou un N+1 qu'on ne retrouve pas dans le dossier ne sont pas inventés : la personne est ajoutée sans rattachement. »                              |

### Les six défauts VUS

**1. « LinkedIn » et « réseau professionnel » sur le MÊME écran, à quatre lignes d'écart.**
Onglet Couverture, bloc « Pourquoi cette confiance ? » :

- composant **Identité** : « Contacts joignables : un email ou **un profil LinkedIn**. »
- composant **Sources** : « Contacts venus d'une source vérifiable (**réseau professionnel**, registre officiel, import). »

C'est la même source, nommée deux fois différemment, dont une viole
« jamais de nom d'éditeur côté app, sauf Réglages › Intégrations ». Idem sur
l'organigramme : **les 25 cartes de personne portent « LinkedIn »** en source,
quand le panneau « Sources et confiance » du même dossier écrit « Réseau
professionnel ». **Le lot D4 est mergé et ne l'a pas attrapé.**

**2. Un compte affiche « Rôles couverts 4/8 — Manquants : Utilisateur, Influenceur, Bloqueur, Sponsor »
pendant que son organigramme badge 20 personnes « Influenceur » et 3 « Sponsor ».**
Deux onglets du même dossier, réponses opposées à la même question. C'est le
motif « deux chemins qui refont la même dérivation divergent » (GA-26).

**3. « Couverture décisionnelle : 100 % » à côté de « Rôles couverts : 4/8 ».**
Le 100 % se dit « mélange de la largeur (familles) et de la profondeur
(niveaux) » — les rôles n'y entrent pas. Mais un titre à **100 %** posé à côté
de **la moitié des rôles manquants** se lit comme une contradiction, et le
chiffre est **nu** : ses axes vivent dans une AUTRE carte, plus bas.

**4. Une PERSONNE est comptée comme une ENTITÉ.**
« Entités couvertes **26/27** · À ouvrir : **Wafaa Mamilli — Chief Digital
Technology Officer** », et la même chaîne apparaît en fin de liste des
« Familles de décision » avec « (aucun contact) ». Un nom de personne a été
ingéré comme entité métier — et il gonfle le dénominateur.

**5. « Identité 1/100 » avec « Couverture 100/100 ».**
Presque aucun contact n'est joignable, et l'écran annonce que les familles et
niveaux du comité d'achat sont « effectivement tenus ». Couvrir un compte avec
des contacts qu'on ne peut pas joindre n'est pas le couvrir. Le décompte en
cinq composants est juste et honnête ; c'est leur LECTURE conjointe qui ment.
À rapprocher de **« Cohérence 13/100 — contacts qu'on sait situer : une famille
ET un niveau »** : 87 % des contacts ne se placent pas, alors que
l'organigramme place ses 23 personnes en L1 sans hésiter.

**6. Le plancher de gris est violé, et l'écran le dit.**
« sur les 35 personnes que l'analyse n'a pas enrichies, seules **0 %** ne
portent aucun rôle de décision, alors que le plancher est de **60 %**. Sous ce
seuil, une partie des rôles est déduite du titre, pas d'une preuve. »
Vérifié sur le texte : **25 cartes, 25 badges, zéro nœud gris**. Et
**`0 liens vérifiés` sur `29 liens probables`**, alors que la position verticale
est annoncée comme « la hiérarchie réelle ».
⚠️ Aucune carte ne porte **de date de source** ni de **badge « déduit »**,
que le tome 5 exige pourtant sur chaque nœud.

### Lot D8 — `search_dormant_network`, testé en espace RÉEL : conforme

Question posée mot pour mot : « Qui je n'ai pas relancé depuis 6 mois ? »
Réponse à 23:01, sur `69cb5705d`.

| Point à vérifier                          | Résultat                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Aucune adresse e-mail dans la réponse** | ✅ **tenu.** L'outil dit « email disponible » / « email absent » / « LinkedIn disponible » — il rapporte la PRÉSENCE d'une coordonnée sans jamais l'exposer. |
| Le coût est annoncé avant le clic         | ✅ « L'enrichissement d'un contact non renseigné coûterait **1 crédit s'il aboutit** ; aucun crédit n'est consommé pour cette recherche. »                   |
| Ce qui n'a pas été montré est NOMMÉ       | ✅ « la recherche retourne **496 contacts** ; je n'ai affiché ici que les contacts les plus pertinents dans les comptes déjà suivis. »                       |
| Aucune déduction non fondée               | ✅ « Elle ne permet pas de déduire qu'un besoin est actuellement ouvert. »                                                                                   |
| Provenance                                | ✅ lien « Voir la source » + badge « **4 données manquantes** »                                                                                              |

⚠️ **Sauf le nom d'éditeur** : « LinkedIn disponible » sort dans la réponse de
Laura. C'est le **troisième** endroit, après les 25 cartes de l'organigramme et
le composant « Identité » de la couverture.

### Le défaut n°1 à traiter en premier — trois emplacements prouvés

`agent_docs/dossier-26-aout-2026.md` porte la règle : _« Jamais de nom
d'éditeur côté app — on nomme la CAPACITÉ. Seule exception : Réglages ›
Intégrations. »_ Le produit a **déjà tranché la bonne formulation** ailleurs :
le panneau « Sources et confiance » écrit « **Réseau professionnel** », et le
composant « Sources » de la couverture écrit « réseau professionnel, registre
officiel, import ». Il ne reste qu'à l'appliquer partout.

| Emplacement                        | Ce qui est écrit                   | `fichier` probable                                  |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Organigramme, **25 cartes**        | « LinkedIn »                       | la carte de nœud de la vue focale                   |
| Couverture, composant **Identité** | « un email ou un profil LinkedIn » | le libellé du composant de confiance                |
| **Réponse de Laura**               | « LinkedIn disponible »            | le rendu de `search_dormant_network`, ou son prompt |

⚠️ Le lot **D4 est mergé** et n'a attrapé aucun des trois — sa garde ne
regardait donc pas ces trois surfaces. À traiter avec la garde, pas seulement
avec les libellés.

### Balayage ZÉRO régression — 8 écrans, aucun cassé

`/dashboard` · `/accounts` · `/projects` · `/talent` · `/missions` · `/actions`
(+ Chaînes) · `/pilotage` · `/settings` · `/chat`. Tous chargent.

⚠️ Une capture d'écran a expiré une fois sur `/dashboard` (« the renderer may
be frozen ») après trois navigations d'affilée ; **non reproduit** au
rechargement. Transitoire, pas un défaut — mais à re-tenter si ça revient, le
dépôt a déjà payé une boucle de rendu sur la transition `/` → `/dashboard`
(GA-27).

**Deux états vides exemplaires**, à garder comme modèle :

- Missions : « **1 mission terminée n'est pas listée ici** : cet onglet ne montre
  que ce qui tourne. Une mission naît d'un projet signé. » — « zéro ici » et
  « zéro tout court » y sont deux phrases différentes.
- Actions : « Rien à valider. Les actions que Laura prépare arrivent ici avant
  de partir. »

### Lot D5 — les chaînes : CONFIRMÉ

Sept chaînes, chacune avec son bouton **« Démarrer un parcours »** et ses
**« Porte »** posées aux étapes. Les garde-fous sont NOMMÉS à l'écran :
« Une réponse arrête la séquence — définitivement, comme le veut le
**garde-fou N5 n°1**. »

⚠️ **Je n'ai pas cliqué « Démarrer »** : ce serait une écriture dans l'espace
réel. Le chemin de démarrage EXISTE et est atteignable — ce qui était le
défaut. Le déclenchement reste à vérifier sur un compte de recette.

⚠️ Réserve : les étapes sont des **numéros nus** (« 1 2 3 … 22 » sur Onboarding
et delivery), sans libellé visible. Vérifier qu'un survol les nomme ; sinon un
parcours de 22 étapes est illisible.

### Défaut 7 — deux compteurs de « comptes suivis » qui ne disent pas la même chose

| Où                                                 | Ce qui est affiché                        |
| -------------------------------------------------- | ----------------------------------------- |
| `/dashboard`, cockpit                              | « **27** Comptes suivis »                 |
| `/accounts`, bandeau « Où en est le portefeuille » | « **23** suivis »                         |
| Laura, sélecteur de portée                         | « Tout le portefeuille · **23** comptes » |

Même question, deux réponses. Comme le 4/8 des rôles contre les 20 badges
« Influenceur », c'est le motif **« deux chemins qui refont la même dérivation
divergent »** (GA-26). Trouver lequel des deux compte juste — et le faire
vivre à un seul endroit.

### À TRANCHER — la règle du nom d'éditeur s'applique-t-elle au CONTENU d'une action ?

Le plan d'action généré écrit, mot pour mot :

> « Envoyer une **demande de connexion LinkedIn** personnalisée à … »
> « Envoyer un **message LinkedIn J3** à … »
> « **Rechercher sur LinkedIn** et le registre des marchés le process vendor … »

La règle « jamais de nom d'éditeur côté app » a été écrite pour des **libellés
d'interface**. Ici c'est le **contenu** d'une action recommandée à un humain, et
le canal est une information dont le commercial a besoin : « envoyer une
demande de connexion sur ton réseau professionnel » est plus vague, donc moins
utile.

⚠️ À ne pas confondre avec l'interdit de collecte : ces phrases décrivent ce que
**la personne** fait, pas ce que le système collecte. Le refus du scraping
n'est pas en cause.

**Recommandation** : distinguer explicitement les deux surfaces dans la règle —
libellé d'interface (anonymisé) vs contenu d'une action destinée à un humain
(le canal se nomme). Et faire porter la garde sur la première seulement, sinon
elle rendra le plan d'action inutilisable.

### À vérifier au prochain passage

- Le libellé **« Contacts engagés : 2032 »** — 2032 est le nombre de contacts
  DÉCOUVERTS, pas de contacts avec qui on a engagé quelque chose.
- **« Familles couvertes : 8 sur 3 visées »** — un numérateur supérieur au
  dénominateur ; à confirmer comme voulu.
- Les scores nus de la liste de comptes (colonne **« Score /10 »**) et de la
  fiche (**« 16/25 · PRUDENT »**, **« Fiabilité du dossier 83/100 »**).

## H. La vague D — huit lots, mergés le 29/08 au soir

Cinq suites vertes en local (API 7 510 · web 4 713 · contracts 2 442 · IA 5 120 ·
build packages). **Aucun de ces huit points n'a été vu à l'écran.**

⚠️ **Rappel de protocole, payé une fois déjà** : re-vérifier la version déployée
**à chaque merge**, pas seulement au début de la session. `GET /version` rend
`{"commit":…, "ia":{"commit":…}}` — le champ `ia.commit` est **imbriqué**, un
grep le fait mentir, il faut parser le JSON.

| Lot       | Où regarder                              | Ce qui doit se voir                                                           | Le signe que c'est cassé                                                     |
| --------- | ---------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Lot 1** | le score de couverture                   | le dénominateur ne bouge plus avec la quantité de nos données                 | le score monte quand on enrichit, sans que rien de vrai n'ait changé         |
| **Lot 2** | organigramme, deux onglets ouverts       | la seconde correction est **refusée** avec un message, pas écrasée en silence | la première correction disparaît sans que personne ne soit prévenu           |
| **Lot 3** | organigramme                             | la vue par défaut est **focale par direction**, la vue Groupe est secondaire  | on arrive sur la vue Groupe                                                  |
| **Lot 4** | partout **sauf** Réglages › Intégrations | aucun nom de produit tiers — on lit « votre CRM », « votre messagerie »       | un nom d'éditeur hors de l'écran d'autorisation                              |
| **Lot 5** | les chaînes d'automatisation             | une chaîne se **lance**, et la porte journalise qui a décidé                  | un bouton qui ne déclenche rien, ou une écriture sans trace                  |
| **Lot 6** | les colonnes de liste                    | les champs neufs survivent au normaliseur                                     | une colonne vide alors que la donnée existe côté API                         |
| **Lot 7** | les crédits                              | la réservation est **persistée** et rendue au bon persona                     | un crédit débité deux fois, ou une réservation qui disparaît au rechargement |
| **Lot 8** | Laura                                    | voir les cinq questions ci-dessous                                            | —                                                                            |

### Lot 8 — les cinq questions à poser à Laura, mot pour mot

Espace réel ; les quatre premières marchent aussi en démo.

| Outil                    | La question                                      | Ce qu'on attend                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_account_access`     | « Comment j'entre chez NOVA LOGISTIQUE ? »       | verrou `verrouillé`, marché DECP jusqu'au 14/04/2029, coût **3 % via le porteur**, entités classées, barrière **avec ses proxies**. ⚠️ Une entrée annoncée « gratuite » = le relais du coût est cassé. |
| `get_esn_on_account`     | « Qui est déjà en place chez NOVA LOGISTIQUE ? » | Vertex Systèmes (certitude **forte**) et Orsan Conseil (**faible**), avec le jeu `through_partner`. ⚠️ Orsan présenté comme un fait établi = la provenance ne passe pas.                               |
| `search_partners`        | « Avec quelles ESN on travaille ? »              | Astréa (flux actif), Ovalis (en discussion), Novéris (identifié). **Novéris sans score, avec sa raison — jamais « 0 ».**                                                                               |
| `search_dormant_network` | « Qui je n'ai pas relancé depuis 6 mois ? »      | au moins F. Aumont et S. Rambert, **sans adresse e-mail dans la réponse** ; puis « prépare-lui un message » doit enchaîner sur l'identifiant.                                                          |
| `get_territory_overview` | « Qu'est-ce qu'il y a dans le 31 ? »             | 5 blocs, chacun avec son état. **⚠️ Le point à surveiller : la latence.** Budget interne porté à 30 s (défaut 12 s), plafond de tour 90 s.                                                             |

⚠️ Sur le dernier : si Laura répond « le territoire n'a pas répondu » **pendant que
`/territory` s'affiche normalement**, c'est le timeout, pas la source. Et vérifier
qu'un bloc muet est **dit** — jamais lu comme « il n'y a rien là-bas ». C'est la
même faute que « non mesuré » écrit « 0 », transposée à une phrase.

## I. La vague C — mergée le 29/08 (PR #1235)

Non recettée. Les points sont ceux du corps de la PR ; les revoir avant de passer
à l'écran.

## J. Ce que la vague E devra ajouter ici

Huit lots dispatchés le 29/08 au soir, **aucun encore revenu au moment où ces
lignes sont écrites**. Chacun devra déposer ses points dans ce fichier avant
d'être mergé — c'est la seule chose qui empêche un défaut vu dans le code de
passer pour un défaut prouvé.

## H. Les 5 bugs bêta du 14/08 — ce qui n'a JAMAIS été reproduit à l'écran

> Lot E14. Les cinq viennent de `PIPE_MASTER_16aout2026.xlsx` › `ALERTES` › **A03 (BLOQUANT)**,
> remontés par la seule utilisatrice réelle du produit à cette date. Quatre sur cinq avaient été
> traités le jour même (commit `a901203e6`, PR #908) ; **la vérification de ce lot est faite dans le
> CODE, pas dans un navigateur**. Un défaut vu dans le code et jamais reproduit n'est pas un défaut
> prouvé — et un correctif vu dans le code et jamais rejoué n'est pas une correction prouvée. C'est
> la distinction que ce fichier tient.

### H1 · La connexion — le bug le plus cher de la liste

| #    | Geste                                                                                   | Attendu                                                                                                                 | Fait |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | :--: |
| H1.1 | Connexion par mot de passe avec l'adresse **remplie automatiquement** par le navigateur | Elle passe. L'espace de l'autocomplétion ne doit plus produire « adresse email invalide »                               |  ☐   |
| H1.2 | Même geste, adresse saisie sur **mobile** (majuscule automatique en tête)               | Elle passe                                                                                                              |  ☐   |
| H1.3 | Adresse volontairement fausse (`laura` sans domaine)                                    | Refus. Le nettoyage ne doit pas être devenu une tolérance                                                               |  ☐   |
| H1.4 | Mot de passe faux sur un compte QUI EXISTE, puis sur un compte qui n'existe pas         | **Le même message**, mot pour mot. Une réponse qui distingue les deux est un oracle d'énumération de comptes            |  ☐   |
| H1.5 | Se connecter, puis **recharger la page** (F5), puis rouvrir un onglet                   | La session tient. ⚠️ C'est le symptôme que D147 couvre : il se décrit « la connexion échoue » alors que c'est un cookie |  ☐   |
| H1.6 | Vérifier `COOKIE_DOMAIN` et le domaine de l'API en prod                                 | Voir **D147** (§12.6 du dossier) pour la manipulation exacte. À faire AVANT de conclure sur H1.5                        |  ☐   |

### H2 · Le code de vérification — « je demande un code, je reçois un lien »

| #    | Geste                                                                              | Attendu                                                                                                                   | Fait |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | :--: |
| H2.1 | « Recevoir un code par email », puis **ouvrir la boîte de réception**              | Un **CODE de 6 caractères** dans le corps du message. ⚠️ **Aucun bouton, aucun lien à cliquer** — c'est le bug d'origine  |  ☐   |
| H2.2 | Le code contient une **lettre** (l'alphabet est `ABCDEFGHJKMNPQRSTUVWXYZ23456789`) | Le champ l'accepte. Il ne gardait que les chiffres avant                                                                  |  ☐   |
| H2.3 | Saisir le code **en minuscules**                                                   | Accepté (l'API met en majuscules avant de comparer)                                                                       |  ☐   |
| H2.4 | Sur ce même écran, l'adresse **remplie automatiquement** (avec l'espace)           | ⚠️ **LE POINT DU LOT.** C'était la seule porte dont le schéma était recopié à la main : elle refusait en 400. Corrigé ici |  ☐   |
| H2.5 | Adresse **inconnue** sur cet écran                                                 | Même écran de succès qu'une adresse connue — sinon l'écran devient un test d'existence de comptes                         |  ☐   |
| H2.6 | Un compte avec 2FA passe par le code e-mail                                        | Il n'obtient **pas** de session : il doit encore donner son second facteur                                                |  ☐   |
| H2.7 | Réglage Supabase « Email OTP expiration » ↔ `SUPABASE_OTP_EXP_SECONDS`             | Voir **D148**. Ne concerne pas ce code-ci (le nôtre vit 10 min en Redis) mais le lien de réinitialisation du back-office  |  ☐   |

### H3 · L'import — le trou qui restait

| #    | Geste                                                                          | Attendu                                                                                                                         | Fait |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | :--: |
| H3.1 | Réglages › Import, source « Comptes seuls », déposer un CSV de **3 à 6 Mo**    | ⚠️ **LE POINT DU LOT.** L'import passe. Avant, tout ce qui dépassait 1 Mo mourait en 413 muet — l'assistant n'était pas exempté |  ☐   |
| H3.2 | Déposer un fichier de **plus de 8 Mo**                                         | L'écran DIT « trop volumineux (8 Mo maximum) » **avant** l'envoi, et le bouton Simuler ne part pas                              |  ☐   |
| H3.3 | Après un refus de taille, déposer un fichier correct                           | Le message disparaît et la simulation repart                                                                                    |  ☐   |
| H3.4 | Reprise de l'ancien CRM — le fichier réel de **17 387 contacts / 38 colonnes** | C'est le cas qui motive tout le lot. À faire sur le vrai fichier, pas sur un extrait                                            |  ☐   |
| H3.5 | Import d'un **appel d'offres** en PDF de ~5 Mo (« import de besoins »)         | Passe. Corrigé le 14/08 (`/rfp` à 12 Mo), **jamais rejoué à l'écran depuis**                                                    |  ☐   |
| H3.6 | Import CSV de contacts sur un compte, fichier de ~3 Mo                         | Passe. Même remarque : corrigé le 14/08, jamais rejoué                                                                          |  ☐   |
| H3.7 | Le message de refus en **anglais**                                             | `fileTooLarge` existe dans les deux catalogues ; vérifier qu'aucune clé brute n'apparaît                                        |  ☐   |
| H3.8 | Les **deux thèmes** sur le message de refus                                    | `--danger-soft-text`, lisible en clair ET en sombre                                                                             |  ☐   |

### H4 · « Je n'ai réussi à importer qu'un seul compte, BPCE »

| #    | Geste                                                                            | Attendu                                                                                                                        | Fait |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | :--: |
| H4.1 | Lancer une analyse sur **« Que penses-tu de Saint-Gobain ? »**                   | Refus AVANT tout débit de crédit, avec une phrase qui dit quoi faire. Le cas réellement observé en production                  |  ☐   |
| H4.2 | Lancer sur **`BPCE`**, puis sur `Compagnie Générale des Établissements Michelin` | Les deux passent. ⚠️ Refuser à tort une raison sociale serait PIRE que le bug d'origine                                        |  ☐   |
| H4.3 | Le message de refus en **anglais**                                               | ⚠️ **Connu FAUX aujourd'hui** — il est en français en dur dans le contrat. Voir **D149**. À constater, pas à corriger ici      |  ☐   |
| H4.4 | Interface anglaise, écran de recherche                                           | Tout le reste de l'écran est traduit ; seul ce message ne l'est pas. C'est ce contraste qu'il faut voir avant de trancher D149 |  ☐   |

### H5 · Ce que ce lot n'a PAS corrigé, et pourquoi

| #    | Constat                                                                                                                                                                                                       | Ce qu'il faut décider                                                                                                                                                        | Fait |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| H5.1 | `internal-analyze.controller.ts:87-98` construit son DTO par un **cast `as StartAnalysisDto`**, pas par un `parse` : le garde de nom d'entreprise ne s'y applique pas, et `fresh: true` saute cache et quota. | Surface opérateur (`InternalSecretGuard`), pas end-user — mais c'est le chemin qui sert justement à rejouer un run. **Hors périmètre auth/imports**, à traiter en lot dédié. |  ☐   |
| H5.2 | `POST /accounts` et `POST /accounts/portfolio` acceptent n'importe quelle chaîne en `company_name` (aucun run IA, mais le compte créé est ensuite relançable).                                                | Même remarque. À décider avec H5.1, dans le même lot.                                                                                                                        |  ☐   |
| H5.3 | Le plafond de l'appel d'offres est **dupliqué** : `RFP_MAX_FILE_BASE64_CHARS` (contrat) et `MAX_RFP_FILE_MB` (`RfpPage.tsx:79`) ne se connaissent pas. Les deux coïncident aujourd'hui.                       | Latent, pas vivant. Le patron correct existe à côté (`CV_UPLOAD_MAX_BYTES`, importé des deux côtés). À joindre au prochain passage.                                          |  ☐   |
| H5.4 | `main.bootstrap.spec.ts` n'épingle que deux lignes de `main.ts` ; ce lot a ajouté sa propre garde pour `/import`, mais les cinq autres montages de limite de corps restent non gardés.                        | Une suppression accidentelle de la ligne `/rfp` rejouerait le bug du 14/08 sans casser un test.                                                                              |  ☐   |

---

## G. Trois leçons d'outillage nées de cette vague

| #   | Ce qui trompe                                                               | Le discriminant                                                                                                                                                                                                                                                                                   | Fait |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| G.1 | **Une suite web qui rend des dizaines d'échecs en fan-out**                 | Ce n'est **pas** la liste des fichiers rouges, c'est **l'absence de ligne de résumé** (`Test Files` / `Tests`). Un vitest qui finit imprime toujours son total. 22 processus vitest se battaient pour le CPU. **Un run sans total n'est pas rouge, il est tué** — relancer seul avant de conclure |  ☐   |
| G.2 | **Un worktree neuf rend `Failed to resolve entry for package "@bellum/…"`** | Faux rouge : `pnpm install --frozen-lockfile` **puis** `turbo run build --filter="./packages/*"` avant tout test web. Rencontré par trois agents sur quatre                                                                                                                                       |  ☐   |
| G.3 | **Un `git diff --stat A..B` revenu VIDE**                                   | Ce n'est pas une preuve d'égalité, c'est une question à reposer avec les SHA explicites. Un agent a failli rapporter « 9 fichiers, tous les miens » alors qu'il y en avait 16 dont 7 d'un autre lot                                                                                               |  ☐   |

---

## K. Le plan de recette des vagues E et F — par ÉCRAN, par risque décroissant

> Vingt-trois lots ont été mergés le 29/08 au soir et dans la nuit (vagues D, E et F).
> Seule la vague D a eu une première passe, et elle est au **§H0**. Ce qui suit est le
> plan **exécutable** des vagues **E** (15 lots) et **F** (8 lots) : chaque point est
> rattaché à un commit ou à une entrée de changelog du dépôt, **aucun n'est inventé**,
> et les lots qui n'ont rien d'observable à l'écran sont nommés comme tels au **§K22**
> plutôt que passés sous silence.
>
> **Regroupé par écran, pas par lot** — c'est tout l'intérêt : on ouvre `/pilotage/finance`
> une fois et on y vérifie les dix choses qui ont changé, au lieu d'y revenir dix fois.
> Un point qui ne dit pas SUR QUEL ÉCRAN il se vérifie n'a rien à faire ici.
>
> Cible de cette passe : **`1c037825b`** (merge de la PR #1240, `integration/vague-f-26-aout`).

### K0. Deux avertissements de protocole, à relire AVANT de commencer

**1 · Vérifier la version déployée à CHAQUE merge, pas seulement au début.**
`GET https://api.bellum-ai.com/version` rend `{"commit":…, "ia":{"commit":…}}` — le champ
`ia.commit` est **IMBRIQUÉ**, un `grep` le fait mentir : il faut **parser le JSON**.
Le 29/08 au soir les deux services étaient sur **deux commits différents** — API sur
`69cb5705d` (vague D), service IA déjà sur `b6b5ba104` (vague E) — et une partie de la
recette portait donc sur du code non déployé. Vercel redéploie en une minute, Railway en
plusieurs : une recette qui chevauche un déploiement ne rend aucune erreur, elle rend des
verdicts sur un état qui n'existe plus. Le contrôle après coup :
`git diff --name-only <ancien>..<neuf> -- <le chemin de l'écran testé>`.

⚠️ Quatre lots de cette vague vivent **côté service IA** (E6, E10, F4, et F6 pour son
générateur) : pour eux c'est `ia.commit` qui compte, pas `commit`. Un organigramme qui reste
tout coloré alors que `commit` est à jour ne prouve rien tant que `ia.commit` ne l'est pas.

**2 · Les deux thèmes et les deux langues font partie de la recette, pas d'un passage bonus.**
Clair et sombre sont une promesse (D79), contraste AA sur tous les couples texte/fond ; et
FR + EN sur chaque écran touché — sept lots de cette vague ajoutent des libellés, et une
clé brute (`reasons.rate_out_of_range`, `menu.title`) ne se voit que dans la langue qu'on
n'a pas ouverte. Le site public, lui, se vérifie en **quatre** langues (`fr`, `en`, `de`, `nl`).

**Comment lire les tableaux.** Trois colonnes qui comptent : _ce qu'on fait_ · _ce qu'on
doit voir_ · **_le signe que c'est cassé_**. La troisième est celle qui manque partout et
celle qui sert le plus — sans elle, un repli honnête ressemble à une panne et une panne à
un repli honnête.

**Marqueurs.** 🖊️ = **ce geste ÉCRIT** dans l'espace (ne pas le cliquer à la légère) ·
🔒 = **exige l'espace réel** (la démonstration ne peut pas le montrer) ·
🎭 = **se recette depuis la salle de démonstration**.

---

### K1. 🔒 Laura, le fil de conversation (`/chat`) — la fuite entre collègues

> **Lot E15.** `474825c34` (portée SQL), `0dd472521` (portée du service), `2357c7a0c`
> (la garde à deux membres qui montrait la fuite), changelog
> `2026-08-29-ce-que-tu-dis-a-laura-reste-a-toi`.
> Ce qui se passait : le web envoie `conversation_id = "general"` pour tout le monde, et
> `conversation_summaries` se lisait sur `(workspace_id, conversation_id)`. Dans un espace
> à plusieurs sièges, **tous les membres écrivaient et relisaient la même ligne** — deux
> extraits de 200 caractères par échange, réinjectés dans le prompt système de chacun sous
> « Résumé de la conversation jusqu'ici », préfixés « • Utilisateur : ». Le modèle
> attribuait donc à l'appelant les mots d'un collègue. Interdit par D65.
> **C'est le point le plus cher de la vague : il exige deux sièges du MÊME espace.**

| #    | Ce qu'on fait                                                                                                                  | Ce qu'on doit voir                                                                                                                     | Le signe que c'est cassé                                                                                                   | Fait |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | :--: |
| K1.1 | 🔒 Deux navigateurs, deux sièges du même espace. A écrit à Laura une phrase reconnaissable et chiffrée, puis quelques échanges | Rien de particulier côté A                                                                                                             | —                                                                                                                          |  ☐   |
| K1.2 | B pose ensuite une question OUVERTE à Laura (« où j'en suis ? », « résume-moi le contexte »)                                   | **Aucune trace** de la phrase de A dans la réponse de B                                                                                | Laura reprend le contexte de A, ou dit « tu m'as dit que… » sur ce que A a écrit. C'est la fuite, et elle est vivante      |  ☐   |
| K1.3 | A relance sa propre conversation                                                                                               | Laura garde SON contexte à elle                                                                                                        | A a perdu son contexte : l'isolation serait vraie **par vacuité**, ce qui ne prouve rien                                   |  ☐   |
| K1.4 | Observer, une seule fois, l'effet annoncé du correctif                                                                         | Le résumé roulant de chacun **repart de zéro** ; les conversations, elles, restent toutes dans la liste et Laura continue à les relire | Des conversations ont disparu de la liste — l'archivage `superseded_at` aurait mordu sur les messages, pas sur les résumés |  ☐   |
| K1.5 | ⚠️ Vérifier que le fil `general` reste PARTAGÉ entre les sièges                                                                | C'est délibéré, et parqué par le lot                                                                                                   | Le signaler comme un défaut — ce n'en est pas un                                                                           |  ☐   |
| K1.6 | Deux thèmes, FR et EN                                                                                                          | —                                                                                                                                      | —                                                                                                                          |  ☐   |

---

### K2. Réglages › Mémoire de Laura (`/settings/memory`) — l'écran neuf, et l'effacement

> **Lot E3** (`5e345f9ee` contrat, `7654eb8a7` API, `7638fee4f` écran, `065f10705` démo),
> **plus la correction de croisement `544eb8c20`** — fusionnés, l'écran qui devait rendre la
> mémoire visible re-montrait les extraits des collègues que E15 venait de cloisonner, et
> **l'effacement d'un résumé portait `{ workspace_id, conversation_id }` sans `user_id` :
> oublier son propre fil effaçait celui de CHAQUE membre pour cette clé.**
> Changelog `2026-08-29-la-memoire-de-laura-se-voit`.

| #     | Ce qu'on fait                                                                     | Ce qu'on doit voir                                                                                                               | Le signe que c'est cassé                                                                                                                  | Fait |
| ----- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| K2.1  | Barre latérale › Paramètres › section **Personnel** › « Mémoire de Laura »        | Une entrée de nav, atteignable **en un clic**                                                                                    | L'écran n'existe que par son URL — c'est ce que `/actions/sequences` a coûté pendant des mois                                             |  ☐   |
| K2.2  | Compter les sections                                                              | **Quatre**, une par couche persistée : faits épinglés, préférences, résumé de conversation, traces d'intervention                | Trois sections, ou un mélange — deux couches étaient relues à chaque message sans qu'aucun écran ne les montre                            |  ☐   |
| K2.3  | Regarder ce qu'écrit une section sans contenu                                     | **Trois phrases DISTINCTES** possibles : des lignes · « rien » · « je n'ai pas pu lire »                                         | Une couche illisible affichée vide : ça se lit « Laura ne retient rien », une phrase fausse et rassurante                                 |  ☐   |
| K2.4  | Chercher un compteur en entête                                                    | **Il n'y en a pas**, à dessein                                                                                                   | Un total en haut de page : une couche illisible le ferait baisser sans rien dire, et ce serait le chiffre le plus visible et le seul faux |  ☐   |
| K2.5  | Ouvrir la section « résumé de conversation »                                      | Le TEXTE que Laura relit, mot pour mot, retours à la ligne conservés (un par tour)                                               | Un résumé tronqué, ou un libellé à la place du texte                                                                                      |  ☐   |
| K2.6  | Descendre sous la liste                                                           | Les **cinq** choses que Laura ne mémorise jamais, en toutes lettres                                                              | La liste est absente : c'est la moitié de la réponse à « qu'est-ce qu'elle sait de moi ? »                                                |  ☐   |
| K2.7  | 🖊️ « Oublier » sur une ligne de **préférence**, puis reposer une question à Laura | La ligne disparaît de l'écran **et** quitte le contexte relu                                                                     | Laura s'en sert encore au tour suivant — la préférence a été mise à `null` au lieu d'être retirée du sac                                  |  ☐   |
| K2.8  | 🖊️🔒 « Oublier » sur un **résumé de conversation**, avec un collègue connecté     | **Seul le sien** disparaît                                                                                                       | Le collègue perd le sien : c'est exactement le défaut de `544eb8c20`, et il est irréversible                                              |  ☐   |
| K2.9  | 🎭 Salle de démonstration                                                         | **Trois** faits épinglés — un fait constaté, une façon de travailler, une correction imposée — dont un avec échéance             | Écran vide : la démo répondrait « rien » à la question que cet écran existe pour poser                                                    |  ☐   |
| K2.10 | 🎭 Poser un premier message à Laura depuis la démo, puis revenir sur cet écran    | La section « résumé de conversation » passe de « aucun échange résumé » à un contenu, **sous les yeux du visiteur**              | Elle reste vide — la couche écrite par l'usage ne se montrerait jamais                                                                    |  ☐   |
| K2.11 | Chaque bouton « Oublier »                                                         | `<button type="button">`, 44 px, `aria-label` qui cite la ligne ; un qualificatif inconnu s'affiche **brut**, jamais une clé nue | Une clé i18n à l'écran, ou un libellé inventé                                                                                             |  ☐   |
| K2.12 | Deux thèmes, FR et EN. Le FR **tutoie**                                           | —                                                                                                                                | « le fil de **vos** échanges »                                                                                                            |  ☐   |

---

### K3. 🔒 Les traces Langfuse — la seconde fuite, et elle ne se voit pas dans le produit

> **Lot E7** (`61f09c5c7` masquage, `9087af233` le masque qui se re-masquait, `9d1885eb2`
> issue du tour, `3f792da67` les cinq alertes, `a7afd5845` les seuils).
> Ce qui se passait : dès que l'opérateur pose `LANGFUSE_CAPTURE_CONTENT=true` pour
> déboguer, **les prompts partaient BRUTS** — et ceux des contacts et de l'organigramme
> portent les e-mails et téléphones remontés par l'enrichissement. Pire, le `statusMessage`
> d'un span en échec est un `str(exc)` et **n'a jamais dépendu de ce drapeau** : un
> fournisseur en échec recopie volontiers l'URL appelée, **clé d'API comprise**.
>
> ⚠️ **Aucune surface applicative.** Ces alertes sont une donnée d'exploitation, elles ne
> sortent jamais côté produit (arbitrage Louis du 03/08, comme les coûts fournisseurs).
> La seule vérification possible est **dans Langfuse**, et elle exige
> `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` (la paire est l'interrupteur).

| #    | Ce qu'on fait                                                                                         | Ce qu'on doit voir                                                                                                          | Le signe que c'est cassé                                                                                               | Fait |
| ---- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | :--: |
| K3.1 | 🔒 Ouvrir dans Langfuse une trace d'analyse portant la phase contacts ou l'organigramme               | **Aucune adresse e-mail, aucun téléphone** dans la charge utile du prompt                                                   | Une adresse lisible : le masquage n'est pas déployé côté IA (revérifier `ia.commit`)                                   |  ☐   |
| K3.2 | Chercher un span en ÉCHEC et lire son `statusMessage`                                                 | Aucune clé d'API, aucun jeton, aucun `Authorization: Bearer …` en clair                                                     | Une URL de fournisseur recopiée telle quelle                                                                           |  ☐   |
| K3.3 | ⚠️ Contrôle en sens INVERSE, celui qu'on oublie                                                       | Un **SIREN**, un **effectif**, un **chiffre d'affaires** et un **code postal** doivent **PASSER**                           | La trace est illisible : on a masqué le dossier au lieu de la personne, et la trace ne sert plus à rien                |  ☐   |
| K3.4 | Vérifier que les identifiants restent                                                                 | `userId`, `sessionId`, `correlationId` **non masqués** — ce sont les pseudonymes que les exigences demandent                | Ils ont disparu : la corrélation est cassée                                                                            |  ☐   |
| K3.5 | Chercher un masque mal formé                                                                          | `[secret masqué]`, propre                                                                                                   | `[secret masqué] masqué]` — le motif « clé = valeur » repassait sur ce que le motif d'en-tête venait de poser          |  ☐   |
| K3.6 | Onglet **Alerts** de Langfuse : `metadata.outcome` existe sur les traces de copilote                  | Quatre valeurs possibles : `acted` / `answered` / `no_outcome` / `failed`                                                   | Le champ manque — l'onglet Alerts reste vide faute de champ sur lequel poser une règle, comme sur la capture d'origine |  ☐   |
| K3.7 | 🔒 Sentry, passage de **07:05** : les cinq alertes (coût, latence, erreur, hallucination, no-outcome) | Chaque dépassement part en `logger.error`. Une mesure impossible écrit **une ligne nommant ce qu'elle n'a pas pu regarder** | Silence total un jour où plus rien ne tourne : un taux sur zéro run vaut 0 %, passe tous les seuils et n'alerte jamais |  ☐   |

---

### K4. 🔒 Le critère protégé retiré du prompt de notation — et le contrôle de non-régression

> **Lot E6** (`202f08360`, `26e5017a1`). La graine de la phase 2 portait `photoUrl` (Apollo)
> et partait **telle quelle**, sérialisée en JSON, dans `bellum_contacts` — le prompt qui
> attribue à chaque personne une **priorité de 1 à 5**, un rôle et un niveau d'influence —
> puis dans `bellum_organigramme`, qui reconstruit la chaîne de décision. La garde
> TypeScript GA-06 relit du CODE : elle ne pouvait pas voir le texte envoyé au modèle, et
> **un champ n'a pas besoin d'être multiplié par un poids pour peser dans un classement.**
>
> ⚠️ **L'interdit porte sur l'usage CLASSANT, pas sur l'existence du champ.** Le risque de
> ce lot n'est pas qu'il ait sous-corrigé, c'est qu'il ait **sur**-corrigé : `strip_protected_criteria`
> rend des COPIES et la graine doit garder sa photo pour la FICHE. Les points ci-dessous
> sont donc des contrôles de non-régression, et il faut une **analyse neuve** pour les voir.

| #    | Ce qu'on fait                                                                                        | Ce qu'on doit voir                                                                                                        | Le signe que c'est cassé                                                                                      | Fait |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | :--: |
| K4.1 | 🖊️🔒 Lancer une analyse complète sur un compte neuf (**8 crédits**), puis ouvrir les fiches contacts | Les **photos s'affichent toujours** sur les fiches                                                                        | Plus aucune photo : la correction a vidé la graine au lieu de la seule charge utile des deux prompts          |  ☐   |
| K4.2 | Ouvrir l'onglet Contacts du même dossier                                                             | Les **priorités 1-5**, les rôles et les niveaux d'influence sont toujours produits                                        | Plus aucune priorité : le nettoyage a cassé la charge utile du prompt                                         |  ☐   |
| K4.3 | Ouvrir l'organigramme du même dossier                                                                | La chaîne de décision est reconstruite                                                                                    | Un organigramme vide alors que les contacts existent                                                          |  ☐   |
| K4.4 | Vérifier ce qui RESTE dans la charge utile, à dessein                                                | L'**identité** (le livrable NOMME la personne) et la **ville / le pays** (plus grossiers qu'un code postal)               | Le nom a disparu des livrables : la réponse se recolle à sa graine **par le nom**, elle ne peut plus le faire |  ☐   |
| K4.5 | ⚠️ Le reste du lot n'a **aucune** surface                                                            | Il se vérifie par `test_protected_criteria_scoring.py` (elle exécute la vraie phase 3 et relit le texte envoyé au modèle) | —                                                                                                             |  ☐   |

---

### K5. 🖊️ Réglages › Import (`/settings/import`) — la taille, puis la reprise

> **Lot E14** (`442240755`) pour la taille de fichier et la porte OTP, **lot F8**
> (`ddbe137e8`, `2281384fd`) pour la reprise. Changelogs
> `2026-08-29-se-connecter-et-reprendre-une-base` et `2026-08-29-import-interrompu-se-reprend`.
>
> ⚠️ **Les points de taille de fichier et de connexion sont DÉJÀ écrits au §H de ce carnet**
> (H1 la connexion, H2 le code de vérification, H3 l'import — 32 points) : ils viennent du
> même lot E14. **Les dérouler là-bas, pas ici.** Ce qui suit ne couvre que la reprise (F8).
>
> Ce qui se passait : une exception à la ligne 4 000 sur 17 000 remontait en 500, et quatre
> choses tombaient d'un coup — les 4 000 lignes restaient en base sans qu'aucune colonne le
> dise, `snapshot` restait NULL donc l'annulation refusait (« cet import n'a rien écrit »),
> `created_count` gardait son défaut `0` et l'écran affichait **« 0 créé »**, et relancer
> redoublonnait tout ce qui n'a pas de clé.

| #     | Ce qu'on fait                                                                           | Ce qu'on doit voir                                                                                                                                      | Le signe que c'est cassé                                                                                                                   | Fait |
| ----- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | :--: |
| K5.1  | 🖊️🔒 Lancer un import réel court (3 à 5 comptes), puis ouvrir l'historique              | L'état et les compteurs, exacts                                                                                                                         | « 0 créé » alors que des lignes sont en base                                                                                               |  ☐   |
| K5.2  | 🖊️ Annuler cet import terminé                                                           | L'annulation passe                                                                                                                                      | « cet import n'a rien écrit »                                                                                                              |  ☐   |
| K5.3  | Chercher le panneau **« Reprendre là où ça s'est arrêté »** sur un import RÉUSSI        | **Il n'apparaît pas**                                                                                                                                   | Il s'affiche sur un import terminé : le nouvel état `partial` n'est pas discriminant                                                       |  ☐   |
| K5.4  | 🔒 Sur un import réellement interrompu (état **interrompu**)                            | La phrase compte les lignes : « N ligne(s) sur M ont été écrites — X créé(s), Y mis à jour. Elles sont en base. » + bouton **« Reprendre cet import »** | « 0 créé », ou aucun bouton                                                                                                                |  ☐   |
| K5.5  | Le cas où **le nombre de lignes est inconnu**                                           | Un écran DIFFÉRENT : « je ne sais pas combien de lignes ont été écrites. Ce n'est pas “aucune” : ne relance pas depuis le début, tu doublonnerais. »    | Le même écran que « 0 ligne » — les deux appellent des gestes **opposés**                                                                  |  ☐   |
| K5.6  | 🖊️ Redéposer **un autre fichier** sur un import interrompu, puis relancer la simulation | Bellum **refuse** de sauter la moindre ligne (empreinte du contenu)                                                                                     | Il reprend quand même à la ligne 4 000 : en sauter 4 000 dans un autre fichier en perdrait 4 000, **en silence**                           |  ☐   |
| K5.7  | 🔒 Le cas `unknown` (la requête est partie sans réponse)                                | Deux boutons — « Réécrire la ligne N » / « Sauter la ligne N » — chacun avec **son risque écrit**, et un message « je ne tranche pas à ta place »       | La reprise part toute seule : elle doit **S'ARRÊTER** sur un `unknown`, c'est la doctrine du timeout                                       |  ☐   |
| K5.8  | Tenter de reprendre **sans** avoir choisi                                               | Le geste reste **inerte**                                                                                                                               | Il part, et devine à la place de l'utilisateur                                                                                             |  ☐   |
| K5.9  | 🖊️ Annuler un import **interrompu**                                                     | Il s'annule **comme un import terminé** (l'instantané se cumule)                                                                                        | « cet import n'a rien écrit » — la garde du scénario le plus grave du PDF 9 serait inatteignable dans le cas exact pour lequel elle existe |  ☐   |
| K5.10 | 🎭 Salle de démonstration                                                               | **Rien** : `import_sessions` est vide à dessein — la session est ce que le VISITEUR produit                                                             | Un historique de reprises que personne n'a faites                                                                                          |  ☐   |
| K5.11 | Deux thèmes et EN sur le panneau de reprise et le message de refus de taille            | `--danger-soft-text`, lisible des deux côtés ; `fileTooLarge` traduit                                                                                   | Une clé brute, ou un rouge illisible en clair                                                                                              |  ☐   |

---

### K6. 🔒 L'organigramme — ⚠️ il doit maintenant afficher BEAUCOUP PLUS DE GRIS

> **Lot F6** (`d10301ec0`, `f3fa330bb`) + **lot F1** pour la couleur du rôle inconnu.
> Changelogs `2026-08-29-lorganigramme-dit-ce-quil-devine` et `2026-08-29-une-couleur-dit-un-etat`.
>
> ### ⚠️ À LIRE AVANT D'OUVRIR L'ÉCRAN — sinon on signale un bug qui est le résultat attendu
>
> Mesuré avant le lot : **0 % de gris** sur les graphes de référence, et la passe H0 a vu
> **25 cartes, 25 badges, zéro nœud gris** sur ROCHE. Cause racine : `bellum_contacts.py`
> n'offrait au modèle **aucune valeur « inconnu »**, donc 100 % des nœuds portaient un
> pouvoir d'achat que personne n'avait observé. Le lot pose un **plancher de 60 % de gris
> sur le GÉNÉRATEUR** : un rôle n'apparaît désormais que si une règle NOMMÉE le justifie à
> partir du titre, ou si quelqu'un l'a saisi. **Un organigramme majoritairement gris est le
> succès du lot, pas une régression.** Un recetteur non prévenu le remonterait comme une
> perte de données.
>
> ⚠️ **Et le plancher agit sur le GÉNÉRATEUR.** Un dossier analysé AVANT le déploiement
> garde ses anciens rôles : il faut une analyse neuve (🖊️ 8 crédits) ou une actualisation
> (🖊️ 4 crédits) pour voir quoi que ce soit.

| #     | Ce qu'on fait                                                                      | Ce qu'on doit voir                                                                                                                                         | Le signe que c'est cassé                                                                                                                                             | Fait |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| K6.1  | 🖊️🔒 Réanalyser ROCHE (le compte de la passe H0) puis ouvrir l'organigramme        | Une **majorité de nœuds GRIS**                                                                                                                             | Toujours 25 badges sur 25 : soit `ia.commit` n'est pas à jour, soit le dossier n'a pas été réanalysé — ce n'est pas le lot qui a échoué                              |  ☐   |
| K6.2  | Chercher la bannière « Attention à la lecture : … le plancher est de 60 % »        | Elle **DISPARAÎT** sur un dossier réanalysé                                                                                                                | Elle reste : le plancher n'est pas atteint, et l'écran le dit lui-même                                                                                               |  ☐   |
| K6.3  | Regarder un nœud qui porte encore un rôle lu sur l'intitulé du poste               | Le badge **« déduit »** à côté du rôle                                                                                                                     | Un « Sponsor » nu sur un compte sans saisie humaine : ça se lit comme un fait observé, et c'est presque toujours une lecture du titre                                |  ☐   |
| K6.4  | 🖊️ Corriger un rôle à la main sur une carte                                        | Le badge « déduit » **tombe**                                                                                                                              | Il reste : une correction humaine gagne toujours                                                                                                                     |  ☐   |
| K6.5  | Chercher l'exception nommée                                                        | Le **bloqueur** reste coloré même sans preuve — ce n'est pas une couleur de pouvoir, c'est un avertissement, et « le masquer falsifierait l'organigramme » | Les bloqueurs ont été grisés aussi                                                                                                                                   |  ☐   |
| K6.6  | Lire la provenance de chaque carte                                                 | Une **date**, ou « date inconnue » / « source inconnue » écrit noir sur blanc                                                                              | Une carte **muette** sur sa provenance — c'est exactement ce que la passe H0 a relevé et que ce lot corrige                                                          |  ☐   |
| K6.7  | Comparer les scores de confiance de quelques liens à ceux d'avant                  | Ils **BAISSENT** — le `+10` de fraîcheur affirmé EN DUR sans aucune date est retiré                                                                        | Ils sont identiques : le générateur n'est pas déployé                                                                                                                |  ☐   |
| K6.8  | Chercher un trait **sans** provenance                                              | Il n'y en a pas — sans provenance, pas de trait (« le silence est un état correct »)                                                                       | Un lien affiché dont aucune source ne répond : c'est la preuve fantôme `EdgeSource(s-<pid>-ent)`                                                                     |  ☐   |
| K6.9  | 🔒 Sur un compte à **plus de quatre directions**                                   | Quatre raccourcis + « **+ N autres directions cartographiées, au sélecteur ci-dessus** », N **exact**                                                      | Un total arrondi, un « + 0 autres », ou un total qu'on n'a pas collecté annoncé comme complet                                                                        |  ☐   |
| K6.10 | Sur un compte à **quatre directions ou moins**                                     | La rangée **N'APPARAÎT PAS**                                                                                                                               | Elle est là et répète mot pour mot les options du sélecteur juste au-dessus — la même chose deux fois, sous deux formes                                              |  ☐   |
| K6.11 | Ouvrir le sélecteur de direction                                                   | Il reste **exhaustif** — rien n'est caché, c'est la rangée qui reste lisible                                                                               | Il est tronqué à quatre lui aussi                                                                                                                                    |  ☐   |
| K6.12 | **F1** — un rôle qu'on ignore                                                      | **GRIS**                                                                                                                                                   | Il est **VERT**, comme un utilisateur identifié : `ROLE_COLORS.unknown` partageait la même entrée que `user`                                                         |  ☐   |
| K6.13 | **F1** — la carte d'influence                                                      | Seuls sponsor et achats restent encrés ; le reste en gris, les noms restent en légende                                                                     | Une carte entièrement coloriée : « un organigramme où tout est coloré est un organigramme inventé »                                                                  |  ☐   |
| K6.14 | 🎭 Salle de démonstration                                                          | Le badge « déduit » est **semé** ; le bloc `colouring` est **vide à dessein**                                                                              | Conclure d'une salle colorée que le plancher n'est pas livré — le plancher **ne se voit pas** en démo, et fabriquer du gris est précisément ce que la règle interdit |  ☐   |
| K6.15 | Deux thèmes, FR et EN sur les badges « déduit », « date inconnue », « + N autres » | —                                                                                                                                                          | —                                                                                                                                                                    |  ☐   |
| K6.16 | ⚠️ Revérifier les six défauts du **§H0** au passage                                | « LinkedIn » sur les 25 cartes, les rôles 4/8 contre 20 badges, la personne comptée comme entité                                                           | Ils sont toujours là : **ce lot ne les corrige pas**, il ne faut pas les compter comme réglés                                                                        |  ☐   |

---

### K7. Le rapprochement consultant ↔ besoin (`/projects/needs`, tiroir de matching)

> **Lot E8** (`537025aec` hors zone, `081a98eb7` le 0 du pré-filtrage, `111dc59d2` le score
> sans axes, `a017c8c3d` la garde des libellés). Changelog
> `2026-08-29-pourquoi-ce-profil-est-ecarte`.

| #    | Ce qu'on fait                                                                                     | Ce qu'on doit voir                                                                                          | Le signe que c'est cassé                                                                                                                  | Fait |
| ---- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| K7.1 | Ouvrir le bloc « écartés » d'un rapprochement                                                     | Chaque profil écarté porte son **motif en clair** — onze motifs possibles                                   | `reasons.rate_out_of_range` à l'écran, sur les trois surfaces (pastille de carte, compteur par motif, matching **inverse**)               |  ☐   |
| K7.2 | Regarder un profil écarté **par le pré-filtrage** (avant tout calcul)                             | « **non mesuré** », et COMBIEN d'axes ont pu être évalués                                                   | « Correspondance **0** · Poussable **0** » — une note que personne ne lui a donnée, dans le bloc dont la raison d'être est de l'expliquer |  ☐   |
| K7.3 | Ouvrir le **document remis à la personne** (art. 86 de l'AI Act)                                  | « non mesuré » + le nombre d'axes évalués ; le **motif d'exclusion reste**, c'est la vraie réponse          | « Score de correspondance : **0/100** » sur le document dont la raison d'être est de dire pourquoi on n'a pas proposé quelqu'un           |  ☐   |
| K7.4 | 🔒 Un besoin **SANS adresse**, ou un consultant qui a coché « sur site » **sans zone renseignée** | Le profil **n'est plus écarté** « hors zone » : l'axe est déclaré **non évaluable** et sort du dénominateur | La phrase « zones déclarées hors « » » (avec des guillemets **vides**) — la signature exacte de l'ancien défaut                           |  ☐   |
| K7.5 | Compter les axes évalués sur un profil pauvre                                                     | **Sous trois axes, il n'y a pas de score du tout**                                                          | Un score affiché sur un ou deux axes                                                                                                      |  ☐   |
| K7.6 | Ouvrir le tableau de comparaison côte à côte, en thème **SOMBRE**                                 | La meilleure valeur de chaque ligne est **la plus lisible**                                                 | Elle est la **moins** lisible : elle portait `text-[var(--bellum-primary-500)]`, soit 2,68:1 en sombre                                    |  ☐   |
| K7.7 | Vérifier qu'un score « non mesuré » garde quand même ses **axes**                                 | Les deux : « non mesuré » répond à « combien ? », les axes répondent à « qu'est-ce que je complète ? »      | Les axes ont disparu avec le score — `ScoreWithAxes` promettait deux choses et n'en tenait qu'une                                         |  ☐   |
| K7.8 | 🎭 Refaire K7.1 et K7.2 sur la salle de démonstration                                             | Les motifs y sont lisibles                                                                                  | —                                                                                                                                         |  ☐   |
| K7.9 | Les onze motifs en **EN**                                                                         | Aucun libellé manquant dans l'un des deux dictionnaires                                                     | Une clé brute côté anglais seulement                                                                                                      |  ☐   |

---

### K8. Le site public — un score n'y sort plus nu, et le prix est vrai (4 langues)

> **Lot E1** (`67480d05f`, `6126cf7ca`) + `d57fcfd5b` pour la page « Garde-fous ».
> Changelog `2026-08-29-un-score-ne-sort-jamais-nu`.
> Pourquoi personne ne les voyait : `grep "/100"` rendait **zéro** — le chiffre et son
> dénominateur vivaient dans deux éléments JSX voisins.
> Aucun compte, aucune écriture : c'est la partie la moins chère de cette recette.

| #    | Ce qu'on fait                                      | Ce qu'on doit voir                                                                                                                   | Le signe que c'est cassé                                                                                                 | Fait |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | :--: |
| K8.1 | `/fr` — le bloc de score du héros                  | **Cinq axes** : quatre notés, le cinquième NOMMÉ non évaluable (le profil ESN n'est pas renseigné). Total sur **20**, pas sur 25     | « SCORE D'OPPORTUNITÉ · **87 / 100** · Fort potentiel » — un chiffre nu, avec un qualificatif de potentiel collé         |  ☐   |
| K8.2 | `/fr` — le mockup d'application                    | L'anneau **« 8,5 /10 · GO » a disparu** : un score décomposé ne tient pas dans 68 px                                                 | Il est toujours là                                                                                                       |  ☐   |
| K8.3 | `/fr/product` — les contacts                       | Six critères + celui qui n'a pas pu être évalué, nommé                                                                               | Trois anneaux « 92 / 88 / 81 » **sans dénominateur**                                                                     |  ☐   |
| K8.4 | `/fr/product` — la carte des sites                 | Un verdict : **correspond / sous ton seuil / à qualifier**                                                                           | Une colonne « Score » par site, notée sur cent — le produit ne l'a jamais fait                                           |  ☐   |
| K8.5 | Les écrans d'illustration                          | La mention « **exemple** », dans les 4 langues                                                                                       | Une capture présentée comme une donnée réelle                                                                            |  ☐   |
| K8.6 | `/fr/product` **et** `/fr/beta` — le prix          | **8 crédits** pour une analyse complète, **4** pour une actualisation, **1** pour un enrichissement, copilote et messages **inclus** | « incluse, **sans consommer de crédit** » — pendant que les CGV que le client signe disent l'inverse                     |  ☐   |
| K8.7 | Refaire K8.1 à K8.6 en `/en`, `/de`, `/nl`         | Le même texte, traduit                                                                                                               | Une langue conserve l'ancien texte : **les quatre étaient fausses**, corriger le FR seul ne prouve rien                  |  ☐   |
| K8.8 | Balayer tout le site à la recherche du vocabulaire | Aucun « chance », aucune « probabilité », aucun « % de potentiel »                                                                   | Un seul suffit : c'est la lecture probabiliste refusée **six fois**, et c'est la première chose qu'un prospect voit      |  ☐   |
| K8.9 | `/fr/safeguards`                                   | La page charge, et ses promesses citent des lignes de code qui portent vraiment quelque chose                                        | Une promesse publique citant une ligne devenue vide (elles avaient bougé, un lot de la vague F ayant allongé le fichier) |  ☐   |

---

### K9. 🖊️🔒 Réglages › Équipe (`/settings/team`) — le départ d'un membre

> **Lot E9** (`f58f30176` API, `4f8682cfc` écran). Changelog `2026-08-29-le-depart-dun-membre`.
> Avant : `TeamView.tsx` posait une corbeille, `onClick={() => removeMember.mutate(…)}`.
> **Un clic, le siège partait** — aucune confirmation, aucune prévisualisation, et rien ne
> touchait les tâches, les opportunités, les besoins ni les missions : ces quatre-là
> gardaient l'identifiant d'un non-membre, donc n'appartenaient plus à personne.
>
> ### ⚠️ Le geste le plus dangereux de cette recette
>
> Il **retire un siège** et **réassigne un portefeuille**. À faire sur un **compte de
> recette**, jamais sur l'espace de Louis. Et il exige un **second membre** : la salle de
> démonstration n'a qu'un occupant, donc **rien de ce bloc ne se recette en démonstration**
> — et c'est délibéré (« une salle de démo n'est le compte de personne »).

| #     | Ce qu'on fait                                              | Ce qu'on doit voir                                                                                                          | Le signe que c'est cassé                                                                                                       | Fait |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | :--: |
| K9.1  | 🔒 Cliquer la corbeille sur la ligne d'un **autre** membre | Une boîte s'ouvre. **AUCUN retrait n'est déclenché**                                                                        | Le siège part au clic : c'est l'ancien comportement, et il est irréversible                                                    |  ☐   |
| K9.2  | Lire la boîte                                              | Ce qui change de main, **par nature** : comptes, contacts, tâches, opportunités, besoins, missions — chacun avec son compte | Une boîte qui annonce le retrait sans dire ce que la personne porte : elle peut porter quarante comptes                        |  ☐   |
| K9.3  | 🔒 Provoquer (ou simuler) un comptage qui échoue           | « **non mesuré** » + sa raison. Un vrai zéro reste « 0 », c'est une mesure                                                  | Un portefeuille tout à **0** sur une base indisponible : ça se lit « ce membre ne porte rien, on peut le retirer sans risque » |  ☐   |
| K9.4  | Recharger et observer le chargement                        | L'écran **DIT qu'il lit** ; en échec il **DIT qu'il a échoué**                                                              | Un portefeuille vide affiché pendant le chargement — il se lit « rien à reprendre »                                            |  ☐   |
| K9.5  | Chercher la liste de ce qui NE se transmet PAS             | Nommé : sa messagerie connectée, son agenda, ses conversations avec Laura, ses préférences                                  | La liste manque : un responsable croit avoir tout repris et découvre le trou trois semaines plus tard                          |  ☐   |
| K9.6  | Chercher ce qui **ne bouge pas**                           | Ce qui a été APPRIS — fiches, notes, historique, angles — appartient à l'espace, rien à déplacer                            | L'écran propose de « transférer » les angles : réécrire leur auteur mentirait sur qui a appris quoi                            |  ☐   |
| K9.7  | Ouvrir le sélecteur de successeur                          | La liste vient **du serveur**                                                                                               | Un lecteur seul y est proposé, puis l'API refuse après le clic — deux chemins qui refont la même dérivation divergent          |  ☐   |
| K9.8  | 🖊️ « **Transférer le portefeuille** »                      | Le portefeuille change de main et **le siège RESTE** — c'est le geste du préavis                                            | La personne disparaît de l'équipe : on ne peut plus lui poser de questions                                                     |  ☐   |
| K9.9  | 🖊️ « **Retirer sans transférer** »                         | Le portefeuille retourne dans la file des non attribués                                                                     | Une suppression : **aucun DELETE dans ce chemin** — on archive, on ne supprime pas                                             |  ☐   |
| K9.10 | Ouvrir `/settings/activity`                                | Une ligne « portefeuille repris », avec sa pastille et son libellé                                                          | Une ligne sans libellé, ou aucune trace du geste le plus irréversible de l'écran                                               |  ☐   |
| K9.11 | Au clavier seul, et en pointeur grossier                   | Le sélecteur de successeur porte un nom accessible et fait 44 px                                                            | Une cible sous 44 px sur un geste irréversible                                                                                 |  ☐   |
| K9.12 | Deux thèmes, FR et EN (écran **et** journal)               | —                                                                                                                           | Une couleur hexadécimale ou une classe Tailwind en couleur de texte                                                            |  ☐   |
| K9.13 | ⚠️ Ne PAS conclure sur l'effacement RGPD d'un ex-salarié   | Il est **parqué**, et le produit ne le promet pas aujourd'hui                                                               | Le signaler comme un manque de ce lot : la reprise de portefeuille ne décide rien de cette question, elle la rend visible      |  ☐   |

---

### K10. 🎭 `/pilotage/finance` — les chiffres savent enfin s'ils sont bons

> **Lot E11** (`a76849d40` contrat, `55d6c4690` écran, `f330c01f4` parité démo).
> Changelog `2026-08-29-les-cibles-chiffrees`. Dix des dix-sept indicateurs du PDF 5 §13.3
> sont chiffrés ; aucun de ces nombres n'existait en code.

| #      | Ce qu'on fait                                        | Ce qu'on doit voir                                                                                                                                                              | Le signe que c'est cassé                                                                                                                     | Fait |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| K10.1  | Ouvrir le panneau                                    | Quatre lignes portent leur cible **avec son sens** : délai de paiement < 65 j, intercontrat < 5 %, marge brute 25-40 %, marge non mesurée < 10 %                                | Une cible sans direction — « moins est mieux » et « plus est mieux » ne se devinent pas                                                      |  ☐   |
| K10.2  | Compter les **états** visibles sur l'écran           | **Trois** : « dans la cible », « **hors cible** », « **non comparée** »                                                                                                         | Un seul état partout, surtout si c'est le vert : un produit qui dit toujours oui ne sert à rien                                              |  ☐   |
| K10.3  | Trouver une valeur **absente**                       | « non comparée, faute de mesure », **sans couleur**                                                                                                                             | Elle est **verte** : un délai de paiement inconnu compté comme zéro passerait pour « payé le jour même », sur un espace où l'on ne sait rien |  ☐   |
| K10.4  | La marge de l'espace, sous le seuil de mesurabilité  | Elle **S'AFFICHE** et **ne se COMPARE pas** ; l'écran dit combien de missions manquent (« cible non comparée — X sur les Y nécessaires »)                                       | Une marge tirée de deux missions colorée en vert                                                                                             |  ☐   |
| K10.5  | La ligne « **Marge non mesurée** »                   | Un **POURCENTAGE**, pas un simple compte : « 4 missions non chiffrées » ne dit pas la même chose sur quarante que sur six                                                       | Elle affiche encore un compte nu                                                                                                             |  ☐   |
| K10.6  | 🔒 Sur un espace **sans mission**                    | Elle n'écrit **pas « 0 % »**                                                                                                                                                    | « 0 % de marge non mesurée » — ce zéro tombe du BON côté et afficherait la meilleure complétude possible sur un espace vide                  |  ☐   |
| K10.7  | Ouvrir le dictionnaire des indicateurs               | La cible des **dix** qui en ont une, et **« pas de cible »** dit franchement pour les autres                                                                                    | Une prose qui énonce un autre nombre que la cible                                                                                            |  ☐   |
| K10.8  | Vérifier les trois corrections nommées               | CRA reçus **> 85 %** (et non 90) · marge non mesurée **< 10 %** (et non 20, qui appartenait aux « missions non mesurables ») · le **taux de renouvellement > 60 %** est présent | L'un des trois est resté à l'ancienne valeur                                                                                                 |  ☐   |
| K10.9  | Les deux indicateurs que rien ne calcule             | « CRA reçus à temps » et « durée d'intercontrat » se déclarent **non mesurables avec leur raison**, et **gardent leur cible**                                                   | Ils se présentent comme calculables : ne pas savoir mesurer ne change pas la destination                                                     |  ☐   |
| K10.10 | Chercher du **rouge**                                | Il n'y en a pas — hors cible est une file de travail, pas une panne. Le verdict est aussi **ÉCRIT**                                                                             | Une pilule rouge, ou un verdict porté par la seule couleur                                                                                   |  ☐   |
| K10.11 | 🎭 Salle de démonstration                            | Délai de paiement **32 j** = dans la cible (le seul vert de la salle) · intercontrat **hors cible** (Camille Roussel, 76 jours) · au moins une pilule « non comparée »          | Salle monochrome : sans « non comparée », le prospect ne voit jamais ce qui distingue cet outil                                              |  ☐   |
| K10.12 | Deux thèmes, FR et EN (directions, unités, verdicts) | —                                                                                                                                                                               | Une direction ou une unité non traduite                                                                                                      |  ☐   |

---

### K11. 🎭 Les couleurs — un balayage transversal, six écrans

> **Lot F1** (`1710c0afb`, `66a431733`, `986384bfb`). Changelog `2026-08-29-une-couleur-dit-un-etat`.
> Tome 7 §26.1 : « une couleur porte un **état**, jamais une **catégorie** ». Sept tables
> de couleurs indexaient une catégorie, et six dépensaient les jetons **sémantiques** pour
> le faire : quand l'ambre sert à dire « type de preuve : signal », il ne dit plus « ça
> demande une décision », et le rouge du danger se perd dans le décor.
> **Rien de ce que la couleur portait n'est perdu — un MOT le porte.**

| #     | Ce qu'on fait                                     | Ce qu'on doit voir                                                                                                                   | Le signe que c'est cassé                                                                                      | Fait |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | :--: |
| K11.1 | Compte › « **Pourquoi maintenant** »              | Chaque signal annonce sa famille **en toutes lettres** — « Appel d'offres ouvert », « Recrutement », « Vie juridique » — puce neutre | Une pastille de 6 px colorée, sans légende nulle part : la couleur était le SEUL porteur de l'information     |  ☐   |
| K11.2 | Compte › les **badges de preuve**                 | Un seul badge neutre ; le badge **ÉCRIT** le type de preuve                                                                          | Cinq teintes pour cinq types de preuve                                                                        |  ☐   |
| K11.3 | Compte › la **carte des sites**                   | Une **seule teinte**, du plus dense (siège) au plus clair (site industriel) ; chaque catégorie garde son nom à côté de sa pastille   | Un bureau en « déduit », un établissement en « demande une décision », un site industriel en « validé »       |  ☐   |
| K11.4 | `/settings/activity` — le **journal d'activité**  | Une seule vignette ; l'icône et le libellé distinguent                                                                               | La moitié des lignes portent une couleur d'alerte                                                             |  ☐   |
| K11.5 | `/briefing` — le **cockpit**                      | Quatre compteurs, **plus** quatre teintes : les icônes et les libellés faisaient déjà le travail                                     | Les quatre KPI sont recolorés                                                                                 |  ☐   |
| K11.6 | ⚠️ Ce qui doit **RESTER** coloré                  | GO / PRUDENT / NO-GO, les statuts, les points de santé, l'urgence, la posture, l'état d'enregistrement — ce sont des **ÉTATS**       | Ils ont été décolorés aussi : une correction inutile est du bruit, et un état sans couleur est une régression |  ☐   |
| K11.7 | Provoquer un **vrai** avertissement               | Il **ressort**                                                                                                                       | Il se noie : c'est la raison d'être du lot                                                                    |  ☐   |
| K11.8 | Deux thèmes, FR et EN sur les libellés de famille | `signalTypes.*` traduit des deux côtés                                                                                               | Une famille en clé brute                                                                                      |  ☐   |

---

### K12. 🎭 Compte › onglet Veille — deux libellés qui nommaient la mauvaise colonne

> **Lot E5** (`33cb42f30`, `fa9e248be`). Le seau `pains` de l'onglet Veille portait
> « Enjeux IT », FR et EN — alors que la fiche compte nomme déjà **la même colonne**
> « Enjeux business », et que `it_challenges` est une **autre** colonne.

| #     | Ce qu'on fait                                          | Ce qu'on doit voir                                                                      | Le signe que c'est cassé                                                     | Fait |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | :--: |
| K12.1 | La **tuile compte** de la Veille                       | « **Enjeux & stack** » (elle compte `pains` **+** `stack`)                              | « Enjeux IT » : la même donnée sous deux noms selon l'écran, dont un faux    |  ☐   |
| K12.2 | Le **filtre** de la Veille                             | « **Enjeux business** » (il ne retient que `pains`), mot pour mot comme la fiche compte | « Enjeux IT »                                                                |  ☐   |
| K12.3 | Le libellé court FR                                    | Il ne dit plus « **Pains** »                                                            | De l'anglais dans l'interface française, à côté d'un libellé long traduit    |  ☐   |
| K12.4 | En **EN**                                              | « Challenges & stack » / « Business challenges »                                        | Une clé brute                                                                |  ☐   |
| K12.5 | ⚠️ Les quatre autres écrans qui écrivent « Enjeux IT » | Ils désignent bien la colonne `it_challenges` : **ne pas les signaler**                 | Les remonter comme un défaut — le chantier qui les généraliserait est parqué |  ☐   |

---

### K13. 🎭 Les raccourcis clavier — barre latérale et menu du compte

> **Lot F2** (`3663e34df`, `f3a09345b`). Changelog `2026-08-29-les-raccourcis-clavier-sont-visibles`.
> Mesuré avant : le dépôt web entier contenait **UN seul `<kbd>`**, celui de la liste `⌘/` —
> donc le seul endroit qui affichait les raccourcis n'était atteignable que par un raccourci
> que rien n'annonçait.

| #     | Ce qu'on fait                                                               | Ce qu'on doit voir                                                                | Le signe que c'est cassé                                                                                  | Fait |
| ----- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | :--: |
| K13.1 | Barre latérale **dépliée**                                                  | Chaque entrée de nav porte sa touche à droite, en clair                           | Aucune touche : un raccourci qu'il faut deviner n'existe pas                                              |  ☐   |
| K13.2 | Barre latérale **repliée**                                                  | La touche apparaît dans l'**infobulle**                                           | Rien, ou une infobulle qui n'a que le nom                                                                 |  ☐   |
| K13.3 | Le bouton de **Laura** et la **bascule de la barre**                        | `⌘K` et `⌘B` écrits dessus                                                        | `⌘B` invisible : il répondait depuis toujours sans être écrit nulle part, et n'était même pas au registre |  ☐   |
| K13.4 | Sur un clavier **non-Mac** (Windows / Linux)                                | **Ctrl**, pas ⌘                                                                   | « ⌘K » en dur : une touche absente du clavier                                                             |  ☐   |
| K13.5 | Menu du **compte** › « **Raccourcis clavier** »                             | La liste complète s'ouvre                                                         | Elle ne s'ouvre que par `⌘/` — le raccourci qu'il faut déjà connaître pour découvrir les raccourcis       |  ☐   |
| K13.6 | En **pointeur grossier** (mobile, tactile, < 768 px)                        | **Aucun** capuchon affiché                                                        | Des touches affichées à quelqu'un qui n'a pas de clavier                                                  |  ☐   |
| K13.7 | Au lecteur d'écran, sur le lien « Comptes »                                 | Le nom accessible reste « **Comptes** » ; la touche passe par `aria-keyshortcuts` | « Comptes G puis C » — une aide qui renomme ce qu'elle décrit n'est pas une aide (neuf tests l'ont dit)   |  ☐   |
| K13.8 | Taper une lettre dans un champ de recherche, un combobox, une zone de texte | **Rien ne navigue**                                                               | Taper « g » dans une recherche change d'écran                                                             |  ☐   |
| K13.9 | Deux thèmes, FR et EN                                                       | —                                                                                 | —                                                                                                         |  ☐   |

---

### K14. 🎭 « Brouillon » ne désigne plus un message qui vit chez nous

> **Lot E12** (`b47d4236f`, `c0b6bcc77`). Changelog `2026-08-29-un-brouillon-est-un-brouillon`.
> Treize libellés appelaient « brouillon » un texte qui **n'existe nulle part ailleurs** :
> quelqu'un serait allé le chercher dans sa boîte sans jamais l'y trouver, et en aurait
> conclu que l'envoi avait raté. **Aucun comportement ne change, aucun chemin d'écriture
> n'est créé.**

| #     | Ce qu'on fait                                 | Ce qu'on doit voir                                                                          | Le signe que c'est cassé                                                                               | Fait |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | :--: |
| K14.1 | Copilote › carte d'action `prepare_message`   | « **Message préparé** — à envoyer depuis ta messagerie »                                    | « générer le brouillon »                                                                               |  ☐   |
| K14.2 | Contacts › **envoi groupé**                   | « Le **message préparé** … de chaque contact » ; statut « **Sans message préparé** »        | « brouillon »                                                                                          |  ☐   |
| K14.3 | `/actions/sequences` › une étape e-mail       | « préparer le **message** », statut « prêt à copier »                                       | « préparer le brouillon » : la séquence ne touche jamais la messagerie                                 |  ☐   |
| K14.4 | ⚠️ Messagerie › « **Préparer un brouillon** » | Le mot **RESTE** : il dépose un VRAI brouillon dans la boîte, avec la signature et le lien  | Ce libellé a été changé aussi — la correction serait allée trop loin, et 60 libellés doivent le garder |  ☐   |
| K14.5 | Vérifier qu'aucun comportement n'a bougé      | Rien n'est envoyé ; les identifiants techniques (`no_draft`, `email_draft`) n'ont pas bougé | Un envoi part, ou un enum a perdu une valeur                                                           |  ☐   |
| K14.6 | En **EN**                                     | « prepared message » partout où le FR dit « message préparé »                               | Une clé brute, ou « draft » resté côté anglais seulement                                               |  ☐   |

---

### K15. Réglages › Notifications — le plafond de Laura suit l'usage

> **Lot E4** (`d5fb9aca2` contrat, `b92b01ea3` branchement, `cea1bbba6`, `267f882c6`,
> `0028003c2`, `dfeed6db4`). Changelog `2026-08-29-laura-parle-autant-que-tu-lecoutes`.
> ⚠️ Le comportement demande **plusieurs jours** d'observation : seul le texte se recette
> en une session.

| #     | Ce qu'on fait                                                                | Ce qu'on doit voir                                                                                                                         | Le signe que c'est cassé                                                                                                                  | Fait |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| K15.1 | Lire le texte de l'interrupteur de Laura                                     | Il dit que le plafond **SUIT l'usage** (descend si on laisse passer, monte à quatre si on sollicite) et **nomme les trois exceptions**     | « trois fois par jour au maximum » seul — c'était devenu faux **dans les deux sens**                                                      |  ☐   |
| K15.2 | 🔒 Sur plusieurs jours : solliciter Laura **plus de 5 fois** dans la journée | Le lendemain, le plafond ouvre à **4**                                                                                                     | Il ne bouge jamais : le budget n'avait aucun chemin vers le haut                                                                          |  ☐   |
| K15.3 | 🔒 Une journée où l'on **ignore** deux propositions d'affilée                | Le plafond **descend**                                                                                                                     | Rien ne bouge. ⚠️ Et une acceptation **partielle** (1 sur 3) ne doit **pas** armer la baisse — agir sur une proposition n'est pas ignorer |  ☐   |
| K15.4 | 🖊️ Monter le réglage à la main, puis attendre une journée « sollicitée »     | La hausse automatique **ne redescend jamais** un plafond monté par l'utilisateur                                                           | Le réglage de l'utilisateur est écrasé                                                                                                    |  ☐   |
| K15.5 | 🔒 Revenir après **plus de cinq jours** d'absence                            | Une intervention peut dépasser le plafond, **et seulement sur ce sujet-là**                                                                | Laura profite du moment d'or pour parler d'autre chose : un jeton de connecteur expiré lui donnerait un budget illimité                   |  ☐   |
| K15.6 | Couper Laura, puis provoquer un moment d'or                                  | **Silence.** Le dépassement ne contourne ni l'interrupteur, ni le retrait, ni le silence pendant le travail, ni l'unique message par écran | Elle parle alors qu'elle est coupée                                                                                                       |  ☐   |
| K15.7 | 🔒 Sur un compte **neuf**, sans historique                                   | **Rien ne bouge** — pas de « taux d'acceptation de zéro »                                                                                  | Le plafond descend d'emblée : quelqu'un qui arrive aujourd'hui n'a pas un taux de zéro, il n'en a pas                                     |  ☐   |
| K15.8 | En **EN**                                                                    | Le texte du plafond et les trois exceptions traduits                                                                                       | —                                                                                                                                         |  ☐   |

---

### K16. 🔒 Réglages › Routines — trois traces qui écrivaient « rien à signaler » sur une lecture cassée

> **Lot F5** (`0e7667dd9`). Les trois automatisations de la facturation (`FIN-02` relevés,
> `FIN-06` facturabilité, `FIN-10` marges) tournent toutes les quinze minutes et écrivent
> une trace **tous les jours** — c'est la SEULE surface où l'on distingue « il n'y avait
> rien à dire » de « ça n'a pas tourné ».

| #     | Ce qu'on fait                                         | Ce qu'on doit voir                                                                                     | Le signe que c'est cassé                                                                                                             | Fait |
| ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | :--: |
| K16.1 | Ouvrir les traces du jour des trois surveillances     | Chacune a écrit quelque chose, et son texte est cohérent avec `/missions/facturation`                  | Une trace absente : le balayage ne tourne pas                                                                                        |  ☐   |
| K16.2 | 🔒 Sur une lecture qui échoue (difficile à provoquer) | La trace dit qu'elle **N'A PAS PU LIRE**                                                               | « Aucun relevé manquant sur le mois clos. » — une bonne nouvelle écrite sur une panne                                                |  ☐   |
| K16.3 | La pire des trois : l'alerte de **marge**             | Elle n'écrit plus « Aucun seuil de marge réglé pour cet espace » sur un espace **qui en a un**         | La phrase accuse l'opérateur d'un oubli qu'il n'a pas fait — elle ne se contente pas d'annoncer une absence, elle en donne une CAUSE |  ☐   |
| K16.4 | ⚠️ Ne pas confondre avec un constat parqué            | `PATCH /margin-threshold` n'a **aucun appelant** : l'écran affichera « seuil non réglé » pour toujours | Le compter comme le défaut corrigé ici — c'est un **autre** manque, parqué par le lot                                                |  ☐   |

---

### K17. 🔒 `/briefing` — la mission sans date de fin (MIS-12) — ⚠️ non recettable le jour même

> **Lot F5** (`a08508b8a`, `8d5ddf698`). Changelog `2026-08-29-une-mission-sans-fin-se-dit`.
> Le produit COMPTAIT déjà ces missions ; le silence était juste, il n'était **adressé à
> personne**. Le déclencheur est le balayage quotidien **`InterventionsSweeper`, `@Cron 06:10
Europe/Paris`** — aucun cron neuf, une douzième nature dans une file qui tourne.
>
> ⚠️ **Deux raisons de ne rien voir aujourd'hui, et aucune n'est un défaut** : le balayeur
> **exclut les espaces de démonstration** (donc rien en démo, jamais), et il ne passe qu'à
> 06:10 (donc rien avant le lendemain matin d'un déploiement). C'est le même angle mort que
> **C.1** de ce carnet, jamais observé.

| #     | Ce qu'on fait                                                                             | Ce qu'on doit voir                                                                                                                                              | Le signe que c'est cassé                                                                                                                                   | Fait |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| K17.1 | 🔒 Le **lendemain matin** d'un déploiement, ouvrir « Ce qui m'attend » sur un espace réel | Une mission en **régie**, active, démarrée depuis **plus de 30 jours**, **sans date de fin**, remonte **une seule fois**, libellée « Mission sans date de fin » | Rien : vérifier d'abord que 06:10 est passé et que l'espace n'est pas une démo                                                                             |  ☐   |
| K17.2 | Lire ce que la ligne dit                                                                  | Ce que le trou **coûte** : aucune alerte de renouvellement ne peut partir, et la mission est exclue du chiffre d'affaires restant                               | Une alerte nue, sans sa conséquence                                                                                                                        |  ☐   |
| K17.3 | Attendre le balayage du **surlendemain**                                                  | Elle **ne revient pas** (le garde-fou « 1 seul » est porté par un index unique + `ON CONFLICT DO NOTHING`)                                                      | Elle revient tous les matins                                                                                                                               |  ☐   |
| K17.4 | Vérifier les **quatre refus**                                                             | Elle ne remonte **PAS** sur un forfait, un recrutement, une mission non démarrée, ni une nature de contrat inconnue                                             | Une alerte que personne ne peut résoudre                                                                                                                   |  ☐   |
| K17.5 | Regarder sa place dans la file                                                            | **Sous** « renouvellement à risque » (là l'échéance est connue), **au-dessus** du suivi de compte                                                               | Elle passe devant une échéance connue                                                                                                                      |  ☐   |
| K17.6 | 🎭 Salle de démonstration                                                                 | **Rien**, et c'est la règle : le balayeur exclut les espaces de démo                                                                                            | ⚠️ **NE PAS** donner une date de fin aux deux missions en régie de la salle (52 et 138 jours) pour faire taire la ligne : leur absence est semée à dessein |  ☐   |
| K17.7 | `/missions/board` — l'alerte `no_end_date` sur la carte et le compteur d'entête           | Ils existaient **déjà** et n'ont pas bougé                                                                                                                      | Un doublon d'alerte apparu sur le board                                                                                                                    |  ☐   |
| K17.8 | En **EN**                                                                                 | « Mission without end date »                                                                                                                                    | Une clé brute                                                                                                                                              |  ☐   |

---

### K18. 🔒 Back-office opérateur (`dashboard-manager` › Facturation) — un coût jamais mesuré n'est pas 0 $

> **Lot F7** (`54049f124` l'écran, `d78208419` les deux mesures, `d9c99ce77` la garde,
> `092b7b8c3` le coût par famille, `a4ce6a25a` les six décisions).
> ⚠️ **Aucune de ces mesures ne sort côté application** (arbitrage du 03/08, comme les coûts
> fournisseurs) : ne pas les chercher dans `/billing`. Accès par `BACKOFFICE_URL`, réservé
> au porteur du rôle `backoffice`.

| #     | Ce qu'on fait                                                                               | Ce qu'on doit voir                                                                                        | Le signe que c'est cassé                                                                                    | Fait |
| ----- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | :--: |
| K18.1 | Ouvrir le panneau d'usage sur un utilisateur dont **aucune analyse n'a jamais été tarifée** | « **—** »                                                                                                 | « **0,0000 $** de coût moyen par analyse » : une moyenne sur zéro valeur n'est pas nulle, elle n'existe pas |  ☐   |
| K18.2 | Lire un **total** de coût                                                                   | Il annonce **combien de lignes il n'a pas pu mesurer**                                                    | Un total présenté comme un fait : un total qui laisse des lignes de côté est un **plancher**                |  ☐   |
| K18.3 | 🔒 Sentry, le message d'alerte de coût de **07:05**                                         | Il **dit qu'il est un plancher** et nomme les quatre familles de coût **fixe** que le dépôt ne mesure pas | Un montant annoncé comme le coût réel                                                                       |  ☐   |
| K18.4 | Vérifier ce qui n'est **jamais** comparé                                                    | Les deux mesures neuves sont **globales à l'exploitant**, jamais rapprochées entre espaces (GA-43)        | Une comparaison entre deux espaces : ce sont des ESN, donc des concurrents                                  |  ☐   |
| K18.5 | ⚠️ Ne pas conclure sur la grille tarifaire                                                  | Elle n'est **pas touchée** : c'est une décision de Louis                                                  | La signaler comme un manque du lot                                                                          |  ☐   |

---

### K19. La page d'état publique (`/fr/status`) — un moteur qui se DIT dégradé

> **Lot F8**, second volet (`b825b5e8a`, angle mort n°5 du tome 8 §33).
> `apps/ia/app/main.py` rend **HTTP 200** avec `{"status":"degraded","missing_env":[…]}`
> quand une variable critique manque — et son docstring dit pourquoi (sinon Railway ne
> promeut jamais le déploiement qui corrigerait la config). `probeIaEngine` ne lisait que
> `res.ok` : **un moteur sans `SUPABASE_URL`, dont huit routeurs répondent 500 un par un,
> était compté « opérationnel » sur la page publique.**
> Un `200` n'est pas « tout va bien » ; c'est « j'ai répondu ».

| #     | Ce qu'on fait                                 | Ce qu'on doit voir                                                          | Le signe que c'est cassé                                                                 | Fait |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | :--: |
| K19.1 | `GET /status` sur l'API, en régime normal     | Le champ de verdict existe et vaut `operational`                            | Le champ manque : le lot n'est pas déployé                                               |  ☐   |
| K19.2 | Lire la charge utile de `GET /status`         | **`missing_env` n'y est PAS** — la page est publique                        | Un nom de variable d'environnement visible depuis Internet                               |  ☐   |
| K19.3 | 🔒 Sur un moteur réellement dégradé (préprod) | La page affiche « **Dégradation partielle en cours** », pas du vert         | Tout vert pendant que huit routeurs répondent 500 : c'est ce qui rend la panne INVISIBLE |  ☐   |
| K19.4 | 🔒 Sur un corps **illisible**                 | Le verdict n'est **pas** « dégradé » : le seul fait sûr est qu'il a répondu | Un corps cassé rendu « dégradé » — on inventerait un diagnostic                          |  ☐   |
| K19.5 | Les quatre langues                            | `/fr/status`, `/en/status`, `/de/status`, `/nl/status`                      | Une langue non traduite                                                                  |  ☐   |
| K19.6 | ⚠️ Ne pas provoquer un mode dégradé en prod   | À défaut, K19.1 et K19.2 suffisent pour cette passe                         | —                                                                                        |  ☐   |

---

### K20. Laura — les cinq niveaux de vérité dans sa VOIX

> **Lot F4** (`bbd6940df`). Le dossier avait ses statuts de vérité depuis des mois
> (`truth_status.py` badge chaque bloc de la fiche) ; **la voix n'avait rien**. Le prompt
> énumérait sept statuts sans jamais dire COMMENT les dire : aucune consigne d'écrire
> « j'en déduis », aucun conditionnel imposé, et **aucune interdiction de la probabilité en
> pourcentage**. Une inférence de Laura se lisait donc comme un fait.

| #     | Ce qu'on fait                                                                        | Ce qu'on doit voir                                                                                                | Le signe que c'est cassé                                                                                               | Fait |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | :--: |
| K20.1 | Poser une question dont la réponse est une **inférence** (« qui décide chez eux ? ») | Laura l'**annonce** : « j'en déduis… »                                                                            | L'inférence est énoncée comme un fait — un commercial la répète en rendez-vous et perd le compte                       |  ☐   |
| K20.2 | Poser une question dont la réponse est une **hypothèse**                             | Le **conditionnel**                                                                                               | L'indicatif                                                                                                            |  ☐   |
| K20.3 | Chercher de la **spéculation**                                                       | Il n'y en a pas : SPÉCULATION est un **interdit**, pas une étiquette                                              | Une projection présentée comme une lecture                                                                             |  ☐   |
| K20.4 | Demander une chance de signer                                                        | Elle **refuse** de la chiffrer                                                                                    | « tu as 22 % de chances »                                                                                              |  ☐   |
| K20.5 | ⚠️ Contrôle en sens **INVERSE**                                                      | Un taux **MESURÉ** est une observation et **se dit** : « ton taux de transformation est de 22 % sur 40 affaires » | Laura devient muette sur une croissance, une marge ou un intercontrat — la consigne aurait mordu trop large            |  ☐   |
| K20.6 | Chronométrer un tour **simple** (« c'est quoi le SIREN de X ? »)                     | Rien ne change de perception                                                                                      | Un ralentissement : le bloc pèse ~12 % du prompt nu et se paie sur **tous** les tours (budget 90 s, plafond dur 105 s) |  ☐   |
| K20.7 | 🎭 Refaire K20.1 à K20.5 depuis la démonstration                                     | Même comportement                                                                                                 | —                                                                                                                      |  ☐   |

---

### K21. 🔒 `/knowledge` et le plan de compte — la connaissance récente passe devant

> **Lot E10** (`2150fef07` fraîcheur, `bb8d1ba73` la base de l'ÉQUIPE, `2c05e2426`
> `access_fact`, `1752ab63d`, `ae4e7f92b`). Changelog `2026-08-29-la-connaissance-recente-passe-devant`.
> M1 du tome 7 §38 était livré, testé et **inerte sur le chemin par défaut** : `apply_score_decay`
> ne pondère qu'un document portant une `similarity`, et seul le vecteur en produit — donc
> **sans `EMBEDDING_API_KEY` (la configuration par défaut), le decay était un no-op strict.**
> ⚠️ Vérifier la clé **avant** de conclure quoi que ce soit sur cet écran.

| #     | Ce qu'on fait                                                                                | Ce qu'on doit voir                                                                                | Le signe que c'est cassé                                                                                      | Fait |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | :--: |
| K21.1 | 🔒 Deux documents de pertinence comparable, l'un de 2024, l'autre d'hier : chercher un angle | Le **récent** remonte ; un document de deux ans vaut la moitié                                    | « un angle gagnant de 2024 remonte à égalité avec celui d'hier » — le symptôme mot pour mot du §38            |  ☐   |
| K21.2 | Un document **sans date**                                                                    | Il n'est **pas pénalisé**                                                                         | Il tombe en fin de liste : une date manquante n'est pas une preuve d'ancienneté                               |  ☐   |
| K21.3 | Un document nettement **plus pertinent** mais ancien                                         | Il reste devant : on **pondère**, on ne filtre pas                                                | La recherche ne rend plus que du récent                                                                       |  ☐   |
| K21.4 | 🖊️🔒 A dépose un document dans la base de connaissance, B lance une analyse (**8 crédits**)  | Le plan de compte peut s'en servir                                                                | Une référence déposée par un **collègue** n'alimente jamais le plan : c'est le défaut `phase4_plan.py:855`    |  ☐   |
| K21.5 | Demander à Laura « **par où passer chez ce compte ?** »                                      | Une réponse tirée de la fiche `access_fact`, rangée **à part** de l'angle gagnant                 | Elle ne rend que l'angle gagnant : un angle dit POURQUOI on est légitime, un fait d'accès dit PAR OÙ on entre |  ☐   |
| K21.6 | ⚠️ Ne pas signaler deux manques déjà parqués                                                 | La **citation n'est cliquable nulle part**, et cinq des neuf catégories restent **sans écrivain** | Les remonter comme des défauts neufs                                                                          |  ☐   |

---

### K22. Les lots qui n'ont **rien d'observable à l'écran** — nommés, pas passés sous silence

Un lot sans point de recette n'est pas un lot oublié. Chacun est ici avec ce qui le tient.

| Lot     | Ce qu'il a changé                                                                                                                                                        | Pourquoi rien à l'écran                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2**  | Aucune **probabilité PERSISTÉE**, et plus seulement affichée                                                                                                             | `closing_chance` n'existe dans aucun schéma, entité ni migration : le travail était de rendre le refus **tenable**. Vérifié par **GA-64**, qui lit 2 912 identifiants SQL, 963 colonnes TypeORM et 2 767 clés de contrats |
| **E7**  | Les cinq alertes d'observabilité, le masquage avant export, l'issue d'un tour                                                                                            | Donnée d'**exploitation** : elle ne sort jamais côté application (arbitrage du 03/08). Seule vérification possible : Langfuse et Sentry — **§K3**                                                                         |
| **E13** | La contre-passe JUNE-RECOVERY (30/30 fichiers, 29 empreintes recalculées)                                                                                                | Documentaire. Aucun code produit                                                                                                                                                                                          |
| **F3**  | Le registre `scoped` / `shared` de **toutes** les tables                                                                                                                 | Aucune surface. Tenu par GA-64 (métadonnées TypeORM des entités réellement enregistrées), plus GA-16 et GA-46 réparées — elles jugeaient un fichier entier sur son PREMIER `@Entity`                                      |
| **F7**  | (partie contrats) Ce qu'un **crédit coûte** par famille d'action                                                                                                         | Aucune surface côté application ; l'écran opérateur est au **§K18**                                                                                                                                                       |
| **—**   | La page d'**avancement** (`tools/avancement`, `61ce36a79`)                                                                                                               | Outil interne, **hors application**. À ouvrir seulement si Louis veut suivre les trois chantiers de front (638 fichiers ouverts sur 642 ; l'archive 02 est la seule incomplète, 19/23)                                    |
| **—**   | Onze commits d'hygiène (numéros de décision en collision, marqueurs de conflit, prettier, imports dupliqués, `EPOCH`, frontière de journée, coût d'une navigation Laura) | Rien d'observable. Ce sont des réparations de croisement entre lots parallèles                                                                                                                                            |

---

### K23. Récapitulatif — ce qui ÉCRIT, et ce qui exige l'espace réel

**🖊️ Les gestes qui ÉCRIVENT** (ne pas les cliquer sans y avoir pensé — plusieurs sont
irréversibles) :

| Où                        | Le geste                                                     | Ce qu'il coûte                                                      |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| K2.7 / K2.8               | « Oublier » une ligne de mémoire de Laura                    | **Irréversible.** K2.8 touchait tous les membres avant `544eb8c20`  |
| K4.1 · K6.1 · K21.4       | Lancer ou actualiser une analyse                             | **8 crédits** (analyse) ou **4** (actualisation)                    |
| K5.1 · K5.2 · K5.6 · K5.9 | Lancer, annuler ou reprendre un import                       | Écrit et annule des lignes en base                                  |
| K6.4                      | Corriger un rôle à la main sur l'organigramme                | Une correction humaine gagne toujours — elle ne se défait pas seule |
| K9.8 · K9.9               | « Transférer le portefeuille » · « Retirer sans transférer » | **Le plus dangereux de la liste.** Compte de recette obligatoire    |
| K15.4                     | Monter le plafond de Laura                                   | Réglage personnel                                                   |
| **Rappel du §H0**         | « Démarrer un parcours » sur une chaîne (lot D5)             | Toujours **non cliqué**, et toujours une écriture réelle            |

**🔒 Ce qui exige l'espace réel** — la démonstration ne peut pas le montrer, et pour trois
d'entre eux c'est **délibéré** (la raison est écrite dans `demo-coverage.ts`) :

- **K1** — deux sièges du même espace (une salle de démo a **un** occupant)
- **K5.4 à K5.9** — `import_sessions` est vide à dessein : la session est ce que le visiteur produit
- **K6.1, K6.2, K6.7** — le bloc `colouring` est vide à dessein : fabriquer du gris est ce que la règle interdit
- **K9** — `assigned_to` est vide à dessein : la boîte de départ ne s'ouvre que sur la ligne d'un AUTRE membre
- **K17** — le balayeur **exclut** les espaces de démonstration, et il ne passe qu'à 06:10
- **K3, K18** — surfaces opérateur (Langfuse, Sentry, back-office)
- **K4, K10.6, K15.2/3/5/7, K16, K19.3/4, K21** — demandent une donnée, une panne ou une durée que la salle ne porte pas

**🎭 Ce qui se recette entièrement depuis la salle de démonstration** : K7 (partiellement),
K10, K11, K12, K13, K14, K20 — et c'est ce qu'un prospect verra.

---

### K24. Si l'on n'a qu'**une heure** — les cinq points, dans cet ordre

1. **K1.2 — la fuite des résumés entre collègues.** Deux sièges, une phrase reconnaissable
   chez A, une question ouverte chez B. C'est la seule chose de cette vague qui, si elle
   n'était pas corrigée, ferait sortir les mots d'une personne vers une autre. Et c'est le
   seul point que **rien d'autre que deux navigateurs** ne peut prouver.
2. **K2.8 — l'effacement d'un résumé n'efface que le sien.** Trouvé par personne pendant
   deux lots, corrigé en croisement : la suppression portait `{ workspace_id, conversation_id }`
   **sans `user_id`**. Un effacement est irréversible ; sa portée s'écrit en entier.
3. **K6.1 et K6.2 — l'organigramme doit être majoritairement GRIS.** À vérifier avant tout
   le monde, parce que c'est le point qu'un recetteur non prévenu remonterait comme une
   **régression** alors que c'est le résultat attendu — et parce qu'il exige `ia.commit` à
   jour et une réanalyse, donc du temps.
4. **K5.5 et K5.7 — « je ne sais pas combien » n'est pas « aucune ».** Les deux écrans de
   reprise d'import, et le refus de trancher sur une ligne partie sans réponse. C'est la
   reprise du fichier réel de 17 387 contacts qui est en jeu, et c'est le bug bêta le plus
   ancien encore vivant.
5. **K10.2 et K10.3 — les trois états de cible sur `/pilotage/finance`.** Se recette en
   trois minutes depuis la démo, et c'est là que le produit montre sa seule vraie
   différence : il **refuse de se prononcer** quand il ne sait pas, au lieu d'afficher un
   zéro rassurant. Un délai de paiement inconnu affiché vert serait la pire régression de
   cette vague.

⚠️ **Et avant les cinq** : `GET /version`, **parsé**, les deux champs. Un verdict rendu sur
du code non déployé est pire qu'un verdict non rendu — il est faux et il a l'air fait.

## Section L — recette live du 30/08, matin (écran `/accounts` et fiche de compte)

Passe menée à la main dans Chrome, sur la production, avec le compte de Louis.
Chaque point porte ce qui a été **observé**, pas ce qui était attendu.

### L1 — le dossier ROCHE : identité RÉPARÉE, contenu encore faux

Le dossier `6c8f4edc-329e-4ebc-84f5-0c6f05dbfdaa` avait été analysé sur **ROCHE BOBOIS**
(SIREN 493229280, fabricant de meubles, NAF 70.10Z) au lieu du **laboratoire Roche**
(SIREN 552012031, NAF 46.46Z). Contacts, angles, signaux et organigramme d'une société
avaient été écrits dans le dossier d'une autre.

**Réparé à la main**, via la carte « Raison sociale » de l'onglet Vue d'ensemble
(`AccountRecordCard.tsx` → `PATCH /accounts/:id` → `RecordEditService.patchAccount`) :

| Champ          | Avant                                | Après                                                                        |
| -------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `siren`        | 493229280                            | **552012031**                                                                |
| `sector`       | Activités des sièges sociaux         | **Commerce de gros (commerce interentreprises) de produits pharmaceutiques** |
| `employees`    | Entre 50 et 99 salariés              | **Entre 500 et 999 salariés**                                                |
| `headquarters` | 18 RUE DE LYON, 75012, PARIS, France | **4 COURS DE L'ILE SEGUIN, 92100, BOULOGNE-BILLANCOURT, France**             |

Valeurs prises au registre officiel (`recherche-entreprises.api.gouv.fr`, SIREN 552012031 :
nom ROCHE, NAF 46.46Z, tranche d'effectif 41, siège Boulogne-Billancourt, catégorie ETI).
Rien d'inventé. Les quatre champs portent désormais la provenance `human`, donc
`AccountsService.arbitrate` doit les préserver à la prochaine analyse — **à vérifier au
premier run**, c'est précisément ce que la fiche promet et que rien n'a encore confirmé
sur ce dossier.

Vérifié : la correction s'est propagée à la liste `/accounts` (la ligne ROCHE affiche
« Comm… » et « Entre 500 et 999 salariés ») et à l'entête du dossier.

**Reste faux, et non réparable à la main** : les contacts, les angles d'attaque, les
signaux, l'organigramme et le plan d'action, tous issus de la mauvaise société. La
restauration est **PARQUÉE** : elle exige une relance, et une relance re-résoudrait par
nom tant que le correctif d'identité n'est pas déployé. Ordre à tenir : correctif → mise
en ligne → **une** relance → vérifier que les quatre champs humains ont survécu.

⚠️ **Ne pas relancer l'analyse de ce dossier avant que le correctif soit en ligne.**

### L2 — le sélecteur d'entreprises ne propose pas la bonne société

Sur `/accounts`, le bouton « Analyser une entreprise » ouvre une modale qui promet :
« Choisis l'entreprise dans la liste : Bellum n'analyse que des sociétés qu'il a
identifiées, **pour ne pas se tromper d'homonyme**. »

Saisie `ROCHE` → **cinq** résultats, **cinq homonymes mineurs** : SCI RICHE ROCHE
(Montmartin-sur-Mer, location de terrains), ROCHE BOBOIS (Paris, sièges sociaux),
ROCHE HABITAT (Genas, articles textiles), SCI ROCHE (Desertines, location de terrains),
ROCHE (Chamrousse, location de logements). **Le laboratoire n'apparaît pas.**

Cause mesurée à la source : `recherche-entreprises.api.gouv.fr` rend **10 000 résultats**
pour `q=ROCHE` et son tri par défaut ignore la taille — les dix premiers sont des SCI et
de l'immobilier, tranche d'effectif `NN` pour neuf d'entre eux. Avec le paramètre
`categorie_entreprise=ETI,GE`, le **premier** résultat devient `552012031`.
La source sait rendre la bonne société ; c'est l'appel qui ne le lui demande pas.

⚠️ Un filtre dur `ETI,GE` serait le mauvais correctif — les clients d'une ESN ne sont pas
tous des ETI. Ce qu'il faut est un **classement**, pas une exclusion.

Deux points annexes relevés sur la même modale : chaque ligne répète mot pour mot
« 5 des résultats portent le nom "ROCHE". » — la même phrase sous les cinq lignes, qui
n'aide à choisir entre aucune d'elles (loi 4 du tome 7) ; et taper un SIREN dans le champ
ne trouve rien, alors que `extract_siren` existe dans
`apps/ia/app/services/research/siren_finder.py` mais n'est appelé que sur des pages web
scrapées, jamais sur la saisie de l'utilisateur.

**Lot lancé** : `fix/k5-le-selecteur-trouve-la-bonne-societe`.

### L3 — un filtre sans résultat se fait passer pour un portefeuille vide

L'encart du bas de `/accounts` dit « 24 comptes analysés, 0 opportunité à fort potentiel »
avec un bouton « Voir les opportunités → ». Le clic pose `?lifecycle=opportunity` et
l'écran affiche :

> **Aucun compte analysé pour l'instant** — « Lance ta première analyse… »
> [ Lancer ma première analyse ]

L'utilisateur a **24 comptes analysés**. Le vide FILTRÉ emprunte mot pour mot le message
du vide INITIAL — le motif « cassé et non mesurable se ressemblent ». Le geste proposé est
faux, et il coûte 8 crédits pour un problème qui n'existe pas : le bon geste est de retirer
le filtre.

### L4 — le seul chemin de retour est inerte

Depuis cet état filtré, le lien « Tout le portefeuille » (en haut à droite de l'encart)
**ne fait rien** : l'URL reste `?lifecycle=opportunity`, l'écran reste vide. Vérifié :
seule une navigation vers l'URL nue `/accounts` restaure les 24 comptes.

L'utilisateur est donc dans un cul-de-sac — un écran qui lui dit qu'il n'a jamais rien
analysé, et aucun moyen visible d'en sortir.

Piste à mesurer, pas à croire : un `<Link>` vers `/accounts` sans `search: {}` conserve les
paramètres de recherche existants avec TanStack Router.

**Lot L3 + L4 à lancer** (`fix/k6-un-filtre-vide-nest-pas-un-portefeuille-vide`, plage
GA-106/107, D300-D305) — **en attente d'une place**, la limite de 20 sous-agents
simultanés était atteinte au moment du dispatch. À relancer dès qu'une place se libère.

### L5 — trois compteurs à vérifier avant de conclure

« 24 suivis · 24 sans prochaine action · 24 avec un signal apparu cette semaine · 23 de
classe d'accès A ou B », et « 0 opportunité à fort potentiel » sur 24 comptes analysés.

Trois compteurs égaux au total et un zéro : à mesurer, pas à corriger d'emblée. Trois
lectures, une seule est un défaut — ils sont vrais ; ou « sans prochaine action » compte
les comptes sans action **programmée** quand chacun porte bien une action **recommandée**
(le badge « À programmer » sous chaque ligne le suggère), et c'est alors le libellé qui est
ambigu ; ou l'un est un zéro de chargement, et la règle s'applique — _si cette valeur est
absente, « 0 » est-il VRAI ?_

Confié au même lot que L3/L4.

### L6 — le tableau des comptes déborde à droite

Colonnes « Prochaine action » et « Ouvrir le c… » tronquées à 1 512 px de large.
Non instruit — à confirmer sur d'autres largeurs avant d'en faire un lot.

### L5 — RÉSOLU : les compteurs du portefeuille disent vrai

L'onglet **Pilotage › Qualité des données** répond à la question posée en L5 :
« **Comptes suivis sans prochaine action — 24 sur 24** · Du travail que personne n'a
planifié. » Le compteur de `/accounts` ne ment donc pas : les 24 comptes sont réellement
sans action **planifiée**, chacun portant par ailleurs une action **recommandée** (badge
« À programmer »). Aucun correctif de calcul n'est dû.

Ce qui reste dû sur `/accounts` est L3 et L4 seulement.

### L7 — l'écran Qualité des données est le modèle à suivre

À citer comme référence dans les prochains lots : chaque zéro y est **expliqué**
(« 0 · aucune mission active dans ton espace — rien à mesurer », « 0 · aucun consultant
dans ton espace — rien à mesurer »), et l'entête pose la règle : « Ce n'est pas un jugement
sur quelqu'un : c'est du travail à faire. Chaque ligne ouvre la liste des objets
concernés. » Chaque ligne porte son geste (« Ouvrir la liste », « Enrichir », « Saisir le
montant », « Typer les compétences »).

C'est exactement ce que L3 réclame pour l'état vide filtré de `/accounts`.

Un défaut mineur y subsiste : « pas de photo le mois dernier » est répété **sept fois**,
sous chaque ligne, mot pour mot (loi 4 du tome 7).

### L8 — Pilotage : des zéros qui mentent encore, et une carte qui se contredit

L'écran `/pilotage` applique la doctrine dans son cadrage — « Calculé sur 5 maillons sur
8 — 63 %. Les autres attendent de la donnée : ils restent gris, jamais rouges. » — et
l'ancien « Cohérence 13/100 » a bien disparu (le correctif mergé a pris).

Mais plusieurs valeurs s'affichent « 0 » là où « non mesuré » serait la vérité, et une
carte **se contredit avec elle-même** :

| Carte              | Ce qui est affiché                                                      | Le problème                                                                                                               |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Qualité Bellum** | « Taux de correction **0 %** » et « Éléments corrigés **12** »          | Douze éléments corrigés ne peuvent pas donner un taux de 0 %. Les deux chiffres de la même carte se contredisent.         |
| **Qualification**  | « Rendez-vous 0 · Besoins qualifiés 0 · Taux de qualification **0 %** » | `0/0` n'est pas `0 %`, c'est indéfini — le taux devrait être « non mesuré », comme l'est le taux de réponse juste à côté. |
| **Expansion**      | « Clients actifs **0** » + « pas de photo le mois dernier »             | La carte porte l'icône « non mesuré » et affiche pourtant un 0. Si aucune photo n'a été prise, 0 n'est pas VRAI.          |
| **Conversion**     | « Conversions 0 » + « Taux de conversion non mesuré »                   | Cohérent, aucun défaut — cité pour montrer que le bon traitement existe déjà dans le même écran.                          |

⚠️ La question à poser à chacun : _si cette valeur est absente, « 0 » est-il VRAI ?_
Primitives `UnknownValue` / `MeasuredValue`, gardes GA-18 / GA-19.

À noter : le voisinage immédiat fait les deux choses. « Conversion » et « Sourcing » disent
« non mesuré » ; « Qualification » et « Expansion » écrivent « 0 ». C'est le même écran,
donc probablement le même composant nourri par deux chemins de calcul différents — chercher
la DÉRIVATION, pas l'affichage.

**Lot à lancer** (`fix/k7-le-pilotage-ne-compte-plus-un-inconnu-pour-zero`, plage à réserver
au dispatch) — **en attente d'une place**, la limite de 20 sous-agents simultanés était
atteinte.

### L9 — balayage des écrans de la barre latérale (30/08, matin)

Chaque écran a été atteint **en cliquant** depuis la barre latérale, jamais par une URL tapée.

| Écran                              | État      | Ce qui a été vu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aujourd'hui** (`/briefing`)      | ✅        | Agenda, relances, « ce qui a bougé depuis ta dernière visite ». Contenu réel. Une carte de relance ouvre bien la messagerie sur le bon fil.                                                                                                                                                                                                                                                                                                                                                                                  |
| **Messagerie** (`/mailbox`)        | ⚠️        | Recherche par intention, 17 fils. Six fils **au libellé identique** (« Louis, toujours intéressé ? », même expéditeur, 24→29 août) présentés comme six entrées distinctes — la liste devient illisible. À vérifier : ces six sont classés « Réponses favorables » alors qu'ils ressemblent à une séquence de relance sortante.                                                                                                                                                                                               |
| **Comptes** (`/accounts`)          | ⚠️        | Voir L2, L3, L4. Le bouton « Analyser une entreprise » est bien présent et atteignable (demande de Louis, livrée).                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Contacts**                       | ✅        | Entonnoir 9 077 détectés → 175 prêts à contacter. **Les chiffres tombent juste** : 79+84+29+175 = 367 (« identité vérifiée » cumulé), 8 710+367 = 9 077. Deux barres de filtres empilées, à surveiller.                                                                                                                                                                                                                                                                                                                      |
| **Découvrir** (`/discover`)        | ✅✅      | **Le meilleur écran du produit.** « Explorer ne consomme aucun crédit », et le bandeau « Résultats partiels » nomme chaque écart : « 9 entreprise(s) portant un nom partagé par plusieurs entités du registre (homonymie non tranchée) — écartée(s), **aucun SIREN inventé** » ; « le registre n'a pas répondu — **panne de source, pas un problème de données** ». Comptage complet : 76 détectées · 40 examinées · 23 affichées · 17 écartées · 36 non examinées.                                                          |
| **Projets** (`/projects`)          | ⚠️ mineur | Pipe à 5 colonnes. La valeur du pipe s'affiche « non mesuré — aucun montant saisi sur 1 projet au pipe » : correct sur le fond, mais **rendue sans son libellé**, quand ses deux voisines (« 428 projets détectés à reprendre », « 222 signaux, comptés à part ») ont le leur. Vérifié : aucun débordement (`scrollWidth == clientWidth`), ce n'est pas une troncature. ⚠️ À croiser : **428 projets détectés** ici, **651 projets ouverts sans montant** au Pilotage — deux chiffres proches pour des notions à distinguer. |
| **Vivier** (`/consultants`)        | ⚠️        | Dépôt de CV, filtres, « aucun consultant dans ton espace — les candidats ne sont pas comptés ici » (bien formulé). Deux défauts : une **pastille « 1 » nue** en haut à gauche, sans libellé, là où les autres écrans écrivent « 3 alertes » ou « 4 contrôles à traiter » ; et un candidat affiché sous son **nom de fichier** — `cv_anonyme_louis_ai-engineer-node_gw` — présenté à la place d'un nom de personne.                                                                                                           |
| **Missions** (`/missions`)         | ✅        | État vide **exemplaire** : « 1 mission terminée n'est pas listée ici : cet onglet ne montre que ce qui tourne. Une mission naît d'un projet signé… » + le geste (« Ouvrir les projets »). À citer en modèle pour L3.                                                                                                                                                                                                                                                                                                         |
| **Actions** (`/actions`)           | ⚠️        | Journal complet et juste (ROCHE y figure avec « Score mis à jour 6 → 5 » et « Analyse complète »). Deux défauts : la colonne **Date est tronquée** (« 30 août 20:… ») ; et **trois niveaux de navigation empilés** — les onglets `Actions / Chaînes / Outils connectés / Séquences`, puis les pastilles `À valider 0 / Planifiées 15 / …`, puis les onglets `Depuis ma connexion / Tous / Analyses / …`.                                                                                                                     |
| **Pilotage** (`/pilotage`)         | ⚠️        | Voir L8. L'ancien « Cohérence 13/100 » a bien disparu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Pilotage › Qualité des données** | ✅✅      | Voir L7 — le modèle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### L10 — un défaut d'écran qui revient : les colonnes tronquées à droite

Constaté sur `/accounts` (« Prochaine action » → « Prochai… », « Ouvrir le c… ») et sur
`/actions` (colonne Date → « 30 août 20:… »), à 1 512 px de large. Ce n'est donc pas propre
à un écran.

Rappel de la règle : ce qui déborde défile dans SON conteneur, jamais le corps de la page
(D81). À mesurer sur plusieurs largeurs avant d'en faire un lot — un tableau dense a le
droit de défiler horizontalement, mais une colonne coupée sans possibilité de la lire n'est
pas un défilement.

---

## Section M — recette live du 30/08, fin de journée (la vague L en production)

Passe menée dans Chrome, sur la production, avec le compte de Louis (122 crédits,
24 comptes analysés). **Porte de déploiement franchie AVANT d'ouvrir le
navigateur** : `GET /version` rendait `api b113f580e` et `ia b113f580e`, soit le
commit de fusion de la PR #1263 — les trois services sur le mien. Chaque écran a
été atteint **en cliquant** depuis la barre latérale, jamais par une URL tapée.

### M1 — les cinq lots de la vague L, un par un

| Lot    | Ce qui a été VU à l'écran                                                                                                                                                                                                      | Verdict             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| **L1** | `/mailbox`, filtre « Réponses favorables » : **2 fils** au lieu de six lignes jumelles. La séquence est devenue UN fil — « Louis, toujours intéressé ? · nathan.kosmowski@esce.fr · 30 août 17:34 · **17 messages** »          | ✅ vérifié          |
| **L2** | `/projects` : « **Valeur du pipe** — non mesuré, aucun montant saisi sur 1 projet au pipe », rendu avec son libellé comme ses deux voisines (« 428 projets détectés à reprendre », « 222 signaux, comptés à part »)            | ✅ vérifié          |
| **L4** | `/actions` : un seul rang d'onglets. Le troisième rang a disparu, « Depuis ma connexion » est devenu un bouton bascule dans la barre d'outils                                                                                  | ✅ vérifié          |
| **L5** | `/pilotage/qualite` : « pas de photo le mois dernier » n'apparaît plus qu'**une fois**, dans le résumé d'entête. Les sept répétitions ont disparu                                                                              | ✅ vérifié          |
| **L7** | `/consultants/pool` : les sept pastilles portent leurs comptes (0·0·0·1·0·0·0). **Le zéro de CHARGEMENT n'a pas pu être observé** — l'écran charge trop vite. Le zéro MESURÉ s'affiche bien, ce qui est la moitié de la preuve | ⚠️ à moitié vérifié |

### M2 — ce que la passe a confirmé des vagues précédentes

- **La carte « Qualité Bellum » ne se contredit plus** : « Taux de correction **< 1 %** sur 9078 contacts » avec « Éléments corrigés **12** » (12/9078 = 0,13 %). C'était le défaut le plus grave de la série des « 0 % qui mentent ».
- **La carte « Qualification »** dit « Taux de qualification 0 % **sur 1 besoin pris en charge** » — le dénominateur est nommé, et 0/1 vaut bien 0 %. Correct.
- **Le vivier** : la pastille dit « **1 profil au vivier** » au lieu d'un « 1 » nu, et la fiche sans nom écrit « **Nom non renseigné** » avec `cv_anonyme_louis_ai-engineer-node_gw` présenté comme un fichier déposé, pas comme un nom de personne.
- **Le tableau de `/actions` déborde**, mais **dans SON conteneur** (`overflow-x: auto`, `scrollWidth` 1008 pour `clientWidth` 749) et le corps de la page ne défile pas horizontalement. C'est exactement la règle.

### M3 — le « défaut » que j'ai cru trouver, et qui n'en était pas un

**J'avais écrit** : la carte « Expansion » de `/pilotage` porte l'icône « non
mesuré » ET affiche « Clients actifs — 0 », avec « pas de photo le mois dernier ».
J'en avais conclu au motif le plus surveillé du dépôt — un zéro qui ment.

**C'était FAUX, et le lot lancé pour le mesurer l'a prouvé en lisant la
dérivation plutôt qu'en me croyant :**

- `apps/api/src/modules/pilotage/pilotage.service.ts:188` —
  `COUNT(*) FILTER (WHERE commercial_status = 'customer')` : une vraie lecture,
  jamais un défaut à zéro. **Il y a réellement zéro client actif.**
- `apps/web/src/features/pilotage/view/chain-reading.ts:64-90` — `levelReading()`
  rend **quatre** états, pas trois : `ok` · `alerte` · `nothingToJudge` · `unread`.
  L'icône que j'ai lue « non mesuré » est **« rien à juger »** — ce qui est exact
  quand le compte vaut zéro : il n'y a rien à juger, et le zéro reste vrai.
- Le tout est gardé par **GA-108 / GA-109**, et `PilotagePage.test.tsx:371-387`
  couvre littéralement les deux cas (zéro mesuré → pas de gris ; valeur non lue →
  gris conservé). Correctif déjà mergé le matin même (`8038ae835`).

⚠️ **La leçon, et c'est la troisième fois de la journée** : à l'écran, une icône
ressemble à une autre. J'ai lu « non mesuré » là où le code dit « rien à juger »,
et j'ai bâti un défaut dessus. **Un constat de recette est une HYPOTHÈSE tant que
la dérivation n'a pas été lue** — c'est exactement pour ça que le prompt du lot
disait « ne devine pas, dis laquelle des deux lectures est vraie ». S'il avait dit
« corrige le 0 », le produit aurait perdu une mesure juste.

Aucune autre carte de cet écran (`CrmPipelinePanel`, `KpiCataloguePanel`,
`ContributionPanel`, `RitualsPanel`, `ChainAlertsBadge`) ne reproduit l'anti-motif
— vérifié par le même lot.

### M4 — deux défauts de copie, mineurs mais visibles

- `/pilotage/qualite` écrit « **aucun** mission active dans ton espace » à deux endroits — accord fautif, c'est « aucun**e** ». Confié au même lot que M3.
- `/consultants/pool` : la pastille du premier segment est **collée à son libellé** (« Bientôt disponibles0 ») quand les six autres ont leur espace.

### M5 — deux FAUSSES alertes de ma part, corrigées sur place

Elles valent d'être écrites, parce que les deux viennent de la même faute : conclure avant de vérifier.

1. **« Messagerie a disparu de la barre latérale. »** FAUX. La barre ne porte que
   dix liens et `/mailbox` n'en fait pas partie — mais c'est un **sous-onglet
   d'« Aujourd'hui »** (Ma journée · Messagerie · Tableau de bord), atteignable en
   deux clics. La règle « l'atteindre en cliquant » est respectée.
2. **« La production est bloquée 43 commits en arrière. »** FAUX. `51dfe2fb8` est
   le commit de FUSION de la PR #1262 et `713d4cb3a` son parent ; les deux portent
   le même horodatage à la seconde et `git log` trie par date. Détail et remède au
   §9.3 du tracker.

### M6 — ce que cette passe n'a PAS vérifié

- **Le mobile** (sous 768 px) : pas rejoué. `resize_window` exige un onglet NEUF, et la passe a été menée sur un onglet déjà rendu.
- ~~**Les deux thèmes**~~ : **FAIT après coup.** `/pilotage` basculé en thème sombre — tout lisible, aucun contraste fautif. Et la bascule rend la PREUVE VISUELLE de l'erreur du §M3 : **quatre icônes distinctes** coexistent sur le même écran — ✓ (Acquisition, Qualité Bellum) · ⚠ (Conversation, Qualification, Conversion) · **⊖ (Expansion)** · ◌ (Sourcing, Économie). C'est exactement ce que `levelReading()` déclare : `ok` · `alerte` · `nothingToJudge` · `unread`. Le ⊖ que j'avais lu « non mesuré » est « rien à juger », et le ◌ est « pas lu ». **Deux icônes pour deux notions que je confondais en une.**
- **Le mode démo** : pas ouvert.
- **Le zéro de chargement du pool** (L7) : l'écran charge trop vite pour l'observer à l'œil ; seul le test le prouve.

Aucun de ces quatre points n'est compté comme fait.

### M7 — le test qui casse en même temps qu'un lot n'accuse pas ce lot

La CI est tombée rouge sur `AccountContent.selection.test.tsx` — un seul test sur
201 — au moment où le lot d'accessibilité du portefeuille est arrivé. **Trois
conclusions successives ont été fausses avant que l'instrumentation ne tranche.**

| #   | Conclusion                                                               | Pourquoi elle était fausse                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | « Échec **pré-existant**, polyfills jsdom d'un autre fichier » (l'agent) | Le test passait avant le lot en contexte de suite complète                                                                                                                                                     |
| 2   | « C'est le **composant**, le lot a cassé la sélection » (moi)            | Mon contrôle n'avait restauré qu'`AccountContent.tsx` depuis `origin/main`, en gardant les cinq autres fichiers du lot. **Restaurer un fichier sur six ne prouve rien**                                        |
| 3   | « La sélection est cassée **en production** » (moi encore)               | Mes deux premiers clics dans Chrome n'avaient rien coché — l'écran n'avait pas fini de se rendre. Re-cliqué et relu : « 2 comptes sélectionnés », « Comparer », « Effacer la sélection ». **Production saine** |

**La cause réelle, établie en suivant l'identité des nœuds DOM** — pas en
raisonnant :

Le mock `framer-motion` de trois fichiers de test crée `motion.div` par un
`Proxy` **sans cache** : chaque accès rend une **closure neuve**. React compare
le type d'un élément **par référence** ⇒ il **démonte et remonte tout le
sous-arbre** au premier re-rendu. Après le clic, la case gardait
`aria-checked=false` et son nœud avait **`isConnected=false`** : un sous-arbre
ORPHELIN, cohérent avec ses ancêtres mais détaché du document. Le clic n'a jamais
atteint le gestionnaire du nœud réellement affiché.

⚠️ **Le défaut dormait depuis des mois.** Le seul hook de requête de cet arbre
(`useAccountSectors`) est gardé par `enabled: !!user`, et le harnais monte avec
`user: null` — **aucun second rendu ne survenait jamais**. Le lot a simplement
ajouté la première requête non gardée sur `!!user`, donc le premier re-rendu que
ce test ait connu. Il a porté le chapeau d'un défaut qu'il n'a pas écrit.

**Le correctif** : un cache par balise dans le `Proxy`. Aucun composant touché,
le test n'est pas affaibli — il simule enfin correctement la bibliothèque, dont
le vrai `motion.div` est une référence STABLE (c'est pourquoi rien n'a jamais
cassé à l'écran).

**À retenir pour la méthode** : un contrôle de régression doit porter sur le
**même grain** que le changement (le dossier entier, pas un fichier), un clic
sans effet n'est pas une preuve qu'un geste est cassé, et quand trois
raisonnements se contredisent, c'est l'**instrumentation** qui tranche — ici,
`isConnected` sur le nœud cliqué.

**À ajouter au balayage ZÉRO régression** : cocher deux comptes sur `/accounts`
et vérifier que la barre apparaît. Ce geste manquait au protocole.

---

## Section N — recette live de la vague L (2/2), 30/08 au soir

Porte de déploiement franchie AVANT d'ouvrir Chrome : `GET /version` rendait
`api 834736d7e` et `ia 834736d7e`, le commit de fusion de la PR #1264. Compte
réel de Louis, 122 crédits.

### N1 — ce qui est vérifié

| Lot     | Ce qui a été VU                                                                                                                                                                                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M10** | `/missions` › Facturation : **aucune clé i18n brute** sur l'écran (balayage machine du texte visible : zéro motif `mot.mot.mot`). Le bloqueur affiché nomme son geste — « Facture partie, non payée, sans échéance de règlement… Saisis l'échéance pour démarrer la cadence » |
| **M6**  | `/accounts` : la colonne « **Accessibilité** » est présente, entre « Score /10 » et « Effectif ». Elle affiche « **–** » et non « 0 » ni une classe inventée                                                                                                                  |
| **M16** | `/projects` › Besoins : le bouton « **+ Créer un besoin** » est là, atteignable en deux clics. Le dialogue s'ouvre, dit ce qu'il demande (« le minimum pour poser un besoin avant même d'avoir ouvert le projet »), deux champs, « Créer » désactivé à vide                   |
| —       | `/discover` : **onze appels réseau, tous 200** (ou 201 pour `POST /laura/plan`). Aucune erreur console                                                                                                                                                                        |

### N2 — ⚠️ LE DÉFAUT QUE L'ÉCRAN CACHAIT

**`GET /accounts/access-summary` répond `500 Internal Server Error`** — la route
que M6 vient de livrer.

**Et rien ne le montre.** La colonne « Accessibilité » dégrade proprement et
affiche « – » pour chaque compte : **exactement** ce qu'elle afficherait si la
fonctionnalité marchait sur un espace sans donnée. C'est le motif « cassé et non
mesurable se ressemblent », dans sa forme la plus pure.

Ce que j'ai éliminé, sur la même session authentifiée :

| Appel                          | Résultat                                  |
| ------------------------------ | ----------------------------------------- |
| `GET /accounts?limit=1`        | **200**, données réelles                  |
| `GET /accounts/{uuid}/access`  | **200**, `{"lock":{"state":"inconnu",…}}` |
| `GET /accounts/access-summary` | **500**                                   |

Donc la route est bien atteinte (sinon 404, ou 400 par le `ParseUUIDPipe` de
`:id/access` si elle avait été capturée comme un identifiant), la session et
`workspaceOf` fonctionnent : **c'est le corps de `accessSummary` qui jette.**
Suspect n°1 : le `select` en forme d'OBJET sur la colonne `jsonb`
`raw_analysis`. Lot lancé — `fix/n18-le-resume-daccessibilite-repond-500`.

⚠️ **La leçon de méthode** : je n'aurais RIEN vu en regardant l'écran. Le défaut
est sorti d'un appel réseau fait à la main. **Le point 6 du protocole de recette
— « console et réseau : tout 4xx/5xx est un défaut, même si l'écran a l'air
correct » — vient de payer son écriture.**

### N3 — un défaut de lisibilité, mineur mais réel

Le dialogue « Créer un besoin » propose les projets existants sous la forme
« SARL ER — Les besoins en données, cybersécuri… », « SARL ER — Florent, Henri,
Michel, Francois Rapin est id… ». **Cinq entrées commencent par le même nom de
compte** et se distinguent par un fragment de **phrase de signal** tronqué — pas
par un nom de projet. Choisir est difficile.

Cause probable : le libellé d'un projet est le texte du signal qui l'a fait
naître. Ce n'est pas un défaut du dialogue, c'est ce que le produit appelle un
projet. À trancher : soit les projets prennent un nom court, soit la liste
affiche autre chose que leur libellé.

### N4 — ce que cette passe n'a PAS vérifié

- Le filtre de classe d'accès de Découvrir et la stratégie par classe (M5) :
  exigent une recherche complète, non lancée.
- La bulle de Laura sur l'intercontrat (M14/N8) : exige un consultant en
  intercontrat de plus de 30 jours dans l'espace.
- La bascule automatique des sprints (M8/M13/M18) : exige d'enregistrer une
  réponse positive sur un contact, ce qui ÉCRIT dans l'espace de Louis.
- Le mode démo, et le mobile sous 768 px.

Aucun n'est compté comme fait.

---

## Section O — le 500 corrigé, vérifié de bout en bout (30/08, nuit)

Porte de déploiement franchie : `GET /version` rendait `api 3e85576cd` et
`ia 3e85576cd`, le commit de fusion de la PR #1266.

### O1 — la preuve, en trois mesures

| Mesure                                          | Avant (vague L 2/2)        | Après (vague N)                                                                       |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `GET /accounts/access-summary` **sans session** | —                          | **401** — l'authentification mord, donc la route est atteinte par SON handler         |
| `GET /accounts/access-summary` **avec session** | **500**                    | **200** — 28 comptes : **14 classe A · 9 classe B · 5 sans classe**                   |
| La colonne « Accessibilité » à l'écran          | « – » sur TOUS les comptes | « Ouvert » sur les comptes classés, « – » sur ceux qui n'ont réellement pas de classe |

### O2 — ce que cette vérification apprend, et qui vaut plus que le correctif

**La donnée était là depuis le début.** 23 comptes sur 28 avaient une classe
d'accès pendant que la colonne affichait « – » partout.

Et **le même écran le disait déjà** : le compteur d'entête annonce « **23 de
classe d'accès A ou B** » — exactement 14 + 9. Deux chiffres de la même page,
l'un juste, l'autre muet, et **rien ne signalait la contradiction**.

⚠️ C'est la forme la plus coûteuse du motif « cassé et non mesurable se
ressemblent » : non seulement la panne ressemblait à un vide, mais la **preuve
qu'elle n'en était pas un** était affichée à quinze centimètres, sur le même
écran, depuis le début.

**Ce qui entre au protocole de recette** : quand un écran porte à la fois un
COMPTEUR agrégé et une COLONNE de détail sur la même notion, les croiser. Un
compteur à 23 au-dessus d'une colonne vide est une contradiction, pas un vide.
