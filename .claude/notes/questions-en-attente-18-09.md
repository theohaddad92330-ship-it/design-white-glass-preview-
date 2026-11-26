# Questions en attente — Louis absent du PC (18/09/2026)

Consigne reçue : « me pose plus de questions, mets les de côté ». **Rien n'est bloqué par
ces questions** : le travail continue autour, et chacune est prête à être tranchée en une
ligne ou deux.

**Comment lire ce fichier.** Le tableau ci-dessous porte les questions **courtes** — celles
qui tiennent en une phrase. Les sections numérotées qui suivent portent les questions qui
demandent leur contexte : ce qui est mesuré, ce qu'on fait en attendant, et pourquoi ça ne
peut pas se deviner.

**Une question résolue depuis, et la façon dont elle l'a été mérite d'être dite** :
« le délai de 45 s sur Découvrir, on l'allonge, on le découpe ou on l'assume ? » n'avait
**aucune** bonne réponse — parce que la question était mal posée. La mesure a montré que la
vraie cause n'était pas le délai mais **un dispatcher HTTP unique** partagé entre les appels
interactifs et les phases d'analyse de fond, dans le même processus que le worker de file.
Un pool séparé pour l'interactif, et le problème disparaît sans toucher à la borne.

| # | La question | Ce qu'on fait en attendant | Pourquoi ça ne peut pas se deviner |
|---|---|---|---|
| — | `/backoffice/address` rend 403 — l'usurpation d'identité (se mettre à la place de Ludovic) est impossible pour la recette. | Recette faite sur le compte de Louis et sur `/demo`. | Le 403 vient d'un droit serveur, pas du code. |
| 2118.16 | Défaut de recette 17/09 : la Synthèse THALES ne porte **pas** de verdict, et le « Verdict stratégique » de l'onglet Plan ne cite pas la stratégie validée à l'audit. Est-ce un défaut d'analyse ANCIENNE (compte analysé avant le correctif) ou un défaut de code ? | Traité par le lot AF (rattrapage ciblé par segment) : tant qu'un compte n'est pas rejoué, son écran doit DIRE que sa collecte est antérieure. | C'est précisément la règle « un correctif de collecte rattrape l'existant ». |
| 2151.59 | **Ajouter une information terrain depuis Découvrir.** Le mécanisme existant (`TabAccess`, `fr/access.json question.ask.*`) est une question à **choix fermé**, rattachée à un dossier de compte et à un moment de barrière précis. Il ne se généralise pas à une **saisie libre** sur un candidat de Découvrir. Faut-il (a) une saisie libre neuve, (b) étendre le choix fermé, ou (c) on ne le promet pas ? | Le point reste `retenu`. Rien n'est inventé. | Les trois options ont des coûts et des surfaces très différents, et (c) est un arbitrage produit. |
| 2165.17 | **Preset « Où positionner un consultant » dans Découvrir.** Le preset suppose de choisir UN consultant avant de lancer ; Découvrir n'a **aucun sélecteur de consultant**, et le marché inverse vit déjà ailleurs (`/consultants/$id_.reverse-market`). En fabriquer un pour ce seul preset dépasse le périmètre d'un filtre. On le construit, ou on renvoie vers le marché inverse ? | Le point reste `retenu` avec sa raison. | Construire un sélecteur est un écran, pas un filtre. |
| 2018.5 | **Le volet « notifications » de la question sur les outils personnels.** Le poser dans l'accueil **dupliquerait** un réglage qui vit déjà dans `modules/notifications` — un réglage vit à UN seul endroit (garde GA-26). On le duplique quand même pour l'accueil, ou on renvoie vers le réglage existant ? | Le volet « outils personnels » est livré ; le volet « notifications » est laissé avec sa raison écrite. | C'est un arbitrage entre confort d'accueil et règle d'unicité. |

## 9. Les six recettes d'onboarding restent bloquées — mais PAS pour la raison que j'avais écrite

⚠️ **Correction de ce que j'avais noté plus tôt.** J'avais écrit que la session navigateur
était sur un compte de démonstration, et que c'était la cause. **La première moitié n'est plus
vraie, et la seconde était incomplète.**

**Ce qui est mesuré maintenant** (recette du 18/09 sur `ad014503d`) : la session est sur
**ton compte RÉEL** — `/accounts` affiche « Ton portefeuille de comptes », **31 suivis**
(SAFRAN, DASSAULT SYSTÈMES, THALES, LVMH, AIRBUS, BNP Paribas, TOTAL, FREE, EDF…), et
**aucune occurrence de « MODE DÉMO »** dans la page. La salle de démonstration n'est plus
en cause.

**Et `/onboarding` redirige quand même vers `/chat`.** C'est cohérent avec la porte
(`onboarding-gate.ts`) : elle rend la main dès que le questionnaire est `completed` **ou**
qu'un « Plus tard » a été posé. Ton compte est dans l'un de ces deux états — donc le
questionnaire ne s'affichera pas, quoi qu'on fasse, et **c'est le comportement voulu**.

À noter : la checklist « Bien démarrer avec Bellum » affiche **4 étapes sur 7**. Ce n'est
PAS le questionnaire d'accueil — deux choses différentes qui portent le même mot.

