# BellumAI — VISION PRODUIT MAXIMALE

> _"Le commercial ESN rêve d'un directeur commercial IA personnel. Pas d'un outil de plus. BellumAI est ce directeur."_

---

## 1. ÉTAT ACTUEL — Ce qu'on a construit

### Architecture livrée

```
bellum-ai/
├── apps/web/          React 18 + Vite + Tailwind + shadcn/ui (shell vide)
├── apps/api/          NestJS — 5 modules (auth, accounts, contacts, analysis, credits)
│                      BullMQ worker + Socket.IO gateway
├── apps/ia/           FastAPI — 6 routers, 6 services, 7 prompts
├── packages/shared/   8 types TypeScript (7 tables Supabase)
```

### Ce qui fonctionne (82 tests verts)

| Composant          | Status | Détail                                                               |
| ------------------ | ------ | -------------------------------------------------------------------- |
| Monorepo Turborepo | ✅     | pnpm workspaces, turbo build/test/dev/lint                           |
| NestJS API         | ✅     | JWT Supabase, Throttler 20 req/h, Winston, CORS, ValidationPipe      |
| BullMQ + Socket.IO | ✅     | Worker 4 phases séquentielles, events WebSocket 40/70/85/100%        |
| Apollo Search      | ✅     | 120 contacts/entreprise, pagination 5 pages, 15 titres FR            |
| Apollo Enrich      | ✅     | Email + téléphone à la demande (payant)                              |
| Brave Search       | ✅     | 8-10 requêtes ciblées en parallèle, dédup, top 30                    |
| Firecrawl          | ✅     | Scrape 15 pages //, exclut réseaux sociaux, 40K chars                |
| Pappers            | ✅     | SIREN, CA, effectifs, siège, dirigeants, établissements, NAF         |
| Claude API         | ✅     | Parsing JSON robuste (backticks, extraction {…})                     |
| Phase 1 Research   | ✅     | Brave + Firecrawl + Pappers // → Claude BELLUM-RESEARCH (25+ champs) |
| Phase 2 Contacts   | ✅     | Apollo → contacts bruts                                              |
| Phase 3 Enrich     | ✅     | Claude BELLUM-CONTACTS → rôles, organigramme, chaîne décision        |
| Phase 4 Plan       | ✅     | Claude BELLUM-PLAN → actionPlan, GO/NO-GO, offres                    |

### Ce qui manque

- **Frontend** : 0 page construite (shell React vide)
- **Supabase** : tables non créées, RLS non configuré
- **Stripe** : pas commencé
- **RAG** : service vide (pgvector, LangChain, 36 templates)
- **Deploy** : pas de CI/CD, pas de domaine
- **Chat IA** : router vide
- **Découverte comptes** : router vide
- **Tests d'intégration réels** : uniquement des mocks

### Ancien code (\_old_code/) — Ce qu'on doit surpasser

L'ancien code est un monolithe React + Supabase Edge Functions (1510 lignes pour AccountDetail.tsx seul). Il avait :

- Recherche avec autocomplétion Pappers
- Analyse avec barre de progression
- Fiche compte avec 6 onglets
- Contacts avec statuts (new/contacted/replied/meeting)
- Export CSV
- Dashboard basique
- Onboarding 12 questions
- Carte France des sites (FranceSitesMap)
- Personnalisation des textes par profil ESN
- Framer Motion animations

**Bugs critiques** : Apollo jamais appelé en prod, messages en erreur, données hardcodées, score incohérent, session perdue pendant analyse longue.

---

## 2. ARCHITECTURE DYNAMIQUE — L'IA décide tout

### Le problème actuel

Le pipeline est **statique** : 8 requêtes Brave, 15 pages Firecrawl, 5 pages Apollo. Que l'entreprise soit une PME de 50 personnes ou un groupe CAC40 avec 200 filiales.

### La solution : un orchestrateur adaptatif

```
┌─────────────────────────────────────────────────────────┐
│                    ORCHESTRATEUR IA                       │
│  Reçoit: company_name + profile_data                     │
│  Appelle Claude pour CLASSIFIER l'entreprise             │
│  → { complexity: "small"|"medium"|"large"|"mega",        │
│       estimated_entities: N, strategy: "..." }           │
└────────────────────┬────────────────────────────────────┘
                     │ adapte les paramètres
                     ▼
┌──────────────────────────────────────────────────────────┐
│ PME (< 500 salariés)        │ ETI (500-5000)            │
│ • 5 requêtes Brave          │ • 12 requêtes Brave       │
│ • 8 pages Firecrawl         │ • 15 pages Firecrawl      │
│ • 2 pages Apollo (50 max)   │ • 5 pages Apollo (120)    │
│ • 1 prompt Claude compact   │ • 2 prompts Claude        │
│ • Budget: ~$0.20            │ • Budget: ~$0.50          │
├──────────────────────────────┼───────────────────────────┤
│ Grand Groupe (5000-50000)   │ CAC40 / Mega (50000+)     │
│ • 20 requêtes Brave         │ • 30 requêtes Brave       │
│ • 20 pages Firecrawl        │ • 30 pages Firecrawl      │
│ • 5 pages Apollo x filiales │ • Apollo sur CHAQUE filiale│
│ • 3 prompts Claude          │ • 5 prompts Claude        │
│ • Recherche par filiale     │ • Sous-comptes automatiques│
│ • Budget: ~$0.80            │ • Budget: ~$2.00          │
└──────────────────────────────┴───────────────────────────┘
```

### Mécanisme de rétroaction

