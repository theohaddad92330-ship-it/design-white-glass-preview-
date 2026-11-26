# PDF 3/9 — ATS, back-office talent et vivier — 20 août 2026

Source : `agent_docs/sources/pdf-3-ats-talent-vivier-2026-08-20.pdf` (13 pages, lues
intégralement le 20/08/2026). Prérequis déclaré : PDF 1
(`agent_docs/pdf1-architecture-globale-2026-08-19.md`). Il ne redit rien du PDF 2
(`agent_docs/pdf2-crm-interne-2026-08-19.md`).

Périmètre : le talent sous ses quatre natures, l'upload et le parsing de CV, la
normalisation des compétences, la disponibilité, le TJM, les versions de CV,
l'écran Vivier, la fiche talent, le pool de réactivation, et les 14 gestes du
domaine.

## 0. Ce qu'il faut savoir avant de le lire

**Le chantier CRM/ATS T0→T11 du 17/08 a déjà posé la moitié du socle.** La
tranche T5 (`consultants.kind`, `consultant_skills`, `consultant_documents`,
rétention 2 ans) et la T6 (`submissions`, `interviews`, `submission_feedback`)
sont mergées. Ce PDF ne construit donc pas un ATS de zéro : il demande ce qui
manque AU-DESSUS, et surtout il touche l'endroit où le chantier précédent a
laissé le plus de **chemins non branchés**.

**Trois marqueurs `[Confirmé — repo]` sont faux**, vérifiés :

| Affirmation du PDF                                                                    | Réalité                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §3.1 — la pièce jointe d'email détectée déclenche « routine `cv_intake`, N3 »         | `cv_intake` existe (`routine-catalog.ts:373`) mais NOTIFIE seulement (`routine-executors.ts:523-541`). Aucun parsing, aucune dédup, aucune fiche. Le libellé de la routine dit pourtant « ajoutés à ta base de connaissance ». |
| §12 TAL-03 — « intercontrat > 30 j → proposer un push ciblé [Confirmé] »              | `bench_alert` liste les consultants en intercontrat depuis l'ATS EXTERNE (`ats.service.ts:149`). Aucun push, aucun besoin proposé.                                                                                             |
| §2 — « l'objet consultant porte un champ `kind` » (sous-entendu : les quatre natures) | `kind` existe mais vaut `consultant \| candidate` seulement (`TalentPool.ts:33`). Ni freelance ni sous-traitant. Et `kind` est ABSENT du contrat `Consultant` : l'écran ne peut pas l'afficher.                                |

Ce que le PDF affirme et qui est **exact** : `deriveStaffing` existe et est pur
et testé (§14 BEL-ATS-203), `no_feedback` est bien dans la liste fermée des
motifs et sort du taux de refus (§7.2), les quatre niveaux et les quatre sources
de compétence sont bien en base (§5.2), `cv-rewrite-guard` existe (§9.2), la
provenance `human` prioritaire existe (§4.2) — mais pas sur les consultants.

---

## 1. Inventaire

Statuts : `LIVRÉ` (preuve `fichier:ligne`) · `PARTIEL` · `ABSENT` · `PÉRIMÉ`
(contredit par une décision postérieure) · `REFUS` (contredit une règle
permanente) · `DÉCISION`.

### §1 — Périmètre, personas, cadre réglementaire (p. 1)

| #   | Exigence                                                                  | Statut    | Preuve / manque                                                                                   |
| --- | ------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| 1   | Quatre natures de talent : candidat, consultant, freelance, sous-traitant | `PARTIEL` | `TALENT_KINDS = ['consultant','candidate']` — `packages/contracts/src/schemas/talent.ts:26`       |
| 2   | Personas P3 recruteur, P2 business manager, P5 ops                        | `LIVRÉ`   | rôles `recruiter` / `sales` / `finance` — `packages/contracts/src/schemas/workspace.ts:33-52`     |
| 3   | Bénéfices attendus (13 h/sem sourcing, DC 25 min, dispos fausses)         | —         | contexte, pas une exigence                                                                        |
| 4   | EU AI Act annexe III : aucune compétence sans source                      | `LIVRÉ`   | `SKILL_SOURCES` + colonne `source` NOT NULL — `migrations/1789374912846-TalentPool.ts:54`         |
| 5   | EU AI Act : aucune détection présentée comme certaine sans preuve         | `ABSENT`  | aucun parsing structuré n'existe, donc aucune confiance par champ                                 |
| 6   | EU AI Act : journalisation de tout traitement                             | `PARTIEL` | `record_field_audit` existe et accepte `consultant` (`Governance.ts:60`) mais aucun writer talent |

### §2 — Granularité talent, quatre natures (p. 1)

| #   | Exigence                                                     | Statut     | Preuve / manque                                                                                  |
| --- | ------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------ |
| 7   | `kind = consultant` (salarié, CDI/CDD)                       | `LIVRÉ`    | `consultant.entity.ts:42`                                                                        |
| 8   | `kind = candidate`, aucun lien juridique, rétention 2 ans    | `LIVRÉ`    | `talent.ts:130-205` (`TALENT_RETENTION_MAX_MONTHS = 24`, ancré sur `last_contact_at`)            |
| 9   | Nature freelance / portage, contrat de prestation, TJM achat | `PARTIEL`  | `contract_type` porte `freelance`/`portage` (`consultant.entity.ts:75`) mais pas le coût d'achat |
| 10  | Nature sous-traitant, via une autre ESN                      | `ABSENT`   | aucune valeur, aucun rattachement partenaire                                                     |
| 11  | D16 — `kind` étendu OU champ séparé `engagement_kind`        | `DÉCISION` | reco du PDF : champ séparé. Reco du chantier : idem                                              |
| 12  | Un sous-traitant porte toujours son partenaire               | `ABSENT`   | aucun `partner_id` sur `consultants` ; `account_partners` est un objet du CRM                    |
| 13  | Disponibilité dérivée pour un salarié, déclarative sinon     | `PARTIEL`  | `deriveStaffing` existe (`staffing.ts:111`) mais aucun écran ne l'appelle                        |
| 14  | Freelance dispo > 90 j ⇒ `à revalider`, jamais `disponible`  | `ABSENT`   | aucun seuil de fraîcheur sur `available_from`                                                    |
| 15  | Coût jamais le même objet : coût chargé ≠ TJM d'achat        | `ABSENT`   | `cost_rate_cents` et `purchase_tjm_cents` n'existent nulle part                                  |
| 16  | Les deux sous `finance:read`                                 | `PARTIEL`  | la permission existe (`workspace.ts:93`) et sert déjà sur la marge de mission                    |

### §3 — Upload et ingestion de CV (p. 2)

