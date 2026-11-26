# Map complète des agents — BellumAI

> Distillé depuis le doc Google Drive « 06_1_Map_complete_des_agents » (doc d'alignement).
> Cible : architecture agent visée. Aucune donnée personnelle.

## Principe directeur

Bellum n'est pas un empilement plat d'agents, mais une **chaîne structurée en couches** :
collecte → structuration/contexte → interprétation/sortie métier.

Règle produit : la complexité peut vivre sous le capot, mais la **sortie doit rester très claire et démonstrative**.
Deux écueils à éviter : (1) trop d'agents qui se chevauchent ; (2) sorties trop pauvres faute de chaîne assez structurée.

---

## Couche 1 — Collecte & enrichissement

Rôle : récupérer l'information brute utile (compte, dirigeants, contexte, signaux, contacts).
Le doc ne considère pas chaque source comme un « agent » au sens noble, mais comme des **composants** de cette couche.

| Composant | Rôle / responsabilité                       | Input                        | Output (attendu)             |
| --------- | ------------------------------------------- | ---------------------------- | ---------------------------- |
| Pappers   | Données légales, structurelles, financières | Nom / identifiant entreprise | Données légales structurées  |
| Firecrawl | Pages, contenus, annonces, signaux web      | URLs / cibles web            | Contenu web extrait, signaux |
| Brave     | Recherche web complémentaire                | Requêtes                     | Résultats web                |
| Apollo    | Emails, job titles, URLs, contacts          | Domaine / entreprise         | Contacts (email, titre, URL) |

## Couche 2 — Structuration & résumé contexte

Rôle : nettoyer, ordonner, hiérarchiser et préparer une **base lisible** pour les agents métier.
Sans elle, les agents de sortie travaillent sur du bruit trop sale, ou produisent des sorties trop fragiles.

| Agent / module                  | Rôle                                                               | Input                   | Output                           |
| ------------------------------- | ------------------------------------------------------------------ | ----------------------- | -------------------------------- |
| Structuration / résumé contexte | Nettoie et hiérarchise la donnée brute en base de contexte lisible | Données brutes Couche 1 | Contexte structuré pour Couche 3 |

## Couche 3 — Agents de sortie métier

Lecture la plus claire à ce jour : **au moins 5 grands agents de sortie**.
Ils doivent produire une **vraie lecture commerciale**, pas une simple reformulation de la donnée.
C'est là que system prompts, contexte user et schémas de sortie deviennent critiques.

| Agent               | Rôle / responsabilité                   | Input                                 | Output (attendu)                        |
| ------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------- |
| Agent contacts      | Identifier/qualifier les bons contacts  | Contexte structuré + données contacts | Liste de contacts qualifiés             |
| Agent organigramme  | Reconstituer la structure décisionnelle | Contexte + contacts/titres            | Organigramme / hiérarchie décisionnelle |
| Agent messages      | Rédiger les messages prêts à envoyer    | Contexte + contacts + angle           | Messages personnalisés                  |
| Agent Go / No-Go    | Décision/qualification de l'opportunité | Contexte commercial agrégé            | Verdict Go / No-Go argumenté            |
| Agent plan d'action | Construire le plan d'action commercial  | Contexte + verdict + contacts         | Plan d'action séquencé                  |

---

## Attentes de la cartographie (ce que le doc demande de trancher)

Pour chaque agent / couche, statuer sur :

- ce qui **existe déjà vraiment** vs ce qui est encore **théorique** ;
- ce qui doit être **fusionné** ;
- ce qui mérite un **prompt spécifique** ;
- ce qui peut être **repoussé en V2**.

Manque encore, en face de cette map : les **prompts existants**, les **schémas de sortie attendus**, et le **statut réel** de chaque agent/couche.

---

## Correspondance avec les prompts BellumAI existants

(`agent_docs/prompts.md` — 7 system prompts ; routers `apps/ia/app/routers/`)

| Agent de la map                                            | Prompt / router existant                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Collecte & enrichissement (Pappers/Firecrawl/Brave/Apollo) | PROMPT 1 BELLUM-RESEARCH (Phase 1) — `phase1_research.py`                   |
| Structuration / résumé contexte                            | `summary.py` (résumé contexte) ; partiellement intégré dans BELLUM-RESEARCH |
| Agent contacts                                             | PROMPT 2 BELLUM-CONTACTS (Phase 3) — `phase2_contacts.py`                   |
| Agent organigramme                                         | Pas de prompt dédié — théorique / à dériver de BELLUM-CONTACTS              |
| Agent messages                                             | PROMPT 6 BELLUM-PITCH + `icebreaker.py` ; couvre la rédaction de messages   |
| Agent Go / No-Go                                           | PROMPT 5 BELLUM-ADVISOR + `battlecard.py`                                   |
| Agent plan d'action                                        | PROMPT 3 BELLUM-PLAN (Phase 4) — `phase4_plan.py`                           |
| (hors map) Découverte de comptes                           | PROMPT 4 BELLUM-DISCOVER — `discover.py`                                    |
| (hors map) Requêtes booléennes                             | PROMPT 7 BELLUM-BOOLEAN                                                     |
