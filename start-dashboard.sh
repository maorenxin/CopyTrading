#!/bin/bash
# Start paper trading dashboard (backend + frontend)
# Usage: ./start-dashboard.sh

set -e
cd "$(dirname "$0")"

echo "🚀 Starting Paper Trading Dashboard..."
echo "   Backend:  http://localhost:8888"
echo "   Frontend: http://localhost:3000/#/dashboard"
echo ""

# Start backend
python3 -m uvicorn dashboard.main:app --host 0.0.0.0 --port 8888 &
BACKEND_PID=$!

# Start frontend dev server
npx vite --port 3000 &
FRONTEND_PID=$!

# Trap to kill both on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM

echo "✅ Both services started. Press Ctrl+C to stop."
wait
