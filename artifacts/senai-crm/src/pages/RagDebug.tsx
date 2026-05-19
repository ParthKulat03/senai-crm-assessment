import { useState } from "react";

interface RagChunk {
  id: string; source_doc: string; chunk_text: string;
  chunk_index: number; score: number;
}

export default function RagDebug() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RagChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/rag/search?q=${encodeURIComponent(query)}`);
      const d = await r.json();
      setResults(Array.isArray(d) ? d : []);
    } catch {
      setResults([]);
    }
    setLoading(false);
    setSearched(true);
  };

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">RAG Knowledge Base Debug</span>
      </div>
      <div className="page-body" style={{ padding: 24 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.6 }}>
            Search the knowledge base using keyword matching. The RAG pipeline retrieves relevant chunks from pricing, SLA, refund, compliance, and escalation policy documents.
          </div>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 10 }}>
            <input
              className="filter-input"
              style={{ flex: 1 }}
              placeholder="e.g. refund policy, GDPR article 20, SLA credits, non-profit discount..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button type="submit" className="btn-simulate" style={{ width: "auto", padding: "8px 20px" }} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {["refund", "GDPR", "SLA credits", "non-profit", "escalation", "ransomware", "API v2"].map(q => (
              <button
                key={q}
                className="bulk-btn"
                onClick={() => { setQuery(q); }}
                style={{ fontSize: 11 }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="loading">Searching knowledge base...</div>}

        {!loading && searched && results.length === 0 && (
          <div className="card" style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            No relevant chunks found for "{query}". Try different keywords.
          </div>
        )}

        {!loading && results.map((chunk, i) => (
          <div key={chunk.id || i} className="rag-result-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="rag-source">📄 {chunk.source_doc} (chunk #{chunk.chunk_index})</span>
              <span className="rag-score">Score: {Number(chunk.score).toFixed(3)}</span>
            </div>
            <div className="rag-text">{chunk.chunk_text}</div>
          </div>
        ))}

        {!searched && !loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              Enter a query to search the knowledge base
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 6 }}>
              6 policy documents · keyword-based retrieval
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
