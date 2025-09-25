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

  // --------- MODALE "Strumenti moderazione" ----------
  const [cheatOpen, setCheatOpen] = useState(false);
  const [cheatUser, setCheatUser] = useState("");
  const [cheatLoading, setCheatLoading] = useState(false);
  const [solutions, setSolutions] = useState([]); // [{run_id, ord, question_id, index_shown, letter}]

  function openCheat() {
    if (!adminSecret) return alert("Inserisci prima la chiave admin.");
    setCheatUser("");
    setSolutions([]);
    setCheatOpen(true);
  }

  async function fetchSolutions() {
    const u = cheatUser.trim().replace(/^@/, "");
    if (!u) return alert("Inserisci uno username (senza @).");
    setCheatLoading(true);
    const { data, error } = await supabase.rpc("admin_get_solution_letters", {
      p_admin_secret: adminSecret,
      p_username: u,
    });
    setCheatLoading(false);
    if (error) {
      console.error(error);
      return alert(error.message || "Errore nel recupero soluzioni.");
    }
    setSolutions(Array.isArray(data) ? data : []);
  }

  async function markAllCorrectSoft() {
    const u = cheatUser.trim().replace(/^@/, "");
    if (!u) return alert("Inserisci uno username (senza @).");
    if (!confirm(`Impostare 15/15 corrette per @${u} (senza chiudere la run)?`)) return;
    setCheatLoading(true);
    const { data, error } = await supabase.rpc("admin_mark_all_correct_soft", {
      p_admin_secret: adminSecret,
      p_username: u,
    });
    setCheatLoading(false);
    if (error) {
      console.error(error);
      return alert(error.message || "Errore nell'operazione.");
    }
    const row = Array.isArray(data) ? data[0] : data;
    alert(`Fatto! Run ${row?.run_id || ""} aggiornata; risposte impostate: ${row?.updated_count ?? 0}.`);
    // Non chiudo la run: la chiusura (finished_at) resta a carico del flusso normale.
  }

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
          {/* pulsante strumenti moderazione */}
          <button className="secondary" onClick={openCheat} title="Strumenti moderazione">🧩</button>
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

      {/* MODALE STRUMENTI MODERAZIONE */}
      {cheatOpen && (
        <>
          <div className="modal-backdrop" onClick={() => setCheatOpen(false)} />
          <div className="modal">
            <div className="modal-header">
              <h3>Strumenti moderazione (GARA)</h3>
              <button className="close" onClick={() => setCheatOpen(false)} aria-label="Chiudi">✕</button>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 12 }}>
              <label>
                Username (senza @):
                <input
                  type="text"
                  placeholder="es. tcg_arc"
                  value={cheatUser}
                  onChange={(e) => setCheatUser(e.target.value)}
                  disabled={cheatLoading}
                />
              </label>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={fetchSolutions} disabled={cheatLoading || !cheatUser.trim()}>
                  Mostra soluzioni (A/B/C/D)
                </button>
                <button className="secondary" onClick={markAllCorrectSoft} disabled={cheatLoading || !cheatUser.trim()}>
                  Imposta tutte corrette (NO chiusura)
                </button>
              </div>

              {cheatLoading ? (
                <div className="muted">Caricamento…</div>
              ) : solutions.length ? (
                <table className="nice">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Lettera</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solutions
                      .slice()
                      .sort((a, b) => a.ord - b.ord)
                      .map((r) => (
                        <tr key={r.question_id}>
                          <td>{r.ord}</td>
                          <td style={{ fontWeight: 800 }}>{r.letter}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
