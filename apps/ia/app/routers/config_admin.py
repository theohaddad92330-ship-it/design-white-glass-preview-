"""Config admin (interne) — recharge les overrides sans redeploy.

Gated par InternalAuthMiddleware (x-internal-secret) comme les autres routes non
exemptées. La page admin (Matteo) écrira la ligne config_overrides puis appellera
POST /config/reload pour appliquer à chaud."""

from __future__ import annotations

import inspect
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.registry import AGENTS, agent_map, resolve
from app.config.knowledge_config import get_config
from app.config.overrides_loader import aload_config_overrides
from app.knowledge import knowledge_assets_summary, method_corpus_governance
from app.prompts.registry import (
    prompt_registry_canonical_fingerprint,
    prompt_version_for,
    registry_names,
)
from app.prompts.registry_history import registered_prompt_names, rollback_command, run_diff
from app.services import chat_tools, provider_eval_declarations
from app.services.llm_gateway import describe_routing_policy
from app.services.provider_evals import eval_status_by_task
from app.services.tool_permissions import permission_of

router = APIRouter(prefix="/config", tags=["Config"])


@router.get("/agents")
async def list_agents() -> dict:
    """Registre des agents nommés (niveau-2) — pour la page archi du dashboard :
    chaque brique de la méthode, son type (algo/prompt) et son implémentation."""
    return {"agents": agent_map()}


@router.get("/knowledge-assets")
async def knowledge_assets() -> dict:
    """Inventaire de la connaissance métier curée (battlecards ESN, playbooks
    sectoriels, objections) — pour l'onglet Knowledge du dashboard."""
    return {"assets": knowledge_assets_summary()}


@router.get("/prompts")
async def list_prompts() -> dict:
    """Source des briques knowledge — pour l'onglet Knowledge du dashboard. Pour
    chaque agent : rôle, type, et le SOURCE de son entrypoint (le template de
    prompt pour les LLM, la fonction pour les algos). Lecture seule."""
    out: dict[str, dict] = {}
    for a in AGENTS:
        try:
            src = inspect.getsource(resolve(a))
        except (OSError, TypeError):
            src = ""
        out[a.name] = {
            "kind": a.kind,
            "role": a.role,
            "module": a.module,
            "entrypoint": a.entrypoint,
            "source": src[:6000],
        }
    return {"prompts": out}


@router.get("/prompt-version/{name}")
async def prompt_version(name: str) -> dict:
    """#2009.11 — version STABLE d'un prompt (hash de template), lue par l'API
    AVANT l'appel générateur pour entrer dans la clé d'idempotence
    (`generationKey`, apps/api/.../profile-context.service.ts) sans dupliquer
    cette source de vérité (GA-26 : le registre de prompts vit ici, côté IA).
    `version: null` pour un nom non enregistré — jamais une valeur inventée."""
    return {"version": prompt_version_for(name)}


@router.get("/prompt-registry")
async def prompt_registry() -> dict:
    """#2445.1 (épopée #2766) — LISTE des prompts enregistrés avec leur version
    (hash de template canonique, `prompt_registry_canonical_fingerprint`), pour
    la console d'opérations IA. Reste hors de cette tranche : le DIFF contre une
    version antérieure et le rollback — aucune historisation des versions
    passées n'existe encore dans le dépôt ; l'inventer fabriquerait une preuve
    non vérifiable. Lecture seule, gated comme le reste de /config."""
    fingerprint = prompt_registry_canonical_fingerprint()
    return {"prompts": [{"name": name, "version": fingerprint.get(name)} for name in registry_names()]}


