# SenAI CRM — System Architecture

```mermaid
flowchart TD
    A([📧 Email JSON Input\nSender · Subject · Body · Thread ID]) --> B

    subgraph INGEST["POST /api/ingest"]
        B[Duplicate Check\nemails.message_id UNIQUE]
        B --> C[Contacts & Threads\nUpsert]
        C --> D[INSERT emails row\nstatus = Received]
    end

    D --> E

    subgraph HEURISTIC["Heuristic Filter\nheuristicFilter.ts"]
        E{Spam or\nInternal?}
        E -- spam / internal --> F[🚫 Flag & Store\nNo LLM call]
        E -- real customer email --> G[Initial Priority\nkeyword scoring]
    end

    G --> H

    subgraph RAG["RAG Pipeline\nragPipeline.ts"]
        H[Keyword Extraction\nfrom subject + body]
        H --> I[TF-IDF Chunk Scoring\n6 policy .md files]
        I --> J[Top-3 Chunks Retrieved\npricing · SLA · refund\nAPI docs · compliance · escalation]
    end

    J --> K

    subgraph LLM["LLM Classifier\nllmClassifier.ts · Groq API"]
        K[Build prompt\nEmail + Thread history + RAG chunks]
        K --> L[llama-3.3-70b-versatile\nGroq API call\nmax 3 retries on 429]
        L --> M[JSON parse response]
        M --> N[category · sentiment · urgency\nconfidence · suggested_reply\npolicy_citations · detected_entities]
    end

    N --> O

    subgraph AGENT["ReAct Agent\nagentRunner.ts · 10 Tools"]
        O[Thought → Action → Observation loop\nmax 5 iterations]
        O --> P1[search_knowledge_base]
        O --> P2[get_thread_history]
        O --> P3[get_contact_profile]
        O --> P4[check_sla_status]
        O --> P5[draft_reply]
        O --> P6[escalate_to_human]
        O --> P7[apply_discount]
        O --> P8[create_ticket]
        O --> P9[flag_security_threat]
        O --> P10[send_gdpr_response]
        P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8 & P9 & P10 --> Q[Final Decision\nauto_reply / escalate / flag]
    end

    subgraph SAFETY["Hard-coded Safety Overrides"]
        R1[🔴 Security Threat → always escalate]
        R2[🔴 GDPR Request → always escalate]
    end

    O --> R1
    O --> R2

    Q --> S

    subgraph DB["PostgreSQL Database\nReplit Native · raw pg Pool"]
        S[UPDATE emails\ncategory · sentiment_score · urgency\nrequires_human · confidence\nsuggested_reply · escalation_reason\npolicy_citations JSONB\ndetected_entities JSONB]
        S --> S1[(emails)]
        S --> S2[(threads)]
        S --> S3[(contacts)]
        S --> S4[(knowledge_chunks)]
        S --> S5[(agent_actions)]
        S --> S6[(intelligence_cache)]
    end

    S --> T

    subgraph WS["WebSocket Broadcast\nws · app.locals.broadcast"]
        T[email_processed event\n→ all connected clients]
    end

    T --> U

    subgraph FRONTEND["React Frontend\nVite · Wouter · Recharts"]
        U[Mission Control Inbox\nurgency badges · spam tabs\nsentiment scores · real-time updates]
        U --> V[Thread Workspace\n3-panel · email body · entity highlights\nsentiment sparkline · AI reasoning]
        U --> W[Analytics Dashboard\nsentiment trend chart · category pie\nat-risk accounts · volume heatmap\nagent performance metrics]
        U --> X[RAG Debug\nlive keyword search\nover 6 policy documents]
    end

    subgraph INTEL["Web Intelligence Cache\nintelligence.ts"]
        Y[POST /api/intelligence/enrich\ncompany lookup · risk signals]
        Y --> S6
        S6 --> Z[GET /api/intelligence/:email\ncached profile served to frontend]
    end

    S3 --> Y
    Z --> V

    subgraph SIMULATE["Simulate Route\nPOST /api/simulate"]
        AA[email-data-advanced.json\n60 real-world emails]
        AA --> BB[Sequential INSERT loop\nno LLM during ingest]
        BB --> CC[Sequential classify loop\n2 s delay between emails\nGroq rate-limit safe]
    end

    CC --> HEURISTIC

    subgraph RECLASSIFY["Reclassify Route\nPOST /api/reclassify-all"]
        DD[Query emails WHERE\nconfidence = 0 OR category IS NULL]
        DD --> EE[Sequential classifyAndSave\n2 s delay · skip on failure\nstartup auto-trigger if > 10 pending]
    end

    EE --> LLM

    style INGEST fill:#1a1a2e,stroke:#4a9eff,color:#e0e0e0
    style HEURISTIC fill:#1a1a2e,stroke:#f0a500,color:#e0e0e0
    style RAG fill:#1a1a2e,stroke:#7c3aed,color:#e0e0e0
    style LLM fill:#1a1a2e,stroke:#10b981,color:#e0e0e0
    style AGENT fill:#1a1a2e,stroke:#ef4444,color:#e0e0e0
    style SAFETY fill:#3b0000,stroke:#ef4444,color:#fca5a5
    style DB fill:#1a1a2e,stroke:#06b6d4,color:#e0e0e0
    style WS fill:#1a1a2e,stroke:#8b5cf6,color:#e0e0e0
    style FRONTEND fill:#1a1a2e,stroke:#f59e0b,color:#e0e0e0
    style INTEL fill:#1a1a2e,stroke:#64748b,color:#e0e0e0
    style SIMULATE fill:#0f2010,stroke:#22c55e,color:#e0e0e0
    style RECLASSIFY fill:#0f2010,stroke:#22c55e,color:#e0e0e0
```

## Component Summary

| Component | File | Description |
|---|---|---|
| **Heuristic Filter** | `services/heuristicFilter.ts` | Regex + keyword scoring — spam, internal, initial priority. Zero LLM cost. |
| **RAG Pipeline** | `services/ragPipeline.ts` | TF-IDF keyword search over 6 policy `.md` files. No embeddings, no vector DB. |
| **LLM Classifier** | `services/llmClassifier.ts` | Groq `llama-3.3-70b-versatile`. Outputs category, sentiment, urgency, confidence, suggested reply, policy citations, detected entities. |
| **ReAct Agent** | `services/agentRunner.ts` | Thought → Action → Observation loop (max 5 iterations). 10 tools. Hard-coded safety overrides for security threats and GDPR. |
| **Sentiment Tracker** | `services/sentimentTracker.ts` | Maintains rolling sentiment timeline per contact and thread. |
| **classifyAndSave** | `services/classifyAndSave.ts` | Shared helper: RAG → LLM → DB update → Agent. Used by ingest, simulate, and reclassify routes. |
| **PostgreSQL** | `db.ts` | Raw `pg.Pool`, no ORM. All DDL in `runMigrations()`. 6 tables. |
| **WebSocket** | `index.ts` | `ws` server. Broadcast wired via `app.locals.broadcast`. Real-time inbox updates. |
| **Reclassify Route** | `routes/reclassify.ts` | `POST /api/reclassify-all` — sequential re-classification with 2 s delay. Auto-triggered on startup if > 10 emails have null confidence. |
