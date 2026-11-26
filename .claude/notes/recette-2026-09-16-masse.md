# Recette de masse — 16/09/2026

**SHA servi en production : `3993b432b`** (API et IA, `/version` lu à 07 h 37).
`origin/main` = `03625739f`, en avance de 2 commits de NOTES seulement — donc
main ≈ prod pour tout ce qui est code.

**Session de production** : rouverte par Louis ce matin. Vérifiée à 09 h 50 —
`GET /onboarding/state` et `GET /accounts` rendent 200.

**Compte de Louis réparé** : il était en `refresh_required` depuis la recette du
15/09 (le bouton « Revoir mes réponses » appelle `POST /onboarding/refresh`).
Réparé par le chemin PRODUIT, pas par la base : `POST /onboarding/complete`
→ 200, état `completed`, étape `transition_summary`. La transition
`refresh_required → completed` a été ouverte le 16/09 par `bcffaa56b`, et ce
commit EST servi en production. Aucune réponse inventée : `complete()` relit les
réponses déjà enregistrées. `/welcome` se rouvre (H1 « Bienvenue Louis 👋 »).

---

## Écran `/settings/profile/audit` — mesuré à 09 h 55

**Sonde de mise en page : 447 éléments lus, ZÉRO symptôme** — aucun bloc écrasé,
aucun débordement, aucun recouvrement du `<h1>`, pas de défilement du corps.
(`corpusLu: 447` — une sonde qui ne dit pas combien elle a lu ne prouve rien.)

Texte de l'écran : **11 268 caractères**. Ce qui y est VU :

- **En-tête** : « Voici ce que Bellum a compris de ton activité » · « Chaque ligne
  vient de tes réponses. Ce qui n'a pas pu être établi est nommé, jamais compté
  pour zéro. » · « Version 26 · Actualisé le 15 septembre 2026 » · « Validé le
  16 septembre 2026 par Louis ».
- **Cartes de synthèse** : POSTURE DE VENTE RETENUE (Verticaux de niche) · TYPE
  D'ESN RETENU (Challenger mid-market) · COMPTES VISÉS · CE QUI FREINE LE PLUS
  (Couverture stakeholders) · CADENCE RECOMMANDÉE (6 analyses/semaine ·
  18 messages/jour · 35 relances/semaine).
