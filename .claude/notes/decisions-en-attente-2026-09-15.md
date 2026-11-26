# Les décisions en attente — note groupée par SUJET (15/09/2026)

Louis a choisi le 15/09 de les recevoir **groupées par sujet à la fin**, pas au fil de
l'eau. Ce fichier s'écrit au fur et à mesure et se lit d'un coup.

**Règle de lecture** : un point n'est ici que si la décision est PRODUIT ou si elle touche
un arrêt du dépôt. Tout ce qui se tranche par une règle déjà écrite a été tranché et
documenté dans son registre, pas ici.

---

## A. Facturation — l'arrêt qui n'a pas été levé

Le §10 du profil du dépôt fait de la facturation, des abonnements et de la tarification un
arrêt : on n'y code pas seul. Les points suivants ont été **sortis de leur lot** et
attendent un arbitrage.

| Point | La question | Ce que je recommande |
| --- | --- | --- |
| **#2003.22 / #2003.23** | ce qui se passe au moment de l'achat sur `/onboarding/plan` | rien tant que tu n'as pas dit ce que tu veux vendre depuis cet écran |
| **#2084.40 à .45** | les états d'erreur du parcours qui touchent un débit | même chose |
| 5 points de **#2008/#2009** | la génération d'un audit consomme-t-elle un crédit, et lequel | même chose |
| **`pricePerMonth`** | l'écran concatène une devise en dur (`{{price}} € /mois`) alors que l'entrée du catalogue porte `currency` et `priceCents` | à corriger, mais c'est du formatage de montant : je ne l'ai pas touché |
| **Le plafond de messages de Laura** | il n'est pas affiché sur l'écran des offres, et c'est **volontaire** : le plafond effectif est le MINIMUM entre `CHAT_DAILY_MESSAGE_LIMIT` (serveur, non exposé avant achat) et `SHIPPED_PLAN_GRID.chatDailyMessageLimit` | annoncer la moitié lisible serait une promesse qu'on ne tient pas forcément. Laisser tel quel. |

## B. Rôles et cloisonnement

| Point | La question | Ce que je recommande |
| --- | --- | --- |
| **#2077.9** | le jalon « premier collègue invité » : `POST /workspaces/invitations` est **owner/admin seulement** et plafonné par les sièges du plan. Un `member`, ou un plan au plafond, aurait un jalon **définitivement non coché** — et le contrat n'a que des booléens, aucun « sans objet ». | ajouter un troisième état « sans objet » au contrat plutôt qu'un booléen qui ment. C'est un changement de contrat : d'où la question. |
| **#1911.15** | les droits d'un rôle sur les fils de Laura | — |
| **#1910.2** | « Tout mon espace » : Laura lirait-elle les comptes des AUTRES membres ? | non par défaut. Le cloisonnement est la promesse la plus chère à défaire. |
| **#1911.11** | la recherche dans le CONTENU des messages | elle suppose de décider qui peut chercher dans quoi — donc B, pas une feature d'écran |

## C. Ce qu'on mesure et ce qu'on promet

| Point | La question | Ce que je recommande |
| --- | --- | --- |
| **#2077.3** | « Profil validé » : `profile_completed` mesure la **complétion**, la validation (D9) est un AUTRE fait. Le jalon coche lequel ? | la validation. Un profil rempli n'est pas un profil validé, et le jalon promet le second. |
| **#2022.4** | détecter une réponse **obsolète** ou **contradictoire** demanderait une **date par réponse**, que ni `esn_profiles` ni `OnboardingStateResponse` ne portent. Seules les réponses ABSENTES sont mesurables aujourd'hui. | ne redemander que l'absent. Deviner l'obsolète reposerait des questions au hasard. |
| **#2151.5** | le type de résultat de Découvrir : son enum appartient au lot B ; en déclarer un second violerait « un réglage à un seul endroit » | attendre le lot B. |
| **#2151.46** | le préréglage « Écosystème ESN » est-il **semé** ou **composé** par l'utilisateur ? `demo-coverage` dit aujourd'hui qu'une vue se compose. | composé. Un objectif semé attribuerait au visiteur une intention qu'il n'a pas formulée. |

## D. Ce qui existe mais que personne ne déclenche

| Point | Le fait mesuré | Ce que je recommande |
| --- | --- | --- |
| **`refresh_required`** | le statut est dans l'enum ET dans la contrainte SQL (`1793583494449-OnboardingStatusStates`), mais **aucun code ne l'ÉCRIT** (commentaire `onboarding.ts:55-57`). L'écran de reconfiguration est donc inerte. | décider QUI le pose : une durée écoulée, un changement d'offre, un geste d'utilisateur. Sans ça, c'est du code que personne n'appelle. |
| **canal `sms` / `email` des alertes Découvrir** | bornés au contrat, **aucun émetteur branché** ; l'écran ne propose que `in_app`, et la cadence `daily`/`weekly` n'est exécutée par personne (lot E). | ne pas proposer à l'écran un canal que rien n'envoie. |

