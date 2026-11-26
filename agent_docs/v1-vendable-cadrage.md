# BellumAI — V1 vendable (cadrage produit)

Source : `BELLUMAI_V1_VENDABLE_CADRAGE_LOUIS_MATTEO.pdf` — Théo Haddad, 02/07/2026.
Spec canonique du livrable V1 vendable. Ce fichier est la référence in-repo.

## Thèse

> **BellumAI ne vend pas de la donnée. BellumAI vend une décision commerciale
> actionnable.** On ne donne pas plus de data au commercial — on lui donne la
> prochaine meilleure action.

Cible : un business manager ESN (Comet, Crème de la Crème, Inos, Alten, SII,
Onepoint, ou une ESN de 20 personnes) saisit un compte → obtient un dossier de
conquête utilisable **demain matin**.

## Les 5 questions que chaque analyse doit résoudre

1. **Est-ce que ce compte vaut le coup ?** → score GO / PRUDENT / STOP justifié.
2. **Où est-ce que je rentre ?** → entités opérationnelles / bruit juridique /
   IT-digitales / prioritaires / secondaires / hors radar.
3. **Pourquoi maintenant ?** → signaux + ce que le signal veut dire pour une ESN.
4. **Qui contacter ?** → economic / technical / user / champion / procurement /
   influencer / blocker / à-vérifier / bruit. Une **shortlist actionnable**, pas 90.
5. **Quoi dire et quoi faire ?** → angle, message LinkedIn, mail, pitch tel,
   questions RDV, plan 7j/30j/60j, relance, suite.

## Les 5 statuts de vérité (obligatoire — jamais afficher une hypothèse comme un fait)

| Statut             | Définition                                                                                                      | Affichage front                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Fait**           | source identifiable (SIREN, siège, dirigeant, NAF, actu citée, offre d'emploi, contact Apollo, page officielle) | `Fait — source visible`          |
| **Signal**         | info publique qui peut indiquer qqch mais ne suffit pas seule                                                   | `Signal détecté — à interpréter` |
| **Hypothèse**      | interprétation métier                                                                                           | `Hypothèse Bellum — à valider`   |
| **Recommandation** | action conseillée                                                                                               | `Recommandation Bellum`          |
| **Risque**         | point qui peut casser la stratégie                                                                              | `Risque à vérifier`              |

## Score (§3.1 + §11.1)

- Verdict : **GO / PRUDENT / STOP** (pas GO/NO-GO). Doit expliquer POURQUOI, pas
  un chiffre nu.
- Échelle : **/25** (exemple du doc : "18/25 = PRUDENT").
- Axes : fit offre ESN · taille du compte · accessibilité · signaux récents ·
  potentiel budget · présence de contacts · risque achats/référencement · cycle
  de vente probable.

## Definition of Done V1 (validée sur plusieurs comptes réels)

1. fiche compte claire · 2. score GO/PRUDENT/STOP justifié · 3. sources + statuts
   de vérité · 4. cartographie entités utiles · 5. signaux récents interprétés ·
2. shortlist contacts utiles · 7. organigramme inféré mais honnête · 8. plan
   d'action concret · 9. ≥1 message/pitch prêt · 10. distinction fait/signal/
   hypothèse/reco · 11. sortie consommable par le front · 12. coût+latence visibles ·
3. base pour RAG/mémoire/chatbot.

## 14 modules/agents cibles (§8)

Company Resolver · Profile Interpreter · Context Interpreter · Source Collector ·
Entity Selector · Signal Interpreter · Contact Mapper · Scoring Agent · Account
Strategy Agent · Action Plan Agent · Message Agent · Quality Judge · Memory Agent
(V2) · Chatbot Agent (V2).

## 8 prompts modulaires (§9)

Scoring Compte · Sélection Entités · Interprétation Signaux · Contacts/Org · Plan
d'action · Messages · Pitch Call · Juge Qualité. (Pas un seul prompt géant.)

## Ce que Théo attend de Louis (§15)

Transformer la méthode en pipeline produit : stabiliser les contrats · dire quel
champ alimente quelle page · dire ce qui est source vs IA vs hypothèse · intégrer
le profil user à toutes les étapes · produire les sorties (scoring/contacts/plan/
messages) · préparer agents/prompts modulaires · ne pas brancher le Drive en vrac ·
**demander à Théo les règles métier** · préparer RAG/mémoire sans sur-scoper.

## Priorités immédiates (§19)

1. Stabiliser Palier 1 / contrats / frontPayload — ✅
2. Déployer front+back+IA pour tests
3. Tester plusieurs comptes de référence — ✅ (SG ×5, Doctolib, Crédit Mutuel, L'Oréal)
4. Vérifier user profile sur 2 profils ESN — ✅ (L'Oréal marketing vs data)
5. Mapper champs Louis → pages Mattéo
6. **Intégrer les règles métier cœur : score, contacts, plan, messages**
7. Nettoyer le Drive en sources RAG utilisables — ✅ (data/ harvest → app/knowledge/)
8. Produire les prompts modulaires — ✅ (bellum_facts/signals/strategy/plan/messages/organigramme ; Scoring = `plan.evaluation` + `account_score.py` ; **Quality Judge = `quality_judge.py` déterministe → `plan.quality`**)
9. Valider V1 vendable sur 5 comptes
10. Ensuite seulement : RAG profond, mémoire, chatbot, automatisations.

## Gaps ouverts vs pipeline actuel (2026-07)

- **[P1, ✅ fait]** Score GO/PRUDENT/STOP /25 — `plan.evaluation.{verdict,score,scoreBreakdown}` (verdict = bande déterministe sur le /25 recalculé côté API depuis les axes notés par le LLM ; `account_score.py`). Legacy `goNoGo`/`globalScore` backfillés. Grille 8 axes = **proposition, à valider par Théo**. Dashboard + contract MAJ.
- **[P2, ✅ fait]** 5 statuts de vérité — `truth_status.py` (vocabulaire canonique fait/signal/hypothèse/recommandation/risque + labels front + map catégorie→statut déterministe) ; émis dans `rawAnalysis.truth_statuses` (legend + categories) ; documenté schéma + contract page ④. Les tags firmo PUBLIC/HYPOTHÈSE de `sources.tags` restent (back-compat, bridge via `normalise_status`).
- **[P3, ✅ fait]** `procurement` rôle distinct (`decision_role.py` `_PROCUREMENT_RE` → vendor/achats manager = procurement, Directeur Achats reste economic ; enum contracts + CHECK DB + migration + bucket→operationnel + normalise purchasing→procurement) **+** contact score /100 + raison (`computeContactScore`/`computeContactPriorityReason` dans contracts, `topContacts[].{contactScore,priorityReason}`, dashboard + contract MAJ). Grilles /25 (score compte) et /100 (score contact) = **propositions à valider par Théo**.
