(function(window) {
	$(window).on('action:ajaxify.end', function(e, data) {
		if (data.url === 'register' && $('#register-eve').length > 0) {
			var keyIdElement = $('#eve-keyid'),
				vCodeElement = $('#eve-vcode'),
				charElement = $('#eve-char'),

				timeOut;


			var checkFields = function(e) {
				clearTimeout(timeOut);
				timeOut = setTimeout(function() {
					var keyId = keyIdElement.val(),
						vCode = vCodeElement.val();

					if (keyId.length > 0 && vCode.length > 0) {
						getCharacters(keyId, vCode);
					}
				}, 250);
			};

			var getCharacters = function(keyId, vCode) {
				socket.emit('plugins.eve.getCharacters', {
					keyId: keyId,
					vCode: vCode
				}, function(err, result) {
					if (err) {
						return app.alertError(err.message);
					}

					var html = '',
						chars = result.characters;

					for (var char in chars) {
						if (chars.hasOwnProperty(char)) {
							html += '<option value="' + char + '">' + chars[char].name + '</option>';
						}
					}

					charElement.html(html);
				});
			};

			keyIdElement.off('keyup.eve').on('keyup.eve', checkFields);
			vCodeElement.off('keyup.eve').on('keyup.eve', checkFields);
		}
	});
})(window);