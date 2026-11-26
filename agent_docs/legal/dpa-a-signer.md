# DPA à signer avec nos sous-traitants (RGPD art. 28-4)

> **Rédigé le 11/10/2026, non relu par un juriste — décision de Louis** (épopée #4016, lot L14).
>
> **Reste à compléter par Louis** : la colonne « Signé le » de chaque ligne ; les liens marqués « à récupérer » ;
> les localisations « non publiées par le fournisseur » à faire écrire dans chaque DPA ; le fournisseur retenu pour les
> changements de poste (L2). (OCR : Mistral AI, lu dans le code le 27/10/2026, #4472.)

Ce fichier liste les accords de traitement que **Bellum** doit avoir avec SES sous-traitants (Bellum sous-traitant
du client → ces prestataires sont des sous-traitants ultérieurs, art. 28-2 et 28-4). Le modèle de DPA que Bellum
signe avec ses CLIENTS est un autre document : [`dpa.md`](dpa.md) (et `/dpa` sur le site).

Les fournisseurs viennent des clés réellement documentées dans `agent_docs/env-reference.md`. Une clé absente =
aucun appel (no-op strict) : un fournisseur dont la clé n'est pas posée en production ne reçoit rien, et son DPA
peut attendre la pose de la clé — la colonne « Clé » dit laquelle vérifier
(`railway variables --service <svc> --json | jq -r 'keys[]'`, noms seulement).

**Liens.** « vérifié 11/10 » = la page a été ouverte le 11/10/2026 et porte bien le titre d'un DPA. « à récupérer »
= aucune page publique trouvée : la demander au fournisseur (souvent signée en ligne depuis le tableau de bord).

**À vérifier dans chaque DPA** : sous-traitance ultérieure listée ; lieu de traitement ; encadrement des transferts
(Data Privacy Framework ou clauses contractuelles types 2021) ; **non-utilisation des données pour entraîner des
modèles** (promesse de notre `dpa.md` § 5-1 — elle ne tient que si chaque fournisseur de modèle l'écrit) ; délai de
notification de violation compatible avec nos 72 h.

---

## 1. Hébergement et infrastructure

> **Localisations d'hébergement vérifiées le 26/10/2026 contre le code** (#4472) : Railway = `REGION` de
> `.railway/railway.ts` (`europe-west4-drams3a`, Pays-Bas — API, IA et Redis) ; Supabase = projet `eu-west-1`
> (Irlande) ; Vercel = aucun `regions` dans `apps/web/vercel.json` ni `apps/website/vercel.json`, donc la région
> de fonctions par défaut de Vercel (États-Unis) derrière un CDN mondial — d'où « États-Unis + edge ».
>
> Chaque localisation ci-dessus est lue dans le code, à la date indiquée. **La console de projet Vercel
> n'a pas été consultée : la région de ses fonctions est donc « non vérifiée auprès du fournisseur »,
> et seule la valeur déduite du code est écrite** (28/10/2026, #4472.2). Si Vercel change sa région par
> défaut sans que `vercel.json` change, cette ligne devient fausse sans prévenir — elle se relit à chaque
> revue du présent document.

| Fournisseur | Rôle                                                                                       | Clé / présence | Localisation                | DPA                                            | Signé le |
| ----------- | ------------------------------------------------------------------------------------------ | -------------- | --------------------------- | ---------------------------------------------- | -------- |
| Supabase    | Base de données, authentification, stockage                                                | obligatoire    | UE (eu-west-1)              | https://supabase.com/legal/dpa — vérifié 11/10 |          |
| Railway     | Hébergement API, IA, Redis ; journaux                                                      | obligatoire    | UE (europe-west4, Pays-Bas) | https://railway.com/legal/dpa — vérifié 11/10  |          |
| Vercel      | Hébergement de l'application web et du site ; mesure d'audience du site (sur consentement) | obligatoire    | États-Unis + edge           | https://vercel.com/legal/dpa — vérifié 11/10   |          |

## 2. Fournisseurs de modèle d'IA, transcription, embeddings, OCR

| Fournisseur   | Rôle                                                                                                               | Clé / présence                                              | Localisation           | DPA                                                                                                   | Signé le |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Anthropic     | Modèle d'IA de référence (analyses, Laura)                                                                         | `ANTHROPIC_API_KEY` (obligatoire)                           | États-Unis             | https://www.anthropic.com/legal/data-processing-addendum — vérifié 11/10                              |          |
| OpenAI        | Modèle routé (`LLM_ROUTE_*`) ; contrat de transcription par défaut ; embeddings par défaut                         | `LLM_ROUTE_*`, `TRANSCRIPTION_API_KEY`, `EMBEDDING_API_KEY` | États-Unis             | https://openai.com/policies/data-processing-addendum — connu, non vérifié (la page refuse les robots) |          |
| Transcription | Comptes rendus de rendez-vous, message vocal de Laura                                                              | `TRANSCRIPTION_API_KEY` / `TRANSCRIPTION_API_URL`           | selon l'URL            | même DPA qu'OpenAI si l'URL par défaut est gardée ; sinon à récupérer                                 |          |
| Mistral AI    | OCR des PDF scannés ; transcription vocale (Voxtral) — `api.mistral.ai`, défaut de `ocr.py` et `voxtral.client.ts` | `OCR_API_KEY`                                               | UE (société française) | à récupérer                                                                                           |          |

## 3. Observabilité et supervision

| Fournisseur   | Rôle                                             | Clé / présence                                | Localisation                                                                    | DPA                                                                                                      | Signé le |
| ------------- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| Sentry        | Supervision des erreurs (3 services + web)       | `SENTRY_DSN`, `VITE_SENTRY_DSN`               | selon le DSN : UE si `*.ingest.de.sentry.io`, sinon États-Unis                  | https://sentry.io/legal/dpa/ — vérifié 11/10                                                             |          |
| Langfuse      | Traces des appels au modèle (contenu masqué)     | `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` | UE (`cloud.langfuse.com`, défaut de `langfuse_client.py`, sauf `LANGFUSE_HOST`) | https://langfuse.com/security/dpa — redirige le 11/10 vers le DPA de ClickHouse (maison mère) : à relire |          |
| Grafana Cloud | Métriques de la flotte CI (aucune donnée client) | `GRAFANA_PROM_*`                              | région choisie à la création de la pile (aucune donnée client)                  | à récupérer (page https://grafana.com/legal/ ) — utile seulement si des données personnelles y entrent   |          |
| Reflag        | Interrupteurs de fonctionnalités                 | `REFLAG_SECRET_KEY`                           | non publiée par le fournisseur au 27/10/2026 (traitée hors UE)                  | https://reflag.com/legal/dpa — vérifié 11/10                                                             |          |

## 4. Messages sortants

| Fournisseur        | Rôle                                                 | Clé / présence         | Localisation | DPA                                          | Signé le |
| ------------------ | ---------------------------------------------------- | ---------------------- | ------------ | -------------------------------------------- | -------- |
| Resend             | E-mails transactionnels, alertes, envois sous mandat | `RESEND_API_KEY`       | États-Unis   | https://resend.com/legal/dpa — vérifié 11/10 |          |
| MessageBird (Bird) | SMS d'alerte                                         | `SMS_PROVIDER_API_KEY` | Pays-Bas     | https://bird.com/legal/dpa — vérifié 11/10   |          |

## 5. Paiement

| Fournisseur | Rôle                            | Clé / présence                    | Localisation         | DPA                                          | Signé le |
| ----------- | ------------------------------- | --------------------------------- | -------------------- | -------------------------------------------- | -------- |
| Stripe      | Paiement, abonnements, factures | `STRIPE_SECRET_KEY` (obligatoire) | Irlande / États-Unis | https://stripe.com/legal/dpa — vérifié 11/10 |          |

## 6. Enrichissement de contacts B2B (cascade) et changements de poste

Pour cette famille, exiger en plus : la **source** et la **base légale** de la donnée fournie (le fournisseur est
souvent lui-même responsable de sa base), et la gestion de l'opposition d'une personne (pour ne pas recevoir à
nouveau une personne que nous avons effacée — nous bloquons de notre côté par empreinte, A11).

| Fournisseur               | Rôle                                                      | Clé                   | Localisation                                                                                    | DPA                                                                                                     | Signé le |
| ------------------------- | --------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Apollo                    | Enrichissement (1er de la cascade), recherche de contacts | `APOLLO_API_KEY`      | États-Unis                                                                                      | https://www.apollo.io/dpa — vérifié 11/10                                                               |          |
| SalesQL                   | Enrichissement                                            | `SALESQL_API_KEY`     | non publiée par le fournisseur au 27/10/2026 (traitée hors UE)                                  | à récupérer                                                                                             |          |
| Dropcontact               | Enrichissement                                            | `DROPCONTACT_API_KEY` | société française ; hébergement non publiée par le fournisseur au 27/10/2026 (traitée hors UE)  | à récupérer                                                                                             |          |
| Hunter                    | Recherche d'e-mail professionnel                          | `HUNTER_API_KEY`      | UE (Belgique, Google Cloud) + sous-traitants US — help.hunter.io, lu le 27/10/2026              | https://hunter.io/data-processing-agreement — vérifié 11/10                                             |          |
| Lusha                     | Enrichissement                                            | `LUSHA_API_KEY`       | Israël (décision d'adéquation)                                                                  | https://www.lusha.com/legal/dpa/ — vérifié 11/10                                                        |          |
| Kaspr                     | Enrichissement                                            | `KASPR_API_KEY`       | société française ; hébergement non publiée par le fournisseur au 27/10/2026 (traitée hors UE)  | à récupérer (seule une charte de données publique trouvée : https://www.kaspr.io/personal-data-charter) |          |
| FullEnrich                | Enrichissement                                            | `FULLENRICH_API_KEY`  | société américaine ; hébergement non publiée par le fournisseur au 27/10/2026 (traitée hors UE) | à récupérer                                                                                             |          |
| Changements de poste (L2) | Données professionnelles sous contrat, jamais de scraping | ⟦À COMPLÉTER⟧         | fournisseur non choisi — aucun appel tant que la clé n'est pas posée                            | à récupérer — **à signer AVANT la pose de la clé**                                                      |          |

## 7. Collecte web et recherche

Ces prestataires reçoivent des REQUÊTES (nom d'entreprise, parfois nom d'une personne recherchée) : ils traitent
donc des données personnelles, même si ce qu'ils rendent est public.

| Fournisseur                                                                         | Rôle                            | Clé                                                                                             | Localisation                                                   | DPA                                                                                                            | Signé le |
| ----------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| Firecrawl                                                                           | Lecture de pages web            | `FIRECRAWL_API_KEY`                                                                             | États-Unis                                                     | à récupérer                                                                                                    |          |
| Brave Search                                                                        | Recherche web                   | `BRAVE_API_KEY`                                                                                 | États-Unis                                                     | à récupérer                                                                                                    |          |
| Serper                                                                              | Recherche web                   | `SERPER_API_KEY`                                                                                | non publiée par le fournisseur au 27/10/2026 (traitée hors UE) | à récupérer                                                                                                    |          |
| Tavily                                                                              | Recherche web                   | `TAVILY_API_KEY`                                                                                | non publiée par le fournisseur au 27/10/2026 (traitée hors UE) | à récupérer                                                                                                    |          |
| Agrégateurs d'offres d'emploi (Adzuna, Jooble, TheirStack, Mantiks, Fantastic.jobs) | Offres d'emploi des entreprises | `ADZUNA_*`, `JOOBLE_API_KEY`, `THEIRSTACK_API_KEY`, `MANTIKS_API_KEY`, `FANTASTIC_JOBS_API_KEY` | non publiée par le fournisseur au 27/10/2026 (traitée hors UE) | à récupérer — utile seulement si une requête porte une donnée personnelle (a priori : requêtes par entreprise) |          |

## 8. Divers

| Fournisseur | Rôle                                         | Clé                            | Localisation | DPA                                                                                      | Signé le |
| ----------- | -------------------------------------------- | ------------------------------ | ------------ | ---------------------------------------------------------------------------------------- | -------- |
| GitHub      | Signalements de bug in-app (texte + capture) | `FEEDBACK_GITHUB_TOKEN`        | États-Unis   | à récupérer (« GitHub Data Protection Agreement », dans les conditions client de GitHub) |          |
| Plausible   | Mesure d'audience du site (sur consentement) | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | UE           | https://plausible.io/dpa — vérifié 11/10                                                 |          |
| Calendly    | Prise de rendez-vous depuis le site          | `NEXT_PUBLIC_CALENDLY_URL`     | États-Unis   | https://calendly.com/dpa — vérifié 11/10                                                 |          |

## 9. Ce qui n'appelle PAS de DPA de notre part

- **Registres et autorités publics** (INSEE, INPI, BODACC, BOAMP, DECP, France Travail, Zefix, registres BE/LU) :
  ce sont des SOURCES, pas des sous-traitants. Respecter leurs conditions de réutilisation.
- **Les outils du client** (sa messagerie Google ou Microsoft, son CRM, son ATS, sa téléphonie, son Notion) : le
  client a son propre contrat avec eux ; Bellum agit sur ses instructions via le connecteur qu'il a branché.
- **Pappers** : rééditeur privé du registre — fournisseur de données d'entreprise ; un DPA n'est nécessaire que si
  nos requêtes portent des données personnelles (recherche de dirigeant par nom). ⟦À COMPLÉTER — Louis tranche⟧

## 10. Ce qui part chez un client

- **La pièce remise sur demande** (`/dpa` sur le site : « liste tenue à disposition ») est l'**Annexe 2 de
  [`dpa.md`](dpa.md)** — resynchronisée le 27/10/2026 (#4472) sur les clients réseau du code, et relue par
  `apps/api/src/legal-docs/dpa-sous-traitants.spec.ts`. CE fichier-ci reste INTERNE : il porte la colonne « Signé
  le » et les liens à récupérer, il ne s'envoie pas.
- Les deux pièces disent la même localisation pour chaque fournisseur ; une localisation que ni le code ni le
  fournisseur ne publie s'écrit « non publiée par le fournisseur », jamais « à confirmer ».
