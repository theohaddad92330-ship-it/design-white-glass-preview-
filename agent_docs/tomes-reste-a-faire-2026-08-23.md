# Ce qui restait des huit tomes — 23/08/2026

Les six trackers précédents (`tome1` → `tomes6-8`) closent chacun leur périmètre.
Ce document couvre ce qui restait **en travers** d'eux : quatre décisions posées
en un lot à Louis le 23/08, et les chemins morts que le croisement des huit
tomes avait nommés sans les brancher.

## Les quatre décisions

| #   | Question                                                            | Réponse de Louis              | Ce qui a été fait                                                   |
| --- | ------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| 1   | Anti-conseil : allumer les 6 règles ou seulement les 3 factuelles ? | **Allumer les six**           | `ANTI_ADVICE_ENABLED = true`, et surtout les règles sont ALIMENTÉES |
| 2   | Primitives front : incrémental ou migrer les 57 routes ?            | **Migrer les 57 routes**      | 3 primitives écrites, sites corrigés, 2 gardes en cliquet           |
| 3   | Laura Produit : deux voix ou une ?                                  | **Le copilote DEVIENT Laura** | Persona fusionnée, prénom threadé jusqu'au prompt                   |
| 4   | Veille territoriale : photo hebdo, écran, ou les deux ?             | **Livrer les deux**           | Cron du lundi + `/pilotage/marche` + routine                        |

## 1 — L'anti-conseil, allumé ET nourri

`ANTI_ADVICE_ENABLED` valait `false` en attendant un jeu de recette. Louis a
tranché de l'allumer : les six règles ont chacune leur raison chiffrée et leurs
tests, et chaque interdit affiche SA RAISON.

