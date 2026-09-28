FROM node:22-alpine

WORKDIR /app

COPY core.mjs server.mjs ./

RUN chown -R node:node /app

USER node

CMD ["node", "server.mjs"]
