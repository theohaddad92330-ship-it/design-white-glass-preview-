# Plan de réécriture des prompts — synthèse KB → prompts

> Bridge entre `agent_docs/kb/` et `apps/ia/app/prompts/`. On garde la **puissance métier** de la KB (commerciaux ESN), on la ré-ingénierie en prompts structurés. **Calibré V1** : sorties _premières vraiment utiles_ (crédible + monétisable), PAS maximalistes — la sophistication fine, la perso poussée et le RAG auto = V2 (cf. [v1-v2-v3](v1-v2-v3.md)).

## Règles transverses (à encoder dans TOUS les prompts métier)

1. **Sous-cerveau métier, pas reformulateur** : interpréter + hiérarchiser + distinguer signal fort / bruit. Logique directeur commercial ESN. ([prompts-principes-attendus](prompts-principes-attendus.md))
2. **Étiquetage 3 niveaux** par donnée : `Fait vérifié` / `Signal :` (déduit) / `Non détecté — recherche manuelle recommandée`. Jamais combler un vide. (aligne notre grounding `PUBLIC`/`HYPOTHÈSE` sur ces 3.)
3. **Fiabilité par recoupement** : 1 source = hypothèse · 2 = probable · 3 = validé.
4. **2 blocs d'input séparés** : `contexte_compte_enrichi` (factuel, mutualisé) + `contexte_user` (oriente/pondère — jamais reformulé en fait). ([dispatch-flux](dispatch-flux.md), [usage-contexte-par-etape](usage-contexte-par-etape.md))
5. **Sorties actionnables** : finir par des next steps datés, pas un diagnostic. Logique page = décision → justification → preuve → action ([prd-design](prd-design.md)).
6. **Dégrader proprement** : champ manquant → état contrôlé « Non détecté », jamais un fallback inventé.

## Plan par prompt

### messages + icebreaker ⭐ (densité KB max, gain visible, peu de contrat à toucher)

- **Injecter** : 3 personas (décideur/manager/opérationnel) × 4 scénarios (A accept / B dormant / C référé / D froid) × séquence 3 temps (M1/M2/M3, timings J0/J+5-7/J+12-14). Le **levier change par persona**, pas la structure. ([messages-linkedin-esn](messages-linkedin-esn.md), [pitch-telephonique](pitch-telephonique.md), [bible-sales-hacks](bible-sales-hacks.md))
- **Sélection scénario depuis la donnée** : cold→D, référé(`{{Référent}}` dans le graphe)→C, dormant→B, accepté→A.
- **Validateurs durs** (post-génération) : 150-200 mots, opener « J'espère que vous allez bien », M1 zéro mention entreprise, 1 question facile, **ban-list** (« je me permets de », « juste un petit follow-up », « nos expertises reconnues », « notre méthodologie éprouvée », jargon ESN).
- **icebreaker** = la spec M1 (2 archétypes : curiosité-only décideur / question-binaire opérationnel).
- **V1** : LinkedIn + email + script d'appel 15 min. Variantes/priorisation = bonus.

### strategy

- **plays = PROMESSE + PREUVE + ACTION** (reframe `angles`) : problème+KPI+livrable 6 sem / référence client / action concrète (atelier 45 min, audit flash, push profil). Pas un catalogue. ([methode-plan-de-compte-esn](methode-plan-de-compte-esn.md))
- **scoring projets /15** (urgence+budget+accessibilité, ≥12). **Calibration PME/ETI**. **Stratégie sandwich**.
- `powerQuestions` ← les 25 questions soutenance ([soutenance-25-questions](soutenance-25-questions.md)). `objections` ← banques objections pitch téléphonique (client + consultant). `rdvScript` ← call 5 étapes.
- **V1** : 3 plays scorés + rdvScript + objections. Garder concis (trim déjà fait).

### signals

- **Grille des 8 signaux dynamiques IT** (offres CDI 10+, technos, annonces transfo, incidents, levée/acquisition, changement C-level…) + lecture business + niveau. ([methode-plan-de-compte-esn](methode-plan-de-compte-esn.md))
- **Règle de convergence** : 3 signaux convergents = opportunité confirmée.
- Chaque signal : `category` typée (buying/project/finance/security/leadership) + `intensity` (Fort/Moyen/Faible) + **`commercialImplication` OBLIGATOIRE** (PRD) + source + date.
- Détecter **concurrents ESN** via dictionnaire ([liste-esn-france](liste-esn-france.md)).

