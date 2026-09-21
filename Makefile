.PHONY: help all setup build build-frontend build-backend dev dev-frontend dev-backend test test-frontend test-backend lint lint-frontend lint-backend clean docker-up docker-down docker-build run

# Default target
all: help

help: ## Print this help message
	@echo "Usage:"
	@echo "  make <target>"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --- Setup ---
setup: ## Install frontend dependencies
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# --- Build ---
build-frontend: ## Build the frontend for production
	@echo "Building frontend..."
	cd frontend && npm run build

build-backend: ## Build the backend for production
	@echo "Building backend..."
	cargo build --release

build: build-frontend build-backend ## Build both frontend and backend

# --- Run ---
run: ## Run the production backend server
	@echo "Running backend server..."
	./target/release/tune-tracker

# --- Development ---
dev-frontend: ## Start frontend dev server
	@echo "Starting frontend dev server..."
	cd frontend && npm run dev -- --host

dev-backend: ## Start backend dev server
	@echo "Starting backend dev server..."
	cargo run

dev: ## Start both dev servers concurrently
	@echo "Starting development servers (Requires 'make' with '-j' support)..."
	@$(MAKE) -j2 dev-frontend dev-backend

# --- Testing ---
test-frontend: ## Run frontend tests
	@echo "Running frontend tests..."
	cd frontend && npm run test

test-backend: ## Run backend tests
	@echo "Running backend tests..."
	cargo test

test: test-backend test-frontend ## Run all tests

# --- Linting ---
lint-frontend: ## Lint frontend code
	@echo "Linting frontend..."
	cd frontend && npm run lint

lint-backend: ## Lint backend code
	@echo "Linting backend..."
	cargo clippy -- -D warnings
	cargo fmt -- --check

lint: lint-backend lint-frontend ## Run all linters

# --- Cleaning ---
clean: ## Clean build artifacts
	@echo "Cleaning project..."
	cargo clean
	rm -rf frontend/dist frontend/node_modules

# --- Docker ---
docker-build: ## Build docker images
	@echo "Building docker images..."
	docker compose build

docker-up: ## Start docker containers
	@echo "Starting docker containers..."
	docker compose up --build

docker-down: ## Stop docker containers
	@echo "Stopping docker containers..."
	docker compose down
