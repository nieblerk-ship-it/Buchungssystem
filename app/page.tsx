"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Users, Clock, X, Check, Settings, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAY_LABEL = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_LABEL = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const CATEGORY_COLOR: Record<string, string> = {
  Pole: "#B5657A",
  "Exotic Pole": "#C9A15E",
  Openclass: "#8FAE8B",
  Conditioning: "#8FAE8B",
  "Shape & Flexibility": "#8FAE8B",
  Specials: "#C9A15E",
};

// ---- Datumshilfen (bewusst ohne UTC-Umwege, um Tagesverschiebungen zu vermeiden) ----
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}
function getMonday(d: Date): Date {
  const day = d.getDay(); // 0=So .. 6=Sa
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Home() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => getMonday(today), [today]);
  const [weekStart, setWeekStart] = useState<Date>(currentWeekStart);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));

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

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const sessionsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    sessions.forEach((s) => {
      (map[s.session_date] ??= []).push(s);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => (a.course.start_time ?? "").localeCompare(b.course.start_time ?? "")));
    return map;
  }, [sessions]);

  const isCurrentWeek = isSameDay(weekStart, currentWeekStart);

  function goToWeek(d: Date) {
    setWeekStart(getMonday(d));
    setShowPicker(false);
  }

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

  // Kalendergitter für den Monats-Picker (immer volle Wochen, Mo-So)
  const pickerGrid = useMemo(() => {
    const firstOfMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
    const gridStart = getMonday(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [pickerMonth]);

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-bg">
      <div
        className="hidden md:block absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px z-0"
        style={{ background: "linear-gradient(to bottom, transparent, #C9A15E33 8%, #C9A15E33 92%, transparent)" }}
      />

      <Link
        href="/admin"
        className="fixed top-5 right-5 z-30 inline-flex items-center gap-1.5 text-xs text-muted hover:text-gold transition-colors bg-surface border border-border rounded-full px-3 py-2"
      >
        <Settings size={12} />
        Login
      </Link>

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

      {/* Wochennavigation */}
      <div className="relative z-20 flex items-center justify-center gap-3 px-6 mb-8">
        <button
          onClick={() => goToWeek(addDays(weekStart, -7))}
          disabled={isCurrentWeek}
          className="p-2 rounded-full border border-border text-muted disabled:opacity-30 disabled:cursor-not-allowed hover:text-gold"
          aria-label="Vorherige Woche"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="relative">
          <button
            onClick={() => { setPickerMonth(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1)); setShowPicker((v) => !v); }}
            className="px-4 py-2 rounded-full border border-border text-sm text-ivory hover:border-gold flex items-center gap-2"
          >
            <span className="text-gold font-medium">KW {getISOWeek(weekStart)}</span>
            <span className="text-muted text-xs">
              {formatDateOnly(weekStart).split("-").reverse().slice(0, 2).join(".")}. – {formatDateOnly(addDays(weekStart, 6)).split("-").reverse().slice(0, 2).join(".")}.{addDays(weekStart, 6).getFullYear()}
            </span>
          </button>

          {showPicker && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-30 w-72 rounded-2xl border border-border bg-surface p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))} className="p-1 text-muted hover:text-gold">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-ivory font-medium">{MONTH_LABEL[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}</span>
                <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))} className="p-1 text-muted hover:text-gold">
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted mb-1">
                {WEEKDAY_LABEL.map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {pickerGrid.map((d, i) => {
                  const inMonth = d.getMonth() === pickerMonth.getMonth();
                  const isToday = isSameDay(d, today);
                  return (
                    <button
                      key={i}
                      onClick={() => goToWeek(d)}
                      className={`text-xs py-1.5 rounded-lg ${
                        isToday ? "bg-gold text-bg font-semibold" : inMonth ? "text-ivory hover:bg-bg" : "text-muted/40 hover:bg-bg"
                      }`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => goToWeek(addDays(weekStart, 7))}
          className="p-2 rounded-full border border-border text-muted hover:text-gold"
          aria-label="Nächste Woche"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <main className="relative z-10 px-6 md:px-12 pb-24 max-w-6xl mx-auto" onClick={() => showPicker && setShowPicker(false)}>
        {loading && <p className="text-center text-muted">Lade Kursplan…</p>}
        {loadError && <p className="text-center text-wine text-sm">{loadError}</p>}

        {!loading && !loadError && (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-3 min-w-[900px]">
              {weekDays.map((day) => {
                const dateStr = formatDateOnly(day);
                const list = sessionsByDate[dateStr] ?? [];
                const isToday = isSameDay(day, today);
                return (
                  <div key={dateStr}>
                    <div className={`text-center mb-3 pb-2 border-b ${isToday ? "border-gold" : "border-border"}`}>
                      <div className={`font-display italic text-lg ${isToday ? "text-gold" : "text-ivory"}`}>{WEEKDAY_LABEL[day.getDay() === 0 ? 6 : day.getDay() - 1]}</div>
                      <div className="text-xs text-muted">{String(day.getDate()).padStart(2, "0")}.{String(day.getMonth() + 1).padStart(2, "0")}.</div>
                    </div>
                    <div className="space-y-2">
                      {list.length === 0 && <p className="text-xs text-muted text-center">–</p>}
                      {list.map((s) => {
                        const full = s.booked >= s.capacity;
                        const color = CATEGORY_COLOR[s.course.category] ?? "#C9A15E";
                        return (
                          <div key={s.id} className="rounded-xl p-3 border border-border bg-surface text-xs">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                              <span className="text-muted truncate">{s.course.category}{s.course.level ? ` · ${s.course.level}` : ""}</span>
                            </div>
                            <div className="text-ivory font-medium">{s.course.name}</div>
                            {s.course.room && <div className="text-muted mt-0.5">{s.course.room}</div>}
                            <div className="flex items-center gap-2 mt-1.5 text-muted">
                              <span className="flex items-center gap-1"><Clock size={10} />{s.course.start_time?.slice(0, 5)}</span>
                              <span className="flex items-center gap-1"><Users size={10} />{s.booked}/{s.capacity}</span>
                            </div>
                            <button
                              disabled={full}
                              onClick={() => openBooking(s)}
                              className={`mt-2 w-full py-1.5 rounded-full text-xs font-medium ${
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
                );
              })}
            </div>
          </div>
        )}
      </main>

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
                  {selected.session_date} · {selected.course.start_time?.slice(0, 5)} Uhr{selected.course.room ? ` · ${selected.course.room}` : ""}
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
