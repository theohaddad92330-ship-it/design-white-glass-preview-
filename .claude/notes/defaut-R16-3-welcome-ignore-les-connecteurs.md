# R16-3 — `/welcome` applique une règle que la doctrine a remplacée le 13/09

Mesuré en production le 16/09/2026, sur `2e13d009a`, dans l'espace de Louis.

## Ce que l'écran dit, et ce qui est vrai

`/welcome` rend un bloc **« Ce que tes connecteurs débloqueront »**, un bouton
**« Connecter mes outils »**, et trois lignes qui nomment des CAPACITÉS :

> Ton CRM : l'historique et les actions à jour, sans ressaisie.
> Ta messagerie : les réponses favorables et les messages non lus remontent dans ton brief du matin.
> Ton agenda : tes rendez-vous et leurs chevauchements remontent dans ton brief du matin.

Or **quatre connexions OAuth sont vivantes depuis six semaines** sur cet espace,
mesurées à l'API dans la même minute :

| Endpoint | Réponse |
|---|---|
| `GET /api/crm/status` | `connected: true`, `provider: hubspot`, `accountLabel: bellum-it.com`, depuis le **05/08/2026** |
| `GET /api/google/status` | `connected: true`, scopes `calendar.readonly`, `gmail.compose`, … depuis le **05/08/2026** |
| `GET /api/microsoft/status` | `connected: true`, scopes `Mail.Send`, `Calendars.ReadWrite`, … depuis le **14/08/2026** |
| `GET /api/notion/status` | `connected: true`, « Notion de Louis Schlegel », depuis le **14/08/2026** |

Et **la saisie de Laura, elle, les nomme correctement** — `<ul aria-label="Outils
branchés à ton espace">` liste HubSpot, Gmail, Outlook, Google Calendar, Google
Drive, Notion, par injection depuis `connectedClientTools`. **Deux écrans du même
produit se contredisent au même instant.**

## La cause

`WelcomeScreen.tsx:284` rend une liste **statique**. Le fichier ne lit le registre
d'outils nulle part :

```sh
git grep -n "useConnectedCapabilities\|integrationCenterApi" -- apps/web/src/features/welcome   # rc=0, aucun résultat
```

Ce n'était pas une erreur quand ç'a été écrit : le commentaire cite **#1921.8**,
qui appliquait la règle du **02/08/2026** — « jamais de nom d'éditeur côté app,
seule exception Réglages › Intégrations ».

**Cette règle a été REMPLACÉE le 13/09/2026** (décision Louis, batch 11), et
`packages/contracts/src/schemas/tool-naming.ts` le dit en toutes lettres :

> L'outil que l'espace client a LUI-MÊME connecté se nomme, et se montre, partout
> où c'est utile […] Son nom arrive par INJECTION […] Un outil NON connecté ne se
> nomme pas : on nomme la CAPACITÉ.
>
> Règle d'avant (02/08/2026) […] **Elle traitait pareil l'outil du client et le nôtre.**

`/welcome` est resté sur l'ancienne. C'est le motif que la doctrine nomme
elle-même : **une décision appliquée à un écran et pas aux autres.**

## Les trois choses fausses, par ordre de gravité

1. **Un outil branché n'est pas nommé.** La décision du 13/09 dit qu'il doit
   l'être partout où c'est utile, et l'écran d'accueil est exactement cela.
2. **« débloqueront » est au futur** pour des capacités déjà débloquées.
3. **« Connecter mes outils »** est proposé à quelqu'un qui a connecté six
   semaines plus tôt. Le geste offert n'est pas le geste qui reste à faire.

## Ce qu'il faut livrer

- `WelcomeScreen` lit `useConnectedCapabilities()` — le hook existe, il est testé,
  et c'est **le même** chemin que la saisie de Laura. ⚠️ Deux chemins qui liraient
  le même registre finiraient par répondre autre chose : ne pas en écrire un second.
- **Branché** → nommer l'outil, au présent, et proposer le geste suivant (pas
  « connecter »). **Non branché** → garder exactement la formulation actuelle, qui
  est juste. **Registre illisible** → la formulation actuelle aussi : « je ne sais
  pas » se rend comme « non branché », jamais comme une liste inventée.
- Le test qui sait dire NON : un espace avec HubSpot + Gmail branchés ne doit PAS
  rendre « Connecter mes outils », et un espace sans rien branché doit le rendre.

## La question annexe est TRANCHÉE — pas de défaut

`GET /api/tool-registry` rendait `status: "connected"` pour **hubspot, salesforce
et odoo**, là où `GET /api/crm/status` ne nomme qu'un fournisseur actif
(`hubspot`). Deux lectures étaient possibles et je n'ai pas pu les départager à
l'API seule.

**Louis a tranché le 16/09 : les trois sont réellement branchés** sur cet espace
de recette. Le registre dit donc vrai, `/api/crm/status` ne rend que le
fournisseur ACTIF (un seul à la fois), et la saisie de Laura nomme trois outils
que l'espace a bien connectés. **Aucun défaut, rien à coder.**

⚠️ À garder en tête pour la prochaine mesure : `/api/crm/status` n'est PAS
l'inventaire des connexions — il rend le CRM actif. Confondre les deux fabrique
un faux défaut, et j'ai failli l'ouvrir.
