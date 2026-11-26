# PDF 10/10 — Laura : chatbot site et copilote produit

Source : `agent_docs/sources/pdf10-laura-chatbot-site-produit-2026-08-19.pdf` (20 p., daté du 19/08/2026, gitignoré).
Tracker ouvert le 22/08/2026. Dernier des dix PDF de la série.

Le document traite **un seul livrable en deux versions** : Laura Site (site public
`apps/website`, objectif = conversion) et Laura Produit (in-app `apps/web`,
objectif = réduction du churn). Il part d'un transcript de conversation test réel
et remonte chacun de ses défauts à une ligne de code.

---

## 0. La phrase du document

> « Le code de Laura est bien écrit. […] Le problème est le cahier des charges. »

Et c'est vérifié : les quatorze défauts du §2 pointent tous vers du code qui fait
exactement ce qu'on lui a demandé. Aucun n'est un bug d'ingénierie ; treize sur
quatorze sont une consigne de prompt ou une constante qui dit ce qu'il ne faut
pas. **Le seul vrai bug de production est la fuite d'adresse e-mail (D08)**, et
c'est aussi le seul que le PDF classe P0 immédiat.

⚠️ Comme pour les PDF 1 à 9, **les marqueurs `[Confirmé — repo]` ne sont pas
fiables** : ici ils le sont pour tout `apps/website` (les 13 numéros de ligne
cités ont été vérifiés un par un, et les 14 tailles de fichier du §3 sont exactes
à la ligne près), et **faux pour l'app** — le §5.8 annonce « les 50 outils du
copilote (PDF 1 §3.1) » alors que `apps/ia/app/services/chat_tools.py` en
déclare **25**.

---

## 1. Inventaire — §2, les 14 défauts du transcript

Chacun vérifié dans le source, avec sa ligne.

| #   | Défaut                                       | Statut       | Preuve                                                                                      |
| --- | -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| D01 | Aucun avatar, en-tête en texte               | ABSENT       | `ChatWidget.tsx:182-188` — deux `<p>`, aucune image                                         |
| D02 | Le widget ne s'ouvre jamais seul             | ABSENT       | `ChatWidget.tsx:41` `useState(false)` ; `openWidget` est le seul chemin vers `true` (l.89)  |
| D03 | L'accroche est une bulle discrète à 12 s     | CONFIRMÉ     | `proactive.ts:63` `PROACTIVE_DELAY_MS = 12_000` ; `ChatWidget.tsx:165` `max-w-xs`           |
| D04 | Widget 384 × 512 px                          | CONFIRMÉ     | `ChatWidget.tsx:180` `w-[min(24rem,…)]` `h-[min(32rem,…)]`                                  |
| D05 | Ton plat, aucune chaleur                     | CONFIRMÉ     | `system-prompt.ts:71-72` « au maximum UNE question » + « Jamais plus de 4 lignes »          |
| D06 | Récitation du tarif complet sur objection    | CONFIRMÉ     | `system-prompt.ts:90` bloc `TARIFS` injecté entier, « à citer tels quels »                  |
| D07 | Lien de rendez-vous lâché au premier signal  | CONFIRMÉ     | `routing.ts:86` `if (explicit === 'book') return 'calendly'` — avant tout score             |
| D08 | **L'adresse personnelle du fondateur fuite** | **CONFIRMÉ** | `notify.ts:18` `DEFAULT_RECIPIENT = 'theo@bellum-it.com'` — **deux** chemins, voir §2       |
| D09 | « Je n'ai pas pu transmettre » répété        | CONFIRMÉ     | `route.ts:275-289` le `tool_result` d'échec est repoussé dans `messages` à chaque tour      |
| D10 | « Petite correction : … » auto-commentaire   | CONFIRMÉ     | conséquence mécanique de D09                                                                |
| D11 | Un seul message par tour                     | CONFIRMÉ     | `route.ts:326` une seule `reply` ; `ChatWidget.tsx:132` un seul message ajouté              |
| D12 | Aucune relance quand le visiteur se tait     | CONFIRMÉ     | aucun timer d'inactivité dans `ChatWidget.tsx` (le seul `setTimeout` est l'accroche, l.71)  |
| D13 | Aucune mémoire du prénom / tutoiement        | CONFIRMÉ     | `routing.ts:106` `nextQuestion` — **aucun appelant hors son propre test**, voir §3          |
| D14 | Le score de qualification ne sert à rien     | CONFIRMÉ     | `route.ts:320` `resolveRoute` n'alimente que `ctaFor` ; le score n'atteint jamais le prompt |

