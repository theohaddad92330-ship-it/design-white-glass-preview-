# État du produit au 31/07/2026 — livré / en cours / fragile / hors scope

La liste demandée par Théo. Un écran n'est « livré » que s'il est branché sur de la
donnée réelle et atteignable depuis la navigation. « Fragile » = ça marche, mais ça
dépend d'une condition qu'un client peut ne pas remplir.

---

## Livré et solide

**Analyse & dossier de compte** — pipeline complet (recherche → signaux → entités →
contacts → organigramme → plan d'action), sources publiques FR (recherche-entreprises,
BODACC, BOAMP, DECP marchés attribués, France Travail, APEC), score de compte /25,
verdict GO/NO-GO, périmètre du groupe, historique de veille.

**Contacts** — fiche, enrichissement en cascade (Apollo → SalesQL → Dropcontact),
organigramme sourcé avec niveau de confiance, cadence de relance, envoi d'e-mail avec
opt-out RFC 8058, export CRM.

**Copilote** — chat contextuel, 7 outils (2 lecture, 5 propositions à confirmer),
réponses structurées, mémoire longue avec épinglage.

**Équipe & workspace** — invitations, rôles, sièges, RLS, commentaires d'équipe,
attribution de comptes, objectifs, cockpit manager, page Pilotage.

**Facturation** — catalogue de paliers éditable en backoffice, checkout Stripe, sièges
supplémentaires, monnaie unique (1 crédit = 1 action), jauge unique.

**Backoffice (DM)** — utilisateurs, ESN, équipes, offres, facturation, usage, monitoring
des runs, files d'attente, santé des services, feature flags, retours, bandeaux.

**Intégrations** — 8 OAuth (HubSpot, Salesforce, Pipedrive, Attio, Google, Microsoft,
Notion, MCP) + webhooks sortants (Slack, Teams, Discord, Google Chat, Mattermost,
générique). Toutes en no-op strict sans clés.

**Démo** — lien public, pool de salles simultanées, remise à neuf entre visiteurs, zéro
appel IA, zéro crédit, zéro fournisseur contacté, page d'accueil explicative (31/07).

**Veille** — refresh quotidien des comptes suivis, détection des nouveaux signaux,
notifications in-app et sortantes.

**Vivier / Besoins / Opportunités** — matching déterministe, brief, réécriture de CV
garde-fous compris, écran Besoins.

**Sécurité** — anti-partage de mot de passe (5 appareils), sessions révocables,
rate-limit, rétention RGPD automatique, chiffrement AES-256-GCM des tokens tiers, Sentry
sur les 3 services.

---

## En cours (cette série de lots)

- Suivi des coûts par analyse / utilisateur / **fournisseur** (aujourd'hui : coût par run
  seulement, et compteurs LLM en mémoire perdus à chaque redéploiement).
- Centre Intégrations : état, droits, **dernière synchronisation**, **journal des envois**.
- Centre Actions & Automatisations : vue unifiée à valider / planifiées / en cours /
  terminées / échecs.
- Runbook production (prod, staging, sauvegardes, rollback, bugs connus).
- Recette auth / sessions / navigation / exports / enrichissements / déconnexions.

---

## Fragile — ça marche, sous conditions

**Le lien de démo dépend d'une API vivante.** Le 31/07, l'API prod a répondu « Application
not found » à l'edge Railway pendant plusieurs heures : la page annonçait « lien de démo
invalide » à un prospect alors que le lien était bon. Le message est corrigé (on
n'accuse plus le lien), mais **rien ne surveille l'API** : personne n'est prévenu quand
elle tombe. → à brancher (D19 / monitoring).

**Profondeur de la collecte bridée en prod.** `FIRECRAWL_MAX_PAGES=3` traîne côté
Railway alors que le code prévoit 12. Conséquence directe : la page équipe/gouvernance
d'un site peut ne jamais être lue, et l'organigramme perd sa confirmation « site
officiel ». → variable à supprimer (D17).

**Le coût réel des fonctions hors analyse n'est pas mesuré.** Un run déclare ~0,75 € ;
la facture Anthropic de juillet est ~7× supérieure au total des runs. Le reste part dans
le copilote, les messages, les briefs — qui ne débitent aucun crédit. Un client très
actif est à marge négative sans qu'on le voie. → D4 + suivi des coûts.

**Enrichissement de contact : couverture inégale.** La cascade est bornée à 25 s ; sur un
cluster chargé, un contact peut revenir sans e-mail alors qu'une source l'aurait trouvé.
Aucune donnée n'est inventée et aucun crédit n'est débité dans ce cas, mais l'utilisateur
voit « rien trouvé ».

**Connecteur BoondManager non validé sur instance réelle.** L'authentification et les
chemins sont vérifiés ; le nom du paramètre de recherche des listes n'est pas public
(surchargeable par variable). Un paramètre ignoré dégrade la couverture — il ne crée
jamais de faux rattachement.

**Welcome to the Jungle : source inactive et documentée comme telle.** Pas d'API publique
gratuite. S'active si l'opérateur fournit ses propres identifiants Algolia légitimes.

**Stripe en mode test.** Le code est prêt ; les prix live restent à créer (D18).

**Pas d'analytics.** Ni sur le site, ni dans l'app. On ne saura pas combien de visiteurs
le lien de démo convertit (D21).

**Source maps front absentes en prod.** Les erreurs JavaScript remontent minifiées dans
Sentry — un bug client est plus long à localiser.

---

## Hors scope avant le lancement public

- **LinkedIn** — aucune API d'envoi ou de scraping conforme. Ce qui est faisable :
  préparer le message, pas l'envoyer.
- **CRM bidirectionnel** — l'export fonctionne ; la relecture de l'activité CRM dans
  Bellum n'est pas construite (la couche zéro lit déjà Drive/Notion/Gmail/Outlook/ATS).
- **Devises multiples** — les packs pays existent (BE, US, CA, CH, LU) mais tout est
  facturé en euros.
- **Application mobile** — non prévue ; l'app est responsive.
- **Pentest externe** — à commander (P2), pas réalisable en interne.
- **Sous-traitance RGPD / DPA signés** avec chaque fournisseur — juridique, pas produit.
