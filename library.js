(function(EVE) {
	var pjson = require('./package.json'),
		Settings = module.parent.require('./settings'),
		User = module.parent.require('./user'),
		SocketIndex = module.parent.require('./socket.io/index'),
		AdminSockets = module.parent.require('./socket.io/admin').plugins,
		PluginSockets = module.parent.require('./socket.io/plugins'),
		db = module.parent.require('./database'),
		winston = module.parent.require('winston'),

		neow = require('neow');

	var Config = {
		plugin: {
			name: 'EVE Registration',
			id: 'eve',
			version: pjson.version,
			description: pjson.description,
			icon: 'fa-edit',
			route: '/eve',
			accessMask: '8388616'
		},
		defaults: {
			toggles: {
				allianceWhitelistEnabled: false,
				corporationWhitelistEnabled: false
			},
			whitelists: {
				alliance: '{}',
				corporation: '{}'
			},
			version: ''
		},
		sockets: {
			sync: function() {
				Config.global.sync();
			}
		}
	};

	Config.registrationIds = {
		keyId: Config.plugin.id + '_keyid',
		vCode: Config.plugin.id + '_vcode',
		char: Config.plugin.id + '_characterID'
	};

	EVE.load = function(app, middleware, controllers, callback) {
		function renderAdmin(req, res, next) {
			res.render(Config.plugin.id + '/admin', {});
		}

		app.get('/admin' + Config.plugin.route, middleware.admin.buildHeader, renderAdmin);
		app.get('/api/admin' + Config.plugin.route, renderAdmin);

		AdminSockets[Config.plugin.id] = Config.sockets;
		PluginSockets[Config.plugin.id] = EVE.sockets;

		Config.global = new Settings(Config.plugin.id, Config.plugin.version, Config.defaults, function() {
			var oldVersion = Config.global.get('version');

			if (oldVersion < Config.plugin.version) {
				Config.global.set('version', Config.plugin.version);
				Config.global.persist(function() {
					Upgrade(oldVersion, Config.plugin.version, function() {
						callback(null, app, middleware, controllers);
					});
				});
			} else {
				callback(null, app, middleware, controllers);
			}
		});
	};

	EVE.addNavigation = function(custom_header, callback) {
		custom_header.plugins.push({
			route: Config.plugin.route,
			icon: Config.plugin.icon,
			name: Config.plugin.name
		});

		callback(null, custom_header);
	};

	EVE.addRegistrationField = function(req, res, data, callback) {
		var url = 'http://community.eveonline.com/support/api-key/CreatePredefined?accessMask=' + Config.plugin.accessMask,
			keyHTML = '' +
				'<input class="form-control" type="text" name="' + Config.registrationIds.keyId + '" id="' + Config.registrationIds.keyId + '" autocorrect="off" autocapitalize="off" />',
			vCodeHTML = '' +
				'<input class="form-control" type="text" name="' + Config.registrationIds.vCode + '" id="' + Config.registrationIds.vCode + '" autocorrect="off" autocapitalize="off" />',
			charHTML = '' +
				'<select class="form-control" name="' + Config.registrationIds.char + '" id="' + Config.registrationIds.char + '"></select>',
			fields = [
				{
					label: 'EVE information',
					html: '<hr><span class="help-block">You can find these values <a href="' + url +'" target="_blank">here</a>.</span>',
					styleName: 'eve'
				},
				{
					label: 'EVE keyID',
					html: keyHTML,
					styleName: Config.registrationIds.keyId
				},
				{
					label: 'EVE vCode',
					html: vCodeHTML,
					styleName: Config.registrationIds.vCode
				},
				{
					label: 'EVE Character',
					html: charHTML,
					styleName: Config.registrationIds.char
				}
			];

		data.regFormEntry = data.regFormEntry.concat(fields);

		callback(null, req, res, data);
	};

	EVE.checkRegistration = function(req, res, userData, callback) {
		var keyId = userData[Config.registrationIds.keyId].trim(),
			vCode = userData[Config.registrationIds.vCode].trim(),
			charId = userData[Config.registrationIds.char].trim();

		if (keyId.length === 0 || vCode.length === 0 || charId === 0) {
			return callback(new Error('Invalid data'), req, res, userData);
		}

		var client = new neow.EveClient({
			keyID: keyId,
			vCode: vCode
		});

		client.fetch('eve:CharacterInfo',
			{
				characterID: charId
			})
			.then(function(characterResult) {
				var allianceID = characterResult.allianceID.content,
					corporationID = characterResult.corporationID.content,
					allowedAlliances = JSON.parse(Config.global.get('whitelists.alliance')),
					allowedCorporations = JSON.parse(Config.global.get('whitelists.corporation')),
					allowedAlliance = false,
					allowedCorporation = false;

				if (Config.global.get('toggles.allianceWhitelistEnabled')) {
					if (allowedAlliances.hasOwnProperty(allianceID)) {
						allowedAlliance = true;
					}
				} else {
					allowedAlliance = true;
				}

				if (Config.global.get('toggles.corporationWhitelistEnabled')) {
					if (allowedCorporations.hasOwnProperty(corporationID)) {
						allowedCorporation = true;
					}
				} else {
					allowedCorporation = true;
				}

				if (allowedAlliance && allowedCorporation) {
					client.fetch('corp:CorporationSheet',
						{
							corporationID: corporationID
						})
						.then(function(corporateResult) {
							userData['eve_ticker'] = corporateResult.ticker.content;
							userData['eve_name'] = characterResult.characterName.content;
							userData['eve_fullname'] = '[' + corporateResult.ticker.content + '] ' + characterResult.characterName.content;
							userData['eve_characterID'] = charId;
							userData['eve_allianceID'] = allianceID;
							userData['eve_corporationID'] = corporationID;

							//userData['eve_keyid'] = null;
							//userData['eve_vcode'] = null;

							//This doesn't work in NodeBB yet
							//userData.picture = 'http://image.eveonline.com/Character/' + charId + '_128.jpg';
							return callback(null, req, res, userData);
						})
						.fail(function() {
							return callback(new Error('Unknown error'), req, res, userData);
						})
						.done();
				} else {
					return callback(new Error('Not an allowed alliance or corporation'), req, res, userData);
				}
			})
			.fail(function() {
				return callback(new Error('Invalid data'), req, res, userData);
			})
			.done();
	};

	EVE.modifyTopicData = function(topicData, callback) {
		var uids = [], index = {}, uid;
		for (var i = 0, l = topicData.posts.length; i < l; i++) {
			uid = topicData.posts[i].user.uid;

			if (uids.indexOf(uid) === -1) {
				uids.push(uid);
			}

			if (Array.isArray(index[uid])) {
				index[uid].push(i);
			} else {
				index[uid] = [i];
			}
		}

		User.getMultipleUserFields(uids, ['uid', 'eve_fullname', 'eve_name', 'eve_ticker', 'username'], function(err, result) {
			var cur;
			for (var i = 0, l1 = result.length; i < l1; i++) {
				for (var j = 0, l2 = index[result[i].uid].length; j < l2; j++) {
					cur = index[result[i].uid][j];
					topicData.posts[cur].user.eve_fullname = result[i].eve_fullname;
					topicData.posts[cur].user.eve_name = result[i].eve_name;
					topicData.posts[cur].user.eve_ticker = result[i].eve_ticker;
				}
			}
			callback(null, topicData);
		});
	};

	EVE.modifyUserData = function(fieldsToRemove, callback) {
		callback(null, fieldsToRemove.concat(['eve_keyid', 'eve_vcode']));
	};

	EVE.sockets = {
		getCharacters: function(socket, data, callback) {
			if (data.keyId && data.keyId.length > 0 && data.vCode && data.vCode.length > 0) {
				var client = new neow.EveClient({
					keyID: data.keyId.trim(),
					vCode: data.vCode.trim()
				});

				client.fetch('account:Characters')
					.then(function(result) {
						callback(null, result);
					})
					.fail(function() {
						return callback(new Error('EVE Client error'));
					})
					.done();
			}
		},
		getID: function(socket, data, callback) {
			if (data.names && data.names.length > 0) {
				var client = new neow.EveClient();

				client.fetch('eve:CharacterID',
					{
						names: data.names
					})
					.then(function(result) {
						return callback(null, result.characters);
					})
					.fail(function() {
						return callback(new Error('EVE Client error'));
					})
					.done();
			}
		}
	};

	var Upgrade = function(oldVersion, newVersion, callback) {
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