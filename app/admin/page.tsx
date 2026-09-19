"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAdmin } from "./AdminShell";

export default function AdminHome() {
  const me = useAdmin();
  const router = useRouter();
  useEffect(() => router.replace(me.role === "admin" ? "/admin/stats" : "/admin/texts"), [me, router]);
  return null;
}
