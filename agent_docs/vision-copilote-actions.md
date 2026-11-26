# Bellum Copilote — De la génération à l'action

> _Cadrage produit — passer de « Bellum génère et suit » à « Bellum envoie et synchronise »._
> Origine : échange Louis ↔ Théo du 15/07/2026. Doc demandé par Louis (« fais-moi un petit doc »).

---

## 1. La vision — Bellum, interface unique du sales

Théo, à son prime :

> « Que BellumAI devienne la seule interface d'un sales. Il y a toute sa data et sa business
> intelligence, mais aussi la possibilité de connecter ses outils. Bellum fait le plan d'action,
> on peut discuter avec lui dans le chatbot, mais le sales peut aussi dire _"envoie les mails que
> tu as rédigés à tous ces gens"_. »

Le plus demandé, d'après Théo : **CRM + LinkedIn**.

- **LinkedIn** : envoyer des demandes de connexion, programmer des relances, envoyer des messages.
- **CRM** : aller chercher la donnée d'un prospect **déjà présente dans ton historique CRM**, puis
  **la mettre à jour** après l'action.

En une phrase : Bellum arrête d'être un générateur de dossiers qu'on recopie ailleurs. Il devient
le **poste de commande** d'où le sales **agit** — email, CRM, LinkedIn — sans changer d'outil.

---

## 2. État des lieux honnête — on **génère + suit**, on n'**envoie + synchronise** pas encore

Aujourd'hui, chaque action sortante est soit déléguée aux outils du sales (`mailto:`, ouverture
LinkedIn dans le navigateur), soit un stub CRM « créer un contact » en écriture seule. **Aucun
envoi réel, aucune synchro deux sens, aucune action agentique.**

Mais — c'est la bonne nouvelle — **la matière première existe déjà** :

| Brique                                                            | Déjà livré                                    | Où                                                                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Brouillons email / LinkedIn / phone / relance par contact         | ✅ générés + stockés                          | `contact.entity.ts` (`email_message`, `linkedin_message`, `phone_script`, `followup_message`), écrits par `contacts.service.ts` (phase 4 IA) |
| Transport email (Resend prod / Mailpit dev)                       | ✅                                            | `mailer.service.ts` — mais **destinataire = le sales uniquement** (OTP, welcome, reset)                                                      |
| CRM connect + OAuth (HubSpot **et** Salesforce)                   | ✅                                            | `crm/`, `salesforce/`, table `crm_connections` — refresh auto + tokens chiffrés AES-256-GCM                                                  |
| CRM lire / upsert / logguer une activité                          | ❌                                            | clients = `createContact` **create-only**, un seul objet, crée des doublons                                                                  |
| Envoi d'un brouillon à un **contact**                             | ❌ (délégué à `mailto:`)                      | pas d'endpoint `send`                                                                                                                        |
| Webhooks sortants (Slack/Discord/Teams…)                          | ✅ mais **notifie le sales**, pas le prospect | `integrations/`, events `analysis.completed` + `buy_signal`                                                                                  |
| Assistant MCP — **lecture** (comptes, contacts, brouillons, plan) | ✅                                            | `apps/mcp/tools.ts`, `mcp-api.controller.ts`                                                                                                 |
| Assistant MCP / chat — **agir** (envoyer, logguer, LinkedIn)      | ❌                                            | seul `start_analysis` écrit ; chat = Q&A RAG, zéro tool-calling                                                                              |
| LinkedIn — API / automation                                       | ❌ (ouverture navigateur seulement)           | `window.open(linkedin_url)`, brouillon `linkedin_message`                                                                                    |
| Journal d'action (qui a fait quoi)                                | ✅ mais déclaratif                            | `user_actions` logue « message_sent » alors que Bellum n'a rien envoyé                                                                       |

**Le pattern qui revient partout : la donnée (brouillon) est là, il manque la couche
_exécution + write-back_ + les garde-fous.** Chaque palier ci-dessous s'appuie sur une
fondation déjà en prod.

> ⚠️ `VISION.md` à la racine est un doc aspirationnel ancien (« 0 page front », « 82 tests ») —
> ne pas s'y fier pour l'état réel. Ce doc-ci fait foi pour le périmètre « actions sortantes ».

---

## 3. Roadmap séquencée (effort × impact)

### Palier 0 — Fiabiliser l'email transactionnel _(fait — 15/07)_

Prérequis absolu avant tout envoi sortant : que les mails partent en prod. Le bug « les nouveaux
sales ne reçoivent jamais le code par mail » venait d'un piège de config (voir §5). **Corrigé.**
Sans délivrabilité solide, rien de la suite ne tient.

### Palier 1 — « Envoie l'email » — le quick win de Louis

Les deux moitiés dures existent déjà : **(a)** le brouillon (`contact.email_message`), **(b)** un
transport Resend qui marche (`mailer.service.ts`). Le branchement est petit ; **le vrai travail,
ce sont les garde-fous.**

- `POST /contacts/:id/send-email` → prend le brouillon stocké, l'envoie via le transport existant.
- Version en masse : « envoie à tous ces contacts » (le cœur de la demande de Théo).
- Garde-fous (le vrai coût) :
  - domaine d'envoi **dédié + vérifié** (SPF/DKIM/DMARC) — sinon spam direct ;
  - **opt-out / désabonnement** obligatoire + suppression list ;
  - rate-limit par sales et par domaine destinataire ;
  - **état d'envoi par contact** (`sent_at`, statut) — `user_actions.plan_action_message_sent`
    devient enfin réel au lieu de déclaratif ;
  - capture des réponses (v1.1, plus lourd : Resend inbound / IMAP → thread).

