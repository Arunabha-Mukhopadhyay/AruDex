# See https://docs.docker.com/engine/reference/builder/
# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (adjust if needed)
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
