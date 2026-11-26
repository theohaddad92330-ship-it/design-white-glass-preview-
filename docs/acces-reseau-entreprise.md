# Accès depuis le réseau d'une entreprise cliente

À donner à l'IT du client **dès la signature**, avant le premier onboarding.

## Le problème, en une phrase

`bellum-ai.com` est un domaine récent. Les passerelles de sécurité d'entreprise
(Cato, Zscaler, Netskope, Palo Alto, Fortinet…) classent tout domaine qu'elles ne
connaissent pas en **`Uncategorized`**, et la plupart des politiques bloquent ou
avertissent sur cette catégorie par défaut.

**Toutes les ESN ont une de ces passerelles.** Ce n'est donc pas un incident :
c'est l'état par défaut de chaque nouveau client tant que le domaine n'est pas
catégorisé.

## Le piège qui fait perdre une demi-journée

Ces passerelles fonctionnent souvent en mode **avertissement**, avec un bouton
« PROCEED ». Ça marche pour une page — l'utilisateur clique et entre. **Ça ne
marche pas pour un appel d'API** : une requête `fetch()` n'a pas d'humain
derrière pour cliquer. Elle est simplement refusée.

Le symptôme est alors trompeur :

| Ce que l'utilisateur voit                  | Ce qui se passe vraiment                   |
| ------------------------------------------ | ------------------------------------------ |
| La page de connexion s'affiche normalement | `app.bellum-ai.com` a été autorisé au clic |
| « **Failed to fetch** » à la connexion     | `api.bellum-ai.com` est bloqué, en silence |

L'utilisateur et son IT concluent à un problème de mot de passe. Ça n'en est
pas un : le serveur n'a jamais reçu la requête.

> Cas réel — 25/08/2026, Keyrus (Cato Networks, catégorie `Uncategorized`,
> reference ID `3056180665`). Identifiants parfaitement valides.

## Ce qu'il faut demander à l'IT du client

Autoriser ces **deux** domaines, en HTTPS :

```
app.bellum-ai.com     application web
api.bellum-ai.com     API — sans elle, rien ne fonctionne, pas même la connexion
```

⚠️ **Le second est celui qu'on oublie**, parce que l'utilisateur ne le voit
jamais dans sa barre d'adresse. Une demande qui ne cite que le premier produit
exactement le symptôme décrit plus haut.

Deux précisions qui évitent un second aller-retour :

1. **Exclure `api.bellum-ai.com` de l'inspection SSL.** Le domaine envoie
   `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
   Sur un domaine `preload`, le navigateur **refuse** le certificat réémis par
   une passerelle d'inspection, et il n'offre aucun « continuer quand même ».
2. **Autoriser les WebSockets** vers `api.bellum-ai.com` (`wss://`). Sans elles,
   l'application fonctionne mais la progression d'une analyse ne se rafraîchit
   plus qu'une fois toutes les 15 secondes au lieu d'être instantanée. Ce n'est
   pas bloquant — c'est simplement moins agréable.

## Modèle de message pour le client

> Bonjour,
>
> Pour que nos équipes puissent utiliser BellumAI, merci d'autoriser les deux
> domaines suivants sur la passerelle web :
>
> - `app.bellum-ai.com` (application)
> - `api.bellum-ai.com` (API — indispensable, y compris pour la connexion)
>
> Merci également d'exclure `api.bellum-ai.com` de l'inspection SSL : le domaine
> est en HSTS preload, et le certificat réémis par la passerelle y est refusé
> par le navigateur.
>
> Si un blocage a déjà été rencontré, la référence de l'incident dans votre
> console facilite la recatégorisation.

## L'action de fond, côté Bellum

Faire **catégoriser `bellum-ai.com`** auprès des moteurs d'URL. C'est gratuit,
ça prend quelques jours, et ça règle le problème pour **tous les clients à
venir** au lieu de le traiter un par un.

| Moteur                         | Où soumettre                                     |
| ------------------------------ | ------------------------------------------------ |
| BrightCloud / Webroot          | `brightcloud.com/tools/url-ip-lookup.php`        |
| Symantec / Broadcom (Bluecoat) | `sitereview.bluecoat.com`                        |
| Zscaler                        | `sitereview.zscaler.com`                         |
| Palo Alto                      | `urlfiltering.paloaltonetworks.com`              |
| Fortinet                       | `fortiguard.com/faq/wfratingsubmit`              |
| Trellix (McAfee)               | `trustedsource.org`                              |
| Cato Networks                  | via le support client — pas de formulaire public |

Catégorie à demander : **Business / Software as a Service** (ou l'équivalent
« Business & Economy » selon le moteur).

## Le repli technique, si l'IT refuse ou traîne

`apps/web/vercel.json` porte une réécriture qui sert l'API **sous le domaine de
l'application** :

```
https://app.bellum-ai.com/api/*   →   https://api.bellum-ai.com/*
```

Il n'y a alors **qu'un seul domaine à autoriser**, et il est visible dans la
barre d'adresse — donc c'est celui que l'IT autorise spontanément.

**Cette réécriture est en place mais INACTIVE.** Le front continue d'appeler
`api.bellum-ai.com` en direct. Pour l'activer, il faut passer `VITE_API_URL` à
`/api` sur le projet Vercel et redéployer.

### Ce qu'il faut savoir AVANT d'activer

| Point                  | Conséquence                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Socket.IO**          | Les réécritures Vercel ne proxifient **pas** les WebSockets, et `lib/socket.ts` est en `transports: ['websocket']` sans repli. La progression d'analyse retombe sur le filet HTTP (`useAnalysisStatusSync`, 15 s). L'application marche, elle est moins vivante. |
| **Uploads volumineux** | `/meeting-notes/transcribe` accepte 34 Mo, `/rag-documents/ingest`, `/rfp` et `/talents/intake` 12 Mo. **À tester avant de basculer** — la limite de corps d'une réécriture Vercel n'est pas documentée de façon fiable.                                         |
| **Cookies**            | Même origine : le scope `COOKIE_DOMAIN` cesse d'être nécessaire pour ce client. C'est un gain, pas un risque.                                                                                                                                                    |
| **CORS**               | Disparaît entièrement — plus de préflight, plus d'en-tête à accorder.                                                                                                                                                                                            |

Bascule à préférer **par client bloqué**, pas globalement : l'activer pour tout
le monde ferait perdre le temps réel à ceux qui n'ont aucun problème d'accès.