| #   | Exigence                                                          | Statut     | Preuve / manque                                                                      |
| --- | ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| 17  | Zone de dépôt `/consultants`, 1 à 20 fichiers, file visible       | `ABSENT`   | aucun `input type=file` ni dropzone dans `features/consultants`                      |
| 18  | ZIP multi-fichiers, 20 à 500, traitement par lot avec progression | `ABSENT`   | aucun code de dézippage lié au CV                                                    |
| 19  | Pièce jointe d'email détectée → routine `cv_intake`, N3           | `PARTIEL`  | la routine notifie seulement — `routine-executors.ts:523-541`                        |
| 20  | Dossier de stockage surveillé (D17)                               | `DÉCISION` | `DriveImportDialog` est un import ponctuel manuel ; aucune surveillance              |
| 21  | Import CSV + colonne de lien (renvoyé au PDF 7)                   | `ABSENT`   | `contacts/csv-import.ts` existe mais mappe des contacts                              |
| 22  | Saisie manuelle, formulaire court                                 | `LIVRÉ`    | `ConsultantFormDialog.tsx`                                                           |
| 23  | PDF texte : extraction complète                                   | `PARTIEL`  | `apps/ia/app/services/document_text.py:71-88` (pypdf) — pas branché sur le CV        |
| 24  | PDF scanné : OCR, et si échec on le DIT                           | `ABSENT`   | aucun OCR ; un PDF image lève « probablement un scan » (`document_text.py:236`)      |
| 25  | DOCX complet                                                      | `PARTIEL`  | `document_text.py:96-126` — non branché sur le CV                                    |
| 26  | DOC ancien, conversion préalable                                  | `ABSENT`   | —                                                                                    |
| 27  | Image seule, OCR, qualité annoncée                                | `ABSENT`   | —                                                                                    |
| 28  | Règle de stockage : texte extrait, jamais le binaire              | `LIVRÉ`    | `consultant-document.entity.ts:3-9`, règle écrite et justifiée                       |
| 29  | D7 — conserver le binaire 12 mois après le dernier positionnement | `DÉCISION` | contredit frontalement la règle 28                                                   |
| 30  | Pipeline : dépôt → format → texte → doublon → parsing → revue     | `ABSENT`   | aucune des cinq étapes intermédiaires                                                |
| 31  | Aucune fiche `qualified` sans passage humain                      | `ABSENT`   | aucun statut de qualification sur un talent                                          |
| 32  | Doublon par email pro identique (confiance certaine)              | `ABSENT`   | `consultants` n'a même pas de colonne `email`                                        |
| 33  | Doublon par téléphone identique (forte)                           | `ABSENT`   | idem, pas de colonne `phone`                                                         |
| 34  | Doublon par nom + prénom + date de naissance                      | `REFUS`    | une date de naissance est un critère protégé — GA-06 `protected-criteria.spec.ts:43` |
| 35  | Doublon par nom + prénom + dernier employeur (moyenne)            | `ABSENT`   | pas de colonne employeur                                                             |
| 36  | Similarité de contenu du CV > seuil (faible, propose seulement)   | `ABSENT`   | —                                                                                    |
| 37  | Écran « ressemble à Pierre M. » → Fusionner / Distinct / Ignorer  | `ABSENT`   | le motif existe pour les contacts (`crm-duplicates.ts`), pas pour les talents        |
| 38  | Jamais de fusion automatique (invariant PDF 1)                    | `LIVRÉ`    | règle déjà tenue partout — `crm-duplicates.ts`, on PROPOSE                           |

### §4 — Les 12 détections du parsing (p. 2-3)

| #   | Exigence                                                          | Statut                                                                        | Preuve / manque                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 39  | Chaque détection produit `{valeur, confiance, extrait, position}` | `ABSENT`                                                                      | aucun `parsedFieldSchema` dans le dépôt                                                                                                                                                                                                                               |
| 40  | D1 Identité — jamais utilisée dans un raisonnement de sélection   | `LIVRÉ`                                                                       | GA-06 verrouille `full_name` hors des moteurs de sélection                                                                                                                                                                                                            |
| 41  | D2 Titre métier — jamais inventé si absent                        | `PARTIEL`                                                                     | colonne `title` saisie, aucune extraction                                                                                                                                                                                                                             |
| 42  | D3 Compétences avec extrait ; niveau jamais déduit du seul CV     | `PARTIEL`                                                                     | `extractSkills()` pose `source='cv'` sans extrait — `talent.service.ts:207`                                                                                                                                                                                           |
| 43  | D4 Séniorité calculée sur dates réelles ; sans dates ⇒ null       | `LIVRÉ` ⚠️ **statut corrigé le 27/08/2026** — il disait `ABSENT`, mesuré faux | `cv-parsing.ts:26` (« années totales — CALCULÉES sur des dates réelles ») · `bellum_cv_parse.py:62-63` (sans dates ⇒ `null`) · encadré par `canAutoAccept` (`cv-parsing.ts:107-111`, calculé serveur `cv-parse.service.ts:95`) · registre de doctrine `c28_seniorite` |
| 44  | D5 Secteurs déduits des clients cités, marqués `inferred`         | `ABSENT`                                                                      | `sectors[]` est saisi                                                                                                                                                                                                                                                 |
| 45  | D6 Environnements techniques, distincts des compétences           | `ABSENT`                                                                      | —                                                                                                                                                                                                                                                                     |
| 46  | D7 Outils, catégorie à part pondérée faiblement                   | `ABSENT`                                                                      | —                                                                                                                                                                                                                                                                     |
| 47  | D8 Langues, niveau retenu seulement s'il est écrit                | `ABSENT`                                                                      | aucune colonne langue                                                                                                                                                                                                                                                 |
| 48  | D9 Certifications, jamais « vérifiée » sans pièce jointe          | `ABSENT`                                                                      | `TALENT_DOCUMENT_KINDS` a `certificate` mais rien ne le lie                                                                                                                                                                                                           |
| 49  | D10 Mobilité — null par défaut, à demander                        | `ABSENT`                                                                      | seul `zones[]` texte libre existe                                                                                                                                                                                                                                     |
| 50  | D11 Disponibilité — si absente `unknown`, jamais « disponible »   | `LIVRÉ`                                                                       | `deriveStaffing` rend `unknown` (`staffing.ts:115`)                                                                                                                                                                                                                   |
| 51  | D12 Expériences conservées intégralement                          | `ABSENT`                                                                      | `cv_text` est un bloc unique, aucune table d'expériences                                                                                                                                                                                                              |
| 52  | Interdit : déduire un niveau d'un mot-clé                         | `PARTIEL`                                                                     | `bellum_cv.py:46-52` l'interdit pour la RÉÉCRITURE                                                                                                                                                                                                                    |
| 53  | Interdit : déduire une séniorité d'un intitulé                    | `ABSENT`                                                                      | aucun prompt de parsing où l'écrire                                                                                                                                                                                                                                   |
| 54  | Interdit : estimer un TJM                                         | `ABSENT`                                                                      | idem                                                                                                                                                                                                                                                                  |
| 55  | Interdit : inférer genre, âge, origine — ni extraits ni stockés   | `LIVRÉ`                                                                       | GA-06 — `protected-criteria.spec.ts:42-53`                                                                                                                                                                                                                            |
| 56  | Interdit : compléter une date manquante par approximation         | `ABSENT`                                                                      | —                                                                                                                                                                                                                                                                     |
| 57  | Écran de revue deux colonnes, CV à gauche, champs à droite        | `ABSENT`                                                                      | `ConsultantCvDialog.tsx` est à une seule colonne                                                                                                                                                                                                                      |
| 58  | Survol d'un champ ⇒ surlignage de l'extrait dans le CV            | `ABSENT`                                                                      | —                                                                                                                                                                                                                                                                     |
| 59  | Actions par champ : Accepter / Corriger / Rejeter                 | `ABSENT`                                                                      | —                                                                                                                                                                                                                                                                     |
| 60  | Champ non détecté affiché « non trouvé dans le CV »               | `ABSENT`                                                                      | —                                                                                                                                                                                                                                                                     |
| 61  | « Tout accepter » actif seulement si aucune confiance faible      | `ABSENT`                                                                      | —                                                                                                                                                                                                                                                                     |
| 62  | Champ corrigé ⇒ provenance `human` prioritaire                    | `PARTIEL`                                                                     | le mécanisme existe (`record-edit.service.ts`) mais aucun writer consultant                                                                                                                                                                                           |

