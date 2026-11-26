# Process support beta — BellumAI

> Cible : beta payante, **5 ESN max**, **~10 utilisateurs** (2 sièges/ESN), 59 €/mois.
> Lancement **~15 août 2026**. Support assuré par **Louis (dev solo)**.
> Fenêtre sensible : **Théo (commercial) en congés du 31 juillet au 14 août** → couverture minimale solo.
>
> Objectif de ce doc : un process support **léger, tenable par une seule personne**, qui
> s'appuie au maximum sur ce qui est **déjà en prod** plutôt que d'ajouter des outils.

---

## 0. Ce qui existe déjà (factuel — à réutiliser, ne pas réinventer)

Avant de choisir un canal, l'inventaire de l'existant dans le repo :

| Brique                            | Où                                                                                               | Ce que ça fait aujourd'hui                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Widget feedback in-app**        | `apps/web/src/features/feedback/FeedbackWidget.tsx`                                              | Bouton flottant global (bas-droite), visible pour tout utilisateur connecté. 3 catégories : **bug / métier / autre**. Joint **automatiquement** : URL de la page, email du reporter, user-agent, logs console récents, screenshot optionnel.            |
| **API feedback**                  | `apps/api/src/modules/feedback/feedback.service.ts` + `github-issue.service.ts`                  | POST `/feedback` (JWT). Persiste en base (`beta_feedback`) **et** ouvre automatiquement une **issue GitHub** avec tout le contexte de repro. Titre : `[beta:<catégorie>] <1re ligne>`. Labels posés d'office : `beta-feedback`, `feedback:<catégorie>`. |
| **Gate GitHub**                   | `github-issue.service.ts`                                                                        | Env-gated : actif **uniquement si** `FEEDBACK_GITHUB_TOKEN` **et** `FEEDBACK_GITHUB_REPO` (`owner/repo`) sont posés. Sinon le feedback est quand même stocké, sans issue. **À vérifier avant le 15/08** (voir checklist).                               |
| **Vue manager**                   | `apps/dashboard-manager/src/app/feedback/page.tsx` → `/internal/feedback` (guard secret interne) | Liste tous les feedbacks (récent-first), y compris ceux sans issue GitHub. C'est la **console de triage** côté ops.                                                                                                                                     |
| **Email transactionnel (Resend)** | `apps/api/src/modules/mailer/`                                                                   | Envoi **sortant** prod via Resend (`RESEND_FROM`), OTP / welcome / reset. Supporte `Reply-To` + liste de suppression. ⚠️ **Resend = envoi uniquement**, ce n'est pas une boîte de réception.                                                            |
| **Observabilité**                 | 3 projets **Sentry** (API / IA / Web), logs **Railway** (api + ia + redis), **Supabase** (BDD)   | Voir §5 Runbook.                                                                                                                                                                                                                                        |

