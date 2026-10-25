"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRequireRole } from "@/components/auth";

export default function Dashboard() {
  const { me } = useRequireRole();
  const router = useRouter();
  useEffect(() => {
    if (me) router.replace(`/${me.profile.role}`);
  }, [me, router]);
  return <p className="text-muted">Loading…</p>;
}
