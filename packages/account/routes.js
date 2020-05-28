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
    return function(req, res, next) {
        req[label] = true;
        next();
    };
}

function time(label) {
    return function(req, res, next) {
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

function mountRouter(expressApp) {

    //moved from app.js start
    //const helpers = require('./helpers');
    const utils = require("skynode-server").utils;
    const features = expressApp.features;
    const scripts = require('./scripts.json');
    const flatten = require('flatten.js').flatten;

    const options = expressApp.get("config");

    flattened = flatten({
        store: options.store,
        analytics: options.analytics,
        mail: options.mail,
        security: options.security,
        client: options.client,
        github: options.github,
        dropbox: options.dropbox,
        notify: options.notify,
        api: options.api,
        blacklist: options.blacklist,
        reserved: options.reserved

    }, ' ');

    Object.getOwnPropertyNames(flattened).forEach(function(key) {
        expressApp.set(key, flattened[key]);
    });


    var express = require('express'),
        path = require('path'),
        //      app         = express(),
        //      options     = require('./config'),
        store = expressApp.store,
        undefsafe = require('undefsafe'),
        models = require('./models').init(expressApp),
        //      routes      = require('./routes'),
        handlers = require('./handlers'),
        //      helpers     = require('./helpers'),
        //      metrics     = require('./metrics'),
        github = require('./github')(options), // if used, contains github.id
        //      _           = require('lodash'),
        crypto = require('crypto'),
        sessionVersion = require('./session-version'),
        stripeRoutes = require('./stripe')(options),
        flattened;
    /**
     * JS Bin configuration
     */


    expressApp.sessionVersion = sessionVersion;

    if (expressApp.mailer) {
        require("./email/quick-send").initMailer(expressApp.mailer);
    }

    if (expressApp.store) {
        expressApp.store.setup(require("./db/sqlite"), "sqlite");
    }

    //moved from upgrade.js
    var config = expressApp.get('config');
    var stripeKey = undefsafe(config, 'payment.stripe.public');
    var stripe;
    if (stripeKey) {
        stripe = expressApp.stripe = require('stripe')(undefsafe(config, 'payment.stripe.secret'));
    }


    // Passport
    if (options.github && options.github.id) {
        github.initialize(expressApp);
    }
    if (options.dropbox && options.dropbox.id) {
        require('./dropbox')(options).initialize();
    }

    //moved from app.js end



    //const app = express.Router();
    app = express.Router()
    'use strict';

    var sandbox = {
        store: expressApp.store,
        models: models,
        mailer: expressApp.mailer,
        helpers: expressApp.helpers
    };

    // Create handlers for accepting incoming requests.
    var sessionHandler = new handlers.SessionHandler(sandbox);
    var userHandler = new handlers.UserHandler(sandbox);
    var jwtHandler = new handlers.JwtHandler(sandbox);
    var upgradeHandler = handlers.upgrade;
    var assetHandler = handlers.assets;
    var adminHandler = handlers.admin;

    var root = expressApp.get('url full');

    reBin = new RegExp(root.replace(/^http.?:\/\//, '') + '/(.*?)/(?:(\\d+)/)?');

    function nocache(req, res, next) {
        res.header('cache-control', 'no-cache');
        next();
    }

    function redirect(url) {
        return function(req, res) {
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
            req.session.referer = req.session.referer || req.query.referer || req.get('referer') || req.url;
            // req.session.referer = req.session.referer || req.url;
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

    // secure the following paths from being iframed, note that it's also applied
    // to full bin output
    app.get('/auth/*', denyframes, nextRoute);
    app.get('/account/*', denyframes, nextRoute);
    app.get('/admin/*', denyframes, nextRoute);


    app.post('/account/new-api-key', function(req, res, next) {
        sandbox.models.user.generateAPIKey(req.session.user.name, function(error, key) {
            if (error) {
                return res.status(500).send({
                    error: error.message
                });
            }

            req.session.user.api_key = key;

            res.send({
                api_key: key,
            });
        });
    });
    app.get('/account/assets/sign', features.route('assets'), assetHandler.sign);
    app.get('/account/assets/sign', features.route('!assets'), function(req, res, next) {
        res.statusCode = 403;
        // res.send('Asset uploading is coming soon, but isn\'t available publicly yet!');
        res.send('<a href="/upgrade"><span class="pro-required">PRO</span></a> <a href="/upgrade">Asset uploading is a pro feature &ndash; upgrade today!</a>')
    });

    app.get('/account/assets/size', sessionHandler.requiresLoggedIn, features.route('assets'), assetHandler.size);
    app.post('/account/assets/remove', sessionHandler.requiresLoggedIn, features.route('assets'), assetHandler.remove);

    // patch this route to get them back to upgrade
    app.get('/account/upgrade', function(req, res) {
        res.redirect('/upgrade');
    });

    app.get('/account/upgrade/pay', function(req, res, next) {
        if (!req.session.user) {
            req.flash(req.flash.REFERER, req.url);
            req.flash(req.flash.NOTIFICATION, 'Before upgrading to <strong>Pro</strong> you will need to create a free account or log in.');
            return res.redirect('/login');
        }

        next('route');
    });

    // require that all account requests ensure login
    app.get('/account/*', sessionHandler.requiresLoggedIn, nextRoute);
    app.post('/account/*', sessionHandler.requiresLoggedIn, nextRoute);

    function alreadyUpgraded(req, res, next) {
        if (features('pro', req)) {
            return res.redirect('/account/subscription');
        }

        next('route');
    }

    app.get(['/account/upgrade/*', '/account/upgrade'], alreadyUpgraded);
    app.get('/upgrade', features.route('upgradeWithFeatures'), alreadyUpgraded);

    app.get('/account/subscription', features.route('pro'), upgradeHandler.subscription);
    app.post('/account/subscription/cancel', features.route('pro'), upgradeHandler.cancel, redirect('/'));
    app.post('/account/subscri`ption/update-card', features.route('pro'), upgradeHandler.updateCard);

    app.get('/upgrade', features.route('!upgradeWithFeatures'), upgradeHandler.features);
    app.get('/upgrade', features.route('upgradeWithFeatures'), captureRefererForLogin, upgradeHandler.payment);

    app.post('/upgrade', features.route('upgradeWithFeatures'), sessionHandler.requiresLoggedIn, upgradeHandler.processPayment);

    app.get('/account/upgrade/pay', features.route('!upgradeWithFeatures'), upgradeHandler.payment);
    app.get('/account/upgrade/pay', features.route('upgradeWithFeatures'), redirect('/upgrade'));
    app.post('/account/upgrade/pay', features.route('!upgradeWithFeatures'), upgradeHandler.processPayment);

    app.get('/account/invoices/:invoice', upgradeHandler.invoice);

    app.post('/verify/token', jwtHandler.auth);
    // Account settings
    var renderAccountSettings = (function() {
        var pages = ['editor', 'embed', 'profile', 'delete', 'preferences', 'assets'];
        var titles = {
            editor: 'Editor settings',
            profile: 'Profile',
            preferences: 'Preferences',
            embed: 'Embed Styles',
            'delete': 'Delete your account',
        };

        return function renderAccountSettings(req, res) {
            var root = sandbox.helpers.url('', true, req.secure);
            var statik = sandbox.helpers.urlForStatic('', req.secure);
            var referrer = req.get('referer');

            var page = pages.indexOf(req.param('page')) === -1 ? false : req.param('page');

            if (page === 'assets' && !features('assets', req)) {
                page = false;
            }

            // if (page === 'embed' && !features('customEmbed', req)) {
            //   page = false;
            // }

            var addons = [];
            if (!expressApp.get('is_production')) {
                for (var prop in scripts.addons) {
                    if (scripts.addons.hasOwnProperty(prop)) {
                        addons = addons.concat(scripts.addons[prop]);
                    }
                }
            }
            var info = req.flash(req.flash.INFO),
                error = req.flash(req.flash.ERROR),
                notification = req.flash(req.flash.NOTIFICATION);

            var flash = error || notification || info;
            var flashType = '';
            if (info) { flashType = 'info'; }
            if (notification) { flashType = 'notification'; }
            if (error) { flashType = 'error'; }

            if (!page) {
                return res.redirect('back');
            }

            if (undefsafe(req.session.user, 'embed.css')) {
                req.session.user.embed.css = req.session.user.embed.css
                    .replace(/<\/script/gi, '<\\/script')
                    .replace(/<!--/g, '<\\!--');
            }

            res.render('account/' + page, {
                title: titles[page],
                flash_tip: flash, // jshint ignore:line
                flash_tip_type: flashType, // jshint ignore:line
                token: req.csrfToken(),
                layout: 'sub/layout.html', //'sub/profile.html',///
                referrer: referrer,
                httproot: root.replace('https', 'http'),
                root: root,
                'static': statik,
                user: req.session.user,
                request: req,
                addons: expressApp.get('is_production') ? false : addons,
            });
        };
    }());

    app.get('/account/:page', shouldNotBeSecure, features.route('accountPages'), renderAccountSettings);
    app.get('/account', function(req, res) {
        res.redirect('/account/editor');
    });

    app.post('/account/embed', features.route('accountPages'), features.route('customEmbed'), function(req, res) {
        if (!req.session || !req.session.user) {
            return res.send(400, 'Please log in');
        }
        var settings = {};
        try {
            settings = JSON.parse(req.body.settings);
        } catch (e) {} // let's ignore for now

        for (var prop in settings) {
            if (settings[prop] === 'true' || settings[prop] === 'false') {
                settings[prop] = settings[prop] === 'true' ? true : false;
            }
        }

        sandbox.models.user.updateOwnershipData(req.session.user.name, {
            embed: JSON.stringify(settings),
        }, function(error) {
            if (error) {
                console.log(error.stack);
                res.send(400, error);
            }
            req.session.user.embed = settings;
            res.json(200, { all: 'ok' });
        });
    });

    app.post('/account/editor', features.route('accountPages'), function(req, res) {
        if (!req.session || !req.session.user) {
            return res.send(400, 'Please log in');
        }
        var settings = {};
        try {
            settings = JSON.parse(req.body.settings);
        } catch (e) {} // let's ignore for now

        for (var prop in settings) {
            if (settings[prop] === 'true' || settings[prop] === 'false') {
                settings[prop] = settings[prop] === 'true' ? true : false;
            }
        }
        sandbox.models.user.updateSettings(req.session.user.name, settings, function(err) {
            if (err) {
                console.log(err.stack);
                res.send(400, err);
            }
            req.session.user.settings = settings;
            res.json(200, { all: 'ok' });
        });
    });


    // Login/Create account.
    function renderLoginRegister(req, res) {
        var root = sandbox.helpers.url('', true, req.secure);
        if (req.subdomain) {
            root = root.replace('://', '://' + req.subdomain + '.');
        }

        if (req.session.user) {
            return res.redirect(root);
        }

        if (req.query.firsttime) {
            res.flash(req.flash.NOTIFICATION, 'We\'ve <a target="_blank" href="/blog/ssl"><strong>upgraded our login process to use SSL</strong></a>, however, this does mean  you have been logged out today, so please could you log in again below.<br><br><a href="http://github.com/jsbin/jsbin/issues/new" target="_blank">Questions/problems?</a>');
        }

        // TODO: I wish this were simpler, and automatically gave us the next flash
        // message (and perhaps handled the whole thing for us...)
        var info = req.flash(req.flash.INFO),
            error = req.flash(req.flash.ERROR),
            notification = req.flash(req.flash.NOTIFICATION);

        var flash = error || notification || info;
        var production = (req.cookies && req.cookies.debug) ? false : sandbox.helpers.production;
        res.render('register-login', {
            flash: flash,
            token: req.csrfToken(),
            layout: 'sub/layout.html',
            referrer: req.flash(req.flash.REFERER) || req.session.referer || req.get('referer'),
            root: root,
            'static': sandbox.helpers.urlForStatic('', req.secure),
            show: req.url.indexOf('/register') !== -1 ? 'register' : 'login',
            forgotten: !!req.query.forgotten || !!undefsafe(req, 'body.forgotten'),
            email: req.query.email || undefsafe(req, 'body.email')
        });
    }

    app.get('/passport', captureRefererForLogin, function(req, res) {
        res.render('passport', {
            token: req.csrfToken(),
            layout: 'sub/layout.html',
            referrer: req.flash(req.flash.REFERER) || req.session.referer || req.get('referer') || "/",
        });
    });
    app.get('/login', features.route('sslLogin'), captureRefererForLogin, renderLoginRegister);
    app.get('/register', features.route('sslLogin'), captureRefererForLogin, renderLoginRegister);
    app.post('/login', sessionHandler.checkUserLoggedIn, userHandler.validateLogin, sessionHandler.loginUser, jwtHandler.generate, sessionHandler.redirectUserAfterLogin);

    app.post('/account/update', sessionHandler.routeSetHome);
    app.post('/account/delete', sessionHandler.deleteAccount, function(req, res, next) {
        metrics.increment('user.delete');
        next();
    }, redirect('/'));

    // TODO /register should take them through to logged in if the details are correct
    app.post('/register', sessionHandler.checkUserLoggedIn, userHandler.validateRegister, sessionHandler.loginUser, jwtHandler.generate, sessionHandler.redirectUserAfterLogin);

    // TODO remove once sslLogin feature has landed
    app.get(['/login', '/register'], function(req, res) {
        res.redirect('http://jsbin.com');
    });

    app.get('/status', function(req, res) {
        res.send('OK');
    });

    app.get('/logout', function(req, res) {
        if (req.session.user) {
            delete req.session.referer;
            var root = sandbox.helpers.url('', true, req.secure);
            var statik = sandbox.helpers.urlForStatic('', req.secure);

            res.render('account/logout', {
                request: req,
                token: req.csrfToken(),
                learn: 'http://learn.jsbin.com/',
                layout: 'sub/layout.html',
                root: root,
                'static': statik,
                user: req.session.user
            });
        } else {
            // you're not welcome!
            res.redirect('/');
        }
    });
    app.post('/logout', sessionHandler.logoutUser);
    app.post('/forgot', sessionHandler.forgotPassword);
    app.get('/forgot', sessionHandler.requestToken);
    app.get('/reset', sessionHandler.resetPassword);

    // Admin
    app.get('/admin', features.route('admin'), adminHandler.renderAdmin);
    app.get('/admin/*', features.route('admin'), nextRoute);
    app.post('/admin/flag-bin', features.route('admin'), adminHandler.flagBin);
    app.post('/admin/flag-user', features.route('admin'), adminHandler.flagUser);
    app.post('/admin/user-verified', features.route('admin'), adminHandler.userVerified);

    // TODO update - this is currently only used for updating the user's profile
    // when outside of the SSL login process.
    app.post('/sethome', sessionHandler.routeSetHome);

    // GitHub auth
    app.get('/auth/github', sessionHandler.github);
    app.get('/auth/github/callback', sessionHandler.githubPassportCallback, sessionHandler.githubCallback, jwtHandler.generate, sessionHandler.redirectUserAfterLogin);

    // DropBox auth
    app.get('/auth/dropbox', features.route('dropbox'), sessionHandler.dropboxAuth);
    app.get('/auth/dropbox/callback', sessionHandler.dropboxPassportCallback, sessionHandler.dropboxCallback);

    // Quick and easy urls for test - allows me to do /rem/last on my mobile devices
    app.param('username', sessionHandler.loadUser);

    // Handle failed auth requests.
    app.use(sessionHandler.githubCallbackWithError);


    expressApp.use(app);

    return app;
};