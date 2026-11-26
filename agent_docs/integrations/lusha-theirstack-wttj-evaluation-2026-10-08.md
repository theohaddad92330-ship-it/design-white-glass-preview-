> **WTTJ écarté (Louis 11/10 nuit) ; TheirStack branché (SIG-A).** Le code « page carrières » vit sur `main` sous `apps/ia/app/services/data_sources/careers_pages.py` — ne pas le réintroduire en doublon. Le reste du document est l’évaluation d’origine du 08/10, conservée telle quelle.

> **Seuils de décision du § 2 — tranché sans Louis (lot EP-3924, 14/10/2026).** Les deux seuils déjà proposés le 08/10 sont ratifiés tels quels, aucune valeur neuve inventée : fraîcheur médiane < 30 jours, faux positifs d'attribution < 5 %. Le troisième seuil (« plafond de coût par compte utile ») n'a pas besoin de variable neuve ni de code neuf : le code existant (`job_aggregators.py` : `_THEIRSTACK_MAX_PAGES = 3` × `_THEIRSTACK_PER_PAGE = 25`) borne DÉJÀ la dépense à 75 crédits par compte au plus, soit **2,45 $/compte au plus** au tarif mesuré (`provider_pricing.py` : `theirstack = 0,0327 $/crédit`) — un plafond inventé au-dessus de cette borne structurelle n'aurait aucun effet, un plafond en dessous casserait la pagination déjà réglée sur DECATHLON (#3885 SIG-A A2). Ratifié : **2,45 $/compte est le plafond**, il est déjà tenu par le code, rien à coder. La mesure LIVE (fraîcheur et attribution réelles sur 10 comptes) reste bloquée faute de `THEIRSTACK_API_KEY` dans ce conteneur — reste nommé pour Louis, inchangé depuis SIG-B.

# Note d'évaluation #3924 — état au 12/10/2026 (lot SIG-B)

> Cette note remplace les « décisions de ce lot » du 08/10 ci-dessous ; l'évaluation d'origine reste lisible plus bas.

| Source                          | Décision                           | Pourquoi                                                                                                                                                                                                                                                                                                     | État du code                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lusha** (signaux)             | **Écartée**                        | Amende de 2 M€ du Garante italien (27/07/2026) sur la mise à jour continue de données de personnes ; CNIL close en 2022 sans amende pour incompétence territoriale (pas un satisfecit) ; coût par signal non publié et contradictoire selon les tiers. « Un contrat d'API non vérifiable ne se devine pas. » | Aucun code, aucune clé. À rouvrir seulement avec un accès de test ET une clarification écrite du fournisseur.                                                                                                                       |
| **TheirStack**                  | **Branchée** (lot SIG-A, 10-11/10) | Palier gratuit vérifié (200 crédits/mois), aucun signal défavorable ; agrège sous contrat LinkedIn, Indeed, WTTJ et ATS — la seule voie propre vers ces offres.                                                                                                                                              | `job_aggregators.py` : derrière `THEIRSTACK_API_KEY` (sans clé = no-op strict), attribution sur preuve (`same_employer`), 90 jours, ≤ 3 pages de 25 par compte, coût inscrit dans `run_metrics` (`COST_PER_RESULT_USD_THEIRSTACK`). |
| **WTTJ partenaire**             | **Écartée** (Louis, 11/10 nuit)    | TheirStack + offres publiques suffisent ; le partenariat n'est pas self-service.                                                                                                                                                                                                                             | `wttj.py` reste le no-op documenté.                                                                                                                                                                                                 |
| **« Coller un post LinkedIn »** | **Livré** (lot P06, 09/10)         | Voie « apporté par l'utilisateur » (c79) : jamais de contact avec LinkedIn.                                                                                                                                                                                                                                  | `DeclareLinkedInSignalDialog` (fiche, Découvrir) + `PastedLinkedInPostSignal` (Laura).                                                                                                                                              |

