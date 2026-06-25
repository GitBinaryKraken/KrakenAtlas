(function () {
    function bindSearch(searchController, resultsList) {
        resultsList.addEventListener("click", function (event) {
            searchController.selectResult(event.target.dataset.resultId);
        });

        searchController.onSelectionChange(function (event) {
            resultsList.querySelectorAll(".search-result-card").forEach(function (button) {
                button.classList.toggle("is-selected", event.currentId === button.dataset.resultId);
            });
        });
    }
})();
