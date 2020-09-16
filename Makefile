start-dev:
	yarn watch &
	yarn start-dev

deploy: export TAG = ${shell date +"%Y%m%d%H%M%S"}
deploy:
	COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose build
	docker-compose push
	ecs-cli compose --verbose service up \
		--cluster-config au --target-groups 'targetGroupArn=arn:aws:elasticloadbalancing:ap-southeast-2:517252388151:targetgroup/sketch-dn-ht/e6f156b809e520ed,containerPort=8000,containerName=web'
