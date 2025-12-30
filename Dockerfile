# Use Node.js 20 slim as the base image for building
FROM node:20-slim AS builder

# Set the working directory
WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the TypeScript project
RUN npm run build

# Use a smaller image for the final production run
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the compiled JS from the builder stage
COPY --from=builder /app/dist ./dist

# Copy static assets and public files needed at runtime
COPY --from=builder /app/public ./public
COPY --from=builder /app/assets ./assets

# Expose the port the app runs on
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
