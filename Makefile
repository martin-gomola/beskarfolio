# BeskarFolio - Minimal Portfolio Tracker

.PHONY: help setup dev start stop restart restart-frontend restart-backend logs rebuild rebuild-dev rebuild-frontend rebuild-backend clean status deploy deploy-front deploy-back update setup-cron cron-log sync commit price-commit rf rb

# Compose environment handling:
# - Compose only auto-loads a root `.env`
# - This repo keeps an example at `config/env.example`
# - If you create `config/.env`, Makefile will automatically pass it to docker-compose
ENV_FILE := config/.env
COMPOSE := docker-compose
ifneq ("$(wildcard $(ENV_FILE))","")
COMPOSE := docker-compose --env-file $(ENV_FILE)
endif

# Enable Docker BuildKit for faster, parallel builds with better caching
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
export BUILDKIT_PROGRESS=plain

# `make dev` merges the base compose file, which still includes the production
# frontend port binding. Use a quiet fallback port in dev so occupied 8080
# doesn't block the Vite server on localhost:3000.
DEV_FRONTEND_SHADOW_PORT ?= 38080

# Enable Docker Compose Bake for even faster parallel builds (requires Docker 20.10+)
# Delegates builds to Buildx Bake for better parallelization and cache management
export COMPOSE_BAKE=true

# Default target
help:
	@echo "🛡️  BeskarFolio - Minimal Portfolio Tracker"
	@echo "============================================"
	@echo ""
	@echo "🚀 LOCALHOST DEVELOPMENT (run these):"
	@echo ""
	@echo "   First time only:"
	@echo "   ├─ make setup     - Initial setup (build + start, run once)"
	@echo ""
	@echo "   Daily development:"
	@echo "   ├─ make dev       - Start dev mode (live reload, port 3000, fast!)"
	@echo "   ├─ make logs      - View logs (Ctrl+C to exit)"
	@echo "   ├─ make stop      - Stop all services"
	@echo "   ├─ make restart   - Quick restart (no rebuild, 5-10s)"
	@echo "   ├─ make restart-frontend - Restart frontend only (2-3s)"
	@echo "   ├─ make restart-backend  - Restart backend only (2-3s)"
	@echo "   ├─ make rebuild-dev - Rebuild all (when dependencies change)"
	@echo "   ├─ make rebuild-frontend - Rebuild frontend only (npm deps)"
	@echo "   └─ make rebuild-backend  - Rebuild backend only (pip deps)"
	@echo ""
	@echo "   Production testing locally:"
	@echo "   ├─ make start     - Start production mode (port 8080)"
	@echo "   ├─ make stop      - Stop all services"
	@echo "   └─ make restart   - Restart production mode"
	@echo ""
	@echo "   Troubleshooting:"
	@echo "   ├─ make rebuild   - Force rebuild (when things break)"
	@echo "   ├─ make clean     - Clean Docker resources"
	@echo "   └─ make status    - Check service health"
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "🚀 SERVER DEPLOYMENT:"
	@echo "   make deploy       - Deploy both (~60s)"
	@echo "   make deploy-front - Deploy frontend only (~10s) ⚡"
	@echo "   make deploy-back  - Deploy backend only (~20s) ⚡"
	@echo ""
	@echo "📊 DATA MANAGEMENT:"
	@echo "   make update        - Finalize daily closes + refresh open-market snapshots"
	@echo "   make setup-cron    - Set up automated 4-hour price refreshes"
	@echo "   make cron-log      - Check cron job log (last 50 lines)"
	@echo "   💡 Backup/restore: Use Settings page in UI"
	@echo ""
	@echo "📝 GIT:"
	@echo "   make sync         - Pull with rebase (fix diverged branches)"
	@echo "   make commit       - Stage all changes and commit"
	@echo "   make price-commit - Commit price/exchange rate updates (cron data)"
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "📍 After starting:"
	@echo "   Dev mode:      http://localhost:3000  (live reload)"
	@echo "   Production:    http://localhost:8080"
	@echo "   Backend API:   http://localhost:8060"
	@echo "   API Docs:      http://localhost:8060/docs"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LOCALHOST DEVELOPMENT COMMANDS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# First time setup
setup:
	@echo "🏗️  Setting up BeskarFolio (first time)..."
	@echo "🔨 Building Docker images..."
	$(COMPOSE) build
	@echo "🚀 Starting services..."
	$(COMPOSE) up -d
	@echo ""
	@echo "✅ Setup complete!"
	@echo ""
	@echo "📍 BeskarFolio is running at:"
	@echo "   Frontend:  http://localhost:8080"
	@echo "   Backend:   http://localhost:8060"
	@echo "   API Docs:  http://localhost:8060/docs"
	@echo ""
	@echo "💡 Next steps:"
	@echo "   • Use 'make dev' for daily development"
	@echo "   • Use 'make logs' to view logs"
	@echo "   • Use 'make stop' to stop services"

