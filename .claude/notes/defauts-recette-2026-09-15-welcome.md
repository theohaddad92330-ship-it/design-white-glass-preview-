# Défauts mesurés EN PRODUCTION sur `/welcome` — 15/09/2026

Mesuré sur `https://app.bellum-ai.com/welcome`, compte `schlegellouis2@gmail.com`, prod api `a821cab26`.
Relevé par lecture du DOM (`document.body.innerText`), pas par capture : le texte cité est verbatim.

## 1. ⛔ Le mot « probabilité » est AFFICHÉ — doctrine refusée six fois

Texte servi, verbatim :

> « Le scoring évaluera la couverture stakeholders IT (nombre et séniorité des décideurs
> identifiés), **la probabilité d'un besoin urgent** en Data/Cloud/Cybosécurité, et l'alignement
> avec tes secteurs réglementés (Fintech, Aéronautique, Industrie). »

Élément : un `<span>` de la carte « Ce que Bellum va personnalisér pour toi », bloc **Scoring**.

- **La règle** : « Aucune PROBABILITÉ — pas de "chance de closing", pas de prévisionnel pondéré,
  pas de score de fit présenté comme une chance. » Refusée **six fois** (arbitrage n°4 du 16/08 ;
  D10 du PDF 1 ; §7.7 du PDF 2 ; PDF 4 ; PDF 5 ; PDF 8). `c26_probabilite` au registre de doctrine.
- **La cause, déjà identifiée en code** (cadrage `lots-onboarding-audit.md`, item D3) :
  `apps/ia/app/models/profile_context.py:417-423` — le champ qui alimente
  `WelcomeSummary.scoringPersonalization` (consommé par
  `apps/web/src/features/welcome/view/WelcomeScreen.tsx:33` via `PERSONALIZATION_ITEMS`) demande au
  modèle « 1 phrase qui explique ce que le scoring évaluera » **sans aucun interdit sur le mot
  "probabilité"**, contrairement à `bellum_advisor.py:401`, `bellum_plan.py:372` et
  `reply_formats.py:50` qui l'interdisent explicitement.
- **Ce que ça confirme** : le cadrage disait « candidat direct ». Ce n'est plus un candidat, c'est
  une violation SERVIE. Le correctif est d'aligner ce champ sur l'interdit déjà écrit trois fois
  ailleurs dans le dépôt — pas d'en inventer un nouveau.
- Rattachement : issues **#2062 → #2065** (prompt système + anti-hallucination + scoring par axe).

## 2. ⛔ Des noms d'entreprises INVENTÉS par le modèle — « JAMAIS de donnée fictive »

Texte servi, verbatim, sous « Premières suggestions de comptes / Clique pour lancer une analyse » :

> BNP Paribas · Stellantis · Airbus · LVMH

- **La règle** : « JAMAIS de donnée fictive. Échec API → erreur claire, pas de fallback inventé. »
  (craft rule, doctrine racine).
- **La cause, déjà identifiée en code** (cadrage `lots-onboarding-audit.md`, item D4) :
  `apps/ia/app/models/profile_context.py:428-431` — le prompt dit littéralement « Privilégie des
  noms français bien connus (CAC40/SBF120 si target='Grand compte'…) ». C'est une génération LIBRE
  par le modèle depuis sa connaissance générale, **pas un tirage depuis Market Memory / DataForge /
  Entity Resolver**. Aucune garde ne couvre ce champ.
- **Pourquoi c'est grave et pas cosmétique** : ces quatre noms sont **cliquables** et lancent une
  analyse — donc consomment des crédits sur un compte que rien ne dit pertinent pour cette ESN.
  Le libellé « Clique pour lancer une analyse » transforme une hallucination en dépense.
- Rattachement : issue **#2069** (aucun nom d'entreprise inventé).

## 3. Coquille dans du texte généré, servie à l'écran

