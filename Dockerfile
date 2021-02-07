FROM node:14-alpine as BASE

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN ./node_modules/.bin/esbuild --sourcemap --bundle src/client.tsx --outfile=public/client.js
RUN ./node_modules/.bin/esbuild --platform=node --sourcemap --bundle src/server.ts --outfile=src/server.js 

RUN yarn build

FROM node:14-slim
WORKDIR /usr/src/app
COPY --from=BASE /usr/src/app/public ./public
COPY --from=BASE /usr/src/app/src/server.js src/server.js

CMD [ "node", "src/server.js" ]

EXPOSE 8000
