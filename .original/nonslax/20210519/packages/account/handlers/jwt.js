const jwt = require('jwt-simple'),
    moment = require('moment'),
    utils = require("skynode-server").utils,
    errors = require("skynode-server").errors,
    Observable = utils.Observable;
module.exports = Observable.extend({
    constructor: function JwtHandler(sandbox) {
        Observable.apply(this, arguments);
        this.jwtTokenSecret = 'wtAccountSecret';
        this.models = sandbox.models;
        this.mailer = sandbox.mailer;
        this.helpers = sandbox.helpers;

        let methods = Object.getOwnPropertyNames(JwtHandler.prototype).filter(function(prop) {
            return typeof this[prop] === 'function';
        }, this);

        utils.bindAll(this, methods);
    },

    generate: function(req, res, next) {
        let expires = moment().add(7, 'days').valueOf();
        if (!req.session.user) {
            return res.redirect('back');
        }
        let name = req.session.user.name;
        let token = jwt.encode({
            iss: name,
            exp: expires
        }, this.jwtTokenSecret);
        return this.models.user.updateUserAccessToken(name, token, function(err) {
            if (err) {
                throw (err);
            } else {
                req.session.access_token = token;
                res.cookie("wtCurUsername", name);
                res.cookie("wtAccountAccessToken", token, { maxAge: 900000, httpOnly: true });
            }
            return next();
        });
    },

    auth: function(req, res, next) {
        let token = (req.body && req.body.access_token) || (req.query && req.query.access_token) || req.headers['x-access-token'];
        if (token) {
            try {
                let decoded = jwt.decode(token, this.jwtTokenSecret);
                if (decoded.exp <= Date.now()) {
                    res.json({
                        status: false,
                        msg: 'Access token has expired'
                    });
                } else {
                    this.models.user.getOne("getUser", [decoded.iss], function(err, user) {
                        res.json({
                            status: true,
                            user: user
                        });
                    });
                }
                // handle token here

            } catch (err) {
                console.log(err);
                res.json({
                    status: false,
                    msg: err
                })
            }
        } else {
            res.json({
                status: false,
                msg: "need token value"
            })
        }
    }
});