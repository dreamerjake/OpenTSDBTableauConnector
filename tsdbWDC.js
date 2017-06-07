// Fire up the datepickers
$(function() {
    $('#start_datetime').datetimepicker({ format: 'YYYY/MM/DD-HH:mm:ss' });
});

$(function() {
    $('#end_datetime').datetimepicker({ format: 'YYYY/MM/DD-HH:mm:ss' });
});

function buildOpenTSDBUri(server, port, metric, startTime, endTime, tags) {
    var tagSet = []; // Start with empty array

    // Add "key=value" to the array for each tag in tags
    Object.keys(tags).forEach( function(key) {
        tagSet.push(key + "=" + tags[key])
    })

    // Turn into a comma-separated string
    var tagString = "";
    if ( tagSet.length > 0 ) {
        tagString = "%7B" + tagSet.join(",") + "%7D";
    }

    // Build the final uri
    var uri = "http://" + server + ":" + port + "/api/query?start=" + startTime
            + "&end=" + endTime + "&m=sum:rate:" + metric + tagString;
    return uri;
}

function buildEtagsUri(server, port, metric, startTime, endTime) {
    // Build the final uri
    var etagsUri = "http://" + server + ":" + port + "/q?start=" + startTime
            + "&end=" + endTime + "&m=sum:rate:" + metric + "&json";
    return etagsUri;
}

function buildTagsHtml(tags) {
    // Build HTML from preamble, tags and postamble
    var tagsHtml = '<div id="tags"><p>Tags:</p><div class="tags">' +
        Object.keys(tags).sort(function(a, b) {
            if (a == ' ') {
                return 1;
            } else {
                return a - b;
            }
        }).map( function(t, i) {
        return '<div class="tagLine">' +
            '<input class="tagName" type="text" id="tagName' + i + '" value="' + t + '"/>' +
            '<input class="tagVal" type="text" id="tagVal' + i + '" value="' + tags[t] + '"/>' +
            '</div>';
    }).join('') + '</div>';
    return tagsHtml;
}

function getTagsFromHtml() {
    // Gather current tag names/values from HTML (capture any fields modified by user)
    var tags = {};
    $(".tagName").map( function(i, el) {
        tags[$("#tagName" + i).val()] = $("#tagVal" + i).val();
    })

    return tags;
}

(function () {
    var myConnector = tableau.makeConnector();

    myConnector.getSchema = function (schemaCallback) {

        var connectionData = JSON.parse(tableau.connectionData);
        var tags = connectionData['tags'];

        // Start with the base columns that will be in every TSDB entry
        var cols = [
            {id: "metric", alias: "metric", dataType: tableau.dataTypeEnum.string },
            {id: "timestamp", alias: "timestamp", dataType: tableau.dataTypeEnum.float},
            {id: "value", alias: "value", dataType: tableau.dataTypeEnum.float}
        ];

        // Add a dynamic number of columns to represent the tag values
        if (tags) {
            for (tag in tags) {
                cols.push({
                    id: tag,
                    alias: tag,
                    dataType: tableau.dataTypeEnum.string})
            }
        }

        var tableInfo = {
            id: "OpenTSDBFeed",
            alias: "OpenTSDBFeed",
            columns: cols
        }

        schemaCallback([tableInfo]);
    };

    myConnector.getData = function (table, doneCallback) {

        var connectionData = JSON.parse(tableau.connectionData);

        var metric = connectionData["metric"];
        var startTime = connectionData['startTime'];
        var endTime = connectionData['endTime'];
        var tags = connectionData['tags'];
        var server = connectionData['server'];
        var port = connectionData['port']

        var metricUri = buildOpenTSDBUri(server, port, metric, startTime, endTime, tags);
        var etagsUri = buildEtagsUri(server, port, metric, startTime, endTime);

        $.getJSON(metricUri, function(resp) {

            var tableData = [];

            // Loop through the response objects
            for (var o in resp) {
                //var ob = resp[o];
                //var dps = resp[o].dps;
                //var ts = resp[o].tags;

                // Loop through the timestamp: val pairs in dps, starting with the base column values
                $.each(dps, function(timestamp, val) {
                    var base = {
                        "metric": resp[o].metric,
                        "timestamp": timestamp,
                        "value": val
                    }
                    // Loop again through the tags, adding to the base column value
                    $.each(ts, function(tag, tag_val) {
                        base[tag] = tag_val;
                    });
                    tableData.push(base);
                });
            }

        table.appendRows(tableData);
        doneCallback();

        });
    };

    tableau.registerConnector(myConnector);
})();

function updatePage() {
    metric = $('#metric').val().trim()
    startTime = $('#start_datetime').data('date');
    endTime = $('#end_datetime').data('date');

    tags = getTagsFromHtml();
    // Ensure there's a blank tag name/value pair in tags, this allow a space for new tags to be entered
    if ( ! $.inArray(' ', tags) > -1 ) {
        tags[' '] = '';
    }
    var etagsUri = buildEtagsUri("127.0.0.1", "4242", metric, startTime, endTime);
    jQuery.getJSON(etagsUri, function(data) {
        // Compare current tag names to what is returned from etags, add missing tag names (with tag value
        // initially set to empty)
        data['etags'][0].forEach( function(tagName) {
            if ( ! (tagName in tags) ) {
                tags[tagName] = '';
            }
        })
        $('#tags').replaceWith(buildTagsHtml(tags));
    });
}

$(document).ready(function() {

    var startTime;
    var endTime;
    var tags;
    var metric;

    // Define initial set of tags and insert into HTML
    // Our TSDB is hardcapped at 8 tags
    // Defaulting these tags to empty strings will ensure they get auto-deleted if unchanged
    var tags = {
        'tag1': '',
        'tag2': '',
        'tag3': '',
        'tag4': '',
        'tag5': '',
        'tag6': '',
        'tag7': '',
        'tag8': ''
    };

    $('#tags').replaceWith(buildTagsHtml(tags));

    $("#submitButton").click(function() {
        metric = $('#metric').val().trim();
        startTime = $('#start_datetime').data('date');
        endTime = $('#end_datetime').data('date');
        server = $('#server').val().trim();
        port = $('#port').val().trim();
        var tags = getTagsFromHtml();

        // Remove any tags with blank names and/or values
        delete tags[''];
        for (var name in tags) {
            if (tags[name] == '') {
                delete tags[name];
                tableau.log("Deleted emtpty tag: " + name);
            }
        }

        if (metric) {
            tableau.connectionName = "Data for metric: " + metric;
            tableau.connectionData = JSON.stringify({'server': server, 'port': port, 'metric': metric,
                'startTime': startTime, 'endTime': endTime, 'tags': tags});
            tableau.submit();
        }
    });
});