# Start production mode locally (port 8080)
start:
	@echo "🚀 Starting production mode..."
	@echo "📦 Building if needed..."
	$(COMPOSE) up -d --build
	@echo ""
	@echo "✅ Production mode started!"
	@echo "🌐 Frontend: http://localhost:8080"
	@echo "📡 Backend:  http://localhost:8060"
	@echo ""
	@echo "💡 Use 'make logs' to view logs"

# Start development mode (live reload, port 3000) - FAST!
dev:
	@echo "🚀 Starting development mode (fast start, no rebuild)..."
	@echo "📝 Live reload enabled for backend and frontend"
	FRONTEND_PORT=$(DEV_FRONTEND_SHADOW_PORT) $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo ""
	@echo "✅ Development mode started!"
	@echo "🌐 Frontend: http://localhost:3000 (Vite dev server)"
	@echo "📡 Backend:  http://localhost:8060 (live reload)"
	@echo ""
	@echo "💡 Code changes will automatically reload (no restart needed)!"
	@echo "💡 Use 'make logs' to view logs"
	@echo "💡 Use 'make stop' to stop services"
	@echo "💡 Dependencies changed? Run 'make rebuild-dev' once"

# Stop all services
# Tries production-only first, then falls back to dev mode if needed
# This ensures cleanup regardless of which mode was used to start services
stop:
	@echo "🛑 Stopping all services..."
	@$(COMPOSE) down 2>/dev/null || $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml down 2>/dev/null || true
	@echo "✅ All services stopped"

# Quick restart (no rebuild) - FAST!
restart:
	@echo "🔄 Quick restart (no rebuild, 5-10 seconds)..."
	@make stop
	@make dev
	@echo "⚡ Restart complete!"

# Restart individual services (even faster!)
rf:
	@echo "🔄 Restarting frontend only (2-3 seconds)..."
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml restart frontend
	@echo "✅ Frontend restarted!"

rb:
	@echo "🔄 Restarting backend only (2-3 seconds)..."
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml restart backend
	@echo "✅ Backend restarted!"

# Friendly aliases (match the names shown in `make help`)
restart-frontend: rf
restart-backend: rb

# View logs (Ctrl+C to exit)
logs:
	@echo "📋 Showing logs from all services (Ctrl+C to exit)..."
	$(COMPOSE) logs -f

# Force rebuild everything (when things break)
rebuild:
	@echo "🔨 Force rebuilding all images (no cache)..."
	@echo "⚠️  This will take a few minutes..."
	$(COMPOSE) build --no-cache
	@echo "✅ Rebuild complete!"
	@echo "💡 Now run 'make dev' or 'make start' to start services"

# Rebuild dev containers (only when dependencies change)
rebuild-dev:
	@echo "🔨 Rebuilding dev containers with cache..."
	@echo "💡 Use this when you add/remove npm or pip dependencies"
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml build
	@make stop
	@make dev
	@echo "✅ Dev rebuild complete and services started!"

# Rebuild individual services (when dependencies change)
rebuild-frontend:
	@echo "🔨 Rebuilding frontend only..."
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml build frontend
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate --no-deps frontend
	@echo "✅ Frontend rebuilt and restarted!"

rebuild-backend:
	@echo "🔨 Rebuilding backend only..."
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml build backend
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate --no-deps backend
	@echo "✅ Backend rebuilt and restarted!"

# Check service health
status:
	@echo "📊 Service Status:"
	@echo ""
	$(COMPOSE) ps
	@echo ""
	@echo "🏥 Health Checks:"
	@curl -fsS http://localhost:8060/health >/dev/null 2>&1 && echo "✅ Backend: Healthy (port 8060)" || echo "❌ Backend: Not responding"
	@curl -fsS http://localhost:$${FRONTEND_PORT:-8080} >/dev/null 2>&1 && echo "✅ Frontend: Healthy (nginx port 80 → host port $${FRONTEND_PORT:-8080})" || echo "❌ Frontend: Not responding"
	@echo ""
	@echo "💡 Use 'make logs' to view detailed logs"

# Clean up Docker resources
clean:
	@echo "🧹 Cleaning up Docker resources..."
	docker system prune -f
	@echo "✅ Cleanup complete"
	@echo ""
	@echo "💡 This frees up disk space but doesn't affect your data"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATA MANAGEMENT COMMANDS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Remove duplicate transactions

# Update prices and exchange rates (runs OUTSIDE Docker to bypass yfinance blocking)
update:
	@echo "💰 Updating portfolio data (exchange rates + market-aware price refresh)..."
	@python3 scripts/update_portfolio_data.py
	@echo ""
	@echo "✅ Portfolio data updated!"
	@echo "💡 Backend will auto-reload on next request (cache invalidation)"
	@echo "💡 Refresh your browser to see updated data"