Après la Phase 1, l'orchestrateur **réévalue** :

- Si Claude identifie 15 filiales → relancer Brave + Apollo sur chaque filiale
- Si peu de contacts trouvés → élargir les titres de recherche
- Si données financières manquantes → chercher sur Societe.com en fallback
- Si l'entreprise a un nom ambigu → proposer une correction avant de continuer

### Prompt de classification (nouveau, Phase 0)

```
Tu es BELLUM. Classifie cette entreprise AVANT l'analyse.
Entreprise : "{company_name}"
Premiers résultats Pappers : {pappers_data}

Retourne : { complexity, estimated_entities, estimated_employees,
  search_strategy, brave_query_count, apollo_page_count,
  firecrawl_max_pages, special_instructions }
```

---

## 3. ARCHITECTURE MULTI-AGENTS

### Vue d'ensemble

```
┌──────────────────────────────────────────────────────┐
│                    ORCHESTRATEUR                      │
│  Reçoit la demande, classifie, dispatche, fusionne   │
│  Maintient l'état global de l'analyse                │
│  Décide quand un agent a besoin d'un autre agent     │
└───────┬──────┬──────┬──────┬──────┬──────┬──────┬────┘
        │      │      │      │      │      │      │
   ┌────▼──┐┌──▼───┐┌─▼────┐┌▼─────┐┌▼────┐┌▼────┐┌▼─────┐
   │RESEAR-││CONTA-││STRAT-││MESSE-││ADVI-││SCOUT││WATCH-│
   │CHER   ││CT    ││EGIST ││NGER  ││SOR  ││     ││ER    │
   │       ││HUNTER││      ││      ││     ││     ││      │
   └───────┘└──────┘└──────┘└──────┘└─────┘└─────┘└──────┘
```

### Agent 1 — RESEARCHER

**Mission** : collecter et synthétiser TOUTES les données sur une entreprise.
**Outils** : Brave, Firecrawl, Pappers, Google News, Societe.com
**Prompt system** : BELLUM-RESEARCH enrichi
**Sorties** :

- Fiche entreprise complète (50+ champs)
- Filiales et entités détaillées
- Sites France géolocalisés
- Programmes IT nommés (réels uniquement)
- Signaux d'achat datés et sourcés
- Stack technologique identifiée
- ESN concurrentes en place
- Régulations et contraintes sectorielles

**Nouveauté** : le Researcher **itère**. S'il identifie 10 filiales, il relance des sous-recherches. S'il trouve un programme IT nommé, il le scrape en profondeur. Il ne s'arrête que quand il a épuisé ses sources.

### Agent 2 — CONTACT HUNTER

**Mission** : trouver le MAXIMUM de contacts qualifiés.
**Outils** : Apollo Search, Apollo Enrich, LinkedIn Boolean, scraping pages "équipe"
**Prompt system** : BELLUM-CONTACTS enrichi
**Sorties** :

- 80-120+ contacts avec rôles décisionnels
- Organigramme reconstitué par entité
- Chaîne de décision cartographiée
- Zones non couvertes identifiées
- Contacts à sourcer manuellement (LinkedIn)
- Historique professionnel des décideurs clés

**Nouveauté** : le Contact Hunter est **agressif**. Pour un CAC40, il cherche par filiale, par site géographique, par département. Il utilise les peopleMentioned de la Phase 1 comme amorce. Il génère des recherches booléennes LinkedIn pour combler les trous.

### Agent 3 — STRATEGIST

**Mission** : produire la stratégie de conquête la plus fine possible.
**Outils** : Claude BELLUM-PLAN, RAG templates, données historiques CRM
**Prompt system** : BELLUM-PLAN enrichi + RAG
**Sorties** :

- Stratégie type (bottom-up / top-down / multi-thread / referral)
- Plan d'action séquencé 12 mois avec KPIs
- Évaluation GO/NO-GO avec score et justification
- Offres à proposer (avec pitch par offre)
- Quick wins identifiés
- Risques et contre-mesures
- Sous-comptes prioritaires par filiale
- Budget prévisionnel TJM × consultants × mois

**Nouveauté** : le Strategist utilise le **RAG CRM** — si d'autres ESN ont déjà ciblé cette entreprise, il intègre les retours d'expérience (anonymisés).

### Agent 4 — MESSENGER

**Mission** : générer des messages parfaits pour chaque canal et chaque contact.
**Outils** : Claude, RAG 36 templates, données contact + compte
**Prompt system** : BELLUM-PITCH + BELLUM-BOOLEAN
**Sorties par contact** :