**Mesure sur 10 comptes réels (fraîcheur, attribution, coût par compte)** : non exécutée ici — elle exige la clé de production et les 10 comptes du bêta-testeur, que ce conteneur n'a pas. Le protocole (§ 2 plus bas) reste valable pour TheirStack, seule source encore à mesurer ; le coût par compte se lit déjà dans `run_metrics`. Seuils du § 2 : **tranchés sans Louis le 14/10 (lot EP-3924, voir l'encadré en tête de fichier)** — reste nommé : seule la mesure LIVE elle-même (la clé), pas le seuil.

---

# Évaluation — Lusha (signaux), TheirStack, WTTJ partenaire, « coller un post LinkedIn » (#3924)

> **Statut** : évaluation de cadrage (recherche web + lecture du code existant). **Aucun compte créé, aucun achat effectué** — contrainte du lot Y13 (08/10/2026).
> **Date** : 2026-10-08.
> **Contexte produit** : plus de signaux actuels, sans scraping, sans compte LinkedIn d'utilisateur en danger. « Mesurer avant de brancher. »
> **Décision demandée par l'issue** : rapport de mesure + décision écrite brancher/écarter, par source.
> **Réponse courte** : **aucune des trois sources n'est branchée ce lot.** Le protocole de mesure sur 10 comptes réels (demandé par l'issue) n'a pas pu être exécuté — il exige soit une clé/un compte existant que seul Louis détient, soit la création d'un compte, explicitement interdite par le brief de ce lot. Ce document livre le **protocole prêt à exécuter** et une **revue de bureau** (desk review) qui distingue ce qui est VÉRIFIÉ (sources officielles/réglementaires, citées) de ce qui reste une AFFIRMATION FOURNISSEUR non vérifiée.

---

## 0. Résumé exécutif

