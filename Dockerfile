# Use a lightweight Node.js image
FROM node:22-alpine

# Set working directory inside container
WORKDIR /usr/src/app

# Patch Alpine system packages (openssl etc.)
RUN apk upgrade --no-cache

# Install dependencies
COPY package*.json ./
RUN apk add --no-cache python3 make g++ xz-dev && \
    npm ci --omit=dev && \
    apk del python3 make g++

# Copy application code
COPY . .

# Expose the port the addon listens on
EXPOSE 7000

# Run the server
CMD ["npm", "start"]