**Constat clé** : le **couple widget in-app → issue GitHub auto-triée** est déjà le meilleur canal
d'intake bug pour un solo (repro complète, zéro ressaisie). Le process ci-dessous s'articule autour
de lui. Il n'y a **pas** aujourd'hui de lien « support / aide » dédié dans `/settings` : le widget
flottant est la seule surface support. La boîte support est **`support@bellum-it.com`** — confirmée
par Louis le 13/09/2026 ; c'est l'adresse qu'affiche déjà l'app (`apps/web/src/components/ContactDialog.tsx`)
et que Laura donne à qui demande un humain, hors marque blanche (Resend, lui, n'envoie que).

---

## 1. Canal support — recommandation

### Comparatif pour 5 clients / solo founder

| Canal                              | Pour                                                                                                                         | Contre                                                                                                                    | Coût mise en place                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Widget in-app** (existe)         | Repro auto (page, console, screenshot, compte), issue GitHub triée sans ressaisie, zéro friction reporter, zéro setup client | Nécessite d'être connecté à l'app ; pas de fil de conversation                                                            | **0** (déjà live)                 |
| **Email `support@bellum-it.com`**  | Async (compatible solo), universel, threadé, cherchable, un seul point d'entrée pour 5 clients, archive écrite               | Resend n'envoie que ; il faut une **vraie boîte réceptrice** (Google Workspace / alias) ; repro moins riche que le widget | **Faible** (créer la boîte/alias) |
| **WhatsApp Business**              | Instantané, fort taux de réponse, culture mobile des commerciaux ESN, rassure en beta, signal P0 immédiat                    | Pas de threading/recherche, pas d'archive dans GitHub, **always-on** épuisant en solo, intrusif pendant les congés        | Faible (1 numéro)                 |
| **Slack Connect (1 canal/client)** | Riche, threadé, canaux partagés, standard B2B                                                                                | **Tous les ESN n'ont pas Slack**, setup par client, **5 canaux à surveiller**, lourd pour des SMB 2 sièges                | Moyen (×5)                        |

### Recommandation

- **Canal principal (structuré) : le widget in-app → issue GitHub.** C'est le chemin par défaut pour
  **tout bug**. On demande explicitement aux clients de l'utiliser (« bouton en bas à droite ») car il
  attache la repro tout seul → un solo ne perd pas de temps à redemander « quelle page ? quel
  navigateur ? ». **À dire au kickoff de chaque ESN.**
- **Canal principal (humain) + fallback : email `support@bellum-it.com`.** Une **boîte partagée unique**
  pour les 5 clients : relationnel, questions, feedbacks non-bug, et fallback quand un client ne peut pas
  ouvrir l'app (bug de login, page blanche). Async → batchable → **compatible solo**. Réponses possibles
  via Resend (`Reply-To` déjà géré) ou directement depuis la boîte.
- **Urgence P0 uniquement : WhatsApp Business, un seul numéro** partagé aux 5 ESN, réservé au « je suis
  bloqué, là, maintenant ». Justification solo : donne le **signal P0 immédiat** et rassure les clients
  beta, **sans le coût** de 5 canaux Slack à monitorer. Règle affichée au client : « WhatsApp = blocage
  total uniquement ; tout le reste = widget ou email ».
- **Écarté pour l'instant : Slack Connect.** 5 canaux à surveiller en solo pour 5 clients de 2 sièges =
  surcoût d'attention non justifié. À reconsidérer si un client majeur l'exige ou au passage à l'échelle.

> **Un client, trois portes, une hiérarchie claire** : _bug → widget ; question/relationnel → email ;
> blocage total → WhatsApp_. Tout finit en **issue GitHub** (le widget automatiquement, l'email/WhatsApp
> saisis à la main par Louis). GitHub Issues = **la** source de vérité du support.

---

## 2. Templates

### 2.1 Bug report (client)

**Le widget in-app remplit déjà 80 % de ça automatiquement.** Ce template sert de **secours** (email /
WhatsApp) et de rappel de ce qu'on attend. À coller dans le mail de kickoff.

```
Titre court : ______________________________________________

1. Ce que je faisais / ce que j'attendais :
   __________________________________________________________

2. Ce qui s'est passé à la place :
   __________________________________________________________

3. Compte (entreprise) analysé au moment du bug : ____________
   (nom + si possible l'URL de la page)

4. Heure approximative (utile pour retrouver les logs) : _____

5. Capture d'écran : (joindre)

6. Navigateur + appareil : (ex. Chrome / Mac, Safari / iPhone)

7. Est-ce bloquant ? (je ne peux plus rien faire / je peux
   contourner / c'est du confort)
```

### 2.2 Feedback structuré — check J+3 (par client, après 1re analyse)

Envoyé **3 jours ouvrés** après le premier run réel du client. Court, 5 min à remplir.

```
Objet : BellumAI — ton avis à chaud (3 min)

1. Sur une échelle de 1 à 5, à quel point le dossier généré t'a été utile ? __
2. Qu'as-tu fait concrètement avec (envoyé un message ? appelé ? rien ?) : ___
3. La donnée la plus fausse ou douteuse que tu as vue : ______________________
4. La chose qui t'a fait gagner le plus de temps : __________________________
5. S'il ne devait y avoir qu'UNE amélioration cette semaine : _______________
```

### 2.3 Feedback hebdo (tous les clients, rituel du vendredi)

```
Objet : BellumAI — le point de la semaine

- Combien d'analyses lancées cette semaine ? ____
- Une victoire (RDV décroché, info utile, temps gagné) ? ____________________
- Un irritant récurrent ? ___________________________________________________
- Note globale de la semaine /10 : ____
- Un truc que tu aimerais voir la semaine prochaine : _______________________
```

> Cadence : **J+3 par client** (onboarding), puis **hebdo groupé** (vendredi). Les réponses
> alimentent la boucle produit (§6).

---

## 3. Triage — labels & responsabilité

### 3.1 Échelle de priorité

| Label  | Définition                                                                                                                                    | Exemples                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **P0** | **Bloquant** : prod down, login KO, ou **donnée fausse présentée comme vraie** (violation directe de la règle « jamais de données fictives ») | App inaccessible, analyse qui échoue systématiquement, contact/organigramme inventé, mauvais crédit débité |
| **P1** | **Feature dégradée mais contournable**                                                                                                        | Une source ne remonte pas, export CSV cassé, lenteur forte, un onglet vide mais le reste marche            |
| **P2** | **Confort / amélioration**                                                                                                                    | Wording, UX, tri, nice-to-have, idée métier                                                                |

> Règle d'or beta : **toute donnée fausse = P0**, même si l'app « marche ». C'est le cœur de la
> promesse produit et la première cause de perte de confiance d'un client ESN.

### 3.2 Qui, où, comment

- **Qui triage** : **Louis** (seul pendant la beta et les congés de Théo). Théo relaie et priorise le
  fond métier à son retour (14/08).
- **Où** : **GitHub Issues** du repo `Bellum-AI/belllum-monorepo`. C'est déjà là qu'atterrissent les
  feedbacks du widget. Vue de travail : `is:issue is:open label:beta-feedback`.
- **Comment** : à chaque nouvelle issue (widget = automatique, email/WhatsApp = créée à la main par
  Louis), on ajoute **un** label de priorité `P0`/`P1`/`P2` + le label `beta-client` si c'est un client
  (vs interne). Le widget pose déjà `beta-feedback` + `feedback:<catégorie>`.

### 3.3 Créer les labels — commandes `gh` exactes

À lancer **une fois** avant le 15/08 (depuis la racine du repo, authentifié `gh auth login`).
`--force` met à jour si le label existe déjà.

```bash
# Priorités (les 3 essentiels — n'existent pas encore)
gh label create "P0" --color B60205 --force \
  --description "Bloquant : prod down / login KO / donnee fausse — accuse <4h, fix 24-48h"
gh label create "P1" --color D93F0B --force \
  --description "Feature degradee mais contournable — cible <72h"
gh label create "P2" --color FBCA04 --force \
  --description "Confort / amelioration — backlog"

# Feedback beta (le widget les pose deja ; on fixe couleur + description)
gh label create "beta-feedback" --color 5319E7 --force \
  --description "Retour issu de la beta"
gh label create "feedback:bug" --color D73A4A --force \
  --description "Retour beta categorise bug"
gh label create "feedback:metier" --color 0E8A16 --force \
  --description "Retour beta metier / produit"
gh label create "feedback:autre" --color C5DEF5 --force \
  --description "Retour beta autre"

# Provenance : distinguer un retour client d'un retour interne
gh label create "beta-client" --color 1D76DB --force \
  --description "Signale par un client beta (vs interne)"
```

> Vérifier ensuite : `gh label list | grep -E "P0|P1|P2|beta"`.
> ⚠️ Les descriptions sont volontairement **sans accents** : `gh label create` peut refuser certains
> caractères selon la version. Le contenu reste lisible.

---

## 4. SLA beta (réaliste pour un solo)

| Priorité | Accusé de réception | Cible de résolution                                 | Comm                                   |
| -------- | ------------------- | --------------------------------------------------- | -------------------------------------- |
| **P0**   | **< 4 h ouvrées**   | Fix ou **workaround** sous **24-48 h**              | Accusé immédiat + point à chaque étape |
| **P1**   | < 1 jour ouvré      | **< 72 h ouvrées**                                  | Accusé + date estimée                  |
| **P2**   | < 3 jours ouvrés    | **Backlog** (regroupé, priorisé aux calls feedback) | Ack simple « noté, backlog »           |

**Heures ouvrées** = lun-ven, 9 h-19 h (Europe/Paris). Pas d'engagement week-end en beta solo (à assumer
explicitement auprès des clients au kickoff — c'est **normal et sain** pour un produit à 59 €/mois porté
par une personne).

