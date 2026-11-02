FROM node:22-alpine AS build
WORKDIR /w
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web .
ENV VITE_API_BASE_URL=""
RUN npm run build
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /w/dist /usr/share/nginx/html
