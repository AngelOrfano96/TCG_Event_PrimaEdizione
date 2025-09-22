import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { supabase, envOk } from "./lib/supabaseClient";



export default function App() {

   if (!envOk) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
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

  // Domande (dopo start arriveranno dal DB)
  const [questions, setQuestions] = useState(
    Array.from({ length: 15 }, (_, i) => ({
      id: `placeholder-${i + 1}`,
      text: `Domanda #${i + 1} (placeholder)`,
      options: ["A", "B", "C", "D"],
      selected: null,
    }))
  );

  // Classifica placeholder (verrà in realtime in seguito)
  const [leaderboard] = useState([
    { username: "winner", score: 15, elapsedMs: 42000, isWinner: true },
    { username: "ash", score: 13, elapsedMs: 51000, isWinner: false },
    { username: "misty", score: 12, elapsedMs: 48000, isWinner: false },
  ]);

  // Timer visivo
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const elapsedMs = useMemo(() => {
    if (!startedAt) return 0;
    return now - startedAt;
  }, [now, startedAt]);

  const elapsedText = useMemo(() => {
    const s = Math.floor(elapsedMs / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return startedAt ? `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : "--:--";
  }, [elapsedMs, startedAt]);

  // Start/Resume via RPC
  async function handleStart() {
    const u = username.trim();
    if (!u) {
      alert("Inserisci il tuo username TikTok");
      return;
    }
    setLoading(true);
    try {
      const payloadCode = needCode ? secretCode.trim() || null : (secretCode || null);

      const { data, error } = await supabase.rpc("start_run", {
        p_username: u,
        p_reclaim_code: payloadCode,
      });

      if (error) {
        // Se esiste già una run attiva serve il codice
        if (String(error.message || "").includes("RECLAIM_REQUIRED")) {
          setNeedCode(true);
          alert("Esiste già una partita attiva per questo username. Inserisci il codice segreto per riprenderla.");
          return;
        }
        if (String(error.message || "").includes("USERNAME_REQUIRED")) {
          alert("Username mancante.");
          return;
        }
        console.error(error);
        alert("Errore nello start. Controlla le variabili Supabase e riprova.");
        return;
      }

      // L'RPC ritorna 1 riga; supabase-js la mette come oggetto o array -> normalizziamo
      const row = Array.isArray(data) ? data[0] : data;
      const q = (row?.questions || []).map((it) => ({
        id: it.question_id,
        text: it.text,
        options: it.options,
        selected: null,
      }));

      setRunId(row.run_id);
      setStartedAt(new Date(row.started_at).getTime());
      setSecretCode(row.secret_code);
      setQuestions(q);

      // Persistiamo per auto-ripresa
      localStorage.setItem("pq_username", u);
      localStorage.setItem("pq_run_id", row.run_id);
      localStorage.setItem("pq_secret", row.secret_code);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(runQuestionIndex, optionIndex) {
    setQuestions((qs) => {
      const next = [...qs];
      next[runQuestionIndex] = { ...next[runQuestionIndex], selected: optionIndex };
      return next;
    });
  }

  function handleSubmit() {
    if (!runId) return;
    const answered = questions.filter((q) => q.selected !== null).length;
    if (answered < 15) {
      alert(`Rispondi a tutte le 15 domande (mancano ${15 - answered}).`);
      return;
    }
    alert("Invio placeholder: nel prossimo step invieremo al DB per la correzione e la classifica.");
  }

  function handleRetry() {
    alert("Ritenta placeholder. Nel design reale il timer non si azzera (calcolato dal server).");
  }

  // Auto-precompila username/codice se salvati
  useEffect(() => {
    const savedUser = localStorage.getItem("pq_username");
    const savedSecret = localStorage.getItem("pq_secret");
    if (savedUser) setUsername(savedUser);
    if (savedSecret) setSecretCode(savedSecret);
  }, []);

  return (
    <div className="page">
      {/* Colonna sinistra: classifica */}
      <aside className="sidebar">
        <h2>Classifica (live)</h2>
        <ul className="lb">
          {leaderboard
            .sort((a, b) => {
              if (a.isWinner !== b.isWinner) return Number(b.isWinner) - Number(a.isWinner);
              if (a.score !== b.score) return b.score - a.score;
              return a.elapsedMs - b.elapsedMs;
            })
            .map((row, i) => (
              <li key={row.username} className={row.isWinner ? "winner" : ""}>
                <span className="pos">{i + 1}</span>
                <span className="user">@{row.username}</span>
                <span className="score">{row.score}/15</span>
                <span className="time">{Math.round(row.elapsedMs / 1000)}s</span>
                {row.isWinner && <span className="badge">Vincitore</span>}
              </li>
            ))}
        </ul>
        <div className="you">
          {username ? (
            <div>
              <strong>@{username}</strong> — la tua posizione: …
            </div>
          ) : (
            <div>Inserisci il tuo username per vedere la posizione</div>
          )}
        </div>
      </aside>

      {/* Colonna destra: gioco */}
      <main className="main">
        <header className="top">
          <div className="userbox">
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
              <div className="timer">⏱️ {elapsedText}</div>
            )}
          </div>
        </header>

        <section className="questions">
          {questions.map((q, idx) => (
            <div key={q.id} className="question">
              <div className="qhead">
                <span className="qnum">{idx + 1}.</span>
                <span>{q.text}</span>
              </div>
              <div className="opts">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`opt ${q.selected === oi ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name={`q-${idx}`}
                      checked={q.selected === oi}
                      onChange={() => handleSelect(idx, oi)}
                      disabled={!runId}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>

        <footer className="bottom">
          <button onClick={handleSubmit} disabled={!runId || loading}>
            Invia risposte
          </button>
          <button onClick={handleRetry} disabled={!runId || loading}>
            Ritenta
          </button>
        </footer>
      </main>
    </div>
  );
}

