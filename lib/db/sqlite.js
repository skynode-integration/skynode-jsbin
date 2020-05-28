var sqlite3 = require('sqlite3').verbose(),
    templates = require('./sql_templates'),
    utils = require("skynode-server").utils,
    fs = require('fs');

var noop = function () {};

module.exports = {
  getBin: function (params, fn) {
    var values = [params.id, params.revision, params.revision],
        _this = this;

    this.connection.get(templates.getBin, values, function (err, result) {
      if (err) {
        return fn(err);
      }

      if (result) {
        result = _this.convertBinDates(result);
      }

      fn(null, result && _this.applyBinDefaults(result));
    });
  },
  setBin: function (params, fn) {
    var now = new Date(), values = [
      params.javascript || '',
      params.css || '',
      params.html || '',
      now,
      now,
      params.url,
      params.revision,
      params.streamingKey,
      params.settings
    ], sql = templates.setBin;

    this.connection.run(sql, values, function (err) {
      if (err || !this.changes) {
        return fn(err);
      }
      fn(null, this.lastID);
    });
  },
  setBinOwner: function (params, fn) {
    var sql = templates.setBinOwner,
        values = [params.name, params.url, params.revision, new Date(), params.summary, params.html, params.css, params.javascript, params.visibility || 'public'];

    // TODO: Re-factor common callbacks into helpers.
    this.connection.run(sql, values, function (err) {
      if (err || !this.changes) {
        return fn(err);
      }
      fn(null, this.lastID);
    });
  },
  setBinPanel: function (panel, params, fn) {
    var values = [
      params[panel],
      params.settings,
      new Date(),
      params.url,
      params.revision,
      params.streamingKey
    ],
    allowed = {html: 1, css: 1, javascript: 1},
    sql = templates.setBinPanel.replace(':panel', panel);

    if (allowed[panel]) {
      this.connection.run(sql, values, function (err) {
        if (err || !this.changes) {
          return fn(err || 'no-entry');
        }
        fn(null, this.lastID);
      });
    } else {
      fn('invalid-panel');
    }
  },
  getLatestBin: function (params, fn) {
    var values = [params.id],
        sql = templates.getLatestBin,
        _this = this;

    this.connection.get(sql, values, function (err, result) {
      if (err) {
        return fn(err);
      }

      if (result) {
        result = _this.convertBinDates(result);
      }

      fn(null, result && _this.applyBinDefaults(result));
    });
  },
  getLatestBinForUser: function (id, n, fn) {
    var sql = templates.getLatestBinForUser,
        query = this.connection.get.bind(this.connection),
        _this = this;

    query(sql, [id, n], function (err, result) {
      var sql = templates.getBinByUrlAndRevision;

      if (err) {
        return fn(err);
      }

      if (typeof result === 'undefined') {
        return fn(null, null);
      }

      _this.getBin({ id: result.url, revision: result.revision }, fn);
    });
  },
  getBinsByUser: function (id, fn) {
    var sql = templates.getBinsByUser,
        _this = this;

    this.connection.all(sql, [id], function (err, results) {
      if (err) {
        return fn(err);
      }

      var sql = templates.getBinByUrlAndRevision,
          collected = [];

      // i.e. if they've never saved anything before
      results.forEach(function (result) {
        collected.push(_this.applyBinDefaults(result));
      });
      fn(null, collected);
    });
  },
  // Get all bins from the owners field
  getAllOwners: function (fn) {
    // Get all the 'owned' bins
    this.connection.run(templates.getAllOwners, [], fn);
  },
  getOwnersBlock: function (start, size, fn) {
    // Get all the 'owned' bins
    this.connection.run(templates.getOwnersBlock, [start, size], fn);
  },
  generateBinId: function (length, attempts, fn) {
    attempts = attempts || 1;
    var id = utils.shortcode( attempts + 2 ), sqlite = this;

    if (attempts <= 10) {
      this.connection.get(templates.binExists, [id], function (err, result) {
        if (err) {
          fn(err);
        } else if (result) {
          sqlite.generateBinId(length, attempts + 1, fn);
        } else {
          fn(null, id);
        }
      });
    } else {
      fn(new Error("too-many-tries"));
    }
  },
  touchOwners: function (params, fn) {
    // params.date is only for use when populating the summary field
    var values = [params.date || new Date(), params.name, params.url, params.revision];

    this.connection.run(templates.touchOwners, values, function (err) {
      if (err) {
        return fn(err);
      }

      if (typeof fn === 'function') {
        fn(null);
      }
    });
  },
  updateOwners: function (params, fn) {
    // params.date is only for use when populating the summary field
    var values = [params.date || new Date(), params.summary, params.panel_open, params.name, params.url, params.revision];

    var panel = params.panel,
        allowed = {html: 1, css: 1, javascript: 1},
        sql = templates.updateOwners.replace(':panel', panel);

    if (allowed[panel]) {
      this.connection.run(sql, values, function (err) {
        if (err) {
          return fn(err);
        }

        if (typeof fn === 'function') {
          fn(null);
        }
      });
    } else {
      fn('invalid-panel');
    }
  },
  populateOwners: function (params, fn) {
    // params.date is only for use when populating the summary field
    var values = [params.date || new Date(), params.summary, params.html, params.css, params.javascript, params.name, params.url, params.revision];

    this.connection.run(templates.populateOwners, values, function (err, result) {
      if (err) {
        return fn(err);
      }

      if (typeof fn === 'function') {
        fn(null);
      }
    });
  },

  applyBinDefaults: function (bin) {
    for (var prop in this.defaults) {
      if (bin[prop] == null) { // Using == to catch null and undefined.
        bin[prop] = this.defaults[prop];
      }
    }

    this.convertDates(bin, 'last_updated');

    if (!bin.last_updated || isNaN(bin.last_updated.getTime())) bin.last_updated = new Date('2012-07-23 00:00:00');

    try {
      bin.settings = JSON.parse(bin.settings || '{}');
    } catch (e) {
      // this is likely because the settings were screwed in a beta build
      bin.settings = {};
    }

    return bin;
  },
  convertBinDates: function (bin) {
    return this.convertDates(bin, 'created', 'last_viewed');
  },
  reportBin: function (params, fn) {
    var now = new Date(), values = [
      now,
      params.url,
      params.revision
    ], sql = templates.reportBin;

    this.connection.run(sql, values, function (err) {
      if (err) {
        return fn(err);
      }
      fn(null);
    });
  },
  archiveBin: function (bin, fn) {
    var values = [bin.archive, bin.name, bin.url, bin.revision],
        sql = templates.archiveBin;

    this.connection.run(sql, values, function (err, result) {
      if (err || !this.changes) {
        return fn(err);
      }
      fn(null, result);
    });
  },
  isOwnerOf: function (params, fn) {
    var values = [
      params.name || '',
      params.url
    ], sql = templates.isOwnerOf;

    // note: .get gets one row
    this.connection.get(sql, values, function (err, result) {
      if (err) {
        return fn(err);
      }
      if (typeof result === 'undefined') {
        return fn(null, { found: false });
      } else {
        return fn(null, { found: true, isowner: result.owner === 1, result: result });
      }
    });
  },
  getUserBinCount: function (id, fn) {
    var values = [id],
        sql = templates.getUserBinCount;

    this.connection.get(sql, values, function (err, result) {
      if (err) {
        return fn(err);
      }
      if (typeof result === 'undefined') {
        return fn(null, { found: false, total: 0 });
      } else {
        return fn(null, { found: true, total: result.total });
      }
    });
  },
  getBinMetadata: function(bin, fn) {
    var sql = templates.getBinMetadata;
    this.connection.get(sql, [bin.url, bin.revision], function(err, result) {
      if (err) {
        return fn(err);
      }
      fn(null, (result && result.length > 0 && result[0]) ? result[0] : {
        visibility: 'public',
        name: 'anonymous'
      });
    });
  },
  setBinVisibility: function(bin, name, value, fn) {
    var sql = templates.setBinVisibility, params = [
      value, name, bin.url
    ];
    if (!bin.metadata || bin.metadata.name !== name) {
      return fn(301);
    }
    this.connection.run(sql, params, function(err, result) {
      if (err) {
        return fn(500);
      }
      fn(err, result);
    });
  },
  updateBinData: updateMultipleFields(templates.updateBinData, templates.sandboxColumns),
  updateOwnersData: updateMultipleFields(templates.updateOwnersData, templates.ownersColumns),
  updateOwnershipData: updateMultipleFields(templates.updateOwnershipData, templates.ownershipColumns),
  saveBookmark: function (params, fn) {
    var sql = templates.saveBookmark;
    this.connection.run(sql, [params.name, params.url, params.revision, params.type], fn);
  },
  getBookmark: function (params, fn) {
    var sql = templates.getBookmark;
    this.connection.get(sql, [params.name, params.type], function (error, result) {
      if (error || !result.length) {
        return fn(error || { notfound: true });
      }
      fn(null, result);
    });
  }
};


function updateMultipleFields(sqlTemplate, columnsArray) {
  return function (args, params, fn) {
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