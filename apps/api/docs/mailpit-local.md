# Tester les emails transactionnels en local avec Mailpit

## 1) Lancer l'infra locale (incluant Mailpit)

```bash
pnpm docker:up
```

Mailpit expose :

- SMTP : `localhost:1025`
- UI : `http://localhost:8025`

## 2) Vérifier la configuration SMTP locale

Dans `tools/dev.secret.sh` (copie de `tools/dev.secret.sh.example`) :

```bash
export SMTP_HOST="localhost"
export SMTP_PORT="1025"
export SMTP_SECURE="false"
export SMTP_USER=""
export SMTP_PASSWORD=""
export SMTP_FROM="noreply@bellum.local"
export EMAIL_PROVIDER="mailpit"
export RESEND_API_KEY=""
export RESEND_FROM="noreply@bellum.local"
```

En production, le mailer bascule **automatiquement** sur Resend : `EMAIL_PROVIDER` n'a
volontairement **aucun défaut** de schéma, donc quand la variable n'est pas posée et que
`NODE_ENV=production`, `resolveEmailTransportMode` choisit Resend (voir `mailer.service.ts`).
Il suffit donc de fournir la clé et l'expéditeur :

```bash
# EMAIL_PROVIDER non posé en prod => Resend auto. (Forcer "resend" reste possible/inoffensif.)
export RESEND_API_KEY="re_xxx"                 # clé live valide, obligatoire
export RESEND_FROM="onboarding@votre-domaine.tld"  # domaine VÉRIFIÉ dans Resend (SPF/DKIM), hors sandbox
```

> ⚠️ Piège historique (bug signup 15/07/2026) : tant que `EMAIL_PROVIDER` avait un défaut
> `'mailpit'`, la prod envoyait en silence vers `localhost:8025` et **aucun** mail (OTP, welcome,
> reset) n'arrivait. Défaut retiré. Si un mail ne part pas, chercher `Mailer job failed` dans les
> logs API : le message dira si c'est `RESEND_API_KEY` manquant, un domaine `RESEND_FROM` non
> vérifié, ou un compte Resend en sandbox.

## 3) Envoyer un email de test via le backend

Démarrer l'API puis appeler l'endpoint de test :

```bash
curl -X POST http://localhost:3000/emails/test \
  -H "Content-Type: application/json" \
  -d '{"to":"test@bellum.local","subject":"Mailpit smoke test"}'
```

## 4) Vérifier la capture dans Mailpit

Ouvrir `http://localhost:8025` puis vérifier la présence de l'email envoyé.

Workflow rapide :

1. `pnpm docker:up`
2. `pnpm --filter api dev`
3. appel `POST /emails/test`
4. contrôle dans Mailpit UI