- **LE VERDICT** — une contradiction rendue en quatre temps : le fait
  (« L'objectif mensuel de comptes dépasse ce que la cadence recommandée permet
  d'analyser »), la tension, l'explication possible (« Sans ajustement, l'objectif
  se fixe sur un rythme que la cadence recommandée ne peut pas tenir »), et le
  marqueur de provenance « Déduit ».
- **La chaîne commerciale — NEUF étapes**, « dix-huit règles de détection ont
  mesuré », « Une rupture s'ouvre au clic » : Contact (1 rupture détectée) →
  Échange (Rien à signaler) → Besoin / Profil / Entretien / Accord
  (**Non mesuré à cette étape**) → Démarrage (1 rupture détectée) → Suivi /
  Capitalisation (Non mesuré). **Les trois états sont distincts** : rupture,
  rien à signaler, non mesuré — « non mesuré » n'est JAMAIS rendu « rien à
  signaler » ni « 0 ».
- **MATURITÉ COMMERCIALE — `19/21 · 5 axe(s) non évaluable(s)`**, et les cinq
  sont NOMMÉS : Preuves, Qualification client, Sécurisation candidat,
  Capitalisation, Alignement équipe. Les sept évalués portent leur niveau
  (Clarté de l'offre 3 — Mature, Ciblage 2 — Structuré, Accès 3, Capacité
  commerciale 2, Discipline du suivi 3, Data et outils 3, Mesure 3). Un score
  n'est pas nu, et ce qui n'a pas pu être évalué SORT du dénominateur.
- **Trois décisions, pas une liste de tâches** : Arrêter · Garder · Renforcer,
  chacune avec sa provenance (« D'après ton style de message », « D'après la
  lecture de tes réponses ») et son action « Corriger une information ».
- **Les voies possibles** — quatre entrées (par le haut · par le terrain · sur
  plusieurs fils · par recommandation), chacune avec les SIX champs :
  « Son potentiel » · « Ce qu'il faut avant de s'y engager » · « Ses limites » ·
  « La charge » · « Le délai de retour » · « Le risque, et comment le reconnaître »
  · « Le premier test » · « La condition d'arrêt ». Et une recommandation
  nommée : « À ta place, je commencerais par entrée sur plusieurs fils. »
- **Mémoire marché** : six environnements rendus (Capgemini, BNP Paribas,
  Societe Generale, Orange, L'Oréal, TotalEnergies).
- **Suite** : PRIORISER CETTE SEMAINE · « À partir de maintenant, Bellum va… »
  (7 cartes) · Plan à 4 semaines · Paliers · « Ce que Laura pourra régler depuis
  cet audit » · **« Ce qui n'a pas pu être établi »**.

⚠️ **Aucun nom de fournisseur** n'apparaît dans les 11 268 caractères.

---

## Écran `/accounts/<id>` — DEVOTEAM, le compte le plus riche des 30 — 09 h 58

⚠️ L'URL demandée redirige vers `?tab=organigramme` : le relevé porte sur CET
onglet, pas sur la synthèse.

**Sonde : 988 éléments lus, ZÉRO symptôme.** C'est un revirement mesuré : le
14/09, la colonne d'identité du dossier faisait **0 px dans un parent de 1174 px
sur 5 comptes sur 5**. Elle ne le fait plus.

Vu : les **sept sections** (Synthèse · Périmètres · Opportunités · Personnes ·
Écosystème & accès · Plan d'action · Historique & preuves) · « En observation »,
« Analyse : Terminé », « Déjà dans ton CRM », « 1 analyse » · SIREN 402968655 ·
prochaine action rédigée et nominative · « Analyse actualisée il y a 5 jours » ·
**« non mesuré — date de la dernière synchronisation avec ton CRM »** (la
doctrine tenue à l'écran : un inconnu se NOMME, il ne s'écrit pas « 0 ») ·
« Propriétaire : Louis Schlegel » · organigramme (Focale / Entités / Hiérarchie /
Mode édition / Influence), « Chemin d'accès recommandé », « Carte d'influence
commerciale », « Contacts de cette direction — top 10 », « Qui nous manque ».

## Écran `/chat` — 10 h 02

**Sonde : 554 éléments lus, ZÉRO symptôme.**
- **0 bouton sans nom accessible** sur 30 boutons (GA-32 tenu).
- **0 `div` cliquable** (GA-35 tenu — ce qui se clique se tabule).
- `h1` = **« Laura »** (D82 : le copilote s'appelle Laura, partout).
- Historique des conversations groupable **Par date / Par compte**, chaque fil
  porte son auteur (« Ouverte par Louis ») et sa date.
- Portée annoncée : « Tout mon espace · 27 comptes analysés ».

## Écran `/discover` — 10 h 04

**Sonde : 255 éléments lus, ZÉRO symptôme.** 0 bouton sans nom, 0 `div` cliquable.

Vu : onglets « Comptes · Contacts · Mes cibles · Découvrir · Mémoire collective »
(**Veille n'y est plus**) · **« MES RECHERCHES ET ALERTES »** avec son état vide
rédigé (« Enregistre un périmètre pour le rejouer en un clic ») · « TA CIBLE »
(secteurs prioritaires, taille visée, niveau de décision) · les sept angles de
découverte · « Expliquer la méthode » · « Notre méthode en 3 étapes ».

### ⚠️ DÉFAUT TROUVÉ — `/discover` n'a AUCUN `<h1>`

`document.querySelector('main h1')` rend `null` : la page part directement en
`<h2>` (« TA CIBLE »). Un écran sans `<h1>` n'a pas de titre de document pour un
lecteur d'écran, et son plan de titres commence au deuxième niveau. Les trois
autres écrans mesurés ce matin en ont un (« Voici ce que Bellum a compris… »,
« DEVOTEAM », « Laura »). **À ouvrir en issue.**

## Dossier de compte, onglet Synthèse — 10 h 12

⚠️ `?tab=synthese` **normalise en `?tab=overview`** : c'est l'URL mesurée. (Un
relevé dont l'URL n'est pas celle demandée se jette ; ici la différence est une
normalisation de slug, pas une dérive de navigation — l'onglet Synthèse est bien
celui rendu.)

**Sonde : 826 éléments lus, ZÉRO symptôme.** `h1` = « DEVOTEAM ».

Vu : « Vue d'ensemble » · **Score** · « Analyse personnalisée avec ton
portefeuille d'offre Informatique et numérique · **aucune zone déclarée** » (un
manque NOMMÉ, pas un zéro) · « Analyse de Bellum » avec un verdict rédigé
(« Devoteam est un compte à travailler par BU… ») · « Travailler ce compte avec
Laura » · **« Sources et confiance »** · Firmographie · Positionnement · « Fiche
de positionnement concurrentiel » · « Contexte marché ».

Aucun nom de fournisseur d'enrichissement ou de collecte dans les 6 110
caractères de l'écran.

## Ce qui n'a PAS été recetté, et pourquoi

- **Le questionnaire d'onboarding (43 points ÉCRAN)** : ses écrans ne se
  rouvrent qu'en repassant le compte en `refresh_required`, c'est-à-dire en
  rejouant le bouton qui a cassé le compte hier. **Je ne l'ai pas fait.** Ces
  points restent `livré`.
- **Les 177 points de type CODE** : ils se prouvent par lecture du dépôt sur le
  SHA servi, pas à l'écran — ils partent en vague d'agents, hors du chemin
  critique du navigateur.

---

## Les points de type CODE — 50 prouvés par leur garde, LANCÉE

Méthode : chaque point CODE cite un fichier de test dans sa preuve. Deux
questions, pas une : le fichier existe-t-il sur le SHA servi, ET passe-t-il ?
Un fichier qui existe n'est pas un test qui passe.

- **50 points** citent un fichier ; les **17 fichiers distincts** existent tous
  sur `origin/main` (= prod à 2 commits de notes près) ;
- lancés sur le SHA servi, **257 tests verts, 0 rouge** :
  - `apps/web` (6 fichiers) — **20 PASS / 0 FAIL**
  - `packages/contracts` (5 fichiers) — **32 PASS / 0 FAIL**
  - `apps/api` (4 fichiers, jest) — **5 suites, 188 tests, 188 passés**
  - `apps/ia` (2 fichiers, pytest) — **17 passés**

⚠️ **127 autres points classés CODE ne citent aucun fichier** : leur preuve est
une phrase, pas une référence. Ils ne se prouvent pas mécaniquement et restent
`livré`.

⚠️ Piège d'outil rencontré : `jest --config apps/api/jest.config.js <chemin>`
depuis la racine rend **« No tests found »** — son `rootDir` est `apps/api/src`,
donc un chemin préfixé `apps/api/` ne matche RIEN. Un zéro de syntaxe ressemble
exactement à un zéro de vérité. La forme qui marche : `cd apps/api` puis des
**motifs** (`"memory.service.spec"`), pas des chemins.

## Ce que la journée apprend sur les registres

Trois balayages de réconciliation lancés ce matin sur six registres (750 points
`retenu`) ont déplacé **2 points au total** : 1/224 sur `/chat`, 1/77 sur
accounts-metier-1, 0 sur discover, 0 sur piliers.

**Les registres ne sont plus périmés.** Les gains de 14 à 95 % mesurés le 15/09
au soir ont déjà été récoltés. Ce qui reste marqué `retenu` est du travail
réellement non fait, une mesure qui exige la production, ou un arbitrage — pas
du code déjà écrit qu'on s'apprêtait à faire réécrire. **Conséquence pour la
suite : ne plus lancer de réconciliation en ouverture de lot ; le geste utile
est maintenant d'écrire.**

---

## Les 184 faux `recetté` — décomposés par la mesure

Un point marqué `recetté` dont la colonne de preuve dit « MERGÉ », « NON MESURÉ »
ou nomme une branche de worktree n'a pas été vu tourner en production. Sur les
**1 051 points `recetté`, 184 (17 %)** sont dans ce cas. Décomposition obtenue en
testant l'ancêtreté du SHA cité contre le commit servi `3993b432b` :

| Verdict | Nombre | Ce que ça veut dire |
| --- | --- | --- |
| `SANS-SHA` | **106** | « livré/mergé » sans référence — invérifiable mécaniquement |
| `BRANCHE-DAGENT` | **31** | cite `worktree-agent-…`, une branche éphémère ; il faut chercher si le contenu a atterri |
| `NON-MESURE` | **24** | **la preuve DIT « NON MESURÉ »** — l'état contredit son propre texte, sans ambiguïté |
| `EN-PROD` | **23** | le SHA cité EST ancêtre du commit servi : le code est bien en production |

### Les 24 dont la preuve dit elle-même « NON MESURÉ »

`registre-2026-09-12` : #1962.9 · #1962.21 · #1962.27
`accounts-metier-1` (8) · `accounts-metier-2` (3) · `accounts-piliers` (4) :
#2119.2 · #2121.48 · #2122.43 · #2124.22 · #2124.49 …
`onboarding-audit-welcome` (4) · `onboarding-questionnaire` (2)

**Ils doivent repasser `livré`.** Correction NON appliquée aujourd'hui : les six
registres sont tenus par des agents en vol, et une édition depuis l'arbre
principal produirait des conflits sur six fichiers pour un gain nul. **C'est le
premier geste du prochain lot, en une passe propre.**

⚠️ Le vrai enseignement n'est pas le chiffre, c'est le mécanisme : **rien
n'empêche aujourd'hui d'écrire `recetté` sur une ligne dont la preuve dit le
contraire.** Une garde qui refuse cette contradiction (état `recetté` + preuve
contenant « NON MESURÉ », « MERGÉ » ou `worktree-agent`) tiendrait la règle, et
elle est écrivable en un test.

## Clôtures

- **#2069 fermée** — « AUCUN NOM D'ENTREPRISE INVENTÉ PAR LE MODÈLE », 14 points
  sur 14 prouvés. La garde de LECTURE `stored-context-doctrine.spec.ts` est
  présente sur le SHA servi `3993b432b` et ses **27 tests passent**.
- **#2013 NON fermée** : 10 points sur 12 prouvés, #2013.3 (fourchette 8-12 min)
  et #2013.11 (libellé du CTA en reconfiguration) portent « NON MESURÉ ».
- **#2025 NON fermée** : #2025.2 est `livré`, pas recetté.

## Défaut ouvert aujourd'hui

**#2456** — `/discover` ne contient aucun `<h1>` dans tout le document (mesuré en
production, 255 éléments lus). 39 fichiers d'écran sur 60 n'en portent aucun, et
c'est un MAJORANT : certains héritent le leur d'un en-tête partagé. Aucune garde
ne tient cette règle aujourd'hui.

---

## Contrôle de la PR d'intégration #2457 (vague 12 bis)

Vérifié moi-même, pas sur parole :

- **Les 9 branches feuilles sont toutes ancêtres** de la tête `3e83880fa`
  (`merge-base --is-ancestor` = 0 pour les neuf). PR draft, MERGEABLE,
  +2 839/−558 sur 49 fichiers.
- **Les accolades des libellés de changelog sont équilibrées** : 811 `{` et
  811 `}` dans `labels.fr.ts` ET `labels.en.ts`. C'est le défaut exact que la
  mémoire décrit (13 jobs de CI rouges pour UNE accolade) — attrapé avant le
  commit cette fois.
- **Zéro clé en double** dans `onboarding-question-consumers.ts` (la fusion en
  avait créé 26, retirées).

### La règle de fusion que l'intégrateur s'est donnée, et son contrôle

Pour 84 statuts divergents entre les deux mesures d'un même point, il a appliqué
« **le plus AVANCÉ gagne** » (`retenu` < `livré` ≈ `déjà là` < `recetté`), en
gardant les deux mesures derrière un marqueur `⟂`.

⚠️ Cette règle peut promouvoir vers `recetté` — précisément le défaut trouvé ce
matin. Contrôle fait : **29 lignes `⟂` sont devenues `recetté`**, toutes dans
`onboarding-audit-welcome`, et toutes sur **#2064 (5) · #2065 (13) · #2066 (11)**.

**Les trois sont ceux que j'ai mesurés EN PRODUCTION ce matin** sur
`/settings/profile/audit` : le verdict de contradiction en quatre temps avec sa
provenance « Déduit » (#2064), « MATURITÉ COMMERCIALE 19/21 · 5 axe(s) non
évaluable(s) » avec les cinq NOMMÉS (#2065), et la chaîne à neuf étapes qui
distingue rupture / rien à signaler / non mesuré (#2066). **Les promotions sont
corroborées par une mesure indépendante**, pas seulement par une règle de fusion.
Côté questionnaire : 53 lignes `⟂`, **aucune** promue `recetté`.

---

# Recette du 16/09 après-midi — les points repassés `livré` faute de mesure

Prod mesurée : **`3993b432b`** (api ET ia, `environment: production`, lu par
`GET /version` depuis la session du navigateur). Inchangée depuis ce matin :
#2457 n'a pas encore atterri.

⚠️ **Compte de mesure : THALES** (`86589f46-…`), pas DEVOTEAM. Le premier relevé
a été fait sur Devoteam et rendait des zéros partout — dossier maigre (1 166
éléments, 6 437 caractères, ni couverture ni technologies). Les preuves d'origine
citaient THALES ; mesurer ailleurs, c'était mesurer un vide et le prendre pour
une absence.

## Prouvés en production — 8 points passent `recetté`

Écran `/accounts/86589f46-…?tab=overview`, **corpus lu : 1 122 éléments, 5 772
caractères**, `location.href` relu dans la capture et conforme.

| Point | Ce qui a été VU à l'écran |
| --- | --- |
| **#2126.12** — aucun état ne rend un zéro nu | Balayage `/(^\|[\s:(])0($\|[\s%,.\n)])/g` sur tout le texte : **liste VIDE**. Pas un seul zéro isolé. |
| **#2126.5** — état « Donnée non mesurée » distinct | « **non mesuré — date de la dernière synchronisation avec ton CRM** » |
| **#2116.26** — absence d'observation affiche « non mesuré », jamais 0 | même ligne ; et aucun 0 nu à côté |
| **#2117.44** — la fraîcheur distingue une synchro CRM d'une observation | **deux** énoncés distincts sur le même écran : « Analyse actualisée il y a 5 jours » (l'observation) ET « non mesuré — date de la dernière synchronisation avec ton CRM » (la synchro). C'est exactement la distinction demandée. |
| **#2127.4** — ligne de synthèse « recours externe observé » | « Contexte marché → **Recours à des externes → Observé** » |
| **#2116.10** — présence ESN réutilisée, jamais recalculée localement | « **Sociétés de services observées** → ALTEN · Capgemini · Groupe SII » suivi de « **Mémoire locale · lecture incluse** » — la provenance dit que c'est LU, pas recalculé |
| **#2116.11** — technologie réutilisée, jamais recalculée localement | « **Familles d'expertise observées** → Infra / Cloud · Développement », même provenance « Mémoire locale · lecture incluse » |
| **#2122.43** — un axe non mesuré SORT du dénominateur, jamais noté 0 | « 17 /25 · PRUDENT · Score commercial · 74/100 · Fiabilité du dossier · **Axes non détaillés pour cette analyse** ». Les axes non évalués sont NOMMÉS comme tels au lieu d'être comptés 0. ⚠️ Nuance à porter : le libellé dit « non **détaillés** », pas « non **mesurés** » — le comportement est juste, le mot diffère de la règle. |

## Lectures NULLES — 2 points restent `livré`, honnêtement

Écran `/settings/memory`, **corpus lu : 1 643 éléments**, et le registre de
mémoire lu à l'API : `GET /memory/ledger` → **200, 94 lignes**.

- **#1962.9 — type « Hypothèse à vérifier »** : le chemin de rendu FONCTIONNE
  (« Préférence » ×6 et « Fait » ×1 rendus à l'écran depuis le même code), et le
  libellé existe (`fr/knowledge.json:132`, consommé par `MemoryFactRow.tsx` et
  offert par `chat/view/SaveReply.tsx`). Mais **les 94 mémoires de ce compte ne
  portent que `preference` et `fact`** : aucune de nature `hypothesis`. On ne
  peut pas voir à l'écran ce que la donnée ne contient pas. Reste `livré`.
- **#1962.21 — promotion : source conservée** : `Source :` → **0 occurrence**, et
  `origin` vaut `manual` sur les 94 lignes. Aucune mémoire promue sur ce compte.
  Reste `livré`.

⚠️ **Le registre pointait le mauvais écran** pour #1962.9 : il disait
`/settings/memory`, et la clé i18n vit dans `knowledge.json`. Vérification faite,
c'est bien la mémoire qui la rend — `knowledge` est seulement l'espace de noms.
`/settings/knowledge` a été mesuré au passage (3 097 éléments) : il ne porte pas
ce libellé, il liste des documents (`objection_answer`, `winning_angle`).

**Ce qu'il faudrait pour les lever** : une mémoire de nature `hypothesis` et une
mémoire promue depuis une source, sur un compte de test. C'est un semis, pas un
correctif — à faire côté démo ou sur un compte dédié.

## Suite — le dossier THALES, section par section

Toutes les mesures relues avec `location.href` DANS la capture, et `corpusLu`
porté. ⚠️ Leçon du jour : `document.body.innerText` a rendu **1 327 caractères**
sur une section qui en portait 2 548 — il était lu avant la fin du rendu. On
mesure `document.querySelector('main').innerText`, pas `body`, et on recompte.

### `?tab=proofs` — « Preuves & REX » · corpus 262 éléments, 2 548 caractères

Les quatre champs sont RENDUS, chacun avec sa valeur honnête :

```
Le problème traité : Non mesuré
Le résultat obtenu : Non mesuré
L'expertise mobilisée : Non mesuré
Citation : Autorisation non tranchée
Source : Non mesuré
Date : 11/09/2026
```

→ **#2124.49 · #2124.50 · #2124.51 · #2124.53 passent `recetté`.** La demande
était « la preuve affiche le problème / le résultat / l'expertise / la source » :
le champ est là, nommé, avec « Non mesuré » comme valeur. C'est exactement ce que
la doctrine exige — le champ ne disparaît pas et ne vaut pas 0.

⚠️ **Trouvé au passage, à nettoyer** : une preuve de TEST vit dans le compte de
production — « RECETTE 1612 TEMOIN — une seule techno commune : la mention ne
doit PAS apparaitre. » Elle date du 11/09 et n'a jamais été retirée après sa
recette. Sans danger, mais visible par quiconque ouvre ce dossier.

### `?tab=missions` — corpus 209 éléments

« Aucune mission sur ce compte. **Rien n'a encore été délivré ici. Ce n'est pas
« zéro euro » : il n'y a simplement rien à lire tant qu'une mission n'a pas
démarré.** » — l'état vide applique la règle dans son texte même.

→ **#2124.22** (le résumé affiche la marge) : **lecture NULLE**, pas de mission
donc pas de résumé. Reste `livré`.

### `?tab=organigramme` — corpus 602 éléments, 6 681 caractères

« 2 027 **découverts** · **non mesuré — aucune analyse ne mesure encore le
rattachement** · rattachés · 50 enrichis IA · 0 liens vérifiés · 11 liens
probables · 8 zones à couvrir »

→ **#2116.26 passe `recetté`.**

⚠️ Le `0` de « liens vérifiés » a été examiné et **n'est pas une violation** :
la question de la doctrine est _« si cette valeur est absente, 0 est-il VRAI ? »_
— un lien vérifié est un événement compté, et « aucun lien n'a été vérifié » est
vrai. Un compteur de zéros nus ne peut pas trancher ça tout seul ; c'est
pourquoi il ne suffit jamais.

### `?tab=coverage` — corpus 390 éléments, 3 854 caractères

« **Les dix axes à tenir** » rend **exactement dix entrées distinctes**, chacune
avec son verdict :

| # | Axe | Verdict |
| --- | --- | --- |
| 1 | Chaque niveau hiérarchique | Tenu |
| 2 | Chaque famille métier visée | Tenu |
| 3 | Entités | Manque |
| 4 | Sponsor | Manque |
| 5 | Décideur économique | Tenu |
| 6 | Référent technique | Tenu |
| 7 | Achats | Tenu |
| 8 | Relais opérationnel | Tenu |
| 9 | Pas de mono-contact | Tenu |
| 10 | Prochaine action posée | **Non mesuré** |

→ **#2121.48 passe `recetté`.** Le dixième axe dit « Non mesuré », pas 0.
Le bloc porte aussi sa méthode — « Calculé uniquement à partir des contacts
existants — aucune donnée inventée » — et « Un rôle critique vacant empêche le
100 % », ce qui est la règle du dénominateur rendue lisible.

## Bilan de cette passe

**14 points passent `recetté`**, prouvés en production au SHA `3993b432b` :
#1962.27 · #2116.10 · #2116.11 · #2116.26 · #2117.44 · #2121.48 · #2122.43 ·
#2124.49 · #2124.50 · #2124.51 · #2124.53 · #2126.5 · #2126.12 · #2127.4

**3 lectures NULLES**, qui restent `livré` honnêtement : #1962.9 · #1962.21 ·
#2124.22 — la donnée nécessaire n'existe pas sur ce compte.

**Reste à mesurer** : #2119.2 (Opportunités) · #2061.1/.23/.24 et #2071.13
(audit commercial) · #2013.3 et #2013.11 (parcours de reconfiguration).

### `?tab=veille` — « Opportunités » · corpus 1 328 éléments, 17 137 caractères

**#2119.2 — « séparer l'affichage en quatre niveaux de vérité »** : l'écran rend
**TROIS** sous-onglets — « Signaux · Projets · Besoins confirmés ». Les libellés
attendus par le point (« Signal actuel », « Projet plausible ») ne sont pas à
l'écran : 0 occurrence de chacun.

→ **NON RECETTABLE.** Le point reste dans son état : ce qui est livré est une
séparation en trois, pas en quatre. C'est un écart réel, pas un défaut de mesure.

### Deux trouvailles de cette passe, hors registre

**1. Des données de RECETTE vivent dans le compte de production.** Deux au moins,
visibles par quiconque ouvre le dossier THALES :

- `?tab=proofs` → « **RECETTE 1612 TEMOIN** — une seule techno commune : la
  mention ne doit PAS apparaitre. » (11/09)
- `?tab=veille` → « **RECETTE 1889 - Reprise du socle data** » en titre de projet

Elles ont servi à prouver un comportement, puis personne ne les a retirées. Sans
danger, mais elles salissent le dossier de démonstration.

**2. Trois zéros nus sur `?tab=veille`, dont deux légitimes et un à regarder.**
La question de la doctrine est _« si cette valeur est absente, 0 est-il VRAI ? »_ :

- « En veille **(0)** » et « Écartées **(0)** » — ce sont des COMPTES de seaux.
  Aucun élément dans le seau : **0 est vrai**. Légitimes.
- « Enjeux & stack → Stack et douleurs → **0** » — ⚠️ ambigu. Si cela veut dire
  « aucune douleur identifiée », 0 est vrai ; si cela veut dire « la stack n'a
  pas été analysée », l'affichage juste est « non mesuré ». **À trancher en
  lisant la dérivation**, pas à l'œil.

---

# La vague 12 bis est DÉPLOYÉE — recette du 16/09 à 10 h 17

`GET /version` depuis la session du navigateur : **api = `408cdd9d7`**
(`environment: production`, horodatage `2026-09-16T10:17:02Z`). L'IA sert encore
`3993b432b` — les deux services se déploient séparément, ⚠️ **ne pas confondre les
deux commits** quand on écrit une preuve.

## La portée que le diff impose — 4 écrans, pas 59

`tools/recette/portee.py "03625739f..408cdd9d7"` annonce **59 écrans** et un
régime CIBLÉ. ⚠️ **Le chiffre est un MAJORANT et il induit en erreur** : il remonte
le graphe d'IMPORTS, et cinquante et un de ces écrans sont atteints seulement
parce qu'ils importent `features/onboarding/api.ts` — un fichier qui **n'a pas
changé d'une ligne** dans ce diff (`git diff --stat` sur lui : vide).

Les fichiers web réellement modifiés, hors tests et gardes, sont **dix-huit**, et
ils tiennent dans **quatre écrans** :

| Écran | Ce qui a bougé |
| --- | --- |
| `/settings/profile/audit` | `AuditUnestablished.tsx`, `build-audit.ts`, `CommercialAuditScreen.tsx`, i18n |
| `/chat` | `ContextDisclosure.tsx`, `PendingActions.tsx`, `laura/bubble/ephemeral-thread.ts` |
| `/actions/sequences` | `campaign-audience.ts`, `campaign-prefill.ts`, `useCampaignAudience.ts`, `CreateSequenceDialog.tsx`, `SequencesPage.tsx` |
| onboarding | `lib/question-consequences.ts` |

**Leçon à garder** : lire la liste des fichiers CHANGÉS avant de croire le compte
d'écrans — sinon on annonce un balayage de 59 écrans pour un diff qui en touche 4.

## `/settings/profile/audit` — corpus 453 éléments, 11 765 caractères, 0 erreur

La doctrine est écrite À L'ÉCRAN, en sous-titre :

> « Chaque ligne vient de tes réponses. **Ce qui n'a pas pu être établi est
> nommé, jamais compté pour zéro.** »

Et elle est tenue dans les faits : `zerosNus` → **liste VIDE**. Les axes non
évaluables portent « **Inconnu** » — « Preuves Inconnu », « Qualification client
Inconnu », « Sécurisation candidat Inconnu » — à côté de « Clarté de l'offre
Mature », « Ciblage Structuré ». Aucun n'est noté 0.

→ **#2071.13 passe `recetté`** (« conclusion utile en moins de dix secondes ») :
le relevé rend exactement la forme attendue — un titre (`Voici ce que Bellum a
compris de ton activité`), un sous-titre, **cinq blocs** (Posture de vente ·
Type d'ESN · Comptes visés · Ce qui freine le plus · Cadence recommandée) et
**trois actions** (Corriger une information · Demander à Laura · Voir les sources
et les versions). Aucun paragraphe de remplissage.

L'écran porte aussi sa version et sa validation : « Version 26 · Actualisé le 15
septembre 2026 · **Validé le 16 septembre 2026 par Louis** ».

## `/chat` — corpus 554 éléments, 3 383 caractères, 0 erreur

Rend normalement : `h1` = « Laura », la liste des conversations (« Par date » /
« Par compte »), les fils datés avec leur ouvreur. **Aucun zéro nu.** Pas de
régression après le déploiement.

**#1912.13** (« action gratuite = Inclus ») : `Inclus` → 0 occurrence. **Lecture
NULLE, pas un rouge** — le libellé vit sur le lanceur d'action du composer, qui
ne s'affiche pas sur la liste des conversations. À mesurer dans un fil ouvert.

## `/actions/sequences` — corpus 132 éléments, 1 553 caractères, 0 erreur

C'est l'écran le plus modifié du diff (5 fichiers : `campaign-audience.ts`,
`campaign-prefill.ts`, `useCampaignAudience.ts`, `CreateSequenceDialog.tsx`,
`SequencesPage.tsx`). Il rend normalement, et sa copie porte la doctrine :

> « E-mail — Ta messagerie est connectée. **Le message est PRÉPARÉ et daté —
> l'envoi reste ton geste.** »

Les deux zéros (`Réponses reçues 0`, `Bloquées 0`) sont **légitimes** : ce sont
des comptes d'événements, et « aucune réponse reçue » est vrai.

⚠️ **Défaut trouvé : l'écran ne porte AUCUN `<h1>`** (`h1: []`). C'est la même
famille que **#2456** (`/discover` sans `<h1>`, ouvert ce matin). Deux écrans sur
deux mesurés au hasard : le défaut est probablement large, et aucune garde ne le
tient. À rattacher à #2456 plutôt que d'ouvrir un doublon.

## Bilan du balayage post-déploiement

Les **4 écrans de la portée réelle** sont sains : `/settings/profile/audit`,
`/chat`, `/actions/sequences`, et l'onboarding (une seule dérivation touchée,
`question-consequences.ts`). **Zéro régression.** Un point passe `recetté`
(#2071.13), deux lectures nulles honnêtes (#1912.13, et l'onboarding qui demande
un espace neuf), un défaut rattaché à #2456.
