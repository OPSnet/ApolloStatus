FROM node:8-alpine
ADD . /srv
WORKDIR /srv
EXPOSE 3000
RUN npm install && npm install nodemon
CMD ["node_modules/.bin/nodemon", "apollostatus.js"]