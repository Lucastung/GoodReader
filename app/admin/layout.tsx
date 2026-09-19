import type { Metadata } from "next";
import { AdminShell } from "./AdminShell";
import "./admin.css";

export const metadata: Metadata = { title: "後台｜好好讀書", robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
