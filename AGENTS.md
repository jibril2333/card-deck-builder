<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Local servers

The owner runs two parallel servers locally:

- **3000** = dev (`npm run dev`)
- **3001** = prod (`npm run build && npm start -- -p 3001`)

**After completing any code change session, restart both** so the owner can see the new code immediately without manual steps:

1. `lsof -iTCP:3000 -sTCP:LISTEN` + `lsof -iTCP:3001 -sTCP:LISTEN` to find PIDs
2. Walk up to parent `npm run dev` / `npm run start` processes (use `ps -o pid,ppid -p <pid>`) and `kill` those — that releases both worker PIDs cleanly
3. **`rm -rf .next/prod`** — incremental `next build` over a populated dir leaves stale chunk hashes; the served HTML references chunks that no longer exist on disk → ChunkLoadError. Always start from a clean .next/prod.
4. `npm run build` (rebuilds 3001 from scratch)
5. `npm run dev` in background (3000)
6. `npm start -- -p 3001` in background (3001)
7. Verify both ports are listening before reporting done

"Code change" here means a meaningful unit (a feature, a stage, a bug-fix), not every individual Edit. Don't restart between intermediate edits.
