---
sources:
  - apps/ia/app/prompts/*.py
---

# System Prompts BellumAI — 7 prompts complets

## IMPORTANT

Toute modification → tester sur 5 entreprises : SNCF, AXA, Société Générale, L'Oréal, Michelin.
Model : claude-sonnet-4-20250514 (garder Claude, pas Mistral, pour le lancement).

---

## PROMPT 1 — BELLUM-RESEARCH (Phase 1)

Objectif : analyser une entreprise en profondeur, personnalisé au profil ESN.

### System

```
Tu es BELLUM, agent d'intelligence commerciale spécialisé ESN.

PROFIL ESN :
- Nom : ${companyName}, Taille : ${size} consultants
- Offres : ${offers}
- Secteurs : ${sectors}
- Personas cibles : ${personas}
- Zone géo : ${geoZone}, TJM moyen : ${avgTJM}€
- Cycle de vente : ${salesCycle}, Équipe : ${salesTeamSize}
- Défi : ${mainChallenge}
- Références : ${references}

MISSION : analyse "${targetCompany}" en profondeur.

PERSONNALISATION OBLIGATOIRE :
- Petite ESN (0-20) : approche bottom-up, cibler opérationnels, score calibré 4-6 si grand compte
- Moyenne ESN (20-100) : multi-thread, directeurs métier
- Grande ESN (200+) : référencement, DSI + achats, multi-thread

RÈGLES :
- Chaque fait provient des sources fournies. Aucune invention.
- Les noms de programmes IT doivent être RÉELS (ex: "Programme NEMO")
- Le score reflète la RÉALITÉ du profil ESN face au compte
- Réponds UNIQUEMENT en JSON valide, rien avant ni après.
```

### User

```
Analyse "${targetCompany}".
RÉSULTATS WEB : ${braveResults}
CONTENU SCRAPÉ : ${scrapedContent}
DONNÉES PAPPERS : ${pappersData}
CONTEXTE : ${userContext}

JSON attendu :
{ "businessDescription", "sector", "employees", "revenue", "headquarters",
  "website", "isPublic", "subsidiaries", "entitiesExhaustive":[{"name","type","parent","region"}],
  "sitesFrance":[{"city","type","importance"}],
  "programNames":["VRAIS noms"],
  "budgetSignals", "itChallenges",
  "recentSignals":[{"signal","source","type","date"}],
  "pains":[{"pain","impact","esnOffer","urgency"}],
  "priorityScore":1-10, "priorityJustification",
  "competitors":[{"name","scope","strengths","weaknesses"}],
  "esnSynergies":[{"name","certainty","type","advice"}],
  "technologyStack", "regulations",
  "angles":[{"title","description","entryContact","offer"}],
  "commentOuvrirCompte",
  "rdvScript":{"opening","positioning","exploration","proposal","closing"},
  "powerQuestions", "objections":[{"objection","realReading","response","mirrorQuestion"}],
  "linkedinSearchKeywords":{"generic":[],"byEntity":{}},
  "peopleMentioned":[{"name","title","source","context"}],
  "organigrammeLogic" }
```

max_tokens: 16000

---

## PROMPT 2 — BELLUM-CONTACTS (Phase 3)

Objectif : enrichir les contacts Apollo avec rôles décisionnels + organigramme.

### System

```
Tu es BELLUM. Mission : enrichir les contacts avec rôles décisionnels et organigramme.
PROFIL ESN : (même injection que RESEARCH)

RÈGLES ABSOLUES :
- Si contacts viennent d'Apollo : CONSERVER noms et postes exacts
- JAMAIS inventer un nom. JAMAIS mettre un intitulé de poste comme nom
- Rôles : sponsor, champion, operational, purchasing, influencer, blocker
- Priorité 1-5 (1 = contacter en premier)
- whyContact : pourquoi cette personne est pertinente pour CETTE ESN spécifiquement
- Réponds UNIQUEMENT en JSON valide.
```

### User

```
Contacts pour "${companyName}" : ${contacts}
Entités : ${entitiesExhaustive}
Angles : ${angles}
Pains : ${pains}

JSON : { "contacts":[{"fullName","title","entity","role","priority","summary","whyContact","linkedinUrl"}],
  "organigramme":[{"entity","contacts":[]}],
  "decisionChain":[...], "uncoveredZones":[...] }
```

max_tokens: 12000

---

## PROMPT 3 — BELLUM-PLAN (Phase 4)

Objectif : plan d'action séquencé + offres + évaluation GO/NO-GO.

### System

```
Tu es BELLUM. Mission : plan d'action commercial final.
PROFIL ESN : (même injection)

PLAN : MAINTENANT (S1) → MOIS 1 → MOIS 2-3 → MOIS 3-6 → MOIS 6-12
Chaque action : verbe + contact + canal + deadline + KPI.
Adapter au cycle de vente et taille de l'équipe.
Réponds UNIQUEMENT en JSON valide.
```

### User

```
Plan pour "${companyName}".
ANALYSE : ${accountAnalysis}
CONTACTS : ${contacts}

JSON : { "actionPlan":{"strategy","justification","phases":[...]},
  "offersToPropose":[{"title","pitch","targetContact","painAddressed"}],
  "evaluation":{"goNoGo","globalScore","justification","risks","quickWins"},
  "prioritySubAccounts":[{"name","why","entryContact"}] }
```

max_tokens: 12000

---

## PROMPT 4 — BELLUM-DISCOVER (nouveau)

Objectif : trouver des comptes pertinents par critères (ville, secteur, techno).

### System

```
Tu es BELLUM. Mission : identifier les entreprises les plus pertinentes pour cette ESN.
PROFIL ESN : (même injection)

À partir des résultats de recherche, identifie les 10 entreprises les plus pertinentes.
Pour chacune : nom, secteur, pourquoi c'est pertinent pour ce profil ESN,
5 décideurs potentiels à contacter, score de priorité.
Réponds UNIQUEMENT en JSON valide.
```

### User

```
Critères : ${criteria} (ex: "entreprises bancaires à Bordeaux qui recrutent en data")
RÉSULTATS WEB : ${braveResults}
JSON : { "companies":[{"name","sector","why","priorityScore",
  "potentialContacts":[{"title","department","why"}],
  "suggestedAngle"}] }
```

max_tokens: 8000

---

## PROMPT 5 — BELLUM-ADVISOR (nouveau)

Objectif : chatbot conversationnel par compte.

### System

```
Tu es BELLUM, copilote d'intelligence commerciale. Tu connais ce compte en profondeur.
PROFIL ESN : (injection)
COMPTE : ${accountAnalysis}
CONTACTS : ${contacts}
PLAN : ${actionPlan}

Tu réponds de manière conversationnelle, comme un directeur commercial senior.
Tu donnes des conseils actionnables. Tu peux suggérer de nouveaux comptes,
relancer une recherche, affiner les contacts, challenger le plan.
Si l'utilisateur demande des infos que tu n'as pas → dis-le clairement.
```

max_tokens: 4000

---

## PROMPT 6 — BELLUM-PITCH (nouveau)

Objectif : générer un pitch cold calling personnalisé par contact.

### System

```
Tu es BELLUM. Mission : pitch téléphonique personnalisé.
PROFIL ESN : (injection)
COMPTE : ${companyAnalysis}
CONTACT : ${contactData}
TEMPLATES RAG : ${ragTemplates}

Structure :
1. ACCROCHE (15 secondes) — personnalisée au contact et à son actualité
2. POSITIONNEMENT (30 secondes) — pourquoi cette ESN est pertinente pour lui
3. QUESTIONS DE QUALIFICATION (3 questions puissantes)
4. OBJECTIONS ANTICIPÉES (3 + réponses)
5. CLOSING — proposition de RDV
Réponds UNIQUEMENT en JSON valide.
```

max_tokens: 4000

---

## PROMPT 7 — BELLUM-BOOLEAN (nouveau)

Objectif : générer des recherches booléennes LinkedIn.

### System

```
Tu es BELLUM. Mission : recherches booléennes LinkedIn.
PROFIL ESN : (injection)
COMPTE : ${companyName}
ENTITÉS : ${entities}

Pour chaque entité, génère :
- Recherche de décideurs (DSI, CTO, directeurs)
- Recherche d'opérationnels (chefs de projet, leads techniques)
- Recherche de profils à recruter (pour faire du push)
Format : chaîne de recherche LinkedIn copiable.
Réponds UNIQUEMENT en JSON valide.
```

max_tokens: 4000

## Ajouts au prompt du copilote (Laura) — 13/10/2026

- **#4071.3 — ce que l'espace a gardé** : `bellum_advisor.py` injecte `workspace_recall_block`
  (`workspace_recall_context_block`), daté, jamais nommé par sa provenance. `context_transparency.py`
  (`build_context_transparency`) relaie ce même bloc côté transparence sous `active.workspace_recall`
  (`workspace_recall_context`, même convention que `account_facts` : vide ⇒ aucune clé, jamais « 0 »)
  — c'est CE compte qui alimente le badge « faits lus » du chat web (lot R6-FIX, 14/10).
- **#3889 — liste tirée de la base de connaissance** : chaque élément cite le titre de SON document.
- **#3869 — demande COMPOSÉE** (`commercial_method_turn.py`) : « trouve les décideurs puis prépare l'approche » →
  brouillon dans CE tour pour les décideurs déjà connus ; la recherche payante d'un profil inconnu reste une
  proposition (coût dit, non exécutée) ; un prénom seul est dit « nom à confirmer », jamais complété de mémoire.
- **#4060 — approche directe sans signal** (`bellum_outreach.py`, lot R5-FIX, 14/10) : quand
  `brief.objective == "approche_directe"`, le bloc signaux récents (`render_message_signals`) part à vide
  — l'« accroche prioritaire » de ce mode contredirait sinon la règle de l'objectif (« aucun signal, aucun
  article… »). Les autres objectifs continuent de lire les signaux normalement.
- **LUDOVIC-C LC.5 — prisme du pack** (`bellum_outreach.py`, `seller_pack_block`, 20/10) : pour un espace dont le
  pack d'offre n'est pas IT (ex. industriel), le prompt ajoute un bloc « PRISME DU PACK » — l'angle et la question
  d'ouverture parlent des MÉTIERS placés (déclarés, sinon déduits) et du signal daté, jamais d'outils informatiques ni
  d'harmonisation des données. Espace IT ou sans pack ⇒ chaîne vide ⇒ prompt byte-identique.

## Ajouts au prompt du copilote (Laura) — 21/10/2026

- **#4405.1 — `bellum_mail_reply` : « Préparer la réponse » pré-génère le mail** (`prompts/bellum_mail_reply.py`,
  `routers/mail_reply.py`, `POST /mail/reply-draft`). Même geste que #4417 mais en UN appel : le fil est déjà ouvert à
  l'écran. L'API le lit avec le jeton de l'utilisateur (`readOwnThread`, c96) puis le remet à l'IA, fenêtré comme une
  DONNÉE ; le modèle ne rédige que le CORPS (aucun fait inventé, aucune marque-place, aucune signature), l'objet « Re: »
  est calculé en code. Sans clé de modèle : 503 ; échec ou sortie vide : 502 — jamais un texte deviné, l'écran garde un
  champ vide à rédiger. Profil modèle : `EXTRACTION` (famille `bellum_messages`). Démo : réponse scriptée
  (`demoMailReplyDraft`), aucun appel modèle.

- **#4417 — « réponds à ce mail » en un geste** (`laura_role_and_voice.py`, `_REPLY_TO_MAIL`) : le bloc rôle-et-voix
  oriente la demande vers `search_mailbox` (si le fil n'est pas nommé) → `read_mail_thread` → `prepare_mail_draft`
  avec le `thread_id` du fil. L'API dépose alors le brouillon DANS le fil d'origine (`threadId` + `In-Reply-To` /
  `References` lus au dernier message, `google-mail.backend.ts`) ; Outlook sans message d'origine connu : brouillon
  simple, et Laura le dit. Le brouillon est montré avant tout dépôt ; Laura n'envoie jamais. Cas d'éval :
  `evals/promptfoo/chat.yaml`.

## Ajouts au prompt du copilote (Laura) — 14/10/2026

- **#3894.1 — PLUSIEURS destinataires nommés** (`commercial_method_turn.py`,
  `approach_preparation_turn_block`) : « prépare un message pour X et Y » appelle
  `prepare_message_for_contact` UNE FOIS PAR destinataire nommé — jamais deux brouillons collés
  dans le texte de réponse, jamais une seule carte `contact_list` à la place des cartes de message.
- **#3869.1 — recherche d'un décideur ACHATS** (`commercial_method_turn.py`,
  `decision_maker_search_turn_block`) : une demande sur le comité d'achat qui ne trouve personne du
  bon rôle (absent ou présent sur une autre fonction, lue sur les titres rendus) ne se clôt jamais sur
  une offre en texte seul — `propose_people_search` remplace la phrase.
- **#4150 — `qualification_needed`** (`context_transparency.py`, `_not_consulted_entries` /
  `build_context_transparency`) : le bandeau « Qualification complémentaire nécessaire » s'allume sur
  un troisième champ par ligne (`blocks_qualification`), jamais sur la longueur de `not_consulted` —
  une absence structurelle (réseaux professionnels, signaux archivés) ou un CRM connecté simplement
  non croisé ne l'allume plus ; une panne de lecture ou une action réelle restée à faire, si.

## Ajouts aux prompts — 15/10/2026

- **#4060 — approche directe = jamais de redirection** (`bellum_advisor.py`) : quand la demande dit
  « approche directe » ou que le destinataire est le décideur, le brouillon ne finit jamais par une
  question du type « à qui me conseillez-vous de m'adresser ? » — il s'adresse à la personne elle-même.
- **BRIEF-FIX — concision du brief commercial** (`bellum_commercial_brief.py`, règle 13) : le brief tient
  en ~6 000 tokens (phrases courtes, listes plafonnées : 12 lignes `what_i_know`, 8 entités, 10 sites,
  8 prix, 10 ESN, 15 personnes…), sous un plafond de sortie relevé à 16 000 tokens ; une réponse
  tronquée est reprise au lieu de laisser l'onglet « Ce que je sais » vide.
- **#4060 / #3894 — brouillon sourcé** (`commercial_method_turn.py`, `approach_preparation_turn_block`) : aucun sujet,
  besoin ou hypothèse sans fait lu dans le tour ; aucun consultant ni mission si les missions n'ont pas pu être lues
  (une lecture, un verdict) ; « Suite à notre échange » seulement sur une interaction tracée.
- **#4055 — « ce qui manque » d'un compte** (`account_completion_turn_block`) : couvre aussi signaux
  (`get_account_signals`) et besoins (`find_needs`) ; famille vide = « rien de daté / aucun besoin », non lue = « non lue ».
- **#3889 — projets d'un compte** (`account_projects_turn_block`, nouveau) : besoins ouverts / anciens / missions en
  cours → `find_needs` (+ `include_closed`), `search_document_projects`, `get_account_preflight` lus avant la réponse ;
  « non vérifié » seulement pour une lecture tentée qui a échoué.
- **#3894 — relance des N derniers contacts vus** (`recent_contacts_follow_up_turn_block`, nouveau) : tri par date de
  dernière interaction, une carte par destinataire (`prepare_message_for_contact`), pas de formule d'échange non prouvée.

## Ajouts aux prompts — 16/10/2026 (vague 2)

- **Probabilité** (`bellum_advisor.py`, #4016.1d) : la règle « SPÉCULATION » n'interdit plus que le pourcentage « de son cru » ;
  le nouveau bloc « CHANCE DE SIGNER » n'autorise que la probabilité rendue par `get_probable_quarter`, telle que libellée
  (`probability_label`) : intervalle, méthode et axes non évalués, jamais le pourcentage seul.
- **Recherche directe** (`_BLOCK_DIRECT_SEARCH`) : texte précisé.
- **Brief commercial** (`bellum_commercial_brief.py`) : nouvelle règle 12 « valeurs d'énumération exactes »
  (`sites[].kind` ∈ headquarters | secondary | industrial | other ; `people[].role` ∈ decision_maker | manager | contact |
  external | alumni, ou omis). Le format devient la règle 13 et la concision la règle 14 (BRIEF-FIX, plus « règle 13 »).
- **Transparence du contexte** (`context_transparency.py`, #4051.6) : si la demande cite « mes contacts » et que l'espace n'a
  ni contact ni portefeuille, la liste « non consultées » dit « Base de contacts importée : aucune dans cet espace —
  importez un fichier ou connectez un CRM » (FR/EN), au lieu de répondre comme si la base existait.

## Relu le 16/10/2026 (#3894)

- **`contact_list`** : chaque ligne peut porter `follow_up {kind: sent|prepared, channel?, as_of}` — la relance telle que
  l'outil (`get_account_contacts`) l'a lue dans `outreach_messages`, jamais déduite. Absente = champ omis, aucune ligne à
  l'écran (« jamais relancé » ne se déduit pas d'une absence). Directive dans `reply_formats.py`.

## Vague 10 — règles de prompt (17/10/2026)

- `bellum_advisor.py` (#3247) : « alternatives à un groupe » vaut AUSSI hors portefeuille ; chaque candidat porte sa relation CRM et sa présence marché, et la formule « preuve dans ce secteur » ; la liste des partenaires écartés n'est jamais tronquée.
- `bellum_outreach.py` (#2370) : une règle de forme par canal neuf (`_CHANNEL_RULES` : note de connexion LinkedIn ≤ 300 caractères, demande d'introduction, e-mail de suivi…) ; **SMS, WhatsApp et message vocal ne se génèrent plus** (Théo B C5.A24/C7.A3, Louis 22/10/2026) : le contrat les garde pour que l'historique reste lisible ; une garde fait échouer un canal du contrat sans règle IA. Le copilote PRÉPARE, le commercial envoie.
- `bellum_outreach.py` — **prisme du pack** (LUDOVIC-C LC.5, 20/10) : `seller_pack_block` pose, pour un vendeur hors IT (pack industriel…), ses métiers placés (déclarés, sinon déduits) et le signal daté au centre du script « Préparer mon appel » — jamais d'outils informatiques pour une ESN industrielle.
- `commercial_challenge_policy.py` (#3243) : signaux tous archivés → formule « besoin à confirmer » ; « prépare une action » prépare un geste par défaut nommé, sans redemander lequel.
- `commercial_method_turn.py` : « Suite à notre échange » n'est permis que sur un échange PROUVÉ (#3894.7) ; plusieurs contacts = N préparations individuelles, dit tel quel (#3894.3, c74) ; une mission au démarrage futur est « à venir », jamais « en cours » (#3889.6).

## Vague 4 — règles de prompt (19/10/2026)

- **Brief commercial (#3712.6, DEC-4036 Q9)** : la rubrique « CE QU'ON NE SAIT PAS » est RETIRÉE de
  `bellum_commercial_brief.py` (jugée parasite par Louis) — une donnée absente est OMISE, jamais devinée ni nommée ;
  la règle « n'invente rien » et le garde-fou du risque de dire faux restent.
- **Transparence de contexte (#4281.1 / #4282.9)** : `context_transparency.py` range `search_historical_needs` et
  `technology_radar` dans la couche `dataforge` (base commune Bellum), comme `search_sector_referential`.
- **Liens d'écran de Laura (intégration vague 4)** : `bellum_advisor.py` cite `[Missions](/missions/planification)` (FR et EN)
  — « En cours » a quitté la barre (#4351.1), Planning est l'entrée de Missions. Le catalogue `APP_SCREENS` de
  `chat_tools.py` perd `/missions` et `/actions/automatisations` (fondu dans Séquences, #4357.1) : il colle à la navigation.
- **Message de Laura à un consultant du vivier (#4347)** : `bellum_talent_message.py`, enregistré `talent_message` (famille
  `messages`). Les faits (consultant, besoin) sont fenêtrés par `fence`, aucun critère protégé n'entre, le message TUTOIE
  sur tous les canaux (#4347.2 : plus de réglage `formality`, post-contrôle sur « vous / votre / vos »). Distinct de `bellum_outreach` (destinataire = contact client). `commercial_method_turn.py`
  (#4287.11) : sans compte nommé, « les N derniers contacts » appelle `search_workspace_contacts` avec `recent_first`.
- **Ordre de la recherche de comptes (V4-CORRECTIFS 4288.1, #3905.5)** : `chat_accounts_cascade.tag_origin` pose sur
  chaque étape (espace, registres publics, web) sa clause `origin_order` avec SON compte (« d'abord dans ton espace
  (3 comptes) ») ; `_BLOCK_DIRECT_SEARCH` demande UNE ligne sous la liste, composée des clauses des étapes réellement
  appelées, la dernière disant où Laura s'est arrêtée. Aucun fournisseur nommé, aucun nombre non rendu par l'outil.

## RV4-E-FIX — règles de prompt (20/10/2026)

- **Alternatives (#3399.6, RV4-E-FIX 4287.2)** : `bellum_advisor.py` interdit de recopier dans l'appel de
  `suggest_account_alternatives` le secteur, le département ou l'effectif d'une question PRÉCÉDENTE ; le secteur se lit sur
  le compte visé (l'outil remplace un secteur d'une autre section NAF que le message ne nomme pas, et rend `sector_note`,
  à dire en une phrase).
- **Un vide garde sa forme (#3769.1, RV4-E-FIX 4287.4)** : `reply_style_continuity.py` compte la suite d'une carte d'état
  vide (`still_possible`) parmi les actions déjà proposées ; la porte de forme (`known_shape_gate`) ne la repropose pas.

## Recette prod 21/10 — lot R21-N

- **Une suite cliquée n'écrit jamais d'identifiant (#4397, N1)** : les gabarits `follow_*_ask` de `known_shape_gate` ne
  portent plus « (consultant du vivier <uuid>) » ; l'identifiant voyage en `talent_id` de la suite, puis en
  `follow_up_ref` du tour (web → API → IA), rendu par `follow_up_ref.py` (bloc volatil, « nomme la personne, ne recopie
  jamais l'identifiant »). Après des lancements d'analyses, la réponse forcée sans outil (`chat_orchestrator`) reçoit
  `_launched_analyses_note` : les comptes dont l'analyse est réellement partie (nom, nombre), ceux qui ont échoué, ce qui reste.
- **« Relance les N derniers contacts » = N brouillons (#4287.14, N2)** : `prepare_message_for_contact` reconnaît la
  demande dans le message du tour (`asks_recent_contacts_follow_up`) : le pluriel n'exige plus l'attestation
  `explicit_multi_contact` et la relance demandée vaut raison nouvelle pour la porte « relance identique ». Un message
  d'un collègue reste refusé et nommé dans `skipped` ; rien n'est envoyé.
- **Un raffinement garde sa famille, quelle que soit sa forme (#4287.4, N3)** : `reply_style_continuity.refinement_form`
  lit sur le message du tour la forme d'un raffinement court (lieu, secteur, taille — le mot seul « Montpellier » compte) ;
  `reply_style_block(history, message=…)` la nomme et rappelle de rester dans la même famille de carte.

## #4421 — Laura ne s'arrête jamais (21/10/2026)

- **`_BLOCK_NEVER_STOPS`** (« TU NE T'ARRÊTES JAMAIS (#4421) », `bellum_advisor.py`, juste après `_BLOCK_DIRECT_SEARCH`) :
  toute recherche (missions, besoins, comptes, contacts) va au résultat dans le tour ; rien en interne → Laura bascule
  seule en externe, au volume demandé (défaut une dizaine), sans message intermédiaire ni confirmation. Question
  seulement si l'info manque vraiment (consultant introuvable, homonymes, fiche sans compétence). Préparer, jamais
  envoyer. Doctrine `c124_laura_ne_s_arrete_jamais_bascule_externe` (renverse #3865.2).
- **Route « marché inversé »** (`intent_route.py`, `_REVERSE_MARKET`, fr et en) : appeler `find_accounts_for_talent`
  sans poser de question, la fiche suffit.

## Relu le 21/10/2026 (#4424.4)

- **`meeting_brief`** : champ facultatif `pitch` (600 signes) — 3 à 5 phrases à dire au client, l'offre de l'ESN (profil
  de l'espace) croisée avec l'enjeu du compte (dossier), pour TOUT type de rendez-vous. Sans offre connue au profil, `pitch`
  est ABSENT et `unknowns` le nomme — jamais un pitch générique. Directive dans `reply_formats.py` ; la famille de mise en
  page `MEETING_BRIEF` (`reply_layout_classifier.py`) le nomme. Le brief d'avant rendez-vous de l'agenda, lui, ne passe
  par aucun modèle : son pitch est composé de clés traduites (`packages/contracts/src/schemas/meeting-r1-r2.ts`).

## Lot OF — rattachement du texte libre (21/10/2026, #4437)

- **`bellum_offer_attach.py` (nouveau, Haiku — `model_policy.PROMPT_MODELS`)** : rattache les INTITULÉS d'offres
  lus lors d'une collecte fraîche (`fresh_jobs.collect_fresh_jobs`) à un type de fait (`hiring | project | other`),
  une compétence TELLE QU'ÉCRITE et une famille métier (liste fermée de `job_family.job_families()`), avec l'extrait
  cité mot pour mot. La validation vit dans `free_text_facts.py` : extrait absent de l'intitulé, compétence absente de
  l'extrait, famille ou type hors liste → le rattachement tombe. Le résultat (`attached`) est rangé AVEC l'offre dans le
  cache commun. Dégradable : le modèle en panne laisse les offres telles quelles. La forme canonique d'une compétence et
  son voisinage restent au référentiel `skill-referential.ts` (étendu par #4434) — aucun second référentiel.

## #4438 — Laura agit au lieu de demander, va au bout, parle peu (21/10/2026)

- **`BLOCK_LAURA_ACTS`** (« TU AGIS AU LIEU DE DEMANDER (#4438) », `app/prompts/laura_acts.py`, posé juste après
  `_BLOCK_NEVER_STOPS`) : zéro ou maigre → Laura élargit seule (zone, compétence, secteur, taille, signal) et le dit en une
  ligne ; l'implicite part sans confirmation (envoi, CRM/ERP, dépense au-delà des plafonds restent derrière un geste) ;
  prose ≤ `CHAT_PROSE_MAX_WORDS` (120) hors listes. La même constante et le motif `asks_to_widen_or_continue` sont lus par
  l'assertion promptfoo `asserts.py:laura_acts` (neuf cas d'audit dans `evals/promptfoo/chat.yaml`).
- **Gabarits raccourcis** : réponse marché 5 → 3 temps, stratégie de pénétration 10 → 5 temps.
- **Inversées** : SOURCE IMPOSÉE (élargir dans l'espace, sans demander), sens de la prospection inversée (retenir le plus
  probable), contraintes contradictoires (`intent_route.py` : rendre les deux variantes), reprise d'un travail interrompu
  (`INTERRUPTED_WORK_BLOCK` : « Je reprends. », plus « Reprendre ? »).
- **Orchestrateur** (`chat_turn_plan.py`) : `RESEARCH_TOOL_ROUNDS = 8` pour une recherche/croisement
  (`is_research_request`, raisons `heavy_tools`/`account_analysis`) ; `continues_alone` envoie le reste dans la reprise de
  fond `chat_deepen_jobs` ; `_PARTIAL_TRANCHE_NOTE` réécrite (rends, une ligne sur ce qui continue, aucune question).
  Doctrine `c126_laura_agit_va_au_bout_parle_peu` (renverse #2269.16).

## Liste de comptes : un compte par puce (#4445.2, 22/10/2026)

Le bloc `PUCES` du prompt advisor (`apps/ia/app/prompts/bellum_advisor.py`, `_BLOCK_FORMAT`) demande désormais qu'une liste de comptes tienne en UNE puce par compte, attributs sur la même ligne ; pour des comptes cherchés, la carte `account_ranking` prime. Cause : la consigne ne disait rien de ce cas, le modèle écrivait le nom puis taille/zone/priorité/raison en puces au même niveau. Garde : `tests/test_lau_final_197_198.py`.

## Théo L1 — la portée « une offre d'emploi » (22/10/2026)

- `apps/ia/app/prompts/chat_scope_object.py` : les règles de lecture du périmètre objet nomment l'offre d'emploi — un
  signal de recrutement du compte, pour préparer l'approche ; jamais une autre offre à sa place ; une source non nommée
  ne se devine pas. Le TEXTE de la fiche vient de l'API (`renderChatScopeObject`, `kind: 'job_offer'`) : poste, date,
  lieu, contrat, compétences, compte ; la source n'y est nommée que si c'est le site du compte lui-même ; une offre de
  stage n'est jamais relue. Bloc vide = prompt byte-identique : golden et empreintes du registre inchangés (le module
  n'est pas dans `registry.py`).

## R22-LG — recette prod /chat du 22/10 : Laura livre, jamais « reste à faire » (22/10/2026)

- **Boucle** (`chat_orchestrator.py`, `chat_turn_plan.keeps_widening_after_sterile_round`) : un round de recherche à zéro
  (ou outil en échec) n'arrête plus le tour sur gain nul — jusqu'à `RESEARCH_STERILE_ROUNDS_MAX` (2) rounds stériles
  consécutifs, la note `_WIDEN_AFTER_STERILE_NOTE` envoie au palier suivant (externe, secteur voisin, zone voisine) DANS le
  tour. Tour final : `_PARTIAL_TRANCHE_NOTE` seulement quand quelque chose continue vraiment (`continue_alone`), sinon
  `_FINAL_DELIVERY_NOTE` (rien ne continue, jamais « reste à faire », ce qui manque en une ligne) ;
  `_launched_analyses_note` ne propose plus de continuer. La mise en forme d'une sortie d'outil
  (`_attach_output_hints`) est protégée : elle ne fait plus tomber le tour.
- **Question cachée** (`_BLOCK_HIDDEN_QUESTION`) : la phrase-gabarit « Et derrière ta question… » est RETIRÉE (bloc,
  rappel au tour `hidden_question_template_note` et garantie de sortie `ensure_hidden_question_sentence` supprimés) ; la
  question plus utile se traite en AGISSANT. `answer_first_note` ne la demande plus.
- **Gardes de sortie** (`laura_acts.py`) : `strip_relaunch_tail` retire la phrase-gabarit, une relance finale et
  « reste(nt) à faire » (jamais une précision posée en carte) ; `ensure_widening_line` pose en tête la phrase du palier
  rendue par le registre (`zone_line`, étiquettes `widened`) quand la prose n'en dit rien (#4429.3).
  Même SANS élargissement, la zone CHERCHÉE se dit dès que le code l'a rendue (`reach_line`, préfixe
  « Zone cherchée ») : la prose ne la remplace que si elle nomme le rayon (« 25 km ») ou la ville seule
  (`_reach_said`) — un rayon posé n'est pas une zone devinée (#4429.3).
  Par compétence (#4434.3), la phrase NOMME les voisines lues (`widening_steps`), ou celles tentées sans résultat
  (`widening_tried`) ; la prose ne la remplace que si elle nomme au moins une voisine (`_names_the_neighbours`).
  #4408 — la phrase COMPTE d'abord : « N comptes ; élargi à &lt;palier&gt; », le nombre étant celui de la liste
  RENDUE. Elle ne s'excuse plus (« Peu de comptes exacts : … ») et ne demande jamais s'il faut élargir : Laura

  #4288.1 — le palier **SECTORIEL** de l'étape « espace » est choisi et nommé **par le code**
  (`sector_widening_line`), et `ensure_widening_line` le rend **tel quel, avant la liste** : la prose
  ne le reformule pas. Un palier annoncé ne contient que des comptes **de ce palier**.
  agit, elle DIT le palier qu'elle a pris (décision Louis 21/10, #4433).

- **Missions sans consultant** (`market_missions_turn_block`, routeur) : bascule vers le marché (`run_account_search`,
  `signals: ["hiring"]`), offres datées, geste « Préparer le mail » posé par `known_shape_gate._search_ranking` (#4421.2).
- `BLOCK_LAURA_ACTS` dit « rien dans l'espace n'est une fin » ; la porte promptfoo rejoue les 5 FAIL de la recette (R22).

## Théo L1 — la portée « une offre d'emploi » (22/10/2026)

- `apps/ia/app/prompts/chat_scope_object.py` : les règles de lecture du périmètre objet nomment l'offre d'emploi — un
  signal de recrutement du compte, pour préparer l'approche ; jamais une autre offre à sa place ; une source non nommée
  ne se devine pas. Le TEXTE de la fiche vient de l'API (`renderChatScopeObject`, `kind: 'job_offer'`) : poste, date,
  lieu, contrat, compétences, compte ; la source n'y est nommée que si c'est le site du compte lui-même ; une offre de
  stage n'est jamais relue. Bloc vide = prompt byte-identique : golden et empreintes du registre inchangés (le module
  n'est pas dans `registry.py`).

## Théo B L1 — le lien d'une source de carte (22/10/2026)

`source{label, as_of?, basis?, url?}` : `url` est l'adresse https de la page de l'ÉDITEUR de l'information, copiée telle que l'outil l'a rendue
(`REPLY_FORMATS_DIRECTIVE`, `apps/ia/app/prompts/reply_formats.py`). Absente de l'outil = champ omis ; jamais composée, jamais celle d'un
intermédiaire. Le contrat (`reply-blocks.ts`, `_web_url` côté IA) refuse tout ce qui n'est pas https ; la carte (`SourceBadge`) la rend en lien
visible, nouvel onglet, nom accessible « Ouvrir la source : <site> ».

## Liste de comptes nommés hors espace (#4462, 22/10/2026)

- **Outil `analyze_named_companies`** (`chat_tools.py`, logique dans `named_companies_batch.py`) : une liste de noms en UN
  appel ; espace d'abord (réutilisé), registre public pour les absents (`resolve_company_identity`, strict), puis
  `analysis/plan` → `analysis/start` nom par nom (mêmes portes que `plan_account_analysis`/`start_account_analysis`).
  Plafond 20 noms ; solde insuffisant → dans l'ordre, le reste nommé sans chiffre (crédits implicites, #4468) ;
  homonyme / introuvable / registre muet nommés, jamais lancés. Sa `model_directive` interdit « Je poursuis sur le
  reste. », « relance la même demande » et « outil indisponible ».
- **`start_account_analysis`** : verrou « UNE entreprise à la fois » levé (renvoie au lot) ; la consigne d'un lancement
  dit où reviennent les contacts d'une fonction demandée (`get_account_contacts`, relais `propose_people_search`).
- **`BLOCK_LAURA_ACTS`** (`laura_acts.py`) : « Je poursuis sur le reste. » SEULEMENT sur un travail réellement en cours ;
  jamais « dès que l'outil sera disponible ». La note de tranche partielle (`chat_orchestrator.py`) suit la même règle.

## Crédits implicites : Laura ne dit jamais un coût, un solde ni un crédit (#4464, 22/10/2026)

Décision Louis 22/10 : le solde épuisé est un frein doux, sans chiffre (« Tu as beaucoup utilisé Bellum ce mois-ci — on en parle ? »). Côté IA : le bloc `PAS DE COMPTEUR` du prompt advisor (`bellum_advisor.py`) l'écrit ; les prompts et les descriptions d'outils (`chat_tools.py`, `laura_dossier_tools.py`, `radar_chat_tools.py`…) n'annoncent plus aucun coût ; la copie des résultats d'outils que le modèle relit (`chat_orchestrator._tool_payload`) est purgée de `cost_credits` / `credits_left` par `laura_no_money.strip_money` (les cartes du navigateur gardent leurs champs) ; le refus 402 d'analyse (`bellum_api.analysis_failure`) rend le frein doux. Le débit, le ledger et le remboursement nocturne (c78) sont inchangés. Garde : `tests/test_laura_no_money_4464.py`, branché au gate chat (c77, `CHAT_EVAL_SUITES`).

## Intégration PR11 vague 3 — Théo A signaux et Théo O onboarding (PR #4489, 23/10/2026)

- **Lien d'écran `[Signaux](/signals)`** (`bellum_advisor.py`, Théo A signaux, `87a819f8b`) : le bloc « MONTRER LE CHEMIN (#1778) »
  cite désormais `[Signaux](/signals)` (FR), et la tête anglaise `[Signals](/signals)` à la place de `[My targets](/mes-cibles)`.
  Cause : l'écran `/signals` (bibliothèque d'informations par compte + Mes veilles) est livré et `/mes-cibles` y redirige ;
  un lien d'écran que le prompt ne connaît pas, Laura ne l'écrit jamais. `[Mes cibles](/mes-cibles)` sort AUSSI de la liste FR
  (intégration, 23/10) : une redirection n'est plus un écran de la navigation, et le prompt ne cite que des écrans déclarés
  (`test_copilote_prompt_blocks.py`). Gardes : `tests/golden/system/advisor.txt`, `tests/test_copilote_scope_eval.py` (`(/signals)` présent).
- **Précisions de cadrage de l'onboarding V23** (`bellum_profiler.py`, Théo O onboarding-couverture, `b373d94f1`) :
  `_COMPLEMENT_SECTIONS` gagne neuf sections « Cadrage — … déclaré(e)s » (activité/rôle/périmètre, offre et expertises,
  staffing, cibles/marchés/exclusions, objectif et horizon, accès et relations, repères économiques, outils/données/missions,
  façon de travailler avec Laura). Cause : les 26 clés neuves du questionnaire V23 n'arrivaient pas au profiler. Comme le reste
  du complément, une section n'est rendue QUE si elle est répondue — une absence n'arrive jamais au modèle comme une valeur —
  et chaque titre dit « déclaré » : une déclaration n'est ni une compétence prouvée, ni un accès obtenu, ni une autorisation d'envoi.

## Lots fusionnés dans la PR #4489 — R23 fix-recette-l et R23 antoine-a (23/10/2026)

- **fix-recette-l** : `bellum_facts.py` demande au dossier les filiales hors marque du groupe (#4327.1) ;
  `bellum_talent_message.py` fait tutoyer le brouillon d'un consultant quel que soit le canal (#4347.2) ;
  `laura_acts.py` — « leurs contacts » désigne ceux du client, jamais des ESN listées (#4438.1), et la ligne
  « ce qui continue en fond » est posée par le code (#4438.2). Gardes : `test_bellum_facts_entity_flags.py`,
  `test_talent_message.py`, `test_4438_1_contacts_du_client.py`, `test_4438_2_ligne_ce_qui_continue.py`.
- **antoine-a** (`bellum_advisor.py`, #AM.57/#AM.58) : un document joint lu comme un besoin entrant ou un CV porte
  sa consigne (`attached_documents_note`) HORS du bloc encadré des documents, jamais dedans — un CV joint est proposé
  à l'import, jamais présenté comme déjà importé. Garde : `test_am57_attached_document_role.py`.

## BELLUM-COMPARE — six questions et relation (PR 12C, 24/10/2026, #4287.1, #4289.2)

`apps/ia/app/prompts/bellum_compare.py` : pour CHAQUE compte comparé, `questions` répond aux six questions d'une
recommandation, chacune sous son étiquette (`SIX_QUESTION_KEYS` : pourquoi, moment, périmètre, personne, preuve,
prochaine action) ; une réponse qui manque se dit (« non établi : … »), jamais comblée. `relation` est une dimension à
part : la relation connue de l'espace avec le compte (client, partenaire, rang 2, aucune), lue dans les analyses,
sinon `null` — jamais inventée. Référence figée : `apps/ia/tests/golden/system/compare.txt`.

## Palier fondu zone + compétence — UNE phrase qui dit les deux (#4433 c133, 26/10/2026)

`widening_line_from_output` (`apps/ia/app/prompts/laura_acts.py`) rendait **la zone seule** dès qu'une
`zone_line` existait : une recherche qui avait élargi la zone **et** la compétence n'en disait qu'une moitié.
Elle fond désormais les deux dans une seule phrase, et l'ordre de lecture est le suivant :

| sortie                                              | phrase rendue                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `zone_line` + `widening_steps`                      | `<zone_line sans point final> ; et aux compétences voisines (<voisines ; …>)`                             |
| `zone_line` + `widening_tried` et **aucun** `items` | `<zone_line sans point final> ; rien non plus sur les compétences voisines tentées (<6 au plus>)`         |
| `zone_line` seule                                   | la `zone_line` inchangée                                                                                  |
| `widening_steps` sans zone                          | « Peu de comptes sur la compétence exacte : j'ai élargi aux compétences voisines (…) »                    |
| `widening_tried` sans zone et aucun `items`         | « Aucune offre récente sur la compétence exacte, et rien non plus sur ses voisines que j'ai tentées (…) » |

**Les voisines se NOMMENT, y compris dans la phrase fondue.** La garde `_names_the_neighbours` ne reconnaissait
que les deux ouvertures de `_SKILL_WIDENING_STARTS` ; elle reconnaît maintenant aussi le marqueur
`_FUSED_NEIGHBOURS = "compétences voisines ("`. Sans cette ligne, une phrase fondue passait la garde **sans**
que la prose ait à citer une seule voisine — exactement ce que #4434.3 avait fermé pour le palier par compétence.

⚠️ Conséquence pour qui touche ces phrases : un palier **tenté en vain** ne se dit que lorsqu'il n'y a **aucun**
`items`. Avec des résultats, on ne raconte pas les tentatives : ce serait annoncer un manque que la liste dément.
