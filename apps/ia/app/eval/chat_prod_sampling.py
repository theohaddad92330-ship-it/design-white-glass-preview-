"""#2443.10 (#2899) — le réglage d'opérateur du JUGE de production ; l'échantillonnage de conversations est un opt-in PAR ESPACE.

⚠️ RENVERSEMENT DATÉ du 11/10/2026 (décision Louis, lot W5,
``c93_echantillonnage_conversations_opt_in_espace``) : l'échantillonnage de conversations de
production pour les évals n'est PLUS un réglage d'opérateur. C'est un OPT-IN PAR ESPACE, côté API
(``apps/api/src/modules/chat-eval-sampling/``), réglage ``workspaces.chat_eval_sampling_enabled``
(Réglages › Laura, éteint par défaut, propriétaire ou administrateur seul). La fonction
``sample_production_conversation`` (qui levait ``NotImplementedError`` faute de pipeline) est RETIRÉE.

CE QUI RESTE ICI — tranché sans Louis à l'intégration INT-J (11/10) : le juge « recommandation
générique » (#3223, ``app/routers/reasoning_judge.py``) lit ``is_prod_sampling_enabled`` ; éteint, la
route rend ``disabled`` avant tout appel, no-op strict. Il juge la RÉPONSE de Laura seule et ne rend
qu'un jeton fermé : ce n'est pas l'échantillonnage de conversations entières. La variable
``CHAT_PROD_SAMPLING_ENABLED`` ne gouverne donc plus QUE ce juge ; elle ne contrôle plus aucun
versement de conversation (un test le prouve).

Absente, ou différente de ``true``/``1`` (insensible à la casse, espaces retirés) → NO-OP STRICT.
"""

from __future__ import annotations

import os

#: Voir `agent_docs/env-reference.md` (section échantillonnage production, #2443.10).
ENV_VAR = "CHAT_PROD_SAMPLING_ENABLED"


def is_prod_sampling_enabled() -> bool:
    """`true` ou `1` (insensible à la casse, espaces retirés) et rien d'autre —
    même règle que `DISCOVER_ALERT_DISPATCH_ENABLED` : une variable qui
    s'allumerait sur « toute valeur non vide » s'allumerait par accident."""
    raw = (os.environ.get(ENV_VAR) or "").strip().lower()
    return raw in ("true", "1")
