import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GroupManager } from "@/components/groups/group-manager";
import { listGroups } from "@/features/groups/service";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Grupos — Poll" };

// T08: grupos de pesquisas (RF-16). As pesquisas entram num grupo pelo construtor.
export default function GroupsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Grupos</h1>
      <Suspense fallback={<GroupsSkeleton />}>
        <Groups />
      </Suspense>
    </main>
  );
}

async function Groups() {
  await connection();
  const admin = await requireAdmin();
  return <GroupManager groups={await listGroups(admin.id)} />;
}

function GroupsSkeleton() {
  return (
    <ul aria-label="Carregando grupos" aria-busy="true" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
      ))}
    </ul>
  );
}
