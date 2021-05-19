var sqlite3 = require('sqlite3').verbose(),
    templates = require('./sql_templates'),
    utils = require("skynode-server").utils,
    fs = require('fs');

var noop = function() {};

module.exports = {
    deleteUser: function(id, fn) {
        this.connection.run(templates.deleteUser, [id], fn);
    },
    getUser: function(id, fn) {
        var _this = this;

        this.connection.get(templates.getUser, [id], function(err, result) {
            if (err) {
                return fn(err);
            }

            if (!result) {
                _this.connection.get(templates.getUserByEmail, [id], function(err, result) {
                    if (err) {
                        return fn(err);
                    }

                    if (result) {
                        result = _this.convertUserDates(result);
                    }

                    fn(null, result);
                });
            } else {
                if (result) {
                    result = _this.convertUserDates(result);
                }
                fn(null, result);
            }
        });
    },
    getUserByApiKey: function(apiKey, fn) {
        var _this = this;

        this.connection.get(templates.getUserByApiKey, [apiKey], function(err, result) {
            if (err) {
                return fn(err);
            }

            if (result) {
                result = _this.convertUserDates(result);
            }
            fn(null, result);
        });
    },
    getUserByEmail: function(email, fn) {
        var _this = this;

        this.connection.get(templates.getUserByEmail, [email], function(err, result) {
            if (err) {
                return fn(err);
            }

            if (result) {
                result = _this.convertUserDates(result);
            }

            fn(null, result);
        });
    },
    // getOne('<sql template>', [constraint1, constraint2, ...], fn)
    getOne: function(queryKey, params, fn) {
        console.log("queryKey:" + queryKey);
        this.connection.get(templates[queryKey], params, function(err, result) {
            if (err) {
                fn(err, null);
            } else {
                fn(null, result);
            }
        });
    },

    setUser: function(params, fn) {
        var now = new Date(),
            values = [
                params.name,
                params.key,
                params.email,
                now,
                now,
                now,
                params.github_token,
                params.github_id,
                params.flagged || false,
            ],
            self = this;

        this.connection.run(templates.setUser, values, function(err) {
            if (err) {
                return fn(err);
            }
            console.log("XXXXXXX:" + templates.insertUserPassportData);
            self.connection.run(templates.insertUserPassportData, [
                params.name,
                "github",
                params.github_id,
                params.github_token,
                now,
                now
            ], function(err) {
                console.log("error:" + err);
                if (err) {
                    return fn(err);
                }
                fn(null, self.lastID);
            });
        });
    },
    touchOwners: function(params, fn) {
        // params.date is only for use when populating the summary field
        var values = [params.date || new Date(), params.name, params.url, params.revision];

        this.connection.run(templates.touchOwners, values, function(err) {
            if (err) {
                return fn(err);
            }

            if (typeof fn === 'function') {
                fn(null);
            }
        });
    },
    touchLogin: function(id, fn) {
        var now = new Date();
        this.connection.run(templates.touchLogin, [now, id], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },
    updateUserEmail: function(id, email, fn) {
        var now = new Date();
        this.connection.run(templates.updateUserEmail, [email, now, id], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },
    updateUserAccessToken: function(id, token, fn) {
        var now = new Date();
        this.connection.run(templates.updateUserAccessToken, [token, now, id], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },
    updateUserSettings: function(id, settings, fn) {
        this.connection.run(templates.updateUserSettings, [JSON.stringify(settings), id], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },
    updateUserGithubData: function(id, ghId, token, fn) {
        var now = new Date(),
            self = this;
        /*
    this.connection.run(templates.updateUserGithubData, [id,"github",ghId, token, now, ], function (err) {
      if (err) {
        return fn(err);
      }
      fn(null);
    });
   */
        this.getUserPassportData(id, "github", function(err) {
            if (err) {
                self.insertUserPassportData(id, "github", ghId, token, fn);
            } else {
                self.updateUserPassportData(id, "github", ghId, token, fn);
            }
        });

    },
    updateUserDropboxData: function(id, token, fn) {
        fn(null);
    },
    updateUserKey: function(id, key, fn) {
        var now = new Date();
        this.connection.run(templates.updateUserKey, [key, now, id], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },
    // Different to updateUserKey() in that it also sets the created timestamp
    // which is required to differentiate between a JSBin 2 user and a new
    // one.
    upgradeUserKey: function(id, key, fn) {
        var now = new Date();
        this.connection.run(templates.upgradeUserKey, [key, now, now, id], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },
    getUserByForgotToken: function(token, fn) {
        var sql = templates.getUserForForgotToken,
            _this = this;

        this.connection.get(sql, [token, new Date()], function(err, result) {
            if (err) {
                return fn(err);
            }

            if (result) {
                result = _this.convertUserDates(result);
            }

            fn(null, result);
        });
    },
    setForgotToken: function(user, token, fn) {
        var sql = templates.setForgotToken,
            expires = this.expireDate(),
            params = [user, token, expires, new Date()];

        this.connection.run(sql, params, function(err) {
            if (err) {
                return fn(err);
            }
            fn();
        });
    },
    expireForgotToken: function(token, fn) {
        var sql = templates.deleteExpiredForgotToken;

        // Allow all old tokens to be expired with same call.
        if (typeof token === 'function') {
            fn = token;
            token = null;
        }

        this.connection.run(sql, [new Date(), token, null], function(err, results) {
            fn(err || null);
        });
    },
    expireForgotTokenByUser: function(user, fn) {
        var sql = templates.deleteExpiredForgotToken;

        this.connection.run(sql, [new Date(), null, user], function(err) {
            fn(err || null);
        });
    },
    expireDate: function() {
        var expires = new Date();
        expires.setUTCDate(expires.getUTCDate() + 1);
        return expires;
    },

    getUserPassportData: function(owner_name, auth_provider, fn) {
        this.connection.get(templates.getUserPassportData, [owner_name, auth_provider], function(err, result) {
            if (err) {
                return fn(err);
            }
            fn(null, result);
        });
    },

    insertUserPassportData: function(owner_name, auth_provider, auth_id, auth_token, fn) {
        var now = new Date();
        this.connection.run(templates.insertUserPassportData, [owner_name, auth_provider, auth_id, auth_token, now, now], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },
    updateUserPassportData: function(owner_name, auth_provider, auth_id, auth_token, fn) {
        var now = new Date();
        this.connection.run(templates.updateUserPassportData, [auth_id, auth_token, now, owner_name, auth_provider], function(err) {
            if (err) {
                return fn(err);
            }
            fn(null);
        });
    },

    convertUserDates: function(user) {
        return this.convertDates(user, 'created', 'updated', 'last_login');
    },
    convertDates: function(obj /* keys */ ) {
        var keys = [].slice.call(arguments, 1);
        keys.forEach(function(key) {
            if (obj && obj[key]) {
                var date = new Date();
                date.setTime(obj[key]);
                obj[key] = date;
            }
        });
        return obj;
    },
    setCustomer: noop,
    setCustomerActive: noop,
    getCustomerByStripeId: noop,
    getCustomerByUser: noop,
    getUserListing: function(user, fn) {
        var sql = templates.userListing;
        this.connection.get(sql, [user], fn);
    },
    setProAccount: function(id, pro, fn) {
        this.connection.run(templates.setProAccount, [pro, new Date(), id], fn);
    },
    updateOwnershipData: updateMultipleFields(templates.updateOwnershipData, templates.ownershipColumns),
    getAssetsForUser: noop,
    deleteAsset: noop,
    saveAsset: noop
};


function updateMultipleFields(sqlTemplate, columnsArray) {
    return function(args, params, fn) {
        var values = [];
        var queries = Object.keys(params).map(function(key) {
            if (columnsArray.indexOf(key) === -1) {
                throw new Error('Warning: attempt to update sandbox table with invalid field "' + key + '"');
            }
            values.push(params[key]);
            return '`' + key + '`=?';
        });

        values = values.concat(args);

        var sql = sqlTemplate.replace('`:field`=?', queries.join(', '));

        this.connection.run(sql, values, fn);
    };
}