<div class="row">
    <div class="col-md-12">
        <h1>EVE registration whitelists</h1>
    </div>
</div>

<div class="row">
    <form class="form" id="eveAdminForm">
        <div class="col-xs-12">
            <h3>General settings
                <button class="btn btn-success btn-xs pull-right save">Save</button>
            </h3>

            <div class="form-group">
                <label for="cronPattern">Cron pattern for data syncing.</label>
                <input type="text" data-key="cronPattern" class="form-control" id="cronPattern">
                <p class="help-block">Make sure this is a valid pattern!</p>
                <button data-func="syncNow" class="btn btn-default" type="button">Sync now</button>
            </div>
        </div>

        <div class="col-xs-6 pull-left">
            <h3>Alliance whitelist
                <button class="btn btn-success btn-xs pull-right save">Save</button>
            </h3>

            <small>To allow every corporation from an alliance, disable the corporation whitelist.</small>

            <hr>

            <div class="form-group">
                <div class="checkbox">
                    <label>
                        <input type="checkbox" data-key="toggles.allianceWhitelistEnabled" data-empty="false" data-trim="false"> Enabled
                    </label>
                </div>
            </div>

            <div class="form-group">
                <div class="input-group">
                    <input type="text" class="form-control">
                    <span class="input-group-btn">
                        <button data-func="add" data-type="alliance" class="btn btn-default" type="button">Add</button>
                    </span>
                </div>
            </div>

            <div data-list="alliance">

            </div>
        </div>

        <div class="col-xs-6 pull-left">
            <h3>Corporation whitelist
                <button class="btn btn-success btn-xs pull-right save">Save</button>
            </h3>

            <small>The alliance to which this corporation belongs also has to be whitelisted.</small>

            <hr>

            <div class="form-group">
                <div class="checkbox">
                    <label>
                        <input type="checkbox" data-key="toggles.corporationWhitelistEnabled" data-empty="false" data-trim="false"> Enabled
                    </label>
                </div>
            </div>

            <div class="form-group">
                <div class="input-group">
                    <input type="text" class="form-control">
                    <span class="input-group-btn">
                        <button data-func="add" data-type="corporation" class="btn btn-default" type="button">Add</button>
                    </span>
                </div>
            </div>

            <div data-list="corporation">

            </div>
        </div>

        <input type="text" data-key="whitelists.alliance" class="hidden">
        <input type="text" data-key="whitelists.corporation" class="hidden">
    </form>
</div>

<script>
    require(['settings'], function (settings) {
        var wrapper = $('#eveAdminForm'),
            lists = {
                alliance: {},
                corporation: {}
            },
            tpl = '' +
                '<div data-id="{id}" class="panel panel-default">' +
                    '<div class="panel-heading">' +
                        '<strong>{name}</strong>' +
                        '<div data-func="remove" class="pull-left pointer">' +
                            '<span>' +
                                '<i class="fa fa-times"></i>' +
                            '</span>&nbsp;' +
                        '</div>' +
                        '<div class="pull-right">' +
                            '<span>' +
                                '<img height="20" src="http://image.eveonline.com/{type}/{id}_30.png">' +
                            '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';

        settings.sync('eve', wrapper, function() {
            for (var l in lists) {
                if (lists.hasOwnProperty(l)) {
                    lists[l] = $('[data-key="whitelists.' + l + '"]').val();

                    if (lists[l].length > 0) {
                        lists[l] = JSON.parse(lists[l]);
                        $('[data-list="' + l + '"]').html(makeHTML(lists[l], l));
                    } else {
                        lists[l] = {};
                    }
                }
            }

            function makeHTML(list, type) {
                var html = '';
                for (var a in list) {
                    if (list.hasOwnProperty(a)) {
                        html += templates.parse(tpl, {
                            id: a,
                            name: list[a],
                            type: type.charAt(0).toUpperCase() + type.slice(1)
                        });
                    }
                }
                return html;
            }
        });

        $('.save').click(function(event) {
            event.preventDefault();
            for (var l in lists) {
                if (lists.hasOwnProperty(l)) {
                    $('[data-key="whitelists.' + l + '"]').val(JSON.stringify(lists[l]));
                }
            }
            settings.persist('eve', wrapper, function(){
                socket.emit('admin.plugins.eve.sync');
            });
        });

        $('[data-func="add"]').click(function(event) {
            var el = $(event.currentTarget),
                type = el.data('type'),
                id = 0,
                name = el.parents('.input-group').find('input').val();

            socket.emit('plugins.eve.getID', {
                names: name
            }, function(err, result) {
                if (err) {
                    return app.alertError('No results');
                }

                id = Object.keys(result)[0];

                if (id === "0") {
                    return app.alertError('No results');
                }

                $('[data-list="' + type + '"]').append(templates.parse(tpl, {
                    id: id,
                    name: name,
                    type: type.charAt(0).toUpperCase() + type.slice(1)
                }));

                lists[type][id] = name;
            });
        });

        $('[data-func="syncNow"]').click(function(event) {
            socket.emit('plugins.eve.syncNow', null, function(err, count) {
                if (err) {
                    app.alertError('Something went wrong, check the logs.');
                } else {
                    app.alertSuccess('Updated ' + count + ' users.');
                }
            });
        });

        $('[data-list]').on('click', '[data-func="remove"]', function(event) {
            var el = $(event.currentTarget),
                type = el.parents('[data-list]').data('list'),
                id = el.parents('[data-id]').data('id') + '';

            el.parents('[data-id]').remove();

            delete lists[type][id];
        });
    });
</script>