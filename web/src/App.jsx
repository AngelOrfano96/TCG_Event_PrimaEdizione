import { useEffect, useMemo, useState, useRef } from "react";
import "./index.css";
import { supabase, envOk } from "./lib/supabaseClient";

const PAGE_SIZE = 10;

export default function App() {
  if (!envOk) {
    return (
      <div style={{ padding: 24, fontFamily: "Inter, system-ui" }}>
        ⚠️ Config mancante: aggiungi <code>VITE_SUPABASE_URL</code> e{" "}
        <code>VITE_SUPABASE_ANON_KEY</code> su Render.
      </div>
    );
  }

  // ===== Stato utente/run =====
  const [username, setUsername] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [secretCode, setSecretCode] = useState("");

  const [runId, setRunId] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const [rank, setRank] = useState(null);
const [mode, setMode] = useState("main");   // 'main' | 'sim'  --> run corrente
const [lbMode, setLbMode] = useState("main"); // quale classifica stai guardando
  // ===== MODALE DETTAGLI RUN =====
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsUser, setDetailsUser] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsRows, setDetailsRows] = useState([]);
  const scheduleLBRefreshRef = useRef(() => {});
  const [page, setPage] = useState(0);

 async function openDetails(runId, user) {
  setDetailsUser(user);
  setDetailsOpen(true);
  setDetailsLoading(true);
  const fn = lbMode === "sim" ? "get_sim_run_details" : "get_run_details";
  const { data, error } = await supabase.rpc(fn, { p_run_id: runId });
  if (!error) setDetailsRows(Array.isArray(data) ? data : []);
  setDetailsLoading(false);
}

  function closeDetails() {
    setDetailsOpen(false);
    setDetailsRows([]);
  }

  // ===== Flags globali (da DB) =====
  const [isStartEnabled, setIsStartEnabled] = useState(false);
  const [startAt, setStartAt] = useState(null); // timestamptz
  const [hostBanner, setHostBanner] = useState(null);
  const [isSimEnabled, setIsSimEnabled] = useState(false);
  const [simStartAt, setSimStartAt] = useState(null);
  const [simBanner, setSimBanner] = useState(null);
const refreshingRef = useRef({ main: false, sim: false });


 async function fetchFlags() {
  const { data } = await supabase.rpc("get_runtime_flags");
  const row = Array.isArray(data) ? data[0] : data;
  if (row) {
    setIsStartEnabled(!!row.is_start_enabled);
    setStartAt(row.start_at ? new Date(row.start_at).getTime() : null);
    setHostBanner(row.banner || null);

    setIsSimEnabled(!!row.sim_enabled);
    setSimStartAt(row.sim_start_at ? new Date(row.sim_start_at).getTime() : null);
    setSimBanner(row.sim_banner || null);
  }
}


  // ===== Timer visivo (gioco) + countdown apertura =====
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const elapsedMs = useMemo(() => {
    if (!startedAt) return 0;
    const end = finishedAt ?? now;
    return end - startedAt;
  }, [now, startedAt, finishedAt]);
  const elapsedText = useMemo(() => {
    const s = Math.floor(elapsedMs / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return startedAt ? `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : "--:--";
  }, [elapsedMs, startedAt]);

const simCountdown = useMemo(() => {
  if (!simStartAt) return null;
  const diff = simStartAt - now;
  if (diff <= 0) return "00:00";
  const s = Math.ceil(diff / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}, [simStartAt, now]);


  // ===== Domande =====
  const [questions, setQuestions] = useState(
    Array.from({ length: 15 }, (_, i) => ({
      id: `placeholder-${i + 1}`,
      text: `Domanda #${i + 1} (placeholder)`,
      options: ["A", "B", "C", "D"],
      selected: null,
      locked: false,
    }))
  );
 const correctCount = useMemo(() => questions.filter((q) => q.locked).length, [questions]);
 const totalQuestions = questions.length || (mode === "sim" ? 30 : 15);
 const progressPct = Math.round((correctCount / totalQuestions) * 100);




  // ===== Leaderboard (live + paginazione + ricerca) =====