@router.get("/prompt-registry/{name}/diff")
async def prompt_registry_diff(name: str, ref_a: str, ref_b: str = "HEAD") -> dict:
    """#2445.1 (épopée #2766) — DIFF et commande de ROLLBACK d'un prompt entre
    deux refs git, la part restée hors de `/prompt-registry` (liste seule).
    Dérive `app.prompts.registry_history` : le diff EST le `git diff` du
    fichier golden committé, jamais une comparaison inventée. La commande de
    rollback est RENDUE, jamais exécutée — un rollback de prompt reste un
    commit qu'un humain fait. 404 si `name` n'est pas dans le registre."""
    if name not in registered_prompt_names():
        raise HTTPException(status_code=404, detail=f"prompt inconnu du registre : {name}")
    return {
        "diff": run_diff(name, ref_a, ref_b),
        "rollbackCommand": list(rollback_command(name, ref_a) or ()),
    }


@router.get("/model-routing")
async def model_routing() -> dict:
    """#2445.2 (épopée #2766) — la politique de routage modèle, PAR CAPACITÉ :
    pour chaque tâche canonique, la destination résolue MAINTENANT
    (fournisseur + modèle), si un réglage est posé, et de qui elle hérite à
    défaut. Lecture seule, gated comme le reste de /config. Pour la console
    d'opérations IA du dashboard-manager — jamais exposé au produit."""
    # #2440.82 — un changement de fournisseur/modèle déclenche les évaluations : chaque
    # ligne dit si sa destination est la référence, évaluée, ou À ÉVALUER (+ commande).
    evals = {row.task: row for row in await eval_status_by_task()}
    return {
        "routes": [
            {
                "task": entry.task,
                "provider": entry.provider,
                "model": entry.model,
                "overridden": entry.overridden,
                "inheritsFrom": entry.inherits_from,
                "evalStatus": evals[entry.task].status,
                "evalReplayCommand": evals[entry.task].replay_command,
            }
            for entry in describe_routing_policy()
        ]
    }


class _DeclareModelRoutingEvalBody(BaseModel):
    destinationKey: str
    declaredBy: str
    note: str | None = None


