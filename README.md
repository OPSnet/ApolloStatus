ApolloStatus
============
Check the health of a site, tracker, and IRC.

ApolloStatus is a simple status page for torrent sites.
It's powered by [Express](http://expressjs.com/) and [Redis](https://redis.io).

It's based on [WhatStatus](https://github.com/dewey/WhatStatus) as well as inspiration
of certain features from [TrackerStatus](https://trackerstatus.info).

# Configure ApolloStatus

To make ApolloStatus more easily extendable, you can need to copy `config.json.template`
to `config.json` and edit it to match the paths to your site, IRC, and tracker.

# Running ApolloStatus
There are two methods for running and using ApolloStatus. The two covered methods
are through Docker or Locally. The first step is to clone this repository:
```
git clone https://github.com/ApolloRIP/ApolloStatus
```

When running ApolloStatus under either mode, it recognizes the following enviroment
variables:

Variable   | Description                                                       | Default
-----------|-------------------------------------------------------------------|--------
LOG_LEVEL  | Level of messages to log. Can set to debug, info, warn, or error. | warn
REDIS_HOST | Host of Redis that ApolloStatus should attempt to connect to.     | 127.0.0.1
REDIS_PORT | Port of Redis that ApolloStatus should attempt to connect to.     | 6379
PORT       | Port that ApolloStatus should use.                                | 3000

## Docker
The easiest way is to use [Docker Compose](https://docs.docker.com/compose/) and utilize
the included `docker-compose.yml` file that will handle spinning up two containers (one
for apollostatus and one for Redis) and setup the network bridge between the two applications.
To use it, you'll just need to do `docker-compose up` which will handle building the local
`Dockerfile` (which is for ApolloStatus), downloading the necessary Redis container, setting
up a persistent volume layer for Redis, export port 3000 of the ApolloStatus container, and 
ensures that the containers restart automatically if they go stop for whatever reason 
(unless explicitly stopped via `docker-compose down`). You can do all of this yourself as 
well if desired, utilizing just the builtin `Dockerfile`, doing 
`docker build . -t apollo/apollostatus:latest` and then running it via `docker run`.

### Prerequisites
The first (and easiest) is
to use the included [Docker Compose](https://docs.docker.com/compose/) setup. This requires
that you have Docker and Docker Compose installed. Usage is then as simple as:
```docker-compose up```

This will spin up two containers, one for the redis server and one for the actual service.
The site container exposes port 3000 for TCP by default so you can access it by going to
`http://localhost:3000`.

## Locally
- Install [Node.JS](http://nodejs.org/) and [NPM](https://www.npmjs.com/)
- Install [Redis](http://redis.io/)
- Navigate to the directory and run (as non-root user):
```
npm install
```
which will install all the dependencies listed in `package.json`

To then run the site, you just need to do `node apollostatus.js`. To setup the site to 
run permanently without you needing to start/stop it, it's recommended that you use
[pm2](http://pm2.keymetrics.io/) (an alternative is [forever](https://www.npmjs.com/package/forever)).

The app is now running on port 3000. To serve it on your regular port 443 or 80 you'll have to setup nginx like this:

# Nginx Configuration
To setup nginx to make your application accessible outside of localhost, you will want 
to setup your location block to be:

```
{
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $http_host;
    proxy_set_header X-NginX-Proxy true;
    proxy_pass http://127.0.0.1:3000/;
    proxy_redirect off;
}
``` 
This will setup nginx that whenever a user visits the location you specify (whether it's 
`/` or `/status` or whatever) to proxy that connection to our NodeJS application which is 
listening to port 3000. This should be done when running the application locally
or via Docker.
