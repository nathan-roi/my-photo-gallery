# --- Build des fichiers statiques ---
FROM node:24-alpine AS build-env
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Service des fichiers statiques ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-env /app/dist /usr/share/nginx/html
EXPOSE 80