@router.post("/model-routing/evals")
async def declare_model_routing_eval(body: _DeclareModelRoutingEvalBody) -> dict:
    """#2975 / #2440.82 — pose ou corrige la déclaration d'UNE destination
    (`provider` ou `provider:model`) depuis la console d'opérations, sans
    redéploiement. Gated comme le reste de `/config`. 400 si la clé ou
    l'auteur manque — jamais une ligne à moitié renseignée."""
    try:
        await provider_eval_declarations.declare(body.destinationKey, body.declaredBy, body.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/rights-matrix")
async def rights_matrix() -> dict:
    """#2445.4 (épopée #2766) — la matrice des droits de Laura, PAR OUTIL :
    lecture / proposition / dépense, dérivée de `tool_permissions.py`
    (déménagée depuis `tests/test_copilote_security_eval.py` ce lot — même
    classement, une seule source, GA-26). Lecture seule, gated comme le reste
    de `/config`. Pour la console d'opérations IA du dashboard-manager.

    Ni rôle ni plan : aucun des deux ne filtre `CHAT_TOOLS` aujourd'hui
    (`test_ne_pretend_ni_role_ni_plan`) — la doctrine du dépôt dit déjà
    « le rôle change l'ORDRE, jamais le CONTENU » (c76). Ajouter ces colonnes
    ici inventerait un filtre qui n'existe pas dans le code.
    """
    return {
        "tools": [
            {"tool": str(tool["name"]), "permission": permission_of(str(tool["name"])).value}
            for tool in chat_tools.CHAT_TOOLS
        ]
    }


@router.get("/method-corpus-governance")
async def method_corpus_governance_route() -> dict:
    """#3274.5 (épopée #3274) — les identifiants de règle que `is_rule_active`
    consulte RÉELLEMENT au retrieval (`method_knowledge._corpus`), pour la console
    d'opérations (`internal/admin/method-corpus-governance`). La richesse de la
    gouvernance (owner, raison de désactivation, verdict d'audit KEEP/MERGE/
    SUPERSEDED/REMOVE_AFTER_MIGRATION) vit dans `packages/contracts` (GA-26,
    `method-corpus.ts` en est la fondation) — l'API la RESSERT depuis là, cette
    route ne rend QUE le sous-ensemble câblé, la seule chose que ce service peut
    affirmer sans deviner. Lecture seule, gated comme le reste de /config."""
    return {"wiredRuleIds": method_corpus_governance.wired_rule_ids()}


@router.post("/reload")
async def reload_config() -> dict:
    """Re-read config_overrides and apply it to the in-process knowledge
    config. #2915.2 — `aload_config_overrides` : le fetch Supabase reste
    déchargé sur un thread, jamais sur l'event loop qui sert aussi /health."""
    applied = await aload_config_overrides()
    return {"applied": applied, "version": get_config().version}


@router.get("/current")
async def current_config() -> dict:
    """The active config (defaults ← overrides) — for the admin page to display."""
    return get_config().model_dump()


# Optional data providers whose keys live on THIS (IA) service — the API can't see
# them via its own process.env, so it reads their presence here. Each entry maps a
# stable provider id to the env var(s) that must ALL be set for it to be live.
_PROVIDER_ENV: dict[str, tuple[str, ...]] = {
    "apollo": ("APOLLO_API_KEY",),
    "france_travail": ("FRANCE_TRAVAIL_CLIENT_ID", "FRANCE_TRAVAIL_CLIENT_SECRET"),
    "brave": ("BRAVE_API_KEY",),
    "firecrawl": ("FIRECRAWL_API_KEY",),
    "pappers": ("PAPPERS_API_KEY",),
    "serper": ("SERPER_API_KEY",),
    "tavily": ("TAVILY_API_KEY",),
    # Sources et capacités optionnelles qui tournaient en no-op SANS le dire : la
    # clé absente éteignait la capacité, et aucun écran — pas même le back-office
    # — ne permettait de s'en apercevoir. Les déclarer ici les fait remonter dans
    # l'inventaire opérateur avec le nom exact de la variable à poser.
    "salesql": ("SALESQL_API_KEY",),
    "embeddings": ("EMBEDDING_API_KEY",),
    "insee": ("INSEE_API_KEY",),
    "inpi": ("INPI_USERNAME", "INPI_PASSWORD"),
    "github": ("GITHUB_TOKEN",),
    "wttj": ("WTTJ_ALGOLIA_APP_ID", "WTTJ_ALGOLIA_API_KEY"),
    "zefix": ("ZEFIX_API_USER", "ZEFIX_API_PASSWORD"),
    # #2261.30 — BOAMP (marchés publics) n'exige AUCUNE clé : mirroir
    # Opendatasoft public (`data_sources/public_tenders.py`, docstring « Free,
    # NO key »). Le tuple vide n'est pas un oubli : `all(())` vaut `True`, donc
    # ce fournisseur est TOUJOURS configuré — l'honnêteté de `/config/integrations`
    # pour une source qui n'a rien à configurer, la même règle que le silo
    # `webhook` côté API (« rien à configurer »).
    "boamp": (),
    # Le pont copilote → messagerie / agenda. Ce n'est pas un fournisseur, mais
    # c'est la MÊME question — la clé est-elle posée ? — et son absence est la
    # plus coûteuse : les cinq outils du copilote répondent « je n'ai pas accès à
    # ta messagerie » alors que la messagerie est branchée côté API.
    "copilot_bridge": ("API_INTERNAL_URL", "INTERNAL_API_SECRET"),
}


@router.get("/integrations")
async def integration_status() -> dict:
    """Real, per-provider *configured* flags for the IA-hosted data sources, derived
    from ``os.environ`` — booleans ONLY, never a key value (secrets never leave the
    service). The API Tool Registry reads this so ``/settings/integrations`` reflects
    the TRUE backend config: a key present ⇒ « Disponible », absent ⇒ « Bientôt
    disponible » (honest — no key). Internal-secret gated like every /config route."""

    def configured(env_names: tuple[str, ...]) -> bool:
        return all(bool(os.environ.get(name, "").strip()) for name in env_names)

    return {"providers": {provider: configured(envs) for provider, envs in _PROVIDER_ENV.items()}}
