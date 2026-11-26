"""LangGraph orchestration of the BellumAI analysis pipeline (v2).

The four phases (research → contacts → classify → plan) were orchestrated by
the NestJS BullMQ worker via four sequential HTTP calls. This package moves the
*step orchestration* into apps/ia as a LangGraph ``StateGraph`` — BullMQ stays
the durable queue (two-layer pattern), the graph becomes the engine inside the
job. Increment 1 wraps the existing phase functions as nodes with early-exit;
later increments add the Postgres checkpointer, typed SSE events, model routing
and a judge node.
"""

from app.graph.builder import (
    analysis_graph_session,
    build_analysis_graph,
    get_analysis_state,
    resume_analysis_graph,
    run_analysis_graph,
    stream_analysis_graph,
    summarize_telemetry,
)
from app.graph.events import GraphEvent
from app.graph.gate import evaluate_research_gate

__all__ = [
    "GraphEvent",
    "analysis_graph_session",
    "build_analysis_graph",
    "evaluate_research_gate",
    "get_analysis_state",
    "resume_analysis_graph",
    "run_analysis_graph",
    "stream_analysis_graph",
    "summarize_telemetry",
]
