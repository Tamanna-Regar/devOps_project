FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Build-time API URL passed from CI/CD or docker build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


FROM nginx:alpine

# Configure Nginx for Single Page Application (SPA) routing
RUN printf 'server {\n\
    listen 80;\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]