### Fenêtre congés Théo (31 juillet → 14 août) — quoi promettre

Théo est le commercial, **pas** le support technique : son absence ne coupe pas le support (c'est Louis).
Mais c'est une **couverture réduite d'une seule personne**, potentiellement pendant l'onboarding des
premiers clients. Règles :

- **Promettre uniquement le P0** sur cette fenêtre : « bug bloquant → traité sous 24-48 h ; le reste →
  noté et adressé à partir du 15/08 ». Ne **pas** promettre de P1/P2 rapide.
- **Prévenir les clients à l'avance** (mail d'onboarding) : « fenêtre de rodage 31/07-14/08, équipe
  réduite, on garantit les blocages critiques ; le rythme complet démarre le 15/08 ».
- **Définir une plage de disponibilité quotidienne** (ex. « je regarde les alertes 2×/jour : 9 h et
  17 h ») plutôt que de prétendre à du temps réel.
- **Message d'absence** sur la boîte `support@` : accusé auto qui rappelle le canal WhatsApp pour un P0.
- Si Louis est lui-même indisponible un jour : le dire, décaler, ne jamais laisser un P0 silencieux.

> Principe : **sous-promettre, sur-livrer**. En beta, la confiance vient de la tenue de la parole, pas
> de la vitesse absolue.

