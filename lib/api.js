(function(Api) {

	var neow = require('neow');

	Api.client = function(data) {
		var client = new neow.EveClient(data);

		this.fetch = function(type, data, callback) {
			client.fetch(type, data).then(function(result) {
				callback(null, result);
			}).fail(function() {
				callback(true, null);
			}).done();
		}
	};

	Api.client.prototype.getCharacters = function(data, callback) {
		this.fetch('account:Characters', data, callback);
	};

	Api.client.prototype.getCharacterID = function(data, callback) {
		this.fetch('eve:CharacterID', data, callback);
	};

	Api.client.prototype.getCharacterInfo = function(data, callback) {
		this.fetch('eve:CharacterInfo', data, callback);
	};

	Api.client.prototype.getCorporationSheet = function(data, callback) {
		this.fetch('corp:CorporationSheet', data, callback);
	};

})(module.exports);