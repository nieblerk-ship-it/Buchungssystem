"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Users, Clock, X, Check, Settings } from "lucide-react";

const WEEKDAY_LABEL: Record<number, string> = { 1: "Mo", 2: "Di", 3: "Mi", 4: "Do", 5: "Fr", 6: "Sa", 7: "So" };

const CATEGORY_COLOR: Record<string, string> = {
  Pole: "#B5657A",
  "Exotic Pole": "#C9A15E",
  Openclass: "#8FAE8B",
  Conditioning: "#8FAE8B",
  "Shape & Flexibility": "#8FAE8B",
  Specials: "#C9A15E",
};

export default function Home() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/courses");
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error ?? "Kurse konnten nicht geladen werden.");
        } else {
          setSessions(data.sessions ?? []);
        }
      } catch {
        setLoadError("Kurse konnten nicht geladen werden.");
      }
      setLoading(false);
    }
    load();
  }, []);

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = { Mo: [], Di: [], Mi: [], Do: [], Fr: [], Sa: [], So: [] };
    sessions.forEach((s) => {
      const d = new Date(s.session_date + "T00:00:00");
      const label = WEEKDAY_LABEL[((d.getDay() + 6) % 7) + 1];
      map[label]?.push(s);
    });
    return map;
  }, [sessions]);

  function openBooking(s: any) {
    setSelected(s);
    setForm({ name: "", email: "" });
    setFormError(null);
    setConfirmed(false);
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setFormError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseSessionId: selected.id, name: form.name, email: form.email }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setFormError(data.error ?? "Etwas ist schiefgelaufen.");
      return;
    }
    setSessions((prev) => prev.map((s) => (s.id === selected.id ? { ...s, booked: s.booked + 1 } : s)));
    setConfirmed(true);
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-bg">
      <div
        className="hidden md:block absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px z-0"
        style={{ background: "linear-gradient(to bottom, transparent, #C9A15E33 8%, #C9A15E33 92%, transparent)" }}
      />

      <header className="relative z-10 px-6 md:px-12 pt-10 pb-8 text-center">
        <div className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase mb-4 text-gold">
          <Flame size={13} />
          <span>Kursplan &amp; Anmeldung</span>
        </div>
        <h1 className="font-display italic text-4xl md:text-6xl leading-tight text-ivory">
          Vertical <span className="text-wine">Ballerina</span>
        </h1>
        <p className="mt-3 text-sm md:text-base max-w-md mx-auto text-muted">
          Poledance Studio München — wähl deinen Kurs und melde dich an.
        </p>
      </header>

      <main className="relative z-10 px-6 md:px-12 pb-24 max-w-3xl mx-auto">
        {loading && <p className="text-center text-muted">Lade Kursplan…</p>}
        {loadError && <p className="text-center text-wine text-sm">{loadError}</p>}

        {!loading && !loadError && sessions.length === 0 && (
          <p className="text-center text-muted text-sm">
            Aktuell sind keine Termine hinterlegt. (In Supabase prüfen, ob seed.sql ausgeführt wurde.)
          </p>
        )}

        <div className="space-y-10">
          {Object.entries(byDay).filter(([, list]) => list.length > 0).map(([day, list]) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-4">
                <span className="font-display italic text-2xl text-gold">{day}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-3">
                {list.map((s) => {
                  const full = s.booked >= s.capacity;
                  const color = CATEGORY_COLOR[s.course.category] ?? "#C9A15E";
                  return (
                    <div key={s.id} className="rounded-2xl p-5 border border-border bg-surface flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          <span className="text-xs text-muted">
                            {s.course.category}{s.course.level ? ` · ${s.course.level}` : ""}
                          </span>
                        </div>
                        <h3 className="font-display text-lg text-ivory">{s.course.name}</h3>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {s.course.start_time?.slice(0, 5)} · {s.course.duration_minutes} Min
                          </span>
                          <span className="flex items-center gap-1">
                            <Users size={12} />
                            {s.booked}/{s.capacity}
                          </span>
                        </div>
                      </div>
                      <button
                        disabled={full}
                        onClick={() => openBooking(s)}
                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium ${
                          full ? "bg-border text-muted cursor-not-allowed" : "bg-wine text-ivory"
                        }`}
                      >
                        {full ? "Ausgebucht" : "Anmelden"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 text-center pb-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-gold transition-colors"
        >
          <Settings size={12} />
          Für Trainerinnen: Admin-Bereich
        </Link>
      </footer>

      {selected && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4" style={{ background: "#0A0910CC" }}>
          <div className="w-full max-w-md rounded-2xl p-6 relative bg-surface border border-border">
            <button onClick={() => setSelected(null)} className="absolute top-4 right-4 text-muted">
              <X size={18} />
            </button>

            {!confirmed ? (
              <>
                <h3 className="font-display text-xl mb-1 text-ivory">{selected.course.name}</h3>
                <p className="text-sm mb-5 text-muted">
                  {selected.session_date} · {selected.course.start_time?.slice(0, 5)} Uhr
                </p>
                <form onSubmit={submitBooking} className="space-y-3">
                  <input
                    required
                    placeholder="Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-bg border border-border text-ivory"
                  />
                  <input
                    required
                    type="email"
                    placeholder="E-Mail"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-bg border border-border text-ivory"
                  />
                  {formError && <p className="text-xs text-wine">{formError}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60"
                  >
                    {submitting ? "Melde an…" : "Verbindlich anmelden"}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-4" style={{ background: "#8FAE8B33" }}>
                  <Check size={22} style={{ color: "#8FAE8B" }} />
                </div>
                <h3 className="font-display text-xl mb-1 text-ivory">Angemeldet!</h3>
                <p className="text-sm text-muted">
                  {form.name}, du bist für {selected.course.name} am {selected.session_date} eingetragen.
                </p>
                <button
                  onClick={() => setSelected(null)}
                  className="mt-6 px-6 py-2.5 rounded-full text-sm font-medium bg-gold text-bg"
                >
                  Fertig
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