> Honnêteté sur le « même pas une heure » : le tuyau brut ≈ 1 h. Mais un envoi **vendable**
> (délivrabilité + opt-out + tracking + envoi en masse) = **~1 à 2 jours**. Le risque n'est pas
> technique, il est réputationnel (domaine cramé, plainte RGPD). À faire une fois, bien.

### Palier 2 — CRM deux sens — le plus demandé

On réutilise la fondation **déjà livrée** (OAuth + refresh + chiffrement, HubSpot & Salesforce).
Il manque uniquement des endpoints sur une base authentifiée qui existe :

- **Lire / importer** : `GET` contacts / entreprises / deals → « va chercher la donnée déjà
  dans ton CRM » (Théo). Affiché dans le dossier Bellum.
- **Upsert par email** (corrige le create-only qui duplique à chaque export).
- **Logguer l'activité** : écrire « email envoyé / appel loggé / relance programmée » **de retour
  dans le CRM** — c'est le « la mettre à jour ensuite » de Théo.
- Field mapping + dédup.

### Palier 3 — L'assistant **agit** (chat + MCP)

C'est ici que « _envoie les mails que tu as rédigés à tous ces gens_ » **depuis le chat** devient réel.

- **Chat** : ajouter une couche tool-calling (aujourd'hui `chat.py` = Q&A RAG, aucun `bind_tools`).
  Outils : `send_email`, `log_to_crm`, `schedule_followup`, `mark_sent`.
- **MCP** (assistant du sales — Claude Desktop / Cursor) : ajouter des outils d'**écriture scopés**.
  Le pattern de sécurité est **déjà prouvé** : `start_analysis` + `RequireMcpScope('mcp:analysis')`.
  Nouveau scope `mcp:act` → `send_email` / `log_to_crm`. Un outil = une route `/mcp/*` + un
  `registerTool`. La révocation (consent + refresh family) est déjà là.
- Règle d'or : **jamais d'auto-send silencieux**. L'assistant propose, le sales confirme.

### Palier 4 — LinkedIn — le gros morceau

Pas d'API officielle pour envoyer connexions / DM. Il faut un tiers :
**Unipile** (recommandé — API unifiée LinkedIn + email + messagerie, un compte OAuth par sales),
alternatives HeyReach / La Growth Machine / PhantomBuster.

- Périmètre : demandes de connexion, messages / InMail, programmer des relances, sync engagement.
- Le brouillon est déjà là (`contact.linkedin_message`).
- **Risque compte** : limites LinkedIn + ToS → cadence prudente, opt-in explicite du sales, jamais
  d'envoi de masse agressif. C'est le palier le plus risqué et le plus long → à cadrer à part.

---

## 4. Séquence recommandée

```
Palier 0  ✅ fait      Fiabiliser l'email prod (débloque les tests + prérequis envoi)
Palier 1  ~1-2 j       POST /contacts/:id/send-email + envoi en masse + garde-fous   ← quick win Louis
Palier 2  ~3-5 j       CRM 2-way : read + upsert + activity log (HubSpot d'abord)     ← plus demandé
Palier 3  ~3-5 j       Chat/MCP agentiques (tools send/log) — s'appuie sur P1+P2
Palier 4  cadrage      LinkedIn via Unipile — palier à part, risque compte
```

Palier 1 et 2 sont **indépendants** et parallélisables. Palier 3 dépend des deux. Palier 4 est
autonome mais lourd.

---

## 5. Garde-fous transverses (sécurité / délivrabilité / RGPD)

À traiter **une fois**, partagés par tous les paliers :

- **Email** : domaine dédié + SPF/DKIM/DMARC + warm-up ; opt-out obligatoire + suppression list ;
  rate-limit par sales et par destinataire.
- **Consentement** : jamais d'action externe automatique sans validation explicite du sales.
- **Audit** : journal « qui a envoyé quoi, quand » — `user_actions` existe déjà, à passer de
  déclaratif à réel.
- **RGPD** : base légale de la prospection, traçabilité, droit à l'effacement (prospects importés
  du CRM inclus).
- **Secrets** : tokens CRM/LinkedIn chiffrés au repos (le crypto AES-256-GCM CRM est déjà là et
  réutilisable).

### Annexe — le bug email du 15/07 (résolu)

Cause racine = piège de config, pas panne réseau : `EMAIL_PROVIDER` avait un défaut de schéma
`'mailpit'`, ce qui rendait **inatteignable** la bascule « en prod → Resend » de `mailer.service.ts`.
Résultat : en prod, tous les mails (OTP signup, welcome, reset) partaient en silence vers
`localhost:8025` (Mailpit) et n'étaient jamais délivrés — signup renvoyant quand même
`pending_email_verification`, le testeur restait bloqué sans code ni erreur.

**Correctif code** : `EMAIL_PROVIDER` rendu optionnel → en prod (variable non posée), le mailer
sélectionne Resend automatiquement. **Action restante côté Railway (API)** : poser un
`RESEND_API_KEY` **valide** (live `re_…`) et un `RESEND_FROM` sur un **domaine vérifié dans Resend**
(SPF/DKIM faits, compte hors sandbox). Vérif rapide : logs API → chercher `Mailer job failed` ;
le message dira lequel des trois manque.
