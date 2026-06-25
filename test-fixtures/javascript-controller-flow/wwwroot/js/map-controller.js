(function (global) {
    function MapController() {}

    MapController.prototype._emit = function (name, detail) {
        return { name: name, detail: detail };
    };

    MapController.prototype.selectItem = function (datasetKey, itemId) {
        this.selected = { datasetKey: datasetKey, itemId: itemId };
        this._emit("selectionChange", { current: this.selected });
    };

    MapController.prototype.focusItem = function (datasetKey, itemId, options) {
        this.focused = { datasetKey: datasetKey, itemId: itemId, options: options };
    };

    global.MapController = MapController;
})(window);
