# Sécurité et RGPD — Checklist

## Sécurité existante (à conserver)

- ✅ Supabase RLS sur toutes les tables (auth.uid() = user_id)
- ✅ Auth JWT vérifié dans chaque Edge Function
- ✅ Clés API dans Supabase Secrets (jamais côté client)

## À implémenter AVANT le lancement

- [ ] CORS restreint au domaine bellum-ai.com (pas wildcard \*)
- [ ] Rate limiting : 20 analyses/heure/utilisateur (@nestjs/throttler)
- [ ] Validation et sanitisation de tous les inputs (class-validator NestJS)
- [ ] Headers de sécurité HTTP (CSP, HSTS, X-Frame-Options)
- [ ] Audit des dépendances npm (npm audit)
- [ ] Google OAuth configuré (redirect URI dans Supabase)
- [ ] Politique de confidentialité + CGU publiées
- [ ] Mentions RGPD (contacts = données personnelles B2B, base légale : intérêt légitime)

## À implémenter APRÈS le lancement

- [ ] Chiffrement applicatif des emails/téléphones enrichis
- [ ] Audit trail (qui a accédé à quelles données)
- [ ] Mécanisme de suppression RGPD automatisé
- [ ] Détection connexions multi-device simultanées (anti-partage)
- [ ] Monitoring Sentry pour les erreurs
- [ ] Backup BDD vérifié (Supabase le fait, vérifier la rétention)

## NestJS — Guards et validation

Chaque route protégée par JwtAuthGuard :

```typescript
@UseGuards(JwtAuthGuard)
@Controller('analysis')
export class AnalysisController { ... }
```

ValidationPipe sur tous les DTOs :

```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
```
