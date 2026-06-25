(function (global) {
    function create(options) {
        var settings = options || {};
        var mapController = settings.mapController;
        var historyLike = settings.history || global.history;
        var listeners = [];

        function emitSelectionChange(currentId) {
            listeners.forEach(function (callback) { callback({ currentId: currentId }); });
        }

        if (typeof mapController.on === "function") {
            mapController.on("selectionChange", function (detail) {
                emitSelectionChange(detail.current.itemId);
            });
        }

        return {
            onSelectionChange: function (callback) {
                listeners.push(callback);
            },
            selectResult: function (resultId) {
                mapController.selectItem("searchResults", String(resultId));
                mapController.focusItem("searchResults", String(resultId), {});
            },
            syncUrl: function (url) {
                historyLike.pushState({}, "", url);
            }
        };
    }

    global.SearchController = { create: create };
})(window);
