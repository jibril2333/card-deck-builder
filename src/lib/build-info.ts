/**
 * Which build is this.
 *
 * `CDB_GIT_SHA` is baked into the image's last layer by the CI build (see the
 * Dockerfile's ARG and .github/workflows/image.yml); `CDB_BUILT_AT` rides
 * along with it. Neither exists when running from source, and that's the
 * signal for "dev" — a local `next dev` has no build to name.
 *
 * The point of showing it at all: "did my push actually land on the NAS?" is
 * a question that HTTP 200 cannot answer — the container that was already
 * running answers 200 too. /api/health carries the same sha for machines;
 * this is the version for people.
 *
 * Server-only: reads process.env, so call it from a Server Component and pass
 * the result down.
 */
export type BuildInfo = {
  /** Full commit sha, or null when running from source. */
  sha: string | null;
  /** First 7 chars — what people actually read. */
  short: string;
  /** ISO timestamp of the build, when CI supplied one. */
  builtAt: string | null;
  /** Link to the commit on GitHub, when there is a sha to link. */
  url: string | null;
};

const REPO = "https://github.com/jibril2333/card-deck-builder";

export function buildInfo(): BuildInfo {
  const sha = process.env.CDB_GIT_SHA?.trim() || null;
  const builtAt = process.env.CDB_BUILT_AT?.trim() || null;
  return {
    sha,
    short: sha ? sha.slice(0, 7) : "dev",
    builtAt,
    url: sha ? `${REPO}/commit/${sha}` : null,
  };
}
