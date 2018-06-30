const express = require('express'),
  bodyParser = require('body-parser'),
  errorHandler = require('errorhandler'),
  favicon = require('serve-favicon'),
  morgan = require('morgan'),
  net = require('net'),
  path = require('path'),
  redis = require('redis'),
  CronJob = require('cron').CronJob,
  request = require('request'),
  winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'warn',
  format: winston.format.json(),
  transports: [new winston.transports.Console({format: winston.format.simple()})]
});

const config = require('./config.json');

const app = express();
const db = redis.createClient(process.env.REDIS_PORT || 6379, process.env.REDIS_HOST || '127.0.0.1');
const page_title = `Status :: ${config['site_name']}`;

// Catch connection errors if redis-server isn't running
db.on('error', function (err) {
  logger.error(err.toString());
  logger.error('       Make sure redis-server is started and listening for connections.');
});

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(express.static(path.join(__dirname, 'public')));

if (app.get('env') === 'development') {
  app.use(errorHandler());
  app.locals.pretty = true;
  app.use(morgan('dev'));
}

//////////////////////////////////
// HTML ENDPOINTS
//////////////////////////////////

// Render the index page
app.get('/', (req, res) => {
  res.render('index', {
    title: page_title,
    logo_url: 'images/logos/logo.png'
  });
});

// Render the Stats page
app.get('/stats', (req, res) => {
  res.render('stats', {
    title: page_title
  });
});

app.get('/api', (req, res) => {
  res.render('api', {
    title: page_title
  });
});

// Render the About page
app.get('/about', (req, res) => {
  res.render('about', {
    title: page_title
  });
});

// Render the FAQ page
app.get('/faq', (req, res) => {
  res.render('faq', {
    title: page_title
  });
});

//////////////////////////////////
// API ENDPOINTS
//////////////////////////////////

// JSON Response for current component status
app.get('/api/status', (req, res) => {
  db.mget(['status:site', 'status:irc', 'status:tracker', 'status:httptracker'], (err, results) => {
    res.json({
      site: parseInt(results[0]),
      irc: parseInt(results[1]),
      tracker: parseInt(results[2]),
      httptracker: parseInt(results[3])
    });
  });
});

app.get('/api/latency', (req, res) => {
  db.mget(['latency:site', 'latency: tracker', 'latency: httptracker'], (err, results) => {
    res.json({
      site: parseInt(results[0]),
      tracker: parseInt(results[1]),
      httptracker: parseInt(results[2])
    });
  });
});

// JSON Response for uptime values
app.get('/api/uptime', (req, res) => {
  db.mget(['uptime:site', 'uptime:irc', 'uptime:tracker', 'uptime:httptracker'], (err, results) => {
    res.json({
      site: parseInt(results[0]),
      irc: parseInt(results[1]),
      tracker: parseInt(results[2]),
      httptracker: parseInt(results[3])
    });
  });
});

// JSON Response for uptime records
app.get('/api/records', (req, res) => {
  db.mget(['uptimerecord:site', 'uptimerecord:irc', 'uptimerecord:tracker', 'uptimerecord:httptracker'], (err, results) => {
    res.json({
      site: parseInt(results[0]),
      irc: parseInt(results[1]),
      tracker: parseInt(results[2]),
      httptracker: parseInt(results[3])
    });
  });
});

app.get('/api/all', (req, res) => {
  db.mget(['status:site', 'status:irc', 'status:tracker', 'status:httptracker', 'latency:site',
    'latency: irc', 'latency: tracker', 'latency: httptracker', 'uptime:site', 'uptime:irc',
    'uptime:tracker', 'uptime:httptracker', 'uptimerecord:site', 'uptimerecord:irc',
    'uptimerecord:tracker', 'uptimerecord:httptracker'], (err, results) => {
    let resp = {};
    let keys = ['site', 'tracker', 'httptracker', 'irc'];
    for (let i = 0; i < keys.length; i++) {
      resp[keys[i]] = {
        status: parseInt(results[i]),
        latency: parseInt(results[i+4]),
        uptime: parseInt(results[i+8]),
        uptimerecord: parseInt(results[i+12])
      };
    }
    res.json(resp);
  });
});

