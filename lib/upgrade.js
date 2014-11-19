(function(Upgrade) {

	var pjson = require('../package.json'),

		EVE = module.parent.exports,

		User = module.parent.parent.require('./user'),
		db = module.parent.parent.require('./database'),

		async = module.parent.parent.require('async'),
		winston = module.parent.parent.require('winston');

	Upgrade.doUpgrade = function(oldVersion, newVersion, callback) {
		var thisVersion;
		async.series([
			function(next) {
				thisVersion = '0.0.3';

				if (oldVersion < thisVersion) {
					var regex = /\[(.+)\]/g, user, match;
					getAllUsers(['uid', 'fullname'], function(err, users) {
						for (var i = 0, l = users.length; i < l; i++) {
							user = users[i];
							match = regex.exec(user.fullname);
							if (match) {
								User.setUserFields(user.uid, {
									eve_fullname: user.fullname,
									eve_ticker: match[1],
									eve_name: user.fullname.replace(match[0], '').trim(),
									eve_keyid: '',
									eve_vcode: '',
									eve_characterID: '',
									eve_allianceID: '',
									eve_corporationID: ''
								}, next);
							}
						}
					});
				} else {
					next();
				}
			},
			function(next) {
				thisVersion = '0.0.4';

				if (oldVersion < thisVersion) {
					var user;
					getAllUsers(['uid', 'eve-char'], function (err, users) {
						for (var i = 0, l = users.length; i < l; i++) {
							user = users[i];
							if (user['eve-char']) {
								User.setUserFields(user.uid, {
									'eve-keyid': null,
									'eve-vcode': null,
									'eve-char': null,
									eve_characterID: user['eve-char']
								}, next);
							}
						}
					});
				} else {
					next();
				}
			},
			function(next) {
				thisVersion = '0.0.9';

				if (oldVersion < thisVersion) {
					getAllUsers(['uid', 'eve_vcode', 'eve_keyid', 'eve_characterID'], function(err, users) {
						async.each(users, EVE.addExtraCharacterInfo, function(err) {
							next(err);
						});
					});
				} else {
					next();
				}
			}
		], function(err) {
			if (err) {
				error(err);
			} else {
				done();
			}
		});

		function done() {
			winston.info('[' + pjson.name + '] Upgraded from ' + oldVersion + ' to ' + newVersion);
			callback();
		}

		function error(err) {
			winston.error(err);
			winston.info('[' + pjson.name + '] No upgrade performed, old version was ' + oldVersion + ' and new version is ' + newVersion);
			callback();
		}
	};

	function getAllUsers(fields, callback) {
		db.getSortedSetRange('users:joindate', 0, -1, function (err, uids) {
			var keys = uids.map(function(uid) {
				return 'user:' + uid;
			});

			db.getObjectsFields(keys, fields, callback);
		});
	}

})(module.exports);