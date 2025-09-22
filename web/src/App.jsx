import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { supabase, envOk } from "./lib/supabaseClient";

export default function App() {
  if (!envOk) {
    return (
      <div style={{ padding: 24, fontFamily: "Inter, system-ui" }}>
        ⚠️ Config mancante: aggiungi <code>VITE_SUPABASE_URL</code> e{" "}
        <code>VITE_SUPABASE_ANON_KEY</code> nelle Environment Variables di Render,
        poi rifai il deploy (Clear build cache + Deploy).
      </div>
    );
  }

  // Stato utente
  const [username, setUsername] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [secretCode, setSecretCode] = useState("");

  // Stato run
  const [runId, setRunId] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const [rank, setRank] = useState(null);

  // Domande
  const [questions, setQuestions] = useState(
    Array.from({ length: 15 }, (_, i) => ({
      id: `placeholder-${i + 1}`,
      text: `Domanda #${i + 1} (placeholder)`,
      options: ["A", "B", "C", "D"],
      selected: null,
      locked: false,
    }))
  );

  // Leaderboard (live)
  const [leaderboard, setLeaderboard] = useState([]);

  // Progress
  const correctCount = useMemo(() => questions.filter((q) => q.locked).length, [questions]);
  const progressPct = Math.round((correctCount / 15) * 100);

  // Timer visivo
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const elapsedMs = useMemo(() => (startedAt ? now - startedAt : 0), [now, startedAt]);
  const elapsedText = useMemo(() => {
    const s = Math.floor(elapsedMs / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return startedAt ? `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : "--:--";
  }, [elapsedMs, startedAt]);

  // Helpers: leaderboard + rank
  async function fetchLeaderboard() {
    const { data, error } = await supabase.rpc("get_leaderboard", { p_limit: 20 });
    if (!error) setLeaderboard(Array.isArray(data) ? data : []);
  }
  async function fetchMyRank(id) {
    if (!id) return;
    const { data, error } = await supabase.rpc("get_rank", { p_run_id: id });
    if (!error && typeof data === "number") setRank(data);
  }

  // Realtime subscription per aggiornare classifica e rank
  useEffect(() => {
    fetchLeaderboard();
    if (runId) fetchMyRank(runId);

    const channel = supabase
      .channel("lb")
      .on("postgres_changes", { event: "*", schema: "quiz", table: "quiz_runs" }, () => {
        fetchLeaderboard();
        if (runId) fetchMyRank(runId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // START / RESUME
  async function handleStart() {
    const u = username.trim();
    if (!u) {
      alert("Inserisci il tuo username TikTok");
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
      setSecretCode(row.secret_code);
      setQuestions(q);
      setFinished(false);
      setIsWinner(false);
      setRank(null);

      localStorage.setItem("pq_username", u);
      localStorage.setItem("pq_run_id", row.run_id);
      localStorage.setItem("pq_secret", row.secret_code);

      // aggiorna classifica e posizione
      fetchLeaderboard();
      fetchMyRank(row.run_id);
    } finally {
      setLoading(false);
    }
  }

  // Selezione
  function handleSelect(runQuestionIndex, optionIndex) {
    setQuestions((qs) => {
      const next = [...qs];
      if (next[runQuestionIndex].locked) return next;
      next[runQuestionIndex] = { ...next[runQuestionIndex], selected: optionIndex };
      return next;
    });
  }

  // INVIO
  async function handleSubmit() {
    if (!runId) return;

    const payload = questions
      .filter((q) => !q.locked && q.selected !== null)
      .map((q) => ({ question_id: q.id, selected_index_shown: q.selected }));

    if (payload.length === 0) {
      alert("Seleziona almeno una risposta.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("submit_answers", {
        p_run_id: runId,
        p_secret_code: secretCode,
        p_answers: payload,
      });

      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("RATE_LIMIT")) {
          alert("Attendi 2 secondi tra i tentativi.");
          return;
        }
        console.error(error);
        alert("Errore nell'invio.");
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const wrong = row?.wrong_ids || [];
      const score = row?.score ?? 0;

      setQuestions((qs) => qs.map((q) => ({ ...q, locked: !wrong.includes(q.id) })));
      setIsWinner(Boolean(row?.is_winner));
      setRank(row?.rank ?? null);

      if (score === 15) {
        setFinished(true);
        alert(row?.is_winner ? "🎉 Sei il VINCITORE!" : "Hai fatto 15/15! Ma il vincitore è già stato assegnato.");
      }

      // refresh classifica/posizione
      fetchLeaderboard();
      fetchMyRank(runId);
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
      <header className="brand">
        <div className="logo">⚡</div>
        <h1>Pokémon Gen1 Quiz</h1>
        <div className="sub">Gara a premi — 15 domande • 1 solo vincitore</div>
      </header>

      <div className="grid">
        {/* ====== Sidebar: Classifica ====== */}
        <aside className="card">
          <div className="card-header">
            <h2>Classifica (live)</h2>
          </div>
          <div className="card-body">
            <ul className="lb">
              {leaderboard.map((row, i) => (
                <li key={row.run_id} className={row.is_winner ? "winner" : ""}>
                  <span className="pos">{i + 1}</span>
                  <span className="user">@{row.username}</span>
                  <span className="score">{row.score}/15</span>
                  <span className="time">{Math.round((row.elapsed_ms || 0) / 1000)}s</span>
                  {row.is_winner && <span className="badge">Vincitore</span>}
                </li>
              ))}
            </ul>

            <div className="you" style={{ marginTop: 12 }}>
              {username ? (
                <div>
                  <strong>@{username}</strong> — la tua posizione: {rank ?? "…"} {isWinner ? " (Vincitore)" : ""}
                </div>
              ) : (
                <div>Inserisci il tuo username per vedere la posizione</div>
              )}
            </div>
          </div>
        </aside>

        {/* ====== Main: Gioco ====== */}
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
                <button onClick={handleStart} disabled={loading}>
                  {needCode ? "Riprendi" : "Start"}
                </button>
              ) : (
                <>
                  <button className="secondary" onClick={handleRetry} disabled={loading || finished}>
                    Ritenta
                  </button>
                  <button onClick={handleSubmit} disabled={loading || finished}>
                    Invia risposte
                  </button>
                </>
              )}
            </div>

            {/* Progresso */}
            <div className="progress" title={`${correctCount}/15 corrette`}>
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
    </div>
  );
}
