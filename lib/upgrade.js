(function(Upgrade) {

	var User = module.parent.parent.require('./user'),
		db = module.parent.parent.require('./database');

	Upgrade.doUpgrade = function(oldVersion, newVersion, callback) {
		var upgrade = false;
		if (oldVersion === '' || newVersion === '0.0.3') {
			upgrade = true;
			upgrade1();
		}
		if (newVersion === '0.0.4') {
			upgrade = true;
			upgrade2();
		}

		if (!upgrade) {
			done();
		}

		function upgrade1() {
			var regex = /\[(.+)\]/g, user, match;
			db.getSortedSetRange('users:joindate', 0, -1, function (err, uids) {
				User.getMultipleUserFields(uids, ['uid', 'fullname'], function (err, users) {
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
							}, done);
						}
					}
				});
			});
		}

		function upgrade2() {
			var user;
			db.getSortedSetRange('users:joindate', 0, -1, function (err, uids) {
				User.getMultipleUserFields(uids, ['uid', 'eve-char'], function (err, users) {
					for (var i = 0, l = users.length; i < l; i++) {
						user = users[i];
						if (user['eve-char']) {
							User.setUserFields(user.uid, {
								'eve-keyid': null,
								'eve-vcode': null,
								'eve-char': null,
								eve_characterID: user['eve-char']
							}, done);
						}
					}
				});
			});
		}

		function done() {
			winston.info('[' + pjson.name + '] Upgraded from ' + oldVersion + ' to ' + newVersion);
			callback();
		}

		function error() {
			winston.info('[' + pjson.name + '] No upgrade performed, old version was ' + oldVersion + ' and new version is ' + newVersion);
			callback();
		}
	};

})(module.exports);