**Ce que ça bloque.** Six preuves écran de correctifs **déjà servis en production** :
`#2577` (le bouton « Continuer » dit ce qui manque, `aria-disabled`, une seule durée),
`#2541` (remonter en haut à la salve suivante), `#2538` (plusieurs domaines personnalisés),
`#2539` (« assistance technique » et « régie » expliqués), `#2540` (« je n'en ai pas encore »),
`#2572`.

**Ce qu'on fait en attendant.** Rien n'est fermé sur une preuve de code seule. Les six
correctifs sont vérifiés au code, à l'appelant, et par des tests qui savent dire NON. Les
issues restent ouvertes avec un commentaire compté qui dit exactement où on en est.

**Ce qu'il te faut trancher.** Ces preuves demandent un compte dont l'accueil n'est **pas**
terminé : (a) tu ouvres un compte de test neuf et je recette dessus, (b) tu demandes une
reconfiguration sur ton compte (Réglages › Profil), ce qui rouvre le questionnaire, ou
(c) on assume la preuve de code + tests et on ferme les six. **Je ne déclenche rien
moi-même sur ton compte réel** — une reconfiguration est un geste qui t'appartient.
## 10. `#2548.4` — quelles sont les « 8 à 12 questions essentielles » ?

**Ce qui est mesuré.** Le Temps 1 de l'accueil compte **72 questions**
(`apps/web/src/features/onboarding/lib/onboarding-gate.ts:356`). La branche
« activité en création » (`maturite.ts`, `hasNoCommercialHistory`) en masque une
trentaine — il en reste environ **42** pour ce profil. Ludovic en demande **8 à 12**,
le reste différé.

**Pourquoi ça ne se devine pas.** Passer de 42 à 12 n'est pas une coupe technique,
c'est **choisir lesquelles**. Ce choix décide de ce que Laura sait faire dès la
première minute et de ce qu'elle devra redemander plus tard. Et il n'existe
aujourd'hui **aucun Temps 2** vers lequel reporter les autres : le construire est
un second chantier.

**Ce qu'on fait en attendant.** Rien. Les trois autres demandes de #2548 sont
servies (branche « en création », choix « je ne sais pas », vocabulaire expliqué)
et l'issue le dit, comptée. Le point 4 reste ouvert et nommé.

**Ce qu'il te faut trancher.** (a) tu nommes les 8 à 12, (b) on propose une liste
et tu l'amendes, ou (c) on assume 42 pour ce profil et on ferme le point.

## 11. `#2502.1` — un organigramme absent doit-il se régénérer TOUT SEUL ?

**Ce qui est mesuré.** Il n'y a pas de rechargement automatique. Le correctif réel
a été de rendre le bouton « Générer / Enrichir » **cliquable à zéro crédit**
(`OrgMapEmptyState.tsx:99`, `TabOrganigramme.tsx:149`, `OrgStructureSection.tsx:54`) —
avant, il était grisé et l'organigramme devenait irrécupérable.

**Pourquoi ça ne se devine pas.** La doctrine dit que **rien de coûteux ne repart
sans un geste**. Un rechargement automatique d'organigramme est une collecte, donc
un coût. Le geste manuel restauré est peut-être exactement la bonne réponse — mais
ce n'est pas ce que l'issue demandait, et personne ne l'a écrit.

**Ce qu'on fait en attendant.** Le point reste ouvert avec sa mesure écrite, et
`#2502.2` (« pareil pour tous les autres ») reste **non servi** — aucune
généralisation aux autres analyses disparues n'existe.

## 12. `#2489.3` — un logo absent, doctrine ou trou ?

**Ce qui est mesuré.** Sur une carte de candidat, le logo ne s'affiche **que** si
le candidat est déjà un compte possédé (SIREN apparié) — sinon une initiale
(`CandidateCard.tsx:147-150`, trace `#2166.1`). Aucune trace `#2489` dédiée au logo.

**Pourquoi ça ne se devine pas.** Ne pas aller chercher le logo d'une entreprise
qu'on n'a pas encore appariée peut être la doctrine qui s'applique (pas de donnée
devinée, pas de scraping, on ne nomme que ce qu'on sait) — ou un simple trou.
Les deux lectures sont défendables et je ne veux pas en inventer une.

**Ce qu'on fait en attendant.** Les deux autres demandes de #2489 sont servies
(espace des cartes, pertinence sectorielle). Celle-ci reste ouverte.

## 13. `#2035.10` et `#2035.11` — deux réglages qui n'existent nulle part

**Ce qui est mesuré** (remesuré le 18/09 par l'écrivain du lot des effectifs, pas repris du registre) :

- **2035.10 — configurer le Reverse Market et le potentiel de réponse** : la capacité
  existe côté IA, **sans aucun écran** pour la régler.
- **2035.11 — configurer la charge commerciale et la priorisation des besoins** :
  **rien du tout**, ni côté IA ni côté produit.

**Pourquoi ça ne se devine pas.** Les deux sortent du périmètre « effectif » où ils
étaient rangés : ce sont des **réglages d'espace**, pas des réponses de questionnaire.
Et « potentiel de réponse » touche une ligne rouge — ça doit nommer une **capacité
configurée**, jamais une chance estimée (aucune probabilité ne s'affiche, refusé six
fois). Écrire ces écrans demande de savoir **où** ils vivent (accueil ? réglages ?
fiche de périmètre ?) et **qui** a le droit de les changer.

**Ce qu'on fait en attendant.** Les deux points restent `retenu` avec leur raison
écrite. Les trois autres demandes de #2035 sont livrées (effectif du groupe, effectif
de la BU, fraîcheur datée).

## 14. `#2271.9` — une cinquième section dans le gabarit de réponse de Laura ?

**Ce qui bloque.** `_BLOCK_FORMAT` (`apps/ia/app/services/bellum_advisor.py`, ~l. 995)
porte une **décision de Louis du 16/09/2026** qui fige le gabarit CONSEIL à **quatre**
sections : Verdict · Pourquoi · Ce qui manque · Prochaine action. #2271.9 demande une
cinquième, « priorités ». **Elle contredirait directement la décision.**

**Ce qu'on fait en attendant.** Un retour qui défait une décision antérieure ne
s'applique jamais en silence : le point reste `à trancher`. Les trois autres sorties
du chat de #2271 sont livrées (carte de compte, timeline, fichier exportable).

**Ce qu'il te faut trancher.** On ouvre le gabarit à cinq sections, ou on maintient
la décision du 16/09 et on ferme le point ?

## 15. `#2544.2` — une donnée qui n'existe dans AUCUNE source branchée

**Le retour** (bêta Ludovic Marx, 17/09) demande qu'un contact rattaché à un
établissement porte la localisation **de cet établissement**, pas celle du siège.

**Ce qui est mesuré, sur l'API RÉELLE le 18/09** (réponse `recherche_entreprises`
pour Arquus) : chaque entrée de `dirigeants` porte `nom`, `prenoms`, `qualite`,
`nationalite`, `type_dirigeant` — et **aucun champ d'adresse ni d'établissement**.
La donnée « dirigeant → établissement » **n'existe dans aucune source déjà câblée**.

