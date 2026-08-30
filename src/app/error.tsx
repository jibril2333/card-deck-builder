"use client";

import { ErrorPanel } from "@/components/error-panel";

/**
 * Root error boundary — the pages outside /[game] (login, register, account)
 * had none, so a failure there fell through to the framework's own blank
 * screen. Passkey enrolment lives on one of them, and it calls server actions
 * like everything else.
 */
export default function RootError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel {...props} />;
}