### §5 — Normalisation des compétences (p. 3-4)

| #   | Exigence                                                    | Statut     | Preuve / manque                                                        |
| --- | ----------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| 63  | `skill_term` — le terme brut tel qu'écrit                   | `LIVRÉ`    | `consultant_skills.raw_label` — `consultant-skill.entity.ts`           |
| 64  | `skill_canonical` — le terme normalisé                      | `LIVRÉ`    | `canonicalSkill()` — `skill-referential.ts:114` (en CODE, pas en base) |
| 65  | `skill_alias` — table de synonymes par l'usage              | `PARTIEL`  | `SKILL_ALIASES`, 37 entrées EN DUR — `skill-referential.ts:32-75`      |
| 66  | `skill_family` — regroupement                               | `ABSENT`   | volontairement refusé par le module (« pas une ontologie »)            |
| 67  | `consultant_skill` avec niveau et source                    | `LIVRÉ`    | `migrations/1789374912846-TalentPool.ts:38-64`                         |
| 68  | Quatre niveaux `notions/autonome/confirme/expert`           | `LIVRÉ`    | `talent.ts:37` + CHECK SQL `TalentPool.ts:53`                          |
| 69  | Quatre sources `mission/interview/cv/declared`              | `LIVRÉ`    | `talent.ts:46` + CHECK SQL `TalentPool.ts:54`                          |
| 70  | Une compétence `declared` s'affiche BARRÉE devant un client | `ABSENT`   | rien ne distingue les sources à la génération de CV                    |
| 71  | Catalogue d'espace `/settings/catalogues`                   | `LIVRÉ`    | `catalogues.service.ts:251-263` (`normalised_skills`, lecture seule)   |
| 72  | Correction ⇒ alias PROPOSÉ à l'admin, jamais appliqué seul  | `ABSENT`   | aucun flux de proposition                                              |
| 73  | Terme inconnu remonte dans une file d'enrichissement        | `ABSENT`   | `canonicalSkill()` rend `null` en silence                              |
| 74  | D18 — référentiel partagé entre espaces                     | `DÉCISION` | reco du PDF : V3, sous consentement                                    |

### §6 — Écran Vivier `/consultants` (p. 4-5)

| #   | Exigence                                                   | Statut    | Preuve / manque                                                      |
| --- | ---------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| 75  | Phrase et CTA « Ajouter un talent »                        | `LIVRÉ`   | `ConsultantsPage.tsx:83`                                             |
| 76  | Secondaires : importer un CSV, déposer des CV, vues        | `ABSENT`  | aucun des trois                                                      |
| 77  | Col. 1 Nom + badge de nature                               | `PARTIEL` | nom affiché ; `kind` absent du contrat, donc pas de badge            |
| 78  | Col. 2 Titre métier                                        | `LIVRÉ`   | `ConsultantsPage.tsx:170`                                            |
| 79  | Col. 3 Cinq compétences en chips, niveau/source au survol  | `PARTIEL` | `stack` en texte joint ; les chips typées vivent dans une modale     |
| 80  | Col. 4 Séniorité                                           | `ABSENT`  | en base, jamais affichée                                             |
| 81  | Col. 5 Disponibilité, cinq états dont `inconnue`           | `PARTIEL` | affiche le champ DÉCLARATIF, pas la dérivation                       |
| 82  | Col. 6 Libre le (fin la plus tardive)                      | `ABSENT`  | calculé par `deriveStaffing`, jamais affiché                         |
| 83  | Col. 7 TJM cible                                           | `LIVRÉ`   | `ConsultantsPage.tsx:168`                                            |
| 84  | Col. 8 TJM minimum, `finance:read`                         | `ABSENT`  | pas de colonne                                                       |
| 85  | Col. 9 Coût chargé / TJM d'achat, `finance:read`           | `ABSENT`  | pas de colonne                                                       |
| 86  | Col. 10 Mobilité                                           | `PARTIEL` | `zones[]` texte libre                                                |
| 87  | Col. 11 Statut contractuel                                 | `PARTIEL` | en base, jamais affiché ; `cdd` et sous-traitance manquent à l'enum  |
| 88  | Col. 12 Dernière mission (client + fin)                    | `ABSENT`  | `mission_assignments` existe, aucune lecture côté vivier             |
| 89  | Col. 13 Positionnements en cours / total                   | `ABSENT`  | `submissions` filtrable par `consultantId`, jamais appelé ainsi      |
| 90  | Col. 14 Consentement valide jusqu'au…                      | `ABSENT`  | aucun consentement par personne                                      |
| 91  | Col. 15 Source de la fiche                                 | `ABSENT`  | colonne `source` en base, absente du contrat — champ orphelin        |
| 92  | Col. 16 Dernière mise à jour du profil                     | `ABSENT`  | `updated_at` sert au tri, jamais affiché                             |
| 93  | Aucune affectation ⇒ `inconnue`, l'écran ne CONCLUT pas    | `PARTIEL` | vrai dans `deriveStaffing`, faux à l'écran                           |
| 94  | Affectation sans fin ⇒ `occupé sans date`                  | `LIVRÉ`   | `staffing.ts:125-128`                                                |
| 95  | Libération = la plus tardive                               | `LIVRÉ`   | `staffing.ts:132-135`                                                |
| 96  | Freelance : dispo déclarative + date de confirmation, 60 j | `ABSENT`  | aucune date de confirmation                                          |
| 97  | Seize filtres (dont client déjà vu, jamais positionné)     | `ABSENT`  | zéro filtre à l'écran ; sept existent sur `/talents`, jamais appelé  |
| 98  | Six vues par défaut                                        | `ABSENT`  | `saved_views` existe avec le scope `talents`, aucun consommateur web |
| 99  | Cinq actions de masse                                      | `ABSENT`  | aucune sélection multiple sur le vivier                              |

### §7 — Fiche talent, neuf onglets (p. 5-6)