| Source                                 | Mesure live exécutée ?                                                                             | Fait VÉRIFIÉ le plus significatif                                                                                                                                                                                                                                                                                                                      | Décision ce lot                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Lusha** (signaux)                    | Non — nécessite un compte payant (API dès le palier Pro).                                          | L'autorité italienne (Garante) a infligé à Lusha une amende de **2 M€** (juillet 2026) pour traitement de données de personnes (y compris des agents publics) au-delà de la collecte statique — mises à jour/vérifications continues. La CNIL avait clos son enquête en 2022 **sans amende, pour incompétence territoriale** (pas un satisfecit RGPD). | **Écarter ce lot** — risque réglementaire récent + contrat de coût par signal non publié/contradictoire.    |
| **TheirStack**                         | Non — nécessite la création d'un compte (même le palier gratuit).                                  | Palier gratuit documenté : 200 crédits API/mois, 1 crédit par offre d'emploi. Premier palier payant : 1 500 crédits / 59 $/mois.                                                                                                                                                                                                                       | **Écarter ce lot** (reste : créer un compte de test exige l'accord de Louis, explicitement hors périmètre). |
| **WTTJ — Solutions API (partenariat)** | Non — accès non self-service, ouverture manuelle du scope par WTTJ, réservé aux plans Pro+/Master. | Existence confirmée de `developers.welcomekit.co` (scopes `jobs_r`/`candidates_r` entre autres) ; accès UNIQUEMENT via une démarche commerciale avec WTTJ, pas d'auto-inscription.                                                                                                                                                                     | **À préciser : décision Louis** (demande de partenariat — nommé explicitement par l'issue elle-même).       |
| **« Coller un post LinkedIn »**        | N/A — chantier produit, pas une source de données tierce.                                          | Aucun code existant (confirmé par `git grep` — section 5). Patron déjà écrit ailleurs dans le produit (saisie manuelle sourcée, jamais un scraping LinkedIn).                                                                                                                                                                                          | **Chantier distinct**, hors périmètre de ce lot (le brief l'indique explicitement).                         |

---

## 1. Pourquoi aucune mesure live n'a pu être faite

Le protocole demandé par l'issue (« dix comptes réels du bêta-testeur, trois mesures par source : fraîcheur, attribution correcte, coût par compte ») suppose un accès authentifié à chacune des trois sources. Le brief de ce lot est explicite et à deux reprises : **« n'achète RIEN, ne crée aucun compte »**. Les trois sources exigent l'une ou l'autre :

- **Lusha** : l'accès API n'existe qu'à partir du palier **Pro** (payant) — pas de palier gratuit identifié pour l'API.
- **TheirStack** : palier gratuit réel (200 crédits/mois), mais il exige tout de même la **création d'un compte** — donc hors périmètre de ce lot, même sans paiement.
- **WTTJ Solutions API** : pas d'auto-inscription du tout — l'accès s'ouvre manuellement par WTTJ, après démarche commerciale.

Doctrine citée dans l'issue elle-même : **« un contrat d'API non vérifiable ne se devine pas. »** Plutôt que d'inventer des mesures, ce document :

1. livre le **protocole de mesure prêt à l'emploi** (section 2), pour qu'une clé/un compte fourni par Louis permette de l'exécuter en une session ;
2. livre une **revue de bureau** par source (sections 3-4), qui sépare explicitement le VÉRIFIÉ (sources officielles, réglementaires) de l'AFFIRMATION FOURNISSEUR non vérifiée — exactement la distinction que l'issue elle-même pose (« Affirmations de fournisseurs (blogs, non vérifiées) »).

---

## 2. Protocole de mesure — prêt à exécuter (dès qu'un accès existe)

Pour chaque source, sur les **10 mêmes comptes réels** (choisis par le bêta-testeur, mélange profils actifs/dormants) :

1. **Fraîcheur** — pour chaque signal remonté : `date_signal` vs `date_appel`. Médiane et P90 de l'écart, par source. Un signal sans date exploitable compte comme « non daté », jamais comme « récent ».
2. **Attribution correcte** — pour chaque signal : le compte visé est-il **le bon** (pas un homonyme) ? Taux de faux positifs mesuré à la main sur l'échantillon (preuve : SIREN, domaine, ou nom exact — jamais une ressemblance).
3. **Coût par compte** — `coût total de l'appel (crédits/€) / nombre de comptes avec ≥1 signal utile`. Un signal « utile » = daté + attribué correctement. Un appel qui ne retourne rien doit être compté à son coût réel (voir section 3.1 — certaines sources facturent même un résultat vide).

**Seuil de décision — tranché sans Louis le 14/10 (lot EP-3924)** : une source rejoint la production si médiane de fraîcheur < 30 jours, faux positifs d'attribution < 5 %, et coût par compte utile ≤ 2,45 $ (borne déjà tenue par le code pour TheirStack, voir l'encadré en tête de fichier — pas une valeur inventée, la pagination existante la rend mécanique).

---

## 3. Lusha (signaux)

### 3.1 Ce qui est VÉRIFIÉ (sources tierces convergentes, pas la doc officielle Lusha elle-même — non consultée)

