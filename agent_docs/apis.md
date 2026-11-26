# APIs externes — Documentation et intégration

## Claude API (Anthropic)

- Endpoint : POST https://api.anthropic.com/v1/messages
- Headers : x-api-key: {ANTHROPIC_API_KEY}, anthropic-version: 2023-06-01, Content-Type: application/json
- Model : claude-sonnet-4-20250514
- 3 appels par analyse (RESEARCH max_tokens:16000, CONTACTS max_tokens:12000, PLAN max_tokens:12000)
- Coût : ~$0.06/appel = ~$0.18/analyse
- IMPORTANT : toujours vérifier res.ok. Parser le JSON avec extraction robuste (premier { au dernier }).

## Brave Search API

- Endpoint : GET https://api.search.brave.com/res/v1/web/search?q={query}&count=20
- Headers : X-Subscription-Token: {BRAVE_API_KEY}
- Coût : ~$0.005/requête
- 8-10 requêtes par analyse = ~$0.05/analyse
- Retourne : title, description, url pour chaque résultat

## Firecrawl API

- Endpoint : POST https://api.firecrawl.dev/v0/scrape
- Headers : Authorization: Bearer {FIRECRAWL_API_KEY}
- Body : { url: "https://...", formats: ["markdown"] }
- Coût : ~$0.01/page, 15 pages/analyse = ~$0.15
- Retourne : contenu markdown de la page

## Pappers API

- Recherche : GET https://api.pappers.fr/v2/recherche?q={companyName}&api_token={PAPPERS_API_KEY}
- Détail : GET https://api.pappers.fr/v2/entreprise?siren={siren}&api_token={PAPPERS_API_KEY}
- Coût : ~$0.02/requête
- Retourne : SIREN, CA, effectifs, siège, dirigeants, établissements, forme juridique

## Apollo.io API

### People Search (GRATUIT)

- Endpoint : POST https://api.apollo.io/v1/mixed_people/search
- Headers : x-api-key: {APOLLO_API_KEY}, Content-Type: application/json
- Body : { q_organization_name: "SNCF", person_titles: ["DSI","CTO","Directeur Data",...], page: 1, per_page: 25 }
- Coût : 0 crédits (GRATUIT)
- Retourne : first_name, last_name, title, organization_name, linkedin_url, city, country
- NE retourne PAS : email, phone (voir Enrichment)
- Pagination : per_page max 25, itérer pages 1-5 pour 120 contacts

### People Enrichment (PAYANT)

- Endpoint : POST https://api.apollo.io/v1/people/match
- Body : { first_name, last_name, organization_name }
- Coût : 1 crédit/email, 5 crédits/phone
- Retourne : email vérifié, phone direct
- Usage : bouton "Enrichir" à la demande, pas automatique

## Stripe API

- Dashboard : https://dashboard.stripe.com
- Plans à créer : Free (0€, 3 analyses), Starter (49€, 10 analyses), Pro (99€, 30 analyses), Scale (199€, illimité)
- Webhook : écouter checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
- Mettre à jour user_credits en BDD sur chaque événement

## Coût total par analyse : ~$0.40

Brave ($0.05) + Firecrawl ($0.15) + Claude ($0.18) + Pappers ($0.02) + Apollo ($0) = ~$0.40
