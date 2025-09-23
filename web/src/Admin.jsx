// src/Admin.jsx
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./index.css";

// Util per <input type="datetime-local">
function toLocalInputValue(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(val) {
  return val ? new Date(val).toISOString() : null;
}

export default function Admin() {
  // Admin key (non salvata)
  const [adminSecret, setAdminSecret] = useState("");

  // Flags attuali
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState(null);

  // Campi editabili (GARA)
  const [startEnabled, setStartEnabled] = useState(false);
  const [startAt, setStartAt] = useState(""); // datetime-local
  const [banner, setBanner] = useState("");

  // Campi editabili (SIM)
  const [simEnabled, setSimEnabled] = useState(false);
  const [simStartAt, setSimStartAt] = useState("");
  const [simBanner, setSimBanner] = useState("");

  // Contatti Top
  const [topContacts, setTopContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // ---- API ----
  async function loadFlags() {
    const { data, error } = await supabase.rpc("get_runtime_flags");
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      setFlags(row || {});
      if (row) {
        setStartEnabled(!!row.is_start_enabled);
        setStartAt(toLocalInputValue(row.start_at));
        setBanner(row.banner || "");
        setSimEnabled(!!row.sim_enabled);
        setSimStartAt(toLocalInputValue(row.sim_start_at));
        setSimBanner(row.sim_banner || "");
      }
    } else {
      console.error(error);
      alert("Errore nel caricamento delle impostazioni.");
    }
  }

  useEffect(() => {
    loadFlags();
  }, []);

  async function saveMain() {
    if (!adminSecret) return alert("Inserisci la chiave admin");
    setLoading(true);
    try {
      const { error } = await supabase.rpc("set_start_enabled", {
        p_admin_secret: adminSecret,
        p_enabled: startEnabled,
        p_start_at: fromLocalInputValue(startAt),
        p_banner: banner || null,
      });
      if (error) throw error;
      await loadFlags();
      alert("Impostazioni GARA aggiornate ✅");
    } catch (e) {
      console.error(e);
      alert("Errore salvataggio GARA");
    } finally {
      setLoading(false);
    }
  }

  async function saveSim() {
    if (!adminSecret) return alert("Inserisci la chiave admin");
    setLoading(true);
    try {
      const { error } = await supabase.rpc("set_sim_enabled", {
        p_admin_secret: adminSecret,
        p_enabled: simEnabled,
        p_start_at: fromLocalInputValue(simStartAt),
        p_banner: simBanner || null,
      });
      if (error) throw error;
      await loadFlags();
      alert("Impostazioni SIM aggiornate ✅");
    } catch (e) {
      console.error(e);
      alert("Errore salvataggio SIM");
    } finally {
      setLoading(false);
    }
  }

  async function doReset(target) {
    if (!adminSecret) return alert("Inserisci la chiave admin");
    if (!confirm(`Sei sicuro di voler resettare ${target === "main" ? "la GARA" : "la SIMULAZIONE"}?`)) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("admin_reset", {
        p_admin_secret: adminSecret,
        p_target: target, // 'main' | 'sim'
      });
      if (error) throw error;
      alert(`Reset ${target === "main" ? "GARA" : "SIM"} completato ✅`);
    } catch (e) {
      console.error(e);
      alert("Errore nel reset");
    } finally {
      setLoading(false);
    }
  }

  async function loadTopContacts(limit = 5) {
    if (!adminSecret) return alert("Inserisci la chiave admin.");
    setContactsLoading(true);
    const { data, error } = await supabase.rpc("get_top_contacts", {
      p_admin_secret: adminSecret,
      p_limit: limit,
    });
    setContactsLoading(false);
    if (error) {
      console.error(error);
      return alert("Errore nel recupero contatti.");
    }
    setTopContacts(Array.isArray(data) ? data : []);
  }

  function copyCSV() {
    const header = "username,email,score,elapsed_s,first_full_score_at";
    const rows = topContacts.map((r) =>
      [
        r.username,
        r.email || "",
        r.score ?? 0,
        Math.round((r.elapsed_ms || 0) / 1000),
        r.first_full_score_at || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    navigator.clipboard.writeText(csv);
    alert("Copiato negli appunti (CSV).");
  }

  // ---- UI ----
  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <header className="brand">
        <div className="logo">🛠️</div>
        <h1>Admin • Quiz</h1>
        <div className="sub">Pannello di controllo (client-side)</div>
      </header>

      <div className="card">
        <div className="card-header">
          <h2>Autenticazione</h2>
        </div>
        <div className="card-body">
          <label>
            Chiave Admin (non salvata):
            <input
              type="password"
              placeholder="Digita il tuo admin secret"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>Contatti Top 5 — Gara</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => loadTopContacts(5)} disabled={contactsLoading}>
              Carica Top 5
            </button>
            <button className="secondary" onClick={copyCSV} disabled={!topContacts.length}>
              Copia CSV
            </button>
          </div>
        </div>
        <div className="card-body">
          {contactsLoading ? (
            <div className="muted">Caricamento…</div>
          ) : !topContacts.length ? (
            <div className="muted">Nessun dato.</div>
          ) : (
            <table className="nice">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Score</th>
                  <th>Tempo (s)</th>
                  <th>First 15/15</th>
                </tr>
              </thead>
              <tbody>
                {topContacts.map((r, i) => (
                  <tr key={r.username + i}>
                    <td>{i + 1}</td>
                    <td>@{r.username}</td>
                    <td>{r.email || "—"}</td>
                    <td>{r.score}/15</td>
                    <td>{Math.round((r.elapsed_ms || 0) / 1000)}</td>
                    <td>{r.first_full_score_at ? new Date(r.first_full_score_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="grid" style={{ marginTop: 12 }}>
        {/* GARA */}
        <section className="card">
          <div className="card-header">
            <h3>Gara (main)</h3>
          </div>
          <div className="card-body">
            <label>
              Abilita Start
              <input
                type="checkbox"
                checked={startEnabled}
                onChange={(e) => setStartEnabled(e.target.checked)}
              />
            </label>

            <label>
              Apertura (ora locale)
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </label>

            <label>
              Banner informativo
              <input
                type="text"
                value={banner}
                onChange={(e) => setBanner(e.target.value)}
                placeholder="Es. Si parte alle 21:00"
              />
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={saveMain} disabled={loading}>
                Salva GARA
              </button>
              <button
                className="secondary"
                onClick={() => doReset("main")}
                disabled={loading}
              >
                Reset GARA
              </button>
            </div>
          </div>
        </section>

        {/* SIM */}
        <section className="card">
          <div className="card-header">
            <h3>Simulazione</h3>
          </div>
          <div className="card-body">
            <label>
              Abilita Simulazione
              <input
                type="checkbox"
                checked={simEnabled}
                onChange={(e) => setSimEnabled(e.target.checked)}
              />
            </label>

            <label>
              Apertura (ora locale)
              <input
                type="datetime-local"
                value={simStartAt}
                onChange={(e) => setSimStartAt(e.target.value)}
              />
            </label>

            <label>
              Banner simulazione
              <input
                type="text"
                value={simBanner}
                onChange={(e) => setSimBanner(e.target.value)}
                placeholder="Es. Prova le 30 domande demo"
              />
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={saveSim} disabled={loading}>
                Salva SIM
              </button>
              <button
                className="secondary"
                onClick={() => doReset("sim")}
                disabled={loading}
              >
                Reset SIM
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <h2>Stato corrente</h2>
        </div>
        <div className="card-body">
          {!flags ? (
            <div className="muted">Caricamento…</div>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(flags, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
