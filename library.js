(function(EVE) {
	var pjson = require('./package.json'),
		Settings = module.parent.require('./settings'),
		AdminSockets = module.parent.require('./socket.io/admin').plugins,
		PluginSockets = module.parent.require('./socket.io/plugins'),

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
			}
		},
		sockets: {
			sync: function() {
				Config.global.sync();
			}
		}
	};

	Config.registrationIds = {
		keyId: Config.plugin.id + '-keyid',
		vCode: Config.plugin.id + '-vcode',
		char: Config.plugin.id + '-char'
	};

	Config.global = new Settings(Config.plugin.id, Config.plugin.version, Config.defaults);

	EVE.load = function(app, middleware, controllers, callback) {
		function renderAdmin(req, res, next) {
			res.render(Config.plugin.id + '/admin', {});
		}

		app.get('/admin' + Config.plugin.route, middleware.admin.buildHeader, renderAdmin);
		app.get('/api/admin' + Config.plugin.route, renderAdmin);

		AdminSockets[Config.plugin.id] = Config.sockets;
		PluginSockets[Config.plugin.id] = EVE.sockets;

		callback(null, app, middleware, controllers);
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

				if (Config.global.get('toggles.coroporationWhitelistEnabled')) {
					if (allowedCorporations.hasOwnProperty(corporationID)) {
						allowedCorporation = true;
					}
				} else {
					allowedCorporation = true;
				}

				console.log(allowedAlliance)

				if (allowedAlliance && allowedCorporation) {
					client.fetch('corp:CorporationSheet',
						{
							corporationID: corporationID
						})
						.then(function(corporateResult) {
							userData.fullname = '[' + corporateResult.ticker.content + '] ' + characterResult.characterName.content;
							console.log(userData);
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
})(module.exports);