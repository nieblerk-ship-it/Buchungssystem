"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Montag" }, { value: 2, label: "Dienstag" }, { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" }, { value: 5, label: "Freitag" }, { value: 6, label: "Samstag" }, { value: 7, label: "Sonntag" },
];

const COURSE_CATEGORIES = ["Pole", "Exotic Pole", "Openclass", "Conditioning", "Shape & Flexibility", "Specials"];

const EMPTY_COURSE = {
  name: "", category: "Pole", level: "", instructor: "",
  weekday: 1, start_time: "18:00", duration_minutes: 70, capacity: 8, notes: "",
};
const EMPTY_CUSTOMER = { name: "", email: "", phone: "", level: "", notes: "" };
const EMPTY_PRODUCT = {
  name: "", category: "Poledance", price_cents: 0, reduced_price_cents: "", credits: "", valid_days: "",
  allowed_categories: [] as string[], notes: "",
};

const inputClass = "px-4 py-2.5 rounded-xl text-sm bg-bg border border-border text-ivory";

function euro(cents: number) {
  return (cents / 100).toFixed(2) + "€";
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<"anmeldungen" | "kurse" | "schueler" | "produkte">("anmeldungen");
  const [sessions, setSessions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [newCourse, setNewCourse] = useState<any>(EMPTY_COURSE);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourse, setEditCourse] = useState<any>(null);

  const [newCustomer, setNewCustomer] = useState<any>(EMPTY_CUSTOMER);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState<any>({ productId: "", valid_from: "", valid_until: "", credits_total: "", isReduced: false });

  const [newProduct, setNewProduct] = useState<any>(EMPTY_PRODUCT);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<any>(null);

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
    await Promise.all([loadCourses(), loadCustomers(), loadProducts()]);
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
  async function loadCustomers() {
    const res = await fetch(`/api/admin/customers?password=${encodeURIComponent(password)}`);
    const data = await res.json();
    if (res.ok) setCustomers(data.customers);
  }
  async function loadProducts() {
    const res = await fetch(`/api/admin/products?password=${encodeURIComponent(password)}`);
    const data = await res.json();
    if (res.ok) setProducts(data.products);
  }

  // ---- Termine (Anmeldungen) ----
  async function toggleCancelled(sessionId: string, cancelled: boolean) {
    setActionError(null);
    const res = await fetch("/api/admin/sessions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, sessionId, cancelled }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadSessions();
  }
  async function saveBookingNote(bookingId: string, notes: string) {
    setActionError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, bookingId, notes }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler beim Speichern des Kommentars."); return; }
    await loadSessions();
  }

  // ---- Kurse ----
  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/courses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...newCourse }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setNewCourse(EMPTY_COURSE);
    await loadCourses(); await loadSessions();
  }
  function startEditCourse(c: any) { setEditingCourseId(c.id); setEditCourse({ ...c }); }
  async function saveEditCourse() {
    const original = courses.find((c) => c.id === editingCourseId);
    const bigChange = original?.weekday !== editCourse.weekday || original?.start_time !== editCourse.start_time;
    if (bigChange && !confirm(`Du änderst Wochentag/Uhrzeit von "${original?.name}". Für die nächsten 4 Wochen werden zusätzlich Termine am neuen Tag erzeugt, alte Termine bleiben bestehen. Fortfahren?`)) {
      return;
    }
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/courses", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, id: editingCourseId, ...editCourse, regenerate: bigChange }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setEditingCourseId(null);
    await loadCourses(); await loadSessions();
  }
  async function deactivateCourse(id: string, name: string) {
    if (!confirm(`Kurs "${name}" deaktivieren? Er verschwindet von der Buchungsseite, bestehende Termine/Buchungen bleiben erhalten.`)) return;
    setActionError(null);
    const res = await fetch(`/api/admin/courses?password=${encodeURIComponent(password)}&id=${id}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadCourses();
  }

  // ---- Schüler:innen ----
  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...newCustomer }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setNewCustomer(EMPTY_CUSTOMER);
    await loadCustomers();
  }
  function startEditCustomer(c: any) { setEditingCustomerId(c.id); setEditCustomer({ name: c.name, email: c.email, phone: c.phone ?? "", level: c.level ?? "", notes: c.notes ?? "" }); }
  async function saveEditCustomer() {
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/customers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, id: editingCustomerId, ...editCustomer }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setEditingCustomerId(null);
    await loadCustomers();
  }
  async function deleteCustomer(id: string, name: string) {
    if (!confirm(`Schüler:in "${name}" wirklich entfernen? Das löscht auch alle Buchungen und Produktzuweisungen unwiderruflich.`)) return;
    setActionError(null);
    const res = await fetch(`/api/admin/customers?password=${encodeURIComponent(password)}&id=${id}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadCustomers();
  }
  function startAssign(customerId: string) {
    setAssigningFor(customerId);
    setAssignForm({ productId: products[0]?.id ?? "", valid_from: new Date().toISOString().slice(0, 10), valid_until: "", credits_total: "", isReduced: false });
  }
  async function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/customer-products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password, customerId: assigningFor, productId: assignForm.productId,
        valid_from: assignForm.valid_from || undefined,
        valid_until: assignForm.valid_until || undefined,
        credits_total: assignForm.credits_total ? Number(assignForm.credits_total) : undefined,
        isReduced: assignForm.isReduced,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setAssigningFor(null);
    await loadCustomers();
  }
  async function extendProduct(cpId: string, currentUntil: string | null) {
    const input = prompt("Neues Ablaufdatum (JJJJ-MM-TT):", currentUntil ?? new Date().toISOString().slice(0, 10));
    if (!input) return;
    setActionError(null);
    const res = await fetch("/api/admin/customer-products", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, id: cpId, valid_until: input }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadCustomers();
  }
  async function removeCustomerProduct(cpId: string) {
    if (!confirm("Diese Produktzuweisung entfernen?")) return;
    setActionError(null);
    const res = await fetch(`/api/admin/customer-products?password=${encodeURIComponent(password)}&id=${cpId}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadCustomers();
  }

  // ---- Produkte ----
  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password, ...newProduct,
        price_cents: Math.round(Number(newProduct.price_cents) * 100),
        reduced_price_cents: newProduct.reduced_price_cents ? Math.round(Number(newProduct.reduced_price_cents) * 100) : null,
        credits: newProduct.credits ? Number(newProduct.credits) : null,
        valid_days: newProduct.valid_days ? Number(newProduct.valid_days) : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setNewProduct(EMPTY_PRODUCT);
    await loadProducts();
  }
  function startEditProduct(p: any) {
    setEditingProductId(p.id);
    setEditProduct({
      name: p.name, category: p.category,
      price_cents: (p.price_cents / 100).toString(),
      reduced_price_cents: p.reduced_price_cents ? (p.reduced_price_cents / 100).toString() : "",
      credits: p.credits ?? "", valid_days: p.valid_days ?? "",
      allowed_categories: p.allowed_categories ?? [], notes: p.notes ?? "",
    });
  }
  async function saveEditProduct() {
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/products", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password, id: editingProductId, ...editProduct,
        price_cents: Math.round(Number(editProduct.price_cents) * 100),
        reduced_price_cents: editProduct.reduced_price_cents ? Math.round(Number(editProduct.reduced_price_cents) * 100) : null,
        credits: editProduct.credits ? Number(editProduct.credits) : null,
        valid_days: editProduct.valid_days ? Number(editProduct.valid_days) : null,
        allowed_categories: editProduct.allowed_categories?.length ? editProduct.allowed_categories : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setEditingProductId(null);
    await loadProducts();
  }
  async function deactivateProduct(id: string, name: string) {
    if (!confirm(`Produkt "${name}" deaktivieren?`)) return;
    setActionError(null);
    const res = await fetch(`/api/admin/products?password=${encodeURIComponent(password)}&id=${id}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadProducts();
  }
  function toggleCategory(list: string[], cat: string) {
    return list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat];
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <form onSubmit={login} className="w-full max-w-sm space-y-3">
          <Link href="/" className="flex items-center gap-1 text-xs text-muted mb-4"><ArrowLeft size={12} /> Zurück zur Buchungsseite</Link>
          <h1 className="font-display text-2xl mb-4 text-ivory">Admin-Login</h1>
          <input type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full ${inputClass}`} />
          {loginError && <p className="text-xs text-wine">{loginError}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
            {loading ? "Prüfe…" : "Anmelden"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg px-6 py-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-ivory">Admin</h1>
        <Link href="/" className="flex items-center gap-1 text-xs text-muted"><ArrowLeft size={12} /> Zur Buchungsseite</Link>
      </div>

      <nav className="flex gap-1 mb-8 flex-wrap">
        {[
          { id: "anmeldungen", label: "Anmeldungen" },
          { id: "kurse", label: "Kurse verwalten" },
          { id: "schueler", label: "Schüler:innen" },
          { id: "produkte", label: "Produkte" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm rounded-full ${tab === t.id ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}>
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
                  <span className="text-xs text-muted">{s.date} · {s.time?.slice(0, 5)} · {s.participants.length}/{s.capacity}</span>
                  <button onClick={() => toggleCancelled(s.id, !s.cancelled)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">
                    {s.cancelled ? "Wieder aktivieren" : "Termin absagen"}
                  </button>
                </div>
              </div>
              {s.participants.length === 0 ? (
                <p className="text-sm text-muted mt-2">Noch keine Anmeldungen.</p>
              ) : (
                <ul className="mt-2 text-sm text-ivory space-y-2">
                  {s.participants.map((p: any, i: number) => (
                    <li key={i} className="flex items-center gap-1.5 flex-wrap">
                      {p.name} <span className="text-muted">— {p.email}</span>
                      {!p.hasActiveProduct && (
                        <span className="flex items-center gap-1 text-xs text-gold ml-1" title="Kein aktives, passendes Produkt hinterlegt">
                          <AlertTriangle size={12} /> kein aktives Produkt
                        </span>
                      )}
                      <input
                        placeholder="Kommentar (z.B. Zahlung fehlt)"
                        defaultValue={p.notes}
                        onBlur={(e) => { if (e.target.value !== p.notes) saveBookingNote(p.bookingId, e.target.value); }}
                        className="ml-auto text-xs px-2 py-1 rounded-lg bg-bg border border-border text-ivory w-56"
                      />
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
              <input required placeholder="Name (z.B. Beginner 1)" value={newCourse.name} onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })} className={inputClass} />
              <input placeholder="Level (optional)" value={newCourse.level} onChange={(e) => setNewCourse({ ...newCourse, level: e.target.value })} className={inputClass} />
              <select required value={newCourse.category} onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })} className={inputClass}>
                {COURSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input placeholder="Trainer:in (optional)" value={newCourse.instructor} onChange={(e) => setNewCourse({ ...newCourse, instructor: e.target.value })} className={inputClass} />
              <select value={newCourse.weekday} onChange={(e) => setNewCourse({ ...newCourse, weekday: Number(e.target.value) })} className={inputClass}>
                {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
              <input required type="time" value={newCourse.start_time} onChange={(e) => setNewCourse({ ...newCourse, start_time: e.target.value })} className={inputClass} />
              <input type="number" placeholder="Dauer (Minuten)" value={newCourse.duration_minutes} onChange={(e) => setNewCourse({ ...newCourse, duration_minutes: Number(e.target.value) })} className={inputClass} />
              <input required type="number" placeholder="Kapazität" value={newCourse.capacity} onChange={(e) => setNewCourse({ ...newCourse, capacity: Number(e.target.value) })} className={inputClass} />
            </div>
            <textarea placeholder="Notizen (optional)" value={newCourse.notes} onChange={(e) => setNewCourse({ ...newCourse, notes: e.target.value })} className={`w-full ${inputClass}`} />
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
              {saving ? "Speichere…" : "Kurs anlegen"}
            </button>
          </form>

          <div className="space-y-3">
            <h3 className="font-display text-lg text-ivory">Bestehende Kurse</h3>
            {courses.map((c) => (
              <div key={c.id} className="rounded-2xl p-5 border border-border bg-surface">
                {editingCourseId === c.id ? (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input value={editCourse.name} onChange={(e) => setEditCourse({ ...editCourse, name: e.target.value })} className={inputClass} />
                      <input value={editCourse.level ?? ""} onChange={(e) => setEditCourse({ ...editCourse, level: e.target.value })} placeholder="Level" className={inputClass} />
                      <select value={editCourse.category} onChange={(e) => setEditCourse({ ...editCourse, category: e.target.value })} className={inputClass}>
                        {COURSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <input value={editCourse.instructor ?? ""} onChange={(e) => setEditCourse({ ...editCourse, instructor: e.target.value })} placeholder="Trainer:in" className={inputClass} />
                      <select value={editCourse.weekday} onChange={(e) => setEditCourse({ ...editCourse, weekday: Number(e.target.value) })} className={inputClass}>
                        {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                      </select>
                      <input type="time" value={editCourse.start_time} onChange={(e) => setEditCourse({ ...editCourse, start_time: e.target.value })} className={inputClass} />
                      <input type="number" value={editCourse.duration_minutes} onChange={(e) => setEditCourse({ ...editCourse, duration_minutes: Number(e.target.value) })} className={inputClass} />
                      <input type="number" value={editCourse.capacity} onChange={(e) => setEditCourse({ ...editCourse, capacity: Number(e.target.value) })} className={inputClass} />
                    </div>
                    <p className="text-xs text-muted">
                      Bei Änderung von Wochentag/Uhrzeit wirst du vor dem Speichern nochmal gefragt.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={saveEditCourse} disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Speichern"}</button>
                      <button onClick={() => setEditingCourseId(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-display text-lg text-ivory">{c.name} {c.level ? `– ${c.level}` : ""} {!c.active && <span className="text-xs text-wine">(inaktiv)</span>}</h4>
                      <p className="text-xs text-muted mt-1">
                        {WEEKDAYS.find((w) => w.value === c.weekday)?.label} · {c.start_time?.slice(0, 5)} Uhr · {c.duration_minutes} Min · Kapazität {c.capacity} · {c.category}{c.instructor ? ` · ${c.instructor}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEditCourse(c)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">Bearbeiten</button>
                      {c.active && <button onClick={() => deactivateCourse(c.id, c.name)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">Deaktivieren</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "schueler" && (
        <div className="space-y-8">
          <form onSubmit={createCustomer} className="rounded-2xl p-5 border border-border bg-surface space-y-3">
            <h3 className="font-display text-lg text-ivory mb-2">Neue:n Schüler:in anlegen</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <input required placeholder="Name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className={inputClass} />
              <input required type="email" placeholder="E-Mail" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={inputClass} />
              <input placeholder="Telefon (optional)" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={inputClass} />
              <input placeholder="Level (optional)" value={newCustomer.level} onChange={(e) => setNewCustomer({ ...newCustomer, level: e.target.value })} className={inputClass} />
            </div>
            <textarea placeholder="Notizen (optional)" value={newCustomer.notes} onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })} className={`w-full ${inputClass}`} />
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Anlegen"}</button>
          </form>

          <div className="space-y-3">
            <h3 className="font-display text-lg text-ivory">Alle Schüler:innen</h3>
            {customers.map((c) => (
              <div key={c.id} className="rounded-2xl p-5 border border-border bg-surface">
                {editingCustomerId === c.id ? (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input value={editCustomer.name} onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })} className={inputClass} />
                      <input value={editCustomer.email} onChange={(e) => setEditCustomer({ ...editCustomer, email: e.target.value })} className={inputClass} />
                      <input value={editCustomer.phone} onChange={(e) => setEditCustomer({ ...editCustomer, phone: e.target.value })} placeholder="Telefon" className={inputClass} />
                      <input value={editCustomer.level} onChange={(e) => setEditCustomer({ ...editCustomer, level: e.target.value })} placeholder="Level" className={inputClass} />
                    </div>
                    <textarea value={editCustomer.notes} onChange={(e) => setEditCustomer({ ...editCustomer, notes: e.target.value })} placeholder="Notizen" className={`w-full ${inputClass}`} />
                    <div className="flex gap-2">
                      <button onClick={saveEditCustomer} disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Speichern"}</button>
                      <button onClick={() => setEditingCustomerId(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="font-display text-lg text-ivory">{c.name} {c.level ? <span className="text-xs text-muted">· {c.level}</span> : null}</h4>
                        <p className="text-xs text-muted">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startAssign(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Produkt zuweisen</button>
                        <button onClick={() => startEditCustomer(c)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">Bearbeiten</button>
                        <button onClick={() => deleteCustomer(c.id, c.name)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">Entfernen</button>
                      </div>
                    </div>

                    {c.customer_products?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {c.customer_products.filter((cp: any) => cp.active).map((cp: any) => (
                          <li key={cp.id} className="text-xs text-ivory flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full bg-bg border border-border">{cp.product?.name}{cp.is_reduced ? " (ermäßigt)" : ""}</span>
                            <span className="text-muted">
                              {cp.valid_from} – {cp.valid_until ?? "unbegrenzt"}
                              {cp.credits_total ? ` · ${cp.credits_remaining ?? cp.credits_total}/${cp.credits_total} Guthaben` : ""}
                            </span>
                            <button onClick={() => extendProduct(cp.id, cp.valid_until)} className="text-gold underline">verlängern</button>
                            <button onClick={() => removeCustomerProduct(cp.id)} className="text-wine underline">entfernen</button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {assigningFor === c.id && (
                      <form onSubmit={submitAssign} className="mt-3 p-3 rounded-xl bg-bg border border-border space-y-2">
                        <div className="grid sm:grid-cols-2 gap-2">
                          <select value={assignForm.productId} onChange={(e) => setAssignForm({ ...assignForm, productId: e.target.value })} className={inputClass}>
                            {products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} ({euro(p.price_cents)})</option>)}
                          </select>
                          <input type="date" value={assignForm.valid_from} onChange={(e) => setAssignForm({ ...assignForm, valid_from: e.target.value })} className={inputClass} />
                          <input type="date" placeholder="Ablauf (optional, sonst automatisch)" value={assignForm.valid_until} onChange={(e) => setAssignForm({ ...assignForm, valid_until: e.target.value })} className={inputClass} />
                          <input type="number" placeholder="Guthaben (optional, sonst vom Produkt)" value={assignForm.credits_total} onChange={(e) => setAssignForm({ ...assignForm, credits_total: e.target.value })} className={inputClass} />
                        </div>
                        <p className="text-xs text-muted">Auch rückwirkend oder mit abgelaufenem Datum möglich.</p>
                        <label className="flex items-center gap-2 text-sm text-ivory">
                          <input type="checkbox" checked={assignForm.isReduced} onChange={(e) => setAssignForm({ ...assignForm, isReduced: e.target.checked })} />
                          Ermäßigt (Studierende/Ausbildung) — Nachweis liegt vor
                        </label>
                        <div className="flex gap-2">
                          <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Zuweisen"}</button>
                          <button type="button" onClick={() => setAssigningFor(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">Abbrechen</button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "produkte" && (
        <div className="space-y-8">
          <form onSubmit={createProduct} className="rounded-2xl p-5 border border-border bg-surface space-y-3">
            <h3 className="font-display text-lg text-ivory mb-2">Neues Produkt anlegen</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <input required placeholder="Name (z.B. 10er Karte)" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className={inputClass} />
              <input required placeholder="Kategorie (z.B. Poledance, Kursabo)" value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} className={inputClass} />
              <input required type="number" step="0.01" placeholder="Preis in €" value={newProduct.price_cents} onChange={(e) => setNewProduct({ ...newProduct, price_cents: e.target.value })} className={inputClass} />
              <input type="number" step="0.01" placeholder="Ermäßigter Preis in € (optional)" value={newProduct.reduced_price_cents} onChange={(e) => setNewProduct({ ...newProduct, reduced_price_cents: e.target.value })} className={inputClass} />
              <input type="number" placeholder="Guthaben (leer = unbegrenzt)" value={newProduct.credits} onChange={(e) => setNewProduct({ ...newProduct, credits: e.target.value })} className={inputClass} />
              <input type="number" placeholder="Gültigkeit in Tagen (leer = unbegrenzt)" value={newProduct.valid_days} onChange={(e) => setNewProduct({ ...newProduct, valid_days: e.target.value })} className={inputClass} />
            </div>
            <div>
              <p className="text-xs text-muted mb-2">Buchbar für Kurs-Kategorien (keine Auswahl = alle):</p>
              <div className="flex flex-wrap gap-2">
                {COURSE_CATEGORIES.map((cat) => (
                  <button type="button" key={cat}
                    onClick={() => setNewProduct({ ...newProduct, allowed_categories: toggleCategory(newProduct.allowed_categories, cat) })}
                    className={`text-xs px-3 py-1.5 rounded-full border ${newProduct.allowed_categories.includes(cat) ? "bg-gold text-bg border-gold" : "border-border text-muted"}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <textarea placeholder="Notizen (optional)" value={newProduct.notes} onChange={(e) => setNewProduct({ ...newProduct, notes: e.target.value })} className={`w-full ${inputClass}`} />
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Produkt anlegen"}</button>
          </form>

          <div className="space-y-3">
            <h3 className="font-display text-lg text-ivory">Bestehende Produkte</h3>
            {products.map((p) => (
              <div key={p.id} className="rounded-2xl p-5 border border-border bg-surface">
                {editingProductId === p.id ? (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input value={editProduct.name} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} className={inputClass} />
                      <input value={editProduct.category} onChange={(e) => setEditProduct({ ...editProduct, category: e.target.value })} className={inputClass} />
                      <input type="number" step="0.01" placeholder="Preis in €" value={editProduct.price_cents} onChange={(e) => setEditProduct({ ...editProduct, price_cents: e.target.value })} className={inputClass} />
                      <input type="number" step="0.01" placeholder="Ermäßigter Preis in €" value={editProduct.reduced_price_cents} onChange={(e) => setEditProduct({ ...editProduct, reduced_price_cents: e.target.value })} className={inputClass} />
                      <input type="number" placeholder="Guthaben" value={editProduct.credits} onChange={(e) => setEditProduct({ ...editProduct, credits: e.target.value })} className={inputClass} />
                      <input type="number" placeholder="Gültigkeit in Tagen" value={editProduct.valid_days} onChange={(e) => setEditProduct({ ...editProduct, valid_days: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <p className="text-xs text-muted mb-2">Buchbar für Kurs-Kategorien (keine Auswahl = alle):</p>
                      <div className="flex flex-wrap gap-2">
                        {COURSE_CATEGORIES.map((cat) => (
                          <button type="button" key={cat}
                            onClick={() => setEditProduct({ ...editProduct, allowed_categories: toggleCategory(editProduct.allowed_categories, cat) })}
                            className={`text-xs px-3 py-1.5 rounded-full border ${editProduct.allowed_categories.includes(cat) ? "bg-gold text-bg border-gold" : "border-border text-muted"}`}>
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea value={editProduct.notes} onChange={(e) => setEditProduct({ ...editProduct, notes: e.target.value })} placeholder="Notizen" className={`w-full ${inputClass}`} />
                    <div className="flex gap-2">
                      <button onClick={saveEditProduct} disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Speichern"}</button>
                      <button onClick={() => setEditingProductId(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">Abbrechen</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-display text-lg text-ivory">{p.name} {!p.active && <span className="text-xs text-wine">(inaktiv)</span>}</h4>
                      <p className="text-xs text-muted mt-1">
                        {p.category} · {euro(p.price_cents)}{p.reduced_price_cents ? ` (ermäßigt ${euro(p.reduced_price_cents)})` : ""}
                        {p.credits ? ` · ${p.credits} Einheiten` : " · unbegrenzt"}{p.valid_days ? ` · ${p.valid_days} Tage gültig` : ""}
                      </p>
                      {p.allowed_categories?.length > 0 && (
                        <p className="text-xs text-muted mt-1">Nur für: {p.allowed_categories.join(", ")}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEditProduct(p)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">Bearbeiten</button>
                      {p.active && <button onClick={() => deactivateProduct(p.id, p.name)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">Deaktivieren</button>}
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