- Message LinkedIn personnalisé (accroche basée sur l'actualité du contact)
- Email cold outreach (sujet + corps + CTA)
- Pitch téléphonique (ouverture → qualification → objections → closing)
- Message de relance J+7
- Message de réactivation M+3
- Recherche booléenne LinkedIn copiable
- Script RDV complet

**Nouveauté** : le Messenger ne génère pas du générique. Il utilise les RAG templates comme base de style, l'actualité du contact (changement de poste, publication LinkedIn récente) comme accroche, et les pains spécifiques de l'entreprise comme angle.

### Agent 5 — ADVISOR

**Mission** : chatbot conversationnel expert par compte.
**Prompt system** : BELLUM-ADVISOR (contexte complet du compte)
**Capacités** :

- Répondre à toute question sur le compte
- Challenger le plan d'action
- Suggérer de nouveaux angles
- Préparer un RDV en 2 minutes
- Analyser un email reçu d'un prospect
- Reformuler un pitch
- Simuler un call (jeu de rôle)
- Proposer des comptes similaires

**Nouveauté** : l'Advisor a accès à TOUT le contexte — compte, contacts, plan, messages, historique CRM, templates RAG. C'est un **directeur commercial senior virtuel**.

### Agent 6 — SCOUT

**Mission** : découvrir de nouveaux comptes par critères.
**Outils** : Brave, Pappers, Claude BELLUM-DISCOVER
**Prompt system** : BELLUM-DISCOVER
**Entrées** : critères libres ("banques à Bordeaux qui recrutent en data")
**Sorties** :

- 10-20 entreprises pertinentes avec score
- 5 décideurs potentiels par entreprise
- Angle d'approche suggéré
- Lancement automatique d'analyse pour les top 3

### Agent 7 — WATCHER

**Mission** : veille automatique sur les comptes suivis.
**Déclencheur** : CRON hebdomadaire (dimanche soir)
**Outils** : Brave, Google News, Apollo
**Sorties** :

- Nouveaux signaux d'achat détectés
- Nominations / départs de décideurs
- Appels d'offres publiés
- Offres d'emploi IT nouvelles
- Articles presse mentionnant l'entreprise
- Changements financiers (CA, restructuration)

**Livraison** : notification in-app + email digest hebdomadaire le lundi matin.

---

## 4. DONNÉES MAXIMALES — Toutes les sources

### Sources actuelles

| Source            | Données                                                                                               | Coût         | Implémenté |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| **Pappers**       | SIREN, CA, effectifs, siège, dirigeants, établissements, forme juridique, NAF, capital, date création | ~$0.02/req   | ✅         |
| **Apollo Search** | 120 contacts : nom, poste, LinkedIn, ville, pays                                                      | Gratuit      | ✅         |
| **Apollo Enrich** | Email vérifié, téléphone direct                                                                       | 1-5 crédits  | ✅         |
| **Brave Search**  | Actualités, articles, programmes IT, nominations, appels d'offres                                     | ~$0.005/req  | ✅         |
| **Firecrawl**     | Contenu markdown des sites web, communiqués, pages carrières                                          | ~$0.01/page  | ✅         |
| **Claude API**    | Analyse structurée, synthèse, plans d'action                                                          | ~$0.06/appel | ✅         |

### Sources à ajouter — Priorité Haute

| Source                    | Données                                                                                                         | Méthode                                                  | Coût estimé       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------- |
| **Pappers V2 avancé**     | Bilans complets (3 ans), brevets, marques, procédures collectives, bénéficiaires effectifs, publications BODACC | API Pappers endpoints avancés                            | ~$0.10/req        |
| **Societe.com**           | CA détaillé, résultat net, comptes annuels, organigramme groupe                                                 | Scraping Firecrawl (pages publiques)                     | ~$0.05/entreprise |
| **LinkedIn Jobs**         | Offres d'emploi IT actives (signal d'achat fort)                                                                | Scraping via Brave "site:linkedin.com/jobs {company} IT" | Inclus Brave      |
| **Welcome to the Jungle** | Offres tech, culture d'entreprise, stack technologique déclarée                                                 | Scraping Firecrawl                                       | ~$0.02/entreprise |
| **Google News**           | Actualités dernières 24h                                                                                        | Brave param `freshness=pd`                               | Inclus Brave      |
| **Infogreffe**            | Comptes annuels, statuts, PV assemblée                                                                          | API ou scraping                                          | ~$0.15/entreprise |

### Sources à ajouter — Priorité Moyenne

| Source            | Données                                                          | Méthode            |
| ----------------- | ---------------------------------------------------------------- | ------------------ |
| **Indeed / APEC** | Offres d'emploi avec budget, compétences recherchées             | Scraping Brave     |
| **Twitter/X**     | Communications officielles, signaux informels                    | API X ou Brave     |
| **Crunchbase**    | Levées de fonds, investisseurs, valorisation (startups/scaleups) | API Crunchbase     |
| **GitHub**        | Repos open source, technologies utilisées, taille équipe dev     | API GitHub         |
| **Glassdoor**     | Avis employés, salaires, culture management                      | Scraping           |
| **DILA / BOAMP**  | Marchés publics, appels d'offres officiels                       | API BOAMP gratuite |
| **BODACC**        | Publications légales (nominations, restructurations)             | API gratuite       |
| **data.gouv.fr**  | Open data entreprises (effectifs ACOSS, etc.)                    | API gratuite       |
| **Wappalyzer**    | Stack technologique du site web                                  | API ou extension   |

### Sources à ajouter — Priorité Basse (Différenciantes)

| Source                         | Données                                       |
| ------------------------------ | --------------------------------------------- |
| **Hunter.io**                  | Patterns email d'entreprise (fallback Apollo) |
| **Clearbit**                   | Enrichissement firmographique                 |
| **ZoomInfo**                   | Données contacts B2B (alternative Apollo)     |
| **Kaspr**                      | Extension Chrome données LinkedIn             |
| **Lusha**                      | Téléphones directs                            |
| **RSS Feeds**                  | Flux actualités des entreprises suivies       |
| **Patent databases (INPI)**    | Brevets déposés récemment                     |
| **Réseaux ESN (Syntec)**       | Classements, tendances sectorielles           |
| **CPU Benchmark / TechCrunch** | Signaux adoption technologique                |
| **Wayback Machine**            | Évolution du site web dans le temps           |

### Objectif par entreprise analysée