Mais allumer un drapeau ne suffisait pas — c'est le défaut récurrent des huit
tomes sous une autre forme. `firstMove` recevait un `FirstMoveInput` construit
à vide : allumé, il n'aurait produit **aucun** interdit. `first-move-input.ts`
le construit désormais depuis `raw_analysis` (barrière d'accès et son `statut`,
signaux d'emploi, marchés attribués, pile technique, ESN déjà présentes) et
depuis le classement d'entités de l'onglet Accès. Tout ce qui est inconnu reste
`null` — un interdit ne se déclenche jamais sur une absence.

⚠️ Le service IA rendait le statut de la barrière **uniquement en prose
française** ; `access_scoring.py` expose maintenant `statut` en clair. Conclure
d'un texte est exactement ce que le dépôt s'interdit ailleurs.

## 2 — Les primitives d'affichage, et deux gardes

Trois primitives dans `apps/web/src/components/primitives/` :

- **`UnknownValue` / `MeasuredValue`** — « non mesuré », jamais `0`. La règle
  était appliquée au CALCUL depuis des mois, puis un écran écrivait
  `{value ?? 0}` et tout le travail était perdu.
- **`ScoreWithAxes`** — un score n'est jamais nu : ses axes, ce qui n'a pas pu
  être évalué (NOMMÉ, pas compté), et un rendu `68/80` qui ne peut pas devenir
  un pourcentage (7ᵉ application de l'arbitrage n°4).
- **`Provenance`** — la source ET la date. `field_provenance` arbitrait les
  écritures depuis des mois sans que les écrans en montrent quoi que ce soit.

Deux sites réels corrigés au passage, tous deux du tome 1 : `accès 0/20` sur une
adressabilité NON mesurée (un 0/20 met le compte en bas du tri d'accès) et cinq
étoiles vides sur un contact jamais évalué.

**GA-18** (écrans affichant une note nue, ≤ 32) et **GA-19** (`?? 0` dans les
écrans, ≤ 87) sont des **cliquets**, comme GA-05/07/09 : une garde exigeant zéro
tomberait au premier jour et serait désactivée dans la semaine. Tous les `?? 0`
ne sont pas des fautes — sur une longueur ou un compteur, zéro est vrai. La
question écrite dans la garde : _si cette valeur est absente, « 0 » est-il VRAI ?_

Pas de garde « une seule voix » côté web : sa première version remontait deux
fichiers corrects (l'écran MCP, où « assistant IA » désigne l'assistant
PERSONNEL de l'utilisateur). Une garde à faux positifs se désactive.

## 3 — Une seule voix

Le copilote s'appelle Laura, comme sur le site. Deux moteurs de conversation,
ce seraient deux vérités possibles pour la même question. La persona est nommée
DANS le bloc `_BLOCK_LAURA` existant — ⚠️ j'en avais d'abord ajouté un second,
qui était silencieusement écrasé par le premier : le prompt ne contenait pas le
mot « Laura » et trois tests passaient quand même.

Le **prénom** est threadé `profiles` → chat-context → `ia.client` → requête IA →
prompt, avec la consigne de ne l'employer qu'une fois toutes les deux ou trois
réponses. Prénom absent ⇒ aucune consigne ajoutée, prompt byte-identique.

## 4 — La veille territoriale

Deux tables, et l'asymétrie qui les justifie : `territory_subscriptions` est
scopée à l'espace (suivre la Haute-Garonne est une intention commerciale) ;
`territory_snapshots` ne l'est pas (le nombre d'offres IT là-bas est le même
pour tout le monde — 3ᵉ table partagée, déclarée à GA-16).

**Ce que la photo débloque compte plus que l'écran** :
`esn_directory.hiring_baseline` existait, le score de débordement la lisait, et
**rien ne l'écrivait** — son axe « Volume » était structurellement non
mesurable. `hiringBaseline()` la construit, en MÉDIANE (une semaine de campagne
déplacerait une moyenne) et seulement à partir de treize photos : un
« d'habitude » sur trois points n'est pas un « d'habitude ».

`territoryChanges()` est pure et porte les trois règles d'honnêteté : une
semaine non mesurée ne produit AUCUNE variation (sinon une maintenance de source
se lit « −100 % d'offres »), une variation relative sur une petite base est du
bruit, et un ralentissement d'ESN n'est pas notifié (aucun geste associé).

Écran `/pilotage/marche`, routine `territory_watch`. La routine lit les deux
tables et la fonction pure plutôt que le service du module voisin : **GA-07 est
au plafond (233)**, et c'est exactement l'échappée que la garde nomme.

## Les chemins morts branchés

- **`shouldSwitch`** — sept règles de bascule d'effort écrites, testées, **sans
  appelant**. `SprintsService.applyEvent` + `POST /sprints/accounts/:id/event`.
  Les deux bascules qui MONTENT s'appliquent seules ; les cinq qui descendent
  sont PROPOSÉES (descendre l'effort à la place du commercial, c'est décider à
  sa place d'abandonner). Une bascule automatique refusée par le plafond du
  Focus redevient une proposition plutôt que de disparaître.
- **F08, la fenêtre de référencement** — `lockFactFromAwards` calculait
  `reopensOn` et ne le rangeait que dans la phrase française du `detail`.
  Colonne `access_facts.reopens_on` (migration `1789997584210`), fonction pure
  `referencingWindowAlert` (T-9/T-6/T-3, **un seul jalon à la fois**, le plus
  proche), routine `referencing_window`. Échéance inconnue ⇒ jamais d'alerte.

## Ce que la recette live a trouvé

Deux défauts, sur le **premier compte ouvert**, tous deux invisibles derrière
10 300 tests verts.

1. **Le déploiement ne démarrait pas.** `RoutineExecutors` injecte les deux
   dépôts de la veille ; le module `routines` ne les déclarait pas. Build ✓,
   Deploy ✓, **Healthcheck ✗**. Aucun test ne le voit — les tests unitaires
   construisent le service à la main et ne passent jamais par l'injection.
   C'était la DEUXIÈME occurrence (22/08 puis 23/08), d'où **GA-20**.
   ⚠️ Sa première version annonçait sept modules fautifs qui ne l'étaient pas :
   les `forFeature` du dépôt sont commentés ligne par ligne, et une virgule dans
   un commentaire cassait le découpage. Commentaires retirés AVANT lecture.
2. **La FORME du seed.** L'analyse ajoutée au client d'exemple écrivait
   `technology_stack: ['kubernetes', …]` — de simples chaînes — quand le
   lecteur du brief et les cinq comptes réels attendent
   `{ name, usage, maturity }`. `item['name']` vaut `undefined` sur une chaîne :
   la pile technique était VIDE à l'écran et l'anti-conseil restait muet sur le
   seul compte censé le montrer. Rien ne tombait — la table était seedée, la clé
   présente, le type `unknown[]` satisfait. C'est la version « forme » du défaut
   « lire et écrire dans deux tables ». Trois assertions de forme le gardent.
3. **`product` matchait « production ».** Sur un compte industriel,
   « Responsable production » comptait comme un poste produit et l'interdit de
   vocabulaire se serait déclenché sur une entreprise sans équipe produit. Des
   expressions entières remplacent les racines.

Et une lacune de **parité démo** : le `raw_analysis` du client d'exemple était
`{}`, donc l'anti-conseil allumé le matin même ne pouvait se déclencher nulle
part dans la démonstration. L'analyse est posée sur le client FICTIF et pas sur
les cinq comptes réels — une barrière d'achat à 8,2/10 est une affirmation sur
la façon dont une entreprise achète.

## Ce qu'on ne promet pas

- **Les guards GA-21 à GA-24** (RAG `doc_id`, bibliothèques lourdes par route,
  cache buster, provenance obligatoire) : ils gardent des règles qui n'ont pas
  encore de violation mesurée. Poser un cliquet sur un compte qu'on n'a pas fait
  produirait une garde verte pour toujours — le défaut que GA-05 a mis un mois à
  révéler.
- **La migration des 57 routes une par une** : ce qui a été migré est ce où
  `null` voulait dire « je n'ai pas regardé ». Réécrire les autres pour la forme
  produirait un diff que personne ne peut relire, sans corriger un seul défaut.
- **L'interdit d'entité en démonstration** : il exige une barrière > 7 ET une
  entité classée > 75, or le classement d'accès plafonne à 86 et n'atteint 75
  qu'avec sept contacts et deux sites rattachés à la même entité. Le fabriquer
  ferait ranger une donnée de démonstration selon ce qu'on veut voir s'afficher.
- **L'interdit affiché à l'écran de démonstration** : la donnée est vérifiée en
  production dans une salle re-semée après déploiement (bonne forme, trois
  postes produit, barrière 8,2 avec son statut), mais les salles ne se remettent
  à neuf que **libres** — c'est la propriété qui évite d'effacer un espace sous
  les yeux de celui qui présente. Le rendu se verra dans la démonstration à
  mesure que les salles tournent.
- **La photo hebdomadaire vérifiée en live** : le cron tombe le lundi à 5 h. Son
  chemin d'écriture est couvert par quatre tests unitaires (dont « une source
  indisponible écrit `null`, jamais 0 » et « une même semaine ne compte pas
  deux fois »), mais il n'a pas encore tourné en production.
- **Les sept évènements de sprint détectés automatiquement** : `positive_reply`
  et `meeting_booked` supposent de classer une intention dans le CORPS d'un
  message, que le socle ne lit pas. Le point d'entrée existe, ses appelants
  arriveront quand la détection sera honnête.
