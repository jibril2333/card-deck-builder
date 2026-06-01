import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listCredentialsForUser } from "@/lib/auth/webauthn";
import { PasskeySection } from "./passkey-section";

export const metadata = { title: "账号 · Card Deck Builder" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  const credentials = listCredentialsForUser(me.id);

  return (
    <main className="w-full mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]"
        >
          ← 返回
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-1">账号</h1>
      <div className="text-sm text-[var(--color-muted-fg)] mb-6">
        {me.display_name} · {me.email}
      </div>

      <PasskeySection
        credentials={credentials.map((c) => ({
          id: c.id,
          label: c.label || "Passkey",
          created_at: c.created_at,
          last_used_at: c.last_used_at,
        }))}
      />
    </main>
  );
}