```
FICHE ENTREPRISE (50+ champs)
├── Identité : nom, SIREN, forme juridique, date création, capital
├── Financier : CA (3 ans), résultat net, trésorerie, dettes
├── Humain : effectifs (évolution), dirigeants, organigramme direction
├── Géographique : siège, établissements France (carte), filiales
├── Sectoriel : NAF, secteur, sous-secteur, réglementations
├── IT : stack techno, programmes en cours, budget IT, DSI/CTO nommés
├── Commercial : ESN en place, contrats en cours, appels d'offres
├── Signaux : nominations, recrutements IT, news, réorganisations
├── Juridique : brevets, marques, procédures, BODACC
└── Social : Glassdoor, culture, offres d'emploi

CONTACTS (80-120 par entreprise)
├── Identité : nom, prénom, poste, entité, ville
├── Professionnel : LinkedIn, email, téléphone
├── Décisionnel : rôle (sponsor/champion/...), priorité, justification
├── Contexte : historique professionnel, publications récentes
└── Approche : message LinkedIn + email + pitch téléphone personnalisés

PLAN D'ACTION (12 mois)
├── Stratégie : type, justification, risques
├── Phases : S1 → M1 → M2-3 → M3-6 → M6-12
├── Actions : verbe + contact + canal + deadline + KPI
├── Offres : titre + pitch + contact cible + pain adressé
├── Évaluation : GO/NO-GO + score + quick wins
└── Sous-comptes : filiales prioritaires + angle + contact d'entrée
```

---

## 5. FONCTIONNALITÉS COMPLÈTES

### Module 1 — Recherche et analyse

- [ ] Recherche par nom d'entreprise avec autocomplétion Pappers
- [ ] Recherche assistée IA par critères (Scout)
- [ ] Import CSV d'entreprises + analyse batch
- [ ] Correction automatique nom d'entreprise
- [ ] Détection doublons avant analyse
- [ ] File d'attente d'analyses avec priorité
- [ ] Analyse partielle (ne refaire que les phases obsolètes)
- [ ] Comparaison avant/après (re-analyse à 6 mois)

### Module 2 — Fiche compte

- [ ] Vue synthèse avec score animé et recommandation IA
- [ ] Informations générales (50+ champs)
- [ ] Carte France interactive des sites (Leaflet / Mapbox)
- [ ] Timeline des signaux d'achat (chronologique)
- [ ] Stack technologique avec logos
- [ ] ESN concurrentes avec forces/faiblesses
- [ ] Programmes IT avec détails et sources
- [ ] Bilans financiers (graphiques 3 ans)
- [ ] Arbre des filiales et entités (collapsible tree)
- [ ] Section "Ce que BellumAI recommande" (texte personnalisé)
- [ ] Export PDF complet (dossier de conquête imprimable)
- [ ] Export Excel (données structurées)
- [ ] Partage de fiche en lecture seule (lien public temporaire)

### Module 3 — Contacts et organigramme

- [ ] Liste contacts avec filtres (rôle, priorité, entité, statut)
- [ ] Organigramme interactif (React Flow) par entité
- [ ] Vue Kanban par statut (new → contacted → meeting → won)
- [ ] Enrichissement email/phone one-click (Apollo Enrich)
- [ ] Import CSV contacts additionnels
- [ ] Détection doublons contacts cross-comptes
- [ ] Historique d'interaction par contact (mini-CRM)
- [ ] Score de qualification auto-ajusté après interactions
- [ ] Fiche contact détaillée avec historique pro (LinkedIn)
- [ ] "Find similar" — trouver des contacts similaires sur d'autres comptes

### Module 4 — Plan d'action

- [ ] Timeline visuelle du plan (Gantt simplifié)
- [ ] Actions cochables avec persistence
- [ ] Attribution d'actions aux membres de l'équipe
- [ ] Rappels automatiques (intégration calendrier)
- [ ] KPIs de suivi par phase
- [ ] Évaluation GO/NO-GO avec radar chart
- [ ] Offres recommandées avec pitch copier-coller
- [ ] Quick wins mis en avant visuellement
- [ ] Sous-comptes prioritaires avec fiche mini

### Module 5 — Messages et préparation

- [ ] Messages LinkedIn générés par contact (RAG-powered)
- [ ] Emails cold outreach avec A/B variants
- [ ] Pitch cold calling complet par contact
- [ ] Script RDV structuré (opening → closing)
- [ ] Questions puissantes contextualisées
- [ ] Objections anticipées avec réponses
- [ ] Recherches booléennes LinkedIn (copiables en 1 clic)
- [ ] Séquences multi-canal (LinkedIn J0 → Email J3 → Relance J7 → Call J14)
- [ ] Templates éditables par l'utilisateur
- [ ] Historique des messages envoyés

### Module 6 — Agent IA chatbot

- [ ] Chat contextuel par compte (/chat/:accountId)
- [ ] Chat global cross-comptes (/chat)
- [ ] Préparation RDV en 2 min ("Prépare-moi pour mon call avec Jean Dupont")
- [ ] Analyse d'email reçu ("Il m'a répondu ça, qu'est-ce que j'en fais ?")
- [ ] Simulation call (jeu de rôle)
- [ ] Suggestions proactives ("Tu n'as pas relancé Marie depuis 2 semaines")
- [ ] Reformulation de pitch
- [ ] Comparaison de comptes ("Lequel est le plus prometteur ?")
- [ ] Historique conversations persistant

### Module 7 — Découverte de comptes

- [ ] Recherche par critères multiples (secteur, ville, taille, techno)
- [ ] Résultats avec score de pertinence par rapport au profil ESN
- [ ] 5 décideurs identifiés par entreprise suggérée
- [ ] Lancement analyse one-click depuis la suggestion
- [ ] Suggestions intelligentes basées sur les comptes gagnés
- [ ] Découverte par similarité ("Trouve des entreprises comme SNCF")