> « Data/Cloud/**Cybosécurité** » — lire « Cybersécurité ».

Même bloc que le défaut n°1, donc même origine : texte produit par le modèle et rendu tel quel.
Ce n'est pas une faute de frappe du dépôt ; c'est l'absence de relecture du texte généré.
À traiter avec #2062 → #2065 : un texte servi à l'utilisateur passe par une garde de forme.

## Ce qui est PROPRE sur cet écran (mesuré, pas supposé)

- Sonde de mise en page : **0 symptôme** (aucun élément écrasé à 0 px dans un parent large, aucun
  débordement, aucun bouton recouvrant le `<h1>`, pas de défilement horizontal du corps).
- **0 bouton sans nom accessible** (GA-32).
- Aucune valeur affichée « 0 » là où la donnée est absente.

---

## ⚠️ CORRECTION DU DIAGNOSTIC — 15/09/2026, après vérification dans `origin/main`

**La mesure en production ci-dessus est juste. La CAUSE écrite au-dessus est fausse, et la vraie cause
est plus intéressante.**

Le prompt **est déjà corrigé** dans le commit servi :
- `apps/ia/app/models/profile_context.py:431` interdit explicitement « AUCUNE PROBABILITÉ. Ni
  probabilité, ni chance de signer, ni pourcentage… », et l'interdit voyage **dans le SCHÉMA**
  (`:333-341`), ce qui est le bon endroit — c'est le schéma que le modèle lit.
  Le commentaire `:425` cite **mot pour mot** la phrase relevée ce matin : quelqu'un l'avait déjà vue.
- La garde existe et prouve les trois choses exigées : `apps/ia/tests/test_profiler_prompt_doctrine.py`
  (`test_le_prompt_systeme_interdit_explicitement_la_probabilite`, `test_la_garde_sait_dire_non_sur_la_probabilite`,
  et un témoin `test_temoin_un_taux_mesure_nest_pas_une_probabilite` qui empêche la garde d'attraper
  ce qu'elle ne vise pas).
- « Privilégie des noms français bien connus (CAC40/SBF120…) » **n'existe plus** dans le prompt des
  suggestions.

**Alors pourquoi la phrase est-elle servie ?** Parce que le contexte de profil est **PERSISTÉ**
(migration `1780000000004-AddProfileContextColumn`) et que l'écran rend la valeur **stockée** :
`WelcomeScreen.tsx:38` (`scoringPersonalization`) et `PersonalizationGrid.tsx:13`.
La phrase interdite et les quatre noms inventés ont été **générés AVANT le correctif** et dorment en base.

### La leçon, qui vaut bien au-delà de ce lot

> **Corriger un prompt ne corrige pas ce qui est déjà écrit.**
> Une garde posée à la PRODUCTION du texte ne protège pas la LECTURE du texte déjà produit. Tant qu'un
> contenu généré est persisté et rendu tel quel, la doctrine n'est tenue que pour les générations
> futures — et l'écran continue de servir la version interdite, indéfiniment, sans qu'aucun test
> ne rougisse.

Ce défaut est **structurellement invisible en CI** : la CI teste le producteur, pas le stock.
Il ne se voit qu'en mesurant l'écran EN LIGNE — exactement comme GA-33, verte pendant que 149 endroits
échouaient AA en sombre.

### Ce qu'il faut donc livrer (et qui n'était pas dans le premier diagnostic)

1. Une **garde à la LECTURE** : la valeur relue est contrôlée avant affichage. ⚠️ Un texte refusé ne
   devient pas du vide silencieux — « non mesuré » se NOMME. Le bloc dit qu'il doit être régénéré,
   **avec sa date** (« information du <date>, à régénérer »), conformément à « un fait périmé redevient
   inconnu avec sa date ».
2. Un **chemin de régénération** des contextes déjà produits. S'il faut un balayage : **simulation
   d'abord, compte affiché avant d'écrire** — sinon c'est un arrêt obligatoire.
3. La **parité démo**, aujourd'hui absente : `welcomeSummary`, `firstAnalysisSuggestions` et
   `scoringPersonalization` ont **0 occurrence** dans `demo-coverage.ts` et
   `demo-profile-context-coverage.spec.ts`.

### Conséquence sur le cadrage

Les items **D3 et D4** de `.claude/notes/lots-onboarding-audit.md` sont **périmés** : ils décrivent un
prompt qui n'existe plus. Ne pas les dispatcher tels quels.

---

## Relevé `/integrations` — 15/09/2026 — ⚠️ FAUX POSITIF DE LA SONDE, pas un défaut

Ma sonde a signalé **2 boutons sans nom accessible** sur `/integrations`. Vérification faite :
ce sont deux cases à cocher `role="checkbox"` (composant shadcn, rendu en `<button>`), **enveloppées
dans un `<label>`** dont le texte est « Comptes (lecture) » et « Contacts (lecture) ».
`<button>` est un élément **labelable** au sens HTML : le `<label>` ancêtre LUI DONNE son nom
accessible. Il n'y a donc pas de violation de GA-32 ici.

**Correction à apporter à la sonde** : ne pas se contenter de `aria-label` / texte / `title`, mais
tenir compte de `aria-labelledby`, d'un `<label for>` et d'un `<label>` ANCÊTRE. Sans ça, la sonde
crée du faux travail — et une sonde qui crie au loup finit par ne plus être lue.
Tous les autres écrans du balayage rendent **0** sur ce contrôle.

## Reste du balayage FONDATION (diff `a821cab26..ed7caa6ee`)
Sonde de mise en page : **0 symptôme** sur tous les écrans mesurés.
Aucun « 0 » affiché pour une valeur absente. Aucune clé i18n brute visible. Aucun défilement
horizontal du corps. Aucun texte d'erreur.

---

## Défaut de PRODUCTION trouvé par le lot W21 — l'e-mail partait à qui n'avait jamais rien coché

Mesuré le 15/09/2026 en écrivant les tests de `#2082.16` (« aucune case précochée »).

Le défaut n'était **pas** « une case est cochée à l'écran ». Il vivait à **quatre**
endroits, et le quatrième est le seul qui envoyait vraiment quelque chose :

1. le contrat — `packages/contracts/src/schemas/notifications.ts`, `weekly_digest: true` ;
2. `apps/api/src/modules/.../weekly-digest.service.ts:131` — `pref && … === false` ;
3. `apps/api/src/modules/.../changelog-newsletter.service.ts:188` et `:253` — même forme,
   pour `newsletter_changelog` ;
4. la base — `DEFAULT true` sur les deux colonnes, réellement écrit par `markSeeded`,
   qui insère la ligne **sans les bascules**.

⚠️ **La forme `pref && pref.weekly_digest === false` veut dire « envoie sauf refus
explicite ».** Donc quelqu'un qui n'avait **aucune ligne de préférences** — c'est-à-dire
quelqu'un qui n'avait jamais ouvert Réglages › Notifications — **recevait l'e-mail**. Il
n'avait rien décoché, parce qu'il n'avait jamais rien coché. Le témoin de la bonne forme
existait juste à côté, dans `daily-digest.service.ts:112`.

**La leçon, qui vaut au-delà de ce lot** : une valeur par défaut n'est pas « ce que dit le
contrat », c'est **ce que fait le code quand la donnée est absente**. Les deux avaient
divergé, et seul le second envoyait des e-mails.

**La ligne tenue** : une préférence qui déclenche un **ENVOI** est fausse par défaut ; une
préférence qui n'affiche qu'in-app peut être vraie (trois le sont par décision écrite —
transparence du débit, D49). Les défauts égalent désormais exactement le préréglage
« Urgent uniquement ».

⚠️ **Ce qui reste dû, et qui est un ARRÊT** : les comptes existants sont **inchangés** — la
migration est additive et ne réécrit aucune ligne. Les lignes déjà écrites par le `DEFAULT
true` portent donc toujours `weekly_digest = true` sans que personne l'ait choisi. Les
corriger est une **écriture de masse** : simulation et **compte affiché avant d'écrire**,
comme pour le balayage de régénération des contextes de profil. Ça n'a pas été lancé.
