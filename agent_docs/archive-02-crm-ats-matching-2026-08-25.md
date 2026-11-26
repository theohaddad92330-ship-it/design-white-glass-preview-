# Archive 02 — CRM, ATS, matching, missions, ERP (itération 3)

> Source : `BELLUMAI_ITERATION_3_02_CRM_ATS_MATCHING_MISSIONS_ERP_2026-08-24.zip`
> (661 325 octets, 23 fichiers, 21 au manifeste).
> Croisée le 25/08/2026, après les archives `00` (gouvernance), `08` (miroir de
> code) et `01` (architecture / UX).

---

## 1. Ce que l'archive contient, et ce qu'elle n'est pas

Elle porte **les PDF 2, 3, 4 et 5** — quatre chantiers clos entre le 19 et le
21/08 — plus neuf miroirs de trackers du dépôt et trois inventaires de code.

Elle n'apporte donc **aucune spécification neuve**. Sa valeur est ailleurs, et
c'est la même que pour l'archive `08` : elle permet de vérifier ce que les
trackers ont dit, contre la source qui les a produits. C'est ce croisement qui a
donné sept comptes faux la veille.

### Intégrité et dérive — mesurées, pas supposées

| Contrôle                                                | Résultat                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Les 21 fichiers du manifeste, SHA-256 recalculé         | **21 intègres**, zéro écart                                                  |
| Fichiers sur disque hors manifeste                      | 2 — le manifeste `.csv` et son `.md` (un manifeste ne se liste pas lui-même) |
| Les 9 miroirs de trackers vs `agent_docs/`              | **9 identiques**, zéro divergence                                            |
| Les 73 routes web de l'archive vs aujourd'hui           | **73 / 73**, ensembles égaux                                                 |
| Les 100 modules d'API de l'archive vs aujourd'hui       | **100 présents**, aucun disparu                                              |
| Les 14 chemins de code cités dans l'inventaire matching | **14 ouvrables**                                                             |
| Les 24 tickets `BEL-*` des quatre sources               | **24 cités** dans `agent_docs/`                                              |

Aucune dérive. C'est un résultat, pas une absence de résultat : il veut dire que
les quatre trackers décrivent encore le dépôt qu'ils décrivaient.

---

## 2. Les quatre résolutions du README, vérifiées une par une

L'archive impose quatre résolutions. Trois se vérifient par le code, la
quatrième par le vocabulaire.