### Module 8 — CRM intégré

- [ ] Pipeline visuel drag-and-drop (nouveau → contacté → RDV → proposition → gagné/perdu)
- [ ] Fiche deal par opportunité
- [ ] Notes et activités par contact
- [ ] Valeur estimée du deal (TJM × consultants × mois)
- [ ] Taux de conversion par phase
- [ ] Historique complet des interactions
- [ ] Tags et catégories personnalisables
- [ ] Vue calendrier des actions à venir

### Module 9 — Dashboard pilotage

- [ ] Actions de la semaine (priorisées par IA)
- [ ] Relances en retard (avec suggestion de message)
- [ ] Top 3 comptes prioritaires du moment
- [ ] Signaux d'achat récents (timeline)
- [ ] Pipeline graphique (funnel)
- [ ] Score d'activité commercial (gamification)
- [ ] Métriques : comptes analysés, contacts enrichis, RDV obtenus
- [ ] Phrase BellumAI personnalisée ("Bonjour Théo, 3 relances urgentes...")
- [ ] Widget météo commerciale (tendance up/down)

### Module 10 — Veille automatique (CRON)

- [ ] Watchlist de comptes suivis
- [ ] Scan hebdomadaire (dimanche soir)
- [ ] Notifications in-app pour nouveaux signaux
- [ ] Email digest lundi matin
- [ ] Alertes temps réel pour signaux critiques (nomination DSI, appel d'offres)
- [ ] Configuration de la fréquence par compte

### 20 FEATURES BONUS auxquelles on n'a pas pensé

1. **Mode présentation** — Générer un deck client en 1 clic (slides avec les données du compte, à projeter en réunion commerciale)
2. **Score de timing** — "Le meilleur moment pour contacter cette entreprise est maintenant parce que..." (basé sur signaux)
3. **Mapping relationnel** — Visualiser les connexions entre contacts de différents comptes (un DSI qui a changé d'entreprise)
4. **Carnets d'adresses intelligents** — Regrouper les contacts par persona (tous les DSI, tous les CTO) cross-comptes
5. **Intelligence concurrentielle ESN** — "Capgemini est en place chez SNCF sur le programme NEMO. Voici comment les déloger."
6. **Générateur de propositions commerciales** — Squelette de propale basé sur les besoins identifiés
7. **Scoring prédictif** — ML sur les comptes gagnés historiques pour prédire le taux de conversion
8. **Mode "guerre éclair"** — Analyser 10 comptes d'un coup et recevoir un classement priorisé
9. **Réseau de prescripteurs** — Identifier les contacts qui ont recommandé des ESN dans le passé (publications LinkedIn)
10. **Alerte recrutement** — L'entreprise recrute 5 data engineers → signal qu'elle a un budget data
11. **Calculateur ROI** — "Si vous placez 3 consultants × 500€/j × 12 mois = 396K€ de CA"
12. **Mode coaching** — L'IA guide le commercial pas à pas ("Étape 1 : connecte-toi à Marie sur LinkedIn")
13. **Historique des prix** — Grille TJM par client × technologie × séniorité (RAG données CRM)
14. **Social selling score** — Analyser le profil LinkedIn du commercial et suggérer des améliorations
15. **Templates de posts LinkedIn** — Contenus à publier pour attirer l'attention des décideurs ciblés
16. **Intégration Calendly/Cal.com** — Proposer un créneau RDV directement dans le message
17. **Voice notes** — Dicter un compte-rendu de RDV, BellumAI le structure et met à jour le CRM
18. **Chrome extension** — Sur LinkedIn, afficher les données BellumAI pour chaque profil visité
19. **Slack/Teams bot** — Recevoir les alertes et interagir avec BellumAI depuis Slack
20. **Benchmark sectoriel** — "Les ESN de votre taille dans le bancaire ont un TJM moyen de 580€/j"

---

## 6. DESIGN SYSTEM — "Putain c'est beau"

### Philosophie

Le produit doit donner l'impression d'utiliser un logiciel de **2026**, pas de 2020. Chaque interaction doit être fluide, chaque donnée doit être belle. L'objectif : le commercial **montre** BellumAI à ses collègues par fierté.

### Inspirations visuelles

| App             | Ce qu'on prend                                                                                |
| --------------- | --------------------------------------------------------------------------------------------- |
| **Linear**      | Navigation clavier-first, transitions ultra-fluides, sidebars minimalistes                    |
| **Finary**      | Scores animés (cercles qui se remplissent), graphiques élégants, cards avec gradients subtils |
| **Vercel**      | Typographie parfaite, espacement généreux, dark mode de référence                             |
| **Raycast**     | Command palette (⌘K), recherche instantanée, raccourcis clavier                               |
| **Qonto**       | Tables propres, statuts colorés, UX bancaire premium                                          |
| **Notion**      | Blocks éditables, slash commands, AI inline                                                   |
| **Arc Browser** | Sidebar contextuelle, espaces de travail, micro-animations                                    |

### Palette de couleurs (Dark mode default)

```
Background:     #0A0A0B (quasi-noir profond)
Surface:        #111113 (cards, sidebars)
Surface hover:  #1A1A1D
Border:         #27272A (subtil, pas agressif)
Text primary:   #FAFAFA
Text secondary: #A1A1AA
Text muted:     #52525B

Accent violet:  #8B5CF6 (primaire BellumAI)
Accent blue:    #3B82F6 (liens, actions secondaires)
Success:        #22C55E (vert émeraude)
Warning:        #F59E0B (ambre doux)
Danger:         #EF4444 (rouge, mais jamais agressif)

Gradients:
- Hero:    linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)
- Score:   linear-gradient(135deg, #22C55E 0%, #3B82F6 100%)
- Card:    subtle radial glow on hover
```

### Typographie

```
Titres:          Inter, font-weight 700, tracking -0.02em
Corps:           Inter, font-weight 400, line-height 1.6
Données:         JetBrains Mono, font-weight 500 (chiffres, scores, CA)
Labels:          Inter, font-weight 500, text-transform uppercase, letter-spacing 0.05em, font-size 11px
```

### Micro-animations (Framer Motion)

```typescript
// Chaque card apparaît en fondu + slide up
const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }

// Stagger pour les listes (chaque item arrive 60ms après le précédent)
const stagger = { visible: { transition: { staggerChildren: 0.06 } } }

// Score circle: remplissage animé de 0 à N sur 1.2s avec easing
// Hover sur cards: scale(1.01) + shadow glow + border-color transition 200ms
// Tabs: underline slide avec spring physics
// Skeleton loaders: shimmer pulse (pas de spinner)
// Toast: slide-in depuis le bas-droit avec spring
// Page transitions: crossfade 200ms
```

### Composants signature

1. **Score Circle** — Cercle SVG animé avec gradient, score en gros au centre, label en dessous
2. **Signal Timeline** — Points sur une ligne chronologique, hover = détail, filtrables par type
3. **Organigramme** — React Flow avec nodes stylisés (photo + nom + poste), edges courbes, zoom/pan
4. **Command Palette** — ⌘K → recherche globale (comptes, contacts, actions), navigation instantanée
5. **Progress Bar Analyse** — Barre avec gradient, messages contextuels, estimation temps restant
6. **Kanban Pipeline** — Colonnes drag-and-drop avec counters, animations de déplacement
7. **Carte France** — Leaflet dark mode, markers par type de site, clusters si densité
8. **Data Table** — TanStack Table avec tri, filtre, pagination, row actions, sélection multi
9. **Chat IA** — Bulles avec markdown, code blocks, typing indicator, suggestions rapides
10. **Notification Bell** — Badge count animé, dropdown avec timeline des événements

### Responsive

- Desktop-first (l'usage principal est bureau)
- Tablette : sidebar collapsée, grille adaptée
- Mobile : navigation bottom bar, cards empilées, actions swipe

---

## 7. SÉCURITÉ

### Couche 1 — Authentification

- Supabase Auth (email + Google OAuth)
- JWT vérifié côté NestJS (JwtGuard sur toutes les routes)
- Refresh token automatique (session longue pendant analyses)
- Détection multi-device simultané → alerte + déconnexion forcée
- MFA optionnel (TOTP) pour plans Pro/Scale
- Sessions listables et révocables depuis /profile

### Couche 2 — Autorisation

- RLS Supabase sur TOUTES les tables : `auth.uid() = user_id`
- Service-role key uniquement côté serveur (NestJS + FastAPI)
- Vérification des crédits AVANT chaque analyse (pas seulement côté front)
- Rate limiting : 20 analyses/h, 100 requêtes API/min (ThrottlerGuard)
- Isolation des données : un utilisateur ne voit JAMAIS les données d'un autre

### Couche 3 — Protection des données

- Chiffrement AES-256 des emails et téléphones enrichis en BDD
- Clé de chiffrement dans Supabase Vault (pas dans le code)
- Audit trail : table `audit_logs` (who, what, when, IP)
- Logs structurés Winston (jamais de données sensibles dans les logs)
- RGPD : base légale = intérêt légitime (B2B), consentement pour le marketing
- Droit à l'effacement : endpoint DELETE /profile/data → suppression totale
- Rétention : données de contacts enrichis supprimées après 12 mois sans accès
- DPA (Data Processing Agreement) avec sous-traitants (Anthropic, Apollo, etc.)

### Couche 4 — Infrastructure

- Headers HTTP : CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- CORS restreint : `bellum-ai.com` en prod (pas de wildcard)
- Validation stricte : class-validator sur TOUS les DTOs NestJS
- Sanitisation : pas de HTML/script dans les inputs
- Dépendances : `npm audit` + Dependabot dans CI
- Secrets : variables d'environnement (jamais hardcodées, jamais côté client)
- WAF : Vercel Edge + Railway network isolation

### Couche 5 — Monitoring

- Sentry : erreurs frontend + backend + Python
- Uptime monitoring : Railway health checks + Vercel analytics
- Alerting : Sentry → Slack pour erreurs critiques
- Métriques : temps d'analyse moyen, taux d'erreur par phase, coût API par analyse
- PostHog : analytics produit (funnel onboarding, retention, feature usage)

---

## 8. PAIEMENT — Stripe

### Plans

| Plan        | Prix/mois | Analyses | Enrichissement    | Support            | Cible                |
| ----------- | --------- | -------- | ----------------- | ------------------ | -------------------- |
| **Free**    | 0€        | 3        | Non               | Email              | Découverte           |
| **Starter** | 49€       | 10       | 10 contacts/mois  | Email              | Solo                 |
| **Pro**     | 99€       | 30       | 50 contacts/mois  | Chat + prioritaire | Équipe (3 users)     |
| **Scale**   | 199€      | Illimité | 200 contacts/mois | Dédié + onboarding | Direction (10 users) |

### Implémentation Stripe

```
POST /credits/checkout       → crée une Checkout Session Stripe
POST /credits/portal         → lien Stripe Customer Portal (upgrade/downgrade/cancel)
POST /webhooks/stripe        → webhook listener (pas de JWT, vérification signature Stripe)
```

### Webhooks Stripe à écouter

| Event                           | Action                                            |
| ------------------------------- | ------------------------------------------------- |
| `checkout.session.completed`    | Créer/mettre à jour user_credits, activer le plan |
| `customer.subscription.updated` | Mettre à jour le plan (upgrade/downgrade)         |
| `customer.subscription.deleted` | Repasser en Free, conserver les données           |
| `invoice.payment_failed`        | Notifier l'utilisateur, 3 jours de grâce          |
| `invoice.paid`                  | Reset des compteurs mensuels                      |

### Logique crédits

- `accounts_used` incrémenté à chaque analyse lancée (pas à la fin)
- `enrichment_credits` décrémenté à chaque appel Apollo Enrich
- Reset mensuel automatique à la date de renouvellement
- Si limite atteinte → modal upgrade (pas de blocage silencieux)
- Historique de consommation visible dans /billing

### Revenue model

- Prix annuel avec 2 mois offerts (-17%)
- Essai gratuit 14 jours sur plan Pro (CB requise)
- Add-on enrichissement : pack 100 crédits pour 29€ (one-shot)

---

## 9. DÉPLOIEMENT

### Architecture production

```
                    ┌─ Vercel ──────────────┐
                    │  apps/web (React)      │
    bellum-ai.com → │  CDN + Edge Functions  │
                    │  Auto-deploy on push   │
                    └────────┬───────────────┘
                             │ API calls
                    ┌────────▼───────────────┐
                    │  Railway               │
                    │  ├─ apps/api (NestJS)  │
                    │  │   Port 3000         │
                    │  ├─ apps/ia (FastAPI)  │
                    │  │   Port 8000         │
                    │  └─ Redis              │
                    │      Port 6379         │
                    └────────┬───────────────┘
                             │ DB
                    ┌────────▼───────────────┐
                    │  Supabase (eu-west-1)  │
                    │  PostgreSQL + pgvector  │
                    │  Auth + Storage        │
                    └────────────────────────┘
```

### CI/CD GitHub Actions

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]

jobs:
  test-api:
    runs-on: ubuntu-latest
    steps: pnpm install → turbo test --filter=@bellum/api

  test-ia:
    runs-on: ubuntu-latest
    steps: pip install → pytest

  test-web:
    runs-on: ubuntu-latest
    steps: pnpm install → turbo test --filter=@bellum/web

  build:
    needs: [test-api, test-ia, test-web]
    steps: turbo build

  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    needs: build
    # Deploy to Railway staging + Vercel preview

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: build
    # Deploy to Railway production + Vercel production
```

### Environnements

| Env        | URL                          | Branch     | Base de données         |
| ---------- | ---------------------------- | ---------- | ----------------------- |
| Local      | localhost:5173 / 3000 / 8000 | feature/\* | Supabase local (docker) |
| Staging    | staging.bellum-ai.com        | develop    | Supabase projet staging |
| Production | bellum-ai.com                | main       | Supabase projet prod    |

### Domaine et DNS

- bellum-ai.com → Vercel (frontend)
- api.bellum-ai.com → Railway (NestJS)
- ia.bellum-ai.com → Railway (FastAPI)
- SSL automatique (Let's Encrypt via Vercel/Railway)

---

## 10. SCALABILITÉ

### Phase 1 — 10 utilisateurs (Lancement)

```
1 instance NestJS (Railway Starter, 512MB)
1 instance FastAPI (Railway Starter, 512MB)
1 Redis (Railway, 256MB)
Supabase Free/Pro (500MB, 2 CPU)
Coût infra: ~$30/mois
```

### Phase 2 — 100 utilisateurs (Croissance)

```
2 instances NestJS (Railway Pro, 1GB each)
2 instances FastAPI (Railway Pro, 1GB each)
1 Redis (Railway, 1GB, persistence)
Supabase Pro (8GB, 4 CPU, daily backups)
BullMQ concurrency: 5 workers simultanés
Cache Redis: résultats Pappers + Brave (TTL 7 jours)
Coût infra: ~$150/mois
```

### Phase 3 — 1 000 utilisateurs (Scale)

```
Auto-scaling NestJS (3-5 instances, Railway)
Auto-scaling FastAPI (3-5 instances, Railway)
Redis Cluster (3 nodes, 2GB each)
Supabase Pro + Read Replica (hot standby)
BullMQ: 10-20 workers, queues prioritaires
Cache multi-level: Redis L1 (hot) + Supabase L2 (warm)
CDN: Vercel Edge pour assets + API cache
Company cache partagé (même entreprise = 1 seule recherche)
Coût infra: ~$800/mois
```

### Phase 4 — 10 000 utilisateurs (Enterprise)

```
Kubernetes (Railway ou AWS EKS)
Horizontal pod autoscaler (CPU > 70% → +1 pod)
Redis Sentinel (HA, automatic failover)
Supabase Enterprise (dedicated instance, 32GB, read replicas x2)
BullMQ: 50+ workers, rate limiting par API provider
pgBouncer: connection pooling (10K connexions simultanées)
Elasticsearch: recherche full-text cross-comptes
S3: stockage PDF exports + documents RAG
Monitoring: Grafana + Prometheus
Coût infra: ~$5000/mois
```

### Optimisations clés

1. **Company Cache** : si SNCF a été analysé il y a < 7 jours par un autre utilisateur → réutiliser les données brutes (Brave, Firecrawl, Pappers), ne rejouer que Claude avec le profil ESN spécifique. Économie : 80% des coûts API.
2. **Queue prioritaire** : les utilisateurs Pro/Scale passent avant Free dans la queue BullMQ.
3. **Streaming** : les résultats Claude arrivent en streaming (SSE) → le frontend affiche progressivement au lieu d'attendre la fin.
4. **Precompute** : le Watcher pré-analyse les comptes suivis pendant les heures creuses.
5. **Edge caching** : Vercel Edge cache les assets statiques + les résultats d'API publics.

---

## 11. PLAN D'EXÉCUTION RÉVISÉ

### Semaine 1 — Fondations (FAIT ✅)

- [x] Monorepo Turborepo + pnpm
- [x] NestJS : modules auth, accounts, contacts, analysis, credits
- [x] FastAPI : 6 routers, 6 services, 7 prompts
- [x] Apollo search + enrich
- [x] Pipeline Phase 1-4 complet
- [x] BullMQ + Socket.IO
- [x] 82 tests verts

### Semaine 2 — Supabase + Auth + Frontend shell

- [ ] Migrations Supabase : 7 tables + RLS + pgvector extension
- [ ] Supabase Auth : email + Google OAuth
- [ ] Frontend : Layout (Sidebar + Topbar), routing, ProtectedRoute
- [ ] Login / Signup / AuthCallback
- [ ] Onboarding (12 questions) → insert profiles
- [ ] Connexion Supabase client (hooks useAuth, useProfile)
- [ ] Tests E2E auth flow

### Semaine 3 — Search + Analyse en temps réel

- [ ] Page Search : input + autocomplétion Pappers + lancement analyse
- [ ] Connexion Socket.IO frontend → barre de progression live
- [ ] Connecter NestJS → Supabase (insert accounts, contacts, plans)
- [ ] Connecter FastAPI → Supabase (save résultats chaque phase)
- [ ] Page AccountDetail : shell avec 6 onglets
- [ ] Onglet Fiche : informations générales + signaux + programmes IT
- [ ] Test E2E : search → analyse → fiche affichée

### Semaine 4 — Contacts + Organigramme

- [ ] Onglet Contacts : table filtrable, badges rôles, statuts
- [ ] Organigramme interactif (React Flow)
- [ ] Bouton Enrichir (Apollo Enrich) par contact
- [ ] Onglet Messages : LinkedIn + Email + Phone par contact
- [ ] Recherches booléennes LinkedIn
- [ ] Export CSV contacts

### Semaine 5 — Plan d'action + Évaluation

- [ ] Onglet Plan : timeline visuelle, actions cochables
- [ ] Onglet Évaluation : GO/NO-GO, radar chart, offres
- [ ] Dashboard : actions semaine, pipeline, top comptes, signaux
- [ ] Page Contacts globale (cross-comptes)
- [ ] Export PDF dossier de conquête

### Semaine 6 — Stripe + RAG

- [ ] Stripe : 4 plans, checkout, webhooks, portal
- [ ] Gestion crédits (analyses + enrichissement)
- [ ] RAG : pgvector + LangChain + 36 templates
- [ ] Messages RAG-powered (LinkedIn, email, relance)
- [ ] Pitch cold calling par contact
- [ ] Page Billing + usage

### Semaine 7 — Chat IA + Découverte

- [ ] Agent Advisor : chat par compte
- [ ] Agent Scout : découverte par critères
- [ ] Page Chat avec historique
- [ ] Page Discover avec résultats + lancement analyse
- [ ] Knowledge Base : upload documents RAG

### Semaine 8 — Polish + Deploy

- [ ] Landing page (vidéo hero, features, pricing, CTA)
- [ ] Dark mode parfait (audit chaque composant)
- [ ] Micro-animations Framer Motion partout
- [ ] Command Palette (⌘K)
- [ ] CI/CD GitHub Actions
- [ ] Deploy staging + production
- [ ] Domaine bellum-ai.com
- [ ] Sentry monitoring
- [ ] CGU + politique de confidentialité

### Semaine 9-10 — Features avancées

- [ ] Agent Watcher (veille CRON hebdo)
- [ ] Notifications in-app + email digest
- [ ] CRM pipeline drag-and-drop
- [ ] Carte France interactive
- [ ] Mode présentation (deck client)
- [ ] Architecture multi-agents (orchestrateur adaptatif)
- [ ] Phase 0 : classification dynamique de complexité
- [ ] Sources additionnelles (Societe.com, BOAMP, Google News)

### Semaine 11-12 — Scale + Enterprise

- [ ] Company cache partagé (7 jours)
- [ ] Queue prioritaire par plan
- [ ] Streaming Claude (SSE)
- [ ] Anti-partage licence
- [ ] Analytics PostHog
- [ ] Chrome extension LinkedIn
- [ ] Slack/Teams bot
- [ ] Tests de charge (k6)

### Au-delà — Différenciation

- [ ] Scoring prédictif ML
- [ ] Voice notes (dictée → CRM)
- [ ] Intégration calendrier
- [ ] Générateur propale
- [ ] Benchmark sectoriel
- [ ] Mode coaching pas à pas
- [ ] API publique pour intégrateurs

---

> **BellumAI n'est pas un outil de scraping avec une jolie interface. C'est un directeur commercial IA qui pense, planifie, rédige et conseille — 24h/24, pour chaque compte, avec toute la mémoire du monde.**