### Verdict de croisement

Le PDF a raison sur les quatorze. Aucun n'est PÉRIMÉ, aucun n'est déjà corrigé.

---

## 2. Ce que le croisement a trouvé EN PLUS du PDF

### 2.1 La fuite d'adresse a DEUX chemins, le PDF n'en voit qu'un

Le §2 défaut 8 et le ticket BEL-LAU-905 ne citent que `route.ts:280` — le message
d'échec de transmission renvoyé au modèle. Il y en a un second, et il ne passe
par aucun modèle :

```
route.ts:113-117   case 'support': case 'human':
                     return { kind: route, url: `mailto:${salesRecipient()}` }
```

Le CTA `support` / `human` **est une donnée structurée** : elle ne traverse ni le
prompt, ni `redactOutput`, ni aucune des gardes GL-01 à GL-08 que le §7.2
propose. Un visiteur qui écrit « j'ai un bug » ou « je veux parler à quelqu'un »
obtient un bouton dont le `href` est `mailto:theo@bellum-it.com`, sans qu'aucune
ligne de texte ne contienne l'adresse.

C'est la famille de défauts que ce dépôt connaît par cœur : **une garde qui
regarde le texte ne voit pas le champ structuré à côté**. Le ticket 905 sera donc
livré avec le CTA corrigé, et la garde GL-01 portera sur la **réponse entière**
(`reply` + `cta.url`), pas sur le seul texte.

### 2.2 `nextQuestion` et `answeredCount` sont du code mort

