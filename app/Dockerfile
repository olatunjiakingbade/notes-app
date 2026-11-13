# Container image for the notes app. GitHub Actions builds it. You do not need
# Docker on your laptop.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so Docker can cache this layer.
COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Run as the non-root "node" user that ships with the base image.
USER node

EXPOSE 3000
CMD ["node", "server.js"]