---

## 5. Runbook incidents

### 5.1 Où regarder (dans l'ordre)

1. **Reproduire** depuis l'issue : le widget joint déjà page + console + user-agent + compte. Souvent
   suffisant pour localiser.
2. **Sentry (3 projets)** — l'erreur exacte + la correlation-id :
   - **Web** (front minifié en prod, stacktrace approximative), **API** (NestJS), **IA** (FastAPI).
   - Filtrer par heure du bug (template §2.1 point 4) et par email utilisateur si dispo.
   - Rappel repo : **ne jamais** `captureException` à la main — tout passe par `logger.error(...)`, la
     correlation-id relie web ↔ api ↔ ia.
3. **Railway logs** — api / ia / redis. Chercher la **correlation-id** vue dans Sentry pour suivre la
   requête bout en bout. Pour une analyse qui échoue : suivre le job **BullMQ** (worker) + les logs IA.
4. **Supabase** — état des données du compte concerné (table `accounts`, `contacts`, `analysis_runs`,
   `user_credits`…). Vérifier RLS (`auth.uid() = user_id`) si un client « ne voit pas » ses données.
   ⚠️ **Accès en lecture d'abord** ; toute écriture corrective = sauvegarde/log préalable.
5. **dashboard-manager** `/feedback` + vues admin — contexte client, quota, crédits.

### 5.2 Escalade

- **P0 donnée fausse** → identifier la phase du pipeline IA (collecte / classify / plan) via
  `agent_docs/pipeline.md`. Si un provider ment (source externe), **couper** la source fautive (flag/env)
  plutôt que de servir du faux → cohérent avec « échec API = erreur claire, pas de fallback inventé ».
- **P0 prod down** → vérifier déploiement Railway récent (rollback possible) et statut Supabase/Vercel.
- **Au-delà de Louis** : le fond métier attend Théo (14/08). Un doute juridique/données perso (RGPD) →
  `agent_docs/security.md`, ne rien exposer côté client entre-temps.

### 5.3 Templates de communication client (FR)

**Accusé de réception (P0)**

```
Bonjour {prénom},

Bien reçu, merci de l'avoir signalé — je regarde ça tout de suite.
Je reviens vers toi avec un point d'ici {délai : ex. « la fin de matinée »}.

En attendant, si tu peux : {question de repro si besoin — compte concerné, heure exacte}.

Louis — BellumAI
```

**Workaround (en attendant le fix)**

```
Bonjour {prénom},

J'ai localisé le souci ({1 phrase, sans jargon}). Le correctif arrive sous {délai}.

En attendant, tu peux contourner ainsi : {étapes concrètes}.
Désolé pour la gêne, et merci — ce retour nous fait progresser.

Louis
```

**Résolu**

