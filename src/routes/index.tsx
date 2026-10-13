import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { askAurion } from "@/lib/aurion.functions";

export const Route = createFileRoute("/")({ component: Home });

type Turn = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "aurion-log-v1";

function localAnswer(text: string): string | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  if (/\b(time|hora|clock)\b/.test(q)) {
    return `Local time is ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  }
  if (/\b(date|fecha|day)\b/.test(q)) {
    return `Today is ${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}.`;
  }
  return null;
}

function speak(text: string, enabled: boolean) {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.96;
  u.pitch = 0.9;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|george|arthur/i.test(v.name)) ||
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang));
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
}

function Home() {
  const [log, setLog] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [booted, setBooted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLog(JSON.parse(raw) as Turn[]);
    } catch {
      /* ignore broken storage */
    }
    setBooted(true);
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    window.speechSynthesis?.getVoices();
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!booted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-40)));
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [log, booted]);

  const lastReply = useMemo(
    () => [...log].reverse().find((t) => t.role === "assistant")?.content ?? "Systems nominal. Awaiting instruction.",
    [log],
  );

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setDraft("");
    setError(null);
    const next: Turn[] = [...log, { role: "user", content }];
    setLog(next);

    const instant = localAnswer(content);
    if (instant) {
      setLog([...next, { role: "assistant", content: instant }]);
      speak(instant, voice);
      return;
    }

    setBusy(true);
    try {
      const result = await askAurion({ data: { messages: next } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLog([...next, { role: "assistant", content: result.text }]);
      speak(result.text, voice);
    } catch {
      setError("The channel dropped. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!Ctor) {
      setError("This browser has no speech recognition. Type instead.");
      return;
    }
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const said = ev.results[0]?.[0]?.transcript ?? "";
      setListening(false);
      if (said) void send(said);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const clock = now
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <main className="deck">
      <header className="topbar">
        <div className="mark">
          <span className="pulse" aria-hidden />
          Aurion
        </div>
        <p className="kicker">{busy ? "Processing" : listening ? "Listening" : "Online"}</p>
      </header>

      <div className="stage">
        <aside className="rail">
          <p className="kicker">Deck</p>
          <div className="stat">
            <span className="kicker">Local clock</span>
            <strong>{clock}</strong>
          </div>
          <div className="stat">
            <span className="kicker">Voice</span>
            <strong>{voice ? "Spoken replies on" : "Muted"}</strong>
          </div>
          <div className="stat">
            <span className="kicker">Link</span>
            <strong>{error ? "Fault" : "Ready"}</strong>
          </div>
          <div className="chips">
            {["Brief me", "What time is it?", "A dry observation"].map((c) => (
              <button key={c} type="button" className="chip" onClick={() => void send(c)}>
                {c}
              </button>
            ))}
          </div>
        </aside>

        <section className="core-wrap">
          <div className={`core${listening ? " listening" : ""}${busy ? " thinking" : ""}`} aria-hidden>
            <span className="ring" />
            <span className="ring" />
            <span className="ring" />
            <span className="nucleus" />
          </div>
          <p className="reply">{lastReply}</p>
        </section>

        <aside className="transcript">
          <p className="kicker">Transcript</p>
          <div className="log" ref={scroller}>
            {log.length === 0 && (
              <p className="bubble">
                <span className="who">Aurion</span>
                Command deck is live. Speak or type. History stays on this device.
              </p>
            )}
            {log.map((t, i) => (
              <p key={i} className={`bubble${t.role === "user" ? " user" : ""}`}>
                <span className="who">{t.role === "user" ? "You" : "Aurion"}</span>
                {t.content}
              </p>
            ))}
            {error && (
              <p className="bubble">
                <span className="who">Fault</span>
                {error}
              </p>
            )}
          </div>
        </aside>
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <button
          type="button"
          className="btn ghost"
          aria-label={voice ? "Mute voice" : "Enable voice"}
          onClick={() => {
            setVoice((v) => !v);
            window.speechSynthesis?.cancel();
          }}
        >
          {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <input
          className="field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={listening ? "Listening…" : "Instruct Aurion"}
          aria-label="Instruction"
          maxLength={1500}
        />
        <button type="button" className="btn ghost" aria-label={listening ? "Stop microphone" : "Speak"} onClick={toggleMic}>
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button type="submit" className="btn" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