**Ce qu'on ne fait pas** : la deviner à partir du siège ou d'un code postal. « Un
contrat d'API non vérifiable ne se devine pas », et une localisation inventée sur
une personne est exactement le genre de donnée qui se retrouve dans un e-mail
envoyé à un client.

**La piste la plus honnête, notée dans le registre** : quand Découvrir affichera
des personnes (hors périmètre aujourd'hui), les faire porter la localisation du
dernier établissement **réellement résolu** par le rapprochement — pas avant.

**Ce qu'il te faut trancher.** On garde le point ouvert en attendant une source
qui porte ce lien, ou on le ferme avec cette raison écrite ? L'autre moitié de
l'issue (`2544.1`, le filtre géographique qui s'applique jusqu'au site) est livrée.

## 16. Deux frictions d'outillage qui m'ont coûté du temps cette nuit

Ni l'une ni l'autre ne demande une décision produit — mais tu es le seul à pouvoir
les lever.

**a) Un agent de recette en LECTURE SEULE vers la production s'est fait refuser**
par le classifieur de permissions (motif « Production Reads »), alors que le fil
principal, lui, lit la production sans problème. Résultat : un lot a dû conclure
sur une mesure de code là où une preuve écran existait à dix secondes. Si c'est un
réglage, il vaut la peine d'être ajusté ; si c'est voulu, je cesse de prévoir des
recettes dans les briefs d'écrivain.

**b) Le budget navigateur du fil principal est de 15 appels.** C'est peu pour une
recette d'écran sérieuse, et c'est pour ça que je passe par un agent `recetteur` —
qui, cf. (a), se fait parfois refuser. Les deux se combinent mal.

**Ce que je fais en attendant** : aucune issue n'est fermée sur une preuve de code
seule quand son critère de recette demande un écran. Elles restent ouvertes avec un
commentaire compté.

## 17. `#2078.29` — un objet importable neuf va-t-il en FIN de liste, ou à sa place dans les dépendances ?

**Ta décision du 17/09**, inscrite dans `registre-2026-09-15-onboarding-audit-welcome.md:921` :
étendre `IMPORT_ORDER` **en fin de liste**.

**Ce que l'écrivain a fait, et pourquoi** : il a placé `document` **par dépendance**,
juste après `need` — parce qu'un document appartient à un besoin, et que l'ordre
d'`IMPORT_ORDER` sert précisément à importer un objet après ce dont il dépend
(on importe un compte avant un contact). Il a mis `reference` en fin, après
`activity`. **Il a signalé l'écart lui-même dans le registre plutôt que de le taire.**

