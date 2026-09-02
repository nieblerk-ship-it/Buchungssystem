import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminAuth";
import { collectHours, toHours, currentMonthRange } from "@/lib/hours";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/hours/export?from=&to=&trainerId=
// Dieselbe Auswertung wie /api/admin/hours, aber als .xlsx mit zwei
// Tabellenblättern: eine Übersicht je Person und eine Zeile je Termin,
// damit sich jede Summe nachvollziehen lässt.
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

  const url = new URL(req.url);
  const fallback = currentMonthRange();
  const from = url.searchParams.get("from") || fallback.from;
  const to = url.searchParams.get("to") || fallback.to;
  const trainerId = url.searchParams.get("trainerId") || null;

  const db = supabaseAdmin();
  const groups = await collectHours(db, from, to, trainerId);

  const de = (d: string) => d.split("-").reverse().join(".");

  const summary = groups.map((g) => ({
    "Trainer:in": g.name,
    Art: g.kind === "account" ? "Trainer-Konto" : g.kind === "guest" ? "ohne Konto" : "nicht besetzt",
    Termine: g.sessionCount,
    Stunden: toHours(g.minutes),
  }));
  summary.push({
    "Trainer:in": "Gesamt",
    Art: "",
    Termine: groups.reduce((n, g) => n + g.sessionCount, 0),
    Stunden: toHours(groups.reduce((n, g) => n + g.minutes, 0)),
  });

  const detail = groups.flatMap((g) =>
    g.sessions.map((s) => ({
      "Trainer:in": g.name,
      Datum: de(s.date),
      Uhrzeit: s.time?.slice(0, 5) ?? "",
      Kurs: s.courseName,
      Level: s.level ?? "",
      Raum: s.room ?? "",
      Minuten: s.durationMinutes,
      Stunden: toHours(s.durationMinutes),
      Vertretung: s.isSubstitute ? "ja" : "",
    }))
  );

  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Übersicht");

  const wsDetail = XLSX.utils.json_to_sheet(detail);
  wsDetail["!cols"] = [
    { wch: 26 }, { wch: 12 }, { wch: 9 }, { wch: 26 }, { wch: 14 },
    { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 11 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Termine");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="stunden_${from}_bis_${to}.xlsx"`,
    },
  });
}
