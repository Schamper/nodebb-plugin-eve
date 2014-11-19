(function(EVE) {
	var pjson = require('./package.json'),
		Settings = module.parent.require('./settings'),
		AdminSockets = module.parent.require('./socket.io/admin').plugins,
		PluginSockets = module.parent.require('./socket.io/plugins'),
		UserSockets = module.parent.require('./socket.io/user'),
		User = module.parent.require('./user'),
		db = module.parent.require('./database'),
		winston = module.parent.require('winston'),
		async = module.parent.require('async'),

		Api = require('./lib/api'),
		Upgrade = require('./lib/upgrade');

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

	Config.userFields = [
		'eve_characterID', 'eve_keyid', 'eve_vcode',
		'eve_ticker', 'eve_name', 'eve_fullname',
		'eve_characterID', 'eve_allianceID', 'eve_corporationID'
	];

	EVE.load = function(data, callback) {
		function renderAdmin(req, res, next) {
			res.render(Config.plugin.id + '/admin', {});
		}

		data.router.get('/admin' + Config.plugin.route, data.middleware.admin.buildHeader, renderAdmin);
		data.router.get('/api/admin' + Config.plugin.route, renderAdmin);

		AdminSockets[Config.plugin.id] = Config.sockets;
		PluginSockets[Config.plugin.id] = EVE.sockets;

		Config.global = new Settings(Config.plugin.id, Config.plugin.version, Config.defaults, function() {
			var oldVersion = Config.global.get('version');

			if (oldVersion < Config.plugin.version) {
				Config.global.set('version', Config.plugin.version);
				Config.global.persist(function() {
					Upgrade.doUpgrade(oldVersion, Config.plugin.version, callback);
				});
			} else {
				callback();
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

	EVE.addRegistrationField = function(data, callback) {
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

		data.templateData.regFormEntry = data.templateData.regFormEntry.concat(fields);

		callback(null, data);
	};

	EVE.checkRegistration = function(data, callback) {
		var keyId = data.userData[Config.registrationIds.keyId].trim(),
			vCode = data.userData[Config.registrationIds.vCode].trim(),
			charId = data.userData[Config.registrationIds.char].trim();

		if (keyId.length === 0 || vCode.length === 0 || charId === 0) {
			return callback(new Error('Invalid data'), data);
		}

		var api = new Api.client({
			keyID: keyId,
			vCode: vCode
		});

		api.getCharacterInfo({ characterID: charId }, function(err, characterResult) {
			if (err) {
				return callback(new Error('API Error'), data);
			}

			var allianceID,
				corporationID,
				allowedAlliances = JSON.parse(Config.global.get('whitelists.alliance')),
				allowedCorporations = JSON.parse(Config.global.get('whitelists.corporation')),
				allowedAlliance = false,
				allowedCorporation = false;

			if (characterResult.allianceID) {
				allianceID = characterResult.allianceID.content;
			}

			if (characterResult.corporationID) {
				corporationID = characterResult.corporationID.content
			}

			if (Config.global.get('toggles.allianceWhitelistEnabled')) {
				if (allianceID && allowedAlliances.hasOwnProperty(allianceID)) {
					allowedAlliance = true;
				}
			} else {
				allowedAlliance = true;
			}

			if (Config.global.get('toggles.corporationWhitelistEnabled')) {
				if (corporationID && allowedCorporations.hasOwnProperty(corporationID)) {
					allowedCorporation = true;
				}
			} else {
				allowedCorporation = true;
			}

			if (allowedAlliance || allowedCorporation) {
				api.getCorporationSheet({ corporationID: corporationID }, function(err, corporateResult) {
					if (err) {
						return callback(new Error('Unknown error'), data);
					}

					data.userData.eve_ticker = corporateResult.ticker.content;
					data.userData.eve_name = characterResult.characterName.content;
					data.userData.eve_fullname = '[' + corporateResult.ticker.content + '] ' + characterResult.characterName.content;
					data.userData.eve_characterID = charId;
					data.userData.eve_allianceID = allianceID;
					data.userData.eve_corporationID = corporationID;

					return callback(null, data);
				});
			} else {
				return callback(new Error('Not an allowed alliance or corporation'), data);
			}
		});
	};

	EVE.addExtraCharacterInfo = function(userData) {
		if (userData.eve_keyid && userData.eve_vcode) {
			var api = new Api.client({
				keyID: userData.eve_keyid,
				vCode: userData.eve_vcode
			}), uid = userData.uid;

			async.waterfall([
				function(callback) {
					api.getCharacters(null, function(err, result) {
						if (err) return callback(err);

						var characterData = [], character;
						for (var charId in result.characters) {
							if (result.characters.hasOwnProperty(charId)) {
								character = result.characters[charId];
								var char = {
									eve_name: character.name,
									eve_allianceID: character.allianceID,
									eve_allianceName: character.allianceName,
									eve_corporationID: character.corporationID,
									eve_corporationName: character.corporationName,
									eve_characterID: charId
								};

								characterData.push(char);
							}
						}

						callback(null, characterData);
					});
				},
				function(characterData, callback) {
					async.map(characterData, function(char, next) {
						if (char.eve_corporationID != "0") {
							api.getCorporationSheet({ corporationID: char.eve_corporationID }, function(err, corporateResult) {
								if (err) return next(err);

								char.eve_ticker = corporateResult.ticker.content;
								char.eve_fullname = '[' + corporateResult.ticker.content + '] ' + char.eve_name;

								next(null, char);
							});
						} else {
							next(null, char);
						}
					}, callback);
				}
			], function(err, characterData) {
				if (err) return;

				db.delete('eve:' + uid + ':characters');
				characterData.forEach(function(char, index) {
					db.listAppend('eve:' + uid + ':characters', index);
					db.setObject('eve:' + uid + ':characters:' + index, char);
				});
			});

			if (userData.eve_characterID) {
				UserSockets.uploadProfileImageFromUrl(
					{ uid: userData.uid },
					'http://image.eveonline.com/Character/' + userData.eve_characterID + '_128.jpg',
					function(err, url) {}
				);
			}
		}
	};

	EVE.addCustomFields = function(fields, callback) {
		callback(null, fields.concat(Config.userFields));
	};

	EVE.modifyUserData = function(users, callback) {
		var uids = [], index = {}, uid;
		for (var i = 0, l = users.length; i < l; i++) {
			if (users[i] != undefined) {
				users[i]['eve_keyid'] = undefined;
				users[i]['eve_vcode'] = undefined;

				// Don't try to grab eve data for guests, or if eve data is already present for this user
				if (users[i].uid != undefined && users[i].uid > 0 && !users[i].eve_characters) {
					uid = users[i].uid;

					if (uids.indexOf(uid) === -1) {
						uids.push(uid);
					}

					if (Array.isArray(index[uid])) {
						index[uid].push(i);
					} else {
						index[uid] = [i];
					}
				}
			}
		}

		if (uids.length > 0) {
			async.parallel([
				function(next) {
					var keys = uids.map(function(uid) {
						return 'user:' + uid;
					});

					// We get data directly from the DB because otherwise we get an infinite loop
					db.getObjectsFields(keys, Config.userFields.concat('uid'), function(err, result) {
						var cur;
						// Here we go... Loop through all the unique results and set data on all the actual occurrences
						for (var i = 0, l1 = result.length; i < l1; i++) {
							for (var j = 0, l2 = index[result[i].uid].length; j < l2; j++) {
								cur = index[result[i].uid][j];
								Config.userFields.forEach(function(el) {
									users[cur][el] = result[i][el];
								});
								users[cur]['eve_keyid'] = undefined;
								users[cur]['eve_vcode'] = undefined;
							}
						}

						next();
					});
				},
				function(next) {
					async.each(uids,
						function(uid, next) {
							var cur;
							db.getListRange('eve:' + uid + ':characters', 0, -1, function(err, chars) {
								async.map(chars, function(charIndex, cb) {
									db.getObject('eve:' + uid + ':characters:' + charIndex, cb);
								}, function(err, result) {
									var filtered = false;
									for (var i = 0, l = index[uid].length; i < l; i++) {
										cur = index[uid][i];
										if (!filtered) {
											// We don't need the primary character in here
											result = result.filter(function(el) {
												return users[cur].eve_characterID != el.eve_characterID;
											});
											filtered = true;
										}
										users[cur].eve_characters = result;
									}
									next();
								});
							});
						},
						function(err, result) {
							next();
						}
					)
				}
			], function(err, result) {
				callback(err, users);
			});
		} else {
			callback(null, users);
		}
	};

	EVE.sockets = {
		getCharacters: function(socket, data, callback) {
			if (data.keyId && data.keyId.length > 0 && data.vCode && data.vCode.length > 0) {
				var api = new Api.client({
					keyID: data.keyId.trim(),
					vCode: data.vCode.trim()
				});

				api.getCharacters(null, function(err, result) {
					if (err) {
						return callback(new Error('EVE Client error'));
					}

					return callback(null, result);
				});
			}
		},
		getCharacterInfo: function(socket, data, callback) {
			if (data.keyId && data.keyId.length > 0 && data.vCode && data.vCode.length > 0 && data.characterID && data.characterID.length > 0) {
				var api = new Api.client({
					keyID: data.keyId.trim(),
					vCode: data.vCode.trim()
				});

				api.getCharacterInfo({ characterID: data.characterID }, function(err, result) {
					if (err) {
						return callback(new Error('EVE Client error'));
					}

					return callback(null, result);
				});
			}
		},
		getID: function(socket, data, callback) {
			if (data.names && data.names.length > 0) {
				var api = new Api.client();

				api.getCharacterID({ names: data.names }, function(err, result) {
					if (err) {
						return callback(new Error('EVE Client error'));
					}

					return callback(null, result.characters);
				});
			}
		}
	};

})(module.exports);