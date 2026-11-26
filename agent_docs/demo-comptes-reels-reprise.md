# Démonstration aux 5 comptes réels — dossier de reprise

> ## ✅ CHANTIER TERMINÉ — 11/08/2026
>
> Le câblage est fait, les cinq dossiers sont en place, la suite est verte
> (API 4 137, IA 4 055, web démo 21). Ce document reste comme JOURNAL : il
> explique les décisions et les échecs, pas ce qu'il reste à faire.
>
> **Ce qui a changé depuis sa rédaction :**
>
> - **SNCF a abouti.** Le run a tourné en entier le 11/08 (compte
>   `5ca33fc1…`, 1,13 €, dossier complet : 3 angles, 5 défis, 9 entités, 8
>   sites). La question ouverte n°1 (§5) est répondue et corrigée — voir
>   ci-dessous.
> - **Question n°1 — que fait la phase `plan` pendant ~115 s ?** Elle fait deux
>   choses APRÈS avoir écrit son plan, et aucune n'est visible : la mesure de
>   `self-consistency` (jusqu'à trois appels modèle de plus, tirés APRÈS
>   `emit_progress(… 99, "Plan d'action prêt")` et via un `call_claude` passé en
>   paramètre — donc sans ligne « Phase4 call start/done »), puis l'alimentation
>   de la base de connaissance (un plongement + une écriture PAR DOCUMENT). Les
>   deux se déclarent « ne casse jamais le run », ce qui était vrai de leurs
>   ERREURS et faux de leur TEMPS. Chacune a désormais SON budget
>   (`SELF_CONSISTENCY_BUDGET_S`, défaut 60 s ; 20 s pour l'écriture) : au
>   dépassement on abandonne l'accessoire, jamais le livrable.
> - **Question n°2 — pourquoi 0 angle sur leboncoin et BlaBlaCar ?** Ce n'est pas
>   le prisme de domaine. C'est la sortie ENTIÈRE de `bellum_strategy` qui a été
>   perdue : les SEPT sections stratégiques (`it_challenges`, `pains`, `angles`,
>   `axes_ecartes`, `comment_ouvrir_compte`, `power_questions`, `objections`)
>   sont vides d'un seul coup, quand faits et signaux sont pleins. Tous les
>   champs de `ResearchStrategy` ayant un défaut vide, une réponse que Pydantic
>   ne mappe sur AUCUN champ rend un objet par défaut — sans lever. Correctif :
>   détection, UNE relance, puis un avertissement `STRATEGY_SECTIONS_EMPTY` qui
>   fait passer l'enveloppe en `partial_success` + `logger.error`. Jamais de
>   contenu de repli : un angle fabriqué serait pire que l'onglet vide.
> - **Défaut n°5 (§6) corrigé**, et un sixième trouvé au passage : les SITES
>   affichaient le CODE de tranche INSEE comme effectif (« 12 » pour un
>   établissement de 20 à 49 personnes). Un chiffre faux, et crédible.
> - **Deux défauts supplémentaires observés, NON corrigés** (hors périmètre,
>   à traiter à part) : les offres d'emploi APEC ne sont pas scopées à la
>   société analysée (SNCF ramène KLANIK, Hellowork, un CHU) ; et la résolution
>   d'entités a rattaché à SNCF des enseignes de prêt-à-porter et de coiffure.
> - **Les dates de naissance des mandataires** voyagent dans `raw_analysis`
>   (`executives[].date_of_birth`) : le collecteur de faits les exclut, le
>   pipeline non. Elles ne sont pas seedées en démonstration ; le nettoyage
>   côté pipeline reste à faire.

> **À lire en entier avant de toucher au code.** Ce document est fait pour être
> exécuté par quelqu'un qui n'a PAS la conversation qui l'a produit. Tout ce
> qu'il faut savoir est ici : ce qui est fait, ce qui reste, ce qui a déjà été
> essayé et a échoué, et les pièges qui ont coûté du temps.

**Date de la campagne de runs : 10-11/08/2026.**
**Décisions produit : arbitrées par Louis, reprises en §3 — ne pas les rouvrir.**

---

## 1. L'objectif

Les trois dossiers de démonstration INVENTÉS (Groupe Helios, NovaSanté, Altiver)
laissent la place à **cinq sociétés réelles** :

**Société Générale · Thales · leboncoin · BlaBlaCar · SNCF**

(SNCF remplace la RATP, décision Louis du 11/08.)

Le lien de démonstration est **public** : ce qui s'y affiche est lu par des
prospects et, potentiellement, par les sociétés nommées. D'où la règle qui
gouverne tout le chantier :

> **Aucune donnée inventée sur une société réelle.** Ce qui n'est pas issu d'un
> run réel ou d'une source publique citable ne s'écrit pas.

Corollaire non négociable : **aucune coordonnée nominative** (courriel,
téléphone). Un run réel en enrichit de vraies, sur de vraies personnes ; les
publier serait une diffusion de données personnelles. Le convertisseur les
retire déjà (§4).

---

## 2. Où on en est

### Fait et mergé (ou en attente de merge — voir PR #904)

- **Quatre dossiers RÉELS capturés** et versionnés :
  `agent_docs/demo/dossiers-reels-2026-08-10.json` (1,7 Mo).
  Société Générale, Thales, leboncoin, BlaBlaCar — sortie brute du pipeline,
  coordonnées retirées, 12 contacts par dossier, `raw_analysis` complet
  (~87 clés). C'est le MATÉRIAU : il a coûté de vrais appels fournisseurs, ne
  pas le regénérer sans raison.
- **Faits publics des 5 sociétés** : `scripts/collect-demo-facts.mjs`
  (annuaire INSEE/RNE + BODACC, aucune clé, relançable à volonté).
- **Convertisseur run → démonstration** : `scripts/demo-dossier-from-run.mjs`.
- **Cinq correctifs produit** trouvés par ces runs (§6) — ils ne sont PAS liés à
  la démonstration, ils profitent à tous les clients.

### Reste à faire

**Le câblage du jeu de démonstration : ~4 605 lignes.**

| Fichier                                                                    | Lignes | Ce qu'il faut en faire          |
| -------------------------------------------------------------------------- | ------ | ------------------------------- |
| `apps/api/src/modules/demo/demo-dataset.ts`                                | 2 941  | 3 dossiers fictifs → 5 réels    |
| `apps/api/src/modules/demo/demo-org-graphs.ts`                             | 1 002  | 3 organigrammes → 5             |
| `apps/api/src/modules/demo/demo-scripts.ts`                                | 320    | progression scriptée + copilote |
| `apps/api/src/modules/demo/demo-briefing.ts`                               | 232    | « Ma journée »                  |
| `apps/web/src/features/demo/demo-chat-script.ts`                           | 110    | fil du copilote                 |
| + `demo-enrichment.ts`, `demo-contact-profile.spec.ts`, `demo-coverage.ts` |        | gardes                          |

⚠️ **Bascule d'un seul coup.** Un jeu à moitié migré — deux dossiers réels, un
fictif, deux vides — ne se lit pas comme une transition mais comme un produit
cassé. Tant que les cinq ne sont pas prêts, les fictifs restent en production.

---

## 3. Les décisions de Louis (arbitrées, à appliquer telles quelles)

1. **Contacts = dirigeants du REGISTRE.** Personnes réelles, nom complet +
   fonction exacte issus du RNE, aucune coordonnée. On n'utilise PAS les
   contacts du run : ils sont dominés par des demi-identités (§6.3).
2. **Thales = périmètre GROUPE.** Le registre décrit la holding (1 000-1 999
   salariés) ; la fiche annonce le groupe (~80 000), avec la mention du
   périmètre. Sans ça, un prospect qui connaît Thales lit une erreur.
3. **Tri des contacts corrigé tout de suite** — fait, commit `885d16b9`.
4. **Gros comptes : borner ET dire.** La partie « dire » est faite
   (commit `885d16b9`). La partie « borner » a été ÉCARTÉE après diagnostic —
   voir §5, la cause supposée était fausse.

### Les dirigeants du registre, déjà collectés

| Société                | SIREN     | Dirigeants opérationnels au registre                                                                                     |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Société Générale       | 552120222 | Lorenzo Bini Smaghi (Président du conseil d'administration) · Pierre Palmieri (Directeur général délégué)                |
| Thales                 | 552059024 | Patrice Caine (Président du conseil d'administration et directeur général)                                               |
| BlaBlaCar (COMUTO)     | 491904546 | Frédéric Mazzella (Président du conseil d'administration)                                                                |
| SNCF                   | 552049447 | Jean Castex (Président du conseil d'administration et directeur général) · Laurent Trévisani (Directeur général délégué) |
| leboncoin (LBC FRANCE) | 521724336 | **AUCUN** — voir ci-dessous                                                                                              |

Regénérer : `node scripts/collect-demo-facts.mjs`.

**leboncoin n'a aucun dirigeant au registre.** Son organigramme dépendra donc
entièrement d'autre chose. Deux options honnêtes : les rôles sans personne
nommée (« Directeur technique », « Responsable plateforme »), ou des dirigeants
dont le nom ET la fonction sont publiquement documentés et cités. Ne pas
inventer.

---

## 4. La recette qui marche (stack locale, runs réels)

Tout est LOCAL : Supabase sur `localhost:54321`, Postgres `5440`. **Aucune
écriture en production.**

```bash
open -a OrbStack                       # le démon docker
pnpm infra:start                       # Postgres + Supabase + Redis
pnpm db:reset                          # migrations + seed
                                       # ⚠️ le seed échoue sur une FK
                                       # `profiles_user_id_fkey` : sans intérêt,
                                       # on crée l'utilisateur par l'API juste après

set -a && source tools/dev.secret.sh && set +a
pnpm --filter @bellum/api dev          # port 3012
cd apps/ia && source .venv/bin/activate && uvicorn app.main:app --port 8000
```

Créer l'utilisateur et son profil ESN :

```bash
curl -c /tmp/cookies.txt -X POST localhost:3012/auth/signup -H 'content-type: application/json' \
  -d '{"email":"demo-runs@bellum.local","password":"DemoRuns!2026","first_name":"Demo","last_name":"Runs"}'
# ⚠️ first_name / last_name en snake_case — camelCase donne un 400.

curl -b /tmp/cookies.txt -X PUT localhost:3012/esn-profile -H 'content-type: application/json' -d '{
 "esn_name":"Bellum Conseil","consultant_size":"50-150","sales_team_size":"3",
 "expertise_areas":["Cloud & DevOps","Data & IA","Cybersécurité","Développement applicatif"],
 "positioning":"ESN généraliste IT, régie et forfait, expertise cloud et data",
 "target_sectors":["Banque / Assurance","Industrie","Transport","Services numériques"],
 "target_company_types":["Grand compte","ETI"],"staffing_model":"Régie et forfait",
 "geo_zones":["Île-de-France"],"main_sales_pain":"Identifier les bons décideurs IT et le bon moment"}'
```

Donner des crédits (sinon l'analyse est refusée) :

```sql
UPDATE subscriptions SET plan='growth', accounts_limit=2000, accounts_used=0, trial_end=NULL
WHERE user_id='<uuid rendu par le signup>';
```

Lancer une analyse — **toujours avec le SIREN** (le nom seul ramène des
homonymes) :

```bash
curl -b /tmp/cookies.txt -X POST localhost:3012/analysis/start -H 'content-type: application/json' \
  -d '{"company_name":"Thales","siren":"552059024"}'
```

Capturer :

```bash
PGPORT=5440 node scripts/demo-dossier-from-run.mjs <accountId> [...] > dossiers.json
```

Un run dure **6 à 20 minutes**. Cinq en parallèle passent, mais ils se
concurrencent sur les limiteurs de débit fournisseurs.

---

## 5. SNCF : trois échecs, et ce qu'on en sait

**SNCF n'a JAMAIS abouti.** Trois tentatives :

| Tentative                                  | Où ça casse                                                |
| ------------------------------------------ | ---------------------------------------------------------- |
| Périmètre groupe                           | phase `plan`, budget 260 s dépassé                         |
| Périmètre `it_digital`                     | phase `contacts` — doublon (correctif non chargé, voir §7) |
| Périmètre `it_digital`, correctifs chargés | phase `recherche`, budget 450 s dépassé                    |

**Ce que les logs disent, et qui contredit l'hypothèse évidente :** la phase de
classification n'est PAS le problème. Elle est déjà bornée à 50 contacts
(`CONTACTS_ENRICH_MAX`) et a tourné en **122 s sur un budget de 200 s**. Ce qui
coupe, c'est ailleurs — et sur la tentative n°1, la phase `plan` a été coupée
alors que **tous ses appels modèle s'étaient terminés 2 minutes plus tôt**.

**Question ouverte n°1 : que fait la phase `plan` pendant les ~115 s qui suivent
ses appels modèle ?** Personne ne l'a élucidé. C'est le vrai sujet.

Arithmétique utile : les budgets de phase somment à **1 080 s** pour **1 080 s**
disponibles (`JOB_TIMEOUT_S` 1 200 − `TERMINAL_REPORT_HEADROOM_S` 120). Marge
nulle : aucun budget ne peut grandir sans qu'un autre rétrécisse.
Voir `apps/ia/app/graph/builder.py`.

**Pour la démonstration**, deux voies :

- reprendre les runs SNCF en cherchant d'abord où part le temps (le bon
  chemin, mais c'est une investigation) ;
- construire le dossier SNCF à la main depuis le registre + faits publics
  cités, comme pour les trous de leboncoin et BlaBlaCar (§8).

---

## 6. Les cinq défauts trouvés par les runs

Tous corrigés et testés, PR #904. Ils ne concernent PAS la démonstration.

1. **Dérive de forme du modèle (3 runs perdus sur 5).** `technologyStack` rendu
   en chaîne JSON, `rdvScript.exploration` rendu en liste, enveloppe `data`
   sérialisée. Réparé au niveau de l'ENVELOPPE (`claude_service.py`), donc
   toutes les phases d'un coup. Tests : `apps/ia/tests/test_research_shape_drift.py`.
2. **Doublon de nom → dossier perdu.** Le repli ligne par ligne existait mais
   tournait dans une transaction déjà avortée par Postgres. Chaque tentative
   passe désormais sous `SAVEPOINT`.
3. **Tri des contacts.** 12 des 12 premiers contacts de Société Générale
   n'avaient qu'un prénom (« Willy — Chief Information Officer ») : l'offre de
   recherche Apollo masque le nom de famille. `hasCompleteIdentity` +
   `sortByUsableIdentity` — c'est un TRI, pas un filtre.
4. **Message de dépassement.** Le fourre-tout « timeout » écrasait un message
   précis et disait « Relancez-la » — cinq relances, cinq mêmes échecs.
5. **Vocabulaire interne affiché.** Le chiffre d'affaires de BlaBlaCar contient
   `- donnée Pappers "revenue_latest" non disponible` : un nom de fournisseur et
   un nom de champ dans une valeur que le client lit. **NON CORRIGÉ.**

**Question ouverte n°2 : deux dossiers sur quatre (leboncoin, BlaBlaCar) rendent
ZÉRO angle d'attaque, ZÉRO axe écarté, ZÉRO défi IT** — et rien à l'écran ne le
signale. Les phases ont tourné et écrit des tableaux vides. Les deux cas sont des
plateformes tech ; les deux groupes traditionnels rendent 3/4/5 chacun. À
investiguer : est-ce le prisme de domaine (`domain_focus.py`) ?

---

## 7. Les pièges qui ont coûté du temps

- **Les copies de fichiers entre worktree et copie de travail écrasent des
  correctifs.** Le correctif des `SAVEPOINT` a DISPARU du fichier par ce
  mécanisme ; `tsc` passait, tout compilait, et une analyse réelle a rejoué
  l'échec d'origine. Seul le test l'a vu. **Travailler dans UN seul endroit.**
- **La CI GitHub échoue en 2 secondes sur tous les jobs** — quota Actions, pas
  le code. Ne pas relancer les jobs en boucle. Vérifier en local, et le dire.
- **Un worktree nu fait mentir les tests.** `@bellum/errors` sans `dist` fait
  échouer 2 tests du copilote qui passent parfaitement dans le dépôt principal.
  Voir `memory/worktree-verify-and-changelog-rebase.md`.
- **La garde de parité entités ↔ base est SAUTÉE par défaut.** Elle ne tourne
  qu'avec `PG_TEST_URL` posé — et c'est elle qui attrape « colonne déclarée mais
  inexistante », le défaut qui avait mis trois écrans en 500 :
  `PG_TEST_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5440/postgres" npx jest src/database`
- **Nommer les migrations avec un VRAI horodatage** (pas `1789000000000`) : une
  garde refuse les nombres ronds.

---

## 8. Matière déjà réunie pour combler les trous

Faits publics vérifiés, à utiliser pour les défis IT des dossiers qui n'en ont
pas. **Citer la source dans le dossier.**

**leboncoin** — 1 200+ microservices, 500 bases PostgreSQL, 1,8 M d'opérations
CI/CD par an, 60+ cas d'usage IA depuis 2023 ; migration vers Kubernetes menée
en parallèle des VM ; plateforme d'apprentissage automatique migrée d'AWS
SageMaker vers Kubernetes + Kubeflow ; réécriture progressive en Go.
Sources : blog technique leboncoin (Medium), LeMagIT, Welcome to the Jungle.

**BlaBlaCar** — migration de la plateforme vers Google Cloud (PaaS + IaaS) ;
modération par IA générative (embeddings + apprentissage classique) estimée à
~1 M€ d'économies par an ; l'Inde devenue premier marché en 2025 (19 M de
passagers) ; entrée en Indonésie, Malaisie, Philippines, Thaïlande, Vietnam ;
800 000 conducteurs supplémentaires au printemps 2026 ; cession de BlaBlaCar
Daily à Karos. Sources : InformatiqueNews, LeMagIT, L'Écho touristique,
FrenchWeb.

**Signaux déjà capturés dans les dossiers réels** (à réutiliser tels quels, ils
viennent du pipeline) : Thales recrutant 3 300 personnes en France en 2026 et
rachetant Exail pour 4 Md€ ; leboncoin lançant son application dans ChatGPT ;
Société Générale réorganisant sa direction générale.

---

## 9. Les règles du dépôt à ne pas oublier en câblant

- **Parité démonstration** : toute table remplie doit être classée dans
  `demo-coverage.ts` — seedée, ou vide À DESSEIN avec sa raison. La CI tombe
  sinon. Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer
  le test.
- **i18n FR + EN** systématique, et l'interface **tutoie** (un test le vérifie).
- **Une entrée de changelog** par nouveauté visible (`packages/contracts/src/changelog/`).
- **Tokens CSS** : seuls ceux déclarés dans `tokens.css` existent
  (`token-usage.test.ts`).
- **Aucun nom d'éditeur** hors Réglages › Intégrations.
- La démonstration ne doit **appeler aucun modèle** ni aucun fournisseur : des
  tests le verrouillent (`demo-no-model.spec.ts`, `demo-model-calls.spec.ts`).