`routing.ts:106` et `routing.ts:119` sont exportés, documentés, testés — et
**leur seul appelant est `routing.test.ts`**. Le §2 défaut 13 le dit à moitié
(« `nextQuestion` existe mais n'est jamais transmise au modèle ») ; en réalité
elle n'est appelée nulle part du tout.

Même moule que les onze `UPDATE … RETURNING` du PDF 5, les playbooks qui
n'envoyaient rien du PDF 2, et `deriveCapabilityState` du PDF 6 : **du code
conforme, testé, que rien n'appelle**. Le PDF 6 avait déjà tiré la leçon —
`wired-write-paths.spec.ts`. Ici il n'y a pas d'écriture, donc pas de garde
existante qui couvre ; le lot 903 la branche et le test de prompt vérifie que la
question suivante arrive bien dans le contexte.

### 2.3 Le §5.8 se trompe sur le nombre d'outils du copilote

« Laura Produit utilise les 50 outils du copilote (PDF 1 §3.1) ». Le fichier
`apps/ia/app/services/chat_tools.py` en déclare **25**. Le PDF 6 avait déjà
tranché la question sous D44 : « les 50 outils copilote sous leurs noms exacts »
sont refusés, parce que renommer invalide le préfixe d'outils mis en cache pour
un gain nul. Ce point du §5.8 est donc **PÉRIMÉ** avant d'être lu.

### 2.4 Le compteur de proactivité du §5.3 existe déjà, intégralement

Le §5.3 se présente comme une « reprise et durcissement du compteur de
proactivité (PDF 6 §7) ». Les six règles qu'il énonce sont déjà en production —
`packages/contracts/src/schemas/proactivity.ts`, colonne
`notification_preferences.proactivity_cap` (migration `1789781294638`),
arbitrage `createProactiveBatch` branché dans `routines.service.ts:322`, garde
`proactivity-wired.spec.ts`. Trois règles du §5.3 sont **nouvelles** et n'ont
aucun équivalent : « 1 intervention par écran », « 20 minutes entre deux », et
les deux mécaniques de retrait (2 ignorées d'affilée → plafond à 1 pendant une
semaine ; 3 fermetures sans lecture → retrait 7 jours).

---

## 3. Inventaire — §3 à §5, par ticket

### BEL-LAU-905 — Fuite d'adresse e-mail · P0 bug de production

| Point                                                | Statut | Preuve / manque                                       |
| ---------------------------------------------------- | ------ | ----------------------------------------------------- |
| `salesRecipient()` reste pour l'envoi réel           | LIVRÉ  | `notify.ts:20`                                        |
| …mais n'est jamais rendu dans un `tool_result`       | ABSENT | `route.ts:280`                                        |
| Message d'échec sans adresse                         | ABSENT | idem                                                  |
| Échec signalé UNE fois par session                   | ABSENT | aucun marqueur de session pour l'échec                |
| Filtre de sortie sur les domaines internes           | ABSENT | `guardrails.ts:137` couvre les HÔTES, pas les e-mails |
| **(ajout) le CTA `mailto:` ne porte plus l'adresse** | ABSENT | `route.ts:117` — voir §2.1                            |

### BEL-LAU-903 — Scoring V2 et état de session serveur · P0

| Point                                                              | Statut  | Preuve / manque                                                                                                     |
| ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| Grille de score déterministe, absence = zéro                       | LIVRÉ   | `routing.ts:49-74` — la règle est déjà la bonne                                                                     |
| 8 axes / 30 points ⚠️ la source se trompe : ses tables font **32** | PARTIEL | 5 axes / 14 points alors ; `MAX_SCORE` est aujourd’hui CALCULÉ depuis les tables (`routing.ts:132`), jamais recopié |
| 4 paliers (≥20 / 12-19 / 6-11 / ≤5)                                | PARTIEL | 2 seuils (7 / 4), 3 routes                                                                                          |
| Le score ne sort jamais vers le visiteur                           | LIVRÉ   | `contract.ts:6-8`, aucun champ de score dans la réponse                                                             |
| État de session SERVEUR                                            | ABSENT  | `route.ts:40-44` — choix explicite « pas d'état serveur »                                                           |
| `leadKnown` / `askedQuestions` / `nextQuestionHint`                | ABSENT  | rien n'atteint le prompt                                                                                            |
| `tutoiement` / `firstName` mémorisés                               | ABSENT  | pas dans `LeadState`                                                                                                |
| Déblocage du lien à 3 conditions cumulées                          | ABSENT  | `routing.ts:86` — inconditionnel                                                                                    |

⚠️ **Point d'architecture** : le §3 du ticket demande « l'état vit côté serveur ».
`route.ts:40-44` documente le choix INVERSE, et pour une raison qui tient
(aucune conversation de visiteur à conserver, purger ou déclarer au RGPD). La
lecture retenue : ce que le PDF appelle « état serveur » est l'état **calculé et
re-validé côté serveur à chaque tour** — ce que fait déjà `parseUpdateLead` —
et non un stockage. On étend `LeadState`, il continue de voyager par le
navigateur, et il reste re-validé à l'arrivée. Zéro table, zéro déclaration.

### BEL-LAU-902 — Prompt système et modèle conversationnel V2 · P0

| Point                                             | Statut | Preuve / manque                        |
| ------------------------------------------------- | ------ | -------------------------------------- |
| Injection à l'exécution (tarifs, statuts, liens)  | LIVRÉ  | `system-prompt.ts:88-98` — à CONSERVER |
| Aucun secret dans le prompt                       | LIVRÉ  | `system-prompt.ts:12-16` — à CONSERVER |
| Prompt du §4.13 (5 temps, tutoiement, objections) | ABSENT | `system-prompt.ts` entier à réécrire   |
| `MAX_OUTPUT_TOKENS` 1024 → 1400                   | ABSENT | `route.ts:57`                          |
| Bibliothèque de 70 questions (§4.7)               | ABSENT | —                                      |
| Bibliothèque de 22 objections (§4.8)              | ABSENT | —                                      |
| Golden set de 20 conversations (§7.1)             | ABSENT | —                                      |

### BEL-LAU-901 — Refonte du widget · P0

| Point                                        | Statut  | Preuve / manque                                      |
| -------------------------------------------- | ------- | ---------------------------------------------------- |
| Mention « Assistante IA » toujours visible   | LIVRÉ   | `ChatWidget.tsx:187` + `chatbot.json` `header.role`  |
| Lien de confidentialité dans le widget       | LIVRÉ   | `ChatWidget.tsx:279-284`                             |
| Avatar (en-tête 40 px, messages 28 px)       | ABSENT  | — (dépend de D43)                                    |
| Ouverture automatique + 7 règles du §4.4     | ABSENT  | `proactive.ts` ne fait que la bulle                  |
| 420 × 640 px, plein écran mobile             | ABSENT  | `ChatWidget.tsx:180`                                 |
| Pastille + point de présence + badge non lu  | ABSENT  | `ChatWidget.tsx:170-172` bouton texte                |
| Indicateur de frappe animé                   | PARTIEL | `ChatWidget.tsx:212` — texte « Laura écrit… »        |
| Réponses rapides contextuelles à chaque tour | PARTIEL | `ChatWidget.tsx:156` — 4 boutons figés, premier tour |
| Mémoire 30 jours en stockage local           | ABSENT  | `sessionStorage` seulement (`ChatWidget.tsx:56`)     |
| Sortie d'intention (mouseleave desktop)      | ABSENT  | —                                                    |

### BEL-LAU-904 — Multi-message et relances de silence · P1

Tout ABSENT. Aucun mécanisme de message multiple ni de timer d'inactivité.

### BEL-LAU-906 / 907 — Laura Produit · P1, phase 2

| Point                                                    | Statut  | Preuve / manque                                                  |
| -------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| Plafond de proactivité, priorité impact×urgence×capacité | LIVRÉ   | `packages/contracts/src/schemas/proactivity.ts`                  |
| Plafond réglable 1-5 par utilisateur                     | LIVRÉ   | migration `1789781294638`                                        |
| Supprimé ≠ mis en file, reste visible                    | LIVRÉ   | idem                                                             |
| Rien à dire ⇒ rien envoyé                                | LIVRÉ   | idem                                                             |
| 1 intervention par écran                                 | ABSENT  | —                                                                |
| 20 min entre deux interventions                          | ABSENT  | —                                                                |
| Retrait après 2 ignorées / 3 fermetures                  | ABSENT  | —                                                                |
| Les 30 interventions du §5.4                             | PARTIEL | 34 routines existent ; ~12 des 30 ont un équivalent              |
| Score de santé d'espace (7 axes)                         | ABSENT  | aucun `healthScore` dans le dépôt                                |
| 3 couches de mémoire                                     | PARTIEL | `memory_pinned_facts` + chat-context ; pas de couche « produit » |
| Prompt système Laura Produit                             | ABSENT  | le copilote a `bellum_advisor`, sans persona ni proactivité      |
| 5 outils supplémentaires                                 | ABSENT  | 25 outils existants, aucun des 5                                 |
| « 50 outils du copilote »                                | PÉRIMÉ  | 25 réels ; renommage refusé par D44 du PDF 6                     |

---

## 4. Décisions du §8 — état

| ID  | Question                                     | Recommandation du PDF              | État                                 |
| --- | -------------------------------------------- | ---------------------------------- | ------------------------------------ |
| D43 | Photo IA de Laura                            | visage neutre, aucune ressemblance | **à trancher — Louis**               |
| D44 | Laura Produit : surcouche ou module distinct | surcouche                          | retenu (deux moteurs = deux vérités) |
| D45 | Le tutoiement se demande-t-il ?              | une fois, vouvoiement défaut       | **à trancher — contredit le dépôt**  |
| D46 | Laura Site réserve-t-elle le créneau ?       | non en V1                          | retenu                               |
| D47 | Historique entre deux visites ?              | oui, 30 j, stockage local          | retenu                               |
| D48 | Laura Produit exécute-t-elle à la place ?    | non                                | retenu — cohérent avec l'Action OS   |
| D49 | Laura Produit désactivable ?                 | oui                                | retenu                               |
| D50 | Score < 25 alerte l'équipe BellumAI ?        | oui                                | retenu (phase 2)                     |

---

## 5. Lots d'implémentation

Ordre imposé par le §9 du PDF, qui est le bon : le fond avant la forme.

| Lot | Ticket      | Contenu                                                                                                       |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | BEL-LAU-905 | Fuite d'adresse — **les deux chemins** (message d'échec + CTA `mailto:`)                                      |
| 2   | BEL-LAU-903 | Grille 8 axes (le barème réel fait 32 pts — `MAX_SCORE` est calculé), 4 paliers, état de qualification étendu |
| 3   | BEL-LAU-903 | L'état atteint le prompt (`leadKnown`, `askedQuestions`, `nextQuestionHint`, `tutoiement`, `firstName`)       |
| 4   | BEL-LAU-902 | Prompt §4.13 + bibliothèques questions/objections + `MAX_OUTPUT_TOKENS`                                       |
| 5   | BEL-LAU-902 | Déblocage du contact humain à 3 conditions · cas prix · cas rendez-vous                                       |
| 6   | BEL-LAU-901 | Ouverture automatique (module pur `auto-open.ts`) + les 7 règles                                              |
| 7   | BEL-LAU-901 | Refonte visuelle : avatar, dimensions, pastille, frappe animée, mobile                                        |
| 8   | BEL-LAU-901 | Mémoire 30 jours en stockage local + message de retour de visite                                              |
| 9   | BEL-LAU-904 | Multi-message (3 max) + relances de silence (45 s, 3 min)                                                     |
| 10  | §7.2        | Les 8 gardes GL-01 → GL-08 en CI                                                                              |
| 11  | §7.1        | Golden set de 20 conversations                                                                                |
| 12  | i18n        | FR / EN / DE / NL sur tous les textes nouveaux + entrée changelog                                             |