| #   | Exigence                                            | Statut     | Preuve / manque                                                                        |
| --- | --------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 100 | Une fiche talent (route dédiée)                     | `ABSENT`   | une seule route `/consultants/`, tout se joue en dialogues                             |
| 101 | En-tête : nom ou initiales si anonymisation active  | `ABSENT`   | aucune anonymisation d'espace                                                          |
| 102 | Onglet 1 Profil                                     | `PARTIEL`  | les champs existent, en formulaire d'édition                                           |
| 103 | Onglet 2 Compétences avec source ET preuve          | `PARTIEL`  | niveau + source oui ; colonne de PREUVE non                                            |
| 104 | Onglet 3 Expériences                                | `ABSENT`   | aucune table d'expériences                                                             |
| 105 | Onglet 4 Documents                                  | `LIVRÉ`    | `consultant_documents` + `TalentSkillsDialog.tsx:127-200`                              |
| 106 | Onglet 5 Disponibilité & TJM, historique horodaté   | `ABSENT`   | aucun historique de TJM                                                                |
| 107 | Onglet 6 Positionnements                            | `ABSENT`   | données présentes, aucune vue côté talent                                              |
| 108 | Onglet 7 Missions                                   | `ABSENT`   | `mission_assignments` jamais lu côté talent                                            |
| 109 | Onglet 8 Feedbacks                                  | `PARTIEL`  | deux systèmes séparés (`submission_feedback`, `consultant_push_feedback`), aucun réuni |
| 110 | Onglet 9 Consentement & rétention                   | `PARTIEL`  | rétention par ESPACE oui ; consentement par PERSONNE non                               |
| 111 | Candidat : rétention 2 ans après dernier contact    | `LIVRÉ`    | `talentPurgeDate()` — `talent.ts:182`                                                  |
| 112 | Candidat : onglet Missions remplacé par Expériences | `ABSENT`   | —                                                                                      |
| 113 | D19 — positionner un candidat non embauché          | `DÉCISION` | rien n'interdit ni ne signale aujourd'hui                                              |
| 114 | Profil déjà refusé ⇒ EN ROUGE dans tout matching    | `ABSENT`   | le matching ne lit jamais `submissions`                                                |
| 115 | Motifs de fin en liste fermée, dont `no_feedback`   | `LIVRÉ`    | `SUBMISSION_OUTCOME_REASONS` — `submission.ts:85-95`                                   |
| 116 | `no_feedback` n'entre pas dans le taux de refus     | `LIVRÉ`    | `submissionFunnel()` l'exclut du dénominateur — `submission.ts:311`                    |
| 117 | Bandeau si consentement expire < 30 j               | `ABSENT`   | —                                                                                      |
| 118 | Purge automatique, journalisée, irréversible        | `LIVRÉ`    | `talent.service.ts:363-392` + cron `privacy-retention.service.ts:163`                  |
| 119 | Bouton qui LISTE avant de supprimer / anonymiser    | `ABSENT`   | `DELETE /consultants/:id` supprime sans confirmation ni aperçu                         |

### §8 — TJM, mobilité, préférences (p. 6)

| #   | Exigence                                                                   | Statut    | Preuve / manque                                                    |
| --- | -------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| 120 | `target_tjm_cents` visible de tous                                         | `PARTIEL` | `consultants.tjm` est en EUROS entiers — `consultant.entity.ts:79` |
| 121 | `min_tjm_cents` sous `finance:read`                                        | `ABSENT`  | existe sur `project_needs`, pas sur le talent                      |
| 122 | `cost_rate_cents` / `purchase_tjm_cents` saisis Ops                        | `ABSENT`  | seul `mission_commercial_terms.loaded_daily_cost_cents` existe     |
| 123 | Coût toujours saisi, jamais calculé ; marge « non mesurée »                | `LIVRÉ`   | `missionMargin()` rend `null` — `staffing.ts:196-205`              |
| 124 | Historique horodaté des TJM                                                | `ABSENT`  | valeur écrasée à chaque édition                                    |
| 125 | Une mission facture au TJM en vigueur pour la période                      | `ABSENT`  | `missions.daily_rate` est une valeur unique                        |
| 126 | `mobility_zones[]`, `remote_preference`, `travel_acceptance`, `relocation` | `ABSENT`  | seul `zones[]` texte libre                                         |
| 127 | Mobilité `null` par défaut, l'écran propose de DEMANDER                    | `ABSENT`  | —                                                                  |
| 128 | Préférences de mission (secteurs, régie/forfait, technos refusées)         | `ABSENT`  | `sectors[]` est une preuve, pas une préférence                     |
| 129 | Les préférences filtrent en AVERTISSEMENT, pas en exclusion                | `LIVRÉ`   | `collectRisks()` — `consultant-matching.ts:201-240`                |

### §9 — Les cinq versions de CV (p. 6-7)

| #   | Exigence                                                               | Statut    | Preuve / manque                                                                  |
| --- | ---------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| 130 | CV source (tel que reçu)                                               | `LIVRÉ`   | `consultants.cv_text`                                                            |
| 131 | CV client (reformaté, ciblé sur un besoin)                             | `PARTIEL` | `POST /consultants/:id/cv-rewrite` produit du JSON, pas un document              |
| 132 | CV anonyme (sans identité ni noms de clients)                          | `ABSENT`  | —                                                                                |
| 133 | CV enrichi (interne)                                                   | `ABSENT`  | —                                                                                |
| 134 | CV résumé (1 page, 5 points)                                           | `ABSENT`  | —                                                                                |
| 135 | Le CV optimisé n'est PAS une 6e version                                | `LIVRÉ`   | c'est déjà exactement ce que fait `cv-rewrite`                                   |
| 136 | Studio : sélecteurs version / cible / modèle / langue / anonymisation  | `ABSENT`  | `ConsultantCvDialog` n'a aucun sélecteur                                         |
| 137 | Compétences retenues cochables, avec leur preuve                       | `ABSENT`  | —                                                                                |
| 138 | Bloc « CE QUE JE N'AI PAS PU DIRE »                                    | `PARTIEL` | `gaps` existe et est calculé en dur — `cv-rewrite-guard.ts:66-78`                |
| 139 | Boutons Aperçu / Word / PDF / Joindre au positionnement                | `ABSENT`  | seul « copier le texte » existe                                                  |
| 140 | Garde-fou 1 — aucune compétence sans preuve                            | `LIVRÉ`   | `sanitizeCvRewrite()` — `cv-rewrite-guard.ts:125-172`                            |
| 141 | …mais RENDUE VISIBLE : barrée, jamais supprimée en silence             | `PARTIEL` | aujourd'hui SUPPRIMÉE, avec une note collective dans `gaps`                      |
| 142 | Garde-fou 2 — anonymisation par fonction déterministe APRÈS génération | `ABSENT`  | aucune fonction d'anonymisation                                                  |
| 143 | Garde-fou 3 — versionnement (cible, date, destinataire)                | `ABSENT`  | UPSERT sur `(consultant_id, opportunity_id)` — la version précédente est écrasée |
| 144 | Garde-fou 4 — diff visible source ↔ version client                     | `ABSENT`  | aucun composant de diff dans le dépôt                                            |
| 145 | Masquer nom, prénom, email, téléphone, photo, adresse                  | `ABSENT`  | —                                                                                |
| 146 | Masquer les noms de clients dans les missions                          | `ABSENT`  | —                                                                                |