| Résolution                                                   | Verdict                 | Preuve                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| « Project prévaut sur Besoin/Opportunity dans la narration » | **TENUE**               | Les 38 occurrences de « opportunité » dans l'interface FR relèvent toutes de deux sens LÉGITIMES et distincts du pivot : le SIGNAL détecté (`projects.json:252`, « 193 opportunités détectées ») et l'objet propre du CRM (`projects.json:315`, « une opportunité a été créée » chez le fournisseur). Le pipe, lui, dit « Projets ». |
| « Le secteur projet/mission complète le secteur compte »     | **TENUE — et branchée** | `matching.service.ts:314` lit `o.application_sector_codes AS project_sectors`. ⚠️ Jusqu'au 25/08 au matin cette colonne était **lue ici et écrite par rien** : c'est le chemin mort que l'archive `00` a réparé. La résolution était donc vraie sur le papier et fausse dans les faits, la veille.                                   |
| « Invoice readiness ne signifie pas facture légale »         | **TENUE**               | `missions.json:118` : « Bellum n'émet rien : tu enregistres qu'une facture est partie ailleurs », et le libellé du bouton est « Marqué comme facturé **ailleurs** ». ⚠️ Ma première recherche (« facture légale », « n'émet pas ») n'a rien rendu et j'ai failli conclure au trou — la nuance était là, sous une autre formulation.  |
| « Coexistence HubSpot/Boond avant remplacement »             | **TENUE**               | Aucun écran ne promet de remplacer un CRM ou un ATS. La seule phrase de « remplacement » vit sur la grille tarifaire du site et vise les outils DISPERSÉS de prospection, dont « export CRM » est cité comme l'un d'eux.                                                                                                             |

---

## 3. Ce que le croisement a trouvé, et que l'archive ne demandait pas

### 3.1 Le refus le plus répété du produit n'était pas au registre de doctrine

`doctrine-registry.ts` — livré la veille, 25 contradictions — **n'en portait
aucune sur la probabilité**, alors que :

- `CLAUDE.md` compte **six refus** entre le 16 et le 23/08 (D10 du PDF 1, §7.7
  du PDF 2, §8.1 du PDF 4, le prévisionnel pondéré du PDF 5, le score de fit sur
  5 du tome 5, le score d'accessibilité du tome 1) ;
- la source le **redemande nommément** : `pdf2.md:436` ouvre une section « 7.7
  Le score de chance de closing », et `pdf2.md:959` tranche en D14 « oui, avec
  ses axes, jamais un nombre seul ».

Un registre de contradictions qui omet la contradiction la plus vive n'est pas un
registre, c'est un florilège. **`c26_probabilite` est ajoutée** — en FIN de liste
(GA-08), déclarée `held` et non `guarded`, avec l'écart qui dit pourquoi aucune
garde n'est possible : il faudrait reconnaître une SÉMANTIQUE dans un nombre, et
« 0,72 » ne dit pas de lui-même s'il est une part ou une chance. Ce qui est
réellement tenu et testé, c'est la FORME.

### 3.2 Une échéance réglementaire que le refus sur la facturation ignorait

`pdf5.md:687` (décision D26) date l'obligation française de **réception** de la
facture électronique au **01/09/2026** — sept jours après cet arbitrage.

Elle **ne renverse pas** `c17_facturation` : elle ne s'impose pas à Bellum, qui
n'émet rien, mais aux ESN clientes, qui passeront par une plateforme agréée. Le
refus tient. Mais un refus qui ignore une échéance à sept jours se relit dans six
mois comme un oubli, et c'est ainsi qu'on rouvre un arbitrage déjà tranché. La
date est donc INSCRITE dans l'écart de `c17`, avec ce qu'elle implique : si un
client demande demain que l'export « prêt à facturer » alimente sa plateforme
agréée, c'est un CONNECTEUR, pas une émission de facture — et ça ne renverse
toujours pas `c17`.

---

## 4. Le vrai résultat : un seul mécanisme, quatre trackers

Quatre lecteurs indépendants ont relu les quatre sources contre les quatre
trackers, avec la consigne **inversée** — « trouve ce que la source demande et
que le tracker ne mentionne NULLE PART ». Ils ne se connaissaient pas. Ils ont
convergé sur la même phrase, que le quatrième formule le mieux :

> « Ce qu'il abandonne systématiquement, c'est la **troisième colonne** des
> tableaux : garde-fous, seuils cibles, conditions d'entrée, propositions
> pré-cochées et critères d'acceptation des tickets. »

C'est exactement le mécanisme n°1 déjà nommé la veille dans la mémoire
`tracker-counts-are-arguments` — « résumer un tableau et jeter ses colonnes ».
L'archive 02 en donne la mesure : **environ 120 exigences** perdues de cette
façon sur quatre documents, réparties en six familles.

| Famille perdue                  | Ce que c'est                                                 | Exemple mesuré                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Garde-fous d'automatisation** | La colonne qui dit ce que l'automatisation NE fait pas       | Les 10 automatisations du PDF 3 portent chacune leur niveau N1-N6 et son garde-fou (« 1 relance », « pas de push automatique », « 1 demande par an ») — seul le N3 de TAL-01 est repris    |
| **Seuils cibles**               | Les valeurs chiffrées attendues                              | Les 13 KPI du PDF 2 portent un seuil (`< 5 j`, `0`, `> 80 %`) ; aucun n'est dans le tracker                                                                                                |
| **Conditions d'entrée**         | Ce qui fait entrer un objet dans un état                     | Les 11 phases du PDF 2 (« À réactiver = en veille > 60 jours OU perdu avec motif **non bloquant** » — ce qui suppose un attribut `bloquant` sur le catalogue des motifs, qui n'existe pas) |
| **États d'interface**           | `loading` / `empty` / `partial` / `no_integration` par écran | Les trois PDF 3, 4 et 5 en posent pour chaque ticket P0 ; zéro occurrence dans les trois trackers                                                                                          |
| **Critères d'acceptation**      | Ce qui prouve qu'un ticket est fini                          | « chaque fiche courte porte **3 preuves** » (BEL-MTC-302), « le document ne contient **aucune donnée d'un autre candidat** et porte la **version des poids** » (BEL-MTC-303)               |
| **Dépendances de tickets**      | Ce qu'il faut avant                                          | `BEL-MTC-301` dépend de `BEL-ARCH-004`, `BEL-CRM-103` de `BEL-ARCH-002`, `BEL-ATS-204` de `BEL-CRM-105` — aucune n'est tracée                                                              |

**Pourquoi ça compte, et ce que ça n'est pas.** Ces exigences sont absentes des
TRACKERS ; beaucoup sont probablement présentes dans le CODE — la colonne
« garde-fou » d'une automatisation décrit souvent ce que le service fait déjà.
Ce qui est perdu, c'est la capacité de le VÉRIFIER : personne ne peut relire
« TAL-04 : 1 relance » s'il n'est écrit nulle part. Un tracker qui garde la loi
et jette ses conditions d'application transforme un document vérifiable en
souvenir.

⚠️ **Fiabilité des quatre lectures.** Huit affirmations ont été revérifiées à la
main : **sept confirmées, une réfutée** (voir §7). Les lignes non revérifiées
sont donc données pour ce qu'elles sont — un signalement à contrôler, pas un
verdict.

---

## 5. Les cinq comptes faux corrigés (et le sixième, dans la source)

Le croisement de la veille en avait trouvé sept. Celui-ci en ajoute cinq, tous
recomptés depuis la source par script avant correction.

| Tracker                                 | Annonçait                                                      | La source dit                                                                                                                                      | Corrigé         |
| --------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `pdf2-crm-interne` §15                  | « Les **16** cas limites »                                     | **15** (comptés ligne à ligne)                                                                                                                     | ✅              |
| `pdf2-crm-interne` item 60              | « catalogue de **6** motifs »                                  | **7**, dont « autre » à texte libre OBLIGATOIRE — l'obligation n'était nulle part                                                                  | ✅              |
| `pdf3-ats-talent-vivier` item 97        | « **Dix-sept** filtres »                                       | **16**                                                                                                                                             | ✅              |
| `pdf3-ats-talent-vivier` §14-15         | « les **six** décisions »                                      | **7** dans son propre tableau                                                                                                                      | ✅              |
| `pdf5-missions-cra` §0                  | « renumérotées **D31 à D35** »                                 | son tableau va jusqu'à **D36**                                                                                                                     | ✅              |
| `pdf4-matching-cv-client` §0            | « **chacun** a été revérifié ; **sept** se sont révélés faux » | la source ne porte que **six** marqueurs `[Confirmé]` — on ne peut pas en infirmer sept, et le marqueur des obligations AI Act n'est pas revérifié | ✅ (note datée) |
| `pdf4-matching-cv-client` items 108-111 | quatre renvois « → lot E / C / D / K »                         | décalés d'un cran contre sa propre table : F / D / E / L                                                                                           | ✅              |

**Un sixième compte faux vit dans la SOURCE elle-même**, pas dans un tracker :
`pdf4.md:559` renvoie aux « 6 tests nommés au §17.1 », et **il n'existe aucun
§17.1** — le §17 enchaîne directement sur les tickets. Les six tests existent
bien, dans le bloc Prompt (l.609-614). Renvoi mort dans le document d'origine.

---

## 6. Trois arbitrages qui n'avaient jamais été écrits

### 6.1 Une disponibilité se revalide à 60 jours, et la source dit les deux

`pdf3.md:40` écrit « un freelance dont la dispo date de **90 jours** est marqué
`à revalider` ». `pdf3.md:220`, dans le même document, écrit « au-delà de
**60 jours** : `à revalider` ». Le code applique **60**
(`matching/pushable.ts:54`, `AVAILABILITY_REVALIDATION_DAYS = 60`) en citant
« §3.3 » — c'est-à-dire le PDF 4, pas le PDF 3.

L'arbitrage a donc eu lieu, et il est juste : **60 est le choix strict**, et sur
une donnée qu'on envoie à un client, revalider trop tôt coûte un appel quand
revalider trop tard coûte une crédibilité. Mais il n'était écrit nulle part, si
bien que quiconque relit `pdf3.md:40` « corrigera » vers 90. **60 confirmé et
inscrit.**

### 6.2 L'AI Act s'applique depuis le 02/08/2026, et le dépôt ne le datait pas

`pdf3.md:21` : « le tri, le classement et l'évaluation de candidats relèvent de
l'**Annexe III** de l'EU AI Act. Transparence et **droit à l'explication
applicables depuis le 02/08/2026**. »

Le dépôt a livré les trois conséquences (aucune compétence sans source, aucune
détection certaine sans preuve, journalisation) et le bandeau de transparence.
Ce qui manquait est la DATE et le mot « droit à l'explication » — or c'est ce
qui distingue une bonne pratique d'une obligation en vigueur. Même famille que
l'échéance Factur-X du §3.2 : un chantier qui refuse ou reporte quelque chose
doit montrer que l'échéance était connue.

⚠️ Cette date vient de la source, marquée `[Confirmé — benchmark]` par son
auteur. Elle n'a **pas** été revérifiée contre le texte du règlement, et le
tracker du PDF 4 ne l'avait pas revérifiée non plus. À confirmer avant d'en
faire un argument devant un client.

### 6.3 Les scores de mission ne portent pas les axes que la source demande

`pdf5.md:178` demande **7 axes de risque** : satisfaction client · satisfaction
consultant · CRA en retard · feedback négatif écrit · baisse de charge déclarée ·
fin proche sans plan · changement d'interlocuteur.

Le code (`packages/contracts/src/schemas/mission-scores.ts:24`) en porte **5**,
et ce ne sont pas les mêmes : `renewal` · `timesheets` · `margin` · `payment` ·
`concentration`. Deux se correspondent (CRA en retard ≈ `timesheets`, fin proche
≈ `renewal`) ; les **cinq autres de la source sont absents** et **trois du code
sont absents de la source**.

Ce n'est pas un oubli, c'est un choix — et un bon : la satisfaction n'est
collectée nulle part, le feedback écrit n'est pas analysé, la baisse de charge
n'est pas déclarée. Construire un score de risque sur des axes non mesurables
aurait produit exactement le « non mesuré compté comme zéro » que le produit
s'interdit. Mais le tracker du PDF 5 **dit les deux choses sans les
réconcilier** : son item 69-70 écrit « Scores de risque (7 axes) … ABSENT »
pendant que son lot I écrit « livré — 5 axes de risque, 4 d'opportunité ». Un
lecteur prend l'une ou l'autre.

**Arbitrage inscrit** : les axes du code sont les bons, parce qu'ils sont les
seuls mesurables. Les cinq axes de la source restent dus **le jour où leur
donnée existera** — et deux d'entre eux (les satisfactions) supposent un
formulaire que le produit ne collecte pas et n'a pas décidé de collecter.

---

## 7. L'inventaire complet — rien ne disparaît

Ce que les quatre lectures ont trouvé, intégralement. **Aucune de ces lignes
n'est un ticket ouvert** : ce sont des exigences de la source absentes du
tracker. Beaucoup sont probablement livrées dans le code ; ce qui manque est la
trace qui permettrait de le savoir.

**Colonne « V »** : `✓` = revérifié à la main dans cette session ; `✗` = réfuté ;
_vide_ = signalé par la passe B, **non revérifié** — à contrôler avant d'en
faire un argument.

### 7.1 Ce qui a été revérifié à la main

| V   | Affirmation                                                                        | Résultat                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✗   | « La garde GA-06 interdit `address` sans réserve, elle contredit l'axe 7 (zones) » | **RÉFUTÉ.** `protected-criteria.spec.ts:74` porte la réserve en toutes lettres : « `address` est interdite au-delà du code postal : une zone de mobilité est un… ». Aucune contradiction. |
| ✓   | PDF 4 : « Les 10 edge cases · ABSENT »                                             | Confirmé faux dans les DEUX sens — 5 livrés, 5 absents. Statués au §11 du tracker PDF 4.                                                                                                  |
| ✓   | PDF 4 : « sept marqueurs se sont révélés faux »                                    | Confirmé : la source en porte 6.                                                                                                                                                          |
| ✓   | PDF 4 : quatre renvois ticket → lot décalés                                        | Confirmé et corrigé (F / D / E / L).                                                                                                                                                      |
| ✓   | PDF 3 : contradiction 90 j / 60 j dans la source                                   | Confirmée ; le code applique 60 (`pushable.ts:54`). Arbitrage inscrit au §6.1.                                                                                                            |
| ✓   | PDF 3 : « Dix-sept filtres »                                                       | Confirmé : 16 dans la source.                                                                                                                                                             |
| ✓   | PDF 3 : « les six décisions »                                                      | Confirmé : 7 dans son propre tableau.                                                                                                                                                     |
| ✓   | PDF 5 : les axes de risque divergent                                               | Confirmé, et plus profond que signalé — ce ne sont pas 3 axes perdus mais **deux jeux différents**. §6.3.                                                                                 |
| ✓   | PDF 2 : « catalogue de 6 motifs » / « 16 cas limites »                             | Confirmés : 7 motifs, 15 cas.                                                                                                                                                             |

**Sept confirmations, une réfutation.** C'est le taux à garder en tête en lisant
ce qui suit.

### 7.2 PDF 2 — CRM interne (non revérifié, 40 lignes)

Panel rattaché à l'entité · 5 des 15 colonnes masquées par défaut et
`role_qualified` · seuils de fraîcheur du dossier (frais < 30 j · vieillissant
30-90 j · périmé > 90 j) · `empty_true` doit NOMMER le filtre le plus restrictif
et proposer de l'assouplir · « Prioriser » écrit `action_plan_item` +
`watchlist_rule` · zones blanches de l'onglet Couverture · contrefactuels de
l'onglet Évaluation · confiance d'un projet qui DÉCROÎT avec l'âge · preuves
classées par force et portant leur niveau d'anonymisation autorisé · notification
de fin B1 avec le nombre d'éléments · crédits ajustés sur un dossier `partial` ·
cible 3-6 min · KPI « taux de faux positifs de Découvrir » · badge de validité
d'e-mail · accès sous PALIER (`needs`, `sequences`) · KPI contactabilité et coût
par contact contactable · un besoin à TJM cible PROPOSE un montant, ne l'écrit
jamais seul · source 4 « plusieurs offres similaires sur 6 semaines » · source 5
« contexte uniquement, jamais de compétences » · `headcount` entier ≥ 1 ·
`contract_kind` obligatoire avec défaut `inconnu` · conditions d'entrée des 11
phases (dont l'attribut **bloquant / non bloquant** sur les motifs de perte) ·
dépôt « Profils présentés » : ≤ 5 profils, aucun déjà refusé chez ce client,
relances J+3 et J+7 · dépôts Signé / Perdu / Dormant (bon de commande,
onboarding, prévenir le consultant, TJM vendu, contact facturation, REX de perte,
relance à 6 mois, date de revue) · propositions du kanban Besoins (DC ciblés,
brief de soutenance, « le besoin est-il toujours ouvert ») · franchissements de
porte dans la timeline · simulation B7 : heures calmes + plafond quotidien + KPI
des écartés · colonne « Angle par défaut » des 7 points de génération · verdict
`à ne pas envoyer` ⇒ aucun texte + interlocuteur alternatif · génération de
message à 0 crédit · témoignages avec accord écrit archivé · colonne Garde-fou
des 12 automatisations CRM · seuils des 13 KPI · tri par deadline par défaut
(BEL-CRM-101) · tests d'isolation inter-espace · 20 cas pour `deriveWorkPhase`,
10 pour `canTransitionGate` · backfill exact et son INTERDIT (« aucune promotion
d'état au-delà ») · motifs par défaut FR+EN · `priority_gate` dans
`demo-coverage` · interdit de fusionner `priority_gate` et `lifecycle_status` ·
états `no_integration` / `approval_required` / `attente_connexion` · dépendance
`BEL-ARCH-002` · âge d'étape affiché · D15 « besoin isolé ⇒ projet implicite
`detected` ».

⚠️ Deux comptes signalés et **non tranchés** : le §7.3 de la source compte 26
lignes de tableau pour 30 champs nommés là où le tracker dit « ~28 » ; et
l'entrée « Les 9 premiers onglets » porte les numéros d'inventaire 36 à 46, soit
onze numéros pour neuf objets.

### 7.3 PDF 3 — ATS, talent, vivier (non revérifié, 40 lignes)

L'écran **CVthèque** (5ᵉ écran du périmètre, jamais inventorié) · droit à
l'explication AI Act et sa date (traité au §6.2) · sous-traitant : coût = TJM
d'achat **+ commission** · rapport par fichier à l'import ZIP · fusion de doublon
avec aperçu champ par champ · colonne « Fiabilité attendue » par détection ·
présentabilité PAR SOURCE devant un client (`mission` = oui avec client
anonymisé, `interview` = oui, `cv` = oui avec réserve) · 4 des 16 colonnes du
vivier masquées par défaut · valeurs de la colonne Source (dont `Boond` et
`cooptation`) · filtre compétence « avec niveau minimum ET source minimale » ·
colonne **années** par compétence · pièces de conformité dans l'onglet Documents
· fenêtres et charge dans Disponibilité & TJM · REX associé à chaque mission ·
notes de soutenance dans Feedbacks · base légale / opt-out / date de collecte
dans Consentement · le drapeau rouge porte MOTIF ET DATE, et passer outre est
journalisé · préférences de mission (taille d'équipe, durée minimale, technos
souhaitées) · bloc SYNTHÈSE 4 lignes éditable · garde « MISSIONS reformulées,
jamais inventées » (distincte de celle sur les compétences) · noms de clients
REMPLACÉS par le secteur, pas seulement retirés · B14 vérifie le consentement
AVANT de réactiver · l'import écrit une ligne `activity` · cible < 24 h CV → fiche
· coût MAXIMUM annoncé avant de lancer · `enrichment_attempt` et provenance
`connector` · KPI contactabilité · KPI positionnement après comparaison · phrase
du pool (« ceux qu'il faut réveiller ») · colonne « Action proposée » des 7
segments · niveau d'autonomie N1-N6 des 10 automatisations · garde-fous TAL-02,
04, 07, 10 · cibles chiffrées (dispo connue > 70 %, prouvées vs déclarées > 60 %,
CV → fiche < 24 h) · états UI des tickets 201 et 202 · « confiance faible sur

> 50 % des champs ⇒ Tout accepter désactivé » · champ sans extrait ⇒ rejeté ET
> RELANCÉ, schéma strict sans texte hors JSON · le studio REFUSE un profil sans
> compétence prouvée et l'explique · les 4 valeurs d'`anonymisation_rule` (dont
> `trigramme`) · les 6 classes des 30 cas d'anonymisation · dépendance
> `BEL-CRM-105`.

⚠️ Deux comptes signalés : « 10 indicateurs au §13.3 » là où le tracker dit
douze ; et « arborescence 15 niveaux » annoncée pour 4 branches dont 3 s'arrêtent
à 11 rubriques — écart **interne à la source**.

### 7.4 PDF 4 — matching et CV client (non revérifié, 17 lignes)

Persona **P4 Manager** (qualité des shortlists) · axe 12 à poids 2 mais
**bloquant si drapeau rouge** · bloc Recommandés trié par pushable et Écartés
avec un compteur PAR MOTIF · états repliés/dépliés des 4 blocs (Non évaluables
DÉPLIÉ — c'est là que vit la règle la plus importante) · cibles de performance
(« Gratuit, ~15 s », vivier de 3 000 profils) · matching inverse : restreindre au
portefeuille ou élargir à l'espace, seuil réglable · cibles de KPI (< 15 jours
fin de mission → repositionnement, < 48 h besoin → shortlist) · comparaison avec
meilleure valeur surlignée et différences en gras · fiche courte portant
**3 preuves** · synthèse DC = titre + **3 compétences les plus fortes** · bandes
de calibration attendues (80-100 → > 50 % d'entretiens, etc.) · « si les courbes
se croisent, l'espace en est informé » · colonne Garde-fou des 8 automatisations
MTC · états `empty` et `partial` du ticket 301 · dépendance `BEL-ARCH-004` ·
`pushableScore` avec 20 cas de test · les six tests nommés T1→T6 · critères
d'acceptation de BEL-MTC-303 (aucune donnée d'un autre candidat, daté, version
des poids).

### 7.5 PDF 5 — missions, CRA, facturation (non revérifié, 30 lignes)

Les 4 filtres abandonnés sur 12 (dont Risque > 60 et BU) · contrôles bloquants
des dépôts (« ≤ 5 profils, aucun refusé chez ce client », « consentement valide,
DC joint ») · relances **J+3 et J+7** sur le positionnement · **REX** client et
consultant, REX de perte, témoignage, repositionnement T-15 · date de revue de la
mise en veille · champ **Cadence de facturation** (obligatoire, défaut mensuelle)
· **satisfaction** client et consultant (0 occurrence dans le tracker) · séquence
mensuelle de run, points J+1 / J+3 / J+30 · historique des scores + plan de
mitigation · avenants et bon de commande dans Documents · colonnes Responsable et
Automatisable des 14 étapes datées · escalade avec proposition d'appel · seuil de
relance paramétrable par espace, maximum 3 en dur · « un message envoyé est
IRRÉVERSIBLE — la modale le dit » · colonnes CRA « Relances 0/3 avec dates » et
« Bloqueur facturation » · drawer des destinataires · « Marquer comme facturé »
irréversible sauf annulation motivée par un admin · colonnes de l'export (entité
juridique, montant HT, référence BC) · coût sous-traitant = TJM d'achat +
**commission** · seuil de marge proposé à < 15 % et l'axe « prolongation sans
revalorisation » · écran Paiements et ses 4 statuts · manager en copie à J+30 +
mention des pénalités légales · ton paramétrable par espace · litige : motif,
montant contesté, date de résolution cible · renouvellements : fin < 90 j,
Feedback client, disponibilité après, CA en jeu sur 6 mois · capacité sur
3 mois glissants PAR EXPERTISE, intercontrat avec ancienneté · permission « voir
le TJM vendu » et écriture ERP « + validation responsable » · 5 des 13 cas
limites sans verdict (dont « consultant sur 2 missions : total ≤ jours ouvrés ») ·
cibles chiffrées des KPI · états UI par colonne · libellés de colonnes
renommables via `pipeline_stage_labels` **sans le dupliquer** · kanban virtualisé
· reculer de Terminée ⇒ **date de fin réelle effacée** · démo : une mission avec
CRA reçu, une sans, une avec écart · dépendances `BEL-ARCH-002` / `-004`.

⚠️ Trois comptes signalés : « les 18 KPI » là où la liste en fait 17 (ou 20 si
les quatre CA comptent séparément) ; « 22 étapes » annoncées par la source pour
14 détaillées ; et « 20 cas de test, un par transition documentée au §3 » alors
que le §3 n'en documente que 12.

---

## 8. Ce qu'on ne promet pas

| Ce qu'on ne fait pas                              | Raison                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Livrer les ~120 exigences du §7                   | Elles ne sont pas un backlog : ce sont des lignes de tracker manquantes, dont une part inconnue est déjà dans le code. Les « livrer » sans les avoir vérifiées une par une produirait exactement le faux inventaire qu'on vient de mesurer. Le travail utile est de les VÉRIFIER, et il se compte en jours. |
| Une garde contre la perte de la troisième colonne | Elle demanderait de reconnaître qu'un tableau de source a une colonne « garde-fou » et de la retrouver dans un tracker en prose. Une garde qui ne sait pas dire NON est pire qu'aucune garde — c'est la leçon de GA-33.                                                                                     |
| Revérifier les 120 lignes dans cette session      | Sept vérifications ont pris le tiers d'un chantier. Les annoncer vérifiées serait mentir sur exactement ce que ce document reproche aux trackers.                                                                                                                                                           |
| Corriger les écarts INTERNES aux sources          | Trois sont relevés (§17.1 inexistant, 22 étapes pour 14, arborescence à 15 niveaux pour 11 rubriques). Ils appartiennent aux documents de Théo ; les « corriger » chez nous ferait diverger notre copie de la sienne.                                                                                       |
| Les cinq axes de risque de la source              | Deux d'entre eux (satisfaction client, satisfaction consultant) supposent un formulaire que le produit ne collecte pas et n'a pas décidé de collecter. §6.3.                                                                                                                                                |

---

## 9. Les 139 exigences, vérifiées DANS LE CODE (25/08/2026, second passage)

Le §7 listait ce que les trackers ne mentionnaient pas, avec l'avertissement que
« beaucoup sont probablement présentes dans le CODE ». Elles l'ont été
vérifiées, une par une, par quatre lectures indépendantes dont la consigne était
inversée : chercher dans `apps/` et `packages/`, jamais dans `agent_docs/`, et
**trois recherches** au minimum avant de conclure à une absence.

| Source                             | LIVRÉ  | PARTIEL | ABSENT | Total   |
| ---------------------------------- | ------ | ------- | ------ | ------- |
| PDF 2 — CRM interne                | 23     | 15      | 6      | 44      |
| PDF 3 — ATS, talent, vivier        | 12     | 17      | 11     | 40      |
| PDF 4 — matching et CV client      | 6      | 10      | 2      | 18      |
| PDF 5 — missions, CRA, facturation | 0      | 22      | 13     | 35      |
| **Total**                          | **41** | **64**  | **32** | **137** |

### Ce que le chiffre dit

**Moins d'un quart est réellement absent**, et la moitié de ces absences est
documentaire (un identifiant de ticket jamais cité, un persona sans objet).
Les lectures l'ont constaté elles-mêmes : huit items du PDF 2 annoncés manquants
existaient sous un autre nom — `qualifie` pour `role_qualified`,
`commercial_status` pour `lifecycle_status`, `awaiting_connection` pour
`attente_connexion`, `need-status.test.ts` pour les vingt cas de
`deriveWorkPhase`, `defence_brief` pour le brief de soutenance.

**Le motif dominant n'est pas l'absence de calcul.** Le quatrième lecteur le
nomme le mieux : _« l'écart dominant, c'est le calcul juste que rien
n'affiche »_. Les 64 PARTIEL sont massivement des règles implémentées, testées,
et dont le résultat n'atteint aucun écran.

### Ce qui a été CORRIGÉ (PR #1075)

Six défauts d'honnêteté, tous vérifiés à la main avant d'être touchés.

| Défaut                                                        | Ce qu'il produisait                                                                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COALESCE(SUM(...), 0)` sur les quatre chiffres d'affaires    | **« Encaissé : 0 € » partout** — `paid_at` est lu ici et par le délai de paiement, et écrit par RIEN. « Nos clients n'ont rien payé » au lieu de « personne n'a enregistré un paiement » |
| `unavailableReason` rendu brut                                | Le mot « unavailable » en anglais au milieu d'un écran français                                                                                                                          |
| `billing_cadence` ignorée par la préparation à la facturation | Une mission au jalon ou au forfait « prête à facturer » **tous les mois**                                                                                                                |
| Le `else` final de `summarizeReadiness`                       | Toute valeur neuve de l'énumération comptée « facturée », sans que rien ne casse                                                                                                         |
| `truncated` calculé, jamais rendu                             | Un journal d'audit tronqué présenté comme complet                                                                                                                                        |
| `reactivate()` sans lecture du consentement                   | Un talent au consentement **expiré** remis dans les profils proposés aux clients                                                                                                         |
| `priority_gate` nulle sur les six dossiers de démo            | Un portefeuille de démonstration où la porte n'a jamais été franchie                                                                                                                     |

### Ce qui a été RÉFUTÉ — quatre alertes sur quatre

Les quatre écarts que les lectures présentaient comme les plus graves sont
tombés à la vérification :

| Alerte                                                         | Réalité                                                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| « Le drapeau rouge annoncé bloquant est traité en `warning` »  | **Arbitrage délibéré, écrit avec sa raison** : « un refus sur le prix en janvier n'interdit pas une proposition en septembre » (`match.ts:132`) |
| « `cv_bulk` est une capacité déclarée présentée comme livrée » | Une garde fige les quatre formats non lisibles, l'API envoie `readable: false`, et l'écran le rend (`ImportWizard.tsx:183`)                     |
| « Les huit gardes de la donnée sont absentes » (tome 2)        | **8/8 présentes**, sous d'autres noms — voir `archive-04` §2                                                                                    |
| « Le barème de 30 points est recopié sans recompter »          | `MAX_SCORE` est **calculé** depuis les tables (`routing.ts:132`)                                                                                |

### Ce qui reste, et pourquoi ce n'est pas un backlog

Les 32 ABSENT restants se rangent en trois familles :

1. **Ce qui exige une décision produit** — la commission d'un sous-traitant
   (elle change la marge de toutes les missions en sous-traitance), l'écran
   Paiements (`paid_at` n'a aucun écrivain : ajouter la lecture sans le geste
   qui écrit reproduirait le défaut qu'on vient de corriger), l'annulation d'un
   « marqué comme facturé ».
2. **Ce qui exige une donnée qu'on ne collecte pas** — la satisfaction client et
   consultant, déjà déclarées non mesurables AVEC leur raison
   (`manager-kpi.ts:553`), et les cibles chiffrées des KPI, qui supposent un
   champ numérique là où le contrat porte une phrase.
3. **Ce qui est de la traçabilité documentaire** — `BEL-ARCH-004` jamais cité,
   le persona P4, les identifiants `TAL-0x`. Aucun effet sur le produit.

**Aucune de ces trente-deux ne s'ouvre en ticket sans une décision.** C'est la
conclusion du second passage, et elle est plus utile que la liste : le travail
restant n'est pas d'écrire du code, c'est de trancher.
