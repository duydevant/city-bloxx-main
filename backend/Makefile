ps:
	docker compose ps
build:
	docker compose up -d --build
up:
	docker compose up -d
down:
	docker compose down -v
stop:
	docker compose stop
node:
	docker compose exec node sh
db:
	docker compose exec db bash
install:
	docker compose exec node yarn
dev:
	docker compose exec node yarn start:dev
buildNest:
	docker compose exec node yarn build
setup:
	make build
	docker compose exec node npm i -g @nestjs/cli
	make install
migrationCreate:
	yarn migrate:create src/database/migrations/$(n)
migrationGen:
	docker compose exec node yarn migrate:gen src/database/migrations/$(n)
migrate:
	docker compose exec node yarn migrate:run
migrationRevert:
	docker compose exec node yarn migrate:revert
seedConfig:
	docker compose exec node yarn seed:config
seedRun:
	docker compose exec node yarn seed:run
seedRunOne:
	docker compose exec node yarn seed:runOne $(class)
ut:
	docker compose exec node yarn test
e2e:
	docker compose exec node yarn test:e2e
genModule:
	docker compose exec node npx @nestjs/cli g res $(n)
runCommand:
	docker compose exec node yarn command:run $(c)