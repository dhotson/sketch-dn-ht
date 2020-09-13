start-dev:
	PORT=8000 docker-compose up

deploy:
	COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose build
	docker-compose push
	ecs-cli compose --verbose service up --target-groups 'targetGroupArn=arn:aws:elasticloadbalancing:us-east-1:517252388151:targetgroup/sketch-dn-ht/47bad7d0c178a71a,containerPort=8000,containerName=web' --force-deployment
