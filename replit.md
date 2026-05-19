# SenAI CRM

An AI-powered B2B customer support CRM that automatically triages incoming emails using LLM classification, RAG knowledge retrieval, and an autonomous agent that decides escalation vs. auto-reply.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/senai-crm run dev` — run the frontend (port 25722)
- `pnpm run typecheck` — full typecheck across all packages
- Required env: `DATABASE_URL` — Postgres connection string (Replit PostgreSQL)
- Required env: `GROQ_API_KEY` — Groq API key for llama3-70b-8192

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + WebSocket (ws)
- DB: PostgreSQL (raw pg Pool + manual migrations in db.ts)
- AI: Groq API (llama3-70b-8192) via axios
- Frontend: React + Vite + Wouter + Recharts
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/api-server/src/db.ts` — DB pool, query helper, runMigrations (all DDL lives here)
- `artifacts/api-server/src/services/` — heuristicFilter, ragPipeline, llmClassifier, agentRunner, sentimentTracker
- `artifacts/api-server/src/routes/` — ingest, dashboard, threads, analytics, rag, contacts, agent, intelligence
- `artifacts/api-server/src/knowledge/` — 6 policy .md files (pricing, SLA, refund, API docs, compliance, escalation)
- `artifacts/api-server/src/app.ts` — Express app with all routes mounted under /api
- `artifacts/senai-crm/src/pages/` — Inbox, ThreadWorkspace, Analytics, RagDebug
- `artifacts/senai-crm/src/index.css` — all styles (dark theme CSS custom properties)

## Architecture decisions

- No ORM: raw pg Pool + hand-written DDL in runMigrations for transparency and flexibility
- RAG is keyword-based (no embeddings): fast, zero-cost, good enough for policy document retrieval
- Agent uses ReAct loop (Thought → Action → Observation) with hard-coded safety overrides for security threats and GDPR
- All classification happens async via setImmediate after initial DB insert — fast ingest response, no blocking
- Knowledge files are read at startup from `src/knowledge/*.md` relative to `process.cwd()` (the artifact dir)

## Product

- **Mission Control Inbox**: Real-time email triage with urgency badges, sentiment scores, spam detection, tabs for human-flagged/escalated/replied
- **Thread Workspace**: 3-panel view — email body with entity highlighting, sentiment sparkline timeline, contact profile + AI reasoning panel + action buttons
- **Analytics**: Sentiment trend chart, category pie chart, at-risk accounts list, agent performance metrics, volume heatmap
- **RAG Debug**: Live keyword search over the 6 policy knowledge base documents
- **Simulate**: POST /api/simulate ingests `email-data-advanced.json` from project root and runs full LLM pipeline

## User preferences

- Groq API only (llama3-70b-8192) — no OpenAI
- PostgreSQL via Replit native integration (DATABASE_URL already set)
- Dark terminal theme, IBM Plex Sans/Mono fonts

## Gotchas

- Knowledge base files are read from `process.cwd()/src/knowledge/` — process.cwd() is the artifact dir, not workspace root
- The email-data-advanced.json seed file is looked up at `../../email-data-advanced.json` (relative to artifact dir = project root)
- api-server must rebuild before restart: the dev script does build+start automatically
- Rate limit handling: Groq 429s trigger 2s retry (3 attempts). Parallel LLM calls during bulk simulation may hit limits
- WebSocket broadcast is wired via `app.locals.broadcast` — set in index.ts, used in ingest route

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
