FROM node:14-alpine

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN yarn build

CMD [ "yarn", "start" ]

EXPOSE 8000
