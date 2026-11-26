# Dette RGPD — les quatre brouillons (décision 11 du 15/09/2026)

Louis s'en occupe cette semaine. Ce fichier est la matière première : **chaque
affirmation est adossée à un `fichier:ligne` mesuré le 15/09/2026**, pas à un
souvenir. Ce qui n'a pas de réponse technique est écrit comme tel — un trou nommé
vaut mieux qu'une case cochée.

⚠️ **Ce document n'est pas un avis juridique.** Je décris ce que le code FAIT.
La qualification (intérêt légitime ou consentement, durée proportionnée, mentions
suffisantes) appartient au juriste. L'auteur du cadre l'écrit lui-même dans
`doctrine-registry.ts:1740` : « Je pose le cadre technique, pas l'avis juridique. »

---

## Ce que le code fait vraiment — les faits, avant les brouillons

### Le flux COMPORTEMENTAL (traceur produit, #1682)

| Fait | Preuve |
| --- | --- |
| Interrupteur `VITE_PRODUCT_TRACKER_ENABLED`, **éteint par défaut** | `apps/web/src/lib/product-tracker.ts:200` ; `main.tsx:22` (no-op strict : aucun timer, aucun écouteur) |
| Point d'ingestion **public, sans JWT**, par `navigator.sendBeacon()` | `analytics.controller.ts:47` et son en-tête |
| **Aucun `user_id`** : `trackBehavioral()` écrit `null` | `product-event.entity.ts:37-41` |
| **Aucun `workspace_id`** : écrit `null` INCONDITIONNELLEMENT | `product-event.entity.ts:50` ; `product-analytics-read.service.ts:44-50` |
| L'identifiant est un **hash de session**, tourné à 24 h | `session_id`, `product-event.entity.ts:67` ; `SESSION_HASH_ROTATION_HOURS = 24` |
| Le chemin est **replié vers son motif** avant toute agrégation (`/accounts/3f1c…` → `/accounts/$id`) | `resolveProductScreen`, `product-analytics-read.service.ts:38-43` |
| **Plancher de 5 sessions distinctes** appliqué à la LECTURE ; sous le seuil on rend `below_threshold`, **jamais `0`** | `MIN_DISTINCT_SESSIONS_FOR_A_METRIC = 5` ; `product-analytics-read.service.ts:30-36` |
| Aucun contenu de champ n'est émis | garde `product-tracker-emits-no-content.spec.ts` |
| **7 des 9 émetteurs n'ont aucun appelant de production** — seuls `screen_viewed` et `screen_left` sont câblés | `product-analytics-read.service.ts:56-62` |

### ⚠️ Le seul trou technique que j'ai trouvé, et il est réel

**Aucune purge de `product_events` n'existe.** Le dépôt a des routines de rétention
(`AUDIT_JOURNAL_RETENTION_DISABLED`, `RETENTION_SWEEP_DISABLED`,
`STORAGE_RETENTION_PURGE_DISABLED`) — **aucune ne vise cette table.** Le seul
`DELETE` du dépôt sur `product_events` est dans le `down()` d'une migration
(`1789104731562-ProductEventsBehavioral.ts:70`), donc il ne s'exécute jamais en
service normal.

Conséquence à porter au juriste sans l'adoucir : **la limitation de conservation
(art. 5.1.e) n'a aujourd'hui aucune réponse technique pour ce flux.** Les lignes
comportementales s'accumulent sans borne. C'est le point le plus faible du dossier,
et le plus facile à corriger — une durée décidée, une routine, un interrupteur.

Par comparaison, `laura_unrouted_intents` **est** purgée à 90 jours
(`laura-unrouted-intent.entity.ts:15`). La différence entre les deux flux est donc
un oubli, pas une architecture.

### Le flux NOTIFICATIONS

| Fait | Preuve |
| --- | --- |
| Les défauts SQL de `weekly_digest` et `newsletter_changelog` sont passés à `false` | `1792800260000-NotificationOutboundDefaultsOff.ts` |
| Cette migration **ne réécrit aucune ligne existante**, à dessein | même fichier, en-tête |
| Les lignes créées avant portent donc un `true` **hérité, jamais choisi** | `changelog-newsletter.service.ts:322` insère 2 colonnes, Postgres remplit le reste |
| ⚠️ **L'entité déclare encore `default: true`** pour ces deux colonnes — divergence avec le schéma SQL, à mesurer | `notification-preference.entity.ts:25` et `:47` |
| Le canal SMS est un no-op strict sans `SMS_PROVIDER_API_KEY` | `agent_docs/env-reference.md` |

---

# Pièce 1 — Base juridique du traitement « analytique produit »

**Traitement** : mesure de l'usage du produit BellumAI, à des fins d'amélioration
du service.

**Base juridique proposée : l'intérêt légitime** (art. 6.1.f), et non le consentement.
Le raisonnement à faire valider :

1. **Intérêt poursuivi** : comprendre quels écrans du produit sont abandonnés, pour
   les corriger. Intérêt propre au responsable de traitement, et légitime.
