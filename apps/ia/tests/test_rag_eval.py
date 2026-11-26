"""L'évaluation du magasin de connaissance (tome 7 §38, M7).

« On ne sait pas si le reclassement améliore quoi que ce soit. » Ce fichier
répond à la question, avec un chiffre et un seuil.

Trois choix de construction :

1. **Le corpus est autoportant.** Trente documents fictifs dans une fixture, pas
   une base réelle : la mesure doit rendre le même nombre aujourd'hui et dans
   six mois, sinon on ne peut rien conclure d'une variation.
2. **On mesure le chemin GRATUIT.** Le reclassement déterministe tourne partout,
   sans clé et sans réseau. Le cross-encoder et le modèle ne peuvent pas être
   mesurés en intégration continue sans y poser une clé de production.
3. **Le seuil est écrit.** Le §38 le fixe : si le reclassement n'améliore pas le
   MRR de plus de 10 %, il coûte plus qu'il ne rapporte. Ce test ne le fait pas
   ÉCHOUER pour autant — il l'écrit, parce que la décision de débrancher un
   étage de reclassement appartient à un humain.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path

from app.services.rag_knowledge import _deterministic_rerank

FIXTURE = Path(__file__).parent / "fixtures" / "rag-eval" / "reference-queries.json"
_TOKENS = re.compile(r"[a-zà-ÿ0-9]{3,}", re.IGNORECASE)


def _load() -> tuple[list[dict], list[dict]]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return data["documents"], data["queries"]


def _baseline_retrieval(query: str, docs: list[dict]) -> list[dict]:
    """Le classement AVANT reclassement — recouvrement lexical simple.

    C'est le rôle que tient la recherche plein texte quand pgvector n'est pas
    configuré, c'est-à-dire le cas le plus fréquent en clientèle. Mesurer le
    gain du reclassement CONTRE ce classement-là est donc la mesure honnête.
    """
    q = {t.lower() for t in _TOKENS.findall(query)}
    scored = []
    for doc in docs:
        text = f"{doc['title']} {doc['content']}".lower()
        words = {t.lower() for t in _TOKENS.findall(text)}
        scored.append((len(q & words), doc))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [doc for _score, doc in scored]


def _rank_of(expected: str, ranked: list[dict]) -> int | None:
    for index, doc in enumerate(ranked, start=1):
        if doc.get("id") == expected:
            return index
    return None


def _measure(rank_fn) -> tuple[float, float]:
    """(MRR, taux de présence dans le top 3)."""
    documents, queries = _load()
    reciprocal = 0.0
    in_top3 = 0
    for query in queries:
        ranked = rank_fn(query["text"], documents)
        rank = _rank_of(query["expected"], ranked)
        if rank is None:
            continue
        reciprocal += 1 / rank
        if rank <= 3:
            in_top3 += 1
    return reciprocal / len(queries), in_top3 / len(queries)


def test_the_reference_set_has_fifty_queries():
    documents, queries = _load()
    assert len(queries) == 50
    # Chaque requête doit viser un document qui EXISTE : une attente pointant
    # dans le vide ferait baisser le MRR sans qu'aucun classement soit en cause.
    ids = {d["id"] for d in documents}
    assert all(q["expected"] in ids for q in queries)


def test_retrieval_finds_the_expected_document_most_of_the_time():
    mrr, top3 = _measure(_baseline_retrieval)
    # Repère de non-régression du classement de base. Il n'a pas vocation à
    # monter : il dit simplement que la recherche lexicale n'est pas cassée.
    assert mrr > 0.5, f"MRR de base tombé à {mrr:.3f}"
    assert top3 > 0.7, f"présence dans le top 3 tombée à {top3:.0%}"


def test_the_documents_carry_a_frozen_age():
    """Sans date, la moitié « fraîcheur » du reclassement est INERTE.

    Premier résultat de cette évaluation, et un piège de mesure : le corpus
    n'avait pas de date, le reclassement déterministe rendait donc exactement
    le classement de base, et le gain mesuré était de +0,0 %. Une évaluation
    qui ne peut pas faire bouger ce qu'elle mesure ne mesure rien.
    """
    documents, _queries = _load()
    assert all(doc.get("created_at") for doc in documents)
    assert len({doc["created_at"] for doc in documents}) > 20


def _reranked(query: str, docs: list[dict]) -> list[dict]:
    # Le reclassement travaille sur ce que la récupération a rendu — les dix
    # premiers, comme en production.
    return _deterministic_rerank(query, _baseline_retrieval(query, docs)[:10], None)


def _age_days(doc: dict) -> float:
    dt = datetime.fromisoformat(str(doc["created_at"]).replace("Z", "+00:00"))
    return (datetime.now(UTC) - dt).total_seconds() / 86400.0


def test_the_deterministic_rerank_is_measured_and_its_gain_written_down():
    """Le reclassement gratuit apporte-t-il quelque chose ? On le MESURE.

    ⚠️ **Ce que ce jeu ne peut PAS mesurer, et c'est le premier résultat.**
    Chaque requête désigne UN document attendu, choisi sur le sens — jamais sur
    la date. Le classement de base est un recouvrement lexical, et le
    reclassement déterministe travaille sur le même signal PLUS la fraîcheur du
    §38. Un instrument dont la vérité terrain ignore la date ne peut donc voir
    de la fraîcheur que son COÛT, jamais son apport : la seule variation
    possible est vers le bas. Lire « −3,5 % » comme « la fraîcheur dégrade la
    pertinence » serait un contresens de mesure.

    Ce que le test borne est donc l'INEXPLIQUÉ, et
    {@link test_every_demotion_is_explained_by_a_fresher_document} dit ce que
    « expliqué » veut dire. Le seuil du §38 (+10 % de MRR, sinon le
    reclassement coûte plus qu'il ne rapporte) reste imprimé à chaque exécution
    pour l'humain à qui la décision appartient.
    """
    base_mrr, base_top3 = _measure(_baseline_retrieval)
    mrr, top3 = _measure(_reranked)
    gain = (mrr - base_mrr) / base_mrr if base_mrr else 0.0
    print(
        f"\nRAG eval — base MRR {base_mrr:.3f} / top3 {base_top3:.0%}"
        f" · reclassé MRR {mrr:.3f} / top3 {top3:.0%} · gain {gain:+.1%}"
    )
    # Mesuré le 29/08 : −3,5 %, de TROIS requêtes sur cinquante (q02, q03, q08),
    # toutes trois des dépassements par la date sur un document attendu de 18,
    # 406 et 806 jours. La présence dans le top 3 ne bouge pas (94 %). Au-delà
    # de 6 %, ce n'est plus le prix de la fraîcheur : c'est un défaut.
    assert gain > -0.06, f"le reclassement DÉGRADE le MRR de {gain:.1%}"


def test_every_demotion_is_explained_by_a_fresher_document():
    """La garde qui rend le chiffre du dessus lisible.

    Le reclassement déterministe n'a le droit de faire reculer un document
    attendu que si ce qui le dépasse est **plus RÉCENT** que lui. Reculer
    derrière un document plus ancien, ou aussi vieux, n'est pas de la
    fraîcheur : c'est un tri cassé, et aucun MRR global ne le distinguerait
    d'un coût légitime.

    Elle lit le corpus (les 50 requêtes, non vide — voir
    {@link test_the_reference_set_has_fifty_queries}) et elle sait dire NON :
    faire trier `_deterministic_rerank` à l'envers, ou lui faire préférer le
    plus VIEUX, la met au rouge en nommant la requête fautive.
    """
    documents, queries = _load()
    by_id = {d["id"]: d for d in documents}
    demotions = 0

    for query in queries:
        expected = by_id[query["expected"]]
        before = _baseline_retrieval(query["text"], documents)[:10]
        rank_before = _rank_of(query["expected"], before)
        if rank_before is None:
            continue
        after = _deterministic_rerank(query["text"], before, None)
        rank_after = _rank_of(query["expected"], after)
        assert rank_after is not None, f"{query['id']} : le reclassement a PERDU un document"
        if rank_after <= rank_before:
            continue
        demotions += 1
        # Tout ce qui est passé DEVANT lui et ne l'était pas avant.
        overtakers = set(d["id"] for d in after[: rank_after - 1]) - set(
            d["id"] for d in before[: rank_before - 1]
        )
        for doc_id in overtakers:
            assert _age_days(by_id[doc_id]) < _age_days(expected), (
                f"{query['id']} : « {by_id[doc_id]['title']} » "
                f"({_age_days(by_id[doc_id]):.0f} j) est passé devant « {expected['title']} » "
                f"({_age_days(expected):.0f} j) sans être plus récent"
            )

    # Le témoin : si plus AUCUNE requête ne recule, ce test ne regarde plus rien
    # et resterait vert quoi qu'il arrive au tri.
    assert demotions > 0, "aucun recul observé — la garde ne mesure plus rien"
