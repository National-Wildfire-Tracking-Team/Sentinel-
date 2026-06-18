#!/usr/bin/env bash

# Start ipaws-server in background, then run vite dev server
node server/ipaws-server.js &
IPAWS_PID=$!

echo "ipaws-server started (PID: $IPAWS_PID) on port 3847"

# Run vite (bun run dev)
bun run dev

# Cleanup: kill ipaws-server when vite exits
kill $IPAWS_PID 2>/dev/null