**Ce qu'il a mesuré, et qui change la nature de la question** : aucune garde
automatique n'est en jeu. `IMPORT_ORDER` est absent d'`ENUM_BASELINE` (gelée le
19/08, avant l'existence de ce fichier), donc GA-08 ne le protège pas — insérer
« au milieu » ne casse rien. Et **ni `document` ni `reference` n'écrivent encore**
en base, exactement comme `need`, `talent`, `submission`, `mission` et `activity`
avant eux : seuls `account`, `contact` et `project` écrivent aujourd'hui.

**Les deux lectures se défendent** : « en fin de liste » est une règle de sûreté —
on n'insère pas au milieu d'un ordre dont on ne maîtrise pas tous les effets.
« Par dépendance » est une règle de sens — la liste EST un graphe de dépendances,
la ranger autrement la vide de sa raison d'être.

**Ce qu'on fait en attendant** : le code est livré avec `document` par dépendance,
et l'écart est écrit **dans le registre et dans l'issue** — il ne se perdra pas.
Rien n'est irréversible : aucun des deux objets n'écrit, déplacer une entrée reste
une ligne.

**Ce qu'il te faut trancher.** On garde « par dépendance » et on reformule ta règle
du 17/09 (« en fin de liste, sauf dépendance explicite »), ou on remet les deux
entrées en fin et on note que l'ordre n'est pas un graphe ?

## 18. `#2565.12` — quel outil de facturation reçoit le PREMIER adaptateur vérifié ?

**Où en est le chantier** : toute la porte est construite et testée — les cinq états
fermés (`created`/`sent`/`invoiced`/`failed`/`unknown`), la feuille de temps vérifiée
**avant** et pas après, « facturé » écrit **seulement sur preuve du connecteur**, un
`unknown` qui ne se rejoue jamais tout seul, l'écran de validation, les libellés FR/EN.
Il ne manque **qu'une chose** : l'adaptateur vers un outil réel.

**Pourquoi je ne peux pas le choisir à ta place.** Un contrat d'API non vérifiable ne
se devine pas — c'est une règle du produit, et elle vaut exactement ici : écrire
`account.move` (Odoo) ou son équivalent Qonto/Tiime **sans instance réelle pour le
vérifier**, c'est livrer du code qu'on croit juste. On ne le saura qu'en production,
chez un client, sur une facture.

**Les deux options, et ce qu'elles coûtent** :

- **Odoo** — c'est l'outil **que le client a nommé**. Mais il n'est catalogué chez nous
  que comme CRM : aucune écriture de facture, nulle part. Il faut donc **une instance de
  recette réelle** pour vérifier le contrat avant d'écrire une ligne.
- **Qonto ou Tiime** — déjà catalogués côté **lecture** de factures
  (`list_unpaid_invoices`). Le chemin est plus court, mais ce n'est pas ce que le client
  a demandé.

**Ma recommandation** : Odoo, parce que c'est la demande réelle — **à condition** que tu
puisses fournir un accès à une instance de recette. Si ce n'est pas possible à court
terme, Qonto ou Tiime, et on le dit au client.

**Ce qu'il te faut trancher** : lequel des trois, et si c'est Odoo, **peux-tu donner un
accès de recette** ? Tant que ce n'est pas tranché, `2565.10` reste `retenu` — et c'est
volontaire, pas un oubli.

## 19. `#2556` — deux repères qui n'existent pas, et qu'on refuse d'inventer

Le retour demande qu'un compte **qu'on déclare déjà connaître** n'affiche pas un dossier
générique, mais **au moins un fait neuf, daté et sourcé — ou qu'on dise honnêtement
qu'il n'y en a pas**.

Deux préconditions manquent, et c'est tout le sujet.

**`2556.1` — il n'existe aucun « je connais déjà ce compte ».** Cherché : aucun booléen
de ce genre. Le plus proche est `relationship_memory.relation`
(`packages/contracts/src/schemas/account.ts:165-196`) — un **texte libre** écrit par le
commercial (« ancien client », « référé par X »…), pas un drapeau. Et
`commercial_status` (`inbox`/`watching`/`opportunity`/`customer`/`archived`) répond à
« où en est la vente », pas à « je le connais » : un prospect connu personnellement peut
très bien être en `inbox`.
**Recommandation** : ne **pas** créer un écran de déclaration de plus. Traiter
`relationship_memory.relation` non vide comme le signal — c'est déjà un geste humain, et
un réglage vit à un seul endroit.

**`2556.2` — il n'existe aucun « depuis ta dernière visite » à l'échelle d'un compte.**
L'onglet Veille donne déjà des signaux datés et sourcés, avec leur fraîcheur — mais le
même écran pour un compte connu ou inconnu. Et `since-last-visit.ts`
(`briefing.service.ts:269`) calcule **exactement** ce concept… à l'échelle de l'espace
entier, sans qu'aucune de ses quatre lignes soit filtrable par compte.

**Ce qu'on ne fait pas, et pourquoi le lot s'est arrêté là.** Construire un bloc qui
affiche « quelque chose » sans ces deux repères, ce serait précisément le risque que le
client a nommé : **remplir un compte connu au prix de la confiance**. L'écrivain a
préféré s'arrêter et l'écrire.

**Ce qu'il te faut trancher** : (a) `relationship_memory` non vide vaut « je connais »,
(b) on ouvre un vrai marqueur de compte connu, ou (c) on abandonne la distinction et
l'onglet Veille reste le même pour tous les comptes.

## 20. `#2544.2` et `#2165.38` — Découvrir ne rend pas de PERSONNES, et on refuse d'inventer leur localisation

Deux points, deux registres, **une seule cause** — je les groupe parce que les trancher
séparément produirait deux réponses incohérentes.

- `#2544.2` (retour **client**, `/discover`) : « un contact rattaché à un établissement
  porte la localisation de CET établissement, pas celle du siège ».
- `#2165.38` (`/discover`) : « filtre contacts : Localisation ». Le code porte d'ailleurs
  une trace qui dit le contraire d'une livraison — `discover-contact-rows.ts:125` :
  « La LOCALISATION (#2165.38) n'y est pas ».

**Ce qui a été mesuré le 18/09 sur des appels réels** (réponse Arquus inspectée) : chaque
entrée de `dirigeants` porte `nom` / `prenoms` / `qualite` / `nationalite` /
`type_dirigeant` — **aucun champ d'adresse, d'établissement, ni de SIRET**. Le dirigeant
légal est attaché au SIREN, c'est-à-dire à l'unité légale, **jamais à un établissement
précis**. Le registre public ne permet donc pas de dire « cette personne travaille à
Garchizy ».

Et plus en amont : **Découvrir ne porte aujourd'hui aucun champ « personnes »**.
`/discover/registry` rend une liste d'ENTREPRISES. `DiscoverCandidate` n'a pas de
`people[]`, ni côté contrat ni côté web.

**Ce qu'on ne fait pas, et pourquoi le lot s'est arrêté là.** Afficher la localisation du
siège à côté d'un nom de personne, c'est exactement la donnée inventée que la doctrine
interdit — et c'est indétectable à l'écran : ça *ressemble* à une information juste.
L'écrivain a préféré laisser le point `retenu` avec sa mesure plutôt que deviner.

**Ce qu'il te faut trancher** — trois routes, de la moins chère à la plus chère :

- **(a) On assume que Découvrir liste des entreprises, pas des personnes.** Les deux
  points passent à `écarté` avec cette raison, et le filtre Localisation reste un filtre
  d'entreprise. Zéro ligne de code. C'est la réponse la plus honnête si les personnes
  arrivent de toute façon par la fiche compte.
- **(b) On ouvre un contrat `DiscoverCandidate.people[]`** — touche `packages/contracts`
  + `apps/web` + `apps/ia`. Ça ne règle toujours PAS la localisation : il faudrait alors
  faire porter à chaque personne l'établissement **résolu** (`_matching_establishment`),
  jamais le siège, et nommer l'absence quand il n'est pas résolu.
- **(c) On branche une source d'enrichissement contact** côté `apps/api` (module
  contacts), capable de rattacher une personne à un site. C'est un connecteur de plus,
  avec son coût, sa latence et sa question de conformité.

**Ma recommandation : (a)**, et rouvrir seulement si un client demande explicitement à
filtrer des PERSONNES par ville dans Découvrir. Les deux autres routes coûtent un contrat
ou un fournisseur pour une donnée dont personne n'a encore prouvé qu'elle manquait.

## 21. `#2031.5` à `.8` — préremplir depuis le CRM suppose une table de correspondance que personne n'a validée

Le lot BS a livré `#2031.3` : quand quelqu'un est **invité** dans un espace, son rôle
d'invitation préremplit ses fonctions pratiquées — mais **champ par champ, et seulement
là où le nom du rôle EST la fonction** (`sales` → « Vente / prospection »,
`recruiter` → « Recrutement / sourcing »). Les **sept autres rôles rendent une liste
vide**, aucune fabrication. C'est la source la moins chère : zéro endpoint neuf, elle
réutilise `GET /workspaces/me`, déjà lu par tout membre.

Les quatre autres sources demandées — **CRM, agenda, messagerie, import** — sont restées
`retenu`, mesurées et non codées, pour une raison qui demande ton arbitrage :

1. **Deux chemins de préremplissage qui ne sont PAS interchangeables** : le chemin
   COMPAGNIE (`/esn-profile/prefill`) et le chemin PERSONNEL
   (`ProfileQuestionContext`). Ce qu'on lit dans un CRM d'entreprise ne répond pas à une
   question posée à une personne.
2. **Aucun champ directement LISIBLE.** Exemple mesuré : le vocabulaire d'industrie d'un
   CRM est **propre à chaque fournisseur**, alors que notre catalogue de secteurs est
   **fermé**. Les rapprocher exige une table de correspondance — c'est-à-dire décider que
   « Manufacturing » chez l'un vaut tel secteur chez nous. **Deviner cette table, c'est
   exactement la donnée inventée que la doctrine interdit**, et c'est indétectable à
   l'écran : un secteur faux ressemble à un secteur juste.

**Effet de bord à connaître** : `#2045.5` est **bloqué** par `#2031.5`.

**Ce qu'il te faut trancher** :

- **(a)** On s'arrête à l'invitation (livré) et les quatre autres sources passent à
  `écarté` avec cette raison. Le questionnaire reste court, personne ne voit de secteur
  faux.
- **(b)** On écrit une table de correspondance par fournisseur — et alors **qui la
  valide, et à quelle fréquence ?** Un catalogue fermé face à des vocabulaires qui
  bougent, ça se maintient.
- **(c)** On prérempli en **proposant** plutôt qu'en remplissant : le champ reste vide,
  mais on montre ce que le CRM dit, en toutes lettres et sans traduction, et la personne
  choisit. Plus lent à remplir, jamais faux.

**Ma recommandation : (c) pour le CRM**, qui respecte « on PROPOSE, on n'écrit jamais
tout seul », et **(a) pour agenda / messagerie / import** tant qu'aucun client ne l'a
demandé.

**Défaut de la même famille, trouvé en chemin, NON corrigé** (hors périmètre #2031,
écran différent) : `apps/web/src/features/onboarding/.../WelcomeScreen.tsx` calcule
`hasConnectedTool = Boolean(crmTool || mailboxTool || agendaTool)` et **masque tout le
bandeau « connecte un outil » sur ce booléen à trois connecteurs** — connecter un agenda
fait donc disparaître l'invitation à connecter un CRM. Même défaut que `#2031.10`, déjà
corrigé ailleurs. À reprendre dans un lot quand l'écran d'accueil sera libre.

## 22. `#2288.2/.3/.4` — le marché inversé ne peut pas dire « sans signal actuel », faute de source datée par entreprise

Le lot BT a livré ce qui était livrable de **#2288** et s'est arrêté honnêtement sur trois
points. La mesure a été faite **deux fois** — par l'écrivain, puis par un vérificateur
indépendant sur un SHA plus récent — et les deux concordent.

**Ce qui est livré** : la colonne « signal actuel » rend un signal **daté** avec la
**nature** de sa source, ou **nomme son absence** (« Aucun signal actuel »), jamais un
zéro. Et les quatre seaux d'environnements compatibles sont rendus, dont `verified` qui
vaut **toujours** `null` et se lit « Vérifiés : non mesuré », jamais 0.

**Ce qui bloque** : l'unique appelant passe `signal={null}`, parce qu'**aucune source
datée PAR ENTREPRISE n'existe** dans le produit.

- La mémoire de marché **retire les dates par doctrine**.
- Une source datée existe bien (`recruiters`), mais elle désigne des **ESN concurrentes** —
  une population différente. Les rapprocher par le **nom** reproduirait exactement le
  défaut connu du dépôt (un lot a déjà balayé `2566.4` sur `assessInvoiceReadiness`,
  présent dans 20 fichiers, parce qu'il cherchait un libellé et non un numéro).
- Le chemin **présélection → vérification → filtrage** n'existe nulle part : `verifyToday`
  est absent, et `git grep "sans signal actuel"` rend **0 résultat** hors registre.

**Ce qu'on ne fait pas, et pourquoi le lot s'est arrêté là.** Afficher un signal en
rapprochant deux populations par leur nom, c'est fabriquer une donnée qui *ressemble* à
une information juste. L'écrivain a préféré laisser les trois points `retenu` avec leur
preuve.

**Ce qu'il te faut trancher** :

- **(a)** On assume : le marché inversé **ne montre pas de signal par entreprise**, la
  colonne dit « aucun signal actuel » et c'est vrai. Zéro ligne de code, zéro risque.
- **(b)** On ouvre une **source datée par entreprise** — c'est un connecteur de plus, avec
  son coût, sa latence et sa conformité.
- **(c)** On lève la doctrine qui retire les dates de la mémoire de marché. ⚠️ Cette
  doctrine existe pour une raison : une date rend ré-identifiable ce qui devait rester
  agrégé. **Je ne recommande pas de la toucher sans revoir pourquoi elle a été posée.**

**Ma recommandation : (a)**, et rouvrir seulement si un client demande explicitement à
voir un signal daté par entreprise dans le marché inversé.

**Point voisin, même issue, même réponse** : « la capacité commerciale adapte le volume
proposé » et « les réserves ne deviennent pas des actions » (`#2291.9`, `#2291.10`) ont
**0 occurrence** dans le module Découvrir. Ce ne sont pas des défauts : ce sont des
fonctionnalités qui n'ont jamais été construites. Elles demandent d'abord une définition
produit — que veut dire « capacité commerciale » en chiffres, et qui la renseigne.

## 23. `#2259.5` et `#2259.37` — deux notions que la demande suppose et que le modèle de données ne porte pas

Deux points de LAU-004 mesurés **non modélisés**. Ils ne sont ni des bugs ni des oublis :
ce sont des concepts que le produit n'a jamais eus, et les inventer coûterait un schéma.

**`#2259.5` — « ne pas confondre le dirigeant de l'ESN ».** Le schéma ne porte que le rôle
**RBAC** : `owner` · `admin` · `sales_ops` · `sales` · `tech_admin` · `member` · `viewer`.
Il n'existe **aucun champ « dirigeant »**. Le produit fait déjà ce qu'il faut : quand
quelqu'un est `owner`, c'est exposé **pour ce que c'est** (`#2259.4`), et le bloc
d'identité le dit noir sur blanc — *cela ne dit pas qu'elle dirige l'entreprise*.

Donc la question n'est pas « corrige la confusion » (il n'y en a pas), c'est : **veut-on
que le produit sache qui dirige l'ESN ?**

- **(a)** Non. `owner` reste un rôle d'outil, jamais un titre. Zéro ligne de code, et la
  formulation actuelle reste juste. **C'est ma recommandation.**
- **(b)** Oui, on ajoute un champ déclaratif — et alors : qui le renseigne, qui le vérifie,
  et que se passe-t-il quand il est faux ? Un titre non vérifié affiché comme un fait est
  précisément ce que la doctrine refuse.

**`#2259.37` — « le profil groupe complète sans écraser la réalité locale ».** La demande
suppose une **ESN mère** au-dessus de plusieurs espaces. Le modèle dit l'inverse :
`workspace` **est** l'unité la plus large, et `business_unit` vit **sous** le workspace,
jamais au-dessus. Il n'y a pas de place pour un « groupe ».

Et ce n'est pas un hasard : **le coût d'accès ne s'agrège JAMAIS entre espaces** (GA-43),
parce que deux espaces peuvent être concurrents. Un « profil groupe » qui descendrait dans
plusieurs espaces est exactement la chose que cette garde interdit.

- **(a)** On assume : pas de niveau au-dessus de l'espace. Une ESN à plusieurs entités
  ouvre plusieurs espaces, et ils ne se parlent pas. **Ma recommandation.**
- **(b)** On modélise un groupe — et il faut alors rouvrir GA-43 et dire **précisément**
  ce qui remonte et ce qui ne remonte pas. Ce n'est pas un lot, c'est un chantier.

**Le fil commun des questions 20, 22 et 23** : à chaque fois, un retour demande une
capacité qui suppose une donnée ou une structure que le produit n'a pas. La réponse honnête
est presque toujours **(a)** — nommer ce qu'on ne sait pas, plutôt que construire un
contrat pour une demande qui n'a pas encore de client derrière elle.

## 24. La salle de démo ne peut **structurellement** pas montrer un contact « première porte »

Trouvé en livrant `#2295.4` — *un contact non vérifié ne peut jamais être « première porte »*.
La règle est juste et elle est maintenant tenue par le code : `classifyGroup()` refuse
`first_door` dès que `email_verified !== true`.

**La conséquence n'avait pas été vue** : dans la salle de démo, `email_verified` vaut
**toujours `false`** — par une doctrine antérieure, les contacts de démo portent des
adresses en `.example`, qui ne peuvent évidemment pas être vérifiées. Donc **aucun contact
de démo ne sera jamais « première porte »**, et le groupe le plus important des six restera
vide devant un prospect.

Deux règles justes se contredisent :

- **« Toute fonctionnalité user-facing est AUSSI remplie en démo »** (craft rule n°9) — un
  écran livré mais vide en démo se découvre en réunion, pas en CI.
- **« Jamais de donnée fictive »** + une adresse de démo ne doit jamais ressembler à une
  vraie adresse.

**Ce qu'il te faut trancher** :

- **(a)** On accepte, et on l'écrit : `first_door` est classé **vide à dessein** dans
  `demo-coverage.ts`, avec exactement cette raison. Honnête, zéro ligne de code — mais la
  démonstration ne montre jamais le groupe qui compte le plus.
- **(b)** On sépare deux notions : « cette adresse a été **vérifiée**  » (un fait technique)
  et « cette adresse est **utilisable en démonstration** ». Un contact de démo pourrait
  alors être `first_door` **sans** qu'aucune adresse réelle soit inventée. C'est un champ de
  plus, et une garde pour qu'il ne franchisse jamais la frontière de la démo.
- **(c)** On seede un contact de démo avec une adresse d'un domaine que **nous** possédons
  et qui est réellement vérifiable. ⚠️ Je ne le recommande pas : une adresse qui marche
  dans une salle de démo publique finit par recevoir du courrier.

**Ma recommandation : (b)**, parce que c'est la seule qui tient les deux règles à la fois —
mais elle coûte un champ, une garde, et un semis. **(a)** est acceptable si tu préfères ne
rien ajouter avant d'avoir vu le groupe utilisé pour de vrai.

⚠️ À ne pas confondre avec une question de confort : tant que ce n'est pas tranché, le lien
de démonstration montre une priorisation de contacts **dont le premier groupe est toujours
vide** — ce qui se lit comme un produit qui ne trouve personne.

## 25. Deux blocages distincts découverts en recette, et qui ne se lèvent que par toi

### (a) On ne peut PAS recetter l'onboarding depuis un compte déjà provisionné

Mesuré le 18/09 en production (`d6c8f4074`) : `/onboarding` **redirige vers `/chat`** dès
que le compte est onboardé, et les Préférences confirment « Tes réponses au questionnaire
ne sont pas redemandées ». Le recetteur n'avait donc **aucun moyen** d'atteindre la carte
d'accueil ni le questionnaire d'origine — et créer un compte est hors de son périmètre
(il est en lecture seule, et je ne lui fais jamais saisir d'identifiants).

**Conséquence directe** : `#2577` (« une seule durée annoncée aux deux écrans »),
`#2053` (« délai d'encaissement ») et `#2579` (« Reprendre plus tard » et « Quitter »
rebouclent — un retour **client**) sont **livrés mais non recettables**, et resteront
ouverts tant que ce blocage tient. **Ce sont aussi les seuls points qui bloquent la
fermeture de ces trois issues.** `#2579` est à UN point de se fermer : son correctif
est en production depuis la vague I, personne ne peut le VOIR. Et ça vaudra pour tous les futurs points d'onboarding —
il y en a plusieurs dizaines au registre.

**Ce qu'il te faut trancher** :
- **(a1)** Tu me donnes un **compte de recette jetable, non onboardé** (ou le moyen d'en
  créer un). C'est le déblocage le plus direct, et il resservira à chaque vague.
- **(a2)** Le produit gagne un moyen **légitime** de rejouer son propre onboarding depuis
  les réglages — ce qui n'est pas qu'un confort de test : c'est exactement ce que `#2572`
  vient de corriger côté « Reprendre la reconfiguration ». Si ce chemin existe pour de
  vrai, la recette passe par lui.
- **(a3)** On assume que l'onboarding ne se recette jamais à l'écran, et ses points se
  ferment sur le code et les tests. ⚠️ **Je ne le recommande pas** : c'est exactement ce
  qui m'a fait fermer `#2261` à tort cette nuit.

**Ma recommandation : (a2)**, et **(a1)** en attendant, parce que c'est immédiat.

### (b) Le questionnaire n'a AUCUNE question numérique — faut-il en créer une ?

`#2088.12` (« nombres : champ numérique avec unité visible ») et `#2088.13` (« PÉRIODE
obligatoire quand elle change le sens ») supposent un type de question `number`. Mesuré :
**il n'en existe aucun** dans le corpus. Le seul champ « numérique » du questionnaire,
la taille d'équipe, est un **choix de TRANCHES délibéré**.

Et il y a une contrainte structurelle : **chaque question correspond 1:1 à une colonne**
de `esn_profiles`. Ajouter un type `number` sans question réelle derrière, ce serait du
**code mort** — l'écrivain a refusé de le faire, et il a eu raison. Même raison pour
`#2088.10` (priorisation P1 / P2 / Exploratoire / No-go) : aucune colonne ne l'adosse.

**Ce qu'il te faut trancher** : y a-t-il une question du questionnaire qui **doit**
devenir un nombre plutôt qu'une tranche ? Si oui, laquelle, et avec quelle unité.

- **(b1)** Non, les tranches suffisent partout. Les trois points passent à `écarté` avec
  cette raison. **Ma recommandation** — une tranche est plus honnête qu'un chiffre
  faussement précis, et c'est la doctrine « ne pas forcer une fausse précision » (#2027).
- **(b2)** Oui, sur telle question précise — et alors le type `number`, sa colonne, son
  unité et sa période arrivent ensemble, en un seul lot.

---

## 26. `#2588` — le geste qui déclenche le bug n'est reproductible par AUCUN outil dont je dispose

**Ce qui est mesuré.** L'issue dit « un simple SCROLL redirige vers /chat » sur
`/missions` et `/consultants`. Deux registres portent le numéro `2588.1` avec
**deux demandes différentes**, et c'est en réalité le même bug vu des deux côtés :

- **Côté code** (registre BH) : balayage statique complet de `apps/web/src` — les
  107 fichiers contenant `navigate(`, tous les `useEffect` qui en contiennent un,
  tous les `onWheel`/`onScroll`/`onFocus`/`onMouseEnter`/`IntersectionObserver`,
  tous les `history.back/go`. **Aucun ne navigue sans clic.** Puis recette écran en
  direct : `pushState`/`replaceState`/`popstate` instrumentés, molette simulée via
  CDP (verticale pure, puis avec composante horizontale) sur les deux routes —
  **aucune navigation, aucune entrée au journal, aucune erreur console.**
- **Côté cause probable** (registre BL) : ce n'est pas l'application qui navigue,
  c'est **le navigateur** — un balayage horizontal à deux doigts sur un tableau
  plus large que l'écran déclenche le retour arrière natif. Le correctif posé est
  `overscroll-behavior-x: contain` sur le conteneur du tableau.

**Où ça coince.** La recette du 18/09 confirme que la propriété CSS est bien posée
sur le bon conteneur de `/missions`. Mais elle **n'a pas pu reproduire le
débordement lui-même** : `scrollWidth === clientWidth === 1123` à `innerWidth`
1440, et la demande de redimensionner la fenêtre à 900 px n'a rien changé — la
fenêtre était déjà au maximum de l'écran physique. Et le registre BH mesure
`overscroll-behavior-x: auto` sur `html` **et** `body` : le correctif de BL couvre
le conteneur du tableau, pas la page.

**Donc** : le seul geste qui prouverait ou infirmerait le correctif est un balayage
physique à deux doigts sur un trackpad, sur une fenêtre assez étroite pour que le
tableau déborde. Ni CDP, ni le navigateur piloté, ni moi ne produisons ce geste.
C'est exactement le cas nommé au §0 bis du skill : *une preuve qui exige une
fenêtre ou un appareil que l'outil ne produit pas.*

**L'issue reste OUVERTE** — la fermer sur la présence d'une propriété CSS serait
refaire l'erreur de `#2261` (45 points fermés au code, trois absents de l'écran).

**Ce que je demande** — une seule manipulation, dix secondes :
- **(a)** Ouvrir `/missions` sur ton Mac, rétrécir la fenêtre jusqu'à ce que le
  tableau déborde, balayer deux doigts vers la droite. **Ça revient en arrière,
  oui ou non ?** Si non, le point est recetté et l'issue se ferme.
- **(b)** Si ça revient encore en arrière : le correctif doit monter sur `html` /
  `body` et pas seulement sur le conteneur — c'est un lot de 20 minutes.
- **(c)** Tu ne reproduis plus le bug du tout → on ferme en disant que le
  déclencheur n'a pas pu être re-identifié, plutôt que de laisser l'issue traîner.

---

## 27. `#2127.36` — une QCM que tu as tranchée le 15/09 repose sur une prémisse fausse

**Ce qui est mesuré.** Le 15/09 tu as tranché une QCM intitulée « Comparer si déjà
dans le portefeuille » — un CTA proposant de comparer un compte similaire lorsqu'il
est déjà dans le portefeuille de l'utilisateur.

Le lot CE a mesuré que **cet état ne peut pas exister** sous le code actuel : les
deux chemins qui produisent des suggestions similaires excluent déjà, à la source,
tout compte présent dans le portefeuille — `listSimilarToAccount`
(`accounts.service.ts:2298-2323`, posé par `#1632`) et `listSimilarCompaniesToExplore`
(`:2009-2015`, posé par `#1576`). Ces deux exclusions ont été **corrigées deux fois
en production le 08/09**, précisément parce que des suggestions déjà détenues
remontaient.

**Donc** : construire ce CTA livrerait un bouton qui ne s'affiche **jamais** — du
code juste, testé, que personne ne voit. C'est le motif n°1 du dépôt.

**Le lot a REFUSÉ le point et l'a documenté plutôt que de le construire.** Je ne
l'écarte pas moi-même : défaire une décision que tu as prise n'est pas un arbitrage
d'agent.

**Ce que je demande :**
- **(a)** Tu confirmes le refus — le point passe `écarté` en citant cette mesure, et
  on ne le repropose plus. *(ma recommandation)*
- **(b)** Ton intention était l'inverse : **arrêter d'exclure** les comptes du
  portefeuille des suggestions, pour pouvoir justement les comparer. C'est alors un
  changement de comportement des deux services, pas un CTA — et il faut dire ce qui
  se passe pour `#1632` et `#1576`, qui ont demandé ces exclusions.
- **(c)** Le CTA visait un autre écran que celui-là — lequel ?

---

## 28. `#2118.51` — un verdict passe-partout, dont la cause est un compte analysé AVANT la refonte

**Ce qui est mesuré** (recette écran du 18/09, production `7e769e0ca`, 4 comptes ouverts) :

| Compte | Verdict | Cite un élément propre ? |
| --- | --- | --- |
| SAFRAN | « Safran se travaille par une BU opérationnelle et la DSI, pas par une approche groupe générique. » | ✅ BU / DSI, contact nommé, chiffres |
| DASSAULT SYSTEMES | « Compte à travailler par OUTSCALE et les managers opérationnels… » | ✅ OUTSCALE, filiale propre au compte |
| ATOS FRANCE | « ATOS FRANCE se travaille en entrée middle-out sur un périmètre borné… » | ✅ nom, date CRM du 31/08/2026 |
| **THALES** | « Thales se travaille prudemment par entité, en réactivant d'abord le réseau CRM et en ciblant une mission courte. » | ❌ **aucun** — ni nom, ni chiffre, ni signal daté |

**3 sur 4 passent.** La phrase de THALES est réutilisable telle quelle sur n'importe quel compte « PRUDENT » : « réactiver le réseau CRM » + « mission courte » est un motif, pas une analyse.

**La cause n'est pas le gabarit.** THALES porte le bandeau « Cette analyse est antérieure à la lecture en sept axes : sa note s'affiche, sa décomposition n'existe pas ». Il n'y a donc aucune section « Pourquoi pour ton ESN » ni « Freins » pour étayer le verdict — le modèle écrit avec ce qu'il a, et il n'a rien de propre au compte. Les trois autres, analysés après la refonte, citent des contacts nommés, des dates CRM et des chiffres.

**Où ça coince, et pourquoi je ne tranche pas seul.** Ta doctrine du 18/09 dit qu'un correctif de collecte rattrape l'existant, **ciblé** et **par segment**. Le mécanisme est livré (lot AF, `#2543`) — mais deux choses l'arrêtent ici :

1. **Les quatre dimensions rejouables sont `signals` / `contacts` / `entities` / `strategy`.** La « lecture en sept axes » n'en est pas une : ce n'est pas une re-collecte, c'est une **ré-analyse** de données déjà là. Il faudrait donc un cinquième segment, ou décider que ça relève de `strategy`.
2. **Le registre du lot AF dit noir sur blanc que le rejeu réel est un GESTE D'OPÉRATEUR** : *« il ne s'exécute jamais depuis un agent d'écriture… le déclenchement effectif reste une décision de Louis »*. Je ne le lance donc pas, même si le mécanisme est prêt.

**Ce que je demande :**
- **(a)** Tu déclenches toi-même le rattrapage sur les comptes antérieurs à la refonte, et je livre d'abord ce qui manque pour les CIBLER (une date de lecture en sept axes, comme `contacts_collected_at`). *(ma recommandation — c'est le plus petit pas qui rend le reste possible)*
- **(b)** La lecture en sept axes devient un cinquième segment à part entière, avec sa porte `POST internal/admin/segment-catchup/...` et son coupe-circuit, sur le modèle exact de `contacts`.
- **(c)** On ne rejoue rien : le bandeau suffit, un compte ancien dit honnêtement que sa décomposition n'existe pas, et le verdict passe-partout est le prix assumé. Alors `#2118.51` se ferme en `reformulé` plutôt qu'en `retenu`.

