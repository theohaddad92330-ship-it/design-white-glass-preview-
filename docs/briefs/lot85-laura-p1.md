# Lot 85 — Laura · P1 (#4771, #4794)

Périmètre : apps/ia/app/services/chat*tools.py, apps/ia/tests/test_4771*\*.py, apps/web/src/features/chat/view/ReplyBadges.test.tsx, docs/briefs/lot85-laura-p1.md

## Antériorité

- #4794 : livré par la PR #4809 (`claude/base-a-lecteur-commun-4792`), OUVERTE, pas dans main (`base_reader_tool.py` absent de origin/main).
  Le recoder ici doublerait le lecteur commun (GA-26) : ce lot ne le touche pas. À fermer quand #4809 est fusionnée.
- #4771 : cause mesurée — `cited_sources` (chat_tools.py) ne connaissait pas `search_job_offers` ; `context.sources` restait vide
  avec un outil lu, et `deriveReplyBadges` (`toolsRead === true && sourceCount === 0`) posait `no_current_proof`.

## Fait

- `cited_sources("search_job_offers")` : UNE source (`market_signal`, « Offres d'emploi publiées », jamais un fournisseur),
  datée de l'offre la plus récente, sans date si aucune offre n'en porte ; rien sur erreur ou zéro offre.
- Tests : `test_4771_offers_cited_sources.py` (rouge → vert), cas web « liste d'offres lue + badge ».

## Ne fait pas

- Aucun changement de `deriveReplyBadges` ni du contrat de badges (le badge reste vrai pour un tour sans preuve).
- Pas de lecteur de base, pas de nouvel outil (#4794 = #4809).
- Jumeaux : les autres outils de liste sans citeur ne sont pas audités ici (question ouverte ci-dessous).
