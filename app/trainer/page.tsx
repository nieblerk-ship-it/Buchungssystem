"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Users, Clock, LogOut } from "lucide-react";

const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_LABEL = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

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
  const day = d.getDay();
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

const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-surface border border-border text-ivory";

export default function TrainerPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [trainerName, setTrainerName] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => getMonday(today), [today]);
  const [weekStart, setWeekStart] = useState<Date>(currentWeekStart);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setLoginError(null);
    const res = await fetch("/api/trainer/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setLoginError(data.error ?? "Fehler beim Login."); return; }
    setTrainerName(data.name);
    setLoggedIn(true);
    await loadSessions();
  }

  async function loadSessions() {
    const res = await fetch("/api/trainer/bookings");
    const data = await res.json();
    if (res.ok) setSessions(data.sessions ?? []);
  }

  async function logout() {
    await fetch("/api/trainer/logout", { method: "POST" });
    setLoggedIn(false);
    setSessions([]);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const sessionsByDate: Record<string, any[]> = {};
  sessions.forEach((s) => { (sessionsByDate[s.date] ??= []).push(s); });
  Object.values(sessionsByDate).forEach((list) => list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")));
  const isCurrentWeek = isSameDay(weekStart, currentWeekStart);
  const pickerGrid = (() => {
    const firstOfMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
    const gridStart = getMonday(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  })();
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <form onSubmit={login} className="w-full max-w-sm space-y-3">
          <Link href="/" className="flex items-center gap-1 text-xs text-muted mb-4"><ArrowLeft size={12} /> Zurück zur Buchungsseite</Link>
          <h1 className="font-display text-2xl mb-4 text-ivory">Trainer-Login</h1>
          <input required type="email" placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
          <input required type="password" placeholder="Passwort" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
          {loginError && <p className="text-xs text-wine">{loginError}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
            {loading ? "Prüfe…" : "Anmelden"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg px-6 py-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-ivory">Hallo, {trainerName}</h1>
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-xs text-muted"><ArrowLeft size={12} /> Zur Buchungsseite</Link>
          <button onClick={logout} className="flex items-center gap-1 text-xs text-muted hover:text-wine">
            <LogOut size={12} /> Abmelden
          </button>
        </div>
      </div>

      <p className="text-sm text-muted mb-6">Hier siehst du nur die Kurse, in denen du als Trainerin eingetragen bist.</p>

      <div className="flex items-center justify-center gap-3 mb-8">
        <button
          onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}
          disabled={isCurrentWeek}
          className="p-2 rounded-full border border-border text-muted disabled:opacity-30 disabled:cursor-not-allowed hover:text-gold"
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
                <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))} className="p-1 text-muted hover:text-gold"><ChevronLeft size={16} /></button>
                <span className="text-sm text-ivory font-medium">{MONTH_LABEL[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}</span>
                <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))} className="p-1 text-muted hover:text-gold"><ChevronRight size={16} /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted mb-1">
                {WEEKDAY_SHORT.map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {pickerGrid.map((d, i) => {
                  const inMonth = d.getMonth() === pickerMonth.getMonth();
                  const isToday = isSameDay(d, today);
                  return (
                    <button key={i} onClick={() => { setWeekStart(getMonday(d)); setShowPicker(false); }}
                      className={`text-xs py-1.5 rounded-lg ${isToday ? "bg-gold text-bg font-semibold" : inMonth ? "text-ivory hover:bg-bg" : "text-muted/40 hover:bg-bg"}`}>
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))} className="p-2 rounded-full border border-border text-muted hover:text-gold">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="overflow-x-auto" onClick={() => showPicker && setShowPicker(false)}>
        <div className="grid grid-cols-7 gap-3 min-w-[760px]">
          {weekDays.map((day) => {
            const dateStr = formatDateOnly(day);
            const list = sessionsByDate[dateStr] ?? [];
            const isToday = isSameDay(day, today);
            return (
              <div key={dateStr}>
                <div className={`text-center mb-3 pb-2 border-b ${isToday ? "border-gold" : "border-border"}`}>
                  <div className={`font-display italic text-lg ${isToday ? "text-gold" : "text-ivory"}`}>{WEEKDAY_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}</div>
                  <div className="text-xs text-muted">{String(day.getDate()).padStart(2, "0")}.{String(day.getMonth() + 1).padStart(2, "0")}.</div>
                </div>
                <div className="space-y-2">
                  {list.length === 0 && <p className="text-xs text-muted text-center">–</p>}
                  {list.map((s) => {
                    const isSelected = s.id === selectedSessionId;
                    return (
                      <button key={s.id} onClick={() => setSelectedSessionId(isSelected ? null : s.id)}
                        className={`w-full text-left rounded-xl p-3 border text-xs bg-surface ${isSelected ? "border-gold ring-1 ring-gold" : "border-border"}`}>
                        <div className="text-ivory font-medium">{s.courseName}</div>
                        {s.room && <div className="text-muted mt-0.5">{s.room}</div>}
                        <div className="text-muted mt-1 flex items-center gap-2">
                          <span className="flex items-center gap-1"><Clock size={10} />{s.time?.slice(0, 5)}</span>
                          <span className="flex items-center gap-1"><Users size={10} />{s.participants.length}/{s.capacity}</span>
                        </div>
                        {s.cancelled && <div className="text-wine mt-0.5">abgesagt</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedSession && (
        <div className="mt-8 rounded-2xl p-5 border border-border bg-surface">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-display text-lg text-ivory">
              {selectedSession.courseName} {selectedSession.level ? `– ${selectedSession.level}` : ""} {selectedSession.room ? <span className="text-xs text-muted">· {selectedSession.room}</span> : null}
              {selectedSession.cancelled && <span className="ml-2 text-xs text-wine">(abgesagt)</span>}
            </h3>
            <span className="text-xs text-muted">{selectedSession.date} · {selectedSession.time?.slice(0, 5)} · {selectedSession.participants.length}/{selectedSession.capacity}</span>
          </div>
          {selectedSession.participants.length === 0 ? (
            <p className="text-sm text-muted mt-2">Noch keine Anmeldungen.</p>
          ) : (
            <ul className="mt-3 text-sm text-ivory space-y-1.5">
              {selectedSession.participants.map((p: any, i: number) => (
                <li key={i} className="flex items-center gap-1.5 flex-wrap">
                  {p.name} <span className="text-muted">— {p.email}</span>
                  {p.source === "enrollment" && <span className="text-xs px-2 py-0.5 rounded-full border border-gold text-gold">Fest zugeteilt</span>}
                  {p.notes && <span className="text-xs text-muted">· {p.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
