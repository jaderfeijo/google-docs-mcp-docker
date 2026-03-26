.PHONY: setup build start stop restart logs status clean compile dev dev-build dev-stop dev-logs preflight

# --- Production ---

setup:
	./setup.sh

build:
	docker compose build

start:
	docker compose up -d

stop:
	docker compose down

restart: stop start

logs:
	docker compose logs -f 2>&1 | less +F -R

status:
	docker compose ps

clean:
	docker compose down --rmi local --volumes

preflight:
	./preflight.sh

# --- Development (hot reload) ---

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

dev-build:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml build

dev-stop:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f 2>&1 | less +F -R