2. **Nécessité** : le traitement est minimal par construction — pas d'identifiant de
   personne, pas d'identifiant d'espace client, pas de contenu de champ, un
   identifiant de session qui tourne toutes les 24 h. **Il n'existe pas de moyen
   moins intrusif d'obtenir la même information** : sans identifiant de session, on
   ne peut pas distinguer un parcours de dix parcours.
3. **Balance des intérêts** : les données ne permettent ni de réidentifier une
   personne, ni de la suivre d'un jour sur l'autre (rotation 24 h), ni de savoir ce
   qu'elle a tapé. Le plancher de 5 sessions distinctes à la lecture empêche qu'une
   « moyenne » désigne quelqu'un.

**Ce qui fragilise cette base, et qu'il faut dire au juriste :**
- **L'absence de durée de conservation** (voir le trou ci-dessus). Un intérêt
  légitime sans limitation de conservation se défend mal.
- **Deux exceptions nommées** ont été ouvertes le 13/09/2026 contre recommandation :
  l'alerte opérateur `espace_a_risque` (qui nomme un espace client) et la trace
  `laura_unrouted_intents` (qui garde 300 caractères d'une demande masquée). Elles
  sont décrites au registre de doctrine, `doctrine-registry.ts:1741-1744`.

**Droit d'opposition** : à traiter. L'intérêt légitime l'ouvre (art. 21). Aujourd'hui
le seul interrupteur est global (`VITE_PRODUCT_TRACKER_ENABLED`), pas individuel.
**Question au juriste : un interrupteur par personne est-il exigible ici ?**

---

# Pièce 2 — Entrée au registre des traitements

Brouillon, à recopier dans le registre après validation.

| Rubrique | Contenu proposé |
| --- | --- |
| **Nom du traitement** | Analytique produit — mesure d'usage des écrans |
| **Responsable de traitement** | Bellum-IT |
| **Finalité** | Améliorer le produit : identifier les écrans et parcours abandonnés |
| **Base juridique** | Intérêt légitime (art. 6.1.f) — voir pièce 1 |
| **Catégories de personnes** | Utilisateurs authentifiés et visiteurs non authentifiés du produit |
| **Catégories de données** | Nom d'événement ; motif d'écran (jamais le chemin brut) ; horodatage ; identifiant de session pseudonyme tourné à 24 h. **Aucun identifiant d'utilisateur, aucun identifiant d'espace, aucun contenu de champ.** |
| **Destinataires** | Interne uniquement. Aucun sous-traitant analytique tiers — ni rejeu de session, ni carte de chaleur (garde GA-240) |
| **Transferts hors UE** | Aucun pour ce traitement (base Supabase, eu-west-1) |
| **Durée de conservation** | ⚠️ **À DÉCIDER — aucune durée n'est aujourd'hui appliquée.** Proposition à valider : 13 mois, alignée sur l'usage courant des mesures d'audience |
| **Mesures de sécurité** | Ingestion sans authentification mais sous limiteur de débit global ; repliement du chemin vers son motif avant agrégation ; plancher de 5 sessions distinctes à la lecture ; masquage des clés sensibles avant insertion |

**Deux entrées séparées à prévoir** pour les exceptions du 13/09 —
`espace_a_risque` (alerte opérateur, nomme un espace client) et
`laura_unrouted_intents` (300 caractères masqués, purge 90 jours) : leurs finalités
et leurs bases ne sont pas celles du traitement principal.

---

# Pièce 3 — Paragraphe de politique de confidentialité

Brouillon rédigé pour être lu par un utilisateur, pas par un juriste.

> **Mesure d'usage du produit**
>
> Pour comprendre quels écrans de Bellum posent problème, nous enregistrons les
> écrans consultés et le moment où ils sont quittés. Cette mesure ne porte sur
> personne en particulier : elle n'enregistre ni votre identifiant, ni celui de
> votre organisation, ni le contenu de ce que vous saisissez. Elle utilise un
> identifiant de session temporaire, renouvelé toutes les 24 heures, qui ne permet
> pas de vous suivre d'un jour à l'autre.
>
> Nous n'utilisons aucun outil de rejeu de session ni aucune carte de chaleur : le
> produit contient les données commerciales de nos clients, et nous ne les
> transmettons à aucun prestataire de mesure d'audience.
>
> Aucune statistique n'est publiée en dessous de cinq sessions distinctes — en
> dessous de ce seuil, une moyenne désignerait quelqu'un.
>
> Ces données sont conservées ⟦DURÉE À DÉCIDER⟧ puis supprimées.
>
> Cette mesure repose sur notre intérêt légitime à améliorer le service. Vous pouvez
> vous y opposer en nous écrivant à ⟦ADRESSE⟧.

⚠️ La ligne « conservées ⟦DURÉE⟧ puis supprimées » **ne doit pas être publiée avant
que la routine de purge existe.** Écrire une durée qu'aucun code n'applique est le
seul vrai risque de ce paragraphe.

---

# Pièce 4 — Base légale du consentement aux notifications

Celle-ci est la plus urgente, parce que la **décision 7 du 15/09 branche les
émetteurs SMS et e-mail**. Tant qu'aucun émetteur n'était branché, la question était
théorique. Elle ne l'est plus.

**Le fait gênant, en une phrase** : il existe en base des lignes portant
`weekly_digest = true` que **personne n'a jamais cochées** — elles ont été créées par
`changelog-newsletter.service.ts:322`, qui insère deux colonnes et laisse Postgres
remplir le reste avec un `DEFAULT true` d'alors.

**Ce qui est déjà corrigé** : le défaut SQL est passé à `false`
(`1792800260000-NotificationOutboundDefaultsOff.ts`), donc les nouvelles lignes ne
sont plus précochées. ✅ **La divergence entité/SQL que j'avais signalée n'envoyait
rien de faux** — mesuré le 15/09 : le pilote Postgres de TypeORM émet le mot-clé
`DEFAULT` à l'insertion, jamais la valeur `column.default` de l'entité, donc c'est
bien le défaut SQL qui s'appliquait. L'entité a quand même été alignée sur `false`
pour que les deux disent la même chose.

**Ce qui n'est pas corrigé** : les lignes déjà écrites. Un balayage est en cours
d'écriture, en simulation d'abord, avec compte affiché avant écriture.

**Les questions au juriste**, dans l'ordre où elles commandent le code :
1. **Un `true` hérité d'un défaut de base constitue-t-il un consentement ?**
   Ma lecture technique est non — il n'y a ni acte positif, ni information préalable.
   Si le juriste confirme, le balayage doit **remettre ces lignes à `false`**, et
   c'est une décision de produit autant que de droit.
2. **Quelle base pour chaque canal ?** Une notification de service (« tes crédits
   sont bas ») et une lettre d'information produit ne relèvent pas du même régime.
   Le premier peut tenir sur l'exécution du contrat ; la seconde appelle un
   consentement, et un lien de désinscription dans chaque envoi.
3. **Le SMS** : `SMS_ALLOWED_COUNTRY_CODES` vaut `33` par défaut. Les règles de
   prospection par SMS sont plus strictes que par e-mail — à vérifier avant que la
   décision 7 mette un émetteur en service.
4. **La preuve du consentement** (art. 7.1) : le dépôt sait dire qu'une case est à
   `true`, il ne sait pas dire **quand ni comment** elle y est passée. Si le juriste
   exige la preuve, il faut ajouter la date et l'origine du choix — c'est un
   chantier séparé, additif, et il doit être décidé avant de brancher les émetteurs.

---

## Ce que je recommande de faire AVANT la relecture juridique

Deux gestes qui coûtent peu et qui changent le dossier :

1. **Décider une durée de conservation pour `product_events` et poser la routine.**
   C'est le seul trou franc. Tant qu'il est ouvert, la pièce 1 se défend mal et la
   pièce 3 ne peut pas être publiée telle quelle.
2. **Trancher la question 1 de la pièce 4** — un `true` hérité vaut-il consentement ?
   Le balayage est écrit pour les deux réponses, mais il ne peut pas partir sans elle.

---

## Mise à jour du 15/09 au soir — deux critères de consentement existent maintenant

Deux lots ont répondu le même jour à la même question de fond — *« un booléen sans
date vaut-il consentement ? »* — sur **deux objets différents**, et sans se voir
(le second a cherché la branche du premier avant qu'elle soit poussée) :

| Lot | Critère | Objet | Règle |
| --- | --- | --- | --- |
| `feat/balayage-weekly-digest` | `isInheritedWeeklyDigest` | `notification_preferences.weekly_digest` | hérité ⇔ `true` ET `updated_at === created_at` ET (signature du semis OU antérieur à la migration) |
| `feat/emetteurs-alertes-decouvrir` | `isQualifiedOutboundConsent` | `saved_views.alert_consent_at` | qualifié ⇔ une **date** lisible et **passée** ; `null`, illisible ou à venir = refus |

**Ce n'est pas une violation de GA-26** : deux tables, deux questions distinctes
(« ce `true` est-il hérité ? » contre « ce consentement est-il qualifié ? »). Mais
le **principe** est désormais écrit à deux endroits, et deux endroits divergent.

**Ce que ça dit au juriste, et c'est la bonne nouvelle du jour** : le dépôt a
maintenant, pour les alertes de Découvrir, exactement ce que l'article 7.1 demande —
la **preuve** du consentement, sous forme d'une date. La question 4 de la pièce 4
(« le dépôt sait dire qu'une case est à `true`, pas quand ni comment ») n'est donc
plus ouverte pour ce canal-là. Elle le reste pour `notification_preferences`.

**La suite, quand les deux branches auront atterri** : un seul prédicat nommé, dans
les contrats, dont les deux tables dérivent. Pas avant — unifier deux critères qui
n'ont pas encore été relus en production serait unifier deux hypothèses.
