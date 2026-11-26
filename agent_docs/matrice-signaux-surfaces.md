# Matrice types de signal × surfaces (#3928.2, lot M02 09/10/2026)

**Garde** : `apps/web/src/architecture/every-signal-kind-has-a-reader.test.ts` — chaque case est CALCULÉE par le
vrai code de la surface ; une nature ajoutée à `signalKindSchema` sans ligne fait échouer la CI.
**Lecteur unique** (#3928.a) : `readRecentSignals` (`packages/contracts/src/schemas/recent-signals-reader.ts`),
garde `apps/web/src/architecture/recent-signals-have-one-reader.test.ts`.
**Règle « récent »** (#3928.1) : `isRecentSignal` (même fichier) — un signal sans date n'est jamais récent.

## Les surfaces et leur appelant

| Surface            | Appelant (écran → lecteur)                                                                                    | Lecture de `recent_signals`                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Veille d'un compte | `TabSignal.tsx:27` → `buildAccountWatchData`                                                                  | `watchData.ts:32` `readRecentSignals`                                                                                                                                          |
| Mes cibles         | `TargetSignalsSection.tsx` → `WatchlistBoard` → `GET /accounts/signals` (`accounts.controller.ts:1399`)       | `accounts.service.ts:499` `readRecentSignals` (`toAccountSignalItems`)                                                                                                         |
| Laura              | `copilot-bridge.controller.ts:2345` (`get_account_signals`), `:3325` (revue de compte) → `listAccountSignals` | même lecture que Mes cibles ; filtre `isRecentSignal`                                                                                                                          |
| Cloche             | `analysis.worker.ts:1659`, `watchlist-refresh.worker.ts:135` → `notifyBuySignalForAccount`                    | `notifications.service.ts:448` `readRecentSignals`                                                                                                                             |
| Découvrir          | `Discover.tsx:777` `mergeKnownSignals` ← `POST /contacts/call-list` (`signal_history`)                        | matérialisé par `signal-history.service.ts:86` → `projectSignalHistory` (`signal-history.projection.ts:47` `readRecentSignals`) ; « pourquoi maintenant » : `hasOwnSignalDate` |

## La matrice

Mes cibles, Laura et la cloche transportent la nature TELLE QUELLE (même lecteur, colonne `type`) : « oui » sur
toute la colonne. La Veille la range dans une des six catégories de filtre (`categoryFor`) ; Découvrir dans une
famille filtrable (`knownSignalType`).

| Nature (`signalKindSchema`) | Veille (catégorie) | Mes cibles | Laura | Cloche | Découvrir (famille) |
| --------------------------- | ------------------ | ---------- | ----- | ------ | ------------------- |
| nomination                  | nomination         | oui        | oui   | oui    | business            |
| budget                      | budget             | oui        | oui   | oui    | business            |
| projet                      | historique         | oui        | oui   | oui    | business            |
| incident                    | historique         | oui        | oui   | oui    | business            |
| regulation                  | historique         | oui        | oui   | oui    | business            |
| acquisition                 | historique         | oui        | oui   | oui    | business            |
| partenariat                 | historique         | oui        | oui   | oui    | business            |
| restructuration             | historique         | oui        | oui   | oui    | business            |
| recrutement                 | recrutement        | oui        | oui   | oui    | hiring              |
| appel_offres                | appel_offres       | oui        | oui   | oui    | tender              |
| marche_public               | marche_public      | oui        | oui   | oui    | tender              |
| transformation              | historique         | oui        | oui   | oui    | business            |
| demenagement                | historique         | oui        | oui   | oui    | business            |
| investissement              | budget             | oui        | oui   | oui    | business            |
| organisation                | historique         | oui        | oui   | oui    | business            |
| levee_fonds                 | historique         | oui        | oui   | oui    | business            |
| technologie                 | historique         | oui        | oui   | oui    | tech                |
| contact                     | historique         | oui        | oui   | oui    | business            |
| recours_externe             | historique         | oui        | oui   | oui    | business            |
| ecosystem                   | historique         | oui        | oui   | oui    | ecosystem           |

## Hors matrice, nommé

- **Déclencheurs CRM** (`canonical_trigger_events`, #2875/#3918.b) : le lot M01 (`feat/m01-09-10`, parallèle) les
  lit par `GET /crm/accounts/:id/signals` et les passe à `buildAccountWatchData(account, extraSignals)` — le
  paramètre existe sur cette branche avec la même forme : ils traversent `readRecentSignals`, jamais un second
  lecteur. Leurs natures (`affaire_perdue`, `affaire_dormante`, `affaire_renouvellement`) ne sont pas dans
  `signalKindSchema` : à ajouter à cette matrice à l'intégration de M01.
- **Signaux registre de Découvrir** (`tender`/`award`/`hiring`/`legal`/`tech`, `apps/ia` `discover_signals`) :
  ils ne viennent pas de `recent_signals` ; leur règle « récent » est `discover_scoring._signal_factors`
  (sans date = 0 point) et `hasOwnSignalDate` côté écran.
- `levee_fonds` tombe en « historique » dans la Veille (aucun mot du filtre budget ne la nomme) : c'est l'état
  mesuré, pas un trou — le signal est affiché et filtrable.
