# Fraîcheur du poste — protocole de mesure (#4799 / #4286.13)

**Arbitrage Louis 31/10 : mesurer, puis choisir. Rien n'est branché par ce paquet.** Sans clé = no-op strict.

## Lancer (en LOCAL, avec les clés — le cloud n'en a pas)

```bash
cd apps/ia
# 1. Jeu de vérité LOCAL, jamais commité (RGPD) : copier truth_set.example.json, ajouter par cas
#    "handle": {"apollo_id": "...", "full_name": "...", "linkedin_url": "..."} et plusieurs cas par catégorie.
# 2. Couper le cache : REDIS_URL vide (un hit Redis de 30 j masquerait la fraîcheur réelle).
# 3. Les prix : PROVIDER_UNIT_COST_APOLLO=<$ par crédit>, PROVIDER_UNIT_COST_SALESQL=<$ par crédit> (registre D19).
REDIS_URL= python -m app.eval.employment_freshness.run --truth ~/truth_local.json
```

Sortie : tableau **source × justes / faux / inconnus × coût total / coût par cas**, puis le détail par catégorie.
Une source sans clé = `BLOCKED : <clé> absente`. Un prix absent = « non chiffré », jamais « 0 $ ».

## Les trois catégories du jeu de vérité (les cas cités en appel)

| catégorie | la vérité | la source est fausse quand… |
|---|---|---|
| `faux_parti` (contact EDF donné « parti ») | en poste chez l'employeur de référence | elle dit « parti » |
| `arrivee_recente` (~1 mois chez Accor) | en poste chez l'employeur de référence | elle dit « parti », ou « en poste » chez l'ancien |
| `parti_ancien` (parti en 2022, donné en poste) | parti | elle dit « en poste » |

Un **inconnu** n'est ni juste ni faux : la source ne sait pas (pas de correspondance, panne). Il se compte à part.
Trois cas ne mesurent rien : viser ≥ 20 cas par catégorie avant de conclure.

## Sources candidates (noms de clés SEULEMENT — `agent_docs/env-reference.md`)

| source | clé | adaptateur | note |
|---|---|---|---|
| `apollo_search` | `APOLLO_API_KEY` | oui | **la relecture en place** (`searchPeopleByName`, tier gratuit) — la ligne de base à battre |
| `apollo_match` | `APOLLO_API_KEY` | oui | People-Match payant (1 crédit par résolution) : parcours daté |
| `salesql` | `SALESQL_API_KEY` | oui | instantané « employeur actuel » (sans date de fin) |
| `dropcontact` | `DROPCONTACT_API_KEY` | non — BLOCKED | client TS côté API (`job` / `company`) ; script API si Louis le retient |
| `lusha`, `kaspr`, `fullenrich`, `hunter` | `*_API_KEY` | non — BLOCKED | champ « poste » non vérifié / contrat non vérifiable / coordonnées seulement |

Un fournisseur sans clé ou sans contrat vérifié est **BLOCKED nommé, pas deviné**. La doctrine c95 autorise un
fournisseur SOUS CONTRAT pour le changement de poste ; scraping et session automatisée restent interdits (c79).
Lire les clés réellement posées : `railway variables --kv | cut -d= -f1` (noms seulement).
