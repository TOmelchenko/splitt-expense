FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