## E. Les gestes qui coûtent quelque chose

| Point | Le fait | Ce que je recommande |
| --- | --- | --- |
| **#2002.4** | le bouton « voir la démonstration » de l'écran des offres ouvre la démo publique, donc **consomme un bail du pool** (`DEMO_POOL_SIZE` = 8) à chaque clic d'un prospect en inscription. | l'accepter : 8 baux de 30 min tournent vite, et un prospect qui regarde la démo vaut plus qu'un bail. Si tu ne veux pas, le geste doit devenir une demande — mais aucune capacité « demander une démo » n'existe in-app, et un formulaire serait un envoi sortant, donc un arrêt. |
| **les lignes `weekly_digest = true` déjà en base** | la migration est additive et ne réécrit rien : les comptes existants portent toujours `true` sans que personne l'ait choisi. | un balayage, avec **simulation et compte affiché avant d'écrire** — même forme que le balayage de régénération des contextes. C'est une écriture de masse, donc un arrêt. |

## F. La dette juridique — trois pièces, aucune ne se code

Décision de Louis du 15/09 : **« fais-le et allume-le, j'assume les risques »**. Le code
part, l'interrupteur se pose en production. Ce qui reste dû, et qui ne se code pas :

1. la **base juridique** du traitement (intérêt légitime, et son test de mise en balance) ;
2. l'entrée au **registre des traitements** ;
3. le **paragraphe de la politique de confidentialité**.

Et une quatrième, apparue le 15/09 avec le lot des notifications : la **base légale du
consentement aux notifications** n'est pas tranchée non plus (notée en docblock par
l'écrivain).

⚠️ Les cinq règles de `c64` restent dans le code : plancher de **5 sessions distinctes** à
la LECTURE, aucun contenu, aucun enregistrement de session, hash de **session** tourné à
24 h, rien de comportemental par espace client NOMMÉ. Elles disent ce que la mesure EST ;
la décision de Louis lève l'attente de la relecture, pas la doctrine.

---

## G. ⚠️ À RELIRE AVANT MERGE — les sept règles d'accès de la couche BU

Louis a levé l'arrêt du dépôt sur le cloisonnement le 15/09/2026, à **une condition** :
chaque règle d'accès est un test NOMMÉ qui sait dire NON, et **la PR ne se merge pas sans
qu'il l'ait lue**. Voici ce qu'il y a à lire.

Branche `feature/w13-couche-bu-agence`, **deux commits dans l'ordre que GA-11/GA-12
impose** : `19351abc4` = la migration SEULE, `7dcabd9d1` = tout le code. Trois tables,
deux colonnes nullables, **aucune suppression, aucun rétrécissement**.

| # | La règle | La cassure qui l'a prouvée |
| --- | --- | --- |
| 1 | un membre cloisonné ne voit pas une AUTRE BU du même espace | appel retiré → **4 rouges** |
| 2 | **la borne `workspace_id` SURVIT au filtre BU** (`andWhere`, jamais `where`) | `where` → **2 rouges** |
| 3 | les appartenances se lisent sur (espace, utilisateur), jamais utilisateur seul | `user_id` seul → **2 rouges** |
| 4 | le niveau « workspace » — défaut de toute ligne existante — voit tout | → **1 rouge** |
| 5 | une donnée sans BU reste visible de qui la voyait | sans `IS NULL` → **3 rouges** |
| 6 | **une liste de périmètres VIDE cloisonne, elle n'ouvre pas** | `return null` → **5 rouges** |
| 7 | un identifiant manquant LÈVE ; service absent ⇒ **503**, jamais espace ouvert | — |

Plus quatre témoins que les gardes **lisent** vraiment : le module existe, l'appelant est
réel (≥ 3 appels), **aucune route ne prend un `workspaceId` du client**, et tout `where:`
du service porte `workspace_id`.

La n°2 et la n°6 sont celles qui comptent le plus. La n°2 parce que le risque numéro un
d'un lot comme celui-ci est qu'une jointure ajoutée **remplace** la borne d'espace au lieu
de s'y ajouter — et alors le cloisonnement entre ESN concurrentes tombe. La n°6 parce
qu'une liste vide est le cas qu'on écrit en dernier et qu'on écrit à l'envers : « pas de
périmètre » doit vouloir dire « rien », jamais « tout ».

**Ce qui reste à faire** : tout le WEB (#2087.1-.9/.12/.13 — échelle, sept cartes, arbre,
écran des périmètres), i18n FR+EN, changelog. L'API et le contrat sont prêts pour eux.
Et `withSimilarityHeadlines` (`accounts.controller` ~890) reste non cloisonné : il ne fait
que ré-associer un nom déjà émis — à confirmer ou à corriger.

**Rien n'a été sorti au titre de l'arrêt facturation** : aucun point de W13 ne touche un
prix, un crédit ni une consommation.