⚠️ Dans tous les cas, la règle tient : **un rattrapage n'écrase jamais une correction humaine**, et il ne part jamais tout seul au déploiement.

---

## 29. `/discover` — une recherche d'ENTREPRISES ne rapporte aucun signal, par conception

**Ce qui est mesuré.** `apps/ia/app/routers/discover.py` pose `signals: list[dict] = []` pour toute ligne issue d'une recherche de registre, avec ce commentaire en clair : *« Les signaux datés sont produits par `/discover/signals` »*. Les deux chemins sont séparés :

| Chemin | Ce qu'il rend | Ce que la carte affiche comme source |
| --- | --- | --- |
| `/discover/registry` — « ESN à Toulouse » | des entreprises, **zéro signal** | « la source de données d'entreprises » (générique) |
| `/discover/signals` | des signaux datés et typés | la NATURE : registre officiel, offre d'emploi, appel d'offres… |

**Pourquoi le libellé générique est correct et non un bug.** La source d'une ligne de registre est notre fournisseur de données d'entreprises. La doctrine GA-44 interdit de le nommer — *nos fournisseurs ne se nomment jamais*. Il n'y a donc aucune nature honnête à afficher : « la source de données d'entreprises » est le seul libellé possible. J'ai fermé `#2546` sur cette base, en `reformulé`.

**Mais la question de fond reste, et elle est produit.** Le retour d'origine disait « les signaux ne sont pas mis en avant ». Or quelqu'un qui cherche « ESN à Toulouse » obtient 24 entreprises **et aucun signal** — alors que c'est précisément le moment où un commercial voudrait savoir laquelle recrute, laquelle a gagné un marché, laquelle bouge.

**Ce que je demande :**
- **(a)** Une recherche d'entreprises va chercher les signaux des lignes qu'elle rend (au moins des premières). Coût : un appel de plus par recherche, et un délai plus long — à chiffrer avant de s'engager. *(ma recommandation, c'est ce que le retour demandait vraiment)*
- **(b)** Les deux chemins restent séparés, mais l'écran le DIT — « cette recherche liste des entreprises ; pour voir ce qu'elles font, cherche par signal » — avec le geste pour basculer.
- **(c)** C'est voulu tel quel, et le retour se ferme en `écarté` avec cette raison citée.
