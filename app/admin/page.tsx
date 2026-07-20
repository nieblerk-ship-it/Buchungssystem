"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
  { value: 7, label: "Sonntag" },
];

const EMPTY_COURSE = {
  name: "", category: "Pole", level: "", instructor: "",
  weekday: 1, start_time: "18:00", duration_minutes: 70, capacity: 8, notes: "",
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<"anmeldungen" | "kurse">("anmeldungen");
  const [sessions, setSessions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);

  const [newCourse, setNewCourse] = useState<any>(EMPTY_COURSE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCourse, setEditCourse] = useState<any>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setLoginError(null);
    const res = await fetch(`/api/admin/bookings?password=${encodeURIComponent(password)}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setLoginError(data.error ?? "Fehler beim Laden.");
      return;
    }
    setSessions(data.sessions);
    setUnlocked(true);
    await loadCourses();
  }

  async function loadSessions() {
    const res = await fetch(`/api/admin/bookings?password=${encodeURIComponent(password)}`);
    const data = await res.json();
    if (res.ok) setSessions(data.sessions);
  }

  async function loadCourses() {
    const res = await fetch(`/api/admin/courses?password=${encodeURIComponent(password)}`);
    const data = await res.json();
    if (res.ok) setCourses(data.courses);
  }

  async function toggleCancelled(sessionId: string, cancelled: boolean) {
    setActionError(null);
    const res = await fetch("/api/admin/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, sessionId, cancelled }),
    });
    if (!res.ok) {
      const data = await res.json();
      setActionError(data.error ?? "Fehler beim Absagen.");
      return;
    }
    await loadSessions();
  }

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setActionError(null);
    const res = await fetch("/api/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...newCourse }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setActionError(data.error ?? "Fehler beim Anlegen.");
      return;
    }
    setNewCourse(EMPTY_COURSE);
    await loadCourses();
    await loadSessions();
  }

  function startEdit(c: any) {
    setEditingId(c.id);
    setEditCourse({ ...c });
  }

  async function saveEdit() {
    setSaving(true);
    setActionError(null);
    const original = courses.find((c) => c.id === editingId);
    const weekdayChanged = original?.weekday !== editCourse.weekday;
    const res = await fetch("/api/admin/courses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, id: editingId, ...editCourse, regenerate: weekdayChanged }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setActionError(data.error ?? "Fehler beim Speichern.");
      return;
    }
    setEditingId(null);
    await loadCourses();
    await loadSessions();
  }

  async function deactivateCourse(id: string) {
    if (!confirm("Diesen Kurs deaktivieren? Er verschwindet dann aus der Buchungsseite (bestehende Termine/Buchungen bleiben erhalten).")) return;
    setActionError(null);
    const res = await fetch(`/api/admin/courses?password=${encodeURIComponent(password)}&id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setActionError(data.error ?? "Fehler beim Deaktivieren.");
      return;
    }
    await loadCourses();
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <form onSubmit={login} className="w-full max-w-sm space-y-3">
          <Link href="/" className="flex items-center gap-1 text-xs text-muted mb-4">
            <ArrowLeft size={12} /> Zurück zur Buchungsseite
          </Link>
          <h1 className="font-display text-2xl mb-4 text-ivory">Admin-Login</h1>
          <input
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-surface border border-border text-ivory"
          />
          {loginError && <p className="text-xs text-wine">{loginError}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60"
          >
            {loading ? "Prüfe…" : "Anmelden"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg px-6 py-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-ivory">Admin</h1>
        <Link href="/" className="flex items-center gap-1 text-xs text-muted">
          <ArrowLeft size={12} /> Zur Buchungsseite
        </Link>
      </div>

      <nav className="flex gap-1 mb-8">
        {[
          { id: "anmeldungen", label: "Anmeldungen" },
          { id: "kurse", label: "Kurse verwalten" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm rounded-full ${
              tab === t.id ? "bg-gold text-bg font-semibold" : "border border-border text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {actionError && <p className="text-sm text-wine mb-4">{actionError}</p>}

      {tab === "anmeldungen" && (
        <div className="space-y-4">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-2xl p-5 border border-border bg-surface">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-display text-lg text-ivory">
                  {s.courseName} {s.level ? `– ${s.level}` : ""}
                  {s.cancelled && <span className="ml-2 text-xs text-wine">(abgesagt)</span>}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    {s.date} · {s.time?.slice(0, 5)} · {s.participants.length}/{s.capacity}
                  </span>
                  <button
                    onClick={() => toggleCancelled(s.id, !s.cancelled)}
                    className="text-xs px-3 py-1 rounded-full border border-border text-muted"
                  >
                    {s.cancelled ? "Wieder aktivieren" : "Termin absagen"}
                  </button>
                </div>
              </div>
              {s.participants.length === 0 ? (
                <p className="text-sm text-muted mt-2">Noch keine Anmeldungen.</p>
              ) : (
                <ul className="mt-2 text-sm text-ivory space-y-1">
                  {s.participants.map((p: any, i: number) => (
                    <li key={i}>
                      {p.name} <span className="text-muted">— {p.email}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "kurse" && (
        <div className="space-y-8">
          <form onSubmit={createCourse} className="rounded-2xl p-5 border border-border bg-surface space-y-3">
            <h3 className="font-display text-lg text-ivory mb-2">Neuen Kurs anlegen</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <input required placeholder="Name (z.B. Beginner 1)" value={newCourse.name}
                onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
              <input placeholder="Level (optional)" value={newCourse.level}
                onChange={(e) => setNewCourse({ ...newCourse, level: e.target.value })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
              <input required placeholder="Kategorie (z.B. Pole, Openclass)" value={newCourse.category}
                onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
              <input placeholder="Trainer:in (optional)" value={newCourse.instructor}
                onChange={(e) => setNewCourse({ ...newCourse, instructor: e.target.value })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
              <select value={newCourse.weekday}
                onChange={(e) => setNewCourse({ ...newCourse, weekday: Number(e.target.value) })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory">
                {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
              <input required type="time" value={newCourse.start_time}
                onChange={(e) => setNewCourse({ ...newCourse, start_time: e.target.value })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
              <input type="number" placeholder="Dauer (Minuten)" value={newCourse.duration_minutes}
                onChange={(e) => setNewCourse({ ...newCourse, duration_minutes: Number(e.target.value) })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
              <input required type="number" placeholder="Kapazität" value={newCourse.capacity}
                onChange={(e) => setNewCourse({ ...newCourse, capacity: Number(e.target.value) })}
                className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
            </div>
            <textarea placeholder="Notizen (optional)" value={newCourse.notes}
              onChange={(e) => setNewCourse({ ...newCourse, notes: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
              {saving ? "Speichere…" : "Kurs anlegen"}
            </button>
          </form>

          <div className="space-y-3">
            <h3 className="font-display text-lg text-ivory">Bestehende Kurse</h3>
            {courses.map((c) => (
              <div key={c.id} className="rounded-2xl p-5 border border-border bg-surface">
                {editingId === c.id ? (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input value={editCourse.name} onChange={(e) => setEditCourse({ ...editCourse, name: e.target.value })}
                        className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
                      <input value={editCourse.level ?? ""} onChange={(e) => setEditCourse({ ...editCourse, level: e.target.value })}
                        placeholder="Level" className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
                      <input value={editCourse.category} onChange={(e) => setEditCourse({ ...editCourse, category: e.target.value })}
                        className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
                      <input value={editCourse.instructor ?? ""} onChange={(e) => setEditCourse({ ...editCourse, instructor: e.target.value })}
                        placeholder="Trainer:in" className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
                      <select value={editCourse.weekday} onChange={(e) => setEditCourse({ ...editCourse, weekday: Number(e.target.value) })}
                        className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory">
                        {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                      </select>
                      <input type="time" value={editCourse.start_time} onChange={(e) => setEditCourse({ ...editCourse, start_time: e.target.value })}
                        className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
                      <input type="number" value={editCourse.duration_minutes} onChange={(e) => setEditCourse({ ...editCourse, duration_minutes: Number(e.target.value) })}
                        className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
                      <input type="number" value={editCourse.capacity} onChange={(e) => setEditCourse({ ...editCourse, capacity: Number(e.target.value) })}
                        className="px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory" />
                    </div>
                    <p className="text-xs text-muted">
                      Hinweis: Wenn du den Wochentag änderst, werden zusätzlich neue Termine für die
                      nächsten 4 Wochen erzeugt. Bereits bestehende Termine am alten Tag bleiben
                      erhalten — die kannst du bei Bedarf einzeln im Tab &quot;Anmeldungen&quot; absagen.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
                        {saving ? "Speichere…" : "Speichern"}
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-display text-lg text-ivory">
                        {c.name} {c.level ? `– ${c.level}` : ""} {!c.active && <span className="text-xs text-wine">(inaktiv)</span>}
                      </h4>
                      <p className="text-xs text-muted mt-1">
                        {WEEKDAYS.find((w) => w.value === c.weekday)?.label} · {c.start_time?.slice(0, 5)} Uhr ·
                        {" "}{c.duration_minutes} Min · Kapazität {c.capacity} · {c.category}
                        {c.instructor ? ` · ${c.instructor}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(c)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">
                        Bearbeiten
                      </button>
                      {c.active && (
                        <button onClick={() => deactivateCourse(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">
                          Deaktivieren
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
