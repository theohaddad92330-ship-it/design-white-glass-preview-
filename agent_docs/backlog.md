# Backlog complet BellumAI

## Bugs existants à corriger

1. CRITIQUE : Apollo jamais appelé (code déployé ≠ code écrit)
2. HAUT : Autocomplétion Pappers retourne TPE/SCI homonymes
3. HAUT : generate-messages en erreur (bug .catch Deno)
4. MOYEN : Boutons Supprimer/Archiver vides
5. MOYEN : Compteur contacts hardcodé 47
6. MOYEN : Score incohérent entre pages
7. MOYEN : Données dupliquées dashboard/fiche
8. MOYEN : Plan d'action non interactif (cocher ne persiste pas)
9. FAIBLE : Temps affiché "2 min" vs réalité 6 min
10. FAIBLE : Session perdue pendant analyse longue (JWT expire)

## Features à construire (par priorité)

### CRITIQUE — Produit vendable

- [ ] Apollo People Search fonctionnel (80-120 contacts réels)
- [ ] Stripe intégration (4 plans + webhooks)
- [ ] Deploy Vercel + domaine bellum-ai.com
- [ ] Google OAuth
- [ ] CI/CD GitHub Actions

### HAUTE — Qualité produit

- [ ] Dark mode complet (shadcn/ui + Tailwind dark:)
- [ ] Refacto AccountDetail en 6+ composants
- [ ] Dashboard pilotage (actions semaine, pipeline, relances)
- [ ] RAG : 36 templates LinkedIn + playbook cold calling
- [ ] Messages personnalisés par contact (RAG-powered)
- [ ] Pitch cold calling généré par contact
- [ ] Bouton Enrichir contacts (Apollo Enrichment)
- [ ] Fix autocomplétion Pappers (filtrage taille)
- [ ] Landing page (vidéo + screenshots + pricing)
- [ ] Rate limiting (20 analyses/h/user)
- [ ] CORS restreint au domaine production
- [ ] CGU + politique de confidentialité
- [ ] Monitoring Sentry
- [ ] Bandeaux chargement détaillés par phase

### MOYENNE — Expérience enrichie

- [ ] Organigramme interactif (React Flow)
- [ ] Agent IA chatbot par compte (/chat/:accountId)
- [ ] Mode découverte de comptes (/discover)
- [ ] Import CSV contacts + enrichissement
- [ ] Cache entreprise partagé (company_cache 7j)
- [ ] Fusion pages plan + offres + plan hebdo
- [ ] Recherches booléennes LinkedIn copiables
- [ ] Score de priorité détaillé (50+ lignes justification)
- [ ] Phrases BellumAI personnalisées partout
- [ ] Anti-partage licence (détection multi-device)
- [ ] Analytics (PostHog)
- [ ] Page objections et réponses

### BASSE — Vision long terme

- [ ] CRM intégré (pipeline, historique, notes)
- [ ] Notifications signaux hebdo (CRON)
- [ ] Scraping offres d'emploi (Apify)
- [ ] Carte France interactive (Leaflet)
- [ ] RAG données CRM (1188 comptes, 4266 contacts)
- [ ] Upload documents utilisateur (pitchs, CVs)
- [ ] SSO entreprise
- [ ] Récap vocal par section

## Red team 2026-07 — reporté / suivi

Scale-out (DÉFÉRÉ — latent tant que Railway = 1 instance ; revoir avant >1 replica) :

- [ ] Socket.IO : `@socket.io/redis-adapter` + sticky sessions (`analysis.gateway.ts`) — sinon à N replicas ~(N-1)/N users ne reçoivent aucun event live
- [ ] Outbox : `SELECT … FOR UPDATE SKIP LOCKED` dans `outbox.drainer.ts` — sinon chaque replica republie les mêmes lignes (N× events)
- [ ] Réconcilier checkpointer graphe ↔ outbox NestJS (`analysis.worker.ts:458`) — risque de perte d'une phase payée reportée en succès

Features (à vérifier contre l'API réelle avant merge) :

- [ ] Source BOAMP (marchés publics, Opendatasoft même host que BODACC, sans clé) — cloner `data_sources/bodacc.py` → attacher `result["publicTenders"]` dans le gather Phase 1
- [ ] Provider Hunter.io (email-finder fallback quand Apollo matche sans email) — `services/enrichment/hunter.py`, no-op sans `HUNTER_API_KEY`, brancher dans `contact_enrich.py`
- [ ] Failover multi-LLM (Anthropic = SPOF) — Bedrock/Vertex sur les 3 sites instructor de `claude_service.py`

Suivi (dette légère) :

- [ ] Adopter `aexecute()` sur les routers IA async (supabase off event-loop)
- [ ] Mailer jobId déterministe / flag "sent" (idempotence) + `aclose()` clients firecrawl/pappers
- [ ] `cite_key_facts` en task parallèle + réutiliser les `brave_hits` Phase 1 dans le fallback contacts (~130$/mo)

## Règles anti-bugs (OBLIGATOIRES)

1. Vérifier res.ok après CHAQUE appel API
2. Logger CHAQUE erreur avec status + body
3. JAMAIS de données fictives
4. Tester manuellement CHAQUE API avant intégration
5. Optional chaining PARTOUT dans le front
6. ErrorBoundary sur CHAQUE page React
7. Parsing JSON robuste (pas de JSON.parse direct)
8. Mapper explicitement noms de champs back → front
9. Refresh session pendant les analyses longues
10. Tester sur 5 entreprises avant déploiement

## Backlog 19/10/2026 (lot PLATEFORME)

- [ ] #4311 — voir quelle ESN travaille un compte : aucune source vérifiable, rien affiché avant. Voir `agent_docs/etude-vsa-beeper-2026-10-19.md`.
- [ ] #4314 — connecteur Beeper (lire + répondre) : contrat d'API à vérifier.
- [ ] #4360 — VSA en lecture seule : doc d'API du client attendue.