Laura Produit (906, 907) : voir §7.

---

## 6. Ce qu'on ne promet pas

| Point                                                      | Raison                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les 22 interventions dont la condition n'est pas mesurable | `DETECTABLE_KEYS` en couvre 8. Les 22 autres supposent des mesures que le dépôt ne fait pas — dater la première analyse, compter l'usage par fonctionnalité. Les deviner produirait des interventions qui se déclenchent au hasard, c'est-à-dire pire que pas d'intervention. Le catalogue reste COMPLET (c'est le contrat) ; le détecteur dit ce qu'il sait faire. |
| Le rejeu live des 20 conversations **en CI**               | Opt-in `CHATBOT_GOLDEN_LIVE=1`. Une clé de production dans les actions est une surface d'attaque ; vingt appels par poussée n'achètent rien ; et une garde qui rougit parce qu'un modèle a tourné sa phrase autrement finit désactivée. Ce qui reste en CI est la moitié DÉTERMINISTE des vingt, gratuitement.                                                      |
| La photo de Laura (D43)                                    | Aucun visage n'est livré sans validation. L'avatar est dessiné en SVG (abstrait, aucune ressemblance possible) et `NEXT_PUBLIC_LAURA_AVATAR_URL` bascule sur la photo le jour où elle existe — sans toucher au code.                                                                                                                                                |
| « Les 50 outils du copilote » du §5.8                      | PÉRIMÉ. Il y en a 25, et D44 du PDF 6 a déjà refusé le renommage : il invaliderait le préfixe d'outils mis en cache pour un gain nul.                                                                                                                                                                                                                               |
| Le vouvoiement par défaut (D45)                            | Tranché à l'inverse par Louis : le site et le produit tutoient. Le « vous » de « Vous êtes combien de consultants ? » reste un PLURIEL et n'est pas converti — « Tu es combien de consultants ? » n'est pas du français.                                                                                                                                            |
| Laura Site réserve le créneau elle-même (D46)              | Non en V1, comme le PDF le recommande : réserver exige un connecteur agenda côté site public.                                                                                                                                                                                                                                                                       |
| Laura Produit exécute une action (D48)                     | Non. Elle guide et pré-remplit ; l'exécution passe par l'Action OS, qui porte les approbations et les réservations de crédits. Un test vérifie qu'aucune entrée du catalogue ne contient de verbe d'écriture.                                                                                                                                                       |
| Le score de santé montré à l'utilisateur                   | Le §5.6 le pose comme interne, et aucune route côté application ne le rend. Ce qui sort est la CAUSE. Personne n'a envie d'apprendre que son espace vaut 38 sur 100.                                                                                                                                                                                                |
| Une seconde route pour l'interrupteur de Laura             | `laura_enabled` vit dans les préférences de notification, avec le plafond de proactivité. Deux chemins d'écriture vers le même booléen produiraient deux écrans qui se contredisent — le défaut que ce dépôt corrige depuis six chantiers.                                                                                                                          |

---

## 7. Ce que le chantier a livré, et les défauts trouvés en croisant

### Laura Site (commit `f1c37a9e`)

Les cinq tickets, dans l'ordre du §9 : 905 (bug P0), 903, 902, 901, 904. Plus les
8 gardes GL-01→GL-08 et les 20 conversations du §7.1.

**Trois choses que le PDF ne demandait pas :**

1. La fuite d'adresse avait **deux** chemins (§2.1 ci-dessus).
2. Le §4.13 hard-code « 119 € » alors que le §3.1 du **même document** interdit
   tout prix figé dans un prompt. Le montant se lit dans le bloc TARIFS injecté à
   l'exécution ; un test refuse tout montant dans le prompt nu.
3. `saysGoodbye` normalise les accents avant de comparer : `\b` est ASCII en
   JavaScript, si bien que `/\bà bientôt\b/` ne reconnaît **jamais**
   « À bientôt ». Le faux négatif se serait vu en production, sur un visiteur
   relancé après son au revoir.

### Laura Produit (commit `a263aa80`)

Le budget d'interruption durci (les 3 règles neuves du §5.3), le score de santé
(7 axes), le catalogue des 30, la détection serveur (8 sur 30, annoncées), les
5 outils copilote, le bloc de ton, l'interrupteur D49.

**Deux gardes d'architecture renforcées :**

- **GA-12 ne voyait pas `CHECK (col IS NULL OR col IN (…))`** — la forme d'une
  colonne d'énumération NULLABLE. Sa première version ne lisait que
  `ADD CONSTRAINT` (27 sur 83) ; celle-ci en ratait une famille entière.
  L'élargissement a révélé **13 contraintes invisibles**, désormais rattachées —
  dont deux dont l'énumération n'existait qu'en `z.enum([...])` **inline** au
  milieu d'un schéma, donc comparée à rien : `ACTIVITY_VERDICTS` et
  `EMAIL_LANGUAGES` sont maintenant nommées et exportées.
- **GA-05 gagne `@PersonalScope`.** Un contrôleur qui ne sert que la donnée de
  celui qui appelle DÉCLARE ce qu'il garde, au lieu de rester indistinguable de
  ceux qui ont oublié leur permission. Exiger une permission d'espace pour
  éteindre une bulle empêcherait un `viewer` de couper Laura — ce que D49
  interdit.

**Une garde neuve :** `laura-probe.spec.ts`. Le `try/catch` par axe est la bonne
conduite en production (une table absente rend `null` pour cet axe, les six
autres continuent) et un piège en développement : un nom de table FAUX produit
exactement le même `null`. Le score serait alors calculé sur quatre axes au lieu
de sept, sans que rien ne le signale. La garde compare les tables citées en SQL
brut aux entités déclarées, ce que ni le compilateur ni TypeORM ne peuvent faire.

---

## 8. Statut

**Chantier CLOS le 22/08/2026.** PR #1021 mergée, puis `d2511b59` (recette).
Suites finales : API 5705 · web 2746 · contracts 1609 · site 346 · IA 4170.

### Phase 5 — ce que la recette live a vérifié, et ce qu'elle a trouvé

**Vérifié en production, sur `bellum-ai.com` et `app.bellum-ai.com` :**

- Le bug P0 est fermé. « je veux un rdv avec Théo, le CEO » rend « Théo prend
  des créneaux quand le sujet le justifie […] dis-moi en deux mots » — une
  question AVANT le lien, et **aucune adresse**.
- « t'es trop cher » rend « Cher par rapport à quoi ? Tu compares à un outil que
  tu paies déjà, ou à un budget que tu t'es fixé ? » — **aucun chiffre, aucune
  grille**, et pas de « je note ».
- Un profil chaud (ESN, 40 consultants, dirigeant, projet budgété ce trimestre)
  déclenche trois bulles, le temps ③ CHALLENGER, la demande du prénom, et le CTA
  bascule sur « Réserver un échange ».
- Le toggle « Laura peut te parler en premier » est dans Réglages ›
  Notifications, allumé, câblé sur le chemin de préférences existant.
- `POST /laura/plan` répond 201 sur les écrans de l'app. Laura se TAIT sur un
  espace sain — ce qui est la règle, pas une panne.
- Balayage complet de la nav (Aujourd'hui, Comptes, Projets, Talents, Missions,
  Actions, Copilote, Pilotage, Paramètres) : aucune régression, aucune erreur en
  console, aucun 4xx/5xx.

**Trois défauts trouvés, corrigés et revérifiés** — voir le §7 et le commit
`d2511b59`. Ils sont la raison d'être de cette phase : les 9 000 tests étaient
verts.
