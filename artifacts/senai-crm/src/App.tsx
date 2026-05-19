import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { useState } from "react";
import Inbox from "./pages/Inbox";
import ThreadWorkspace from "./pages/ThreadWorkspace";
import Analytics from "./pages/Analytics";
import RagDebug from "./pages/RagDebug";

function Sidebar() {
  const [location] = useLocation();
  const [simulating, setSimulating] = useState(false);
  const [toast, setToast] = useState("");

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const r = await fetch("/api/simulate", { method: "POST" });
      const d = await r.json();
      if (d.status === "started") {
        setToast(`Simulation started — ${d.total} emails ingesting...`);
        setTimeout(() => setToast(""), 4000);
      } else if (d.error) {
        setToast(`Error: ${d.error}`);
        setTimeout(() => setToast(""), 4000);
      }
    } catch {
      setToast("Simulation failed — check server");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setSimulating(false);
    }
  };

  const navLinks = [
    { path: "/", label: "Inbox", icon: "📥" },
    { path: "/analytics", label: "Analytics", icon: "📊" },
    { path: "/rag-debug", label: "RAG Debug", icon: "🔍" },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⚡</span>
        <span className="logo-text">SenAI CRM</span>
      </div>
      <nav className="sidebar-nav">
        {navLinks.map((link) => (
          <Link key={link.path} href={link.path} className={`nav-link ${location === link.path ? "active" : ""}`}>
            <span className="nav-icon">{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button
          className="btn-simulate"
          onClick={handleSimulate}
          disabled={simulating}
        >
          {simulating ? "⏳ Simulating..." : "▶ Simulate Emails"}
        </button>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </aside>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Inbox} />
      <Route path="/thread/:threadId" component={ThreadWorkspace} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/rag-debug" component={RagDebug} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Router />
        </main>
      </div>
    </WouterRouter>
  );
}

export default App;
