"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = [
  { value: 1, label: "Montag" }, { value: 2, label: "Dienstag" }, { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" }, { value: 5, label: "Freitag" }, { value: 6, label: "Samstag" }, { value: 7, label: "Sonntag" },
];
const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_LABEL = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const COURSE_CATEGORIES = ["Pole", "Exotic Pole", "Openclass", "Conditioning", "Shape & Flexibility", "Specials"];
const ROOMS = ["OC", "Raum 1", "Raum 2", "Raum 3"];

const EMPTY_COURSE = {
  name: "", category: "Pole", level: "", instructor: "", room: ROOMS[0],
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

// ---- Datumshilfen für die Wochenansicht (wie auf der Buchungsseite) ----
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

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<"anmeldungen" | "kurse" | "schueler" | "produkte" | "meldungen">("anmeldungen");
  const [alertFilter, setAlertFilter] = useState<"alle" | "rot" | "gelb">("alle");

  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => getMonday(today), [today]);
  const [weekStart, setWeekStart] = useState<Date>(currentWeekStart);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
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

  const [accessPanelFor, setAccessPanelFor] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [overrideForm, setOverrideForm] = useState<any>({ courseId: "", access: "allow", notes: "" });

  const [enrollPanelFor, setEnrollPanelFor] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [enrollForm, setEnrollForm] = useState<any>({ courseId: "", valid_from: "", valid_until: "", notes: "" });

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
  async function saveBookingProduct(bookingId: string, customerProductId: string) {
    setActionError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, bookingId, customerProductId }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler beim Zuordnen des Produkts."); return; }
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

  // ---- Kurs-Freigaben ----
  async function openAccessPanel(customerId: string) {
    setAccessPanelFor(customerId);
    setEnrollPanelFor(null);
    setOverrideForm({ courseId: courses.find((c) => c.active)?.id ?? "", access: "allow", notes: "" });
    const res = await fetch(`/api/admin/course-access?password=${encodeURIComponent(password)}&customerId=${customerId}`);
    const data = await res.json();
    if (res.ok) setOverrides(data.overrides);
  }
  async function submitOverride(e: React.FormEvent) {
    e.preventDefault();
    if (overrideForm.access === "deny" && !confirm("Diese Person wird damit von der Buchung dieses Kurses ausgeschlossen — auch wenn ein passendes Produkt vorliegt. Fortfahren?")) {
      return;
    }
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/course-access", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, customerId: accessPanelFor, ...overrideForm }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    await openAccessPanel(accessPanelFor!);
  }
  async function removeOverride(id: string) {
    setActionError(null);
    const res = await fetch(`/api/admin/course-access?password=${encodeURIComponent(password)}&id=${id}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await openAccessPanel(accessPanelFor!);
  }

  // ---- Feste Zuteilung ----
  async function openEnrollPanel(customerId: string) {
    setEnrollPanelFor(customerId);
    setAccessPanelFor(null);
    setEnrollForm({ courseId: courses.find((c) => c.active)?.id ?? "", valid_from: new Date().toISOString().slice(0, 10), valid_until: "", notes: "" });
    const res = await fetch(`/api/admin/enrollments?password=${encodeURIComponent(password)}&customerId=${customerId}`);
    const data = await res.json();
    if (res.ok) setEnrollments(data.enrollments);
  }
  async function submitEnrollment(e: React.FormEvent) {
    e.preventDefault();
    const course = courses.find((c) => c.id === enrollForm.courseId);
    if (!confirm(`"${course?.name}" fest für diese:n Schüler:in eintragen? Dabei werden alle passenden künftigen Termine sofort automatisch gebucht — auch wenn sie eigentlich schon voll sind. Fortfahren?`)) return;
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/enrollments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, customerId: enrollPanelFor, ...enrollForm }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    await openEnrollPanel(enrollPanelFor!);
    await loadSessions();
  }
  async function removeEnrollment(id: string) {
    if (!confirm("Diese feste Zuteilung beenden? Bereits gebuchte Termine bleiben bestehen und müssten separat im Reiter \"Anmeldungen\" entfernt werden.")) return;
    setActionError(null);
    const res = await fetch(`/api/admin/enrollments?password=${encodeURIComponent(password)}&id=${id}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await openEnrollPanel(enrollPanelFor!);
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
          { id: "meldungen", label: "Meldungen" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm rounded-full ${tab === t.id ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {actionError && <p className="text-sm text-wine mb-4">{actionError}</p>}

      {tab === "anmeldungen" && (() => {
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

        return (
          <div>
            <div className="flex items-center justify-center gap-3 mb-8">
              <button
                onClick={() => setWeekStart(getMonday(addDays(weekStart, -7)))}
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
                      {WEEKDAY_SHORT.map((d) => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {pickerGrid.map((d, i) => {
                        const inMonth = d.getMonth() === pickerMonth.getMonth();
                        const isToday = isSameDay(d, today);
                        return (
                          <button
                            key={i}
                            onClick={() => { setWeekStart(getMonday(d)); setShowPicker(false); }}
                            className={`text-xs py-1.5 rounded-lg ${isToday ? "bg-gold text-bg font-semibold" : inMonth ? "text-ivory hover:bg-bg" : "text-muted/40 hover:bg-bg"}`}
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
                onClick={() => setWeekStart(getMonday(addDays(weekStart, 7)))}
                className="p-2 rounded-full border border-border text-muted hover:text-gold"
                aria-label="Nächste Woche"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="overflow-x-auto" onClick={() => showPicker && setShowPicker(false)}>
              <div className="grid grid-cols-7 gap-3 min-w-[900px]">
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
                          const overbooked = s.participants.length > s.capacity;
                          const isSelected = s.id === selectedSessionId;
                          return (
                            <button
                              key={s.id}
                              onClick={() => setSelectedSessionId(isSelected ? null : s.id)}
                              className={`w-full text-left rounded-xl p-3 border text-xs transition-colors ${
                                overbooked ? "border-2 border-red-500" : isSelected ? "border-gold" : "border-border"
                              } bg-surface ${isSelected ? "ring-1 ring-gold" : ""}`}
                            >
                              <div className="text-ivory font-medium">{s.courseName}</div>
                              {s.room && <div className="text-muted mt-0.5">{s.room}</div>}
                              <div className={`mt-1 ${overbooked ? "text-red-500 font-bold" : "text-muted"}`}>
                                {s.time?.slice(0, 5)} · {s.participants.length}/{s.capacity}{overbooked ? " ÜBERBUCHT" : ""}
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
              <div className={`mt-8 rounded-2xl p-5 border bg-surface ${selectedSession.participants.length > selectedSession.capacity ? "border-2 border-red-500" : "border-border"}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-display text-lg text-ivory">
                    {selectedSession.courseName} {selectedSession.level ? `– ${selectedSession.level}` : ""} {selectedSession.room ? <span className="text-xs text-muted">· {selectedSession.room}</span> : null}
                    {selectedSession.cancelled && <span className="ml-2 text-xs text-wine">(abgesagt)</span>}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${selectedSession.participants.length > selectedSession.capacity ? "text-red-500 font-bold" : "text-muted"}`}>
                      {selectedSession.date} · {selectedSession.time?.slice(0, 5)} · {selectedSession.participants.length}/{selectedSession.capacity}
                      {selectedSession.participants.length > selectedSession.capacity ? " ÜBERBUCHT" : ""}
                    </span>
                    <button onClick={() => toggleCancelled(selectedSession.id, !selectedSession.cancelled)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">
                      {selectedSession.cancelled ? "Wieder aktivieren" : "Termin absagen"}
                    </button>
                    <button onClick={() => setSelectedSessionId(null)} className="text-xs text-muted underline">Schließen</button>
                  </div>
                </div>
                {selectedSession.participants.length === 0 ? (
                  <p className="text-sm text-muted mt-2">Noch keine Anmeldungen.</p>
                ) : (
                  <ul className="mt-3 text-sm text-ivory space-y-2">
                    {selectedSession.participants.map((p: any, i: number) => (
                      <li key={i} className="flex items-center gap-1.5 flex-wrap">
                        {p.name} <span className="text-muted">— {p.email}</span>
                        {p.source === "enrollment" && (
                          <span className="text-xs px-2 py-0.5 rounded-full border border-gold text-gold">Fest zugeteilt</span>
                        )}
                        {!p.hasActiveProduct && (
                          <span className="flex items-center gap-1 text-xs text-gold ml-1" title="Kein aktives, passendes Produkt hinterlegt">
                            <AlertTriangle size={12} /> kein aktives Produkt
                          </span>
                        )}
                        {p.availableProducts?.length > 0 && (
                          <select
                            defaultValue={p.customerProductId ?? ""}
                            onChange={(e) => saveBookingProduct(p.bookingId, e.target.value)}
                            className="text-xs px-2 py-1 rounded-lg bg-bg border border-border text-ivory"
                          >
                            <option value="">Produkt zuordnen…</option>
                            {p.availableProducts.map((prod: any) => <option key={prod.id} value={prod.id}>{prod.name}</option>)}
                          </select>
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
            )}
          </div>
        );
      })()}

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
              <select value={newCourse.room} onChange={(e) => setNewCourse({ ...newCourse, room: e.target.value })} className={inputClass}>
                {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
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
                      <select value={editCourse.room ?? ROOMS[0]} onChange={(e) => setEditCourse({ ...editCourse, room: e.target.value })} className={inputClass}>
                        {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
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
                        {WEEKDAYS.find((w) => w.value === c.weekday)?.label} · {c.start_time?.slice(0, 5)} Uhr · {c.duration_minutes} Min · Kapazität {c.capacity} · {c.category}{c.room ? ` · ${c.room}` : ""}{c.instructor ? ` · ${c.instructor}` : ""}
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
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => startAssign(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Produkt zuweisen</button>
                        <button onClick={() => openAccessPanel(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Freigaben</button>
                        <button onClick={() => openEnrollPanel(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Feste Zuteilung</button>
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

                    {accessPanelFor === c.id && (
                      <div className="mt-3 p-3 rounded-xl bg-bg border border-border space-y-3">
                        <p className="text-xs text-muted">
                          Ohne Eintrag hier gilt die Standardregel: Zugriff über ein aktives, passendes Produkt.
                          Eine Freigabe erlaubt den Kurs unabhängig vom Produkt, eine Sperre blockiert ihn unabhängig vom Produkt.
                        </p>
                        {overrides.length > 0 && (
                          <ul className="space-y-1.5">
                            {overrides.map((o: any) => (
                              <li key={o.id} className="text-xs text-ivory flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full border ${o.access === "allow" ? "border-gold text-gold" : "border-wine text-wine"}`}>
                                  {o.access === "allow" ? "Freigegeben" : "Gesperrt"}
                                </span>
                                {o.course?.name}
                                <button onClick={() => removeOverride(o.id)} className="text-wine underline">entfernen</button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <form onSubmit={submitOverride} className="grid sm:grid-cols-3 gap-2">
                          <select value={overrideForm.courseId} onChange={(e) => setOverrideForm({ ...overrideForm, courseId: e.target.value })} className={inputClass}>
                            {courses.filter((co) => co.active).map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
                          </select>
                          <select value={overrideForm.access} onChange={(e) => setOverrideForm({ ...overrideForm, access: e.target.value })} className={inputClass}>
                            <option value="allow">Freigeben</option>
                            <option value="deny">Sperren</option>
                          </select>
                          <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Setzen"}</button>
                        </form>
                        <button type="button" onClick={() => setAccessPanelFor(null)} className="text-xs text-muted underline">Schließen</button>
                      </div>
                    )}

                    {enrollPanelFor === c.id && (
                      <div className="mt-3 p-3 rounded-xl bg-bg border border-border space-y-3">
                        <p className="text-xs text-muted">
                          Trägt die Person automatisch in alle passenden künftigen Termine dieses Kurses ein — ohne eigene Buchung.
                        </p>
                        {enrollments.filter((en: any) => en.active).length > 0 && (
                          <ul className="space-y-1.5">
                            {enrollments.filter((en: any) => en.active).map((en: any) => (
                              <li key={en.id} className="text-xs text-ivory flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full bg-surface border border-border">{en.course?.name}</span>
                                <span className="text-muted">{en.valid_from} – {en.valid_until ?? "bis auf Weiteres"}</span>
                                <button onClick={() => removeEnrollment(en.id)} className="text-wine underline">beenden</button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <form onSubmit={submitEnrollment} className="grid sm:grid-cols-3 gap-2">
                          <select value={enrollForm.courseId} onChange={(e) => setEnrollForm({ ...enrollForm, courseId: e.target.value })} className={inputClass}>
                            {courses.filter((co) => co.active).map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
                          </select>
                          <input type="date" value={enrollForm.valid_from} onChange={(e) => setEnrollForm({ ...enrollForm, valid_from: e.target.value })} className={inputClass} />
                          <input type="date" placeholder="Bis (optional)" value={enrollForm.valid_until} onChange={(e) => setEnrollForm({ ...enrollForm, valid_until: e.target.value })} className={inputClass} />
                          <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60 sm:col-span-3">{saving ? "Trage ein…" : "Fest zuteilen"}</button>
                        </form>
                        <button type="button" onClick={() => setEnrollPanelFor(null)} className="text-xs text-muted underline">Schließen</button>
                      </div>
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

      {tab === "meldungen" && (() => {
        const alerts: { severity: "rot" | "gelb"; type: string; message: string; key: string }[] = [];
        sessions.forEach((s) => {
          if (s.participants.length > s.capacity) {
            alerts.push({
              severity: "rot", type: "Überbuchung",
              message: `${s.courseName} am ${s.date} (${s.time?.slice(0, 5)}): ${s.participants.length}/${s.capacity} Plätze belegt`,
              key: `ob-${s.id}`,
            });
          }
          s.participants.forEach((p: any, i: number) => {
            if (p.notes) {
              alerts.push({ severity: "gelb", type: "Kommentar", message: `${p.name} – ${s.courseName} (${s.date}): "${p.notes}"`, key: `note-${s.id}-${i}` });
            }
            if (!p.hasActiveProduct) {
              alerts.push({ severity: "gelb", type: "Kein aktives Produkt", message: `${p.name} – ${s.courseName} (${s.date})`, key: `prod-${s.id}-${i}` });
            }
          });
        });
        const filtered = alerts.filter((a) => alertFilter === "alle" || a.severity === alertFilter);
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(["alle", "rot", "gelb"] as const).map((f) => (
                <button key={f} onClick={() => setAlertFilter(f)}
                  className={`px-4 py-2 text-sm rounded-full ${alertFilter === f ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}>
                  {f === "alle" ? "Alle" : f === "rot" ? "Rot" : "Gelb"}
                </button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted">Keine Meldungen.</p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((a) => (
                  <li key={a.key} className={`rounded-xl p-4 border-l-4 bg-surface text-sm text-ivory ${a.severity === "rot" ? "border-red-500" : "border-yellow-400"}`}>
                    <span className={`text-xs font-semibold mr-2 ${a.severity === "rot" ? "text-red-500" : "text-yellow-400"}`}>{a.type}</span>
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}
    </div>
  );
}
