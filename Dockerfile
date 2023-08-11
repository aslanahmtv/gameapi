FROM node:14

WORKDIR /app
RUN apk add --no-cache npm
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3001
EXPOSE 3000
EXPOSE 27017

FROM nginx:1.19-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=0 /app/dist /usr/share/nginx/html
RUN npm install -g pm2

CMD pm2-runtime start /app/server.js --name my-app --watch --no-daemon