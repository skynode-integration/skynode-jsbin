const onHeaders = require('on-headers');
const express = require('express');
//const handlers = require('./handlers');
const _ = require('underscore');
const fs = require('fs');
const parse = require('url').parse;
const undefsafe = require('undefsafe');
const request = require('request');
const metrics = require("skynode-server").metrics;

let reBin = null; // created when the module is importet



module.exports = mountRouter;

function tag(label) {
  'use strict';
  return function (req, res, next) {
    req[label] = true;
    next();
  };
}

function time(label) {
  return function (req, res, next) {
    onHeaders(res, () => {
      metrics.timing(label, Date.now() - req.start);
      metrics.timing('request', Date.now() - req.start);
    });
    next();
  };
}

function nextRoute(req, res, next) {
  next('route');
}

function ensureRevisionIsInt(req, res, next) {
  var revision = req.params.rev;
  // If no revision, or the revision is a number continue
  // "abc"|0 === 0
  // "123abc"|0 === 0
  // 123|0 === 123
  if (!revision || revision|0 || revision === 'latest') {
    return next();
  }
  next(404);
}

function mountRouter(expressApp) {
  require("../packages/account/routes")(expressApp);   



  const config = require('./config');
  _.extend(config,expressApp.get("config"));

  //moved from app.js start
  //const helpers = require('./helpers');
  const custom = require('./custom');
  const utils = require("skynode-server").utils;
  // const spike = require('./spike');
  const features = expressApp.features;
  const processors = require('./processors');
  const flash = require('./fat-flash');
  const scripts = require('../scripts.json');
  const      flatten     = require('flatten.js').flatten;

  const   options     = expressApp.get("config");

  flattened = flatten({
    store : options.store,
    analytics : options.analytics,
    mail : options.mail,
    security : options.security,
    client : options.client,
    github : options.github,
    dropbox : options.dropbox,
    notify : options.notify,
    api : options.api,
    blacklist : options.blacklist,
    reserved : options.reserved

  }, ' ');

  Object.getOwnPropertyNames(flattened).forEach(function (key) {
    expressApp.set(key, flattened[key]);
  });

   expressApp.set('static url', expressApp.get('url full'));

   console.log("url full:"+expressApp.get('url full'));
  if (options.url.runner) {
    // strip trailing slash, just in case
    options.url.runner = options.url.runner.replace(/\/$/, '');
    expressApp.set('url runner', options.url.runner);
  } else {
    expressApp.set('url runner', expressApp.get('url full'));
  }
  console.log("url runner:"+expressApp.get('url runner'));

  // Pre-set the URL used for the runner
  expressApp.helpers.runner = expressApp.get('url runner') + '/runner';

  var app = expressApp;

  console.log("debug:url:prefix:" + app.get('url prefix'));
  console.log("debug:url:full:" + app.get('url full'));

  var path        = require('path'),
      undefsafe   = require('undefsafe'),
      models      = require('./models').init(app),
      handlers    = require('./handlers'),
      //helpers     = require('./helpers'),
      crypto      = require('crypto'),
      filteredCookieSession = require('./blacklist-cookie'),
      flattened;



if (app.store) {
  app.store.setup(require("./db/sqlite"),"sqlite");
}

process.chdir(app.get('root'));


//moved from app.js end



  //const app = express.Router();
  app = express.Router()
  'use strict';
  // A sandbox object to contain some specific objects that are commonly used by
  // handlers. In future it would be ideal that each handler only receives the
  // objects that it requires.
  var sandbox = {
    store:   expressApp.store,
    models:  models,
    mailer:  expressApp.mailer,
    helpers: expressApp.helpers
  };

  // Create handlers for accepting incoming requests.
  var accountHandlers = require("../packages/account/handlers");
  var binHandler = new handlers.BinHandler(sandbox);
  var sessionHandler = new accountHandlers.SessionHandler(sandbox);
  var errorHandler = new handlers.ErrorHandler(sandbox);
  var userHandler = new accountHandlers.UserHandler(sandbox);
  var upgradeHandler = accountHandlers.upgrade;
  var assetHandler = accountHandlers.assets;
  var oembedHander = handlers.oembed;

  var root = expressApp.get('url full');

  reBin = new RegExp(root.replace(/^http.?:\/\//, '') + '/(.*?)/(?:(\\d+)/)?');

  function binParamFromReferer(req, res, next) {
    reBin.lastIndex = 0; // reset position

    var r = root.replace(/^https?:\/\//, '');

    // only allow cloning via url if it came from jsbin
    if (req.headers.referer && req.headers.referer.indexOf(r) !== -1) {
      var match = req.headers.referer.match(reBin) || [];
      if (match.length) {
        req.params.bin = match[1];
        req.params.rev = match[2];

        return next();
      }
    }

    next('route');
  }

  function redirectToOutput(req, res, next) {
    var output = undefsafe(config, 'security.preview');
    // redirect to output url (to prevent cross origin attacks)
    if (output && req.headers.host.indexOf(config.url.host) === 0) {
      return res.redirect((req.secure ? 'https://' : 'http://') + output + req.url);
    }

    next();
  }

  function secureOutput(req, res, next) {
    // 1. check request is supposed to be on a vanity url
    // 2. if not, then check if the req.headers.host matches security.preview
    // 3. if not, redirect
    var metadata = undefsafe(req, 'bin.metadata');
    var settings = {};
    var ssl = false;
    var url;

    if (req.headers.accept && req.headers.accept.indexOf('text/event-stream') !== -1) {
      // ignore event-stream requests
      return next();
    }

    // skip check for vanity and non-forced SSL
    if (res.locals.vanity) {
      return next();
    }

    if (!req.secure && features('sslForAll', req)) {
      var url = sandbox.helpers.url(req.url, true, true);
      return res.redirect(url);
    }

    return next();
  }

  function nocache(req, res, next) {
    res.header('cache-control', 'no-cache');
    next();
  }

  function redirect(url) {
    return function (req, res) {
      res.redirect(303, url);
    };
  }

  function shouldNotBeSecure(req, res, next) {
    // otherwise redirect to the http version
    if (req.shouldNotBeSecure) {
      return res.redirect('http://' + req.headers.host.replace(/:.*/, '') + req.url);
    }

    // if the flag isn't present, then skip on
    next();
  }

  function featureByBinOwner(feature, handler) {
    return function (req, res, next) {
      if (features(feature, { session: { user: undefsafe(req, 'bin.metadata') } })) {
        return next();
      }
      return handler(req, res, next);
    };
  }

  function denyframes(req, res, next) {
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  }

  function sameoriginframes(req, res, next) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  }

  function captureRefererForLogin(req, res, next) {
    if (!req.session.user) {
      req.session.referer = req.session.referer || req.url;
    } else {
      delete req.session.referer;
    }
    next();
  }

  function redirectOffPreview(req, res, next) {
    var output = undefsafe(config, 'security.preview');
    if (output && req.headers.host === output) {
      return res.redirect((req.secure ? 'https://' : 'http://') + config.url.host + req.url);
    }

    next();
  }

  // Redirects

  // /about doesn't get hit in production - it goes via nginx to our learn repo
  app.get('/about', redirect('http://jsbin.com/about'));

  // NOTE another day perhaps…
  // app.get('/manifest.appcache', (req, res) => {
  //   var statik = sandbox.helpers.urlForStatic(undefined, true);
  //   res.set('content-type', 'text/cache-manifest');
  //   res.set('Cache-Control', 'public, max-age=0'); // don't cache
  //   res.render('manifest-appcache', {
  //     version: req.app.settings.version,
  //     root: statik,
  //     open: req.session.open,
  //     layout: false,
  //   });
  // });

  app.get('/manifest.json', function (req, res) {
    var statik = sandbox.helpers.urlForStatic(undefined, true);
    res.set('content-type', 'text/javascript');
    res.render('manifest-json', {
      static: statik,
      layout: false,
    });
  });
  app.get(['/issues', '/bugs'], redirect('https://github.com/jsbin/jsbin/issues/'));
  app.get(['/video', '/videos', '/tutorials'], redirect('http://www.youtube.com/playlist?list=PLXmT1r4krsTooRDWOrIu23P3SEZ3luIUq'));


  // Handler Events

  // FIXME removing live reload for a short time, trying to debug perf issues
  // binHandler.on('updated', spike.ping.bind(spike));
  // binHandler.on('reload', spike.reload.bind(spike));
  // binHandler.on('latest-for-user', spike.updateUserSpikes.bind(spike));
  // binHandler.on('new-revision', spike.bumpRevision.bind(spike));

  // binHandler.on('render-scripts', spike.appendScripts.bind(spike, expressApp.settings.version));

  // Load the bin from the store when encountered in the url. Also handles the
  // "latest" url action.
  app.param('bin', function (req, res, next) {
    var binurl = req.params.bin.toLowerCase();
    var re = /[^\w\-]/;

    if (re.test(binurl)) {
      return next(404);
    }

    if (expressApp.settings.reserved.indexOf(binurl) !== -1) {
      metrics.increment('bin.validate.reserved');
      return next(404);
    }

    onHeaders(res, function () {
      var now = Date.now();
      if (req.bin) {
        metrics.timing('request.bin.loaded', now - req.start);
      } else {
        metrics.timing('request.bin.404', now - req.start);
      }
      metrics.timing('request', now - req.start);
    });

    if (req.route.path.slice(-('/source').length) === '/source') {
      req.sourceOnly = true;
    }

    // this is fucking nonsense... 2017-04-21 (due to extra args being removed)
    userHandler.updateLastSeen(req, res, () => {
      binHandler.loadBin(req, res, () => {
        if (req.bin) {
          expressApp.emit('bin:loaded', req);
        }

        next();
      });
    });
  });

  // track the logged in and logged out numbers
  app.get('*', function (req, res, next) {
    if (req.url !== '/runner') {
      if (req.session.user) {
        metrics.increment('user.logged-in');
      } else {
        metrics.increment('user.logged-out');
      }
    }
    next('route');
  });

  // Note: this goes *above* the SSL route jumping that follows.
  app.get('/', denyframes, time('request.root'), userHandler.loadVanityURL, binHandler.loadBin, secureOutput, binHandler.getBinPreview);

  // Set up the routes

  // removed when SSL became available to all
  // app.get(/(?:.*\/(edit|watch|download|source)|^\/$)$/, function (req, res, next) {
  //   var ssl = features('sslForAll', req);

  //   if ( (!req.secure && ssl) || // a) request *should* be secure
  //        (req.secure && !ssl) ) { // b) request is secure and *should not* be
  //     var url = sandbox.helpers.url(req.url, true, ssl);
  //     return res.redirect(url);
  //   }

  //   next('route');
  // });

  // secure the following paths from being iframed, note that it's also applied
  // to full bin output
  app.get('/admin/*', denyframes, nextRoute);

  app.get('/', redirectOffPreview, secureOutput, binHandler.getDefault, binHandler.render);
  app.get('/gist/*', shouldNotBeSecure, binHandler.getDefault, binHandler.render);
  app.post('/', binHandler.getFromPost);

  // sandbox
  app.get(['/-', '/null'], features.route('sandbox'), tag('sandbox'), binHandler.getDefault, binHandler.render);

  // Runner - if in production, let nginx pick up the runner
  if (expressApp.locals.is_production) {
    expressApp.render('runner', {
      scripts: scripts.runner,
      'static': sandbox.helpers.urlForStatic(undefined, false), //---- true
    }, function (error, html) {
      fs.writeFile(__dirname + '/../public/runner.html', html, () => {});
    });
  }

  app.get('/runner', function (req, res) {
    req.session.open = !!req.query.pro;
    res.render('runner', {
      scripts: res.app.locals.is_production ? false : scripts.runner,
      'static': sandbox.helpers.urlForStatic(undefined, false), //--- true
    });
  });

  // app.get('/runner-inner', function (req, res) {
  //   res.send('<html manifest="/manifest.appcache"></html>');
  // });

  app.post('/processor', features.route('processors'), function (req, res) {
    processors.run(req.body.language, req.body).then(function (data) {
      res.send(data);
    }).catch(function (error) {
      console.error(error);
      res.send(500, error.message);
    });
  });

  app.get('/api/', binHandler.getUserBins);

  app.get('/api/:bin/:rev?', binHandler.loadBin, function (req, res, next) {
    if (!req.bin.revision) {
      return res.status(404).send({});
    }
    res.send({
      javascript: req.bin.javascript,
      html: req.bin.html,
      css: req.bin.css,
      settings: req.bin.settings,
      last_updated: undefsafe(req, 'bin.metadata.last_updated') || new Date().toJSON(),
      url: req.bin.url,
      snapshot: req.bin.revision
    });
  });
  app.delete('/api/:bin/:rev?', binHandler.loadBin, binHandler.delete, function (req, res) {
    res.send({
      url: req.bin.url,
      snapshot: req.bin.revision,
      deleted: true,
    });
  });
  app.post('/api/save', binHandler.createBin, binHandler.apiTrackBin, function (req, res, next) {
    res.send({
      url: req.bin.url,
      snapshot: req.bin.revision,
      summary: req.bin.summary,
    });
  });
  app.post('/api/:bin/save', function (req, res, next) {
    req.params.method = 'save';
    next();
  }, binHandler.createRevision, binHandler.apiTrackBin, function (req, res, next) {
    res.send({
      url: req.bin.url,
      snapshot: req.bin.revision,
      summary: req.bin.summary,
    });
  });

  function alreadyUpgraded(req, res, next) {
    if (features('pro', req)) {
      return res.redirect('/account/subscription');
    }

    next('route');
  }

  app.get('/js/inject-back', function (req, res) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var url = config.features.ad.bsa + '?forwardedip=' + ip;
    request({
      url: url,
      json: true,
    }, function (error, response, body) {
      if (error || response.statusCode !== 200) {
        console.log(error);
        return res.end();
      }

      var ad = body.ads.filter(function (ad) {
        return !!ad.active;
      }).shift();

      var pixels = ((ad || {}).pixel || '').split('||');
      var time = Math.round(Date.now() / 10000) | 0;
      var imgs = pixels.map(function (pixel) {
        return '<img src="' + pixel.replace('[timestamp]', time) + '" height=1 width=1 border=0 style="display:none">';
      });

      res.render('inject-ad.js.html', { layout: false, ad: ad, imgs: imgs });
    })
  });

  app.get('/status', function(req, res) {
    res.send('OK');
  });

  app.get('/account/bookmark/vanity', features.route('vanity'), binParamFromReferer, binHandler.loadBin, userHandler.saveVanityURL);
  app.post('/account/bookmark/vanity', features.route('vanity'), function (req, res, next) {
    reBin.lastIndex = 0; // reset position

    // only allow cloning via url if it came from jsbin
    var match = req.body.url.match(reBin) || [];
    if (match.length) {
      req.params.bin = match[1];
      req.params.rev = match[2];
      return next();
    }

    res.send(400, 'You need to be on a bin to publish it as the vanity home page');

  }, binHandler.loadBin, userHandler.saveVanityURL);

  app.get('/account/bookmark/vanity', features.route('vanity'), function (req, res) {
    res.send({});
  });



  // List (note that the :user param is handled inside the getUserBins)
  //app.get('/list/:user', time('request.list.specific'), middleware.cors(), binHandler.getUserBins);
  app.get('/list/:user', time('request.list.specific'),  binHandler.getUserBins);
  app.get('/list', time('request.list'), binHandler.getUserBins);
  //app.get('/show/:user', time('request.homepage'), middleware.cors(), binHandler.getUserBins);
  app.get('/show/:user', time('request.homepage'), binHandler.getUserBins);
  //app.get('/user/:user', time('request.homepage'), middleware.cors(), binHandler.getUserBins);
  app.get('/user/:user', time('request.homepage'), binHandler.getUserBins);

  // Quick and easy urls for test - allows me to do /rem/last on my mobile devices
  app.param('username', sessionHandler.loadUser);

  // Save
  app.post('/save', time('request.bin.create'), binHandler.createBin);

  // Clone directly via url
  app.get('/clone', time('request.bin.clone'), binParamFromReferer, function (req, res, next) {
    // donkey talk for "create a clone" :(
    req.params.method = 'save,new';
    next();
  }, binHandler.loadBin, function (req, res, next) {
    // TODO remove this middleware and make it easier to clone
    // copy the bin to the body so it looks like it was posted
    req.body = utils.extract(req.bin, 'html', 'css', 'javascript', 'settings');
    req.body.settings = JSON.stringify(req.body.settings);
    next();
  }, binHandler.createRevisionOrClone);


  /** Bin based urls **/

  // tag those urls that are the editor view (useful for the 404s)
  app.get(/\/(edit|watch)$/, redirectOffPreview, secureOutput, tag('editor'), nextRoute);

  // check whether a get request has a subdomain, and whether it should be
  // redirected back to the default host for jsbin
  app.get('*', function (req, res, next) {
    new Promise(function (resolve, reject) {
      if (req.subdomain) {
        var url = parse(req.url);
        if (custom[req.subdomain]) {
          // custom domain (like emberjs, etc)
          return resolve();
        } else if (/(embed|edit|watch|download|source)$/i.test(url.pathname)) {
          return reject('vanity urls not allowed on these urls');
        }
      }

      resolve();
    }).then(function () {
      next('route');
    }).catch(function (reason) {
      // console.error(req.headers.host + ' not allowed: ' + reason);
      res.redirect(sandbox.helpers.url(req.url, true, req.secure));
    });
  });

  // username shortcut routes
  app.get('/:username/last(-:n)?/edit', secureOutput, binHandler.getLatestForUser, binHandler.getBin);
  app.get('/:username/last(-:n)?/watch', binHandler.getLatestForUser, binHandler.live, binHandler.getBin);

  app.post('/:bin/:rev?/transfer', binHandler.ensureOwnership, binHandler.transfer);

  // Edit
  app.get('/:binname/:revision?/edit', secureOutput, binHandler.getBin);
  app.get('/:bin/:rev?/watch', tag('live'), binHandler.getBin);
  app.get('/:bin/:rev?/embed', tag('embed'), function (req, res, next) {
    // special case for embed: if user has SSL, allow it, if bin has SSL allow it
    // otherwise redirect
    if (req.secure && !features('sslForEmbeds', req)) {
      return res.render('ssl-embed', {
        root: req.app.get('url full'),
        'static': sandbox.helpers.urlForStatic(undefined, true),
      });
    }
    next();
  }, binHandler.getBin);

  // don't expose anymore - reporting goes through github
  // app.post('/:bin/:rev?/report', binHandler.report);

  // Use this handler to check for a user creating/claiming their own bin url.
  // We use :url here to prevent loadBin() being called and returning a not
  // found error.
  app.post('/:url/save', time('request.bin.save.claim'), binHandler.claimBin);

  // If the above route fails then it's either a clone or a revision. Which
  // the handler can check in the post body.
  app.post('/:bin/:rev?/save', time('request.bin.update'), binHandler.createRevisionOrClone);
  app.post('/:bin/:rev?/reload', binHandler.reload);

  // delete a bin
  app.post('/:bin/:rev?/delete', time('request.bin.delete'), features.route('delete'), binHandler.delete, function (req, res) {
    res.send(200, true);
  });

  app.post('/:bin/:rev?/delete-all', time('request.bin.delete-all'), features.route('delete'), binHandler.deleteAll);

  // Private
  app.post('/:bin/:rev?/private', binHandler.setBinAsPrivate);
  app.post('/:bin/:rev?/public', binHandler.setBinAsPublic);

  // Archive
  app.post('/:bin/:rev/archive', binHandler.archiveBin.bind(null, true));
  // Unarchive
  app.post('/:bin/:rev/unarchive', binHandler.archiveBin.bind(null, false));

  // Download
  app.get('/download', binParamFromReferer, binHandler.loadBin, binHandler.downloadBin);
  app.get('/:bin/:rev?/download', binHandler.downloadBin);

  // send back a generated service worker
  app.get('/sw.js', nocache, function (req, res) {
    var http = req.secure ? 'https' : 'http';
    var ssl = req.secure;
    var statik = sandbox.helpers.urlForStatic(undefined, ssl);
    var root = sandbox.helpers.url('', true, ssl);
    var version = sandbox.helpers.set('version');
    var runner = sandbox.helpers.runner;

    if (statik && statik.indexOf('https') === 0) {
      // then ensure the runner is also https
      if (runner.indexOf('https') === -1) {
        runner = runner.replace(/http/, 'https');
      }
    }

    res.set('content-type', 'text/javascript');
    res.render('sw.js.html', {
      root: sandbox.helpers.url('', true, req.secure),
      static: statik,
      runner: runner,
      layout: false,
    });
  });

  app.get('/sw-runner.js', nocache, function (req, res) {
    res.set('content-type', 'text/javascript');
    res.render('sw-runner.js.html', {
      root: sandbox.helpers.url('', true, req.secure),
      static: sandbox.helpers.urlForStatic(undefined, true),
      layout: false,
    });
  });


  app.get('/bin/user.js', nocache, function (req, res, next) {
    var userfields = 'avatar name bincount created pro settings';
    var user = _.pick.apply(_, [req.session.user || {}].concat(userfields.split(' ')));

    if (!user.avatar && req.session.user) {
      req.session.user.avatar = user.avatar = req.app.locals.gravatar(req.session.user);
    }

    if (user.avatar) {
      user.large_avatar = req.app.locals.gravatar(req.session.user, 120);
    }

    // all this code is repeated from handler/bin
    // and it totally sucks – RS 2016-06-22
    var http = req.secure ? 'https' : 'http';
    var ssl = req.secure;
    var statik = sandbox.helpers.urlForStatic(undefined, ssl);
    var root = sandbox.helpers.url('', true, ssl);
    var version = sandbox.helpers.set('version');
    var runner = sandbox.helpers.runner;

    if (statik && statik.indexOf('https') === 0) {
      // then ensure the runner is also https
      if (runner.indexOf('https') === -1) {
        runner = runner.replace(/http/, 'https');
      }
    }

    res.set('content-type', 'text/javascript');
    res.render('user', {
      version: version,
      root: root,
      shareRoot: features('vanity', req) ? http + '://' + user.name + '.' + req.app.get('url host') : root,
      runner: runner,
      static: statik,
      user: JSON.stringify(user),
      layout: false,
    })
  });

  // this is the new bin handler - all the content and setup is loaded here
  // allowing us to fully cache the index.html template for offline use
  app.get('/bin/start.js', nocache, function (req, res, next) {
    if (!req.query.new) {
      binParamFromReferer(req, res, function () {});
    }

    var referer = req.headers.referer || '';

    // FIXME these `indexOf` matches are brittle - they also match
    // things like /embedded or /watch-this-bin

    // is this an embedded request?
    if (referer.indexOf('/embed') !== -1) {
      req.embed = true;
    }

    // is this a /null /- sandbox request?
    if (referer.indexOf('/-') !== -1 || referer.indexOf('/null') !== -1) {
      if (features('sandbox', req)) {
        req.sandbox = true;
      }
    }

    // is this a codecasting session?
    if (referer.indexOf('/watch') !== -1) {
      req.live = true;
    }

    var postedBinId = req.flash('postedBin');
    console.log("debug:postedBinId:" + postedBinId+"ddd");
    if (postedBinId) {
      req.bin = flash.get(postedBinId);
      return next();
    }

    if (req.params.bin) {
      return binHandler.loadBin(req, res, next);
    }

    return binHandler.getDefault(req, res, next);
  }, binHandler.sendStart);

  // oEmbed
  //app.get('/oembed', middleware.cors(), oembedHander.embed);
  app.get('/oembed', oembedHander.embed);

  /**
   * Full output routes
   */
  // Source
  //app.all('*', middleware.cors(), nextRoute);
  app.all('*', nextRoute);
  app.get('/:bin/:rev?/source', redirectToOutput, time('request.source'), binHandler.getBinSource);

  app.get('/:bin/:rev?.:format(' + Object.keys(processors.mime).join('|') + ')',redirectToOutput, sameoriginframes, time('request.source'), binHandler.getBinSourceFile);
  app.get('/:bin/:rev?/:format(js)', redirectToOutput, sameoriginframes, function (req, res) {
    // Redirect legacy /js suffix to the new .js extension.
    res.redirect(301, req.path.replace(/\/js$/, '.js'));
  });

  // event source based requests
  // app.get('/:bin/:rev?/stats', tag('stats'), spike.getStream);
  // app.get('/:bin/:rev?', spike.getStream, function (req, res, next) {
  //   // if we reach this point, then we've hit a regular reqest
  //   next('route');
  // });

  // full output / preview
  app.get('/:username/last(-:n)?/:quiet(quiet)?', redirectToOutput, sameoriginframes, tag('keepLatest'), binHandler.getLatestForUser, binHandler.getBinPreview); // spike.getStream,
  app.get('/:bin/:quiet(quiet)?', redirectToOutput, featureByBinOwner('pro', sameoriginframes), binHandler.testPreviewAllowed, binHandler.getBinPreview); // spike.getStream,
  app.get('/:bin/:rev?/:quiet(quiet)?', redirectToOutput, ensureRevisionIsInt, featureByBinOwner('pro', sameoriginframes), binHandler.testPreviewAllowed, binHandler.getBinPreview); // spike.getStream,

  app.post('/:bin/:rev/settings', binHandler.ensureOwnership, binHandler.updateSettings);
  app.put('/:bin/:rev/settings', binHandler.ensureOwnership, binHandler.updateSettings);

  // used for simple testing
  app.get('/test/error/:num', function (req, res, next) {
    next(req.params.num * 1);
  });

  // Handle failed auth requests.
  app.use(sessionHandler.githubCallbackWithError);

  // Catch all
  app.use(errorHandler.notFound);

  // Error handler.
  app.use(errorHandler.httpError);

  // Final connect error handler when in development.
  app.use(errorHandler.uncaughtError);

  expressApp.use(app);

  expressApp.store.connect();
  return app;
};
