.PHONY: install check test coverage run docker-build docker-run

install:
	npm ci

check:
	npm run check

test:
	npm test

coverage:
	npm run test:coverage

run:
	npm start

docker-build:
	docker build --tag autodeploy:local .

docker-run:
	docker compose up --build
