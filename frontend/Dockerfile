# FROM node:22-alpine

# WORKDIR /app

# COPY package*.json ./

# RUN npm install

# COPY . .

# EXPOSE 5173

# CMD [ "npm" , "run" , "dev" , "--" , "--host", "0.0.0.0" ]

# ---------------------------STAGE-1----------------------------------

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# to create to create /app/dist
RUN npm run build

# ----------------------------STAGE-2-----------------------------------

FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/vite.config.js ./vite.config.js

USER node

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