### §10 — Les 14 boutons du domaine talent (p. 7-9)

| #   | Bouton                                                    | Statut     | Preuve / manque                                                                                 |
| --- | --------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 147 | B1 Ajouter un consultant                                  | `LIVRÉ`    | `ConsultantsPage.tsx:83` + `POST /consultants`                                                  |
| 148 | B2 Importer un CV                                         | `PARTIEL`  | on COLLE du texte — `TalentSkillsDialog.tsx:134-160`                                            |
| 149 | B3 Parser le CV (relancer)                                | `ABSENT`   | il faut supprimer puis recoller                                                                 |
| 150 | B4 Enrichir le profil                                     | `ABSENT`   | la cascade existe pour les CONTACTS ; `consultants` n'a ni email ni téléphone                   |
| 151 | B5 Générer le CV client                                   | `PARTIEL`  | `ConsultantMatchPanel.tsx:139` ; sortie JSON, pas un fichier                                    |
| 152 | B6 Générer le CV anonyme                                  | `ABSENT`   | —                                                                                               |
| 153 | B7 Comparer avec un besoin                                | `PARTIEL`  | se déclenche depuis la LISTE, pas depuis un profil                                              |
| 154 | B8 Ajouter à une shortlist                                | `ABSENT`   | `POST /submissions` existe, `useCreateSubmission` existe, AUCUN appelant                        |
| 155 | B9 Demander la disponibilité                              | `ABSENT`   | —                                                                                               |
| 156 | B10 Mettre à jour le TJM                                  | `PARTIEL`  | via le formulaire complet, sans historique                                                      |
| 157 | B11 Créer une note                                        | `ABSENT`   | `notes` est polymorphe et couvre déjà `consultant` — `notes.service.ts:154` ; aucun panneau web |
| 158 | B12 Envoyer au client                                     | `ABSENT`   | aucun lien positionnement → brouillon                                                           |
| 159 | B13 Archiver                                              | `ABSENT`   | pas de `archived_at` ; la suppression est un vrai DELETE                                        |
| 160 | B14 Réactiver                                             | `ABSENT`   | dépend de 159                                                                                   |
| 161 | Parsing gratuit (D1)                                      | `DÉCISION` | aujourd'hui seule la réécriture coûte (1 crédit d'enrichissement)                               |
| 162 | Notification si import > 20 fichiers                      | `ABSENT`   | —                                                                                               |
| 163 | CV illisible ⇒ aucun crédit débité, fichier conservé      | `ABSENT`   | —                                                                                               |
| 164 | Enrichissement : rien trouvé ⇒ crédit remboursé           | `LIVRÉ`    | règle déjà tenue sur les contacts                                                               |
| 165 | Enrichissement : aucun nom de fournisseur dans la réponse | `LIVRÉ`    | règle permanente, gardée par `tool-capability-digest.spec.ts`                                   |

### §11 — Pool et réactivation (p. 9)

