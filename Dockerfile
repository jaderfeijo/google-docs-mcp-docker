FROM node:20-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy compiled TypeScript output (run `make compile` before `make build`)
COPY dist/ dist/

# Default port — override via PORT env var
ENV PORT=8080

EXPOSE 8080

CMD ["node", "dist/index.js"]
