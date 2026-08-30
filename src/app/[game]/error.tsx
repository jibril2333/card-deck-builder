"use client";

import { ErrorPanel } from "@/components/error-panel";

/**
 * Error boundary for the [game] segment: anything a server component or a
 * server action below this point throws. The panel is shared with the root
 * boundary — see components/error-panel.
 */
export default function GameError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel {...props} />;
}