### organigramme (pas de prompt dédié aujourd'hui — à créer / dériver de contacts)

- **5 rôles** : Sponsor / Décideur / Prescripteur / Utilisateur / Gatekeeper. **Chaîne de décision** EB/TB/UB/Coach/Gatekeeper. ([account-mapping](account-mapping.md), [modele-plan-de-compte](modele-plan-de-compte.md))
- **Matrice Pouvoir × Intérêt** (4 quadrants + fréquence de contact).
- **Zones blanches** (rôles manquants stratégiques) + **`recommended_path`** (3 étapes).
- Sortie `OrgChartData` : nodes + edges typés `hierarchy | influence | recommended_path` (PRD).

### contacts

- **AJOUTER `family`** (IT/Cyber/Data/IA/Infra/Dev/PMO/Finance/Achat/RH) — gros manque actuel. ([account-mapping](account-mapping.md))
- **Multi-threading** : viser composition 2 N-2 + 2 N-1 + 1 C-level + 1 achats. Niveaux C/N-1/N-2. `priority` 1-5 (1=top).
- **cleaning/exclusion** (stagiaires, hors-scope, doublons) — en amont ou règle prompt.
- Taxonomie Fonction issue du CRM réel ([crm-data-inventory](crm-data-inventory.md)) comme vocabulaire.

### plan

- **Cadence 10 jours** (J1 message / J3 relance / J6 valeur / J9 close loop) + benchmarks réponse par niveau. **30/60/90**. **Thread achats dès S2**. **Objectif chiffré**. ([methode-plan-de-compte-esn](methode-plan-de-compte-esn.md))
- `ActionPlan { objective, angle, steps[] }` daté + chaque action liée à un contact/signal (PRD).
- **V1** : plan minimum actionnable (sandwich + cadence + next steps datés).

### facts

- **Fiche d'identité** champ/valeur/source/fiabilité + étiquetage 3 niveaux. `priorityScore` aligné sur le **scoring compte 5 critères /25** (GO≥20/POSSIBLE/STOP) — ou déporté vers l'advisor Go/No-Go.
- Le plus léger (trim déjà fait) — surtout appliquer le labeling + fiabilité.

### Go/No-Go (advisor / evaluation)

- **Argumenté + structuré + lisible** : `score` + `scoreLabel` GO/WATCH/NO_GO + justification couvrant attractivité/accessibilité/fit/concurrence/CA. Pas une opinion. (PRD, [prompts-principes-attendus](prompts-principes-attendus.md))

## Changements de contrat (packages/contracts + schemas) — à batcher

| Champ                                                     | Où           | Priorité V1                   |
| --------------------------------------------------------- | ------------ | ----------------------------- |
| `contact.family` (enum 10 familles)                       | contacts     | **haute** (manque structurel) |
| `signal.commercialImplication` + `category` + `intensity` | signals      | **haute** (exigé PRD)         |
| Go/No-Go `scoreLabel` GO/WATCH/NO_GO                      | evaluation   | haute                         |
| label 3-niveaux (aligner grounding tags)                  | transverse   | moyenne                       |
| `OrgChartData` edges typés                                | organigramme | moyenne (organigramme = V1 ?) |

## Ordre proposé + méthode

1. **messages + icebreaker** (peu de contrat, gain max) → 2. **strategy** (plays/objections/questions) → 3. **signals** (grille + commercialImplication, +contrat) → 4. **contacts** (family, +contrat) → 5. **organigramme** (5 rôles/matrice) → 6. **plan** (cadence) → 7. **facts** (labeling).

- **A/B à chaque prompt** : même boîte avant/après, comparer coût + latence + qualité (la grille KB : actionnable ? hiérarchisé ? sourcé ?). Tout sur `palier1`, jamais mergé sans ta validation.
- TDD : tests prompt (structure + présence champs) mis à jour avant.
