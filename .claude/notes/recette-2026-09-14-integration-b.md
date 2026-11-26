# Recette live — 14/09/2026, intégration B

Prod mesurée : `api a2ae8080b` / `ia a2ae8080b` (merge de #2093), vérifiée par `GET /version` JSON parsé,
pas par grep — le champ `ia.commit` est IMBRIQUÉ dans la réponse de l'API.

## 1. Balayage — régime FONDATION, 59/59 routes, ZÉRO anomalie

`tools/recette/portee.py origin/main~1..origin/main` → **FONDATION** (`apps/web/src/lib/data-source-label.ts`,
socle applicatif). Les 59 routes ont été balayées par lots de 3 à 6 écrans, un `browser_batch` par lot.

- Aucune erreur console sur aucun écran (`read_console_messages onlyErrors`, vidé entre les lots).
- Aucun débordement horizontal : `scrollWidth > clientWidth` faux partout — mesuré, pas regardé.
- Aucun nom de fournisseur privé à l'écran : `/consultants/submissions`, `/contacts`, `/discover` re-testés
  contre `pappers|apollo|dropcontact|firecrawl|brave|hunter|lusha|kaspr|salesql|insee|inpi` → zéro occurrence.
  C'est la recette de **#1912.11**, livré par #2093.

### Les pages « maigres » ne sont PAS des défauts — re-mesurées à 9 s

Le piège de la veille a été rejoué : un zéro de CHARGEMENT bouge avec le temps d'attente, une page compacte non.

| Route | 3 s | 9 s | Verdict |
| --- | --- | --- | --- |
| `/dashboard` | 357 c | **779 c** | zéro de chargement partiel — la page se remplit, pas un défaut |
| `/pilotage/qualite` | 181 c | 181 c | compacte et PLEINE (« Les huit contrôles », « 4 contrôles à traiter », « Doublons à arbitrer ») |
| `/rfp` | 262 c | 262 c | compacte et PLEINE (import + « AO SIRH Val-de-Seine », remise le 30/09/2026) |
| `/accounts/memoire-collective` | 339 c | 339 c | pleine, état vide LÉGITIME (« Aucun croisement pour l'instant ») |
| `/consultants/pool` | 448 c | 448 c | pleine (Bientôt disponibles 1 / Dormants 0 / À revalider 17 / Jamais positionnés 18) |
| `/team` | 348 c | 348 c | pleine (1 membre, « Ce qui demande une décision », « Qui couvre quoi ») |

`/onboarding` redirige vers `/chat` sans erreur — les 2 routes laissées en suspens la veille sont faites.

## 2. Points du registre passés `recetté` (11)

Chacun a un geste rejoué, pas une lecture de code.

- **1911.7 / 1911.10** — après envoi d'un message, l'intercalaire « Aujourd'hui » apparaît au-dessus du fil du jour
  puis « Plus ancien » ; « Par compte » passe `aria-pressed=true` et regroupe sous FRANCE TELEVISIONS / AIRBUS /
  LATECOERE. La « duplication » du nom de compte vue dans `innerText` est le texte alternatif du logo — vérifié au zoom,
  ce n'est pas un défaut.
- **1914.1 / 1914.13** — « Compare mes comptes suivis… » rend une liste ordonnée de cartes
  (`reply-blocks/AccountRankingCard.tsx:46-51` dans `reply-blocks/ReplyCard.tsx:89-92`, lu dans `data-bellum-src`),
  chacune avec logo, badge « Source : … · 14 septembre 2026 » et CTA « Action : … ».
- **1939.11 / 1939.12** — la réponse arrive écrite ; le bouton « écouter » (`voice/ListenReply.tsx` monté par
  `view/ReplyFooter.tsx`) est une icône du pied de réponse, jamais un préalable.
- **1936.5** — `/briefing` : les cartes réponse/relance portent « Préparer une reprise » / « Préparer une relance »,
  les comptes sont cliquables, et les trois cartes de chevauchement d'agenda ne portent AUCUN CTA — ce que la preuve
  écrite exigeait, ni plus ni moins.
- **1938.4** — Réglages › Notifications porte la section « SMS », rien n'est coché, et l'écran annonce lui-même le
  no-op : « L'envoi de SMS n'est pas encore branché : aucun numéro n'est enregistré et aucun SMS ne part d'ici là ».
  Seul appel réseau : `GET /notifications/sms` (lecture d'état).
- **1916.6 / 1918.8** — `/settings/memory` sépare les trois portées et ÉCRIT leur règle : « Préférences personnelles …
  Personne d'autre ne les voit. » contre « Règles de l'ESN — chaque membre le voit » contre « Contexte d'un compte ».
  La contradiction relevée le 13/09 n'existe plus. Section « Objectifs personnels » présente et distincte.
- **1917.8** — les deux faits épinglés (« Ils refusent les CV anonymisés », « Le référencement passe par la centrale
  d'achat — six semaines ») **ressortent dans la réponse de Laura sur THALES**, et leur fiche affiche « Consulté par
  Laura dans 2 réponses, la dernière le 14 sept. 2026 ». C'est la mémoire prouvée par son EFFET, pas par sa présence.

## 3. La trouvaille de la recette — 1914.2 n'est PAS livré

Question posée telle quelle : « Est-ce que je peux placer un expert cybersécurité chez THALES ? **Réponds par un
verdict net.** » → la réponse sort en **texte sectionné**. Aucun nœud `reply-blocks/VerdictCard.tsx` dans le DOM de
toute la session. Et le verdict est écrit **deux fois** (résumé en tête + section « Verdict »), ce qui heurte la loi 4.

Traçage (lecture seule) : la chaîne d'émission est INTACTE — `reply_formats.py:29-53` importé par
`bellum_advisor.py:16`, inséré ligne 1110 dans le segment invariant de `build_system_prompt`, appelé par
`chat.py:346` ; les 8 types sont enseignés, acceptés par pydantic et rendus par `ReplyBlockView.tsx:20-37`.
**Le défaut est ailleurs** : au moins **quatre gabarits concurrents ouverts par « Verdict »** coexistent sans
arbitrage — `_BLOCK_FORMAT` (`bellum_advisor.py:744`), `_BLOCK_MARKET_ANSWER` (`:462-464`),
`_BLOCK_PRIORITISATION` (`:511-514`) et la carte `verdict` de `reply_formats.py:29-36`. La seule règle anti-cumul
(`:763-766`) ne couvre que Objectif/Angle/Cas d'usage. **Aucune garde ne teste l'ÉMISSION réelle par le modèle** :
`test_reply_formats_prompt.py` teste la présence de la chaîne dans le prompt, `test_reply_blocks.py` mocke
`call_claude`, et `eval:gate` ne rejoue que des fixtures d'analyse.

À corriger après l'atterrissage de #2109 (qui touche déjà `bellum_advisor.py`).

## 4. Coût annoncé

**Deux messages** dépensés chez Laura sur le plafond partagé de 50/jour (classement de comptes, verdict THALES).
Un troisième avait été tapé sans partir — fenêtre redimensionnée entre la capture et le clic : **les coordonnées
d'un clic se re-mesurent après tout changement de taille de fenêtre**, sinon le clic tombe à côté en silence.

## 5. Ce que la recette n'a PAS pu prouver, et pourquoi

- **1914.2** — ci-dessus, défaut réel, correctif identifié.
- **1932.2 / 1932.3** (CTA du bandeau dégradé) — exigent un état DÉGRADÉ, donc de débrancher un connecteur :
  l'autorisation permanente de Louis ne le couvre pas (le rebrancher demande un consentement OAuth que lui seul donne).
- **1939.4 à 1939.10** (transcription, indicateur d'écoute, annulation, chronomètre) — exigent un micro réel ;
  le navigateur piloté n'en a pas. **1939.13** (micro absent en salle de démo) reste testable, à faire.
- **1908.3 / 1908.5** (message d'accueil d'un NOUVEL utilisateur, et contexte insuffisant) — l'espace de Louis a
  27 comptes analysés : le cas ne s'y reproduit pas.