# Set up automated daily price updates (cron job)
setup-cron:
	@echo "⏰ Setting up automated market-hour price updates..."
	@echo ""
	@echo "This will add a cron job that runs every 4 hours."
	@echo "The updater finalizes daily closes and only refreshes snapshots for markets that are open."
	@echo ""
	@echo "Current directory: $(shell pwd)"
	@echo ""
	@echo "Add this line to your crontab (run: crontab -e):"
	@echo ""
	@echo "  0 */4 * * * /bin/bash $(shell pwd)/scripts/daily_price_update.sh >> $(shell pwd)/logs/price_update.log 2>&1"
	@echo ""
	@echo "Or run this command to add it automatically:"
	@echo ""
	@echo '  (crontab -l 2>/dev/null; echo "0 */4 * * * /bin/bash $(shell pwd)/scripts/daily_price_update.sh >> $(shell pwd)/logs/price_update.log 2>&1") | crontab -'
	@echo ""
	@echo "💡 Create logs directory first: mkdir -p $(shell pwd)/logs"
	@echo "💡 Check logs with: make cron-log"

# Check cron job log (last price update)
cron-log:
	@echo "📋 Price Update Cron Log"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@if [ -f logs/price_update.log ]; then \
		echo "📁 File: logs/price_update.log"; \
		echo "📅 Last modified: $$(stat -f '%Sm' logs/price_update.log 2>/dev/null || stat -c '%y' logs/price_update.log 2>/dev/null | cut -d'.' -f1)"; \
		echo "📏 Size: $$(du -h logs/price_update.log | cut -f1)"; \
		echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
		echo ""; \
		echo "📜 Last 50 lines:"; \
		echo ""; \
		tail -50 logs/price_update.log; \
	else \
		echo "❌ Log file not found: logs/price_update.log"; \
		echo ""; \
		echo "💡 The cron job hasn't run yet, or logs directory doesn't exist."; \
		echo "   Run 'make setup-cron' for setup instructions."; \
	fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SERVER DEPLOYMENT COMMANDS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Deploy both frontend and backend
deploy:
	@echo "🚀 Deploying BeskarFolio (frontend + backend)..."
	@echo "💡 Using BuildKit for optimized builds"
	@echo ""
	$(COMPOSE) up -d --build --remove-orphans
	@echo ""
	@echo "✅ Deployment complete!"
	@echo "🌐 Frontend: http://localhost:8080"
	@echo "📡 Backend: http://localhost:8060"
	@echo ""
	@echo "💾 Data: Browser localStorage (isolated per browser)"
	@echo "💡 Check status: make status"

# Deploy with clean Docker cache (use when npm packages fail)
deploy-clean:
	@echo "🧹 Clearing Docker build cache..."
	docker builder prune -f
	@echo "🚀 Deploying with fresh cache..."
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --remove-orphans
	@echo "✅ Clean deployment complete!"

# Deploy frontend only (builds locally for speed)
deploy-front:
	@echo "🎨 Deploying frontend only..."
	@if [ ! -d "frontend/node_modules" ]; then \
		echo "📦 Installing dependencies (first time only)..."; \
		cd frontend && npm ci; \
	fi
	@echo "📦 Building frontend locally (fast!)..."
	@cd frontend && npm run build
	@echo "🐳 Copying to container..."
	@docker cp frontend/dist/. beskarfolio-web:/usr/share/nginx/html/
	@echo "🔄 Reloading nginx..."
	@docker exec beskarfolio-web nginx -s reload 2>/dev/null || true
	@echo "✅ Frontend deployed!"
	@echo "🌐 http://localhost:8080"

# Deploy backend only
deploy-back:
	@echo "⚙️  Deploying backend only..."
	$(COMPOSE) build backend
	$(COMPOSE) up -d --no-deps backend
	@echo "✅ Backend deployed!"
	@echo "📡 http://localhost:8060"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GIT HELPER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Pull with rebase (resolves diverging branches from server price commits)
sync:
	@echo "🔄 Syncing with remote (rebase)..."
	@git pull --rebase origin main
	@echo "✅ Synced!"

# Stage all changes and commit (interactive)
commit:
	@echo "📝 Staging all changes..."
	@git add -A
	@echo ""
	@echo "💬 Enter commit message:"
	@bash -c 'read -p "> " msg; if [ -z "$$msg" ]; then echo "❌ Commit cancelled (empty message)"; exit 1; fi; git commit -m "$$msg"'
	@echo ""
	@echo "✅ Committed successfully!"
	@echo "💡 To push: git push"

# Commit price & exchange rate updates from cron job
# Pulls first (rebase to keep history clean), commits, then pushes
price-commit:
	@echo "💰 Syncing and committing price data..."
	@echo "⬇️  Pulling latest changes..."
	@git stash --include-untracked -q 2>/dev/null || true
	@git pull --rebase --autostash origin main -q 2>/dev/null || git pull --rebase origin main
	@git stash pop -q 2>/dev/null || true
	@git add backend/data/historical_prices/*.csv backend/data/exchange_rates.json 2>/dev/null || true
	@if git diff --cached --quiet; then \
		echo "ℹ️  No price data changes to commit"; \
	else \
		git commit -m "price update $$(date +%Y-%m-%d)"; \
		echo "⬆️  Pushing to remote..."; \
		git push origin main; \
		echo "✅ Price data committed and pushed!"; \
	fi
