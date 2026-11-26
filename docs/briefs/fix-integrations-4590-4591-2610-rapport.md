# Rapport — #4590 / #4591 (recette /integrations du 26/10)

Branche `claude/fix-integrations-4590-4591-2610`, base `d7e6ab01`.

## #4590 — `GET /crm/import/status` en 500

- Cause TROUVÉE PAR TEST (rouge → vert) : un écart dont la valeur est nulle (`proposal: { email: null }`) levait
  `Cannot read properties of null (reading 'bellum')` dans `CrmReadSyncService.status` ; `conflict_count` nul durci aussi.
- Cas « connecteur sans curseur, sans ligne de connexion, lectures nulles » : déjà verts (pas la cause).
- Web : `ReviewTab` et `CrmReadScope` disent « État de lecture indisponible » (`role="alert"`) quand la lecture échoue,
  au lieu d'un « Rien à relire » / d'une zone muette. Aucune erreur avalée côté serveur.

## #4591 — synchro Pipedrive

- 429 : le web re-sondait en rafale (l'effet dépendait de l'objet `run`, relancé à chaque réponse). Corrigé : dépendance
  sur `run.id`, recul exponentiel 5 s / 10 s / 20 s / 30 s (plancher 5 s, `lib/sync-poll.ts`).
- Serveur : `GET …/sync-runs/:id` et `…/latest` ont leur compteur propre à 600/min (`@Throttle`, clé = classe+handler) ;
  limite globale (120/min) inchangée, démarrer/annuler inchangés.
- Un sondage en échec ne fige plus l'écran (avant : un toast, puis plus de sondage, « En attente… » pour toujours) :
  « État de la synchronisation indisponible — nouvel essai en cours », sondage repris.
- « En attente depuis N min » (statut `pending`, ≥ 1 min) ; aucun état terminal fabriqué.

## Tests lancés (verts)

API : `crm-read-sync.service.spec`, `crm-import.controller.spec`, `integration-sync.controller.spec`,
`literal-routes-not-captured-by-params.spec`. Web : `sync-poll.test`, `SyncLaunchFlow.test`, `ReviewTab.test`,
`CrmReadScope.test`, + gardes i18n (parity, keys-resolve, accents, no-crm-jargon, gender-agreement).

## NON vérifié / NON fait

- Prod non reproductible : la vraie ligne qui plantait n'est pas connue. Le champ nul corrigé est le seul que j'ai pu
  faire échouer ; si le 500 persiste en prod, la cause est ailleurs (lire le log `BLM-…` de la route).
- Pourquoi le run Pipedrive reste `pending` (worker BullMQ non consommé ? job perdu ? `jobId` déterministe déjà
  présent) : NON investigué côté worker — hors preuve possible sans Redis/prod. Le défaut 1 de #4591 (« le run ne
  progresse pas ») n'est donc que rendu VISIBLE, pas corrigé. #4487.1/.3 restent inprouvables tant que ça dure.
- Les 4 lignes « non précisée » de la reprise : non traitées.
- Compteur throttler non testé de bout en bout (Redis) : seulement la métadonnée `@Throttle`.
- Aucun test navigateur / onglet Réseau ; pas de PR (consigne).