```
Bonjour {prénom},

C'est corrigé ✅ — {ce qui a été fait, en 1 phrase}. Tu peux réessayer :
{action précise : recharger la page / relancer l'analyse}.

Dis-moi si c'est bon de ton côté. Merci d'avoir remonté le bug.

Louis
```

**Feedback P2 pris en compte (attente gérée)**

```
Bonjour {prénom},

Bien noté 👍 — c'est ajouté à notre liste d'améliorations. Ce n'est pas
bloquant donc on le priorisera avec les autres retours au prochain point.
Merci pour l'idée !

Louis
```

---

## 6. Boucle feedback → produit

Chaque retour beta doit **converger vers GitHub Issues** puis vers une décision. Le chemin :

```
Widget in-app ─┐
Email support  ├─► Issue GitHub (label beta-feedback + priorité) ─► Triage Louis
WhatsApp (P0) ─┘                                                        │
Call feedback J+3 / hebdo ──────────────────────────────────────────────┘
                                                                         ▼
                          P0/P1 : traité tout de suite (SLA §4)
                          P2   : backlog, regroupé
                                                                         ▼
                     Revue hebdo (vendredi) : Louis + Théo (dès 14/08)
                          → décision : build / plus tard / non
                          → thèmes récurrents = signal produit fort
```

- **1 retour = 1 issue.** Un feedback verbal (call, WhatsApp) sans issue = perdu → Louis crée l'issue.
- **Regrouper** les doublons (label `duplicate`, existant) : 3 clients qui disent la même chose = P1
  au lieu de P2. Le **volume par thème** est le signal de priorisation n°1 en beta.
- **Calls feedback planifiés** (J+3 par client, hebdo groupé) = moment où on **relit le backlog P2**
  avec le client et où on tranche. Les décisions produit s'y prennent avec Théo dès son retour.
- **Fermer la boucle avec le client** : quand une de ses idées est shippée, le lui dire (template §5.3
  « résolu »). En beta, c'est le geste qui fidélise le plus.

---

## 7. Checklist « prêt pour le 15 août »

**Intake / canaux**

- [x] Boîte réceptrice `support@bellum-it.com` — confirmée par Louis le 13/09/2026 (l'adresse `support@bellum-ai.com` recommandée plus haut n'a pas été retenue).
- [ ] Message d'absence / accusé auto configuré sur `support@` (mentionne WhatsApp pour P0).
- [ ] Numéro **WhatsApp Business** dédié créé + partagé aux 5 ESN (règle « P0 uniquement »).
- [ ] Widget feedback in-app vérifié en prod (bouton visible connecté, envoi OK).

**GitHub / triage**

- [ ] `FEEDBACK_GITHUB_TOKEN` + `FEEDBACK_GITHUB_REPO=Bellum-AI/belllum-monorepo` posés sur l'API Railway
      (sinon les feedbacks n'ouvrent **pas** d'issue — juste stockés). Tester un envoi widget → issue.
- [ ] Labels `P0` / `P1` / `P2` / `beta-client` créés (commandes §3.3).
- [ ] Vue de triage sauvegardée : `is:issue is:open label:beta-feedback` (bookmark).
- [ ] Accès **dashboard-manager** `/feedback` vérifié (secret interne OK).

**Observabilité**

- [ ] 3 projets **Sentry** (API/IA/Web) reçoivent bien des events (DSN posés, `SENTRY_ENVIRONMENT=prod`).
- [ ] Accès **Railway** (logs api/ia/redis) et **Supabase** (SQL editor) sous la main.
- [ ] Un run d'analyse de bout en bout testé en prod (login → analyse → dossier) = smoke test.

**Clients / attentes**

- [ ] Mail d'onboarding envoyé aux 5 ESN : les 3 canaux + hiérarchie, template bug (§2.1), SLA (§4),
      note fenêtre congés 31/07-14/08 (§4).
- [ ] Cadence feedback planifiée (J+3 par client + hebdo vendredi) posée dans l'agenda.

**Congés Théo (31/07-14/08)**

- [ ] Plage de dispo quotidienne de Louis fixée et communiquée (ex. 9 h / 17 h).
- [ ] Périmètre réduit annoncé aux clients (P0 garanti, reste à partir du 15/08).

---

_Doc vivant — à ajuster après les premiers vrais incidents. Owner : Louis. Relais métier : Théo (dès 14/08)._