- L'accès API (recherche, enrichissement, **signaux**, **webhooks**) n'est disponible qu'à partir du palier **Pro** — absent des paliers Free/Starter. [Reply.io — Lusha API Review 2026](https://reply.io/blog/lusha-api/), [Overloop — Lusha pricing](https://overloop.com/blog/lusha-pricing)
- Le coût exact par signal/webhook n'est **pas publié** : les sources tierces se contredisent déjà entre elles (un appel sans résultat est-il facturé ? certaines disent oui — au moins 1 crédit —, d'autres disent non). [GTM Directory — Lusha](https://thegtmdirectory.com/tools/lusha/md)
- Les prix affichés eux-mêmes divergent selon la source consultée (de ~45 $ à ~70 $/mois pour Pro selon la promotion et la source). **Aucun chiffre ci-dessus ne doit être cité au client sans confirmation écrite de Lusha.**
- **Autorité italienne (Garante), amende de 2 M€ annoncée le 27/07/2026** : Lusha ne se contentait pas d'une collecte statique de données professionnelles, mais effectuait des **mises à jour et vérifications continues** sur des personnes — dont des agents publics, forces de l'ordre et magistrats. Interdiction de tout traitement ultérieur sur ces données + ordre de suppression. [CaptainCompliance — Italian Garante Hits Lusha with €2M Fine](https://captaincompliance.com/education/italian-garante-hits-us-data-broker-lusha-with-e2-million-fine-and-processing-ban/)
- **CNIL (France), enquête ouverte en 2018, close le 20/12/2022 (délibération SAN-2022-024) — SANS amende**, au motif que le RGPD ne s'appliquait pas au traitement examiné (Lusha n'offrait pas de services à l'UE / ne ciblait pas les utilisateurs UE à l'époque de la plainte). **Ce n'est pas un satisfecit de conformité** — c'est une question de compétence territoriale, qui a pu changer depuis. [Digital Policy Alert — closed investigation](https://digitalpolicyalert.org/event/9071-closed-investigation-by-cnil-into-lusha-systems-over-gdpr-applicability), [Siècle Digital](https://siecledigital.fr/2023/01/25/la-cnil-met-en-lumiere-une-possible-faille-du-rgpd/embed/)

### 3.2 Ce qui reste une AFFIRMATION FOURNISSEUR (non vérifiée ici)

- « Signaux datés et webhooks temps réel » (reprise de blogs marketing Lusha/revendeurs) — ni la fraîcheur réelle, ni le taux d'attribution correcte n'ont de source indépendante mesurée.

### 3.3 Décision

**Écarter ce lot.** Deux motifs indépendants, chacun suffisant seul : (1) le protocole de mesure ne peut pas s'exécuter sans compte payant ; (2) une sanction réglementaire récente et sérieuse (juillet 2026, données de personnes incluant des agents publics) sur le même modèle de collecte que celui qui sert les « signaux » — un risque de réputation disproportionné pour un produit vendu à des ESN françaises, tant qu'aucune clarification de Lusha sur son traitement post-sanction n'est obtenue. Rouvrir si Louis obtient un accès de test ET une clarification écrite de Lusha sur le périmètre post-sanction.

---

## 4. TheirStack

### 4.1 Ce qui est VÉRIFIÉ

- Palier gratuit réel : **200 crédits API/mois**, renouvelés (pas un essai à usage unique). 1 crédit = 1 offre d'emploi ; 3 crédits = 1 fiche entreprise. Premier palier payant : 1 500 crédits pour 59 $/mois, jusqu'à 200 000 crédits pour 900 $/mois. [TheirStack — pricing](https://theirstack.com/en/pricing) (page officielle, lue via résumé de recherche — non ouverte directement ici)
- Palier applicatif séparé avec 50 crédits « company » gratuits (produit différent de l'API).

### 4.2 Ce qui reste une AFFIRMATION FOURNISSEUR / tierce non confirmée

- Un comparateur tiers (concurrent déclaré) avance un essai de 2 000 crédits sur 7 jours puis des paliers à partir de 49 $/mois — **chiffres non confirmés sur la page officielle**, à ignorer tant qu'ils ne sont pas revérifiés.
- Fraîcheur/attribution réelles des offres IT françaises : aucune mesure indépendante trouvée.

### 4.3 Décision

**Écarter ce lot** — pas une question de risque (rien de défavorable trouvé), uniquement de périmètre : même un palier gratuit exige de **créer un compte**, explicitement exclu par le brief. **Reste nommé pour Louis** : créer un compte de test TheirStack (gratuit, 200 crédits/mois) et fournir la clé API, ou autoriser explicitement la création. C'est la source la **plus prometteuse** des trois pour une suite rapide — aucun signal défavorable trouvé, contrairement à Lusha.

---

## 5. Welcome to the Jungle — partenariat « Solutions API »

### 5.1 Ce qui est VÉRIFIÉ

- Code actuel (`apps/ia/app/services/data_sources/wttj.py:1-31`) : no-op strict documenté, vérifié le 2026-07-16 — `robots.txt` interdit la recherche automatisée, pas d'API gratuite, la clé Algolia du front n'est pas réutilisée. `git grep -n wttj apps/ia/app` (vérifié ce lot) ne montre que des appelants de ce no-op (`discover_signals.py:1140,1279`, `phase1_research.py:798`, `data_gateway.py:267`) — aucune intégration « Solutions API »/partenaire n'existe dans le code.
- `developers.welcomekit.co` existe bel et bien comme documentation API du produit « Welcome to the Jungle / Welcome Kit » — référencé par un agrégateur d'intégrations tiers (Unified.to) comme le point d'entrée technique. [Unified.to — Jungle integration](https://unified.to/integrations/jungle.md)
- L'accès n'est **pas self-service** : des guides d'intégration tiers décrivent une ouverture manuelle du scope par WTTJ, réservée aux comptes sur un plan **Pro+ ou Master**, avec des scopes nommés (`jobs_r`, `candidates_r` entre autres — lecture des offres et des candidatures). [Kombo — Welcome to the Jungle integration guide](https://help.kombo.dev/hc/en-us/articles/18402550319121-Welcome-to-the-Jungle-How-do-I-link-my-account)

### 5.2 Ce qui reste non vérifié

- Le contenu exact des endpoints, l'authentification précise et une éventuelle offre « partenaire data » (plutôt que « client ATS ») n'ont pas pu être confirmés — la documentation elle-même n'a pas pu être ouverte depuis ce poste d'exécution (accès réseau sortant restreint à une liste blanche, voir section 6).

### 5.3 Décision

**À préciser : décision Louis** — c'est l'issue elle-même qui le nomme (« Demande de partenariat WTTJ : décision Louis »). Ce rapport confirme qu'une démarche de partenariat est la seule voie identifiée (pas d'auto-inscription), et que le point de contact technique existe (`developers.welcomekit.co`). La décision d'engager cette démarche commerciale reste entièrement celle de Louis.

---

## 6. « Coller un post LinkedIn » — chantier distinct

Recherché au `git grep -iE "coller.*linkedin|linkedin.*post|paste.*linkedin" -- apps/web apps/api apps/ia` sur `origin/main` : aucun résultat applicatif. Le seul hit touchant LinkedIn est `apps/api/src/modules/contacts/contact-classifier.ts` (« A rep pastes a raw contact list (CSV / LinkedIn export) ») — une fonctionnalité DIFFÉRENTE (coller une LISTE de contacts exportée), pas le parcours « coller le texte ou l'URL d'un post » demandé par l'issue. Aucun APPELANT de ce parcours n'existe. Le brief de ce lot classe explicitement ce point comme un **chantier distinct**, pas un critère de recette de #3924 (les deux seuls critères sont le rapport de mesure et la décision brancher/écarter, section 0). Non implémenté ce lot — à planifier séparément. Doctrine applicable déjà tranchée ailleurs (`agent_docs/integrations/linkedin-api-tos-etude.md` §5.1, Option A) : un signal saisi/collé par l'utilisateur, jamais une collecte automatisée depuis LinkedIn.

---

## 7. Limites de cette évaluation

- **Aucune mesure live** : voir section 1. Les trois décisions « écarter ce lot » reposent sur l'application de la doctrine (« un contrat non vérifiable ne se devine pas »), pas sur un échec de mesure.
- Ce poste d'exécution n'a pas d'accès réseau sortant vers des hôtes arbitraires (proxy à liste blanche) — les pages officielles (Lusha, TheirStack, WTTJ) n'ont pas pu être ouvertes directement ; les faits ci-dessus viennent de résumés de recherche web, recoupés entre plusieurs sources tierces quand c'était possible, et marqués comme tels quand ça ne l'était pas.
- Rien ici ne constitue un avis juridique ou un engagement de prix — toute reprise de chiffre dans une discussion commerciale ou un contrat doit être reconfirmée directement auprès du fournisseur.
