import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verticale Pole Studio – Buchung",
  description: "Kurse, Einzeltermine und Mitgliedschaften buchen.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="font-body">{children}</body>
    </html>
  );
}
