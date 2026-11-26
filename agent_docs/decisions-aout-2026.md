# Décisions à prendre — août/septembre 2026

> **Mise à jour 31/07 (soir) — arbitrages de Louis.** D1 (prix 119/259/599) et D2
> (quotas 35/150/420) **validés tels quels**. D3 validé avec le siège Growth
> ramené à **89 €**. D4 : reco appliquée (besoin débloqué et réécriture de CV
> payants, copilote gratuit mais borné — le bornage reste à faire). D5 : rien à
> construire, les recharges existent déjà (+5 / +20 / +50 crédits à 19 / 59 /
> 119 €). D7 : paiement **par facture**, palier bêta posé à la main. D9 **oui**.
> D10 : Besoins descendus en **Team**. D11 : la démo **reste fictive**. D12 :
> Découverte conservé, mis de côté. D14 : validation humaine confirmée. D16 :
> merge sur `main` autorisé. D21 : analytics ajouté (Plausible). D8 et D22
> restent en attente.
>
> **Deuxième passe (31/07, plus tard).** D9 tranché en **option A** : le crédit paie une
> **génération neuve** (le plan d'attaque du besoin), pas le dévoilement d'une donnée
> déjà payée par l'analyse — spécification d'exécution dans
> `agent_docs/plan-attaque-besoin.md`. Le plan généré appartient à **l'équipe**
> (workspace), pas au siège qui a cliqué. D19 : le suivi des coûts s'affiche **côté
> backoffice uniquement**, jamais dans l'app cliente. Plafond du copilote confirmé à
> **50 messages / 24 h / siège** (livré, PR #848).

---

## Statut des 22 décisions — recompté le 30/08/2026

> **Pourquoi cette table existe.** Jusqu'ici le statut d'une décision n'était écrit nulle
> part où on puisse le lire : il vivait dans le chapeau de prose ci-dessus, en haut d'un
> fichier de 287 lignes. Deux lecteurs sérieux ont compté ce fichier et se sont trompés dans
> deux directions opposées. Le certificat d'épuisement de l'archive 00
> (`gouvernance-iteration-3-2026-08-25.md:357`) a écrit « **zéro** décision en suspens » sans
> ouvrir le fichier. La passe B (`passe-b-iteration-3/ARCHIVE-00.md`) l'a ouvert, a compté le
> seul marqueur régulier qu'il offrait — le titre `**À trancher**`, qui nomme la QUESTION et
> ne dit rien de sa réponse — et a écrit « **14** encore marquées à trancher ». La vérité est
> **7**. Aucun des deux ne mentait ; aucun des deux ne pouvait compter.
>
> Le vocabulaire n'est pas inventé : c'est celui que la « Règle générale » de
> `SOURCE_PRECEDENCE.md:11` impose depuis le début (`implémenté`, `partiel`, `absent`,
> `régressé`, `supplanté`, `contradictoire`), adapté à des décisions.
>
> **Garde GA-116** (`packages/contracts/src/schemas/decision-status.test.ts`) : la table est
> relue à chaque CI, elle doit couvrir exactement les `### Dn.` du fichier, chaque statut doit
> appartenir au vocabulaire, et le total ci-dessous doit se recalculer depuis les lignes.
> Récit complet : `agent_docs/iteration-3-precedence-et-certificat-2026-08-30.md`.

**Compte : 22 décisions — 11 TRANCHÉE, 4 SUPPLANTÉE, 1 PARTIELLE, 6 OUVERTE.**

| Décision | Statut         | Ce qui le prouve                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | **SUPPLANTÉE** | `shipped-plan-grid.ts:67-83` — la grille du 27/08 ne porte plus qu'un palier achetable (Growth 199 €). Les prix 119/259/599 n'ont plus d'objet.                                                                                                                                                                                                                                                                 |
| D2       | **SUPPLANTÉE** | `shipped-plan-grid.ts:121-129` — 250 crédits pour l'unique palier. Les quotas 35/150/420 n'ont plus d'objet.                                                                                                                                                                                                                                                                                                    |
| D3       | **SUPPLANTÉE** | `shipped-plan-grid.ts:49-50` — Growth est « un poste de travail mono-utilisateur : une deuxième personne, c'est Entreprise ». Il n'y a plus de siège supplémentaire.                                                                                                                                                                                                                                            |
| D4       | **TRANCHÉE**   | Chapeau 31/07, reco appliquée ; le bornage annoncé est livré — `CHAT_DAILY_MESSAGE_LIMIT`, 50 messages / 24 h / siège (PR #848).                                                                                                                                                                                                                                                                                |
| D5       | **TRANCHÉE**   | Chapeau 31/07 : « rien à construire, les recharges existent déjà ».                                                                                                                                                                                                                                                                                                                                             |
| D6       | **PARTIELLE**  | Quatre questions sur cinq répondues par `shipped-plan-grid.ts:135-146` (Bêta Design Partner, 119 € HT / licence / mois, **trois mois**, 600 crédits, 3 sièges). **Reste ouverte la cinquième : ce qui se passe à la fin des trois mois** — bascule vers quel palier, à quel prix, réengagement ?                                                                                                                |
| D7       | **TRANCHÉE**   | Chapeau 31/07 : paiement par facture, palier bêta posé à la main.                                                                                                                                                                                                                                                                                                                                               |
| D8       | **OUVERTE**    | Le chapeau le dit lui-même : « D8 et D22 restent en attente ». Dates de démarrage bêta et Go/No-Go. **Seule décision du fichier avec une contrainte dure connue** — le webinar annoncé au 5 septembre.                                                                                                                                                                                                          |
| D9       | **TRANCHÉE**   | Chapeau, deuxième passe 31/07 : option A ; spécification dans `agent_docs/plan-attaque-besoin.md`.                                                                                                                                                                                                                                                                                                              |
| D10      | **SUPPLANTÉE** | La grille par palier n'existe plus : `PUBLIC_PLAN_ORDER = ['growth']`. Descendre les Besoins « en Team » n'a plus de sens sans palier Team public.                                                                                                                                                                                                                                                              |
| D11      | **TRANCHÉE**   | ⚠️ Tranchée le 31/07 (« la démo reste fictive »), puis **RE-tranchée** : `apps/api/src/modules/demo/demo-dataset.ts:13-21` — cinq sociétés RÉELLES, « décision Louis, 10-11/08/2026 ». C'est la dernière qui vaut.                                                                                                                                                                                              |
| D12      | **TRANCHÉE**   | Chapeau 31/07 : Découverte conservé. Le palier existe toujours (`shipped-plan-grid.ts:149`).                                                                                                                                                                                                                                                                                                                    |
| D13      | **OUVERTE**    | Jamais arbitrée. Le moteur du questionnaire est livré ; il manque la liste des questions, chez Théo. « ~1 jour de dev une fois la liste écrite ».                                                                                                                                                                                                                                                               |
| D14      | **TRANCHÉE**   | Chapeau 31/07 ; devenue doctrine — « le copilote n'envoie jamais d'e-mail », tenue par l'absence de chemin d'écriture.                                                                                                                                                                                                                                                                                          |
| D15      | **OUVERTE**    | Jamais arbitrée. Quels connecteurs activer réellement pour la bêta ; chacun coûte une app OAuth déclarée et validée. Reco d'origine inchangée : Google + HubSpot.                                                                                                                                                                                                                                               |
| D16      | **TRANCHÉE**   | Chapeau 31/07 : merge sur `main` autorisé. Devenue règle permanente.                                                                                                                                                                                                                                                                                                                                            |
| D17      | **TRANCHÉE**   | Résolue **en retirant le moyen** : `apps/ia/app/services/research/firecrawl.py:243` pose `MAX_PAGES_PER_RUN = 12` en dur et `_resolve_max_pages()` ignore l'environnement — `apps/ia/tests/test_firecrawl_max_pages.py:33-45` le prouve en posant la variable à `3`, `0` et n'importe quoi. La variable ne peut plus rien brider, qu'elle traîne ou non sur Railway. Raison : `agent_docs/env-reference.md:95`. |
| D18      | **OUVERTE**    | Prix Stripe en mode live. ⚠️ Action de console, **non vérifiable depuis le dépôt** — déclarée ouverte sur la foi du tracker, pas sur une mesure.                                                                                                                                                                                                                                                                |
| D19      | **TRANCHÉE**   | Chapeau, deuxième passe 31/07 : suivi des coûts côté back-office uniquement, jamais dans l'app cliente.                                                                                                                                                                                                                                                                                                         |
| D20      | **OUVERTE**    | Jamais arbitrée, et toujours vraie : `apps/web/src/components/ContactDialog.tsx:19-25` porte `support@bellum-it.com` pendant que le produit vit sur `bellum-ai.com` (`SignupForm.tsx:7`, `OnboardingPlanPage.tsx:13`, `PublicSharePage.tsx:22`, `analytics.ts:31`). Deux marques dans un même parcours client.                                                                                                  |
| D21      | **TRANCHÉE**   | Chapeau 31/07 (Plausible) **et livrée** : `apps/web/src/main.tsx:16-17`, derrière la porte de consentement, gardée par `analytics-behind-consent.test.ts`.                                                                                                                                                                                                                                                      |
| D22      | **OUVERTE**    | Le chapeau le dit : « D8 et D22 restent en attente ». Hébergement de la vidéo de démo. Sans enjeu produit — à trancher quand la vidéo existe.                                                                                                                                                                                                                                                                   |

⚠️ **Ce que cette table ne couvre pas.** Elle ne compte QUE les décisions numérotées de ce
fichier. Quatre autres décisions produit vivent sans numéro dans
`agent_docs/restitution-tracker.md` (plafond p14 `:236`, `estimatedAvailable` `:246`,
« depuis ma dernière connexion » `:285`, feu vert sur le prompt organigramme `:286`) — elles
sont incomptables tant qu'elles n'ont pas de numéro, et c'est exactement pour ça qu'elles
n'ont figuré dans aucun des deux comptages précédents.

---

Toutes les décisions qui **bloquent du code**, extraites de la to-do Théo × Louis et
recoupées avec l'état réel du dépôt au 31/07/2026.

Format : ce qui est **embarqué aujourd'hui** (donc ce qui part en prod si personne ne
tranche), les options, une reco, et **ce que la décision débloque**. Une décision non
prise n'est pas neutre : c'est la valeur embarquée qui est vendue.

Convention : « embarqué » = valeur dans le code. Tout ce qui touche prix/quotas est
**éditable en backoffice sans redéploiement** (écran Offres) — le code n'est que le
repli. Depuis le 31/07 la grille embarquée vit à UN seul endroit :
`packages/contracts/src/billing/shipped-plan-grid.ts`.

---

## Bloc 1 — Tarification (Théo)

### D1. Prix des 3 paliers publics

**Embarqué** : Starter-Solo 119 € · Team 259 € · Growth 599 € (mensuel, −20 % en annuel).
Le site, l'app et Stripe affichent déjà ces montants.

**À trancher** : on garde, ou on bouge ?

→ Débloque : rien à coder si on garde. Si ça bouge : une saisie dans le backoffice
(le site et l'app suivent seuls) + création des prix Stripe correspondants.

### D2. Quotas par palier

**Embarqué** (monnaie unique, 1 crédit = 1 action) : Starter **35** crédits/mois ·
Team **150** · Growth **420**.

**À trancher** : ces volumes tiennent-ils face à un usage réel d'ESN ? 35 crédits = 35
actions/mois pour un commercial solo à 119 €, soit ~3,40 €/action.

→ Débloque : la même saisie backoffice que D1.

### D3. Prix du siège supplémentaire

**Embarqué** : 29 € (Starter) · 59 € (Team) · 99 € (Growth). Le prix monte avec le
palier parce qu'un siège pioche dans le pool de crédits du plan.

**À trancher** : garder cette progression, ou un prix unique ?

**Reco** : garder — un siège Growth consomme un pool plus riche.

### D4. Ce qui consomme un crédit

**Embarqué** : deux consommations existent en code — `consumeAnalysisSlot` (une analyse)
et `consumeEnrichmentCredit` (un enrichissement de contact qui aboutit). Depuis la
monnaie unique, les deux puisent dans le même quota. **Tout le reste est gratuit** :
copilote, messages, comparaisons, exports CRM, briefs, réécriture de CV, veille
quotidienne, rappels.

**À trancher** : la liste des actions payantes. Trois candidats évidents à basculer en
payant, aujourd'hui gratuits et coûteux en API Claude :

1. la **réécriture de CV** pour une mission (seul appel LLM du vivier) ;
2. le **copilote** (chaque message = un appel Claude ; ~87 % de la facture Anthropic de
   juillet vient des fonctions hors analyse, qui ne débitent rien) ;
3. le **déblocage d'un besoin** (voir D9).

**Reco** : facturer le déblocage de besoin et la réécriture de CV ; laisser le copilote
gratuit mais borné (N messages/jour/siège), sinon on vend un forfait à marge négative
pour les gros utilisateurs.

→ Débloque : `credits.service.ts` (nouvelles raisons de débit) + l'affichage du coût
avant clic sur chaque écran concerné.

### D5. Recharges hors forfait

**Embarqué** : plus aucun pack d'enrichissement (supprimés à la monnaie unique). Un
compte à sec attend le cycle suivant ou change de palier.

**À trancher** : vend-on des crédits à l'unité ? à quel prix ?

**Reco** : oui, un seul pack (ex. +50 crédits), sinon le premier mois d'un client actif
se termine par un mur.

---

## Bloc 2 — Offre bêta (Théo, puis Louis)

### D6. Contenu et prix de l'offre bêta

**Embarqué** : un palier `beta` existe — 59 €/mois, 60 crédits, 3 sièges, **toutes** les
fonctions ouvertes, non achetable en self-service (posé à la main depuis le backoffice).

**À trancher** : prix bêta ferme, durée (3 mois annoncés), nombre de sièges, quota,
niveau de support, et ce qui se passe **à la fin des 3 mois** (bascule automatique vers
quel palier ? à quel prix ? réengagement ?).

**Reco** : écrire la fin dès maintenant. Un bêta sans porte de sortie datée devient un
client à 59 € à vie.

### D7. Comment un bêta-testeur paie

**Embarqué** : rien de spécifique. Deux chemins existent — checkout Stripe (self-serve,
paliers publics uniquement) ou attribution manuelle d'un palier depuis le backoffice
(sans paiement).

**À trancher** : facture manuelle hors Stripe (virement) + palier posé à la main, ou lien
de paiement Stripe dédié ?

**Reco** : virement + facture pour 5 clients, palier posé à la main. Construire un
checkout bêta pour 5 comptes ne se rentabilise pas.

→ Débloque : la procédure de provisioning des workspaces bêta (à écrire une fois la
réponse connue).

### D8. Dates

**À trancher** : date de démarrage des 5 bêta (18/08 proposé) et date du Go/No-Go
lancement public. Le webinar est annoncé au 5 septembre — c'est **la** contrainte dure.

---

## Bloc 3 — Produit (Théo × Louis)

### D9. Déblocage des Besoins par crédits

**Embarqué** : l'écran `/needs` est livré et **ouvert par palier** (fonction `needs`),
pas par crédits. Rien ne se débite.

**À trancher** : un besoin débloqué coûte-t-il un crédit ? Lesquels sont visibles
gratuitement (titre seul ?) et qu'est-ce que le crédit ouvre (contacts, plan, message) ?

**Reco** : liste visible gratuitement, détail actionnable à 1 crédit — c'est la mécanique
que les utilisateurs comprennent déjà pour l'enrichissement.

### D10. Grille des fonctions par palier

**Embarqué** (cumulatif) :

| Palier       | Ce qui s'ouvre                                                               |
| ------------ | ---------------------------------------------------------------------------- |
| Starter-Solo | dossier complet, comptes, contacts, analyses, **exports**                    |
| Team         | + Chat IA, Découvrir, Veille, Base de connaissances, Espace équipe           |
| Growth       | + tout le reste (Besoins, Pilotage, Vivier, Manager, intégrations avancées…) |

**À trancher** : confirmer, ou déplacer des lignes. Point sensible : le **Chat IA** est
fermé au Starter alors que c'est la démo la plus convaincante, et les **Besoins** ne
s'ouvrent qu'à 599 €.

**Reco** : descendre Besoins en Team. Un commercial solo à 119 € qui ne voit aucun besoin
n'a pas de raison de rester.

### D11. Les 3 comptes de la démo — vrais noms ou fictifs ?

**Embarqué** : trois dossiers **inventés** (Groupe Helios, NovaSanté, Altiver Industries,
domaines `.example`). La to-do demande Air Liquide / Société Générale / Leboncoin.

**Le problème** : le lien de démo est **public**. Publier des organigrammes, des
dirigeants nommés, des signaux d'achat et des scores **fabriqués** sous le nom
d'entreprises réelles, c'est diffuser de la donnée fausse sur des tiers identifiables.
Air Liquide ou SG peuvent tomber dessus — et un prospect ESN aussi, qui verra une fiche
fausse sur un compte qu'il connaît.

**Options** :

1. **Noms fictifs, secteurs reconnaissables** (industrie / banque / marketplace) — statu
   quo amélioré ;
2. **Vrais noms, faits publics uniquement** : pas de contact nommé, pas de score inventé
   — démo plus pauvre, l'effet « waouh » disparaît ;
3. **Vrais noms + données fictives** avec bandeau — ce que demande la to-do.

**Reco** : option 1. Le prospect ne juge pas la marque affichée, il juge la profondeur du
dossier. Si Théo veut absolument des marques connues, option 2 pour les faits + contacts
fictifs clairement étiquetés.

### D12. Palier « Découverte » à l'inscription

**Embarqué** : un compte créé en self-service reçoit 6 crédits sur 7 jours, toutes
fonctions ouvertes.

**À trancher** : on garde ce bac à sable, ou l'inscription publique se ferme jusqu'au
lancement (waiting list uniquement) ?

**Reco** : le garder — c'est ce qui transforme un curieux en bêta-testeur payant.

### D13. Questionnaire n°2

**Embarqué** : le **moteur** existe (relance différée, « répondre plus tard », réponses
stockées dans le profil, profil relu par les prompts). Il manque **les questions**.

**À trancher** (Théo) : la liste exacte, les choix de réponse, les tranches, les règles
conditionnelles.

→ Débloque : ~1 jour de dev une fois la liste écrite.

---

## Bloc 4 — Actions sortantes (Théo)

### D14. Ce que Bellum a le droit de faire seul

**Embarqué** : le copilote **propose**, l'utilisateur **confirme**. Aucun e-mail n'est
jamais envoyé sans clic. C'est structurel, pas une convention.

**À trancher** : quelles actions passent en automatique (sans clic), lesquelles restent à
valider, lesquelles restent manuelles. Plus : règles de relance (délai, fréquence
maximale, ton), et qui porte la responsabilité si un message part chez un client.

**Reco** : rien en automatique avant d'avoir 5 clients qui font confiance au brouillon.

### D15. Priorité des connecteurs

**Embarqué et fonctionnel** : HubSpot, Salesforce, Pipedrive, Attio, Google (Gmail /
Agenda / Drive), Microsoft 365 (Outlook / Agenda), Notion, Slack/Teams/Discord (webhooks),
Apollo, SalesQL, Dropcontact, BoondManager (lecture seule). **Tous no-op sans clés.**

**À trancher** : lesquels on **active réellement** pour la bêta (chacun demande une app
OAuth déclarée, validée côté éditeur, et des clés en prod). LinkedIn n'existe pas et ne
peut pas exister proprement — pas d'API d'envoi.

**Reco** : Google + HubSpot pour les 5 bêta. Les autres restent disponibles à la demande.

---

## Bloc 5 — Décisions techniques (Louis)

### D16. Marge de manœuvre sur les merges

Est-ce que je merge directement sur `main` (auto-deploy prod) les lots de cette série, ou
je te laisse relire chaque PR ?

### D17. Override Railway à purger

`FIRECRAWL_MAX_PAGES=3` traîne en variable Railway et bride la collecte à 3 pages alors
que le défaut du code est 12. Effet : la page « équipe / gouvernance » d'un site peut ne
jamais être lue, donc l'organigramme perd sa seconde source de confirmation.
**À supprimer côté Railway** — je ne peux pas le faire.

### D18. Stripe en mode live

Les prix Stripe live sont-ils créés et branchés ? Le code est prêt ; sans prix live, le
checkout d'un vrai client échoue.

### D19. Granularité du suivi des coûts

Je peux persister le coût par **analyse**, par **utilisateur** et par **fournisseur**
(Anthropic, Apollo, Firecrawl, Serper/Brave, SalesQL, Dropcontact). Question : quelle
rétention (30 j ? 12 mois ?) et où l'afficher (backoffice seul, ou aussi la marge par
client) ?

### D20. Adresse et domaine de support

`louis@bellum-it.com` (to-do) vs le domaine produit `bellum-ai.com`. Deux marques dans un
même parcours client. **À unifier** — de préférence sur `bellum-ai.com`.

### D21. Analytics

Aucun outil d'analytics n'est branché sur le site ni sur l'app. Lequel (Plausible,
PostHog, GA4) ? Le choix a des conséquences RGPD (bandeau cookies ou non).

### D22. Hébergement de la vidéo démo

YouTube (référencement, marque YouTube visible) ou Vimeo (propre, payant) ? J'intègre
l'un ou l'autre en 10 minutes une fois la vidéo prête.

---

## Ce que je fais sans attendre

Aucune de ces décisions ne bloque : page d'accueil de la démo, grille tarifaire unifiée,
suivi des coûts, centre Intégrations, centre Actions, runbook prod, recette
auth/sessions/exports, audit du site. Voir `agent_docs/etat-produit-aout-2026.md`.
