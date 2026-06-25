function readInitialQueryState() {
  const params = new URLSearchParams(window.location.search || "");
  return {
    query: params.get("q") || "",
    types: params.get("types") || ""
  };
}

function syncQueryState(query, types) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("types", types.join(","));
  window.history.replaceState({}, "", "?" + params.toString());
}