//////////////////////////////////
// CRON JOBS
//////////////////////////////////

// Check all components every minute
let counter = {
  site: [],
  tracker: [],
  httptracker: [],
  irc: []
};

// Initialize Redis Keys to prevent "null" values
function initializeRedis(component) {
  db.exists(component, (err, reply) => {
    if (reply !== 1) {
      db.set(component, '0');
    }
  });
}

for (let key of ['site', 'tracker', 'httptracker', 'irc']) {
  initializeRedis(`status:${key}`);
  initializeRedis(`latency:${key}`);
  initializeRedis(`uptimerecord:${key}`);
  initializeRedis(`uptime:${key}`);
}

function checkStatus(key, uri) {
  request({uri: uri, method: 'GET', time: true}, (err, resp) => {
    counter[key].pop();
    if (!err && response.statusCode === 200) {
      db.set(`latency:${key}`, Math.trunc(response.timings.connect).toString());
      db.set(`status:${key}`, '1');
      counter[key].unshift(0);
    }
    else {
      counter[key].unshift(1);
      const upper_key = key.replace(/^\w/, c => c.toUpperCase());
      logger.info(`[Check-${upper_key}] ${upper_key} down`);
      let sum = counter[key].reduce((a, b) => a + b, 0);
      // if in the last three minutes, we've had at least one up,
      // then we're unstable, else we mark it as down
      if (sum < 3) {
        db.set(`status:${key}`, '2');
        logger.info(`[Check-${upper_key}] ${upper_key} unstable`);
      }
      else {
        db.set(`status:${key}`, '0');
        resetUptime(key);
        logger.info(`[Check-${upper_key}] ${upper_key} down`);
      }
    }
    updateRecord(key);
  });
}

function updateRecord(key) {
  const upper_key = key.replace(/^\w/, c => c.toUpperCase());
  db.get(`status:${key}`, (err, status) => {
    if (status !== '0') {
      db.incr(`uptime:${key}`);
    }

    db.mget([`uptime:${key}`, `uptimerecord:${key}`], (err, results) => {
      if (parseInt(results[0]) > parseInt(results[1])) {
        logger.info(`[Stats-${upper_key}] ${upper_key} Records updated [${results[1]} to ${results[0]}]`);
        db.set(`uptimerecord:${key}`, results[0]);
      }
    });
  });
}

// If there's an outtage reset uptime record counter.
function resetUptime (component) {
  db.set('uptime:' + component, '0');
}

const uris = {
  site: `https://${config.site}`,
  tracker: `https://${config.tracker.https}`,
  httptracker: `http://${config.tracker.http}`
};

// Check Site Components (Cronjob running every minute)
new CronJob('*/1 * * * *', () => {
  logger.info('Running minute cron job');
  for (let key in uris) {
    checkStatus(key, uris[key]);
  }

  // Get IRC Status
  const time = process.hrtime();
  let client = net.connect(config.irc.port, config.irc.fqdn, () => {
    const diff = process.hrtime(time);
    db.set('status:irc', '1');
    db.set('latency:irc', Math.trunc(diff[0] * 1000000 + diff[1] / 1000).toString());
    counter['irc'].pop();
    counter['irc'].unshift(0);
    updateRecord('irc');
  });

    // Socket connection closed
  client.on('end', null);

  // Error on connecting to target host
  client.on('error', () => {
    counter['irc'].pop();
    counter['irc'].unshift(1);
    let sum = counter['irc'].reduce((a, b) => a + b, 0);
    logger.info(`[Check-IRC] Status counter: ${sum}`);
    if (sum < 3) {
      db.set(`status:irc`, '2');
      logger.info(`[Check-IRC] IRC unstable`);
    }
    else {
      db.set(`status:irc`, '0');
      resetUptime('irc');
      logger.info(`[Check-IRC] IRC down`);
    }
    updateRecord('irc');
    client.end();
  });

  client.on('timeout', () => {
    logger.info('[Check-IRC] Timeout');
    client.end();
  });
}, null, true);

app.listen(app.get('port'), () => {
  logger.info('ApolloStatus server listening on port: ' + app.get('port'));
});
