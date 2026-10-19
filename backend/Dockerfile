# --- Dépendances de production uniquement ---
FROM node:24-alpine AS production-dependencies-env
WORKDIR /app
COPY package.json package-lock.json ./
# sharp installe un binaire natif : il doit être résolu dans l'image (linux/musl),
# jamais copié depuis la machine hôte.
RUN npm ci --omit=dev

# --- Image finale ---
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies-env /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
EXPOSE 3001
USER node
CMD ["npm", "start"]