const [lbMain, setLbMain] = useState([]);
const [lbMainTotal, setLbMainTotal] = useState(0);
const [lbSim, setLbSim] = useState([]);
const [lbSimTotal, setLbSimTotal] = useState(0);

// derivati per la tab visibile
const currentLB = lbMode === "sim" ? lbSim : lbMain;
const currentTotal = lbMode === "sim" ? lbSimTotal : lbMainTotal;
const totalPages = Math.max(1, Math.ceil(currentTotal / PAGE_SIZE));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [winnerName, setWinnerName] = useState(null);
  const [highlightRunId, setHighlightRunId] = useState(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

async function fetchLeaderboard(which = lbMode, p = page) {
  const fn = which === "sim" ? "get_sim_leaderboard" : "get_leaderboard";
  const { data } = await supabase.rpc(fn, { p_limit: PAGE_SIZE, p_offset: p * PAGE_SIZE });
  const rows = Array.isArray(data) ? data : [];

  if (which === "sim") {
    setLbSim(rows);
    setLbSimTotal(rows.length ? Number(rows[0].total_count) : 0);
  } else {
    setLbMain(rows);
    setLbMainTotal(rows.length ? Number(rows[0].total_count) : 0);
    const topWinner = rows.find((r) => r.is_winner);
    setWinnerName(topWinner ? topWinner.username : null);
  }
}

  const startCountdown = useMemo(() => {
  if (!startAt) return null;
  const diff = startAt - now;
  if (diff <= 0) return "00:00";
  const s = Math.ceil(diff / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}, [startAt, now]);

async function fetchMyRank(id) {
  if (!id) return;
  const fn = mode === "sim" ? "get_sim_rank" : "get_rank";
  const { data, error } = await supabase.rpc(fn, { p_run_id: id });
  if (!error && typeof data === "number") setRank(data);
}

async function doSearch() {
  const q = searchQ.trim();
  if (!q) return setSearchResults([]);
  setSearchLoading(true);
  const fn = lbMode === "sim" ? "search_sim_ranks" : "search_ranks";
  const { data } = await supabase.rpc(fn, { p_query: q, p_limit: 20, p_offset: 0 });
  setSearchLoading(false);
  setSearchResults(Array.isArray(data) ? data : []);
}

  function jumpToRank(rank, runId) {
    const targetPage = Math.floor((rank - 1) / PAGE_SIZE);
    setPage(targetPage);
    setDrawerOpen(false);
    setHighlightRunId(runId);
    setTimeout(() => setHighlightRunId(null), 2000);
  }
useEffect(() => {
  // opzionale: carica la sim solo quando apri la tab; se vuoi caricarla subito, chiama fetchLeaderboard("sim")
  const channel = supabase
    .channel("lb-sim")
    .on("postgres_changes", { event: "*", schema: "quiz", table: "sim_runs" }, () => {
      scheduleLBRefreshRef.current("sim");
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}, []);

const simStartLocked = useMemo(() => {
  if (!isSimEnabled) return true;
  if (simStartAt && Date.now() < simStartAt) return true;
  return false;
}, [isSimEnabled, simStartAt]);


  // ===== Throttle per la leaderboard (1 refresh/sec) =====
useEffect(() => {
  scheduleLBRefreshRef.current = (which) => {
    const key = which === "sim" ? "sim" : "main";
    if (refreshingRef.current[key]) return;
    refreshingRef.current[key] = true;

    setTimeout(async () => {
      await fetchLeaderboard(which);               // ricarica SOLO quella tab
      if (which === mode && runId) await fetchMyRank(runId); // rank solo se riguarda la run corrente
      if (which === lbMode && searchQ) await doSearch();     // ricerca solo se stai guardando quella tab
      refreshingRef.current[key] = false;
    }, 1000); // max 1/s per tab
  };
  // dipendenze: usiamo le ultime versioni di questi valori
}, [lbMode, mode, runId, searchQ, page]);


  // ===== Realtime solo per FLAGS (stabile) =====
  useEffect(() => {
    fetchFlags(); // lettura immediata all’avvio

    const flagsChannel = supabase
      .channel("flags-channel")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "quiz", table: "runtime_flags", filter: "id=eq.1" },
        () => fetchFlags()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "quiz", table: "runtime_flags", filter: "id=eq.1" },
        () => fetchFlags()
      )
      .subscribe();

    // Fallback: WS down → polling
    const poll = setInterval(fetchFlags, 10000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(flagsChannel);
    };
  }, []); // deps vuote

  // ===== Realtime: leaderboard + winners =====
useEffect(() => {
  fetchLeaderboard("main"); // prima pagina a freddo (gara)

  const channel = supabase
    .channel("lb-main")
    .on("postgres_changes", { event: "*", schema: "quiz", table: "quiz_runs" }, () => {
      scheduleLBRefreshRef.current("main");
    })
    .on("postgres_changes", { event: "*", schema: "quiz", table: "winners" }, () => {
      scheduleLBRefreshRef.current("main");
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, []); // deps vuote


  // ===== START / RESUME =====
  const startLockedBecauseOfFlag = useMemo(() => {
    if (!isStartEnabled) return true;
    if (startAt && Date.now() < startAt) return true;
    return false;
  }, [isStartEnabled, startAt]);

  async function handleStart() {
    const u = username.trim();
    if (!u) return alert("Inserisci il tuo username TikTok");
    if (startLockedBecauseOfFlag) {
      const msg =
        startAt && Date.now() < startAt
          ? `La gara non è ancora aperta. Apertura tra ${startCountdown || ""}.`
          : "La gara non è ancora aperta.";
      alert(msg);
      return;
    }
    setLoading(true);
    try {
      const payloadCode = needCode ? secretCode.trim() || null : secretCode || null;
      const { data, error } = await supabase.rpc("start_run", {
        p_username: u,
        p_reclaim_code: payloadCode,
      });
      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("RECLAIM_REQUIRED")) {
          setNeedCode(true);
          alert("Esiste già una partita attiva per questo username. Inserisci il codice segreto per riprenderla.");
          return;
        }
        console.error(error);
        alert("Errore nello start.");
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const q = (row?.questions || []).map((it) => ({
        id: it.question_id,
        text: it.text,
        options: it.options,
        selected: null,
        locked: false,
      }));
      setRunId(row.run_id);
      setStartedAt(new Date(row.started_at).getTime());
      setFinishedAt(row.finished_at ? new Date(row.finished_at).getTime() : null);
      setSecretCode(row.secret_code);
      setQuestions(q);
      setFinished(Boolean(row.finished_at));
      setIsWinner(false);
      setRank(null);
      setMode("main");

      localStorage.setItem("pq_username", u);
      localStorage.setItem("pq_run_id", row.run_id);
      localStorage.setItem("pq_secret", row.secret_code);

      // aggiornamenti iniziali
     scheduleLBRefreshRef.current('main');
fetchMyRank(row.run_id);
    } finally {
      setLoading(false);
    }
  }

  // ===== Selezione / Invio =====
  function handleSelect(idx, optionIndex) {
    setQuestions((qs) => {
      const next = [...qs];
      if (next[idx].locked) return next;
      next[idx] = { ...next[idx], selected: optionIndex };
      return next;
    });
  }

async function handleSubmit() {
  if (!runId) return;
  const payload = questions
    .filter((q) => !q.locked && q.selected !== null)
    .map((q) => ({ question_id: q.id, selected_index_shown: q.selected }));
  if (!payload.length) return alert("Seleziona almeno una risposta.");

  setLoading(true);
  try {
    // ✅ scegli la funzione giusta
    const rpcName = mode === "sim" ? "submit_sim_answers" : "submit_answers";
    const { data, error } = await supabase.rpc(rpcName, {
      p_run_id: runId,
      p_secret_code: secretCode,
      p_answers: payload,
    });

      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("RATE_LIMIT")) return alert("Attendi 2 secondi tra i tentativi.");
        console.error(error);
        return alert("Errore nell'invio.");
      }
      const row = Array.isArray(data) ? data[0] : data;
      const wrong = row?.wrong_ids || [];
      setQuestions((qs) => qs.map((q) => ({ ...q, locked: !wrong.includes(q.id) })));
      setIsWinner(Boolean(row?.is_winner));
      setRank(row?.rank ?? null);

    if (row?.finished_at) {
  setFinished(true);
  setFinishedAt(new Date(row.finished_at).getTime());
  alert(
    mode === "sim"
      ? "Simulazione completata!"
      : (row?.is_winner ? "🎉 Sei il VINCITORE!" : "Hai fatto 15/15! Ma il vincitore è già stato assegnato.")
  );
}


      // refresh list/search
// refresh SOLO la leaderboard della modalità corrente
scheduleLBRefreshRef.current(mode);   // 'main' oppure 'sim'
fetchMyRank(runId);
if (searchQ && lbMode === mode) doSearch(); // ricerca solo se stai guardando quella tab

    } finally {
      setLoading(false);
    }
  }
async function handleStartSim() {
  const u = username.trim();
  if (!u) return alert("Inserisci il tuo username TikTok");
  if (simStartLocked) {
    const msg =
      simStartAt && Date.now() < simStartAt
        ? `La simulazione non è ancora aperta. Apertura tra ${startCountdown || ""}.`
        : "La simulazione è disabilitata.";
    alert(msg);
    return;
  }
  setLoading(true);
  try {
    const payloadCode = needCode ? secretCode.trim() || null : secretCode || null;
    const { data, error } = await supabase.rpc("start_sim_run", {
      p_username: u,
      p_reclaim_code: payloadCode,
    });
   if (error) {
  const em = String(error.message || "");
  if (em.includes("RECLAIM_REQUIRED")) {
    setNeedCode(true);
    alert("Hai già una simulazione attiva per questo username. Inserisci il codice per riprenderla.");
    return;
  }
  if (em.includes("SIM_NOT_YET_OPEN")) {
    alert(`La simulazione non è ancora aperta. Apertura tra ${simCountdown || ""}.`);
    return;
  }
  if (em.includes("SIM_DISABLED")) {
    alert("La simulazione è disabilitata.");
    return;
  }
  console.error(error);
  alert("Errore nell'avvio simulazione.");
  return;
}

    const row = Array.isArray(data) ? data[0] : data;
    const q = (row?.questions || []).map((it) => ({
      id: it.question_id,
      text: it.text,
      options: it.options,
      selected: null,
      locked: false,
    }));
    setMode("sim");
    setRunId(row.run_id);
    setStartedAt(new Date(row.started_at).getTime());
    setFinishedAt(row.finished_at ? new Date(row.finished_at).getTime() : null);
    setSecretCode(row.secret_code);
    setQuestions(q);
    setFinished(Boolean(row.finished_at));
    setIsWinner(false);
    setRank(null);

    localStorage.setItem("pq_username", u);
    localStorage.setItem("pq_run_id", row.run_id);
    localStorage.setItem("pq_secret", row.secret_code);

scheduleLBRefreshRef.current('sim');
fetchMyRank(row.run_id);

  } finally {
    setLoading(false);
  }
}

  function handleRetry() {
    const hasWrong = questions.some((q) => !q.locked);
    if (!hasWrong) alert("Non ci sono domande da ritentare.");
  }

  // Prefill
  useEffect(() => {
    const savedUser = localStorage.getItem("pq_username");
    const savedSecret = localStorage.getItem("pq_secret");
    if (savedUser) setUsername(savedUser);
    if (savedSecret) setSecretCode(savedSecret);
  }, []);

  return (
    <div className="container">
      {/* Banner vincitore (se c'è) */}
      {winnerName && (
        <div className="winner-banner">
          🏆 Vincitore: <strong>@{winnerName}</strong> — la gara prosegue per il podio!
        </div>
      )}

      {/* Banner host opzionale (dai flag) */}
      {hostBanner && !winnerName && (
        <div className="winner-banner" style={{ borderColor: "rgba(102,224,255,.5)" }}>
          ℹ️ {hostBanner}
          {startAt && Date.now() < startAt ? (
            <> — Apertura tra <strong>{startCountdown}</strong></>
          ) : null}
        </div>
      )}

      <header className="brand">
        <div className="logo">⚡</div>
        <h1>TCG ARC - 1° Ed.</h1>
        <div className="sub">Charizard ad 1 € — 15 domande • 1 solo vincitore</div>
        <button className="lb-toggle" onClick={() => setDrawerOpen(true)} aria-label="Apri classifica">🏆</button>
        <div className="tabs" style={{display:'flex', gap:8, margin:'6px 0 10px'}}></div>

      </header>

      <div className="grid">
        {/* ===== Sidebar / Drawer ===== */}
        <aside className={`card sidebar-drawer ${drawerOpen ? "open" : ""}`}>
          <div className="card-header">
            <h2>Classifica</h2>
            <button className="close" onClick={() => setDrawerOpen(false)} aria-label="Chiudi">✕</button>
          </div>
          <div className="card-body">
<button className={lbMode==='main' ? 'secondary' : ''} onClick={() => { setLbMode('main'); setPage(0); fetchLeaderboard('main', 0); }}>Gara</button>
<button className={lbMode==='sim' ? 'secondary' : ''} onClick={() => { setLbMode('sim'); setPage(0); fetchLeaderboard('sim', 0); }}>Simulazione</button>


            {/* --- Barra di ricerca --- */}
            <form
              className="searchbar"
              onSubmit={(e) => {
                e.preventDefault();
                doSearch();
              }}
            >
              <input
                type="text"
                placeholder="Cerca username (es. @ash)"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
              <button type="submit" className="secondary" disabled={searchLoading}>
                🔍
              </button>
            </form>

            {/* Risultati ricerca */}
            {searchQ && (
              <div className="search-results">
                {searchLoading ? (
                  <div className="muted">Ricerca…</div>
                ) : searchResults.length ? (
                  <ul>
                    {searchResults.map((r) => (
                      <li key={r.run_id}>
                        <span className="rk">#{r.rank}</span>
                        <span className="name">@{r.username}</span>
                        <span className="mini">{r.score}/{lbMode === "sim" ? 30 : 15} • {Math.round((r.elapsed_ms || 0) / 1000)}s</span>
                        <button onClick={() => jumpToRank(r.rank, r.run_id)}>Vai</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="muted">Nessun risultato per “{searchQ}”.</div>
                )}
              </div>
            )}

            {/* Lista leaderboard */}
            <ul className="lb">
  {currentLB.map((row, i) => (
                <li
                  key={row.run_id}
                  className={`${row.is_winner ? "winner" : ""} ${highlightRunId === row.run_id ? "hl" : ""}`}
                >
                  <span className="pos">{i + 1 + page * PAGE_SIZE}</span>
                  <span
                    className="user linkish"
                    onClick={() => openDetails(row.run_id, row.username)}
                    title="Vedi dettagli run"
                  >
                    @{row.username}
                  </span>
                  <span className="score">{row.score}/{lbMode === "sim" ? 30 : 15}</span>
                  <span className="time">{Math.round((row.elapsed_ms || 0) / 1000)}s</span>
                  {row.is_winner && <span className="badge">Vincitore</span>}
                </li>
              ))}
            </ul>

            {/* Paginazione */}
            <div className="pager">
              <button
                className="secondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Prec
              </button>
              <div className="pageinfo">
                Pagina {page + 1} / {totalPages}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Succ →
              </button>
            </div>

            <div className="you" style={{ marginTop: 12 }}>
              {username ? (
                <div>
                  <strong>@{username}</strong> — la tua posizione: {rank ?? "…"} {isWinner ? " (Vincitore)" : ""}
                </div>
              ) : (
                <div>Inserisci il tuo username per vedere la posizione</div>
              )}
            </div>

            {/* Modale dettagli */}
            {detailsOpen && (
              <>
                <div className="modal-backdrop" onClick={closeDetails} />
                <div className="modal">
                  <div className="modal-header">
                    <h3>Dettagli di @{detailsUser}</h3>
                    <button className="close" onClick={closeDetails} aria-label="Chiudi">✕</button>
                  </div>
                  <div className="modal-body">
                    {detailsLoading ? (
                      <div className="muted">Caricamento…</div>
                    ) : detailsRows.length === 0 ? (
                      <div className="muted">Nessun dettaglio disponibile.</div>
                    ) : (
                      <ul className="details-list">
                        {detailsRows.map((r) => (
                          <li key={r.question_id}>
                            <div className="qline">
                              <span className="badge">#{r.ord}</span>
                              <span className="qtxt">{r.question_text}</span>
                            </div>
                            <div className="chips">
                              {r.options.map((opt, idx) => {
                                const selected = r.selected_index_shown === idx;
                                const corr = r.is_correct === true && selected;
                                const wrong = r.is_correct === false && selected;
                                return (
                                  <span
                                    key={idx}
                                    className={
                                      "chip " +
                                      (corr ? "ok" : "") +
                                      (wrong ? "ko" : "") +
                                      (selected ? " sel" : "")
                                    }
                                    title={selected ? (corr ? "Risposta corretta" : "Risposta errata") : ""}
                                  >
                                    {String.fromCharCode(65 + idx)}. {opt}
                                  </span>
                                );
                              })}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ===== Main ===== */}
        <main className="card">
          <div className="card-header">
            <h2>La tua partita</h2>
            {runId && <div className="timer">⏱ {elapsedText}</div>}
          </div>

          <div className="card-body">
            <div className="controls" style={{ marginBottom: 12 }}>
              <label>
                Inserisci il tuo username TikTok:
                <input
                  type="text"
                  placeholder="@tuo_username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading || !!runId}
                />
              </label>

              {needCode && (
                <label>
                  Codice segreto:
                  <input
                    type="text"
                    placeholder="es. 428317"
                    value={secretCode}
                    onChange={(e) => setSecretCode(e.target.value)}
                    disabled={loading || !!runId}
                  />
                </label>
              )}

             {!runId ? (
  <>
<button
  onClick={handleStart}
  disabled={loading || startLockedBecauseOfFlag}
  title={
    startLockedBecauseOfFlag
      ? (startAt && Date.now() < startAt ? `Apertura tra ${startCountdown || ""}` : "La gara non è ancora aperta")
      : ""
  }
>
  {needCode ? "Riprendi" : "Start"}
</button>


<button
  className="secondary"
  onClick={handleStartSim}
  disabled={loading || simStartLocked}
  title={
    simStartLocked
      ? (simStartAt && Date.now() < simStartAt ? `Simulazione tra ${simCountdown || ""}` : "Simulazione disabilitata")
      : ""
  }
  style={{ marginLeft: 8 }}
>
  Avvia Simulazione
</button>

  </>
) : (
  <>
    {/* RIMOSSO: bottone Ritenta */}
    <button onClick={handleSubmit} disabled={loading || finished}>
      Invia risposte
    </button>
  </>
)}

            </div>

            {/* Progresso */}
           <div className="progress" title={`${correctCount}/${totalQuestions} corrette`}>
           <div className="bar" style={{ width: `${progressPct}%` }} />
             </div>


            {/* Domande */}
            <section className="questions" style={{ marginTop: 16 }}>
              {questions.map((q, idx) => (
                <div key={q.id} className={`question ${q.locked ? "locked" : ""}`}>
                  <div className="qhead">
                    <span className="qnum">{idx + 1}</span>
                    <span className="qtext">{q.text}</span>
                    {q.locked && <span style={{ marginLeft: 8, color: "var(--ok)", fontWeight: 700 }}>✓</span>}
                  </div>
                  <div className="opts">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className={`opt ${q.selected === oi ? "selected" : ""}`}>
                        <input
                          type="radio"
                          name={`q-${idx}`}
                          checked={q.selected === oi}
                          onChange={() => handleSelect(idx, oi)}
                          disabled={!runId || q.locked || loading}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </main>
      </div>

      {drawerOpen && <div className="backdrop" onClick={() => setDrawerOpen(false)} />}
    </div>
  );
}