| #   | Segment                                               | Statut   | Preuve / manque                         |
| --- | ----------------------------------------------------- | -------- | --------------------------------------- |
| 166 | Écran `/consultants/pool`                             | `ABSENT` | route inexistante                       |
| 167 | Bientôt disponibles (fin d'affectation < 45 j)        | `ABSENT` | calculable depuis `mission_assignments` |
| 168 | Dormants (aucun contact > 6 mois)                     | `ABSENT` | `last_contact_at` existe                |
| 169 | À revalider (dispo déclarée > 60 j sans confirmation) | `ABSENT` | pas de date de confirmation             |
| 170 | Consentement expirant < 30 j                          | `ABSENT` | pas de consentement                     |
| 171 | Jamais positionnés                                    | `ABSENT` | calculable depuis `submissions`         |
| 172 | Refusés récupérables (motif non bloquant)             | `ABSENT` | aucune classification des motifs        |
| 173 | Profils rares (compétence chez < 3 talents)           | `ABSENT` | calculable depuis `consultant_skills`   |

### §12 — Les dix automatisations talent (p. 9)

| #   | Automatisation                                        | Statut    | Preuve / manque                                        |
| --- | ----------------------------------------------------- | --------- | ------------------------------------------------------ |
| 174 | TAL-01 CV en pièce jointe → fiche `needs_review`      | `PARTIEL` | `cv_intake` NOTIFIE — `routine-executors.ts:523`       |
| 175 | TAL-02 mission T-30 → proposer des besoins            | `PARTIEL` | `mission_ending` signale, ne propose rien              |
| 176 | TAL-03 intercontrat > 30 j → push ciblé               | `PARTIEL` | `bench_alert` signale, ne pousse rien                  |
| 177 | TAL-04 dispo déclarée > 60 j → confirmation           | `ABSENT`  | —                                                      |
| 178 | TAL-05 consentement < 30 j → renouvellement           | `ABSENT`  | —                                                      |
| 179 | TAL-06 consentement expiré → purge                    | `PARTIEL` | la purge existe, ancrée sur l'inactivité               |
| 180 | TAL-07 nouveau besoin → signaler les profils          | `ABSENT`  | le matching est manuel                                 |
| 181 | TAL-08 positionnement sans retour 14 j                | `LIVRÉ`   | `intervention-rules.ts:70-95` + `InterventionsSweeper` |
| 182 | TAL-09 compétence corrigée → proposer l'alias         | `ABSENT`  | —                                                      |
| 183 | TAL-10 CV vieux de 18 mois → demander une mise à jour | `ABSENT`  | —                                                      |

### §13 — Permissions, cas limites, indicateurs (p. 9-10)

| #   | Exigence                                                                             | Statut    | Preuve / manque                                                                  |
| --- | ------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------- |
| 184 | Voir le vivier : `recruiter`, `sales` + palier `talent_pool`                         | `PARTIEL` | le palier est gardé (`consultants.controller.ts:36`), le rôle non                |
| 185 | Voir les coordonnées : `recruiter`, masquable par espace                             | `ABSENT`  | il n'y a pas de coordonnées sur un talent                                        |
| 186 | Coût chargé / TJM d'achat : `finance:read`                                           | `PARTIEL` | la permission existe, les champs non                                             |
| 187 | Créer / éditer un talent : `recruiter`                                               | `ABSENT`  | `consultants.controller.ts` n'a AUCUN `@RequirePermission`                       |
| 188 | Générer un DC : `recruiter`, `sales`                                                 | `ABSENT`  | idem                                                                             |
| 189 | Modifier la règle d'anonymisation : `admin`                                          | `ABSENT`  | la règle n'existe pas                                                            |
| 190 | Purger un talent : `admin` ou rétention                                              | `PARTIEL` | la rétention oui ; le DELETE manuel n'est gardé par rien                         |
| 191 | Exporter le vivier : `admin` uniquement, journalisé                                  | `ABSENT`  | aucun export du vivier                                                           |
| 192 | CV en anglais : parsing dans la langue, restitution en français                      | `ABSENT`  | —                                                                                |
| 193 | CV de 12 pages : résumé + TOUTES les missions conservées                             | `ABSENT`  | —                                                                                |
| 194 | CV sans date : séniorité null, expériences non ordonnables, signalé                  | `ABSENT`  | —                                                                                |
| 195 | Homonymes : fusion proposée, jamais automatique                                      | `ABSENT`  | —                                                                                |
| 196 | Talent chez deux ESN : autorisé, pas d'exclusivité                                   | `LIVRÉ`   | rien ne l'empêche                                                                |
| 197 | Consultant parti : archivé, missions conservées, hors matching                       | `ABSENT`  | pas d'archivage                                                                  |
| 198 | Compétence contradictoire : la source la plus forte l'emporte, l'autre reste visible | `ABSENT`  | l'unicité `(consultant_id, skill)` interdit deux lignes                          |
| 199 | Talent sans compétence : « non évaluable », jamais écarté en silence                 | `PARTIEL` | `blocked = true` (`consultant-matching.ts:341`) mais l'écran ne DIT pas pourquoi |
| 200 | Fichier corrompu : erreur nommée, fichier conservé                                   | `ABSENT`  | —                                                                                |
| 201 | Import de 500 CV : par lot, reprise possible, rapport final                          | `ABSENT`  | —                                                                                |
| 202 | Douze indicateurs du domaine talent                                                  | `ABSENT`  | `quality-metrics.ts` en calcule 7, aucun sur le talent                           |

### §14-§15 — Les cinq tickets et les sept décisions (p. 10-13)

| #   | Ticket / décision                                                   | Statut     | Note                                                        |
| --- | ------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| 203 | BEL-ATS-201 — revue de parsing avec preuve par champ (P0)           | `ABSENT`   | le plus gros : contrat + prompt + 2 routes + écran + démo   |
| 204 | 201 — `canAutoAccept(fields)` pure, false si champ critique faible  | `ABSENT`   | —                                                           |
| 205 | 201 — un champ sans extrait est REJETÉ par le validateur            | `ABSENT`   | —                                                           |
| 206 | 201 — `POST /consultants/parse` n'écrit RIEN                        | `ABSENT`   | —                                                           |
| 207 | 201 — `POST /consultants/parse/:id/commit` écrit après validation   | `ABSENT`   | —                                                           |
| 208 | 201 — un test vérifie qu'aucun champ protégé n'est extrait          | `PARTIEL`  | GA-06 le fait pour les moteurs ; à étendre au parsing       |
| 209 | BEL-ATS-202 — Studio DC avec anonymisation (P0)                     | `ABSENT`   | dépend de 201                                               |
| 210 | 202 — réglage d'espace `anonymisation_rule` + `/settings/templates` | `ABSENT`   | —                                                           |
| 211 | 202 — contrat `cv-version.ts`                                       | `ABSENT`   | —                                                           |
| 212 | 202 — 30 cas d'anonymisation sur fonction pure                      | `ABSENT`   | —                                                           |
| 213 | 202 — `cv-rewrite-guard` renvoie les exclues avec leur raison       | `PARTIEL`  | il les retire et note un total, sans raison individuelle    |
| 214 | 202 — chaque génération crée une ligne, aucune n'écrase             | `ABSENT`   | c'est exactement l'inverse aujourd'hui                      |
| 215 | 202 — export Word et PDF, « Joindre au positionnement »             | `ABSENT`   | `docx` / `pdf-lib` / `exceljs` sont déjà des dépendances    |
| 216 | BEL-ATS-203 — disponibilité dérivée visible (P0)                    | `ABSENT`   | tout le calcul existe ; il n'est branché sur aucun écran    |
| 217 | BEL-ATS-204 — alias d'espace (P1)                                   | `ABSENT`   | dépend du catalogue, qui existe                             |
| 218 | BEL-ATS-205 — drapeau « déjà refusé chez ce client » (P0)           | `ABSENT`   | le matching ne lit jamais `submissions`                     |
| 219 | 205 — le drapeau apparaît sur TOUT besoin du même compte            | `ABSENT`   | la chaîne `project_needs → opportunities → accounts` existe |
| 220 | 205 — `no_feedback` ⇒ badge gris, pas rouge                         | `ABSENT`   | la distinction existe déjà côté données                     |
| 221 | D16 — `kind` ou `engagement_kind`                                   | `DÉCISION` | —                                                           |
| 222 | D17 — surveiller un dossier de stockage                             | `DÉCISION` | —                                                           |
| 223 | D7 — conserver le binaire du CV                                     | `DÉCISION` | —                                                           |
| 224 | D18 — référentiel de compétences partagé                            | `DÉCISION` | —                                                           |
| 225 | D19 — positionner un candidat non embauché                          | `DÉCISION` | —                                                           |
| 226 | D1 — le parsing coûte-t-il un crédit                                | `DÉCISION` | —                                                           |
| 227 | D20 — masquer les coordonnées aux commerciaux                       | `DÉCISION` | —                                                           |

---

## 2. Ce que le croisement a trouvé et que le PDF ne demandait pas

Neuf défauts. Six d'entre eux sont le même : **une capacité livrée, testée, et
que rien n'appelle.** Le chantier T0→T11 avait déjà produit ce motif deux fois
(playbooks, doublons) et s'était doté d'une garde ; le domaine talent en porte
six autres, tous invisibles pour une suite verte.

| #   | Défaut                                                                                                                                                                                                                                                    | Pourquoi c'est grave                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Y1  | `deriveStaffing` est pur, testé, exposé sur `GET /talents/:id/staffing` — et **aucun écran ne l'appelle**. Le vivier affiche `consultants.availability`, un champ déclaratif dont le défaut en base est `inconnu`.                                        | C'est exactement le défaut que le PDF nomme : « un vivier qui propose des gens occupés est pire qu'un vivier vide ». Le calcul honnête existe et personne ne le voit. |
| Y2  | `GET /talents` (pagination, sept filtres, recherche dans les compétences NORMALISÉES) n'est appelé par aucun code web. L'écran charge tout le vivier d'un coup, sans filtre.                                                                              | Le vivier devient illisible dès quelques dizaines de profils, alors que la recherche existe.                                                                          |
| Y3  | `consultants.controller.ts` n'a **aucun** `@RequirePermission` sur ses dix routes, dont quatre écritures et une suppression définitive. Il est dans la liste figée de GA-05 (`endpoint-guards.spec.ts:53`).                                               | Le rôle `viewer`, documenté « lecture seule stricte », peut créer, modifier et **supprimer** un talent. Même défaut que `accounts.controller` corrigé au PDF 2.       |
| Y4  | `POST /submissions` existe côté API ; `useCreateSubmission` existe côté web ; **aucun composant ne l'appelle**.                                                                                                                                           | On ne peut pas positionner un consultant sur un besoin depuis l'interface. C'est le geste central d'un ATS.                                                           |
| Y5  | `DELETE /consultants/:id` est un vrai `DELETE`, sans confirmation, sans aperçu de ce qui part (compétences, documents, positionnements, missions en cascade).                                                                                             | Le §7.3 exige l'inverse — un bouton qui LISTE avant d'exécuter. Et c'est irréversible.                                                                                |
| Y6  | `privacy-export` et `privacy-deletion` ne connaissent pas les consultants. L'arbitrage n°7 du 16/08 promettait « branchement dans privacy-export ET privacy-deletion ».                                                                                   | Une demande d'accès RGPD rend un export incomplet. La promesse est écrite dans `agent_docs/crm-ats-plan.md:17`.                                                       |
| Y7  | `consultants.kind` a une colonne, une contrainte SQL et un enum de contrat — mais est **absent du schéma `Consultant`** renvoyé par `GET /consultants`. `consultants.source` a une colonne et n'est ni lu ni écrit nulle part.                            | Le vivier ne distingue pas un candidat d'un salarié à l'écran, alors que la moitié des règles du PDF en dépendent. `source` est un champ mort.                        |
| Y8  | Éditer une fiche talent n'écrit **aucune** ligne dans `record_field_audit`, alors que la table accepte `entity_type = 'consultant'` et que comptes et contacts y écrivent.                                                                                | Aucune trace d'un changement de TJM, alors que c'est le champ le plus discuté d'une fiche.                                                                            |
| Y9  | Deux libellés faux dans le dépôt : la routine `cv_intake` s'annonce « Les CV arrivés en pièce jointe, ajoutés à ta base de connaissance » alors qu'elle notifie seulement, et l'en-tête de `routine-catalog.ts` dit « huit routines » là où il y en a 23. | Un utilisateur qui coche `cv_intake` croit avoir armé une ingestion. C'est la version réglages du « Active sans connecteur » que le produit s'interdit.               |

### Constats relevés, non corrigés ici

- `useUserPermissions()` (`apps/web/src/lib/permissions.ts:12`) rend `[]` avec un
  commentaire affirmant que « le backend n'expose pas encore de modèle RBAC » —
  faux depuis le 19/08. Le dispositif est inerte plutôt que dangereux : aucune
  page ne passe `requiredPermissions`. Le brancher est dans le lot F.
- `full_name` est décrit dans le docblock de GA-06 comme figurant dans les
  critères protégés « sur les seuls moteurs » ; il n'est pas dans le tableau
  `PROTECTED_CRITERIA`. La doc surestime la garde d'un cran.

---

## 3. Lots d'implémentation

Ordonnés par dépendance. Un lot = un commit, testé, qui peut partir seul.

| Lot | Contenu                                                                                                                                                                                                                                                                       | Dépend de |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| A   | **Les neuf défauts** Y1→Y9 : dispo dérivée à l'écran (= BEL-ATS-203), `GET /talents` branché, permissions + sortie de GA-05, positionnement depuis le vivier, suppression avec aperçu, privacy export/deletion, `kind`/`source` au contrat, audit de champ, libellés corrigés | —         |
| B   | **Natures et engagement (D16)** : `engagement_kind`, `cdd`, partenaire du sous-traitant, `email`/`phone`/`linkedin_url`, coût chargé et TJM d'achat sous `finance:read`                                                                                                       | A         |
| C   | **Écran Vivier réel** : les 16 colonnes, les filtres, les six vues par défaut, les actions de masse                                                                                                                                                                           | A, B      |
| D   | **Fiche talent** : route dédiée, les neuf onglets, notes polymorphes branchées, historique de TJM                                                                                                                                                                             | A, B      |
| E   | **Upload et ingestion de CV** : dépôt de fichier, extraction PDF/DOCX, détection de doublon avant écriture, statuts `needs_review` / `qualified`                                                                                                                              | A         |
| F   | **Parsing en 12 blocs avec preuve par champ** (BEL-ATS-201) : contrat, prompt IA, `parse` / `commit`, écran de revue deux colonnes                                                                                                                                            | E         |
| G   | **Studio de dossier de compétences** (BEL-ATS-202) : cinq versions, anonymisation pure, compétences barrées, versionnement, export Word et PDF                                                                                                                                | F         |
| H   | **Drapeau « déjà refusé chez ce client »** (BEL-ATS-205)                                                                                                                                                                                                                      | A         |
| I   | **Alias d'espace** (BEL-ATS-204) : proposition sur correction, validation admin, file des termes inconnus                                                                                                                                                                     | —         |
| J   | **TJM, mobilité, préférences** (§8) : les trois TJM, la mobilité structurée, les préférences en avertissement                                                                                                                                                                 | B         |
| K   | **Pool et réactivation** (§11) + les automatisations talent réalisables                                                                                                                                                                                                       | C         |
| L   | **Consentement et rétention par personne** (§7.3) + les indicateurs talent au back-office                                                                                                                                                                                     | A         |

---

## 4. Décisions — tranchées par Louis le 20/08/2026

| #   | Question                                                  | Reco                      | Réponse                |
| --- | --------------------------------------------------------- | ------------------------- | ---------------------- |
| D16 | `kind` étendu, ou champ séparé `engagement_kind` ?        | champ séparé              | **champ séparé**       |
| D-P | Jusqu'où va le chantier ?                                 | tout, A→L                 | **tout, A→L**          |
| D7  | Conserver le binaire du CV 12 mois ?                      | non, joindre le CV généré | **non — le CV généré** |
| D20 | Ajouter les coordonnées d'un talent + masquage par rôle ? | oui                       | **oui**                |

Tranché sans poser la question, parce que les deux réponses ne mènent pas à un
travail différent :

| #   | Question                                           | Décision                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Le parsing coûte-t-il un crédit ?                  | **Gratuit.** C'est le geste d'entrée du recruteur, et le PDF le recommande. Seule la réécriture reste payante (inchangé).                                                                                                                                                              |
| D19 | Positionner un candidat non encore embauché ?      | **Oui, avec un drapeau visible** sur le positionnement. Le client doit savoir qu'il s'agit d'un recrutement en cours.                                                                                                                                                                  |
| D17 | Surveiller un dossier de stockage ?                | **Différé et écrit.** Aucune surveillance de dossier n'existe dans le produit (ni webhook Drive, ni delta Graph) : ce n'est pas un réglage à cocher mais un connecteur à construire. Et le PDF le dit lui-même — un dossier partagé contient des CV qu'on n'a pas le droit de traiter. |
| D18 | Référentiel de compétences partagé entre espaces ? | **Différé.** Le PDF le place en V3 sous consentement explicite. Le référentiel d'espace (lot I) est le préalable, et il n'existe pas encore.                                                                                                                                           |

### Ce que D16 veut dire exactement

`kind` ne bouge pas — la garde d'additivité l'interdirait de toute façon pour un
renommage, et surtout `kind` porte une question de DROIT (un candidat est une
donnée personnelle bornée à deux ans, un consultant est une donnée d'entreprise
justifiée par un contrat). `engagement_kind` porte une question de COMMERCE :
comment on mobilise la personne, et donc quel coût elle représente. Les
confondre rendrait « un freelance qu'on suit encore comme candidat »
inexprimable, et ferait dépendre la politique de rétention du mode de
facturation.

`partner_account_id` n'est pas décoratif : sans lui, un sous-traitant ne dit pas
qui est responsable devant le client. Il est exigé — et seulement exigé — quand
`engagement_kind = sous_traitance`.

### Ce que D7 veut dire exactement

La règle du dépôt tient : le binaire est extrait puis jeté. Ce qui part chez un
client n'est jamais le CV brut d'une personne — c'est le dossier de compétences
que le studio produit (lot G), anonymisé selon la règle d'espace, versionné, et
dont on sait ce qu'il contenait. Le besoin « joindre un vrai fichier » est donc
couvert, par un fichier meilleur.

---

## 5. Ce qu'on ne promet pas

- **La surveillance d'un dossier Drive / SharePoint** (D17) — voir ci-dessus.
- **Le référentiel de compétences partagé entre espaces** (D18) — V3.
- **La conservation du binaire du CV** (D7) — tranché, avec sa raison.
- **Le rapprochement de doublons par date de naissance** (§3.4) — une date de
  naissance est un critère protégé, GA-06 l'interdit dans tout ce qui classe des
  personnes, et le collecter pour dédupliquer reviendrait à le stocker. Les
  autres clés du §3.4 sont livrées.
- **L'OCR d'un CV scanné** (§3.2) — aucun moteur d'OCR dans le dépôt, et en
  ajouter un est un choix de fournisseur, pas une ligne de code. Ce qui EST
  livré, c'est la deuxième moitié de l'exigence, celle qui compte : quand
  l'extraction ne donne rien, l'écran le DIT et propose la saisie, au lieu de
  créer une fiche vide en silence.
- **La conversion des `.doc` anciens** (§3.2) — même raison : le format binaire
  Word 97 demande une bibliothèque de conversion. Le fichier est refusé avec son
  motif, jamais avalé.
- **Les douze axes du matching** (§10.4) — le PDF les renvoie explicitement au
  PDF 4. Le matching actuel en a six ; les étendre depuis ce document
  reviendrait à inventer les six autres.
- **Le CV parsé dans sa langue avec restitution en français** (§13.2) — la
  détection de langue et la traduction de restitution sont un chantier de
  prompt à part entière, mesurable seulement sur des CV réels.

---

## 6. État de livraison

Douze lots, une branche `feat/pdf3-ats-talent-vivier`, un commit par lot.

| Lot | Contenu                                                        | Livré |
| --- | -------------------------------------------------------------- | ----- |
| A   | Les neuf défauts Y1→Y9                                         | ✅    |
| B   | Natures, engagement, coordonnées, coûts (D16, D20)             | ✅    |
| C   | Vues, filtres et colonnes de l'écran Vivier                    | ✅    |
| D   | Fiche talent, missions, historique des taux, archivage         | ✅    |
| E   | Dépôt de CV, extraction, doublon avant écriture                | ✅    |
| F   | Revue de parsing champ par champ avec preuve (BEL-ATS-201)     | ✅    |
| G   | Studio de dossier de compétences + anonymisation (BEL-ATS-202) | ✅    |
| H   | Drapeau « déjà refusé chez ce client » (BEL-ATS-205)           | ✅    |
| I   | File d'enrichissement du catalogue (BEL-ATS-204)               | ✅    |
| J   | Mobilité et préférences, en avertissement                      | ✅    |
| K   | Pool de réactivation et ses sept segments                      | ✅    |
| L   | Consentement par personne et ce qu'on détient                  | ✅    |

BEL-ATS-203 (disponibilité dérivée visible) est dans le lot A : tout le calcul
existait, il n'était branché sur aucun écran.

### Les cinq tickets du §14

| Ticket      | État | Où                                                                     |
| ----------- | ---- | ---------------------------------------------------------------------- |
| BEL-ATS-201 | ✅   | lots E et F — `cv-parsing.ts`, `bellum_cv_parse.py`, écran de revue    |
| BEL-ATS-202 | ✅   | lot G — `cv-anonymisation.ts` (40 cas), `cv_versions`, export Word/PDF |
| BEL-ATS-203 | ✅   | lot A — `deriveStaffing` branché sur la ligne de vivier                |
| BEL-ATS-204 | ✅   | lot I — `skill_alias_proposals`, file dans les catalogues              |
| BEL-ATS-205 | ✅   | lot H — `markClientHistory`, badge dans le matching                    |

### Ce que le chantier a ajouté sans qu'on le demande

Une garde. `demo-reset.service.spec.ts` ne lisait que `@Entity({ name: 'x' })`
et ratait `@Entity('x')` : **neuf tables portant `workspace_id` échappaient au
classement purge/keep**, dont huit livrées la veille. Une garde borgne ressemble
en tout point à une garde verte.

## 7. Ce que la recette live a trouvé (20/08, après merge)

Neuf mille tests verts, trois défauts en dix minutes d'usage réel — **tous les
trois de la même famille** : un chemin d'écriture branché sur une table que
personne ne lit, ou une lecture branchée sur une table que personne n'écrit.
C'est la forme que prend, dans ce dépôt, le « livré mais jamais appelé ».

| #   | Ce qu'on voyait                                                                                 | Cause                                                                                                           | PR   |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| R1  | Une fiche remplie avec « Kubernetes, Terraform, Go » affichait **« Aucune compétence saisie »** | Le champ écrit dans `consultants.stack`, les écrans neufs lisent `consultant_skills` — deux tables, un seul nom | #995 |
| R2  | « PostgreSQL » s'affichait **« sql »** dans le vivier et sur la fiche                           | Le référentiel range les bases relationnelles sous une famille ; utile au rapprochement, faux à l'écran         | #996 |
| R3  | La file d'alias annonçait « tout est déjà reconnu » avec un terme inconnu fraîchement saisi     | `SkillAliasService.observe` n'avait qu'UN appelant : la saisie d'une compétence une par une                     | #997 |

Trois règles en sont sorties, écrites une fois et testées :

- un semis de compétences **n'écrase jamais** (`ON CONFLICT DO NOTHING`) et **ne
  supprime jamais** — une compétence prouvée en mission ne retombe pas à
  « déclaré » parce que quelqu'un a réenregistré une fiche ;
- le **canonique** sert au rapprochement, le **libellé écrit** s'affiche — un
  dossier envoyé au client ne doit pas remplacer une techno par sa famille ;
- un cinquième niveau **`inconnu`** : ces compétences arrivent sans niveau, et
  les enregistrer « autonome » afficherait devant un client une évaluation que
  personne n'a faite.

Ce que ça dit sur la méthode : les gardes du dépôt attrapent le chemin d'écriture
sans appelant (`wired-write-paths.spec.ts`), pas la LECTURE branchée sur la
mauvaise table. Deux champs qui portent le même nom à l'écran et vivent dans deux
tables ne se voient qu'à l'usage.
