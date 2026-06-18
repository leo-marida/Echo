from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from app.agent.state import MeetingState
from app.agent.nodes import extractor, summarizer, structurer, persister

def build_echo_graph():
    graph = StateGraph(MeetingState)

    graph.add_node("extractor", extractor.run)
    graph.add_node("summarizer", summarizer.run)
    graph.add_node("structurer", structurer.run)
    graph.add_node("persister", persister.run)

    graph.set_entry_point("extractor")
    graph.add_edge("extractor", "summarizer")
    graph.add_edge("summarizer", "structurer")
    graph.add_edge("structurer", "persister")
    graph.add_edge("persister", END)

    return graph.compile(checkpointer=MemorySaver())

echo_graph = build_echo_graph()
