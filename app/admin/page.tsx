"use client";

import { useEffect, useMemo, useState } from "react";
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
  courseTypeId: "", newTypeName: "", category: "Pole", level: "", instructor: "",
  room: ROOMS[0], trainer_id: "", isSingle: false, singleDate: "",
  weekday: 1, startDate: "", endDate: "",
  start_time: "18:00", duration_minutes: 70, capacity: 8, notes: "",
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

function confirmedCount(s: any) {
  return (s.participants ?? []).filter((p: any) => p.status === "confirmed").length;
}
function waitlistCount(s: any) {
  return (s.participants ?? []).filter((p: any) => p.status === "waitlisted").length;
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
  const [unlocked, setUnlocked] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [adminName, setAdminName] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<"anmeldungen" | "schueler" | "produkte" | "meldungen" | "trainer" | "log" | "einstellungen">("anmeldungen");
  const [alertFilter, setAlertFilter] = useState<"alle" | "rot" | "gelb">("alle");
  const [hiddenAlertTypes, setHiddenAlertTypes] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [newTrainer, setNewTrainer] = useState({ name: "", email: "", newPassword: "" });
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  const today = useMemo(() => new Date(), []);
  const currentWeekStart = useMemo(() => getMonday(today), [today]);
  const [weekStart, setWeekStart] = useState<Date>(currentWeekStart);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [rosterEditingFor, setRosterEditingFor] = useState<string | null>(null);
  const [rosterEntries, setRosterEntries] = useState<any[]>([]);
  const [rosterNewName, setRosterNewName] = useState("");
  const [rosterNewEmail, setRosterNewEmail] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [newCourse, setNewCourse] = useState<any>(EMPTY_COURSE);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [courseTypes, setCourseTypes] = useState<any[]>([]);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourse, setEditCourse] = useState<any>(null);

  const [newCustomer, setNewCustomer] = useState<any>(EMPTY_CUSTOMER);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState<any>({ productId: "", valid_from: "", valid_until: "", credits_total: "", isReduced: false });

  const [accessPanelFor, setAccessPanelFor] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [overrideForm, setOverrideForm] = useState<any>({ courseTypeId: "", access: "allow", notes: "" });

  const [historyForCustomerId, setHistoryForCustomerId] = useState<string | null>(null);
  const [historyBookings, setHistoryBookings] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docForm, setDocForm] = useState<any>({ title: "", docType: "Ermäßigungsnachweis", validFrom: "", validUntil: "", notes: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [retentionDays, setRetentionDays] = useState(90);
  const [archiveDialog, setArchiveDialog] = useState<{ id: string; name: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    action: () => void | Promise<void>;
  } | null>(null);

  function askConfirm(title: string, message: string, confirmLabel: string, action: () => void | Promise<void>, danger = false) {
    setConfirmDialog({ title, message, confirmLabel, danger, action });
  }
  async function runConfirm() {
    if (!confirmDialog) return;
    const act = confirmDialog.action;
    setConfirmDialog(null);
    await act();
  }
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewDate, setRenewDate] = useState("");
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [reactivateDate, setReactivateDate] = useState("");

  const [enrollPanelFor, setEnrollPanelFor] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [enrollForm, setEnrollForm] = useState<any>({ courseId: "", valid_from: "", valid_until: "", notes: "" });

  const [newProduct, setNewProduct] = useState<any>(EMPTY_PRODUCT);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<any>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [logEntries, setLogEntries] = useState<any[]>([]);
  const [logAdmins, setLogAdmins] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState({ from: "", to: "", adminId: "", entityType: "", search: "" });
  const [logLoading, setLogLoading] = useState(false);

  async function loadAll() {
    await Promise.all([loadSessions(), loadCourses(), loadCustomers(), loadProducts(), loadTrainers(), loadCourseTypes(), loadSettings()]);
  }

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/me");
      if (res.ok) {
        const data = await res.json();
        setAdminName(data.admin.name);
        setUnlocked(true);
        await loadAll();
      }
      setCheckingSession(false);
    })();
  }, []);

  useEffect(() => {
    if (tab === "log" && unlocked) loadLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setLoginError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginForm),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setLoginError(data.error ?? "Fehler beim Login.");
      return;
    }
    setAdminName(data.name);
    setUnlocked(true);
    await loadAll();
  }
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setUnlocked(false);
    setAdminName("");
    setLoginForm({ email: "", password: "" });
  }

  async function loadSessions() {
    const res = await fetch(`/api/admin/bookings`);
    const data = await res.json();
    if (res.ok) setSessions(data.sessions);
  }
  async function loadCourses() {
    const res = await fetch(`/api/admin/courses`);
    const data = await res.json();
    if (res.ok) setCourses(data.courses);
  }
  async function loadCustomers(archived?: boolean) {
    const arch = archived ?? showArchive;
    const res = await fetch(`/api/admin/customers${arch ? "?archived=1" : ""}`);
    const data = await res.json();
    if (res.ok) {
      setCustomers(data.customers);
      if (data.retentionDays) setRetentionDays(data.retentionDays);
    }
  }
  async function switchArchiveView(archived: boolean) {
    setShowArchive(archived);
    await loadCustomers(archived);
  }
  async function loadProducts() {
    const res = await fetch(`/api/admin/products`);
    const data = await res.json();
    if (res.ok) setProducts(data.products);
  }
  async function loadTrainers() {
    const res = await fetch(`/api/admin/trainers`);
    const data = await res.json();
    if (res.ok) setTrainers(data.trainers);
  }
  async function loadSettings() {
    const res = await fetch(`/api/admin/settings`);
    const data = await res.json();
    if (res.ok) { setSettings(data.settings); setSettingsForm(data.settings); }
  }
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsForm),
    });
    setSaving(false);
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadSettings();
  }

  async function loadCourseTypes() {
    const res = await fetch(`/api/admin/course-types`);
    const data = await res.json();
    if (res.ok) setCourseTypes(data.courseTypes);
  }
  async function loadLog() {
    setLogLoading(true);
    const params = new URLSearchParams();
    if (logFilter.from) params.set("from", logFilter.from);
    if (logFilter.to) params.set("to", logFilter.to);
    if (logFilter.adminId) params.set("adminId", logFilter.adminId);
    if (logFilter.entityType) params.set("entityType", logFilter.entityType);
    if (logFilter.search) params.set("search", logFilter.search);
    const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
    const data = await res.json();
    setLogLoading(false);
    if (res.ok) { setLogEntries(data.entries); setLogAdmins(data.admins); }
  }
  function exportLog() {
    const params = new URLSearchParams();
    if (logFilter.from) params.set("from", logFilter.from);
    if (logFilter.to) params.set("to", logFilter.to);
    if (logFilter.adminId) params.set("adminId", logFilter.adminId);
    if (logFilter.entityType) params.set("entityType", logFilter.entityType);
    if (logFilter.search) params.set("search", logFilter.search);
    window.location.href = `/api/admin/audit-log/export?${params.toString()}`;
  }

  // ---- Termine (Anmeldungen) ----
  async function toggleCancelled(sessionId: string, cancelled: boolean) {
    setActionError(null);
    const res = await fetch("/api/admin/sessions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, cancelled }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadSessions();
  }
  async function toggleTrainerRequired(courseTypeId: string, trainer_required: boolean) {
    setActionError(null);
    const res = await fetch("/api/admin/course-types", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: courseTypeId, trainer_required }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadCourseTypes(); await loadSessions();
  }
  async function saveBookingNote(bookingId: string, notes: string) {
    setActionError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, notes }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler beim Speichern des Kommentars."); return; }
    await loadSessions();
  }
  async function saveBookingProduct(bookingId: string, customerProductId: string) {
    setActionError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, customerProductId }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler beim Zuordnen des Produkts."); return; }
    await loadSessions();
  }
  async function saveAttendance(bookingId: string, attended: boolean | null) {
    setActionError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, attended }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler beim Speichern der Anwesenheit."); return; }
    await loadSessions();
  }
  function cancelBooking(bookingId: string, name: string) {
    askConfirm(
      "Buchung stornieren",
      `Buchung von "${name}" stornieren? Ist noch jemand auf der Warteliste, rückt automatisch die nächste Person nach.`,
      "Stornieren",
      async () => {
        setActionError(null);
        const res = await fetch("/api/admin/bookings", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, status: "cancelled" }),
        });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        await loadSessions();
      },
      true
    );
  }
  async function promoteBooking(bookingId: string) {
    setActionError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "confirmed" }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadSessions();
  }

  // ---- Teilnehmer verwalten (Roster-Editor) ----
  function openRosterEditor(session: any) {
    setRosterEditingFor(session.id);
    setRosterEntries(
      session.participants.map((p: any) => ({
        key: p.bookingId,
        bookingId: p.bookingId,
        name: p.name,
        email: p.email,
        targetStatus: p.status,
      }))
    );
    setRosterNewName(""); setRosterNewEmail(""); setRosterSearch("");
  }
  function updateRosterEntry(key: string, targetStatus: string) {
    setRosterEntries((prev) => prev.map((e) => (e.key === key ? { ...e, targetStatus } : e)));
  }
  function addExistingToRoster(customerId: string) {
    const c = customers.find((cu) => cu.id === customerId);
    if (!c) return;
    if (rosterEntries.some((e) => e.email === c.email)) return;
    setRosterEntries((prev) => [...prev, { key: `new-${customerId}`, customerId, name: c.name, email: c.email, targetStatus: "confirmed" }]);
  }
  function addNewToRoster() {
    if (!rosterNewName.trim() || !rosterNewEmail.trim()) return;
    if (rosterEntries.some((e) => e.email.toLowerCase() === rosterNewEmail.trim().toLowerCase())) return;
    setRosterEntries((prev) => [...prev, {
      key: `new-${Date.now()}`, newCustomerName: rosterNewName.trim(), newCustomerEmail: rosterNewEmail.trim(),
      name: rosterNewName.trim(), email: rosterNewEmail.trim(), targetStatus: "confirmed",
    }]);
    setRosterNewName(""); setRosterNewEmail(""); setRosterSearch("");
  }
  function submitRoster(session: any) {
    const confirmedTarget = rosterEntries.filter((e) => e.targetStatus === "confirmed").length;
    if (confirmedTarget > session.capacity) {
      askConfirm(
        "Kurs wird überbucht",
        `Mit diesen Änderungen wären ${confirmedTarget} Personen bestätigt, der Kurs hat aber nur ${session.capacity} Plätze. Das ist möglich, wird aber im Kalender rot markiert.`,
        "Trotzdem speichern",
        () => doSubmitRoster(session),
        true
      );
      return;
    }
    doSubmitRoster(session);
  }
  async function doSubmitRoster(session: any) {
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/sessions/roster", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, entries: rosterEntries }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setRosterEditingFor(null);
    await loadSessions();
  }

  // ---- Kurse ----
  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/courses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newCourse }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setNewCourse(EMPTY_COURSE);
    setShowCourseForm(false);
    await loadCourses(); await loadSessions(); await loadCourseTypes();
  }
  function startEditCourse(c: any) { setEditingCourseId(c.id); setEditCourse({ ...c }); }
  async function saveEditCourse() {
    const original = courses.find((c) => c.id === editingCourseId);
    const bigChange = original?.weekday !== editCourse.weekday || original?.start_time !== editCourse.start_time;
    if (bigChange) {
      askConfirm(
        "Wochentag/Uhrzeit ändern",
        `Du änderst Wochentag/Uhrzeit von "${original?.name}". Für die nächsten 4 Wochen werden zusätzlich Termine am neuen Tag erzeugt, alte Termine bleiben bestehen und können einzeln abgesagt werden.`,
        "Ändern",
        () => doSaveEditCourse(true)
      );
      return;
    }
    await doSaveEditCourse(false);
  }
  async function doSaveEditCourse(regenerate: boolean) {
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/courses", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingCourseId, ...editCourse, regenerate }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setEditingCourseId(null);
    await loadCourses(); await loadSessions();
  }
  const [editCoursePanel, setEditCoursePanel] = useState<any>(null);
  const [subPanel, setSubPanel] = useState<any>(null);

  function openSubPanel(s: any) {
    setSubPanel({
      sessionId: s.id,
      sessionDate: s.date,
      mode: "single",
      trainerId: s.substituteTrainerId ?? "",
      instructor: s.substituteInstructor ?? "",
      rangeEnd: s.date,
    });
  }
  async function submitSub() {
    if (!subPanel) return;
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/sessions/trainer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subPanel),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setSubPanel(null);
    await loadSessions();
  }
  async function removeSub(sessionId: string) {
    setActionError(null);
    const res = await fetch(`/api/admin/sessions/trainer?sessionId=${sessionId}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    setSubPanel(null);
    await loadSessions();
  }

  function openEditCourse(s: any) {
    setEditCoursePanel({
      id: s.courseId,
      courseTypeId: s.courseTypeId ?? "",
      newTypeName: "",
      category: s.courseCategory ?? "Pole",
      level: s.courseLevel ?? "",
      instructor: s.courseInstructor ?? "",
      room: s.room ?? ROOMS[0],
      trainer_id: s.courseTrainerId ?? "",
      weekday: s.courseWeekday ?? 1,
      start_time: s.time?.slice(0, 5) ?? "18:00",
      duration_minutes: s.courseDuration ?? 70,
      capacity: s.capacity ?? 8,
      endDate: s.courseEndDate ?? "",
      isSingle: s.courseIsSingle ?? false,
      sessionDate: s.date,
      applyMode: "session",
    });
  }

  async function saveEditCoursePanel() {
    if (!editCoursePanel) return;
    setSaving(true); setActionError(null);
    const { id, isSingle, sessionDate, applyMode, ...rest } = editCoursePanel;
    const res = await fetch("/api/admin/courses", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id, ...rest,
        splitFrom: isSingle ? undefined : (applyMode === "today" ? formatDateOnly(today) : sessionDate),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setEditCoursePanel(null);
    setSelectedSessionId(null);
    await loadCourses(); await loadSessions(); await loadCourseTypes();
  }

  function endCourse(id: string, name: string) {
    askConfirm(
      "Kurs beenden",
      `Kurs "${name}" ab heute beenden? Alle KÜNFTIGEN Termine dieser Kursreihe werden samt ihrer Buchungen entfernt. Bereits stattgefundene Termine bleiben vollständig erhalten und weiterhin dokumentiert. Für einen einzelnen Ausfall stattdessen "Termin absagen" nutzen.`,
      "Kurs beenden",
      async () => {
        setActionError(null);
        const res = await fetch(`/api/admin/courses?id=${id}&mode=end`, { method: "DELETE" });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        setSelectedSessionId(null);
        await loadCourses(); await loadSessions();
      },
      true
    );
  }

  function purgeCourse(id: string, name: string) {
    askConfirm(
      "Kurs vollständig löschen",
      `Kurs "${name}" unwiderruflich löschen? Das entfernt den Kurs samt allen Terminen komplett aus dem System. Das ist nur möglich, wenn es noch keine bereits stattgefundenen Termine mit Buchungen gibt — sonst würde dokumentierte Vergangenheit verloren gehen, und du bekommst stattdessen einen Hinweis.`,
      "Endgültig löschen",
      async () => {
        setActionError(null);
        const res = await fetch(`/api/admin/courses?id=${id}&mode=purge`, { method: "DELETE" });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        setSelectedSessionId(null);
        await loadCourses(); await loadSessions();
      },
      true
    );
  }

  // ---- Schüler:innen ----
  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/customers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newCustomer }),
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
      body: JSON.stringify({ id: editingCustomerId, ...editCustomer }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setEditingCustomerId(null);
    await loadCustomers();
  }
  function archiveCustomer(id: string, name: string) {
    setArchiveDialog({ id, name });
  }
  async function submitArchive() {
    if (!archiveDialog) return;
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/customers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: archiveDialog.id, archive: true }),
    });
    setSaving(false);
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    setArchiveDialog(null);
    await loadCustomers();
  }
  async function restoreCustomer(id: string) {
    setActionError(null);
    const res = await fetch("/api/admin/customers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, restore: true }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadCustomers();
  }
  function deleteCustomerForever(id: string, name: string) {
    askConfirm(
      "Endgültig löschen",
      `"${name}" JETZT endgültig löschen? Das Konto und alle Produktzuweisungen werden unwiderruflich entfernt. Vergangene Buchungen bleiben mit Name und E-Mail als Nachweis erhalten. Dieser Schritt kann nicht rückgängig gemacht werden.`,
      "Endgültig löschen",
      async () => {
        setActionError(null);
        const res = await fetch(`/api/admin/customers?id=${id}`, { method: "DELETE" });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        await loadCustomers();
      },
      true
    );
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
        customerId: assigningFor, productId: assignForm.productId,
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
  async function loadDocuments(customerId: string) {
    const res = await fetch(`/api/admin/documents?customerId=${customerId}`);
    const data = await res.json();
    if (res.ok) setDocuments(data.documents);
  }
  async function uploadDocument(customerId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) { setActionError("Bitte eine Datei auswählen."); return; }
    setDocUploading(true); setActionError(null);
    const fd = new FormData();
    fd.append("file", docFile);
    fd.append("customerId", customerId);
    fd.append("title", docForm.title);
    fd.append("docType", docForm.docType);
    fd.append("validFrom", docForm.validFrom);
    fd.append("validUntil", docForm.validUntil);
    fd.append("notes", docForm.notes);
    const res = await fetch("/api/admin/documents", { method: "POST", body: fd });
    const data = await res.json();
    setDocUploading(false);
    if (!res.ok) { setActionError(data.error ?? "Upload fehlgeschlagen."); return; }
    setDocForm({ title: "", docType: "Ermäßigungsnachweis", validFrom: "", validUntil: "", notes: "" });
    setDocFile(null);
    await loadDocuments(customerId);
  }
  async function openDocument(id: string) {
    setActionError(null);
    const res = await fetch(`/api/admin/documents/link?id=${id}`);
    const data = await res.json();
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    window.open(data.url, "_blank");
  }
  function deleteDocument(id: string, title: string, customerId: string) {
    askConfirm(
      "Dokument löschen",
      `Das Dokument "${title}" unwiderruflich löschen? Die Datei wird dabei endgültig entfernt.`,
      "Löschen",
      async () => {
        setActionError(null);
        const res = await fetch(`/api/admin/documents?id=${id}`, { method: "DELETE" });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        await loadDocuments(customerId);
      },
      true
    );
  }
  async function updateDocumentValidity(id: string, validUntil: string, customerId: string) {
    setActionError(null);
    const res = await fetch("/api/admin/documents", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, validUntil }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadDocuments(customerId);
  }

  async function loadHistory(customerId: string) {
    const res = await fetch(`/api/admin/customer-history?customerId=${customerId}`);
    const data = await res.json();
    if (res.ok) {
      setHistoryBookings(data.bookings);
      setHistoryForCustomerId(customerId);
      await loadDocuments(customerId);
    }
  }
  function toggleDetails(customerId: string) {
    if (historyForCustomerId === customerId) {
      setHistoryForCustomerId(null);
    } else {
      loadHistory(customerId);
    }
  }
  function toggleProductExpand(cpId: string, customerId: string) {
    setExpandedProducts((prev) => (prev.includes(cpId) ? prev.filter((id) => id !== cpId) : [...prev, cpId]));
    if (historyForCustomerId !== customerId) loadHistory(customerId);
  }
  function startRenew(cp: any) {
    setRenewingId(cp.id);
    setRenewDate(cp.valid_until ?? new Date().toISOString().slice(0, 10));
  }
  async function submitRenew(cp: any) {
    if (cp.valid_until && renewDate && renewDate < cp.valid_until) {
      askConfirm(
        "Gültigkeit verkürzen",
        `Das verkürzt die Gültigkeit von ${cp.valid_until} auf ${renewDate}. Die Person kann das Produkt danach nur noch bis zum neuen Datum nutzen.`,
        "Verkürzen",
        () => doSubmitRenew(cp),
        true
      );
      return;
    }
    await doSubmitRenew(cp);
  }
  async function doSubmitRenew(cp: any) {
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/customer-products", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cp.id, valid_until: renewDate || null }),
    });
    setSaving(false);
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    setRenewingId(null);
    await loadCustomers();
  }
  function startReactivate(cp: any) {
    setReactivatingId(cp.id);
    setReactivateDate(new Date().toISOString().slice(0, 10));
  }
  async function submitReactivate(cp: any) {
    if (!reactivateDate) return;
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/customer-products", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cp.id, active: true, valid_until: reactivateDate }),
    });
    setSaving(false);
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    setReactivatingId(null);
    await loadCustomers();
  }
  function removeCustomerProduct(cpId: string) {
    askConfirm(
      "Produktzuweisung entfernen",
      "Diese Produktzuweisung wird von der Person entfernt. Bereits damit verknüpfte Buchungen bleiben bestehen.",
      "Entfernen",
      async () => {
        setActionError(null);
        const res = await fetch(`/api/admin/customer-products?id=${cpId}`, { method: "DELETE" });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        await loadCustomers();
      },
      true
    );
  }

  // ---- Kurs-Freigaben ----
  async function openAccessPanel(customerId: string) {
    setAccessPanelFor(customerId);
    setEnrollPanelFor(null);
    setOverrideForm({ courseTypeId: courseTypes.find((t: any) => t.active)?.id ?? "", access: "allow", notes: "" });
    const res = await fetch(`/api/admin/course-access?customerId=${customerId}`);
    const data = await res.json();
    if (res.ok) setOverrides(data.overrides);
  }
  async function submitOverride(e: React.FormEvent) {
    e.preventDefault();
    if (overrideForm.access === "deny") {
      const ct = courseTypes.find((t: any) => t.id === overrideForm.courseTypeId);
      askConfirm(
        "Kurs sperren",
        `Diese Person wird von der Buchung von "${ct?.name ?? "dieser Kursbezeichnung"}" ausgeschlossen — für alle Termine dieser Bezeichnung, auch wenn ein passendes Produkt vorliegt.`,
        "Sperren",
        () => doSubmitOverride(),
        true
      );
      return;
    }
    await doSubmitOverride();
  }
  async function doSubmitOverride() {
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/course-access", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: accessPanelFor, ...overrideForm }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    await openAccessPanel(accessPanelFor!);
  }
  async function removeOverride(id: string) {
    setActionError(null);
    const res = await fetch(`/api/admin/course-access?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await openAccessPanel(accessPanelFor!);
  }

  // ---- Feste Zuteilung ----
  async function openEnrollPanel(customerId: string) {
    setEnrollPanelFor(customerId);
    setAccessPanelFor(null);
    setEnrollForm({ courseId: courses.find((c) => c.active)?.id ?? "", valid_from: new Date().toISOString().slice(0, 10), valid_until: "", notes: "" });
    const res = await fetch(`/api/admin/enrollments?customerId=${customerId}`);
    const data = await res.json();
    if (res.ok) setEnrollments(data.enrollments);
  }
  async function submitEnrollment(e: React.FormEvent) {
    e.preventDefault();
    const course = courses.find((c) => c.id === enrollForm.courseId);
    askConfirm(
      "Feste Zuteilung anlegen",
      `"${course?.name}" fest für diese:n Schüler:in eintragen? Dabei wird sie automatisch für alle passenden künftigen Termine eingetragen — sind die schon voll, landet sie wie bei einer normalen Buchung auf der Warteliste und rückt bei Absagen automatisch nach.`,
      "Fest zuteilen",
      async () => {
        setSaving(true); setActionError(null);
        const res = await fetch("/api/admin/enrollments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: enrollPanelFor, ...enrollForm }),
        });
        const data = await res.json();
        setSaving(false);
        if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
        if (data.warning) {
          askConfirm("Hinweis zur Laufzeit", data.warning, "Verstanden", () => {});
        }
        await openEnrollPanel(enrollPanelFor!);
        await loadSessions();
      }
    );
  }
  function removeEnrollment(id: string) {
    askConfirm(
      "Feste Zuteilung beenden",
      "Diese feste Zuteilung wird beendet. Bereits gebuchte Termine bleiben bestehen und müssten separat im Reiter \"Anmeldungen\" entfernt werden.",
      "Beenden",
      async () => {
        setActionError(null);
        const res = await fetch(`/api/admin/enrollments?id=${id}`, { method: "DELETE" });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        await openEnrollPanel(enrollPanelFor!);
      },
      true
    );
  }

  // ---- Produkte ----
  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/products", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newProduct,
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
        id: editingProductId, ...editProduct,
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
  function deactivateProduct(id: string, name: string) {
    askConfirm(
      "Produkt deaktivieren",
      `Produkt "${name}" deaktivieren? Es kann dann keinen Schüler:innen mehr neu zugewiesen werden. Bestehende Zuweisungen bleiben unverändert.`,
      "Deaktivieren",
      async () => {
        setActionError(null);
        const res = await fetch(`/api/admin/products?id=${id}`, { method: "DELETE" });
        if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
        await loadProducts();
      },
      true
    );
  }
  function toggleCategory(list: string[], cat: string) {
    return list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat];
  }

  // ---- Trainer:innen ----
  async function createTrainer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/trainers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newTrainer }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setNewTrainer({ name: "", email: "", newPassword: "" });
    await loadTrainers();
  }
  async function toggleTrainerActive(id: string, active: boolean) {
    setActionError(null);
    const res = await fetch("/api/admin/trainers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    if (!res.ok) { setActionError((await res.json()).error ?? "Fehler."); return; }
    await loadTrainers();
  }
  async function submitResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setActionError(null);
    const res = await fetch("/api/admin/trainers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: resetPasswordFor, newPassword: resetPasswordValue }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setActionError(data.error ?? "Fehler."); return; }
    setResetPasswordFor(null);
    setResetPasswordValue("");
  }

  if (checkingSession) {
    return <div className="min-h-screen flex items-center justify-center bg-bg"><p className="text-sm text-muted">Lade…</p></div>;
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <form onSubmit={login} className="w-full max-w-sm space-y-3">
          <Link href="/" className="flex items-center gap-1 text-xs text-muted mb-4"><ArrowLeft size={12} /> Zurück zur Buchungsseite</Link>
          <h1 className="font-display text-2xl mb-4 text-ivory">Admin-Login</h1>
          <input required type="email" placeholder="E-Mail" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className={`w-full ${inputClass}`} />
          <input required type="password" placeholder="Passwort" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className={`w-full ${inputClass}`} />
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
        <h1 className="font-display text-3xl text-ivory">Admin</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Angemeldet als {adminName}</span>
          <button onClick={logout} className="text-xs text-muted hover:text-wine">Abmelden</button>
          <Link href="/" className="flex items-center gap-1 text-xs text-muted"><ArrowLeft size={12} /> Zur Buchungsseite</Link>
        </div>
      </div>

      <nav className="flex gap-1 mb-8 flex-wrap">
        {[
          { id: "anmeldungen", label: "Anmeldungen" },
          { id: "schueler", label: "Schüler:innen" },
          { id: "produkte", label: "Produkte" },
          { id: "trainer", label: "Trainer:innen" },
          { id: "meldungen", label: "Meldungen" },
          { id: "log", label: "Änderungslog" },
          { id: "einstellungen", label: "Einstellungen" },
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
                className="p-2 rounded-full border border-border text-muted hover:text-gold"
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
              <button
                onClick={() => {
                  setShowCourseForm((v) => !v);
                  if (!showCourseForm) {
                    setNewCourse({
                      ...EMPTY_COURSE,
                      capacity: settings?.default_capacity ?? EMPTY_COURSE.capacity,
                      duration_minutes: settings?.default_duration_minutes ?? EMPTY_COURSE.duration_minutes,
                      room: settings?.default_room ?? EMPTY_COURSE.room,
                      category: settings?.default_category ?? EMPTY_COURSE.category,
                      startDate: formatDateOnly(weekStart),
                      endDate: formatDateOnly(addDays(weekStart, 6)),
                      singleDate: formatDateOnly(weekStart),
                    });
                  }
                }}
                className={`ml-2 w-9 h-9 rounded-full border flex items-center justify-center text-lg ${showCourseForm ? "bg-gold text-bg border-gold" : "border-gold text-gold"}`}
                title="Neuen Kurs anlegen"
              >
                +
              </button>
              <button
                onClick={() => setShowInactive((v) => !v)}
                className={`ml-1 px-3 py-2 rounded-full text-xs border ${showInactive ? "bg-gold text-bg border-gold" : "border-border text-muted"}`}
                title="Abgesagte Termine und deaktivierte Kurse ein-/ausblenden"
              >
                {showInactive ? "Abgesagte/beendete sichtbar" : "Abgesagte/beendete ausgeblendet"}
              </button>
            </div>

            <div className="overflow-x-auto" onClick={() => showPicker && setShowPicker(false)}>
              <div className="grid grid-cols-7 gap-3 min-w-[760px]">
                {weekDays.map((day) => {
                  const dateStr = formatDateOnly(day);
                  const list = (sessionsByDate[dateStr] ?? []).filter((s: any) => showInactive || (!s.cancelled && s.courseActive));
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
                          const overbooked = confirmedCount(s) > s.capacity;
                          const wl = waitlistCount(s);
                          const isSelected = s.id === selectedSessionId;
                          return (
                            <button
                              key={s.id}
                              onClick={() => setSelectedSessionId(isSelected ? null : s.id)}
                              className={`w-full text-left rounded-xl p-3 border text-xs transition-colors ${
                                overbooked ? "border-2 border-red-500" : isSelected ? "border-gold" : "border-border"
                              } bg-surface ${isSelected ? "ring-1 ring-gold" : ""} ${(s.cancelled || !s.courseActive) ? "opacity-50" : ""}`}
                            >
                              <div className={`font-medium ${(s.cancelled || !s.courseActive) ? "text-muted line-through" : "text-ivory"}`}>{s.courseName}</div>
                              {s.room && <div className="text-muted mt-0.5">{s.room}</div>}
                              <div className={`mt-1 ${overbooked ? "text-red-500 font-bold" : "text-muted"}`}>
                                {s.time?.slice(0, 5)} · {confirmedCount(s)}/{s.capacity}{wl > 0 ? ` · ${wl} WL` : ""}{overbooked ? " ÜBERBUCHT" : ""}
                              </div>
                              {s.cancelled && <div className="text-wine mt-0.5">abgesagt</div>}
                              {!s.courseActive && <div className="text-wine mt-0.5">Kurs beendet</div>}
                              {s.hasSubstitute && <div className="text-gold mt-0.5">Vertretung: {s.effectiveTrainerName ?? "andere Trainer:in"}</div>}
                              {!s.cancelled && s.trainerRequired && !s.effectiveTrainerName && (
                                <div className="text-yellow-400 mt-0.5">Trainer:in fehlt</div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {showCourseForm && (
              <form onSubmit={createCourse} className="mt-8 rounded-2xl p-5 border border-gold bg-surface space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg text-ivory">Neuen Kurs anlegen</h3>
                  <button type="button" onClick={() => setShowCourseForm(false)} className="text-xs text-muted underline">Schließen</button>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Kursbezeichnung (bestehende wählen)">
                    <select
                      value={newCourse.courseTypeId}
                      onChange={(e) => {
                        const ct = courseTypes.find((t: any) => t.id === e.target.value);
                        setNewCourse({
                          ...newCourse,
                          courseTypeId: e.target.value,
                          newTypeName: "",
                          category: ct?.category ?? newCourse.category,
                          level: ct?.default_level ?? "",
                          capacity: ct?.default_capacity ?? newCourse.capacity,
                          duration_minutes: ct?.default_duration_minutes ?? newCourse.duration_minutes,
                        });
                      }}
                      className={`w-full ${inputClass}`}
                    >
                      <option value="">— neue Bezeichnung eintragen —</option>
                      {courseTypes.filter((t: any) => t.active).map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="…oder neue Bezeichnung (Freitext)">
                    <input
                      placeholder="z.B. Beginner 2/3"
                      value={newCourse.newTypeName}
                      onChange={(e) => setNewCourse({ ...newCourse, newTypeName: e.target.value, courseTypeId: "" })}
                      className={`w-full ${inputClass}`}
                    />
                  </Field>
                  <Field label="Kategorie">
                    <select value={newCourse.category} onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })} className={`w-full ${inputClass}`}>
                      {COURSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Level (optional)">
                    <input placeholder="z.B. Level 2" value={newCourse.level} onChange={(e) => setNewCourse({ ...newCourse, level: e.target.value })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Raum">
                    <select value={newCourse.room} onChange={(e) => setNewCourse({ ...newCourse, room: e.target.value })} className={`w-full ${inputClass}`}>
                      {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Trainer-Konto (optional)">
                    <select value={newCourse.trainer_id} onChange={(e) => setNewCourse({ ...newCourse, trainer_id: e.target.value })} className={`w-full ${inputClass}`}>
                      <option value="">keins</option>
                      {trainers.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Trainer:in-Anzeigename (optional, Freitext)">
                    <input placeholder="z.B. Nina" value={newCourse.instructor} onChange={(e) => setNewCourse({ ...newCourse, instructor: e.target.value })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Startzeit (Std:Min)">
                    <input required type="time" value={newCourse.start_time} onChange={(e) => setNewCourse({ ...newCourse, start_time: e.target.value })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Dauer (Minuten)">
                    <input type="number" value={newCourse.duration_minutes} onChange={(e) => setNewCourse({ ...newCourse, duration_minutes: Number(e.target.value) })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Kapazität (Anzahl Plätze)">
                    <input required type="number" value={newCourse.capacity} onChange={(e) => setNewCourse({ ...newCourse, capacity: Number(e.target.value) })} className={`w-full ${inputClass}`} />
                  </Field>
                </div>

                <div className="pt-3 border-t border-border space-y-3">
                  <div className="flex gap-2">
                    {[
                      { v: false, label: "Regelmäßiger Termin" },
                      { v: true, label: "Einzeltermin" },
                    ].map((o) => (
                      <button
                        type="button"
                        key={String(o.v)}
                        onClick={() => setNewCourse({ ...newCourse, isSingle: o.v })}
                        className={`px-4 py-2 text-sm rounded-full ${newCourse.isSingle === o.v ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>

                  {newCourse.isSingle ? (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label="Datum des Einzeltermins">
                        <input required type="date" value={newCourse.singleDate} onChange={(e) => setNewCourse({ ...newCourse, singleDate: e.target.value })} className={`w-full ${inputClass}`} />
                      </Field>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-3 gap-3">
                      <Field label="Wochentag">
                        <select value={newCourse.weekday} onChange={(e) => setNewCourse({ ...newCourse, weekday: Number(e.target.value) })} className={`w-full ${inputClass}`}>
                          {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Startdatum">
                        <input required type="date" value={newCourse.startDate} onChange={(e) => setNewCourse({ ...newCourse, startDate: e.target.value })} className={`w-full ${inputClass}`} />
                      </Field>
                      <Field label="Enddatum">
                        <input required type="date" value={newCourse.endDate} onChange={(e) => setNewCourse({ ...newCourse, endDate: e.target.value })} className={`w-full ${inputClass}`} />
                      </Field>
                    </div>
                  )}
                </div>

                <Field label="Notizen (optional)">
                  <textarea value={newCourse.notes} onChange={(e) => setNewCourse({ ...newCourse, notes: e.target.value })} className={`w-full ${inputClass}`} />
                </Field>

                <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
                  {saving ? "Speichere…" : "Kurs anlegen"}
                </button>
              </form>
            )}

            {subPanel && (
              <div className="mt-8 rounded-2xl p-5 border border-gold bg-surface space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg text-ivory">Trainer:in ändern</h3>
                  <button onClick={() => setSubPanel(null)} className="text-xs text-muted underline">Schließen</button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => setSubPanel({ ...subPanel, mode: "single" })}
                    className={`px-4 py-2 text-sm rounded-full ${subPanel.mode === "single" ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}>
                    Nur dieser Termin
                  </button>
                  <button type="button" onClick={() => setSubPanel({ ...subPanel, mode: "range" })}
                    className={`px-4 py-2 text-sm rounded-full ${subPanel.mode === "range" ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}>
                    Zeitraum
                  </button>
                  <button type="button" onClick={() => { setSubPanel(null); openEditCourse(selectedSession); }}
                    className="px-4 py-2 text-sm rounded-full border border-border text-muted">
                    Dauerhaft übernehmen
                  </button>
                </div>

                <p className="text-xs text-muted">
                  {subPanel.mode === "single"
                    ? `Vertretung nur am ${subPanel.sessionDate}. Der Kurs behält seine Trainer:in, für diesen einen Termin gilt die hier gewählte Person.`
                    : `Vertretung ab dem ${subPanel.sessionDate} bis zum gewählten Enddatum. Danach gilt wieder die Trainer:in des Kurses.`}
                  {" "}Für eine dauerhafte Übernahme wird stattdessen die Kursbearbeitung mit Stichtag verwendet — so bleibt dokumentiert, ab wann der Kurs offiziell übergeben wurde.
                </p>

                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Trainer-Konto">
                    <select value={subPanel.trainerId} onChange={(e) => setSubPanel({ ...subPanel, trainerId: e.target.value })} className={`w-full ${inputClass}`}>
                      <option value="">— keins (nur Anzeigename) —</option>
                      {trainers.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Anzeigename (optional, Freitext)">
                    <input placeholder="z.B. Nina (Vertretung)" value={subPanel.instructor} onChange={(e) => setSubPanel({ ...subPanel, instructor: e.target.value })} className={`w-full ${inputClass}`} />
                  </Field>
                  {subPanel.mode === "range" && (
                    <Field label="Vertretung bis (einschließlich)">
                      <input type="date" min={subPanel.sessionDate} value={subPanel.rangeEnd} onChange={(e) => setSubPanel({ ...subPanel, rangeEnd: e.target.value })} className={`w-full ${inputClass}`} />
                    </Field>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={submitSub} disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
                    {saving ? "Speichere…" : "Vertretung speichern"}
                  </button>
                  {selectedSession?.hasSubstitute && (
                    <button onClick={() => removeSub(subPanel.sessionId)} className="px-5 py-2.5 rounded-full text-sm border border-border text-wine">
                      Vertretung aufheben
                    </button>
                  )}
                  <button onClick={() => setSubPanel(null)} className="px-5 py-2.5 rounded-full text-sm border border-border text-muted">Abbrechen</button>
                </div>
              </div>
            )}

            {editCoursePanel && (
              <div className="mt-8 rounded-2xl p-5 border border-gold bg-surface space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg text-ivory">Kurs bearbeiten</h3>
                  <button onClick={() => setEditCoursePanel(null)} className="text-xs text-muted underline">Schließen</button>
                </div>
                {!editCoursePanel.isSingle && (
                  <div className="rounded-xl p-3 bg-bg border border-border space-y-2">
                    <p className="text-xs text-muted">Ab wann sollen die Änderungen gelten?</p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setEditCoursePanel({ ...editCoursePanel, applyMode: "session" })}
                        className={`px-4 py-2 text-sm rounded-full ${editCoursePanel.applyMode === "session" ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}
                      >
                        Ab dem {editCoursePanel.sessionDate}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditCoursePanel({ ...editCoursePanel, applyMode: "today" })}
                        className={`px-4 py-2 text-sm rounded-full ${editCoursePanel.applyMode === "today" ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}
                      >
                        Ab heute
                      </button>
                    </div>
                    <p className="text-xs text-muted">
                      Die bisherige Kursreihe endet am Tag davor und bleibt mit ihrem alten Namen, Level und
                      Trainer:in vollständig im Kalender stehen. Ab dem Stichtag läuft der Kurs mit den neuen
                      Daten weiter — Buchungen der künftigen Termine werden übernommen. Rückwirkend ändert
                      sich dadurch nie etwas.
                      {editCoursePanel.applyMode === "session" && editCoursePanel.sessionDate < formatDateOnly(today) && (
                        <span className="text-wine"> Achtung: Der gewählte Termin liegt in der Vergangenheit — bitte &quot;Ab heute&quot; nutzen.</span>
                      )}
                    </p>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Kursbezeichnung (bestehende wählen)">
                    <select
                      value={editCoursePanel.courseTypeId}
                      onChange={(e) => {
                        const ct = courseTypes.find((t: any) => t.id === e.target.value);
                        setEditCoursePanel({ ...editCoursePanel, courseTypeId: e.target.value, newTypeName: "", category: ct?.category ?? editCoursePanel.category });
                      }}
                      className={`w-full ${inputClass}`}
                    >
                      <option value="">— unverändert / neue eintragen —</option>
                      {courseTypes.filter((t: any) => t.active).map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="…oder neue Bezeichnung (z.B. Level-Aufstieg)">
                    <input
                      placeholder="z.B. Beginner 3/4"
                      value={editCoursePanel.newTypeName}
                      onChange={(e) => setEditCoursePanel({ ...editCoursePanel, newTypeName: e.target.value, courseTypeId: "" })}
                      className={`w-full ${inputClass}`}
                    />
                  </Field>
                  <Field label="Kategorie">
                    <select value={editCoursePanel.category} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, category: e.target.value })} className={`w-full ${inputClass}`}>
                      {COURSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </Field>
                  <Field label="Level (optional)">
                    <input value={editCoursePanel.level} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, level: e.target.value })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Raum">
                    <select value={editCoursePanel.room} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, room: e.target.value })} className={`w-full ${inputClass}`}>
                      {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Trainer-Konto (optional)">
                    <select value={editCoursePanel.trainer_id ?? ""} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, trainer_id: e.target.value })} className={`w-full ${inputClass}`}>
                      <option value="">keins</option>
                      {trainers.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Trainer:in-Anzeigename (Freitext)">
                    <input value={editCoursePanel.instructor} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, instructor: e.target.value })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Startzeit (Std:Min)">
                    <input type="time" value={editCoursePanel.start_time} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, start_time: e.target.value })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Dauer (Minuten)">
                    <input type="number" value={editCoursePanel.duration_minutes} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, duration_minutes: Number(e.target.value) })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Kapazität (Anzahl Plätze)">
                    <input type="number" value={editCoursePanel.capacity} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, capacity: Number(e.target.value) })} className={`w-full ${inputClass}`} />
                  </Field>
                  {!editCoursePanel.isSingle && (
                    <>
                      <Field label="Wochentag">
                        <select value={editCoursePanel.weekday} onChange={(e) => setEditCoursePanel({ ...editCoursePanel, weekday: Number(e.target.value) })} className={`w-full ${inputClass}`}>
                          {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Laufzeit bis (nur Zukunft möglich)">
                        <input
                          type="date"
                          min={formatDateOnly(addDays(today, 1))}
                          value={editCoursePanel.endDate ?? ""}
                          onChange={(e) => setEditCoursePanel({ ...editCoursePanel, endDate: e.target.value })}
                          className={`w-full ${inputClass}`}
                        />
                      </Field>
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={saveEditCoursePanel} disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
                    {saving ? "Speichere…" : "Änderungen speichern"}
                  </button>
                  <button onClick={() => setEditCoursePanel(null)} className="px-5 py-2.5 rounded-full text-sm border border-border text-muted">Abbrechen</button>
                </div>
              </div>
            )}

            {selectedSession && (() => {
              const confirmed = selectedSession.participants.filter((p: any) => p.status === "confirmed");
              const waitlist = selectedSession.participants.filter((p: any) => p.status === "waitlisted");
              const overbooked = confirmed.length > selectedSession.capacity;
              return (
              <div className={`mt-8 rounded-2xl p-5 border bg-surface ${overbooked ? "border-2 border-red-500" : "border-border"}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-display text-lg text-ivory">
                    {selectedSession.courseName} {selectedSession.level ? `– ${selectedSession.level}` : ""} {selectedSession.room ? <span className="text-xs text-muted">· {selectedSession.room}</span> : null}
                    {selectedSession.cancelled && <span className="ml-2 text-xs text-wine">(abgesagt)</span>}
                    {selectedSession.effectiveTrainerName ? (
                      <span className="ml-2 text-xs text-muted">
                        · {selectedSession.hasSubstitute ? "Vertretung: " : ""}{selectedSession.effectiveTrainerName}
                      </span>
                    ) : selectedSession.trainerRequired && !selectedSession.cancelled ? (
                      <span className="ml-2 text-xs text-yellow-400">· Trainer:in fehlt</span>
                    ) : null}
                  </h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs ${overbooked ? "text-red-500 font-bold" : "text-muted"}`}>
                      {selectedSession.date} · {selectedSession.time?.slice(0, 5)} · {confirmed.length}/{selectedSession.capacity}
                      {waitlist.length > 0 ? ` · ${waitlist.length} Warteliste` : ""}
                      {overbooked ? " ÜBERBUCHT" : ""}
                      {" · "}{confirmed.filter((p: any) => p.attended !== null && p.attended !== undefined).length}/{confirmed.length} erfasst
                    </span>
                    <button onClick={() => openRosterEditor(selectedSession)} className="text-xs px-3 py-1 rounded-full border border-gold text-gold">
                      Teilnehmer verwalten
                    </button>
                    <button onClick={() => toggleCancelled(selectedSession.id, !selectedSession.cancelled)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">
                      {selectedSession.cancelled ? "Wieder aktivieren" : "Termin absagen"}
                    </button>
                    <button onClick={() => openEditCourse(selectedSession)} className="text-xs px-3 py-1 rounded-full border border-gold text-gold">
                      Kurs bearbeiten
                    </button>
                    <button onClick={() => openSubPanel(selectedSession)} className="text-xs px-3 py-1 rounded-full border border-gold text-gold">
                      Trainer:in ändern
                    </button>
                    <button onClick={() => endCourse(selectedSession.courseId, selectedSession.courseName)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">
                      Kurs beenden
                    </button>
                    <button onClick={() => purgeCourse(selectedSession.courseId, selectedSession.courseName)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">
                      Kurs löschen
                    </button>
                    <button onClick={() => setSelectedSessionId(null)} className="text-xs text-muted underline">Schließen</button>
                  </div>
                </div>

                {selectedSession.participants.length === 0 ? (
                  <p className="text-sm text-muted mt-2">Noch keine Anmeldungen.</p>
                ) : (
                  <>
                    <ul className="mt-3 text-sm text-ivory space-y-2">
                      {confirmed.map((p: any, i: number) => (
                        <li key={i} className="flex items-center gap-1.5 flex-wrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => saveAttendance(p.bookingId, p.attended === true ? null : true)}
                              className={`text-xs px-2 py-1 rounded-lg border ${p.attended === true ? "bg-green-600/20 border-green-500 text-green-400" : "border-border text-muted"}`}
                            >
                              ✓ Da
                            </button>
                            <button
                              onClick={() => saveAttendance(p.bookingId, p.attended === false ? null : false)}
                              className={`text-xs px-2 py-1 rounded-lg border ${p.attended === false ? "bg-red-600/20 border-red-500 text-red-400" : "border-border text-muted"}`}
                            >
                              ✗ Fehlt
                            </button>
                          </div>
                          {p.name} <span className="text-muted">— {p.email}</span>
                          {p.accountDeleted && (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted">Konto gelöscht</span>
                          )}
                          {p.source === "enrollment" && (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-gold text-gold">Fest zugeteilt</span>
                          )}
                          {!p.hasActiveProduct && !p.accountDeleted && (
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
                            className="text-xs px-2 py-1 rounded-lg bg-bg border border-border text-ivory w-56"
                          />
                          <button onClick={() => cancelBooking(p.bookingId, p.name)} className="ml-auto text-xs text-wine underline">Stornieren</button>
                        </li>
                      ))}
                    </ul>

                    {waitlist.length > 0 && (
                      <div className="mt-5">
                        <h4 className="text-xs uppercase tracking-wide text-gold mb-2">Warteliste ({waitlist.length})</h4>
                        <ul className="text-sm text-ivory space-y-1.5">
                          {waitlist.map((p: any, i: number) => (
                            <li key={i} className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted w-5">{i + 1}.</span>
                              {p.name} <span className="text-muted">— {p.email}</span>
                              {p.source === "enrollment" && (
                                <span className="text-xs px-2 py-0.5 rounded-full border border-gold text-gold">Fest zugeteilt</span>
                              )}
                              <button onClick={() => promoteBooking(p.bookingId)} className="ml-auto text-xs text-gold underline">Bestätigen</button>
                              <button onClick={() => cancelBooking(p.bookingId, p.name)} className="text-xs text-wine underline">Entfernen</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {rosterEditingFor === selectedSession.id && (
                  <div className="mt-5 p-4 rounded-xl bg-bg border border-border space-y-3">
                    <h4 className="text-sm text-ivory font-medium">Teilnehmer verwalten</h4>
                    <ul className="space-y-1.5">
                      {rosterEntries.map((entry) => (
                        <li key={entry.key} className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-ivory">{entry.name}</span>
                          <span className="text-muted">{entry.email}</span>
                          <select
                            value={entry.targetStatus}
                            onChange={(e) => updateRosterEntry(entry.key, e.target.value)}
                            className="ml-auto px-2 py-1 rounded-lg bg-surface border border-border text-ivory"
                          >
                            <option value="confirmed">Bestätigt</option>
                            <option value="waitlisted">Warteliste</option>
                            <option value="removed">Entfernen</option>
                          </select>
                        </li>
                      ))}
                    </ul>
                    <div className="pt-2 border-t border-border space-y-2">
                      <p className="text-xs text-muted">Person hinzufügen:</p>
                      <div className="relative">
                        <input
                          placeholder="Schüler:in suchen (Name oder E-Mail)…"
                          value={rosterSearch}
                          onChange={(e) => setRosterSearch(e.target.value)}
                          className="px-2 py-1.5 rounded-lg bg-surface border border-border text-ivory text-xs w-72"
                        />
                        {rosterSearch.trim().length > 0 && (
                          <div className="absolute top-full mt-1 left-0 z-10 w-72 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
                            {customers
                              .filter((c) =>
                                c.name.toLowerCase().includes(rosterSearch.trim().toLowerCase()) ||
                                c.email.toLowerCase().includes(rosterSearch.trim().toLowerCase())
                              )
                              .filter((c) => !rosterEntries.some((e) => e.email === c.email))
                              .slice(0, 8)
                              .map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => { addExistingToRoster(c.id); setRosterSearch(""); }}
                                  className="block w-full text-left px-3 py-2 text-xs text-ivory hover:bg-bg"
                                >
                                  {c.name} <span className="text-muted">— {c.email}</span>
                                </button>
                              ))}
                            {customers.filter((c) =>
                              c.name.toLowerCase().includes(rosterSearch.trim().toLowerCase()) ||
                              c.email.toLowerCase().includes(rosterSearch.trim().toLowerCase())
                            ).length === 0 && (
                              <p className="px-3 py-2 text-xs text-muted">Keine Treffer — unten neu anlegen.</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <span className="text-xs text-muted">Neue Person (noch nicht im System):</span>
                        <input placeholder="Name" value={rosterNewName} onChange={(e) => setRosterNewName(e.target.value)} className="px-2 py-1.5 rounded-lg bg-surface border border-border text-ivory text-xs w-32" />
                        <input placeholder="E-Mail" value={rosterNewEmail} onChange={(e) => setRosterNewEmail(e.target.value)} className="px-2 py-1.5 rounded-lg bg-surface border border-border text-ivory text-xs w-40" />
                        <button onClick={addNewToRoster} className="px-3 py-1.5 rounded-full text-xs border border-border text-gold">Hinzufügen</button>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => submitRoster(selectedSession)} disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
                        {saving ? "Speichere…" : "Save"}
                      </button>
                      <button onClick={() => setRosterEditingFor(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">Abbrechen</button>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        );
      })()}

      {tab === "schueler" && (
        <div className="space-y-8">
          <form onSubmit={createCustomer} className="rounded-2xl p-5 border border-border bg-surface space-y-3">
            <h3 className="font-display text-lg text-ivory mb-2">Neue:n Schüler:in anlegen</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Vollständiger Name"><input required placeholder="Vorname Nachname" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="E-Mail-Adresse"><input required type="email" placeholder="name@beispiel.de" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Telefonnummer (optional)"><input placeholder="z.B. 0170 1234567" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Level (optional)"><input placeholder="z.B. Level 2" value={newCustomer.level} onChange={(e) => setNewCustomer({ ...newCustomer, level: e.target.value })} className={`w-full ${inputClass}`} /></Field>
            </div>
            <Field label="Notizen (optional)"><textarea placeholder="interne Notizen" value={newCustomer.notes} onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })} className={`w-full ${inputClass}`} /></Field>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Anlegen"}</button>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-display text-lg text-ivory">{showArchive ? "Archiv" : "Alle Schüler:innen"}</h3>
              <div className="flex gap-1">
                <button onClick={() => switchArchiveView(false)}
                  className={`px-3 py-1.5 text-xs rounded-full ${!showArchive ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}>
                  Aktiv
                </button>
                <button onClick={() => switchArchiveView(true)}
                  className={`px-3 py-1.5 text-xs rounded-full ${showArchive ? "bg-gold text-bg font-semibold" : "border border-border text-muted"}`}>
                  Archiv
                </button>
              </div>
            </div>
            {showArchive && (
              <p className="text-xs text-muted">
                Archivierte Schüler:innen werden {retentionDays} Tage nach der Archivierung automatisch endgültig gelöscht.
                Bucht eine archivierte Person selbst wieder einen Kurs, wird sie automatisch wiederhergestellt.
              </p>
            )}
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
                        {!showArchive ? (
                          <>
                            <button onClick={() => startAssign(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Produkt zuweisen</button>
                            <button onClick={() => openAccessPanel(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Freigaben</button>
                            <button onClick={() => openEnrollPanel(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Feste Zuteilung</button>
                            <button onClick={() => toggleDetails(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">
                              {historyForCustomerId === c.id ? "Details schließen" : "Details"}
                            </button>
                            <button onClick={() => startEditCustomer(c)} className="text-xs px-3 py-1 rounded-full border border-border text-muted">Bearbeiten</button>
                            <button onClick={() => archiveCustomer(c.id, c.name)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">Archivieren</button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-muted self-center">
                              archiviert am {c.archived_at?.slice(0, 10)} · endgültige Löschung am {new Date(new Date(c.archived_at).getTime() + retentionDays * 86400000).toISOString().slice(0, 10)}
                            </span>
                            <button onClick={() => restoreCustomer(c.id)} className="text-xs px-3 py-1 rounded-full border border-border text-gold">Wiederherstellen</button>
                            <button onClick={() => deleteCustomerForever(c.id, c.name)} className="text-xs px-3 py-1 rounded-full border border-border text-wine">Jetzt endgültig löschen</button>
                          </>
                        )}
                      </div>
                    </div>

                    {c.customer_products?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {c.customer_products.filter((cp: any) => cp.active).map((cp: any) => {
                          const usage = historyBookings.filter((b) => b.customerProductId === cp.id);
                          const expanded = expandedProducts.includes(cp.id);
                          return (
                            <li key={cp.id} className="text-xs text-ivory">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-full bg-bg border border-border">{cp.product?.name}{cp.is_reduced ? " (ermäßigt)" : ""}</span>
                                <span className="text-muted">
                                  {cp.valid_from} – {cp.valid_until ?? "unbegrenzt"}
                                  {cp.credits_total ? ` · ${cp.credits_remaining ?? cp.credits_total}/${cp.credits_total} Guthaben` : ""}
                                </span>
                                <button onClick={() => startRenew(cp)} className="text-gold underline">verlängern</button>
                                <button onClick={() => removeCustomerProduct(cp.id)} className="text-wine underline">entfernen</button>
                                <button onClick={() => toggleProductExpand(cp.id, c.id)} className="text-muted underline ml-auto">
                                  {expanded ? "▲ Verlauf" : "▼ Verlauf"}
                                </button>
                              </div>

                              {renewingId === cp.id && (
                                <div className="mt-2 p-2 rounded-lg bg-bg border border-border flex items-center gap-2 flex-wrap">
                                  <div>
                                    <label className="block text-[10px] text-muted mb-0.5">Neues Ablaufdatum</label>
                                    <input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} className={inputClass} />
                                  </div>
                                  <button onClick={() => submitRenew(cp)} disabled={saving} className="px-3 py-2 rounded-full text-xs font-medium bg-gold text-bg disabled:opacity-60">Speichern</button>
                                  <button onClick={() => setRenewingId(null)} className="px-3 py-2 rounded-full text-xs border border-border text-muted">Abbrechen</button>
                                </div>
                              )}

                              {expanded && (
                                <div className="mt-2 pl-3 border-l border-border">
                                  {usage.length === 0 ? (
                                    <p className="text-muted">Noch keine Termine mit diesem Guthaben verknüpft.</p>
                                  ) : (
                                    <ul className="space-y-1">
                                      {usage.map((b) => (
                                        <li key={b.id} className="text-muted">
                                          {b.courseName} am {b.date}{b.attended === true ? " · anwesend" : b.attended === false ? " · gefehlt" : ""}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {historyForCustomerId === c.id && (
                      <div className="mt-4 p-4 rounded-xl bg-bg border border-border space-y-4">
                        <div>
                          <h5 className="text-sm text-ivory font-medium mb-2">Dokumente &amp; Nachweise</h5>
                          {documents.length === 0 ? (
                            <p className="text-xs text-muted mb-3">Noch keine Dokumente hinterlegt.</p>
                          ) : (
                            <ul className="space-y-2 mb-3">
                              {documents.map((d: any) => {
                                const expired = d.valid_until && d.valid_until < formatDateOnly(today);
                                return (
                                  <li key={d.id} className="text-xs flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded-full border ${expired ? "border-wine text-wine" : "border-border text-ivory"}`}>
                                      {d.title}
                                    </span>
                                    <span className="text-muted">
                                      {d.doc_type ? `${d.doc_type} · ` : ""}
                                      {d.valid_until ? `gültig bis ${d.valid_until}` : "unbegrenzt gültig"}
                                      {expired ? " · ABGELAUFEN" : ""}
                                    </span>
                                    <button onClick={() => openDocument(d.id)} className="text-gold underline">öffnen</button>
                                    <label className="flex items-center gap-1 text-muted">
                                      neu bis:
                                      <input
                                        type="date"
                                        defaultValue={d.valid_until ?? ""}
                                        onChange={(e) => updateDocumentValidity(d.id, e.target.value, c.id)}
                                        className="px-2 py-1 rounded-lg bg-surface border border-border text-ivory"
                                      />
                                    </label>
                                    <button onClick={() => deleteDocument(d.id, d.title, c.id)} className="text-wine underline">löschen</button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          <form onSubmit={(e) => uploadDocument(c.id, e)} className="p-3 rounded-xl bg-surface border border-border space-y-2">
                            <p className="text-xs text-muted">Neues Dokument hochladen (PDF oder Bild, max. 10 MB)</p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              <Field label="Titel">
                                <input required placeholder="z.B. Studierendenausweis WS 25/26" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} className={`w-full ${inputClass}`} />
                              </Field>
                              <Field label="Art des Dokuments">
                                <select value={docForm.docType} onChange={(e) => setDocForm({ ...docForm, docType: e.target.value })} className={`w-full ${inputClass}`}>
                                  <option>Ermäßigungsnachweis</option>
                                  <option>Einverständniserklärung</option>
                                  <option>Gesundheitsnachweis</option>
                                  <option>Sonstiges</option>
                                </select>
                              </Field>
                              <Field label="Gültig ab (optional)">
                                <input type="date" value={docForm.validFrom} onChange={(e) => setDocForm({ ...docForm, validFrom: e.target.value })} className={`w-full ${inputClass}`} />
                              </Field>
                              <Field label="Gültig bis (leer = unbegrenzt)">
                                <input type="date" value={docForm.validUntil} onChange={(e) => setDocForm({ ...docForm, validUntil: e.target.value })} className={`w-full ${inputClass}`} />
                              </Field>
                            </div>
                            <Field label="Datei">
                              <input required type="file" accept=".pdf,image/*" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} className="text-xs text-muted" />
                            </Field>
                            <button type="submit" disabled={docUploading} className="px-4 py-2 rounded-full text-xs font-medium bg-gold text-bg disabled:opacity-60">
                              {docUploading ? "Lade hoch…" : "Hochladen"}
                            </button>
                          </form>
                        </div>

                        <div>
                          <h5 className="text-sm text-ivory font-medium mb-2">Inaktive / abgelaufene Produkte</h5>
                          {c.customer_products?.filter((cp: any) => !cp.active).length > 0 ? (
                            <ul className="space-y-2">
                              {c.customer_products.filter((cp: any) => !cp.active).map((cp: any) => (
                                <li key={cp.id} className="text-xs">
                                  <div className="flex items-center gap-2 flex-wrap text-muted">
                                    <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-ivory">{cp.product?.name}</span>
                                    <span>{cp.valid_from} – {cp.valid_until ?? "unbegrenzt"}</span>
                                    <button onClick={() => startReactivate(cp)} className="text-gold underline">reaktivieren</button>
                                  </div>
                                  {reactivatingId === cp.id && (
                                    <div className="mt-2 p-2 rounded-lg bg-surface border border-border flex items-center gap-2 flex-wrap">
                                      <div>
                                        <label className="block text-[10px] text-muted mb-0.5">Neues Ablaufdatum</label>
                                        <input type="date" value={reactivateDate} onChange={(e) => setReactivateDate(e.target.value)} className={inputClass} />
                                      </div>
                                      <button onClick={() => submitReactivate(cp)} disabled={saving} className="px-3 py-2 rounded-full text-xs font-medium bg-gold text-bg disabled:opacity-60">Reaktivieren</button>
                                      <button onClick={() => setReactivatingId(null)} className="px-3 py-2 rounded-full text-xs border border-border text-muted">Abbrechen</button>
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted">Keine inaktiven Produkte.</p>
                          )}
                        </div>
                        <div>
                          <h5 className="text-sm text-ivory font-medium mb-2">Buchungshistorie</h5>
                          {historyBookings.length === 0 ? (
                            <p className="text-xs text-muted">Noch keine Buchungen.</p>
                          ) : (
                            <ul className="space-y-1 max-h-64 overflow-y-auto">
                              {historyBookings.map((b) => (
                                <li key={b.id} className="text-xs text-muted flex items-center gap-2 flex-wrap">
                                  <span className="text-ivory">{b.courseName}</span>
                                  <span>{b.date} · {b.time?.slice(0, 5)}</span>
                                  {b.status === "cancelled" && <span className="text-wine">storniert</span>}
                                  {b.source === "enrollment" && <span className="text-gold">Fest zugeteilt</span>}
                                  {b.attended === true && <span className="text-green-400">anwesend</span>}
                                  {b.attended === false && <span className="text-red-400">gefehlt</span>}
                                  {b.notes && <span>· {b.notes}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
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
                                {o.course_type?.name}
                                <button onClick={() => removeOverride(o.id)} className="text-wine underline">entfernen</button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <form onSubmit={submitOverride} className="grid sm:grid-cols-3 gap-2">
                          <select value={overrideForm.courseTypeId} onChange={(e) => setOverrideForm({ ...overrideForm, courseTypeId: e.target.value })} className={inputClass}>
                            {courseTypes.filter((t: any) => t.active).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
              <Field label="Produktname"><input required placeholder="z.B. 10er Karte" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Kategorie"><input required placeholder="z.B. Poledance, Kursabo" value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Preis (in Euro)"><input required type="number" step="0.01" placeholder="z.B. 220.00" value={newProduct.price_cents} onChange={(e) => setNewProduct({ ...newProduct, price_cents: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Ermäßigter Preis in Euro (optional)"><input type="number" step="0.01" placeholder="z.B. 190.00" value={newProduct.reduced_price_cents} onChange={(e) => setNewProduct({ ...newProduct, reduced_price_cents: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Guthaben in Einheiten (leer = unbegrenzt)"><input type="number" placeholder="z.B. 10" value={newProduct.credits} onChange={(e) => setNewProduct({ ...newProduct, credits: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Gültigkeit in Tagen (leer = unbegrenzt)"><input type="number" placeholder="z.B. 182" value={newProduct.valid_days} onChange={(e) => setNewProduct({ ...newProduct, valid_days: e.target.value })} className={`w-full ${inputClass}`} /></Field>
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

      {tab === "trainer" && (
        <div className="space-y-8">
          <form onSubmit={createTrainer} className="rounded-2xl p-5 border border-border bg-surface space-y-3">
            <h3 className="font-display text-lg text-ivory mb-2">Neues Trainer-Konto anlegen</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Vollständiger Name"><input required placeholder="Vorname Nachname" value={newTrainer.name} onChange={(e) => setNewTrainer({ ...newTrainer, name: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="E-Mail-Adresse (dient als Login)"><input required type="email" placeholder="name@beispiel.de" value={newTrainer.email} onChange={(e) => setNewTrainer({ ...newTrainer, email: e.target.value })} className={`w-full ${inputClass}`} /></Field>
              <Field label="Passwort (mind. 6 Zeichen)"><input required type="text" placeholder="z.B. TempPasswort123" value={newTrainer.newPassword} onChange={(e) => setNewTrainer({ ...newTrainer, newPassword: e.target.value })} className={`w-full ${inputClass}`} /></Field>
            </div>
            <p className="text-xs text-muted">Gib der Trainerin E-Mail und Passwort weiter, damit sie sich unter /trainer einloggen kann.</p>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">{saving ? "Speichere…" : "Konto anlegen"}</button>
          </form>

          <div className="space-y-3">
            <h3 className="font-display text-lg text-ivory">Bestehende Trainer:innen</h3>
            {trainers.map((t) => (
              <div key={t.id} className="rounded-2xl p-5 border border-border bg-surface">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-display text-lg text-ivory">{t.name} {!t.active && <span className="text-xs text-wine">(deaktiviert)</span>}</h4>
                    <p className="text-xs text-muted">{t.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setResetPasswordFor(t.id); setResetPasswordValue(""); }} className="text-xs px-3 py-1 rounded-full border border-border text-muted">Passwort zurücksetzen</button>
                    <button onClick={() => toggleTrainerActive(t.id, !t.active)} className={`text-xs px-3 py-1 rounded-full border border-border ${t.active ? "text-wine" : "text-gold"}`}>
                      {t.active ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </div>
                </div>
                {resetPasswordFor === t.id && (
                  <form onSubmit={submitResetPassword} className="mt-3 p-3 rounded-xl bg-bg border border-border flex gap-2 items-center">
                    <input required placeholder="Neues Passwort (mind. 6 Zeichen)" value={resetPasswordValue} onChange={(e) => setResetPasswordValue(e.target.value)} className={inputClass} />
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60 shrink-0">{saving ? "…" : "Setzen"}</button>
                    <button type="button" onClick={() => setResetPasswordFor(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted shrink-0">Abbrechen</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "meldungen" && (() => {
        const todayStr = formatDateOnly(today);
        const alerts: { severity: "rot" | "gelb"; type: string; message: string; key: string; sessionId?: string; goTo?: "anmeldungen" | "schueler" }[] = [];

        // Raum-Doppelbelegung: gleicher Raum, gleicher Tag, überlappende Zeiten
        function minutesOf(t: string) {
          const [h, m] = (t ?? "00:00").split(":").map(Number);
          return h * 60 + (m || 0);
        }
        const byRoomDay: Record<string, any[]> = {};
        sessions.filter((s) => !s.cancelled && s.room).forEach((s) => {
          (byRoomDay[`${s.room}|${s.date}`] ??= []).push(s);
        });
        Object.entries(byRoomDay).forEach(([key, list]) => {
          const sorted = [...list].sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
          for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
              const a = sorted[i], b = sorted[j];
              const aStart = minutesOf(a.time), aEnd = aStart + (a.durationMinutes ?? 70);
              const bStart = minutesOf(b.time), bEnd = bStart + (b.durationMinutes ?? 70);
              if (aStart < bEnd && bStart < aEnd) {
                alerts.push({
                  severity: "rot", type: "Raum doppelt belegt",
                  message: `${a.room} am ${a.date}: "${a.courseName}" (${a.time?.slice(0, 5)}) und "${b.courseName}" (${b.time?.slice(0, 5)}) überschneiden sich`,
                  key: `room-${key}-${a.id}-${b.id}`, sessionId: a.id, goTo: "anmeldungen",
                });
              }
            }
          }
        });

        // Trainer:in fehlt — nur bei Bezeichnungen, für die eine Trainer:in
        // als erforderlich markiert ist.
        //
        // Sonderregel Openclass: eine Openclass läuft ohne eigene Anleitung,
        // solange zeitgleich ein anderer Kurs mit Trainer:in im Studio
        // stattfindet — dann ist jemand vor Ort und die Meldung entfällt.
        function hasOverlappingStaffedCourse(s: any) {
          const start = minutesOf(s.time), end = start + (s.durationMinutes ?? 70);
          return sessions.some((o) => {
            if (o.id === s.id || o.cancelled || o.date !== s.date) return false;
            if (!o.effectiveTrainerName) return false;
            const oStart = minutesOf(o.time), oEnd = oStart + (o.durationMinutes ?? 70);
            return start < oEnd && oStart < end;
          });
        }
        sessions
          .filter((s) => !s.cancelled && s.trainerRequired && !s.effectiveTrainerName)
          .forEach((s) => {
            const isOpenclass = s.courseCategory === "Openclass";
            if (isOpenclass && hasOverlappingStaffedCourse(s)) return;
            alerts.push({
              severity: "gelb", type: "Trainer:in fehlt",
              message: `${s.courseName} am ${s.date} (${s.time?.slice(0, 5)}): keine Trainer:in eingetragen${isOpenclass ? " — auch kein zeitgleicher Kurs mit Trainer:in" : ""}`,
              key: `notrainer-${s.id}`, sessionId: s.id, goTo: "anmeldungen",
            });
          });

        sessions.forEach((s) => {
          const confirmedN = confirmedCount(s);
          if (confirmedN > s.capacity) {
            alerts.push({
              severity: "rot", type: "Überbuchung",
              message: `${s.courseName} am ${s.date} (${s.time?.slice(0, 5)}): ${confirmedN}/${s.capacity} Plätze belegt`,
              key: `ob-${s.id}`, sessionId: s.id, goTo: "anmeldungen",
            });
          }
          const confirmedParticipants = s.participants.filter((p: any) => p.status === "confirmed");
          if (!s.cancelled && s.date < todayStr && confirmedParticipants.some((p: any) => p.attended === null || p.attended === undefined)) {
            alerts.push({
              severity: "gelb", type: "Anwesenheit fehlt",
              message: `${s.courseName} am ${s.date} (${s.time?.slice(0, 5)}): Anwesenheit noch nicht vollständig erfasst`,
              key: `att-${s.id}`, sessionId: s.id, goTo: "anmeldungen",
            });
          }
          s.participants.forEach((p: any, i: number) => {
            if (p.notes) {
              alerts.push({ severity: "gelb", type: "Kommentar", message: `${p.name} – ${s.courseName} (${s.date}): "${p.notes}"`, key: `note-${s.id}-${i}`, sessionId: s.id, goTo: "anmeldungen" });
            }
            if (p.status === "confirmed" && !p.hasActiveProduct && !p.accountDeleted) {
              alerts.push({ severity: "gelb", type: "Kein aktives Produkt", message: `${p.name} – ${s.courseName} (${s.date})`, key: `prod-${s.id}-${i}`, sessionId: s.id, goTo: "anmeldungen" });
            }
          });
        });
        const allTypes = Array.from(new Set(alerts.map((a) => a.type))).sort();
        const filtered = alerts
          .filter((a) => alertFilter === "alle" || a.severity === alertFilter)
          .filter((a) => !hiddenAlertTypes.includes(a.type));
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

            {allTypes.length > 0 && (
              <div className="rounded-xl p-3 border border-border bg-surface">
                <p className="text-xs text-muted mb-2">Meldungsarten anzeigen:</p>
                <div className="flex flex-wrap gap-2">
                  {allTypes.map((t) => {
                    const hidden = hiddenAlertTypes.includes(t);
                    const count = alerts.filter((a) => a.type === t).length;
                    return (
                      <button
                        key={t}
                        onClick={() => setHiddenAlertTypes((prev) => hidden ? prev.filter((x) => x !== t) : [...prev, t])}
                        className={`text-xs px-3 py-1.5 rounded-full border ${hidden ? "border-border text-muted/50 line-through" : "border-gold text-gold"}`}
                      >
                        {t} ({count})
                      </button>
                    );
                  })}
                  {hiddenAlertTypes.length > 0 && (
                    <button onClick={() => setHiddenAlertTypes([])} className="text-xs px-3 py-1.5 rounded-full border border-border text-muted">
                      Alle einblenden
                    </button>
                  )}
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="text-sm text-muted">Keine Meldungen.</p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((a) => (
                  <li key={a.key} className={`rounded-xl p-4 border-l-4 bg-surface text-sm text-ivory ${a.severity === "rot" ? "border-red-500" : "border-yellow-400"}`}>
                    <span className={`text-xs font-semibold mr-2 ${a.severity === "rot" ? "text-red-500" : "text-yellow-400"}`}>{a.type}</span>
                    {a.message}
                    {a.sessionId && (
                      <button
                        onClick={() => {
                          const target = sessions.find((s) => s.id === a.sessionId);
                          if (target) setWeekStart(getMonday(new Date(target.date + "T00:00:00")));
                          setSelectedSessionId(a.sessionId!);
                          setShowInactive(true);
                          setTab("anmeldungen");
                        }}
                        className="ml-2 text-xs text-gold underline"
                      >
                        zum Termin
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      {tab === "einstellungen" && (
        <div className="space-y-6">
          <form onSubmit={saveSettings} className="rounded-2xl p-5 border border-border bg-surface space-y-3 max-w-2xl">
            <h3 className="font-display text-lg text-ivory mb-1">Standardeinstellungen für neue Kurse</h3>
            <p className="text-xs text-muted mb-2">
              Diese Werte sind beim Anlegen eines neuen Kurses vorausgefüllt und lassen sich dort jederzeit
              überschreiben. Wählst du beim Anlegen eine bestehende Kursbezeichnung, gewinnen deren eigene
              Vorgaben (Kapazität, Dauer) — sonst greifen die Werte hier.
            </p>
            {settingsForm && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Kapazität (Anzahl Plätze)">
                    <input type="number" value={settingsForm.default_capacity} onChange={(e) => setSettingsForm({ ...settingsForm, default_capacity: Number(e.target.value) })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Dauer (Minuten)">
                    <input type="number" value={settingsForm.default_duration_minutes} onChange={(e) => setSettingsForm({ ...settingsForm, default_duration_minutes: Number(e.target.value) })} className={`w-full ${inputClass}`} />
                  </Field>
                  <Field label="Raum">
                    <select value={settingsForm.default_room ?? ""} onChange={(e) => setSettingsForm({ ...settingsForm, default_room: e.target.value })} className={`w-full ${inputClass}`}>
                      <option value="">— keiner —</option>
                      {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Kategorie">
                    <select value={settingsForm.default_category} onChange={(e) => setSettingsForm({ ...settingsForm, default_category: e.target.value })} className={`w-full ${inputClass}`}>
                      {COURSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </Field>
                </div>
                <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
                  {saving ? "Speichere…" : "Einstellungen speichern"}
                </button>
              </>
            )}
          </form>

          <div className="rounded-2xl p-5 border border-border bg-surface max-w-2xl">
            <h3 className="font-display text-lg text-ivory mb-1">Trainer:in erforderlich</h3>
            <p className="text-xs text-muted mb-4">
              Ist der Haken gesetzt, erscheint jeder nicht abgesagte Termin dieser Bezeichnung ohne
              eingetragene Trainer:in als Meldung im Reiter „Meldungen". Für eine Openclass gilt die
              Sonderregel, dass ein zeitgleich laufender Kurs mit Trainer:in als abgedeckt zählt —
              dann kommt keine Meldung. Änderungen wirken sofort, auch auf bereits angelegte Termine.
            </p>
            {courseTypes.filter((t: any) => t.active).length === 0 ? (
              <p className="text-sm text-muted">Noch keine Kursbezeichnungen angelegt.</p>
            ) : (
              <ul className="space-y-1.5">
                {courseTypes.filter((t: any) => t.active).map((t: any) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={t.trainer_required ?? true}
                      onChange={(e) => toggleTrainerRequired(t.id, e.target.checked)}
                      className="accent-gold"
                    />
                    <span className="text-ivory">{t.name}</span>
                    <span className="text-xs text-muted">{t.category}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "log" && (
        <div className="space-y-4">
          <div className="rounded-2xl p-4 border border-border bg-surface grid sm:grid-cols-5 gap-2 items-end">
            <Field label="Von">
              <input type="date" value={logFilter.from} onChange={(e) => setLogFilter({ ...logFilter, from: e.target.value })} className={`w-full ${inputClass}`} />
            </Field>
            <Field label="Bis">
              <input type="date" value={logFilter.to} onChange={(e) => setLogFilter({ ...logFilter, to: e.target.value })} className={`w-full ${inputClass}`} />
            </Field>
            <Field label="Bearbeiter:in">
              <select value={logFilter.adminId} onChange={(e) => setLogFilter({ ...logFilter, adminId: e.target.value })} className={`w-full ${inputClass}`}>
                <option value="">Alle</option>
                {logAdmins.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Bereich">
              <select value={logFilter.entityType} onChange={(e) => setLogFilter({ ...logFilter, entityType: e.target.value })} className={`w-full ${inputClass}`}>
                <option value="">Alle</option>
                <option value="course">Kurse</option>
                <option value="customer">Schüler:innen</option>
                <option value="customer_product">Produktzuweisungen</option>
                <option value="product">Produkte</option>
                <option value="course_access">Freigaben</option>
                <option value="enrollment">Feste Zuteilung</option>
                <option value="session">Termine</option>
                <option value="booking">Buchungen</option>
                <option value="session_roster">Teilnehmerlisten</option>
                <option value="trainer">Trainer:innen</option>
              </select>
            </Field>
            <Field label="Suche (Beschreibung)">
              <input placeholder="z.B. Kursname" value={logFilter.search} onChange={(e) => setLogFilter({ ...logFilter, search: e.target.value })} className={`w-full ${inputClass}`} />
            </Field>
          </div>
          <div className="flex gap-2">
            <button onClick={loadLog} disabled={logLoading} className="px-4 py-2 rounded-full text-sm font-medium bg-gold text-bg disabled:opacity-60">
              {logLoading ? "Lade…" : "Filtern"}
            </button>
            <button onClick={exportLog} className="px-4 py-2 rounded-full text-sm border border-gold text-gold">Als Excel exportieren</button>
          </div>
          {logEntries.length === 0 ? (
            <p className="text-sm text-muted">Keine Einträge{logLoading ? "…" : " für diese Filter."}</p>
          ) : (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="px-3 py-2 font-normal">Zeitstempel</th>
                    <th className="px-3 py-2 font-normal">Bearbeiter</th>
                    <th className="px-3 py-2 font-normal">Aktion</th>
                    <th className="px-3 py-2 font-normal">Bereich</th>
                    <th className="px-3 py-2 font-normal">Beschreibung</th>
                  </tr>
                </thead>
                <tbody>
                  {logEntries.map((e: any) => (
                    <tr key={e.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{new Date(e.created_at).toLocaleString("de-DE")}</td>
                      <td className="px-3 py-2 text-ivory whitespace-nowrap">{e.admin_name}</td>
                      <td className="px-3 py-2 text-gold whitespace-nowrap">{e.action}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{e.entity_type}</td>
                      <td className="px-3 py-2 text-ivory">{e.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted">
            Dieser Log ist unveränderlich — es gibt keine Möglichkeit, Einträge über die App zu bearbeiten oder zu löschen.
            Angezeigt werden maximal die letzten 1000 Einträge (Export bis 5000).
          </p>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "#0A0910CC" }}>
          <div className="w-full max-w-md rounded-2xl p-6 bg-surface border border-border">
            <h3 className="font-display text-xl text-ivory mb-3">{confirmDialog.title}</h3>
            <p className="text-sm text-muted mb-5">{confirmDialog.message}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">Abbrechen</button>
              <button
                onClick={runConfirm}
                className={`px-4 py-2 rounded-full text-sm font-medium ${confirmDialog.danger ? "bg-wine text-ivory" : "bg-gold text-bg"}`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: "#0A0910CC" }}>
          <div className="w-full max-w-md rounded-2xl p-6 bg-surface border border-border">
            <h3 className="font-display text-xl text-ivory mb-3">Schüler:in archivieren</h3>
            <p className="text-sm text-muted mb-2">
              <span className="text-ivory">{archiveDialog.name}</span> wird ins Archiv verschoben und erscheint
              nicht mehr in der aktiven Liste. Laufende feste Zuteilungen werden beendet.
            </p>
            <p className="text-sm text-muted mb-2">
              Nach <span className="text-ivory">{retentionDays} Tagen</span> wird das Konto automatisch endgültig
              gelöscht — bis dahin ist eine Wiederherstellung jederzeit möglich.
            </p>
            <p className="text-sm text-muted mb-5">
              Vergangene Buchungen bleiben auch nach der endgültigen Löschung dauerhaft als Nachweis erhalten
              (mit Name und E-Mail).
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setArchiveDialog(null)} className="px-4 py-2 rounded-full text-sm border border-border text-muted">Abbrechen</button>
              <button onClick={submitArchive} disabled={saving} className="px-4 py-2 rounded-full text-sm font-medium bg-wine text-ivory disabled:opacity-60">
                {saving ? "Archiviere…" : "Archivieren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
