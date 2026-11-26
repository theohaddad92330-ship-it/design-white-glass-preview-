# PDF 4/9 — Matching besoin / consultant et génération de CV client — 20/08/2026

Source : `agent_docs/sources/pdf-4-matching-cv-client-2026-08-20.pdf` (12 pages, ORION, daté du 19/08/2026).
Prérequis déclarés : PDF 1 (socle), PDF 2 (besoins), PDF 3 (compétences et sources) — les trois sont en prod (PR #988, #991, #994).

Périmètre du document : les 12 axes de correspondance, les deux scores, les 6 points d'entrée du matching,
le croisement besoins détectés × vivier, la shortlist, le positionnement, la soutenance, la génération et
l'envoi du CV client, et la conformité EU AI Act appliquée au classement de personnes.

---

## 0. Ce qu'il faut savoir avant de le lire

**Les marqueurs `[Confirmé — repo]` / `[Confirmé — doc]` du PDF 4 ne sont pas fiables.** Comme pour les
trois PDF précédents, ils décrivent un dépôt antérieur.

⚠️ _Recompté le 25/08/2026 en croisant l'archive 02._ La phrase d'origine disait « **chacun** a été
revérifié au code ; **sept** se sont révélés faux ou incomplets ». Les deux moitiés étaient fausses :
la source ne porte que **six** marqueurs `[Confirmé — …]` (lignes 314, 400, 408, 434, 445, 479 de
`pdf4.md`), on ne peut donc pas en infirmer sept. Le tableau ci-dessous compte bien sept lignes, mais
deux ne correspondent à aucun marqueur de la source — et le marqueur réel de la ligne 445
(`[Confirmé — benchmark]`, obligations de l'AI Act) n'y est **pas** revérifié. Ce qui suit reste juste
ligne à ligne ; c'est le « chacun » et le « sept » qui étaient faux.

Cinq affirmations du PDF se sont révélées fausses ou incomplètes, plus deux points relevés au passage :

| Affirmation du PDF                                                             | Réalité vérifiée                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §11.1 « [Confirmé — repo] consultant-brief existe »                            | Vrai à moitié : `consultant-brief.ts:13` existe et `GET /consultants/:id/brief/:opportunityId` le sert, mais **aucun composant web ne l'appelle** — `consultantsApi.brief()` (`apps/web/src/features/consultants/api.ts:217`) n'a aucun appelant. Un brief que personne ne peut ouvrir.         |
| §11.2 « Sans retour à J+3 puis J+7 relance préparée [Confirmé — repo] »        | **FAUX.** Le seul mécanisme sur les positionnements est un balayage **J+14** qui ouvre une intervention interne (`interventions.sweeper.ts:60`, `INTERVENTION_THRESHOLDS.submissionSilenceDays = 14`). Aucune relance J+3 ni J+7 n'existe.                                                      |
| §9.1 « Plafond sans demande explicite 5 profils [Confirmé — doc] »             | **FAUX côté dépôt.** Il n'existe aucun objet shortlist ; `CONSULTANT_PUSH_MAX = 2` borne un autre geste (le push), et `shortlisted` n'est qu'une valeur de `submissions.stage`.                                                                                                                 |
| §12.1 « Pièce jointe le DC réel, jamais un lien [Confirmé — doc] »             | **PARTIEL.** `mailDraftRequestSchema.documentIds` joint un fichier réel, mais il résout des documents de l'espace documentaire connecté (`google.fetchDocumentForAttachment`) ; un DC de `cv_versions` est servi par une route consultants et n'est **pas joignable** par ce chemin.            |
| §14.2 « [Confirmé — doc] chaque refus améliore les règles »                    | **FAUX.** Aucune calibration, aucune pondération d'espace, aucune mesure de taux d'entretiens n'existe.                                                                                                                                                                                         |
| §5.2 N13 « routine T-30 »                                                      | Une routine `mission_ending` J-30 existe (`routine-catalog.ts:176`), mais elle **notifie seulement** — aucun matching inverse, aucun repositionnement proposé. Même famille de faux que le TAL-03 du PDF 3.                                                                                     |
| §13 « GA-06 verrouille l'identité » (affirmé par le tracker PDF 1, repris ici) | **FAUX.** `PROTECTED_CRITERIA` (`apps/api/src/architecture/protected-criteria.spec.ts:48`) contient `birth_date`, `gender`, `nationality`, `photo_url`, `marital_status`, `ethnicity`, `religion` — **ni `full_name`, ni `address`**, alors que le commentaire du fichier affirme le contraire. |

**La leçon du PDF 3 s'applique en plein.** Les trois défauts trouvés en recette live tenaient à une lecture
branchée sur une autre table que l'écriture. Le croisement en a trouvé **trois de plus, tous dans le
matching lui-même** (X1, X2, X3 au §2) — c'est le cœur de ce chantier.

---

## 1. Inventaire

Statuts : `LIVRÉ` · `PARTIEL` · `ABSENT` · `PÉRIMÉ` · `REFUS` · `DÉCISION`.

### §1-2 — Périmètre et les deux scores (p.1)

| #   | Exigence                                                                   | Statut  | Preuve / raison                                                                            |
| --- | -------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 1   | Le matching ne décide jamais : il documente, classe, explique              | LIVRÉ   | `consultant-matching.ts:16-39` — discipline déjà écrite                                    |
| 2   | Score de correspondance 0-100 sur les 12 axes                              | PARTIEL | un score existe (`consultant.ts:305`) mais sur **6** axes (`consultant-matching.ts:58-65`) |
| 3   | Score pushable 0-100 (dispo réelle, TJM, historique, preuve, consentement) | ABSENT  | un seul chiffre + un booléen `blocked`                                                     |
| 4   | Les deux affichés séparément, jamais fondus                                | ABSENT  | il n'y a qu'un score                                                                       |

### §3 — Les 12 axes (p.1-2)

| #    | Exigence                                                                | Statut  | Preuve / raison                                                                                                                                        |
| ---- | ----------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5-16 | Les 12 axes et leurs poids (25/8/10/8/7/5/8/12/4/7/4/2)                 | PARTIEL | 6 axes existent — `stack 35`, `availability 25`, `sector 15`, `zone 10`, `references 10`, `contract 5`. Renvoyé au PDF 4 par le PDF 3 (`pdf3:456-458`) |
| 17   | Poids réglables par espace et mémorisés, total normalisé à 100          | ABSENT  | `CRITERIA` est une constante de module                                                                                                                 |
| 18   | Formule de l'axe 1 (couverture × facteur de niveau)                     | ABSENT  | `scoreStack` compte des recoupements, sans niveau ni source                                                                                            |
| 19   | Adjacence signalée, jamais comptée dans `matched`                       | PARTIEL | `skillEvidence` a un niveau `adjacent` mais il désigne un CONTEXTE proche, pas une compétence voisine                                                  |
| 20   | Barème de disponibilité 100/70/20/0/non calculable                      | PARTIEL | barème existant sur le champ **saisi** (`AVAILABILITY_POINTS`), pas sur la date de démarrage                                                           |
| 21   | Ne jamais confondre « je ne sais pas » avec « non »                     | LIVRÉ   | `consultant-matching.ts:32-37`, `staffing.ts:111`                                                                                                      |
| 22   | Formule pushable 0,5/0,2/0,1/0,1/0,1 − pénalités                        | ABSENT  | —                                                                                                                                                      |
| 23   | Pénalités (consentement, refusé −40, en mission −15, dispo périmée −10) | ABSENT  | `markClientHistory` fournit le drapeau, aucune pénalité chiffrée                                                                                       |

### §4 — Les blocs de résultat (p.2-3)

| #   | Exigence                                                        | Statut  | Preuve / raison                                                                 |
| --- | --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| 24  | Quatre blocs (recommandés / limites / écartés / non évaluables) | ABSENT  | le panneau montre `push` et `ranked`                                            |
| 25  | Liste FERMÉE de 11 codes d'exclusion avec leur nature           | ABSENT  | aucun `EXCLUSION_REASONS` dans le dépôt                                         |
| 26  | Aucun profil écarté sans code de motif                          | ABSENT  | `blocked: boolean` sans motif                                                   |
| 27  | Carte de résultat (2 scores, ✓/✗/~/⚠)                           | PARTIEL | `ConsultantMatchPanel.tsx:119-191` montre raisons, risques et historique client |
| 28  | Questions à valider générées à partir des écarts                | ABSENT  | —                                                                               |
| 29  | Quatre actions (fiche / comparer / CV client / positionner)     | PARTIEL | « Adapter le CV » et « Shortlist » existent, pas « Comparer »                   |

### §5 — Les 6 points d'entrée (p.3-4)

| #     | Exigence                                                     | Statut | Preuve / raison                                          |
| ----- | ------------------------------------------------------------ | ------ | -------------------------------------------------------- |
| 30    | PE1 depuis la ligne de besoin `/projects/needs`              | ABSENT | `OpenNeedsTable.tsx:35-49` n'a pas d'action matching     |
| 31    | PE2 depuis le drawer projet                                  | ABSENT | `ProjectNeedsPanel.tsx` liste les besoins, sans matching |
| 32    | PE3 matching inverse depuis la fiche talent                  | ABSENT | aucune fonction ne part d'un consultant                  |
| 33    | PE4 copilote                                                 | ABSENT | 12 outils déclarés, aucun matching (`chat_tools.py:423`) |
| 34    | PE5 offre détectée → besoin à qualifier                      | ABSENT | les offres restent dans `raw_analysis`                   |
| 35    | PE6 exigences d'un AO, par lot                               | ABSENT | `rfp.ts:89` porte des exigences, jamais un profil requis |
| 36    | Les 5 états du bouton et leurs infobulles                    | ABSENT | —                                                        |
| 37    | Coût 0 crédit                                                | LIVRÉ  | le matching actuel ne débite rien                        |
| 38-41 | Arborescence du matching inverse, routine T-30, KPI de délai | ABSENT | `mission_ending` notifie, ne matche pas                  |

### §6 — Croisement besoins détectés × vivier (p.4-5)

| #   | Exigence                                                      | Statut  | Preuve / raison                                                                                    |
| --- | ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| 42  | La chaîne offre → signal → besoin à qualifier → G3 → matching | PARTIEL | G3 existe (`projects.controller.ts:298`), la chaîne amont non                                      |
| 43  | `source = job_posting` + badge « détecté »                    | PARTIEL | la colonne et le CHECK existent (`1789537604211-NeedFields.ts:60`), **aucun code ne l'écrit** (X9) |
| 44  | Compétences extraites avec provenance et extrait conservé     | ABSENT  | —                                                                                                  |
| 45  | TJM absent, contact absent, chance de closing non mesurable   | LIVRÉ   | arbitrage n°4 du 16/08 : aucune probabilité                                                        |
| 46  | Jamais « qualifié » sans geste humain                         | LIVRÉ   | G3 est une porte humaine                                                                           |
| 47  | Les 6 signaux et ce qu'on n'en tire pas                       | PARTIEL | les signaux se matérialisent en `opportunities kind='signal'` (`projects.service.ts:549`)          |

### §7-8 — Panneau et comparaison (p.5)

| #     | Exigence                                                             | Statut | Preuve / raison                                       |
| ----- | -------------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| 48-49 | Drawer pleine hauteur, URL `?match=` partageable, phrase de synthèse | ABSENT | aucun Sheet du dépôt n'est piloté par un search param |
| 50    | Bandeau de critères éditable en direct, poids mémorisés              | ABSENT | —                                                     |
| 51    | Bandeau de transparence non masquable                                | ABSENT | aucun bandeau « système d'IA » nulle part             |
| 52    | Progression par axe, résultats partiels                              | ABSENT | —                                                     |
| 53-54 | Comparaison 2 à 4 profils + ligne finale de recommandation           | ABSENT | —                                                     |

### §9-10 — Shortlist et positionnement (p.6)

| #     | Exigence                                                                                 | Statut  | Preuve / raison                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 55-58 | Shortlist plafonnée à 5, figée, modifiable par duplication                               | ABSENT  | pas d'objet shortlist                                                                                                         |
| 59    | Enchaînement proposé en cases à cocher                                                   | ABSENT  | —                                                                                                                             |
| 60-61 | Modal de confirmation en trois blocs, point d'attention journalisé                       | ABSENT  | —                                                                                                                             |
| 62    | Écrit submission + cv_version + activity talent ET compte + tâche                        | PARTIEL | `submissions.service.ts:372` écrit une activity **sur le compte seulement** — `activities` n'a pas de colonne consultant (X8) |
| 63    | `prepared → sent` après envoi effectif                                                   | PARTIEL | `SUBMISSION_STAGES` = `shortlisted → submitted → …`, vocabulaire différent, machine fermée                                    |
| 64    | Refusé chez ce client → drapeau + acquittement journalisé ; consentement expiré → REFUSÉ | ABSENT  | `markClientHistory` existe, le refus de positionner non                                                                       |
| 65    | KPI taux d'entretiens par tranche de pushable                                            | ABSENT  | —                                                                                                                             |

### §11 — Soutenance (p.7)

| #     | Exigence                                                                | Statut  | Preuve / raison                                                                                                 |
| ----- | ----------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| 66-67 | Brief 7 blocs, exposé et enrichi des gaps                               | PARTIEL | `consultant-brief.ts` produit 3 blocs (`strengths`, `objections`, `planJ30`) et n'a **aucun appelant web** (X6) |
| 68    | Positif → accepted ; négatif → motif fermé ; J+3/J+7 ; J+14 no_feedback | PARTIEL | motifs fermés livrés (`submission.ts:81`), J+14 livré en intervention, J+3/J+7 ABSENT                           |
| 69    | Feedback consultant en 3 questions → REX                                | PARTIEL | `rex-entry` + `proof.ts:61` existent, sans appelant web                                                         |

### §12 — CV client depuis le matching (p.7)

| #     | Exigence                                                           | Statut   | Preuve / raison                                                                               |
| ----- | ------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| 70    | Cible pré-remplie, non modifiable                                  | ABSENT   | le studio est sur la fiche talent, sans besoin                                                |
| 71-72 | Compétences prouvées pré-cochées, compétences barrées avec mention | PARTIEL  | `cv-studio.service.ts:225` barre déjà avec sa raison, sans lien au matching                   |
| 73-74 | Synthèse orientée besoin, gaps repris mot pour mot                 | PARTIEL  | `deterministicGaps` (`cv-rewrite-guard.ts:62`) calcule des manques, pas ceux du matching      |
| 75    | Anonymisation automatique selon la règle d'espace                  | LIVRÉ    | `cv-anonymisation.ts`, `effectiveAnonymisationRule`                                           |
| 76-77 | Destinataire (contact du besoin → facturation), canal              | PARTIEL  | `project_needs.contact_id` existe (`1789537604211-NeedFields.ts:37`), jamais résolu à l'envoi |
| 78    | Pièce jointe = le DC réel                                          | PARTIEL  | voir §0                                                                                       |
| 79-81 | Corps, `sent`, relances, version exacte conservée                  | PARTIEL  | `cv_versions` est append-only, le reste ABSENT                                                |
| 82    | D21 TJM dans le message                                            | DÉCISION | tranchée : réglable, éteint par défaut                                                        |

### §13 — Conformité EU AI Act (p.7-8)

| #   | Exigence                                              | Statut  | Preuve / raison                                            |
| --- | ----------------------------------------------------- | ------- | ---------------------------------------------------------- |
| 83  | Bandeau de transparence permanent                     | ABSENT  | —                                                          |
| 84  | Droit à l'explication : document exportable           | ABSENT  | raisons et risques s'affichent, rien ne s'exporte          |
| 85  | Supervision humaine, rejet en masse explicite         | PARTIEL | rien n'est automatique aujourd'hui, faute de moteur        |
| 86  | Journalisation critères/poids/profils/scores/décision | ABSENT  | « calcul pur à la demande, rien de persisté » (`pdf2:148`) |
| 87  | Aucun axe ne lit un critère protégé                   | PARTIEL | GA-06 existe mais sans `full_name` ni `address` (X4)       |
| 88  | Reproductibilité                                      | LIVRÉ   | `consultant-matching.spec.ts:169` teste déjà la stabilité  |
| 89  | Test de garde statique écrit AVANT le moteur          | PARTIEL | GA-06 à étendre                                            |

### §14-16 — Calibration, automatisations, permissions (p.8-9)

| #      | Exigence                                                                     | Statut  | Preuve / raison                                                                              |
| ------ | ---------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| 90-95  | Calibration par tranche de pushable, seuil 30, admin, par espace, réversible | ABSENT  | —                                                                                            |
| 96-103 | MTC-01 à MTC-08                                                              | ABSENT  | aucun pré-matching, aucun déclencheur (`consultant-matching` n'a aucun appelant automatique) |
| 104    | Permissions (recruiter/sales + `talent_pool`, `finance:read`, admin)         | PARTIEL | `talent_pool` et `finance:read` existent, les gestes non                                     |
| 105    | Les 10 edge cases                                                            | PARTIEL | **5 livrés, 5 absents** — statués un par un le 25/08, voir le §11 ci-dessous                 |
| 106    | Les 8 KPI                                                                    | ABSENT  | —                                                                                            |

### §17-18 — Tickets et décisions (p.9-12)

| #   | Exigence                                                   | Statut                                                                                                                        |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 107 | BEL-MTC-301 moteur 12 axes (P0)                            | ABSENT → lots A-B                                                                                                             |
| 108 | BEL-MTC-302 shortlist figée (P1)                           | ABSENT → lot F                                                                                                                |
| 109 | BEL-MTC-303 explication exportable (P0)                    | ABSENT → lot D                                                                                                                |
| 110 | BEL-MTC-304 matching inverse (P1)                          | ABSENT → lot E                                                                                                                |
| 111 | BEL-MTC-305 calibration (P2)                               | ABSENT → lot L                                                                                                                |
| 112 | Ordre imposé (garde d'abord)                               | respecté — lot A commence par la garde                                                                                        |
| 113 | Démo : matching non vide, un non évaluable, un déjà refusé | ABSENT → lot L                                                                                                                |
| 114 | Les 4 interdits                                            | appliqués                                                                                                                     |
| 115 | D21 TJM dans le message                                    | DÉCISION tranchée                                                                                                             |
| 116 | D22 seuil de recommandé                                    | tranché sans question : **paramétrable par espace, défaut 60**                                                                |
| 117 | D23 préférences du consultant                              | **PÉRIMÉ** — livré au PDF 3 : `preferenceWarnings` entre en avertissement, jamais en exclusion (`consultant-matching.ts:201`) |
| 118 | D24 le client voit-il le score                             | **REFUS** — le score est interne ; ce qui part au client est le DC et le pitch                                                |
| 119 | D25 vivier externe                                         | **DIFFÉRÉ V3** — même statut que D18 (référentiel partagé)                                                                    |

---

## 2. Ce que le croisement a trouvé et que le PDF ne demandait pas

| #   | Défaut                                                                                                                                            | Preuve                                                                     | Pourquoi c'est grave                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | Le moteur de matching lit `consultants.stack` (texte libre) et **jamais** `consultant_skills` (typé : niveau + source)                            | `consultant-matching.ts:139-160`, `:295-332` vs `talent.service.ts:415`    | C'est exactement le défaut R1 de la recette PDF 3, **non corrigé côté matching**. La table typée porte la distinction prouvé/déclaré que `skillEvidence` re-devine par heuristique de texte, à côté. |
| X2  | Le moteur matche sur `opportunities.label/detail/offer` (texte libre) et **jamais** sur `project_needs.skills[]` (typé, avec `required: boolean`) | `consultants.service.ts:613-637` vs `project-need.entity.ts:33`            | La liste de compétences obligatoires existe, saisie par un recruteur, et le moteur la recompose par extraction de mots-clés. Un besoin bien renseigné ne matche pas mieux qu'un besoin vide.         |
| X3  | Le moteur lit `consultants.availability` (saisi) et **jamais** `deriveStaffing` (dérivé des affectations)                                         | `consultants.service.ts:676` vs `talent.service.ts:477`                    | L'écran Vivier affiche les deux côte à côte. Un consultant dont la mission vient de finir reste `blocked` au matching alors que la ligne d'à côté le montre libre.                                   |
| X4  | GA-06 ne surveille ni `full_name` ni `address`, alors que son commentaire et le tracker PDF 1 affirment le contraire                              | `protected-criteria.spec.ts:48-59`                                         | Une garde qui se croit plus large qu'elle n'est vaut moins qu'aucune garde : personne ne va revérifier.                                                                                              |
| X5  | La porte G4 `submission_send` est déclarée au catalogue et n'a **aucun appelant**                                                                 | `decision-gate.ts:27-44` vs `submissions.service.ts`                       | Positionner un profil ne journalise rien. C'est le geste que l'AI Act demande de tracer.                                                                                                             |
| X6  | `consultantsApi.brief()` est déclaré côté web et n'a aucun appelant                                                                               | `apps/web/src/features/consultants/api.ts:217`                             | Le brief de soutenance est produit par le serveur et invisible.                                                                                                                                      |
| X8  | `activities` n'a pas de colonne consultant                                                                                                        | `activity.entity.ts:11-74`                                                 | Le §10 N9 demande une activity sur le talent ET sur le compte ; seul le compte est écrit.                                                                                                            |
| X9  | `createProjectNeedSchema` ne porte ni `source` ni `provenance`, alors que la colonne existe avec `job_posting` dans son CHECK                     | `project.ts:545-558` vs `1789537604211-NeedFields.ts:60`                   | Une colonne écrite par personne — le badge « détecté » du §6.2 ne pourrait rien afficher.                                                                                                            |
| X10 | Les montants du vivier sont masqués par un spread ad hoc dans deux services au lieu d'appeler `redactFinance`                                     | `talent.service.ts:480`, `consultants.service.ts:684` vs `staffing.ts:210` | Deux implémentations de la même règle ; la troisième dérivera.                                                                                                                                       |

X7 (`CapabilityBanner` sans consommateur) est connu et assumé par le socle — non repris ici.

---

## 3. Lots d'implémentation

| Lot | Contenu                                                                                                                                                                                                            | Dépend de |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| A   | Garde anti-discrimination étendue (`RANKING_CORES`, + `full_name`/`address`) · contrat `match.ts` (12 axes, 11 motifs, `matchResultSchema`) · les 12 fonctions PURES · `pushableScore` · pré-filtrage déterministe | —         |
| B   | Langue et habilitation : colonnes talent + besoin, saisie, axes 6 et 12 réellement calculés                                                                                                                        | A         |
| C   | API `POST /needs/:id/match` · journal (`match_runs`, `match_run_entries`, `match_weight_versions`) · 4 blocs · 0 crédit                                                                                            | A, B      |
| D   | `GET /needs/:id/match/explain` — document d'explication exportable (BEL-MTC-303, P0)                                                                                                                               | C         |
| E   | `POST /consultants/:id/match-inverse` (BEL-MTC-304)                                                                                                                                                                | C         |
| F   | Shortlist figée (BEL-MTC-302) : tables, plafond 5, duplication, fiches courtes                                                                                                                                     | C         |
| G   | Positionner — porte G4 : panneau d'effet, consentement expiré refusé, acquittement journalisé, `pushable_score` sur la submission                                                                                  | C, F      |
| H   | CV client depuis le matching : compétences prouvées pré-cochées, barrées, gaps mot pour mot, destinataire, D21                                                                                                     | C, G      |
| I   | Web : drawer `?match=`, bandeau de transparence, bandeau de critères, 4 blocs, carte de résultat, comparaison 2-4                                                                                                  | C         |
| J   | Les 6 points d'entrée et les 5 états du bouton                                                                                                                                                                     | I         |
| K   | Automatisations MTC-01 à MTC-08                                                                                                                                                                                    | C, F      |
| L   | Calibration (BEL-MTC-305) · démo · changelog · i18n · tracker                                                                                                                                                      | tous      |

---

## 4. Décisions tranchées par Louis le 20/08/2026

| #   | Question                                                               | Réponse                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D26 | Axes 4 (secteur) et 5 (environnement) : sémantiques ou déterministes ? | **Déterministes, 12/12.** Le PDF exige « deux exécutions identiques ⇒ classement identique » et « 0 crédit » ; un appel modèle par profil casse les deux. Les preuves portent `source: 'derived'`, jamais `'model'`. |
| D27 | Langue et habilitation n'existent nulle part                           | **Ajouter les champs et la saisie.** Sans eux, l'axe 6 et deux des onze motifs d'exclusion seraient des cases vides.                                                                                                 |
| D28 | Portée du chantier                                                     | **Tout, les 12 lots A→L.**                                                                                                                                                                                           |
| D21 | Le TJM apparaît-il dans le message de push ?                           | **Réglable par espace, éteint par défaut.** Un TJM annoncé avant l'entretien devient un plafond.                                                                                                                     |
| D22 | Seuil de « recommandé »                                                | Tranché sans question : **paramétrable par espace, défaut 60** (la recommandation du PDF).                                                                                                                           |

---

## 5. Ce qu'on ne promet pas

- **Un score présenté comme une probabilité.** Ni de closing, ni de réussite. Déjà refusé trois fois
  (arbitrage n°4 du 16/08, D10 du PDF 1, §5 du PDF 3). `pushable` est un score d'aptitude à être poussé,
  décomposé axe par axe, dont chaque terme non mesurable SORT du calcul au lieu de valoir zéro.
- **Le client ne voit jamais le score** (D24). Ce qui part au client est le dossier de compétences et le pitch.
- **Le matching sur un vivier externe** (D25, CVthèque, partenaire) — V3, sous consentement vérifié et
  traçabilité de la source. Le construire aujourd'hui reviendrait à classer des personnes dont on ne sait
  pas ce qu'elles ont accepté.
- **Les axes sémantiques par appel modèle** (D26) — refusés au profit du déterminisme : le PDF exige
  « deux exécutions identiques ⇒ classement identique » et « 0 crédit », et un appel de modèle par profil
  casse les deux.
- **Le remplacement du moteur historique `matchOpportunity`.** Il reste tel quel : supprimer un endpoint que
  le panneau du Vivier appelle casserait un écran en production. Les deux coexistent, le nouveau est le seul
  branché sur les données typées.
- **La ligne finale du §8.1** (« pourquoi je recommanderais Pierre malgré un score inférieur »). Elle
  demanderait un modèle, sur un module qu'on vient de rendre déterministe. Ce que l'écran donne à la place
  est plus utile et vérifiable : les deux scores côte à côte, dont l'ÉCART est exactement la réponse.
- **Le repli sur « le contact de facturation »** (§12.1). Cette notion n'existe nulle part dans le dépôt :
  aucune colonne ne distingue un contact facturation d'un autre. Prendre « un contact du compte » à la place
  enverrait le dossier d'un candidat à la mauvaise personne chez un client. Quand le besoin n'a pas de
  contact, l'écran demande.
- **Les relances J+3 et J+7 comme ENVOIS automatiques.** Ce sont des tâches. Une relance qui partirait seule
  chez un client trois jours après un envoi n'est pas ce qu'on installe sans que personne ne l'ait demandé —
  et le PDF les annonçait déjà comme existantes alors qu'elles n'existaient pas du tout.
- **Un message Teams préparé** (§12.1, « [À confirmer selon API] ») — le socle n'expose pas ce chemin ; le
  canal reste le brouillon de messagerie, sinon une tâche interne.
- **Les points d'entrée 4, 5 et 6** (copilote, offre détectée, exigences d'un AO). Les trois sont ABSENTS et
  chacun pour une raison différente, pas par manque de temps :
  - **PE4 (copilote)** demande d'abord au copilote de RÉSOUDRE un besoin par son libellé, donc un outil de
    lecture qu'il n'a pas. L'ajouter sans lui ferait proposer un lien vers un besoin choisi au hasard.
  - **PE5 (offre d'emploi détectée → besoin à qualifier)** : le contrat accepte désormais `source` et
    `provenance` à la création d'un besoin (la colonne existait et personne ne l'écrivait), mais la chaîne
    complète suppose que le pipeline d'analyse ÉCRIVE dans `project_needs`, ce qu'aucun code ne fait
    aujourd'hui. Le faire depuis ce chantier créerait un chemin d'écriture dans un module qui n'est pas le
    sien — et c'est exactement ce que la garde des frontières interdit.
  - **PE6 (exigences d'un AO)** : `rfp_requirements.owner_role` désigne un rôle INTERNE (sales, expert, RH),
    pas un profil de consultant recherché. Il n'existe aucune notion de « profil requis » dans un AO, et en
    inventer une produirait des matchings sur des lignes qui ne demandent personne.
- **Les huit KPI du §16.3 comme écran dédié.** Trois sont calculés et exposés (profils évalués, part des
  écartés par motif, taux d'entretiens par tranche) ; les cinq autres demandent un historique qui n'existera
  qu'après plusieurs semaines d'usage réel.
- **Le bandeau de critères ÉDITABLE en direct** (§7.1). Il affiche les critères, il ne les modifie pas :
  relancer un classement sur des critères qui ne sont pas enregistrés produirait un résultat qu'on ne
  pourrait pas reproduire, et la reproductibilité est ici une obligation, pas une commodité. Les critères se
  modifient sur le besoin, et le classement suit.

## 6. État de livraison

Branche `feat/pdf4-matching-cv-client`, un commit par lot.

| Lot | Contenu                                                                                                            | Livré           | Vérifié en live |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------- | --------------- |
| A   | Garde GA-06 étendue (noyau de classement) · contrat `match.ts` · les 12 axes purs · `pushableScore` · pré-filtrage | ✅              | —               |
| B   | Langues et habilitations : colonnes, saisie, axes 6 et 12 réels · `availability_checked_at`                        | ✅              | —               |
| C   | `POST /needs/:id/match` · journal (`match_runs`, `match_run_entries`, `match_weight_versions`) · 4 blocs           | ✅              | —               |
| D   | `GET /needs/:id/match/explain` (+ `format=md`) — BEL-MTC-303                                                       | ✅              | —               |
| E   | `POST /consultants/:id/match-inverse` — BEL-MTC-304                                                                | ✅              | —               |
| F   | Shortlist figée, plafond 5, duplication — BEL-MTC-302                                                              | ✅              | —               |
| G   | Positionner : préflight, porte G4, `pushable_score` sur la submission                                              | ✅              | —               |
| H   | Dossier client depuis le matching · message préparé · D21 · relances J+3/J+7 en tâches                             | ✅              | —               |
| I   | Panneau `?match=`, bandeau de transparence, 4 blocs, carte, comparaison 2-4                                        | ✅              | —               |
| J   | Points d'entrée 1, 2 et 3 (les 4, 5 et 6 sont au §5, avec leur raison)                                             | partiel, assumé | —               |
| K   | Calibration — BEL-MTC-305                                                                                          | ✅              | —               |
| L   | Démonstration (classement non vide, un non évaluable, un déjà refusé) · changelog FR+EN · registre des flux        | ✅              | —               |

Suite complète avant merge : API 5 375 · web 2 659 · contrats 1 357 · IA 4 135, toutes vertes.
`format:check` et `lint:exports:types` verts — le premier a au passage éteint une dette de formatage
laissée par le tracker du PDF 3.

## 7. Ce que la recette live a trouvé

Suite complète verte — API 5 375, web 2 659, contrats 1 357, IA 4 135 — puis **huit défauts en une heure
d'usage réel**, dont quatre qui rendaient la fonctionnalité entièrement inatteignable.

### Les quatre qui empêchaient purement et simplement d'utiliser le module

| #   | Ce qu'on voyait                                                                                           | Cause                                                                                                                                                         | PR    |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R1  | Le bouton « Lancer le matching » restait éteint partout, avec son infobulle correcte                      | `PATCH /projects/needs/:id` existait, `useUpdateProjectNeed` existait, **aucun écran ne les appelait** — un besoin ne pouvait donc recevoir aucune compétence | #1000 |
| R2  | Le classement rendait 500, dans les deux sens                                                             | `($3::uuid[] IS NULL OR c.id = ANY($3))` : le paramètre reçoit deux types dans une seule requête, Postgres la refuse ENTIÈREMENT                              | #1003 |
| R3  | Un lien `?match=…` ouvrait un tiroir bloqué sur « Je compare les profils… », sans le moindre appel réseau | Le bouton lançait le calcul ET naviguait ; l'URL, elle, ne lançait rien — la promesse du panneau partageable                                                  | #1002 |
| R4  | 500 encore, après R2                                                                                      | `accounts.name` n'existe pas : la colonne s'appelle `company_name`                                                                                            | #1004 |

### Les deux défauts ANTÉRIEURS que le croisement a fait sortir

| #   | Ce qu'on voyait                                                              | Cause                                                                                                                                             | PR    |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R5  | « Les positionnements n'ont pas pu être chargés » dans le tiroir d'un projet | `project_needs.role` dans la liste des positionnements — la colonne s'appelle `title`                                                             | #1004 |
| R6  | Rien du tout, et c'est le problème                                           | Le balayage quotidien des interventions interrogeait `user_credits`, **renommée `subscriptions` en juin**. Il échouait tous les jours, en silence | #1004 |

### Les quatre défauts d'usage

| #   | Ce qu'on voyait                                                   | Cause                                                                                                                                                                   | PR    |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R7  | « Positionner » écrivait directement                              | La préflight du §10.1 était calculée côté serveur et personne ne la voyait : le point d'attention que le document veut « affiché ET journalisé » n'était que journalisé | #1005 |
| R8  | « 1 méritent d'être regardés »                                    | Pas de pluriel sur la première phrase que lit l'utilisateur                                                                                                             | #1005 |
| R9  | « Les 2 compétences attendues sont couvertes » à côté d'un 40/100 | Le détail comptait les compétences sans dire la force de la PREUVE — ce qui manquait n'était pas la compétence                                                          | #1005 |
| R10 | Langues et habilitations saisissables, jamais affichées           | On écrivait une langue sans pouvoir vérifier ce qu'on avait écrit, alors que deux axes en dépendent                                                                     | #1005 |

### Ce que les gardes ne voyaient pas, et les trois qui ont été écrites

Le dépôt avait déjà une garde des **tables** nommées en SQL brut, une garde des **paramètres** dans un
`CASE`, et `wired-write-paths.spec.ts` pour les chemins d'écriture sans appelant. Aucune des trois ne
pouvait voir R1 à R6 :

- la garde des tables ne regarde pas les **colonnes** — la table était bonne à chaque fois ;
- elle accueillait en plus un nom **mort** : un `CREATE TABLE` reste dans l'historique après un
  `RENAME TO`, d'où R6 ;
- la garde des paramètres ne surveillait que les branches de `CASE`, pas `ANY(...)` ;
- `wired-write-paths` surveille les services de l'API, pas les **mutations du web** — d'où R1.

Trois gardes écrites en réponse : `sql-column-names.spec.ts` (toute colonne nommée dans du SQL brut
existe), `sql-reserved-columns.spec.ts` (un mot réservé employé comme colonne est cité — `references` a
coûté un 500 muet), et l'extension de `sql-parameter-casts.spec.ts` à `ANY(...)`. La garde des tables
suit désormais les renommages, en ne lisant que le bloc `up()` : le `down()` porte le renommage inverse,
qui n'a jamais tourné.

### Ce qui a été exercé pour de vrai

Créer deux talents (dont un à disponibilité INCONNUE), leur saisir langues et habilitations, promouvoir un
projet détecté au pipe, lui ajouter un rôle, saisir ses compétences obligatoires et souhaitées, lancer le
classement, lire les quatre blocs, télécharger le document d'explication, ouvrir le modal de positionnement,
positionner, vérifier que le positionnement apparaît, puis **tout supprimer**. Le profil à disponibilité
inconnue est bien tombé dans « non évaluables » et non dans « écartés » — la règle que le module tient pour
la plus importante, vérifiée sur une donnée réelle.

Balayage des neuf entrées de navigation : aucune régression.

### Ce qui n'a pas pu être vérifié en live

La shortlist, le dossier de compétences depuis le classement et le message client demandent un vivier avec
des CV et un contact rattaché au besoin — l'espace de production n'en avait aucun, et en fabriquer aurait
produit un test sur des données inventées plutôt qu'un test. Leurs chemins sont couverts par les tests et
par les fonctions pures ; ils restent à exercer sur un espace client réel.

---

## 11. Les dix cas limites, statués un par un (25/08/2026)

L'inventaire portait « Les 10 edge cases · ABSENT · — » : une ligne sans preuve,
sans lot et sans refus. Elle était fausse **dans les deux sens** — elle cachait
cinq comportements livrés et elle n'a jamais statué les cinq autres.

| Cas (source `pdf4.md:523-532`)                                              | Statut     | Preuve                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positionnement actif ailleurs → drapeau, autorisé, expliqué                 | **LIVRÉ**  | `matching/engine.ts:321` (`activeSubmissionsElsewhere`)                                                                                                                                      |
| Profil en mission chez le même client → débauchage interne                  | **LIVRÉ**  | `matching/engine.ts:224` (`already_on_mission_at_client`)                                                                                                                                    |
| Consentement expiré → exclu, motif affiché                                  | **LIVRÉ**  | `matching/engine.ts:178` (`consent_expired`)                                                                                                                                                 |
| Talent sans aucune compétence → non évaluable, à part                       | **LIVRÉ**  | `matching/engine.ts:175` + `:251` (`not_evaluable`)                                                                                                                                          |
| 3 000 talents → pré-filtrage avant les axes coûteux                         | **LIVRÉ**  | `matching/prefilter.ts:20` — ⚠️ le seuil est `PREFILTER_ABOVE = 300`, dix fois plus bas que le chiffre de la source. Plus prudent, donc conservé, mais ce n'est pas ce que la source décrit. |
| Vivier < 5 profils → « ton vivier est petit, voici tout ce que j'ai »       | **ABSENT** | aucun libellé, aucun calcul                                                                                                                                                                  |
| Aucun profil au-dessus de 50 → **ne pas forcer une shortlist**              | **ABSENT** | aucun garde-fou ; l'écran rend le classement tel quel                                                                                                                                        |
| Besoin trop vague → demander les compétences obligatoires avant de lancer   | **ABSENT** | —                                                                                                                                                                                            |
| Deux besoins identiques → signaler que le même profil est proposé deux fois | **ABSENT** | —                                                                                                                                                                                            |
| Critères modifiés en cours → calcul annulé, **aucun résultat mixte**        | **ABSENT** | —                                                                                                                                                                                            |

**Les deux qui comptent le plus sont dans la même famille** — celle que tout le
produit applique ailleurs : dire ce qu'on n'a pas plutôt que de rendre une liste
qui a l'air sûre d'elle. « Vivier < 5 » et « aucun profil au-dessus de 50 » sont
la version matching de « non mesuré n'est pas zéro ». Elles restent dues.

Les trois autres sont de nature différente : deux relèvent de l'ergonomie de
saisie, la dernière (« aucun résultat mixte ») est une règle de correction dont
il faut d'abord mesurer si le chemin actuel peut réellement produire un résultat
mixte — le classement passe par une requête clé par critères, qui l'écarte
probablement déjà. Affirmer le contraire sans l'avoir mesuré serait inventer un
défaut.
