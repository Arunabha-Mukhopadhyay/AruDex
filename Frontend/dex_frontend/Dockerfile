# Use Node.js for building the frontend
FROM node:22-alpine as build
WORKDIR /app

# Allow the backend URL to be injected at build time (defaults to localhost for dev).
ARG VITE_BACKEND_URL=http://localhost:3000
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

COPY package*.json ./
# Install build prerequisites for native deps (e.g., bufferutil).
RUN apk add --no-cache python3 make g++ \
  && npm install
COPY . .
RUN npm run build

# Use nginx to serve the built files
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
