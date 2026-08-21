import { notFound } from "next/navigation";
import { isGameId } from "@/lib/games";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { listCredentialsForUser } from "@/lib/auth/webauthn";
import { PasskeySection } from "@/app/account/passkey-section";
import { DataSection } from "@/app/account/data-section";
import { summarizeUserData } from "@/lib/db/user-transfer";
import { describeCounts } from "@/lib/user-data";
import { RefreshCardsPanel } from "@/components/refresh-cards-panel";
import { RefreshSchedulePanel } from "@/components/refresh-schedule-panel";
import { RefreshChangesPanel } from "@/components/refresh-changes-panel";
import { NtfyPanel } from "@/components/ntfy-panel";

/**
 * One settings page, with the sections a person is allowed to see.
 *
 * Account settings and card-data administration used to be two pages behind
 * two different gates, and the split was drawn along how the code is protected
 * rather than along what the reader came to do. Now everyone signed in gets
 * their own account here, and the four data panels appear for admins.
 */
export const metadata = { title: "设置 · DCG Deck Builder" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  const me = await getCurrentUser();
  // 404 rather than a sign-in prompt: an anonymous visitor has no settings,
  // and the page shouldn't advertise what it would contain.
  if (!me) notFound();
  const admin = await isAdmin();

  return (
    <main className="w-full mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">设置</h1>
        <div className="text-sm text-[var(--color-muted-fg)]">
          {me.display_name} · {me.email}
        </div>
      </div>

      {admin ? (
        <>
          <RefreshCardsPanel />
          <RefreshSchedulePanel />
          <RefreshChangesPanel />
          <NtfyPanel />
        </>
      ) : null}

      <PasskeySection
        credentials={listCredentialsForUser(me.id).map((c) => ({
          id: c.id,
          label: c.label || "Passkey",
          created_at: c.created_at,
          last_used_at: c.last_used_at,
        }))}
      />
      {/* What the export would contain, so the tile can say it before you
          click rather than after you open the file. */}
      <DataSection mine={describeCounts(summarizeUserData(me.id))} />
    </main>
  );
}
