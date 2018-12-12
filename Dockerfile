FROM node:latest
RUN mkdir /app
RUN npm install -g jsonsvr
WORKDIR /app
RUN jsonsvr --init
CMD ["jsonsvr"]
