# Payment architecture BellumAI

Ce document décrit l'état actuel du billing. Le produit dispose déjà d'une couche crédits/paiement branchée à Stripe, mais le modèle entreprise, les plans d'abonnement définitifs et l'allocation de crédits par workspace ne sont pas encore finalisés.

## Vue d'ensemble

| Couche        | Responsabilité                                                                                |
| ------------- | --------------------------------------------------------------------------------------------- |
| `@bellum/web` | Page billing, affichage crédits, redirections Checkout/Portal, anneau de crédits via `Gauge`. |
| `@bellum/api` | Endpoints `/credits`, règles de crédits, webhooks Stripe, persistance abonnement.             |
| Stripe        | Checkout subscription, setup payment method, billing portal, events webhook.                  |
| PostgreSQL    | Table `subscriptions` via `SubscriptionEntity`.                                               |

## Endpoints API

| Endpoint                             | Auth requise          | Rôle                                                                       |
| ------------------------------------ | --------------------- | -------------------------------------------------------------------------- |
| `GET /credits`                       | Oui                   | Retourne le plan et les compteurs de l'utilisateur.                        |
| `GET /credits/plans`                 | Non                   | Retourne la configuration de plans codée côté API.                         |
| `POST /credits/checkout`             | Oui                   | Crée une session Stripe Checkout en mode subscription.                     |
| `POST /credits/portal`               | Oui                   | Crée une session Stripe Billing Portal si un customer existe.              |
| `POST /credits/setup-payment-method` | Oui                   | Crée une session Stripe Checkout en mode setup pour enregistrer une carte. |
| `POST /credits/webhook`              | Non, signature Stripe | Vérifie la signature et applique les events Stripe.                        |

## Plans actuels

Les plans sont codés dans `CreditsService` :

| Plan      | Prix mensuel | Limite comptes | Crédits enrichissement |
| --------- | ------------ | -------------- | ---------------------- |
| `free`    | 0 EUR        | 3              | 0                      |
| `starter` | 49 EUR       | 10             | 10                     |
| `pro`     | 99 EUR       | 30             | 50                     |
| `scale`   | 199 EUR      | 999999         | 200                    |

Ces plans sont suffisants pour l'interface actuelle, mais ils ne doivent pas être considérés comme la configuration commerciale finale.

## Flux checkout

1. Le front appelle `POST /credits/checkout` avec le plan choisi et éventuellement des URLs de retour.
2. L'API construit une session Stripe Checkout en mode `subscription`.
3. Le metadata Stripe contient `userId` et `plan`.
4. Stripe redirige vers `success_url` ou `cancel_url`.
5. Le webhook `checkout.session.completed` met à jour la ligne `subscriptions`.

## Flux portail et carte bancaire

Le portail Stripe exige un `stripe_customer_id`.

- Si l'utilisateur a déjà un customer Stripe, `POST /credits/portal` renvoie une URL de portail.
- Sinon, l'API renvoie `{ url: null, error }` et le front peut proposer `setup-payment-method`.
- `POST /credits/setup-payment-method` crée un customer si besoin puis ouvre une session Checkout en mode `setup`.

## Webhooks Stripe traités

| Event                           | Effet                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `checkout.session.completed`    | Upsert de la ligne abonnement utilisateur avec plan, limites, credits et IDs Stripe. |
| `customer.subscription.updated` | Met à jour plan, limite comptes et crédits si le metadata `plan` est présent.        |
| `customer.subscription.deleted` | Repasse l'utilisateur en `free`.                                                     |

Les autres events sont loggés en debug.

## Persistance actuelle

La source persistée est `SubscriptionEntity`, exposée comme table `subscriptions`.

Champs fonctionnels principaux :

- `user_id`
- `plan`
- `accounts_limit`
- `accounts_used`
- `enrichment_credits`
- `stripe_customer_id`
- `stripe_subscription_id`

Les crédits d'enrichissement sont consommés de façon atomique avec une requête SQL `enrichment_credits > 0`, afin d'éviter qu'une concurrence entre deux enrichissements ne consomme le même crédit.

## Limites connues

- Les produits/prix Stripe ne sont pas encore modélisés comme source de vérité externe.
- Les plans sont encore codés côté API.
- Les abonnements workspace/entreprise ne sont pas implémentés.
- L'allocation de crédits par membre est mockée en démo workspace.
- Il n'existe pas encore d'historique détaillé de consommation/remboursement des crédits.
- Le mapping complet entre plan Stripe, droits applicatifs, workspace, rôles et permissions reste à définir.
- Le billing réel doit rester centré utilisateur tant que le modèle workspace backend n'est pas livré.

## Variables requises

| Variable                | Usage                           |
| ----------------------- | ------------------------------- |
| `STRIPE_SECRET_KEY`     | SDK Stripe côté API.            |
| `STRIPE_WEBHOOK_SECRET` | Vérification signature webhook. |
| `FRONTEND_URL`          | URLs de retour Checkout/Portal. |

En local, utiliser uniquement des clés test. En production, utiliser les clés live et vérifier le webhook de l'environnement cible.
