FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
COPY public ./public
CMD ["node", "server.js"]